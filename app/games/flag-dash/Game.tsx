"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import { genQuestion, durationFor, starsFor, type Question } from "./questions";
import { COUNTRIES, type Country } from "./data";

const SLUG = "flag-dash";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const SPEED_BONUS_MAX = 10; // extra points for answering with time to spare
const MAX_MULTIPLIER = 5;

const CORRECT_DELAY = 240; // green tick shows, then the next flag loads
const MISS_DELAY = 850; // shake + reveal the right country
const OVER_DELAY = 650; // last heart lost -> show the game-over panel

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type ChoiceVisual = "idle" | "correct" | "wrong";

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

  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const roundStart = useRef(0);
  // Flags already shown this run — a flag won't reappear until all have been seen.
  const usedNames = useRef<string[]>([]);

  // Build the next question, drawing the flag from the not-yet-seen pool and
  // starting a fresh cycle once every flag has been shown.
  function makeQuestion(forCorrectCount: number, avoidName?: string): Question {
    if (usedNames.current.length >= COUNTRIES.length) usedNames.current = [];
    const q = genQuestion(forCorrectCount, nextId.current++, usedNames.current, avoidName);
    usedNames.current.push(q.answer.name);
    return q;
  }

  // Load the persisted best after mount (SSR-safe) so the server and first
  // client render agree, then update once localStorage is available.
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

  function loadNext(forCorrectCount: number, avoidName?: string): void {
    setQuestion(makeQuestion(forCorrectCount, avoidName));
    setWrongIndex(null);
    setRevealAnswer(false);
    setShaking(false);
    setFloatGain(0);
    roundStart.current = Date.now();
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
    setWrongIndex(null);
    setRevealAnswer(false);
    setShaking(false);
    setFloatGain(0);
    roundStart.current = Date.now();
    usedNames.current = [];
    setQuestion(makeQuestion(0));
    setRoundState("active");
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
    setFloatGain(0);
    setWrongIndex(wrongIdx);
    setRevealAnswer(true);
    setShaking(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount, question?.answer.name), MISS_DELAY);
    }
  }

  function speedBonus(durationMs: number): number {
    const elapsed = Date.now() - roundStart.current;
    const remaining = Math.min(1, Math.max(0, 1 - elapsed / durationMs));
    return Math.round(remaining * SPEED_BONUS_MAX);
  }

  function handleAnswer(country: Country, index: number): void {
    if (phase !== "playing" || roundState !== "active" || !question) return;
    setRoundState("resolving");

    if (country.name !== question.answer.name) {
      registerMiss(index);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);

    const multiplier = Math.min(nextCombo, MAX_MULTIPLIER);
    const points = (BASE_POINTS + speedBonus(question.durationMs)) * multiplier;
    const nextCorrect = correctCount + 1;
    if (durationFor(nextCorrect) < durationFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    setRevealAnswer(true);
    schedule(() => loadNext(nextCorrect, question.answer.name), CORRECT_DELAY);
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
      <StatBadge
        label="Hearts"
        value={<span className="text-xl leading-none">{heartsDisplay}</span>}
      />
    </>
  );

  function choiceVisual(index: number, country: Country): ChoiceVisual {
    if (revealAnswer && question && country.name === question.answer.name) return "correct";
    if (wrongIndex === index) return "wrong";
    return "idle";
  }

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

          <div
            key={question.id}
            className="flex h-32 w-44 animate-pop-in items-center justify-center rounded-3xl bg-white/95 shadow-2xl shadow-black/30"
          >
            <span className="text-7xl leading-none drop-shadow" aria-hidden>
              {question.answer.flag}
            </span>
          </div>

          <div className="text-2xl font-black drop-shadow">Which country?</div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={question.id}
              durationMs={question.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div
            className={`grid w-full max-w-xs grid-cols-1 gap-3 ${shaking ? "animate-shake" : ""}`}
          >
            {question.choices.map((country, index) => (
              <div
                key={`${question.id}-${index}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <ChoiceButton
                  name={country.name}
                  visual={choiceVisual(index, country)}
                  onTap={() => handleAnswer(country, index)}
                />
                {floatGain > 0 && country.name === question.answer.name && (
                  <span
                    key={floatKey}
                    className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
                  >
                    <FloatScore>+{floatGain}</FloatScore>
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

function ChoiceButton({
  name,
  visual,
  onTap,
}: {
  name: string;
  visual: ChoiceVisual;
  onTap: () => void;
}) {
  const feedback =
    visual === "correct"
      ? "ring-8 ring-lime-400 scale-[1.03]"
      : visual === "wrong"
        ? "ring-8 ring-rose-400 opacity-80"
        : "";

  return (
    <BigButton onClick={onTap} className={`w-full text-center ${feedback}`}>
      <span className="flex items-center justify-center gap-2">
        {visual === "correct" && <span aria-hidden>✅</span>}
        {visual === "wrong" && <span aria-hidden>❌</span>}
        <span>{name}</span>
      </span>
    </BigButton>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🌍</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Flag Dash</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        See the flag, tap the country before the bar runs out. Answer fast and keep a streak for
        bonus points!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at 80 / 200 / 400 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🌍"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-orange-600">{score}</div>
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
