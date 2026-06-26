"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import AnalogClock from "./AnalogClock";
import {
  genQuestion,
  levelFor,
  starsFor,
  formatTime,
  type Question,
  type Time,
} from "./questions";

const SLUG = "clock-quest";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const MAX_SPEED_BONUS = 10;

const POP_DELAY = 280; // correct: linger on the green answer before next clock
const MISS_DELAY = 900; // wrong/timeout: time to shake + reveal the right time
const OVER_DELAY = 650; // last heart lost -> show the game-over panel

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type Result = "correct" | "wrong" | null;
type AnswerVisual = "idle" | "correct" | "wrong";

const meta = getGame(SLUG);

function sameTime(a: Time, b: Time): boolean {
  return a.hour === b.hour && a.minute === b.minute;
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

  const [picked, setPicked] = useState<Time | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const questionStartedAt = useRef(0);

  // Load the persisted best after mount (SSR-safe), deferred to avoid a
  // synchronous-setState-in-effect cascade during hydration.
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
    setPicked(null);
    setRevealAnswer(false);
    setShaking(false);
    setResult(null);
    setRoundState("active");
    questionStartedAt.current = performance.now();
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    setPicked(null);
    setRevealAnswer(false);
    setShaking(false);
    setResult(null);
    setRoundState("active");
    setQuestion(genQuestion(0, nextId.current++));
    questionStartedAt.current = performance.now();
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

  function registerMiss(): void {
    sfx.wrong();
    setCombo(0);
    setResult("wrong");
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

  function handleAnswer(choice: Time): void {
    if (phase !== "playing" || roundState !== "active" || !question) return;
    setRoundState("resolving");
    setPicked(choice);

    if (!sameTime(choice, question.time)) {
      registerMiss();
      return;
    }

    sfx.pop();
    sfx.correct();

    const elapsed = performance.now() - questionStartedAt.current;
    const remainingFrac = Math.max(0, Math.min(1, 1 - elapsed / question.durationMs));
    const speedBonus = Math.round(remainingFrac * MAX_SPEED_BONUS);

    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);
    const multiplier = Math.min(nextCombo, MAX_MULTIPLIER);
    const points = (BASE_POINTS + speedBonus) * multiplier;

    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    setResult("correct");
    setRevealAnswer(true);
    schedule(() => loadNext(nextCorrect), POP_DELAY);
  }

  function handleTimeout(): void {
    if (roundState !== "active") return;
    setRoundState("resolving");
    registerMiss();
  }

  function answerVisual(choice: Time): AnswerVisual {
    if (!revealAnswer || !question) return "idle";
    if (sameTime(choice, question.time)) return "correct";
    if (picked && sameTime(picked, choice)) return "wrong";
    return "idle";
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

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && question && (
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex min-h-[2.25rem] items-center justify-center">
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          <div className="text-center text-2xl font-black drop-shadow sm:text-3xl">
            What time is it?
          </div>

          <div className="relative w-full max-w-[15rem]">
            <div className={shaking ? "animate-shake" : ""}>
              <AnalogClock time={question.time} />
            </div>
            {result === "correct" && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2"
              >
                <FloatScore>+{lastPoints}</FloatScore>
              </span>
            )}
          </div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={question.id}
              durationMs={question.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div className="grid w-full max-w-xs grid-cols-2 gap-3">
            {question.choices.map((choice, index) => (
              <AnswerButton
                key={`${question.id}-${index}`}
                label={formatTime(choice)}
                visual={answerVisual(choice)}
                disabled={roundState !== "active"}
                delay={index * 0.05}
                onTap={() => handleAnswer(choice)}
              />
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

function AnswerButton({
  label,
  visual,
  disabled,
  delay,
  onTap,
}: {
  label: string;
  visual: AnswerVisual;
  disabled: boolean;
  delay: number;
  onTap: () => void;
}) {
  const feedback =
    visual === "correct"
      ? "scale-105 ring-4 ring-lime-400"
      : visual === "wrong"
        ? "opacity-70 ring-4 ring-rose-400"
        : "";

  return (
    <div className="animate-pop-in" style={{ animationDelay: `${delay}s` }}>
      <BigButton
        onClick={onTap}
        disabled={disabled}
        className={`w-full tabular-nums ${feedback}`}
        aria-label={`Answer ${label}`}
      >
        {label}
      </BigButton>
    </div>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🕐</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Clock Quest</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Read the clock and tap the matching time before the bar runs out. Answer fast and keep
        a streak for bonus points!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at 120 / 300 / 600 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🕐"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-indigo-600">{score}</div>
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
