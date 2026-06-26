"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { PAINTS, TARGETS, MAX_POT, mix, type Paint, type Mix } from "./data";

const SLUG = "color-mix";

const BASE_POINTS = 100;
const STREAK_BONUS = 20; // per perfect in a row, capped
const STREAK_CAP = 6;
const WASTE_PENALTY = 20; // points lost per wasted tap
const MIN_POINTS = 40;

const SOLVE_DELAY = 950; // celebrate the match before the next colour loads

type Phase = "start" | "playing" | "over";

const meta = getGame(SLUG);
const TOTAL = TARGETS.length;

function pointsFor(taps: number, ideal: number, streakAfter: number): number {
  const extra = Math.max(0, taps - ideal);
  if (extra === 0) return BASE_POINTS + Math.min(streakAfter, STREAK_CAP) * STREAK_BONUS;
  return Math.max(MIN_POINTS, BASE_POINTS - extra * WASTE_PENALTY);
}

function roundStarsFor(taps: number, ideal: number): number {
  const extra = Math.max(0, taps - ideal);
  if (extra === 0) return 3;
  if (extra <= 1) return 2;
  return 1;
}

function overallStars(perfectCount: number): number {
  if (perfectCount >= TOTAL - 1) return 3;
  if (perfectCount >= Math.ceil(TOTAL / 2)) return 2;
  return 1;
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [targetIndex, setTargetIndex] = useState(0);
  const [pot, setPot] = useState<Paint[]>([]);
  const [tapsThisRound, setTapsThisRound] = useState(0);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [perfectStreak, setPerfectStreak] = useState(0);
  const [perfectSolves, setPerfectSolves] = useState(0);

  const [resolving, setResolving] = useState(false);
  const [potFull, setPotFull] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const [solvedName, setSolvedName] = useState<string | null>(null);
  const [roundStars, setRoundStars] = useState(0);
  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);

  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [finalStars, setFinalStars] = useState(0);

  const timers = useRef<number[]>([]);

  // Load the persisted best after mount (SSR-safe, deferred past hydration).
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Drop any pending timers if the player leaves mid-celebration.
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  function schedule(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  }

  function clearTimers(): void {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }

  const target = TARGETS[targetIndex];
  const potMix: Mix = mix(pot);

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setPerfectStreak(0);
    setPerfectSolves(0);
    setTargetIndex(0);
    setPot([]);
    setTapsThisRound(0);
    setResolving(false);
    setPotFull(false);
    setSolvedName(null);
    setNewBest(false);
    setFinalStars(0);
    setPhase("playing");
  }

  function endGame(finalScore: number, finalPerfect: number): void {
    setPhase("over");
    const isBest = recordBest(SLUG, finalScore);
    const stars = overallStars(finalPerfect);
    setFinalStars(stars);
    setStars(SLUG, stars);
    setNewBest(isBest);
    if (isBest) {
      setBest(finalScore);
      setBurst((b) => b + 1);
    }
    sfx.win();
  }

  function advance(): void {
    setTargetIndex((i) => i + 1);
    setPot([]);
    setTapsThisRound(0);
    setPotFull(false);
    setResolving(false);
    setSolvedName(null);
  }

  function solve(taps: number, solvedMix: Mix): void {
    setResolving(true);

    const extra = Math.max(0, taps - target.ideal);
    const perfect = extra === 0;
    const nextStreak = perfect ? perfectStreak + 1 : 0;
    const nextPerfect = perfect ? perfectSolves + 1 : perfectSolves;
    const pts = pointsFor(taps, target.ideal, nextStreak);
    const newScore = score + pts;

    setScore(newScore);
    setPerfectStreak(nextStreak);
    setPerfectSolves(nextPerfect);
    setRoundStars(roundStarsFor(taps, target.ideal));
    setLastPoints(pts);
    setSolvedName(solvedMix.name);
    setFloatKey((k) => k + 1);
    setBurst((b) => b + 1);

    sfx.correct();
    if (nextStreak >= 2) sfx.combo(nextStreak);

    const isLast = targetIndex >= TOTAL - 1;
    schedule(() => {
      if (isLast) endGame(newScore, nextPerfect);
      else advance();
    }, SOLVE_DELAY);
  }

  function handlePaint(paint: Paint): void {
    if (phase !== "playing" || resolving) return;
    if (pot.length >= MAX_POT) return;

    const newPot = [...pot, paint];
    const newTaps = tapsThisRound + 1;
    setPot(newPot);
    setTapsThisRound(newTaps);
    sfx.pop();

    const m = mix(newPot);
    if (m.name === target.mix.name) {
      solve(newTaps, m);
      return;
    }
    if (newPot.length >= MAX_POT) {
      setPotFull(true);
      setShakeKey((k) => k + 1);
      sfx.wrong();
    }
  }

  function clearPot(): void {
    if (resolving || pot.length === 0) return;
    sfx.click();
    setPot([]);
    setPotFull(false);
  }

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel
          score={score}
          best={best}
          stars={finalStars}
          perfect={perfectSolves}
          newBest={newBest}
          onPlay={startGame}
        />
      )}

      {phase === "playing" && (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white/90">
            <span>
              Colour {targetIndex + 1} / {TOTAL}
            </span>
          </div>

          <div className="flex min-h-[1.75rem] items-center">
            {perfectStreak >= 2 && (
              <div
                key={perfectStreak}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Perfect x{perfectStreak}
              </div>
            )}
          </div>

          <div className="flex w-full items-end justify-center gap-3">
            <Swatch
              label="Make"
              title={`${target.emoji} ${target.mix.name}`}
              hex={target.mix.hex}
              hint={`${target.ideal} paints`}
            />
            <div className="pb-8 text-3xl font-black text-white/80">{solvedName ? "✓" : "➜"}</div>
            <div className="relative">
              <Swatch
                label="Your Mix"
                title={pot.length === 0 ? "empty" : potMix.name}
                hex={pot.length === 0 ? null : potMix.hex}
                solved={Boolean(solvedName)}
                shakeKey={potFull ? shakeKey : 0}
              />
              {solvedName && (
                <span
                  key={floatKey}
                  className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2"
                >
                  <FloatScore>+{lastPoints}</FloatScore>
                </span>
              )}
            </div>
          </div>

          <ChipRow pot={pot} />

          {solvedName ? (
            <div className="flex min-h-[3.5rem] flex-col items-center gap-1">
              <div className="animate-pop-in text-lg font-black text-white drop-shadow">
                ✨ {solvedName}!
              </div>
              <StarRow value={roundStars} size="text-2xl" />
            </div>
          ) : (
            <div className="flex min-h-[3.5rem] items-center text-center text-sm font-bold text-white/80">
              {potFull ? "Pot's full! Tap Clear and try again 🧽" : "Tap paints to mix the colour"}
            </div>
          )}

          <div className="flex w-full max-w-xs justify-between">
            {PAINTS.map((p) => (
              <PaintBlob
                key={p.id}
                hex={p.hex}
                label={p.label}
                disabled={resolving || pot.length >= MAX_POT}
                onTap={() => handlePaint(p.id)}
              />
            ))}
          </div>

          <BigButton
            variant="ghost"
            onClick={clearPot}
            disabled={resolving || pot.length === 0}
            className={`!py-2.5 !text-lg ${potFull ? "animate-wiggle" : ""}`}
          >
            🧽 Clear Pot
          </BigButton>
        </div>
      )}
    </GameShell>
  );
}

function Swatch({
  label,
  title,
  hex,
  hint,
  solved = false,
  shakeKey = 0,
}: {
  label: string;
  title: string;
  hex: string | null;
  hint?: string;
  solved?: boolean;
  shakeKey?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-black uppercase tracking-widest text-white/80">{label}</span>
      <div
        key={shakeKey}
        className={`flex h-28 w-28 items-center justify-center rounded-3xl border-4 border-white/70 shadow-lg shadow-black/30 ${
          hex === null ? "border-dashed bg-white/10" : ""
        } ${solved ? "ring-4 ring-lime-300" : ""} ${shakeKey ? "animate-shake" : ""}`}
        style={hex ? { backgroundColor: hex } : undefined}
        aria-label={`${label} ${title}`}
      >
        {hex === null && <span className="text-4xl opacity-70">🎨</span>}
      </div>
      <span className="text-base font-black capitalize leading-tight text-white drop-shadow">
        {title}
      </span>
      {hint && <span className="text-[0.7rem] font-bold text-white/70">{hint}</span>}
    </div>
  );
}

function ChipRow({ pot }: { pot: Paint[] }) {
  const hexByPaint = new Map(PAINTS.map((p) => [p.id, p.hex] as const));
  return (
    <div className="flex h-7 items-center gap-2">
      {Array.from({ length: MAX_POT }, (_, i) => {
        const paint = pot[i];
        const hex = paint ? hexByPaint.get(paint) : undefined;
        return (
          <span
            key={i}
            className={`h-6 w-6 rounded-full border-2 ${
              hex ? "animate-pop-in border-white/80" : "border-white/30 bg-white/10"
            }`}
            style={hex ? { backgroundColor: hex } : undefined}
          />
        );
      })}
    </div>
  );
}

function PaintBlob({
  hex,
  label,
  disabled,
  onTap,
}: {
  hex: string;
  label: string;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        className="h-14 w-14 select-none rounded-full border-4 border-white/80 shadow-lg shadow-black/30 transition active:scale-90 disabled:opacity-50 disabled:active:scale-100"
        style={{ backgroundColor: hex }}
        aria-label={`Add ${label} paint`}
      />
      <span className="text-[0.65rem] font-bold text-white/90">{label}</span>
    </div>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🎨</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Color Mix</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Tap paints to mix the target colour! Red + Yellow = Orange, add White to lighten, Black to
        darken.
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        🎯 Match in the fewest paints for ⭐⭐⭐ and a Perfect streak!
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
  stars,
  perfect,
  newBest,
  onPlay,
}: {
  score: number;
  best: number;
  stars: number;
  perfect: number;
  newBest: boolean;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl">{newBest ? "🏆" : "🎨"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">All Mixed!</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-emerald-600">{score}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">points</div>
      <div className="mt-3 flex justify-center">
        <StarRow value={stars} />
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-500">
        {perfect}/{TOTAL} perfect &middot; Best {best}
      </div>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>🔁 Play Again</BigButton>
      </div>
    </Panel>
  );
}
