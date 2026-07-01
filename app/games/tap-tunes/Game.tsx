"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { SONGS, speedFor, starsFor, type Note, type Song } from "./melodies";

const SLUG = "tap-tunes";
const meta = getGame(SLUG);

/* ---- tuning constants (px / px-per-second) ---- */
const LANES = 4;
const MAX_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;

const TILE_H = 60; // fixed tile height — the hit math depends on this exact value
const GAP_PX = 128; // vertical spacing between consecutive tiles (> HITZONE_H)
const HITZONE_H = 100; // tap-band height; < GAP_PX so only one tile is ever tappable
const BOTTOM_MARGIN = 14; // gap from band bottom to the playfield floor
const START_Y = -TILE_H; // tiles enter just above the top edge
const FALLBACK_H = 360; // playfield height before the first measurement

const POP_MS = 240; // how long a popped-tile splash lingers
const FLOAT_MS = 900; // how long a "+N" float lingers

/* ---- per-tap visuals (kept in state, position is imperative via refs) ---- */
type Tile = { id: number; lane: number; note: Note };
type Splash = { id: number; lane: number; y: number; note: Note };
type Float = { id: number; lane: number; y: number; text: string };
type Phase = "ready" | "playing" | "over";

/** Horizontal centre of a lane as a percentage of the playfield width. */
function lanePct(lane: number): number {
  return (lane + 0.5) * (100 / LANES);
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [combo, setCombo] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [burst, setBurst] = useState(0);
  const [song, setSong] = useState<Song>(SONGS[0]);

  // --- engine state (refs avoid per-frame re-renders / stale closures) ---
  const tilesRef = useRef<Tile[]>([]);
  const yRef = useRef<Map<number, number>>(new Map());
  const elRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const refSetters = useRef<Map<number, (el: HTMLDivElement | null) => void>>(new Map());

  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const heartsRef = useRef(MAX_HEARTS);
  const heightRef = useRef(FALLBACK_H);

  const tileIdRef = useRef(1);
  const melodyIdxRef = useRef(0);
  const songRef = useRef<Song>(SONGS[0]);
  const lastLaneRef = useRef(-1);
  const spawnAccRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const splashIdRef = useRef(1);
  const floatIdRef = useRef(1);
  const timersRef = useRef<number[]>([]);
  const playRef = useRef<HTMLDivElement | null>(null);

  // Load the persisted best after mount (SSR-safe).
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Clear any pending timeouts on unmount.
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    },
    []
  );

  // Track the real playfield height so the hit band tracks the rendered size.
  useEffect(() => {
    const el = playRef.current;
    if (!el) return;
    const measure = () => {
      heightRef.current = el.clientHeight;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  // Stable ref-setter per tile id; pruned when the tile leaves so the cache
  // never grows unbounded across a long game.
  const getTileRef = useCallback((id: number) => {
    const cache = refSetters.current;
    let fn = cache.get(id);
    if (!fn) {
      fn = (el: HTMLDivElement | null) => {
        if (el) {
          elRef.current.set(id, el);
          el.style.transform = `translate(-50%, ${yRef.current.get(id) ?? START_Y}px)`;
        } else {
          elRef.current.delete(id);
        }
      };
      cache.set(id, fn);
    }
    return fn;
  }, []);

  const dropTile = useCallback((id: number) => {
    yRef.current.delete(id);
    elRef.current.delete(id);
    refSetters.current.delete(id);
  }, []);

  /* ---- short-lived feedback bits ---- */

  const addSplash = useCallback(
    (lane: number, y: number, note: Note) => {
      const id = splashIdRef.current++;
      setSplashes((s) => [...s, { id, lane, y, note }]);
      schedule(() => setSplashes((s) => s.filter((x) => x.id !== id)), POP_MS);
    },
    [schedule]
  );

  const addFloat = useCallback(
    (lane: number, y: number, text: string) => {
      const id = floatIdRef.current++;
      setFloats((f) => [...f, { id, lane, y, text }]);
      schedule(() => setFloats((f) => f.filter((x) => x.id !== id)), FLOAT_MS);
    },
    [schedule]
  );

  /* ---- spawning (driven by the rAF accumulator, not setInterval) ---- */

  const spawnTile = useCallback(() => {
    const notes = songRef.current.notes;
    const note = notes[melodyIdxRef.current % notes.length];
    melodyIdxRef.current += 1;

    let lane = Math.floor(Math.random() * LANES);
    if (lane === lastLaneRef.current) lane = (lane + 1) % LANES;
    lastLaneRef.current = lane;

    const id = tileIdRef.current++;
    yRef.current.set(id, START_Y);
    tilesRef.current.push({ id, lane, note });
  }, []);

  /* ---- end of game ---- */

  const endGame = useCallback(() => {
    phaseRef.current = "over";
    setPhase("over");
    const finalScore = scoreRef.current;
    const isBest = recordBest(SLUG, finalScore);
    setNewBest(isBest);
    setStars(SLUG, starsFor(finalScore));
    if (isBest) {
      setBest(finalScore);
      setBurst((b) => b + 1);
      sfx.win();
    } else {
      sfx.gameOver();
    }
  }, []);

  const registerMiss = useCallback(
    (count: number) => {
      sfx.wrong();
      comboRef.current = 0;
      setCombo(0);
      setShaking(true);
      schedule(() => setShaking(false), 420);
      heartsRef.current = Math.max(0, heartsRef.current - count);
      setHearts(heartsRef.current);
      if (heartsRef.current <= 0) endGame();
    },
    [endGame, schedule]
  );

  /* ---- the falling + spawning loop ---- */

  useEffect(() => {
    if (phase !== "playing") return;
    lastTsRef.current = null;

    const loop = (ts: number) => {
      if (phaseRef.current !== "playing") {
        rafRef.current = null;
        return;
      }
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      const dt = Math.min((ts - last) / 1000, 0.05); // clamp tab-switch gaps
      const speed = speedFor(scoreRef.current);
      const h = heightRef.current;
      const bandBottom = h - BOTTOM_MARGIN;

      let dirty = false;

      // steady cadence: spacing stays ~GAP_PX as speed climbs
      spawnAccRef.current += dt;
      const interval = GAP_PX / speed;
      if (spawnAccRef.current >= interval) {
        spawnAccRef.current -= interval;
        spawnTile();
        dirty = true;
      }

      // advance tiles; collect any that slipped past the band
      const missed: number[] = [];
      for (const t of tilesRef.current) {
        const y = (yRef.current.get(t.id) ?? START_Y) + speed * dt;
        yRef.current.set(t.id, y);
        if (y + TILE_H / 2 > bandBottom) {
          missed.push(t.id);
        } else {
          const el = elRef.current.get(t.id);
          if (el) el.style.transform = `translate(-50%, ${y}px)`;
        }
      }

      if (missed.length > 0) {
        const gone = new Set(missed);
        tilesRef.current = tilesRef.current.filter((t) => !gone.has(t.id));
        missed.forEach(dropTile);
        registerMiss(missed.length);
        dirty = true;
      }

      if (dirty) setTiles(tilesRef.current.slice());
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, spawnTile, registerMiss, dropTile]);

  /* ---- the one interaction: tapping a lane ---- */

  const registerHit = (tile: Tile, y: number) => {
    sfx.note(tile.note.freq); // perform the pitch

    tilesRef.current = tilesRef.current.filter((t) => t.id !== tile.id);
    dropTile(tile.id);
    setTiles(tilesRef.current.slice());

    const nextCombo = comboRef.current + 1;
    comboRef.current = nextCombo;
    setCombo(nextCombo);
    if (nextCombo >= 4 && nextCombo % 4 === 0) sfx.combo(nextCombo);

    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    scoreRef.current += points;
    setScore(scoreRef.current);

    addSplash(tile.lane, y, tile.note);
    addFloat(tile.lane, y, `+${points}`);
  };

  const handleLaneTap = (lane: number) => {
    if (phaseRef.current !== "playing") return;

    // Kid-friendly: tapping anywhere in a lane performs the LOWEST visible tile
    // in it (closest to the floor), so a tap on a tile always plays its note —
    // like real Piano Tiles. Tiles are only "missed" if they reach the floor
    // untapped (handled in the falling loop). An empty lane is a quiet whiff.
    let target: Tile | null = null;
    let targetY = 0;
    let lowest = -Infinity;
    for (const t of tilesRef.current) {
      if (t.lane !== lane) continue;
      const y = yRef.current.get(t.id) ?? START_Y;
      const center = y + TILE_H / 2;
      if (center >= 0 && center > lowest) {
        lowest = center;
        target = t;
        targetY = y;
      }
    }

    if (!target) {
      sfx.tick(); // harmless whiff — never punish an empty tap
      return;
    }
    registerHit(target, targetY);
  };

  /* ---- round control ---- */

  const startGame = (chosen: Song = song) => {
    sfx.click();
    songRef.current = chosen;
    setSong(chosen);
    tilesRef.current = [];
    yRef.current.clear();
    elRef.current.clear();
    refSetters.current.clear();
    tileIdRef.current = 1;
    melodyIdxRef.current = 0;
    lastLaneRef.current = -1;
    spawnAccRef.current = 0;
    lastTsRef.current = null;
    scoreRef.current = 0;
    comboRef.current = 0;
    heartsRef.current = MAX_HEARTS;

    setScore(0);
    setCombo(0);
    setHearts(MAX_HEARTS);
    setSplashes([]);
    setFloats([]);
    setShaking(false);
    setNewBest(false);

    spawnTile(); // start with one tile already on screen
    setTiles(tilesRef.current.slice());

    phaseRef.current = "playing";
    setPhase("playing");
  };

  /* ---- render ---- */

  const heartRow = "❤️".repeat(hearts) + "🤍".repeat(MAX_HEARTS - hearts);

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
      <StatBadge
        label="Hearts"
        value={<span className="text-xl leading-none">{heartRow}</span>}
      />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={70} />

      <div className="w-full max-w-sm select-none">
        {phase === "playing" && (
          <div className="mb-2 flex min-h-[2rem] items-center justify-center">
            {combo >= 2 ? (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            ) : (
              <div className="rounded-full bg-white/20 px-4 py-1 text-sm font-bold text-white">
                {song.emoji} {song.title}
              </div>
            )}
          </div>
        )}

        <div
          ref={playRef}
          className={`relative w-full overflow-hidden rounded-3xl bg-black/30 ring-2 ring-white/15 ${
            shaking ? "animate-shake" : ""
          }`}
          style={{ height: "clamp(320px, 56dvh, 480px)" }}
        >
          {/* lane dividers */}
          <div className="pointer-events-none absolute inset-0 flex">
            {Array.from({ length: LANES }, (_, i) => (
              <div
                key={i}
                className={`h-full flex-1 ${i > 0 ? "border-l border-white/10" : ""}`}
              />
            ))}
          </div>

          {/* hit band + tap line, anchored to the bottom from the same constants */}
          <div
            className="pointer-events-none absolute inset-x-0 bg-white/10"
            style={{ bottom: BOTTOM_MARGIN, height: HITZONE_H }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 h-1 bg-white/80 shadow-[0_0_12px_2px_rgba(255,255,255,0.6)]"
            style={{ bottom: BOTTOM_MARGIN + HITZONE_H / 2 }}
            aria-hidden
          />

          {/* falling tiles (pointer-events-none: the lane buttons catch taps) */}
          {tiles.map((t) => (
            <div
              key={t.id}
              ref={getTileRef(t.id)}
              className="pointer-events-none absolute top-0 z-10 will-change-transform"
              style={{ left: `${lanePct(t.lane)}%` }}
            >
              <div
                className="flex items-center justify-center rounded-2xl font-black shadow-lg shadow-black/40 ring-2 ring-white/40"
                style={{
                  width: "clamp(52px, 19vw, 78px)",
                  height: TILE_H,
                  background: t.note.color,
                  color: t.note.text,
                }}
              >
                <span className="text-2xl drop-shadow-sm">{t.note.name}</span>
                <span className="ml-0.5 text-sm opacity-80">♪</span>
              </div>
            </div>
          ))}

          {/* pop splashes — outer div positions, inner div animates (so the
              pop-in keyframes don't override the placement transform) */}
          {splashes.map((s) => (
            <div
              key={s.id}
              className="pointer-events-none absolute top-0 z-20"
              style={{ left: `${lanePct(s.lane)}%`, transform: `translate(-50%, ${s.y}px)` }}
              aria-hidden
            >
              <div
                className="flex animate-pop-in items-center justify-center rounded-full ring-4 ring-white/70"
                style={{
                  width: "clamp(52px, 19vw, 78px)",
                  height: TILE_H,
                  background: s.note.color,
                  color: s.note.text,
                }}
              >
                <span className="text-2xl">✨</span>
              </div>
            </div>
          ))}

          {/* floating "+N" */}
          {floats.map((f) => (
            <div
              key={f.id}
              className="pointer-events-none absolute z-30"
              style={{ left: `${lanePct(f.lane)}%`, top: f.y, transform: "translateX(-50%)" }}
              aria-hidden
            >
              <FloatScore>{f.text}</FloatScore>
            </div>
          ))}

          {/* lane tap targets: full-height columns, the only interactive layer */}
          {phase === "playing" && (
            <div className="absolute inset-0 z-40 flex">
              {Array.from({ length: LANES }, (_, lane) => (
                <button
                  key={lane}
                  type="button"
                  onClick={() => handleLaneTap(lane)}
                  className="h-full flex-1 transition-colors active:bg-white/10"
                  aria-label={`Lane ${lane + 1}`}
                />
              ))}
            </div>
          )}

          {phase === "ready" && (
            <CenterOverlay>
              <Panel>
                <div className="mb-1 text-5xl animate-bob" aria-hidden>
                  🎹
                </div>
                <h2 className="text-2xl font-black text-slate-800">Tap Tunes</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Tap each falling tile on the glowing line to play the song. Pick a tune!
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SONGS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => startGame(s)}
                      className="flex flex-col items-center gap-1 rounded-2xl bg-violet-100 px-2 py-3 text-center font-black text-violet-900 shadow-sm transition active:scale-95 hover:bg-violet-200"
                    >
                      <span className="text-3xl" aria-hidden>
                        {s.emoji}
                      </span>
                      <span className="text-sm leading-tight">{s.title}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs font-bold text-slate-500">
                  ❤️❤️❤️ 3 hearts &middot; ⭐ at 80 / 200 / 400 pts
                </p>
              </Panel>
            </CenterOverlay>
          )}

          {phase === "over" && (
            <CenterOverlay>
              <Panel>
                <div className="text-5xl" aria-hidden>
                  {newBest ? "🏆" : "🎹"}
                </div>
                {newBest && (
                  <div className="mt-1 animate-bob text-xl font-black text-amber-500">
                    NEW BEST!
                  </div>
                )}
                <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
                <div className="mt-3 text-5xl font-black tabular-nums text-violet-600">
                  {score}
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  points
                </div>
                <div className="mt-3 flex justify-center">
                  <StarRow value={starsFor(score)} />
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-500">
                  Best {best} &middot; {song.emoji} {song.title}
                </div>
                <div className="mt-5 flex flex-col items-center gap-2">
                  <BigButton onClick={() => startGame()}>🔁 Play Again</BigButton>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.click();
                      phaseRef.current = "ready";
                      setPhase("ready");
                    }}
                    className="rounded-2xl px-5 py-2 text-base font-black text-violet-600 transition active:scale-95 hover:bg-violet-50"
                  >
                    🎵 Choose Song
                  </button>
                </div>
              </Panel>
            </CenterOverlay>
          )}
        </div>
      </div>
    </GameShell>
  );
}

function CenterOverlay({ children }: { children: React.ReactNode }) {
  // items-start + my-auto: perfectly centered when the panel fits, but scrollable
  // from the top when it's taller than the playfield (e.g. the song picker on a
  // short screen), so no control is ever clipped by the overflow-hidden field.
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto p-3">
      <div className="my-auto flex w-full justify-center">{children}</div>
    </div>
  );
}
