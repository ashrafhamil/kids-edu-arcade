"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, levelFor, starsFor, type Round, type Target } from "./rounds";
import TimerBar from "./TimerBar";

const SLUG = "big-number";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CORRECT_DELAY = 380; // correct: let the pop + float play before next loads
const MISS_DELAY = 720; // wrong: shake the tapped card + reveal the right one
const OVER_DELAY = 620; // last heart lost -> show the game-over panel

const meta = getGame(SLUG);

type Phase = "ready" | "playing" | "over";
type RoundState = "active" | "resolving";

function targetWord(target: Target): string {
  return target === "bigger" ? "BIGGER" : "SMALLER";
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [roundState, setRoundState] = useState<RoundState>("active");

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [chosenValue, setChosenValue] = useState<number | null>(null);
  const [wrongValue, setWrongValue] = useState<number | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  // Synchronous lock so a round resolves exactly once, even against a same-frame
  // double-tap before the disabled/pause state commits.
  const resolving = useRef(false);

  // Load the persisted best after mount (SSR-safe), deferred to post-hydration.
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

  function presentRound(next: Round): void {
    setRound(next);
    setChosenValue(null);
    setWrongValue(null);
    setRevealAnswer(false);
    setRoundState("active");
    resolving.current = false;
  }

  function loadNext(forCorrectCount: number): void {
    presentRound(genRound(levelFor(forCorrectCount), nextId.current++));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    setLastPoints(0);
    presentRound(genRound(0, nextId.current++));
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

  function registerMiss(wrongVal: number | null): void {
    sfx.wrong();
    setCombo(0);
    setWrongValue(wrongVal);
    setRevealAnswer(true);
    setShakeKey((k) => k + 1);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount), MISS_DELAY);
    }
  }

  function registerHit(): void {
    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const multiplier = Math.min(nextCombo, MAX_MULTIPLIER);
    const points = BASE_POINTS * multiplier;
    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    setRevealAnswer(true);
    schedule(() => loadNext(nextCorrect), CORRECT_DELAY);
  }

  function handleAnswer(value: number): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    setRoundState("resolving");
    setChosenValue(value);

    if (value === round.answer) {
      registerHit();
    } else {
      registerMiss(value);
    }
  }

  function handleTimeout(): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    setRoundState("resolving");
    registerMiss(null);
  }

  function cardClass(value: number): string {
    if (!round) return "";
    const isAnswer = value === round.answer;
    if (chosenValue === value && isAnswer) {
      return "scale-105 ring-8 ring-lime-400";
    }
    if (revealAnswer && isAnswer) {
      return "ring-8 ring-lime-400";
    }
    if (wrongValue === value) {
      return "scale-95 opacity-60 ring-8 ring-rose-400";
    }
    return "";
  }

  const heartsDisplay =
    "❤️".repeat(Math.max(0, hearts)) +
    "🤍".repeat(Math.max(0, START_HEARTS - hearts));

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

      {phase === "ready" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full flex-col items-center gap-5">
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

          <TargetPrompt target={round.target} />

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id}
              durationMs={round.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div className="grid w-full max-w-md grid-cols-2 gap-4">
            <NumberCard
              value={round.left}
              shakeKey={shakeKey}
              isWrong={wrongValue === round.left}
              feedback={cardClass(round.left)}
              disabled={roundState !== "active"}
              showFloat={chosenValue === round.left && round.left === round.answer}
              floatKey={floatKey}
              lastPoints={lastPoints}
              onTap={() => handleAnswer(round.left)}
            />
            <NumberCard
              value={round.right}
              shakeKey={shakeKey}
              isWrong={wrongValue === round.right}
              feedback={cardClass(round.right)}
              disabled={roundState !== "active"}
              showFloat={chosenValue === round.right && round.right === round.answer}
              floatKey={floatKey}
              lastPoints={lastPoints}
              onTap={() => handleAnswer(round.right)}
            />
          </div>
        </div>
      )}
    </GameShell>
  );
}

function TargetPrompt({ target }: { target: Target }) {
  const word = targetWord(target);
  const arrow = target === "bigger" ? "⬆️" : "⬇️";
  const pill =
    target === "bigger"
      ? "bg-emerald-400 text-emerald-950"
      : "bg-sky-400 text-sky-950";
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="text-lg font-black uppercase tracking-widest opacity-90 drop-shadow">
        Tap the
      </div>
      <div
        key={word}
        className={`animate-pop-in rounded-2xl px-6 py-2 text-4xl font-black tracking-tight shadow-lg sm:text-5xl ${pill}`}
      >
        {arrow} {word}
      </div>
    </div>
  );
}

function NumberCard({
  value,
  shakeKey,
  isWrong,
  feedback,
  disabled,
  showFloat,
  floatKey,
  lastPoints,
  onTap,
}: {
  value: number;
  shakeKey: number;
  isWrong: boolean;
  feedback: string;
  disabled: boolean;
  showFloat: boolean;
  floatKey: number;
  lastPoints: number;
  onTap: () => void;
}) {
  return (
    <div
      // Re-key on a miss so the shake animation replays on the tapped card.
      key={isWrong ? `shake-${shakeKey}` : "still"}
      className={`relative ${isWrong ? "animate-shake" : ""}`}
    >
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-label={`Number ${value}`}
        className={`flex h-40 w-full select-none items-center justify-center rounded-3xl bg-white text-slate-900 shadow-lg shadow-black/20 transition duration-200 active:scale-95 disabled:active:scale-100 sm:h-48 ${feedback}`}
      >
        <span className="text-6xl font-black tabular-nums sm:text-7xl">{value}</span>
      </button>
      {showFloat && (
        <span
          key={floatKey}
          className="pointer-events-none absolute left-1/2 top-1/4 z-10 -translate-x-1/2"
        >
          <FloatScore>+{lastPoints}</FloatScore>
        </span>
      )}
    </div>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="animate-bob text-6xl">🐘</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Big Number</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Two numbers pop up. Read the word, then tap the one that is bigger — or
        smaller when it asks!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 hearts &middot; ⭐ at 80 / 200 / 400 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🐘"}</div>
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
