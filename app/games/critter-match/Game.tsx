"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";

const SLUG = "critter-match";
const meta = getGame(SLUG);

/** Distinct animal faces — only the first N (N = pairs) are used per level. */
const ANIMALS = [
  "🐶", "🐱", "🦊", "🐰", "🐼", "🐯", "🦁", "🐸",
  "🐵", "🐷", "🐮", "🐔", "🐧", "🦄", "🐢", "🐙",
] as const;

/** Pairs per level: start at 4 (4x2), add one each level up to 8 (4x4). */
const LEVELS = [4, 5, 6, 7, 8] as const;

const BASE_POINTS = 50; // points for any match
const SPEED_CAP = 30; // max speed bonus for a near-instant match
const MAX_MULT = 5; // combo multiplier ceiling
const LEVEL_BONUS = 100; // base bonus for clearing a board

/** Star thresholds on the accumulated run score (a full clear earns >= ~2500). */
function starsFor(score: number): number {
  if (score >= 4500) return 3;
  if (score >= 3300) return 2;
  if (score >= 2000) return 1;
  return 0;
}

type Card = { id: number; emoji: string; matched: boolean };
type Status = "start" | "playing" | "won";
type Float = { id: number; amount: number };

/** Fisher–Yates shuffle (pure; called only from handlers/effects). */
function shuffle<T>(input: readonly T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build a freshly shuffled deck of `pairs` matching animal pairs. */
function buildDeck(pairs: number): Card[] {
  const picks = shuffle(ANIMALS).slice(0, pairs);
  const doubled = picks.flatMap((emoji) => [emoji, emoji]);
  return shuffle(doubled).map((emoji, id) => ({ id, emoji, matched: false }));
}

export default function Game() {
  const [status, setStatus] = useState<Status>("start");
  const [cards, setCards] = useState<Card[]>([]);
  const [levelIndex, setLevelIndex] = useState(0);
  const [firstIdx, setFirstIdx] = useState<number | null>(null);
  const [secondIdx, setSecondIdx] = useState<number | null>(null);
  const [lock, setLock] = useState(false);

  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  const [float, setFloat] = useState<Float | null>(null);
  const [burst, setBurst] = useState(0);
  const [showCleared, setShowCleared] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [earnedStars, setEarnedStars] = useState(0);

  // Refs avoid stale closures inside timeouts / single-fire effects.
  const streakRef = useRef(0);
  const scoreRef = useRef(0);
  const firstFlipAt = useRef(0);
  const floatId = useRef(0);
  const resolveTimer = useRef<number | null>(null);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    setBestScore(getBest(SLUG));
  }, []);

  // Clear any pending timers on unmount.
  useEffect(
    () => () => {
      if (resolveTimer.current) window.clearTimeout(resolveTimer.current);
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    },
    [],
  );

  const startLevel = useCallback((idx: number) => {
    setLevelIndex(idx);
    setCards(buildDeck(LEVELS[idx]));
    setFirstIdx(null);
    setSecondIdx(null);
    setLock(false);
    setStreak(0);
    streakRef.current = 0;
  }, []);

  const startGame = useCallback(() => {
    if (resolveTimer.current) window.clearTimeout(resolveTimer.current);
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    sfx.click();
    setScore(0);
    scoreRef.current = 0;
    setMoves(0);
    setIsNewBest(false);
    setEarnedStars(0);
    setShowCleared(false);
    setFloat(null);
    setStatus("playing");
    startLevel(0);
  }, [startLevel]);

  const finishRun = useCallback(() => {
    const finalScore = scoreRef.current;
    const newBest = recordBest(SLUG, finalScore);
    setIsNewBest(newBest);
    if (newBest) setBurst((b) => b + 1);
    const stars = starsFor(finalScore);
    setStars(SLUG, stars);
    setEarnedStars(stars);
    setBestScore(getBest(SLUG));
    setStatus("won");
  }, []);

  const resolveMatch = useCallback((a: number, b: number) => {
    sfx.correct();
    const elapsed = Date.now() - firstFlipAt.current;
    const speedBonus = Math.max(0, SPEED_CAP - Math.floor(elapsed / 100));
    const nextStreak = streakRef.current + 1;
    streakRef.current = nextStreak;
    setStreak(nextStreak);
    if (nextStreak >= 2) sfx.combo(nextStreak);
    const mult = Math.min(nextStreak, MAX_MULT);
    const gained = (BASE_POINTS + speedBonus) * mult;
    setScore((s) => s + gained);
    floatId.current += 1;
    setFloat({ id: floatId.current, amount: gained });
    resolveTimer.current = window.setTimeout(() => {
      setCards((prev) =>
        prev.map((c, idx) => (idx === a || idx === b ? { ...c, matched: true } : c)),
      );
      setFirstIdx(null);
      setSecondIdx(null);
      setLock(false);
    }, 360);
  }, []);

  const resolveMismatch = useCallback(() => {
    sfx.wrong();
    streakRef.current = 0;
    setStreak(0);
    resolveTimer.current = window.setTimeout(() => {
      setFirstIdx(null);
      setSecondIdx(null);
      setLock(false);
    }, 720);
  }, []);

  const handlePick = useCallback(
    (i: number) => {
      if (lock) return; // resolving — ignore a third tap
      if (cards[i].matched) return; // already solved
      if (i === firstIdx) return; // same card re-tapped
      sfx.click();
      if (firstIdx === null) {
        firstFlipAt.current = Date.now();
        setFirstIdx(i);
        return;
      }
      // Second card of the move.
      setSecondIdx(i);
      setLock(true);
      setMoves((m) => m + 1);
      if (cards[firstIdx].emoji === cards[i].emoji) {
        resolveMatch(firstIdx, i);
      } else {
        resolveMismatch();
      }
    },
    [lock, cards, firstIdx, resolveMatch, resolveMismatch],
  );

  // Board cleared -> celebrate, then advance level or finish the run.
  const allMatched = cards.length > 0 && cards.every((c) => c.matched);
  useEffect(() => {
    if (status !== "playing" || !allMatched) return; // guard MUST stay first
    sfx.win();
    setBurst((b) => b + 1);
    setScore((s) => s + LEVEL_BONUS + levelIndex * 50);
    setShowCleared(true);
    const isLast = levelIndex >= LEVELS.length - 1;
    const id = window.setTimeout(() => {
      setShowCleared(false);
      if (isLast) finishRun();
      else startLevel(levelIndex + 1);
    }, 1300);
    transitionTimer.current = id;
    return () => window.clearTimeout(id);
  }, [allMatched, status, levelIndex, startLevel, finishRun]);

  const mult = Math.min(Math.max(streak, 1), MAX_MULT);
  const isMismatchPending =
    firstIdx !== null &&
    secondIdx !== null &&
    cards[firstIdx]?.emoji !== cards[secondIdx]?.emoji;

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Moves" value={moves} />
      <StatBadge label="Best" value={bestScore} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {status === "start" && (
        <Panel>
          <div className="mb-2 text-6xl animate-bob" aria-hidden>
            🐾
          </div>
          <h2 className="text-3xl font-black">Critter Match</h2>
          <p className="mt-2 text-base font-semibold text-slate-600">
            Flip two cards and find the matching animals. Chain matches for a combo
            and clear every board!
          </p>
          <div className="mt-5">
            <BigButton onClick={startGame}>▶ Play</BigButton>
          </div>
        </Panel>
      )}

      {status === "playing" && (
        <div className="flex w-full flex-col items-center">
          <div className="mb-3 flex w-full max-w-[330px] items-center justify-between text-sm font-black">
            <span className="rounded-full bg-white/25 px-3 py-1">
              Level {levelIndex + 1}/{LEVELS.length}
            </span>
            <span
              className={`rounded-full px-3 py-1 transition ${
                streak >= 2 ? "bg-orange-400 text-white animate-wiggle" : "bg-white/20 text-white/80"
              }`}
            >
              🔥 Combo x{mult}
            </span>
          </div>

          <div className="relative w-full max-w-[330px]">
            <div className="flex flex-wrap justify-center gap-2">
              {cards.map((card, idx) => {
                const faceUp = card.matched || idx === firstIdx || idx === secondIdx;
                const shaking =
                  isMismatchPending && (idx === firstIdx || idx === secondIdx);
                return (
                  <CritterCard
                    key={card.id}
                    emoji={card.emoji}
                    faceUp={faceUp}
                    matched={card.matched}
                    shaking={shaking}
                    onPick={() => handlePick(idx)}
                  />
                );
              })}
            </div>

            {float && (
              <div
                key={float.id}
                className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2"
              >
                <FloatScore>+{float.amount}</FloatScore>
              </div>
            )}

            {showCleared && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="animate-pop-in rounded-2xl bg-white/95 px-6 py-4 text-center text-slate-900 shadow-2xl">
                  <div className="text-4xl" aria-hidden>
                    🎉
                  </div>
                  <p className="mt-1 text-2xl font-black">Level Cleared!</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {status === "won" && (
        <Panel>
          <div className="mb-2 text-6xl animate-bob" aria-hidden>
            🏆
          </div>
          <h2 className="text-3xl font-black">You Matched Them All!</h2>
          {isNewBest && (
            <p className="mt-2 text-lg font-black text-fuchsia-600 animate-wiggle">
              ⭐ NEW BEST! ⭐
            </p>
          )}
          <p className="mt-2 text-5xl font-black tabular-nums">{score}</p>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-500">
            points · {moves} moves
          </p>
          <div className="mt-3 flex justify-center">
            <StarRow value={earnedStars} />
          </div>
          <div className="mt-5">
            <BigButton onClick={startGame}>🔁 Play Again</BigButton>
          </div>
        </Panel>
      )}
    </GameShell>
  );
}

/** A single memory card: ❓ face-down, animal face-up with a pop on reveal. */
function CritterCard({
  emoji,
  faceUp,
  matched,
  shaking,
  onPick,
}: {
  emoji: string;
  faceUp: boolean;
  matched: boolean;
  shaking: boolean;
  onPick: () => void;
}) {
  const base =
    "grow-0 shrink-0 aspect-square flex items-center justify-center rounded-2xl text-[clamp(1.6rem,8vw,2.3rem)] shadow-md transition active:scale-95 select-none";
  const face = matched
    ? "bg-green-100 ring-4 ring-green-400"
    : faceUp
      ? "bg-white"
      : "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white";
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={matched}
      aria-label={faceUp ? `Card showing ${emoji}` : "Face-down card"}
      className={`${base} ${face} ${shaking ? "animate-shake" : ""}`}
      style={{ flexBasis: "calc((100% - 1.5rem) / 4)" }}
    >
      <span key={`${faceUp}-${matched}`} className={faceUp ? "animate-pop-in" : ""}>
        {faceUp ? emoji : "❓"}
      </span>
    </button>
  );
}
