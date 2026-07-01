"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { recordBest, getBest, setStars as persistStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";

const SLUG = "word-drop";
const meta = getGame(SLUG);

/* ------------------------------------------------------------------ *
 * Pure constants & helpers (no React, no browser globals)            *
 * ------------------------------------------------------------------ */

type WordEntry = { word: string; emoji: string };

// ~25 age-appropriate 3–6 letter nouns, each with an emoji hint.
const WORDS: WordEntry[] = [
  { word: "CAT", emoji: "🐱" },
  { word: "DOG", emoji: "🐶" },
  { word: "SUN", emoji: "☀️" },
  { word: "BUS", emoji: "🚌" },
  { word: "PIG", emoji: "🐷" },
  { word: "BEE", emoji: "🐝" },
  { word: "OWL", emoji: "🦉" },
  { word: "BAT", emoji: "🦇" },
  { word: "COW", emoji: "🐮" },
  { word: "STAR", emoji: "⭐" },
  { word: "FISH", emoji: "🐟" },
  { word: "TREE", emoji: "🌳" },
  { word: "CAKE", emoji: "🍰" },
  { word: "FROG", emoji: "🐸" },
  { word: "BOOK", emoji: "📕" },
  { word: "MOON", emoji: "🌙" },
  { word: "BALL", emoji: "⚽" },
  { word: "DUCK", emoji: "🦆" },
  { word: "BEAR", emoji: "🐻" },
  { word: "APPLE", emoji: "🍎" },
  { word: "TIGER", emoji: "🐯" },
  { word: "TRAIN", emoji: "🚂" },
  { word: "HOUSE", emoji: "🏠" },
  { word: "SNAKE", emoji: "🐍" },
  { word: "ROBOT", emoji: "🤖" },
  { word: "ROCKET", emoji: "🚀" },
  { word: "FLOWER", emoji: "🌸" },
  { word: "PENCIL", emoji: "✏️" },
  { word: "BANANA", emoji: "🍌" },
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const MAX_HEARTS = 3;
const TILE_COUNT = 5; // simultaneous falling tiles
const LANES = 4; // horizontal columns
const TILE_PX = 56; // tile size (>= 44px tap target)

// Bright, high-contrast tile colours (white letters sit on top).
const TILE_COLORS = ["#ef4444", "#3b82f6", "#16a34a", "#a855f7", "#0ea5e9"];

type Tile = { id: number; letter: string; lane: number };
type Phase = "ready" | "playing" | "over";
type Float = { id: number; text: string; xPct: number; y: number };

function randFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Allowed word-length window for a level: longer words as the level climbs. */
function lenRange(level: number): [number, number] {
  const maxLen = Math.min(3 + Math.floor((level - 1) / 2), 6);
  const minLen = Math.max(3, maxLen - 1);
  return [minLen, maxLen];
}

function pickWord(level: number, avoid: string): WordEntry {
  const [minLen, maxLen] = lenRange(level);
  let pool = WORDS.filter(
    (w) => w.word.length >= minLen && w.word.length <= maxLen && w.word !== avoid
  );
  if (pool.length === 0) pool = WORDS.filter((w) => w.word !== avoid);
  if (pool.length === 0) pool = WORDS;
  return randFrom(pool);
}

/** Bag of letters a tile can show: every word letter + a few wrong distractors. */
function makeBag(word: string, distractors: number): string[] {
  const inWord = new Set(word.split(""));
  const unique = [...inWord];
  const outside = shuffle(ALPHABET.filter((c) => !inWord.has(c)));
  return [...unique, ...outside.slice(0, distractors)];
}

function fallSpeed(level: number): number {
  return Math.min(55 + (level - 1) * 10, 150); // px/sec, capped so it stays catchable
}

function distractorCount(level: number): number {
  return Math.min(1 + Math.floor((level - 1) / 2), 3);
}

function speedJitter(level: number): number {
  return fallSpeed(level) + (Math.random() * 20 - 10);
}

/** Tile horizontal centre as a % — clamped to [10,90] so nothing overflows. */
function lanePct(lane: number): number {
  return 10 + lane * (80 / (LANES - 1));
}

function starsFor(score: number): number {
  if (score >= 400) return 3;
  if (score >= 200) return 2;
  if (score >= 80) return 1;
  return 0;
}

/* ------------------------------------------------------------------ *
 * Game component                                                     *
 * ------------------------------------------------------------------ */

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [entry, setEntry] = useState<WordEntry>(WORDS[0]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);

  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [combo, setCombo] = useState(0);
  const [filled, setFilled] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);

  const [best, setBest] = useState(0);
  const [earnedStars, setEarnedStars] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [burst, setBurst] = useState(0);
  const [locked, setLocked] = useState(false); // ignore taps during the word-complete cheer
  const [shakeId, setShakeId] = useState(0); // re-keys the slot row to restart the shake
  const [wrongTileId, setWrongTileId] = useState<number | null>(null);
  const [levelToast, setLevelToast] = useState("");

  const level = 1 + Math.floor(wordsCompleted / 2);

  // --- mutable engine state (refs avoid per-frame re-renders) ---
  const modelRef = useRef<Tile[]>([]); // single source of truth for tile letter/lane
  const yRef = useRef<Map<number, number>>(new Map());
  const speedRef = useRef<Map<number, number>>(new Map());
  const elRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const bagRef = useRef<string[]>([]);

  const wordRef = useRef("");
  const filledRef = useRef(0);
  const levelRef = useRef(1);
  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const heightRef = useRef(360);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const floatIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const playRef = useRef<HTMLDivElement | null>(null);

  // keep refs read by the rAF loop in sync with rendered state
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    filledRef.current = filled;
  }, [filled]);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // load persisted best after mount (SSR-safe)
  useEffect(() => {
    setBest(getBest(SLUG));
  }, []);

  // self-cancelling timer helper so every pending timeout is cleaned up
  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    },
    []
  );

  // measure the playfield so the fall-off threshold tracks the real height
  useEffect(() => {
    const el = playRef.current;
    if (!el) return;
    const update = () => {
      heightRef.current = el.clientHeight;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- engine helpers (ref-only, stable identities) ---- */

  // Guarantee the next required letter is reachable: if it's missing, drop the
  // top-most tile back to the top carrying that letter. Keeps every word
  // completable, including duplicate-letter words (APPLE, BALL, BANANA…).
  const ensureNextPresent = useCallback((filledVal: number) => {
    const word = wordRef.current;
    if (filledVal >= word.length) return;
    const next = word[filledVal];
    if (modelRef.current.some((t) => t.letter === next)) return;

    let pick = modelRef.current[0];
    let minY = Infinity;
    for (const t of modelRef.current) {
      const y = yRef.current.get(t.id) ?? -TILE_PX;
      if (y < minY) {
        minY = y;
        pick = t;
      }
    }
    pick.letter = next;
    pick.lane = Math.floor(Math.random() * LANES);
    yRef.current.set(pick.id, -TILE_PX);
  }, []);

  // A tile fell off the bottom — recycle it at the top with a fresh letter.
  const recycleFalloff = useCallback((t: Tile) => {
    const word = wordRef.current;
    const filledVal = filledRef.current;
    let letter = randFrom(bagRef.current);
    if (filledVal < word.length) {
      const next = word[filledVal];
      const elsewhere = modelRef.current.some((o) => o.id !== t.id && o.letter === next);
      if (!elsewhere) letter = next;
    }
    t.letter = letter;
    t.lane = Math.floor(Math.random() * LANES);
    yRef.current.set(t.id, -TILE_PX);
    speedRef.current.set(t.id, speedJitter(levelRef.current));
  }, []);

  // Build a full fresh set of falling tiles for a word.
  const spawnAll = useCallback((word: string, lvl: number) => {
    bagRef.current = makeBag(word, distractorCount(lvl));
    const lanes = shuffle(Array.from({ length: LANES }, (_, i) => i));
    const arr: Tile[] = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      arr.push({ id: i, letter: randFrom(bagRef.current), lane: lanes[i % LANES] });
      yRef.current.set(i, -TILE_PX - i * 80); // stagger above the screen
      speedRef.current.set(i, speedJitter(lvl));
    }
    // make sure the very first letter is on screen
    if (!arr.some((t) => t.letter === word[0])) arr[0].letter = word[0];
    modelRef.current = arr;
  }, []);

  /* ---- the falling animation loop ---- */

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
      const dt = Math.min((ts - last) / 1000, 0.05); // clamp big gaps (tab switch)
      const h = heightRef.current;

      let lettersChanged = false;
      for (const t of modelRef.current) {
        let y = (yRef.current.get(t.id) ?? -TILE_PX) + (speedRef.current.get(t.id) ?? 60) * dt;
        if (y > h) {
          recycleFalloff(t);
          y = yRef.current.get(t.id) ?? -TILE_PX;
          lettersChanged = true;
        }
        yRef.current.set(t.id, y);
        const el = elRef.current.get(t.id);
        if (el) el.style.transform = `translate(-50%, ${y}px)`;
      }
      if (lettersChanged) setTiles(modelRef.current.slice());
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, recycleFalloff]);

  /* ---- floating "+N" popups ---- */

  const addFloat = useCallback(
    (text: string, xPct: number, y: number) => {
      const id = floatIdRef.current++;
      setFloats((f) => [...f, { id, text, xPct, y }]);
      schedule(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
    },
    [schedule]
  );

  /* ---- round flow ---- */

  const loadNextWord = useCallback(
    (lvl: number) => {
      const e = pickWord(lvl, wordRef.current);
      wordRef.current = e.word;
      filledRef.current = 0;
      levelRef.current = lvl;
      spawnAll(e.word, lvl);
      setEntry(e);
      setFilled(0);
      setLocked(false);
      setTiles(modelRef.current.slice());
    },
    [spawnAll]
  );

  const startGame = useCallback(() => {
    sfx.click();
    setScore(0);
    setHearts(MAX_HEARTS);
    setCombo(0);
    setWordsCompleted(0);
    setNewBest(false);
    setEarnedStars(0);
    setLevelToast("");
    setFloats([]);
    setWrongTileId(null);

    const e = pickWord(1, "");
    wordRef.current = e.word;
    filledRef.current = 0;
    levelRef.current = 1;
    scoreRef.current = 0;
    spawnAll(e.word, 1);
    setEntry(e);
    setFilled(0);
    setLocked(false);
    setTiles(modelRef.current.slice());
    setPhase("playing");
  }, [spawnAll]);

  const endGame = useCallback(() => {
    setPhase("over");
    sfx.gameOver();
    const finalScore = scoreRef.current;
    const isBest = recordBest(SLUG, finalScore);
    setNewBest(isBest);
    if (isBest) {
      setBest(finalScore);
      setBurst((b) => b + 1);
    }
    const stars = starsFor(finalScore);
    persistStars(SLUG, stars);
    setEarnedStars(stars);
  }, []);

  const completeWord = useCallback(
    (currentLevel: number) => {
      sfx.correct();
      schedule(() => sfx.win(), 130);
      setBurst((b) => b + 1);
      addFloat("WORD!", 50, 18);

      const bonus = 50 + currentLevel * 10;
      setScore((s) => {
        const next = s + bonus;
        scoreRef.current = next; // keep ref correct synchronously for endGame()
        return next;
      });

      const newCount = wordsCompleted + 1;
      const newLevel = 1 + Math.floor(newCount / 2);
      setWordsCompleted(newCount);
      if (newLevel > currentLevel) {
        levelRef.current = newLevel;
        setLevelToast(`Level ${newLevel}! 🚀`);
        schedule(() => sfx.levelUp(), 260);
        schedule(() => setLevelToast(""), 1300);
      }

      setLocked(true);
      schedule(() => loadNextWord(newLevel), 650);
    },
    [wordsCompleted, addFloat, schedule, loadNextWord]
  );

  /* ---- the one interaction: tapping a tile ---- */

  const recycleTapped = useCallback(
    (id: number, newFilled: number) => {
      const t = modelRef.current.find((x) => x.id === id);
      if (t) {
        t.letter = randFrom(bagRef.current);
        t.lane = Math.floor(Math.random() * LANES);
        yRef.current.set(id, -TILE_PX);
        speedRef.current.set(id, speedJitter(levelRef.current));
      }
      ensureNextPresent(newFilled);
      setTiles(modelRef.current.slice());
    },
    [ensureNextPresent]
  );

  const handleTapTile = (tile: Tile) => {
    if (phase !== "playing" || locked) return;
    const word = entry.word;

    if (tile.letter === word[filled]) {
      sfx.pop();
      const gain = 10 + Math.min(combo, 10) * 2;
      const newCombo = combo + 1;
      const newFilled = filled + 1;

      addFloat(`+${gain}`, lanePct(tile.lane), yRef.current.get(tile.id) ?? 40);
      setScore((s) => {
        const next = s + gain;
        scoreRef.current = next; // keep ref correct synchronously for endGame()
        return next;
      });
      setCombo(newCombo);
      setFilled(newFilled);
      filledRef.current = newFilled;
      if (newCombo >= 3 && newCombo % 3 === 0) sfx.combo(newCombo);

      if (newFilled >= word.length) {
        completeWord(level);
      } else {
        recycleTapped(tile.id, newFilled);
      }
    } else {
      sfx.wrong();
      setCombo(0);
      setShakeId((n) => n + 1);
      setWrongTileId(tile.id);
      schedule(() => setWrongTileId(null), 350);
      const newHearts = hearts - 1;
      setHearts(newHearts);
      if (newHearts <= 0) endGame();
    }
  };

  // Stable ref-setter per tile id (ids are a fixed 0..TILE_COUNT-1 set), so an
  // unrelated re-render never detaches/reattaches every tile's ref. The closure
  // reads yRef live, so the initial transform is still correct on (re)mount.
  const tileRefSetters = useRef<Map<number, (el: HTMLDivElement | null) => void>>(
    new Map()
  );
  const setTileRef = useCallback((id: number) => {
    const cache = tileRefSetters.current;
    let fn = cache.get(id);
    if (!fn) {
      fn = (el: HTMLDivElement | null) => {
        if (el) {
          elRef.current.set(id, el);
          el.style.transform = `translate(-50%, ${yRef.current.get(id) ?? -TILE_PX}px)`;
        } else {
          elRef.current.delete(id);
        }
      };
      cache.set(id, fn);
    }
    return fn;
  }, []);

  /* ---- render ---- */

  const heartRow = "❤️".repeat(hearts) + "🤍".repeat(MAX_HEARTS - hearts);

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Hearts" value={<span className="text-xl">{heartRow}</span>} />
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={28} />

      <div className="flex w-full flex-col items-center gap-3 no-select">
        {phase === "playing" && (
          <WordCard entry={entry} filled={filled} shakeId={shakeId} accent={meta.accent} />
        )}

        <div
          ref={playRef}
          className="relative w-full overflow-hidden rounded-3xl bg-black/15 ring-1 ring-white/25"
          style={{ height: "clamp(260px, 46dvh, 440px)" }}
        >
          {phase === "playing" && (
            <>
              {tiles.map((t, i) => (
                <div
                  key={t.id}
                  ref={setTileRef(t.id)}
                  className="absolute top-0 will-change-transform"
                  style={{ left: `${lanePct(t.lane)}%` }}
                >
                  <button
                    type="button"
                    onClick={() => handleTapTile(t)}
                    aria-label={`Letter ${t.letter}`}
                    className={`flex items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg shadow-black/30 transition-transform active:scale-90 ${
                      wrongTileId === t.id ? "ring-4 ring-red-300 animate-shake" : ""
                    }`}
                    style={{
                      width: TILE_PX,
                      height: TILE_PX,
                      background: TILE_COLORS[i % TILE_COLORS.length],
                    }}
                  >
                    {t.letter}
                  </button>
                </div>
              ))}

              {floats.map((f) => (
                <div
                  key={f.id}
                  className="absolute"
                  style={{ left: `${f.xPct}%`, top: f.y, transform: "translateX(-50%)" }}
                >
                  <FloatScore>{f.text}</FloatScore>
                </div>
              ))}

              {combo >= 2 && (
                <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-sm font-black text-orange-600 shadow animate-pop-in">
                  🔥 Combo x{combo}
                </div>
              )}

              {levelToast && (
                <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
                  <span className="rounded-2xl bg-white px-5 py-2 text-2xl font-black text-orange-600 shadow-xl animate-pop-in">
                    {levelToast}
                  </span>
                </div>
              )}
            </>
          )}

          {phase === "ready" && (
            <CenterOverlay>
              <Panel>
                <div className="mb-2 text-6xl animate-bob" aria-hidden>
                  🔤
                </div>
                <h2 className="text-2xl font-black">Word Drop</h2>
                <p className="mt-2 text-base font-semibold text-slate-600">
                  Tap the falling letters <span className="font-black">in order</span> to spell the
                  word. Wrong letter = lose a ❤️!
                </p>
                <div className="mt-4">
                  <BigButton onClick={startGame}>Play! ▶️</BigButton>
                </div>
              </Panel>
            </CenterOverlay>
          )}

          {phase === "over" && (
            <CenterOverlay>
              <Panel>
                <div className="text-5xl" aria-hidden>
                  {newBest ? "🏆" : "🎮"}
                </div>
                <h2 className="mt-1 text-2xl font-black">
                  {newBest ? "NEW BEST!" : "Game Over"}
                </h2>
                <p className="mt-1 text-lg font-bold text-slate-700">
                  {score} pts · {wordsCompleted} words
                </p>
                <div className="mt-3 flex justify-center">
                  <StarRow value={earnedStars} />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Best {best} pts
                </p>
                <div className="mt-4">
                  <BigButton onClick={startGame}>Play Again 🔁</BigButton>
                </div>
              </Panel>
            </CenterOverlay>
          )}
        </div>
      </div>
    </GameShell>
  );
}

/* ------------------------------------------------------------------ *
 * Sub-components                                                     *
 * ------------------------------------------------------------------ */

function CenterOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3">{children}</div>
  );
}

/** Emoji hint + the target word as fillable letter slots. */
function WordCard({
  entry,
  filled,
  shakeId,
  accent,
}: {
  entry: WordEntry;
  filled: number;
  shakeId: number;
  accent: string;
}) {
  const letters = entry.word.split("");
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="text-5xl animate-bob" aria-hidden>
        {entry.emoji}
      </div>
      <div
        key={shakeId}
        className={`flex flex-wrap justify-center gap-1.5 ${shakeId > 0 ? "animate-shake" : ""}`}
        aria-label={`Spell ${entry.word}`}
      >
        {letters.map((ch, i) => {
          const done = i < filled;
          const current = i === filled;
          return (
            <span
              key={i}
              className={`flex h-12 w-11 items-center justify-center rounded-xl border-2 text-2xl font-black ${
                done
                  ? "border-transparent text-white"
                  : current
                    ? "border-white bg-white/25 text-white ring-2 ring-white"
                    : "border-white/40 bg-white/5 text-white/40"
              }`}
              style={done ? { background: accent } : undefined}
            >
              {done ? (
                <span key={`f${i}`} className="animate-pop-in">
                  {ch}
                </span>
              ) : (
                ch
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
