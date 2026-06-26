"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import CountTimerBar from "./CountTimerBar";
import {
  genRound,
  levelFor,
  starsFor,
  emojiSizeFor,
  type Round,
} from "./rounds";

const SLUG = "count-it";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_SPEED_BONUS = 10;
const MAX_MULTIPLIER = 5;

const CORRECT_DELAY = 450; // correct: let the pop + float play before next loads
const MISS_DELAY = 850; // wrong/timeout: shake + reveal the right number
const OVER_DELAY = 600; // last heart lost -> show the game-over panel

const meta = getGame(SLUG);

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
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
  const [shaking, setShaking] = useState(false);

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const roundStart = useRef(0);
  const timers = useRef<number[]>([]);
  // Synchronous lock so a round resolves exactly once, even against a same-frame
  // double-tap or a timeout firing in the gap before the pause effect commits.
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
    setShaking(false);
    setRoundState("active");
    resolving.current = false;
    roundStart.current = Date.now();
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
    setShaking(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount), MISS_DELAY);
    }
  }

  function speedBonus(durationMs: number): number {
    const elapsed = Date.now() - roundStart.current;
    const frac = Math.max(0, Math.min(1, 1 - elapsed / durationMs));
    return Math.round(frac * MAX_SPEED_BONUS);
  }

  function handleAnswer(choice: number): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    setRoundState("resolving");

    if (choice !== round.count) {
      registerMiss(choice);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);
    const multiplier = Math.min(nextCombo, MAX_MULTIPLIER);
    const points = (BASE_POINTS + speedBonus(round.durationMs)) * multiplier;
    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    setChosenValue(choice);
    schedule(() => loadNext(nextCorrect), CORRECT_DELAY);
  }

  function handleTimeout(): void {
    if (resolving.current) return;
    resolving.current = true;
    setRoundState("resolving");
    registerMiss(null);
  }

  function choiceClass(choice: number): string {
    if (!round) return "";
    const isAnswer = choice === round.count;
    if (chosenValue === choice && isAnswer) {
      return "scale-105 ring-8 ring-lime-400";
    }
    if (revealAnswer && isAnswer) {
      return "ring-8 ring-lime-400";
    }
    if (wrongValue === choice) {
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
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full flex-col items-center gap-4">
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

          <div className="text-center text-3xl font-black drop-shadow sm:text-4xl">
            How many? 🔢
          </div>

          <ClusterBoard round={round} />

          <div className="w-full max-w-xs px-2">
            <CountTimerBar
              roundId={round.id}
              durationMs={round.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div
            className={`grid w-full max-w-xs grid-cols-2 gap-3 ${
              shaking ? "animate-shake" : ""
            }`}
          >
            {round.choices.map((choice, index) => (
              <div
                key={`${round.id}-${index}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <BigButton
                  type="button"
                  onClick={() => handleAnswer(choice)}
                  disabled={roundState !== "active"}
                  className={`w-full tabular-nums transition-all duration-200 ${choiceClass(
                    choice
                  )}`}
                  aria-label={`Count is ${choice}`}
                >
                  <span className="text-4xl font-black">{choice}</span>
                </BigButton>
                {chosenValue === choice && choice === round.count && (
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

function ClusterBoard({ round }: { round: Round }) {
  const sizeClass = emojiSizeFor(round.count);
  return (
    <div
      key={round.id}
      className="flex w-full max-w-xs animate-pop-in flex-wrap items-center justify-center gap-2 overflow-hidden rounded-3xl bg-white/15 p-4 ring-2 ring-white/30"
      role="img"
      aria-label="objects to count"
    >
      {round.jitter.map((j, i) => (
        <span
          key={i}
          className={`${sizeClass} leading-none select-none`}
          style={{
            transform: `translate(${j.dx}px, ${j.dy}px) rotate(${j.rot}deg)`,
          }}
          aria-hidden
        >
          {round.emoji}
        </span>
      ))}
    </div>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🔢</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Count It</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Count the things and tap the right number before the bar runs out. Answer fast
        and keep a streak for bonus points!
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
      <div className="text-5xl">{newBest ? "🏆" : "🔢"}</div>
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
