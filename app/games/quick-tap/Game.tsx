"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";

const SLUG = "quick-tap";
const meta = getGame(SLUG);

/* ---- tuning constants ---- */
const CELLS = 9; // 3×3 grid
const MAX_HEARTS = 3;
const GAME_SECONDS = 30;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const BOMB_CHANCE = 0.2; // ~1 in 5 lit pads is a bomb
const PAD_LIFE_MS = 900; // a lit pad auto-clears after this
const FLOAT_MS = 800; // "+N" popup lifetime
const URGENT_SECONDS = 5; // clock turns urgent at/under this

/** Spawn cadence (ms): starts gentle, tightens as the score climbs, then floors. */
function spawnIntervalMs(score: number): number {
  return Math.max(380, 750 - Math.floor(score / 40) * 35);
}

/** Stars (0–3) earned for a final score. */
function starsFor(score: number): number {
  if (score >= 500) return 3;
  if (score >= 250) return 2;
  if (score >= 100) return 1;
  return 0;
}

type Phase = "ready" | "playing" | "over";
type PadKind = "target" | "bomb";
type Pad = { id: number; kind: PadKind } | null;
type Float = { id: number; cell: number; text: string };

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [pads, setPads] = useState<Pad[]>(() => Array<Pad>(CELLS).fill(null));

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);

  const [floats, setFloats] = useState<Float[]>([]);
  const [shakeKey, setShakeKey] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [burst, setBurst] = useState(0);

  // --- engine state (refs the timers read so they never see stale values) ---
  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const heartsRef = useRef(MAX_HEARTS);
  const timeLeftRef = useRef(GAME_SECONDS);
  const padsRef = useRef<Pad[]>(Array<Pad>(CELLS).fill(null));

  const padIdRef = useRef(1);
  const floatIdRef = useRef(1);
  const spawnMsRef = useRef(0);

  // --- timer bookkeeping: every id lives here so nothing ever leaks ---
  const spawnRef = useRef<number | null>(null); // pad-spawn interval
  const tickRef = useRef<number | null>(null); // once-per-second clock
  const timeoutsRef = useRef<Set<number>>(new Set()); // pad auto-clears + floats

  const clearAllTimers = useCallback(() => {
    if (spawnRef.current !== null) {
      window.clearInterval(spawnRef.current);
      spawnRef.current = null;
    }
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current.clear();
  }, []);

  // Load the persisted best after mount (SSR-safe, post-hydration).
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Nothing keeps running if the player leaves mid-round.
  useEffect(() => clearAllTimers, [clearAllTimers]);

  const endGame = useCallback(() => {
    clearAllTimers();
    phaseRef.current = "over";
    setPhase("over");
    const final = scoreRef.current;
    const isBest = recordBest(SLUG, final);
    setNewBest(isBest);
    setStars(SLUG, starsFor(final));
    if (isBest) {
      setBest(final);
      setBurst((b) => b + 1);
      sfx.win();
    } else {
      sfx.gameOver();
    }
  }, [clearAllTimers]);

  const addFloat = useCallback((cell: number, text: string) => {
    const id = floatIdRef.current++;
    setFloats((f) => [...f, { id, cell, text }]);
    const t = window.setTimeout(() => {
      timeoutsRef.current.delete(t);
      setFloats((f) => f.filter((x) => x.id !== id));
    }, FLOAT_MS);
    timeoutsRef.current.add(t);
  }, []);

  /* ---- the two driving loops: spawn pads + count the clock down ---- */
  useEffect(() => {
    if (phase !== "playing") return;

    const spawnPad = () => {
      if (phaseRef.current !== "playing") return;
      const empty: number[] = [];
      for (let i = 0; i < CELLS; i++) if (!padsRef.current[i]) empty.push(i);
      if (empty.length === 0) return; // board full — wait for one to clear

      const idx = empty[Math.floor(Math.random() * empty.length)];
      const kind: PadKind = Math.random() < BOMB_CHANCE ? "bomb" : "target";
      const id = padIdRef.current++;
      padsRef.current[idx] = { id, kind };
      setPads(padsRef.current.slice());

      const t = window.setTimeout(() => {
        timeoutsRef.current.delete(t);
        const cur = padsRef.current[idx];
        if (cur && cur.id === id) {
          // Letting a star expire isn't punished, but it breaks the streak.
          if (cur.kind === "target") {
            comboRef.current = 0;
            setCombo(0);
          }
          padsRef.current[idx] = null;
          setPads(padsRef.current.slice());
        }
      }, PAD_LIFE_MS);
      timeoutsRef.current.add(t);
    };

    const startSpawn = (ms: number) => {
      if (spawnRef.current !== null) window.clearInterval(spawnRef.current);
      spawnMsRef.current = ms;
      spawnRef.current = window.setInterval(spawnPad, ms);
    };

    const tick = () => {
      if (phaseRef.current !== "playing") return;
      const next = timeLeftRef.current - 1;
      timeLeftRef.current = next;
      setTimeLeft(Math.max(0, next));
      if (next <= 0) {
        endGame();
        return;
      }
      if (next <= URGENT_SECONDS) sfx.tick();
      // Re-time the spawner when the score crosses into a faster bracket.
      const desired = spawnIntervalMs(scoreRef.current);
      if (desired !== spawnMsRef.current) startSpawn(desired);
    };

    startSpawn(spawnIntervalMs(scoreRef.current));
    tickRef.current = window.setInterval(tick, 1000);

    return () => {
      if (spawnRef.current !== null) {
        window.clearInterval(spawnRef.current);
        spawnRef.current = null;
      }
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [phase, endGame]);

  /* ---- the one interaction: tapping a pad ---- */
  const handleTap = (idx: number) => {
    if (phaseRef.current !== "playing") return;
    const cell = padsRef.current[idx];
    if (!cell) return; // empty pad — harmless, never punished

    padsRef.current[idx] = null;
    setPads(padsRef.current.slice());

    if (cell.kind === "bomb") {
      sfx.wrong();
      comboRef.current = 0;
      setCombo(0);
      heartsRef.current = Math.max(0, heartsRef.current - 1);
      setHearts(heartsRef.current);
      setShakeKey((k) => k + 1);
      if (heartsRef.current <= 0) endGame();
      return;
    }

    sfx.pop();
    const nextCombo = comboRef.current + 1;
    comboRef.current = nextCombo;
    setCombo(nextCombo);
    if (nextCombo >= 4 && nextCombo % 4 === 0) sfx.combo(nextCombo);

    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    scoreRef.current += points;
    setScore(scoreRef.current);
    addFloat(idx, `+${points}`);
  };

  /* ---- round control ---- */
  const startGame = () => {
    clearAllTimers();
    sfx.click();

    padsRef.current = Array<Pad>(CELLS).fill(null);
    padIdRef.current = 1;
    scoreRef.current = 0;
    comboRef.current = 0;
    heartsRef.current = MAX_HEARTS;
    timeLeftRef.current = GAME_SECONDS;
    spawnMsRef.current = 0;

    setPads(Array<Pad>(CELLS).fill(null));
    setScore(0);
    setCombo(0);
    setHearts(MAX_HEARTS);
    setTimeLeft(GAME_SECONDS);
    setFloats([]);
    setShakeKey(0);
    setNewBest(false);

    phaseRef.current = "playing";
    setPhase("playing");
  };

  /* ---- render ---- */
  const heartsDisplay =
    "❤️".repeat(hearts) + "🤍".repeat(MAX_HEARTS - hearts);

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
      <StatBadge
        label="Hearts"
        value={<span className="text-xl leading-none">{heartsDisplay}</span>}
      />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={28} />

      {phase === "ready" && <ReadyPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && (
        <div className="w-full max-w-sm select-none">
          <div className="mb-3 flex min-h-[2.75rem] items-center justify-center gap-3">
            <div
              className={`rounded-full px-5 py-1.5 text-lg font-black tabular-nums shadow-md ${
                timeLeft <= URGENT_SECONDS
                  ? "animate-bob bg-rose-500 text-white"
                  : "bg-white/25 text-white"
              }`}
            >
              ⏱ {timeLeft}
            </div>
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          {/* re-keyed so a bomb hit retriggers the one-shot shake */}
          <div key={shakeKey} className={shakeKey > 0 ? "animate-shake" : ""}>
            <div className="grid grid-cols-3 gap-3">
              {pads.map((cell, idx) => (
                <div key={idx} className="relative">
                  <button
                    type="button"
                    onClick={() => handleTap(idx)}
                    aria-label={
                      cell
                        ? cell.kind === "bomb"
                          ? "Bomb — do not tap"
                          : "Star — tap it!"
                        : `Empty pad ${idx + 1}`
                    }
                    className={`flex aspect-square min-h-20 w-full items-center justify-center rounded-3xl ring-4 transition active:scale-95 ${
                      cell
                        ? cell.kind === "bomb"
                          ? "bg-slate-900 ring-slate-700 shadow-lg shadow-black/40"
                          : "bg-amber-300 ring-amber-100 shadow-lg shadow-amber-900/30"
                        : "bg-white/15 ring-white/10"
                    }`}
                  >
                    {cell && (
                      <span
                        key={cell.id}
                        className="animate-pop-in text-5xl drop-shadow"
                        aria-hidden
                      >
                        {cell.kind === "bomb" ? "💣" : "🌟"}
                      </span>
                    )}
                  </button>

                  {floats
                    .filter((f) => f.cell === idx)
                    .map((f) => (
                      <span
                        key={f.id}
                        className="pointer-events-none absolute left-1/2 top-1/4 z-10 -translate-x-1/2"
                        aria-hidden
                      >
                        <FloatScore>{f.text}</FloatScore>
                      </span>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </GameShell>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob" aria-hidden>
        🌟
      </div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Quick Tap</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Tap the 🌟 stars as fast as you can — but never tap the 💣 bombs! Chain stars in a row
        for a bigger combo.
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 hearts &middot; ⏱ 30s &middot; ⭐ at 100 / 250 / 500 pts
      </p>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>▶ Play</BigButton>
      </div>
    </Panel>
  );
}

function OverPanel({
  score,
  best,
  newBest,
  onPlay,
}: {
  score: number;
  best: number;
  newBest: boolean;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl" aria-hidden>
        {newBest ? "🏆" : "🌟"}
      </div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-amber-500">{score}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">points</div>
      <div className="mt-3 flex justify-center">
        <StarRow value={starsFor(score)} />
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-500">Best {best}</div>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>🔁 Play Again</BigButton>
      </div>
    </Panel>
  );
}
