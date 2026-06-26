"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import { genQuestion, levelFor, starsFor, type Question } from "./questions";

const SLUG = "math-pop";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;

const POP_DELAY = 150; // correct: time for the bubble to pop before next loads
const MISS_DELAY = 700; // wrong/timeout: time to shake + reveal the answer
const OVER_DELAY = 600; // last heart lost -> show the game-over panel

const BUBBLE_COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-violet-500",
] as const;

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type BubbleVisual = "idle" | "popped" | "wrong" | "correct";

const meta = getGame(SLUG);

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
    setQuestion(genQuestion(levelFor(forCorrectCount), nextId.current++));
    setPoppedIndex(null);
    setWrongIndex(null);
    setRevealAnswer(false);
    setShaking(false);
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
    if (phase !== "playing" || roundState !== "active" || !question) return;
    setRoundState("resolving");

    if (choice !== question.answer) {
      registerMiss(index);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
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
    if (roundState !== "active") return;
    setRoundState("resolving");
    registerMiss(null);
  }

  const heartsDisplay =
    "❤️".repeat(Math.max(0, hearts)) + "🤍".repeat(Math.max(0, START_HEARTS - hearts));

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
      <StatBadge label="Hearts" value={<span className="text-xl leading-none">{heartsDisplay}</span>} />
    </>
  );

  const bubbleVisual = (index: number, choice: number): BubbleVisual => {
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

          <div className="text-center text-4xl font-black tabular-nums drop-shadow sm:text-5xl">
            {question.text} = ?
          </div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={question.id}
              durationMs={question.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div
            className={`grid w-full max-w-xs grid-cols-2 gap-4 ${shaking ? "animate-shake" : ""}`}
          >
            {question.choices.map((choice, index) => (
              <div
                key={`${question.id}-${index}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <Bubble
                  value={choice}
                  color={BUBBLE_COLORS[index % BUBBLE_COLORS.length]}
                  visual={bubbleVisual(index, choice)}
                  disabled={roundState !== "active"}
                  delay={-index * 0.5}
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

function Bubble({
  value,
  color,
  visual,
  disabled,
  delay,
  onTap,
}: {
  value: number;
  color: string;
  visual: BubbleVisual;
  disabled: boolean;
  delay: number;
  onTap: () => void;
}) {
  const stateClass =
    visual === "popped"
      ? "scale-150 opacity-0 transition-all duration-200"
      : visual === "wrong"
        ? "scale-90 opacity-60 ring-red-300 transition-all duration-200"
        : visual === "correct"
          ? "scale-105 ring-8 ring-lime-300 transition-all duration-200"
          : "animate-bob active:scale-95";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      style={visual === "idle" ? { animationDelay: `${delay}s` } : undefined}
      className={`flex aspect-square w-full select-none items-center justify-center rounded-full ${color} text-4xl font-black tabular-nums text-white shadow-lg shadow-black/30 ring-4 ring-white/50 ${stateClass}`}
      aria-label={`Answer ${value}`}
    >
      {value}
    </button>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🫧</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Math Pop</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Pop the bubble with the right answer before the bar runs out. Keep a streak going for
        bonus points!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at 100 / 250 / 500 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🫧"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-blue-600">{score}</div>
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
