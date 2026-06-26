"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import { genQuestion, levelFor, type Question } from "./questions";
import { pointsFor, starsFor, MAX_MULTIPLIER, STAR_THRESHOLDS } from "./scoring";

const SLUG = "times-tiles";
const START_HEARTS = 3;

const POP_DELAY = 150; // correct: time for the tile to pop before next loads
const MISS_DELAY = 700; // wrong/timeout: time to shake + reveal the answer
const OVER_DELAY = 600; // last heart lost -> show the game-over panel

const TILE_COLORS = [
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-emerald-500",
] as const;

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type TileVisual = "idle" | "popped" | "wrong" | "correct";

const meta = getGame(SLUG);

/**
 * Wall-clock read for the speed bonus, isolated in a plain module function so it
 * is only ever evaluated inside event handlers / timer callbacks — never during
 * render. (Keeps the React purity lint honest about Date.now.)
 */
function nowMs(): number {
  return Date.now();
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [question, setQuestion] = useState<Question | null>(null);
  const [roundState, setRoundState] = useState<RoundState>("active");

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  // The real double-tap gate: ref so two taps in the same frame can't both pass
  // (render-closure state would still read "active" before React re-renders).
  const resolvingRef = useRef(false);
  // When the current question's timer started, for the speed bonus.
  const questionStartRef = useRef(0);

  // Load the persisted best after mount (SSR-safe). Deferred so the read happens
  // post-hydration without a synchronous-setState-in-effect cascade.
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Clear any pending timeouts if the player leaves mid-round.
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

  function loadNext(forCorrectCount: number): void {
    setQuestion(genQuestion(forCorrectCount, nextId.current++));
    setPoppedIndex(null);
    setWrongIndex(null);
    setRevealAnswer(false);
    setShaking(false);
    questionStartRef.current = nowMs();
    resolvingRef.current = false;
    setRoundState("active");
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    setPoppedIndex(null);
    setWrongIndex(null);
    setRevealAnswer(false);
    setShaking(false);
    questionStartRef.current = nowMs();
    resolvingRef.current = false;
    setRoundState("active");
    setQuestion(genQuestion(0, nextId.current++));
    setPhase("playing");
  }

  function endGame(finalScore: number): void {
    setPhase("over");
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
  }

  function registerMiss(wrongIdx: number | null): void {
    sfx.wrong();
    setCombo(0);
    setWrongIndex(wrongIdx);
    setRevealAnswer(true);
    setShaking(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount), MISS_DELAY);
    }
  }

  function handleAnswer(choice: number, index: number): void {
    if (phase !== "playing" || resolvingRef.current || !question) return;
    resolvingRef.current = true;
    setRoundState("resolving");

    if (choice !== question.answer) {
      registerMiss(index);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);

    const elapsed = nowMs() - questionStartRef.current;
    const remainingFraction = 1 - elapsed / question.durationMs;
    const points = pointsFor(nextCombo, remainingFraction);

    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    setPoppedIndex(index);
    schedule(() => loadNext(nextCorrect), POP_DELAY);
  }

  function handleTimeout(): void {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setRoundState("resolving");
    registerMiss(null);
  }

  const heartsDisplay =
    "❤️".repeat(Math.max(0, hearts)) + "🤍".repeat(Math.max(0, START_HEARTS - hearts));

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

  const tileVisual = (index: number, choice: number): TileVisual => {
    if (poppedIndex === index) return "popped";
    if (revealAnswer && question && choice === question.answer) return "correct";
    if (wrongIndex === index) return "wrong";
    return "idle";
  };

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && question && (
        <div className="flex w-full flex-col items-center gap-5">
          <div className="flex min-h-[2.25rem] flex-col items-center gap-1">
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          <div className="text-center text-5xl font-black tabular-nums drop-shadow sm:text-6xl">
            {question.text}
          </div>
          <div className="-mt-2 text-2xl font-black opacity-80">= ?</div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={question.id}
              durationMs={question.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div
            className={`grid w-full max-w-xs grid-cols-2 gap-4 ${
              shaking ? "animate-shake" : ""
            }`}
          >
            {question.choices.map((choice, index) => (
              <div
                key={`${question.id}-${index}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <Tile
                  value={choice}
                  color={TILE_COLORS[index % TILE_COLORS.length]}
                  visual={tileVisual(index, choice)}
                  disabled={roundState !== "active"}
                  onTap={() => handleAnswer(choice, index)}
                />
                {poppedIndex === index && (
                  <span
                    key={floatKey}
                    className="pointer-events-none absolute left-1/2 top-1/4 z-10 -translate-x-1/2"
                  >
                    <FloatScore>+{lastPoints}</FloatScore>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

function Tile({
  value,
  color,
  visual,
  disabled,
  onTap,
}: {
  value: number;
  color: string;
  visual: TileVisual;
  disabled: boolean;
  onTap: () => void;
}) {
  const stateClass =
    visual === "popped"
      ? "scale-110 opacity-0 transition-all duration-200"
      : visual === "wrong"
        ? "scale-90 opacity-60 ring-red-300 transition-all duration-200"
        : visual === "correct"
          ? "scale-105 ring-8 ring-lime-300 transition-all duration-200"
          : "active:scale-95";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`flex aspect-square w-full select-none items-center justify-center rounded-3xl ${color} text-5xl font-black tabular-nums text-white shadow-lg shadow-black/30 ring-4 ring-white/40 ${stateClass}`}
      aria-label={`Answer ${value}`}
    >
      {value}
    </button>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🧮</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Times Tiles</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Tap the tile with the right answer before the bar runs out. Answer fast and keep
        a streak for bonus points!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at {STAR_THRESHOLDS[0]} / {STAR_THRESHOLDS[1]} /{" "}
        {STAR_THRESHOLDS[2]} pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🧮"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-cyan-600">{score}</div>
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
