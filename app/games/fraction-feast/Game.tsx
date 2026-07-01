"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  genRound,
  starsFor,
  choiceCountFor,
  label,
  type Round,
  type FractionValue,
} from "./rounds";

const SLUG = "fraction-feast";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CORRECT_DELAY = 480;
const WRONG_DELAY = 1000;
const OVER_DELAY = 700;

const SLICE_COLOR = "#dc2626"; // shaded slice color (registry accent is a darker #b91c1c)
const CRUST_COLOR = "#fef3c7"; // unshaded slice — warm crust cream

type Phase = "ready" | "playing" | "over";
type ChoiceVisual = "idle" | "correct" | "wrong";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [wrongLabel, setWrongLabel] = useState<string | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const resolving = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

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

  function present(next: Round): void {
    setRound(next);
    setWrongLabel(null);
    setRevealAnswer(false);
    setFloatGain(0);
    resolving.current = false;
  }

  function loadNext(forCorrectCount: number, avoid: FractionValue): void {
    present(genRound(nextId.current++, forCorrectCount, avoid));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    present(genRound(nextId.current++, 0));
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

  function registerMiss(currentScore: number, choiceLabel: string, prevAnswer: FractionValue): void {
    sfx.wrong();
    setCombo(0);
    setWrongLabel(choiceLabel);
    setRevealAnswer(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(currentScore), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount, prevAnswer), WRONG_DELAY);
    }
  }

  function handleChoice(choice: FractionValue): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    const choiceLabel = label(choice);
    const answerLabel = label(round.answer);

    if (choiceLabel !== answerLabel) {
      registerMiss(score, choiceLabel, round.answer);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextScore = score + points;
    const nextCorrect = correctCount + 1;
    if (choiceCountFor(nextCorrect) > choiceCountFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setRevealAnswer(true);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    schedule(() => loadNext(nextCorrect, round.answer), CORRECT_DELAY);
  }

  function choiceVisual(choice: FractionValue): ChoiceVisual {
    const choiceLabel = label(choice);
    if (revealAnswer && round && choiceLabel === label(round.answer)) return "correct";
    if (wrongLabel === choiceLabel) return "wrong";
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
      <Confetti fire={burst} count={28} />

      {phase === "ready" && <ReadyPanel onPlay={startGame} />}

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

          <div className="text-center text-2xl font-black drop-shadow sm:text-3xl">
            How much pizza is shaded? 🍕
          </div>

          <Pizza key={round.id} fraction={round.answer} />

          <div className="relative flex w-full max-w-sm flex-wrap items-stretch justify-center gap-3">
            {round.choices.map((choice, index) => (
              <div
                key={`${round.id}-${label(choice)}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <ChoiceTile
                  fractionLabel={label(choice)}
                  visual={choiceVisual(choice)}
                  disabled={revealAnswer}
                  onTap={() => handleChoice(choice)}
                />
                {floatGain > 0 && label(round.answer) === label(choice) && (
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

/** A round pizza, divided into `denominator` slices with `numerator` of them shaded. */
function Pizza({ fraction }: { fraction: FractionValue }) {
  const { numerator, denominator } = fraction;
  const step = 360 / denominator;

  const sliceStops: string[] = [];
  for (let i = 0; i < denominator; i++) {
    const color = i < numerator ? SLICE_COLOR : CRUST_COLOR;
    sliceStops.push(`${color} ${i * step}deg ${(i + 1) * step}deg`);
  }
  const pieGradient = `conic-gradient(${sliceStops.join(", ")})`;
  // Thin white radial lines every slice boundary, layered on top of the pie.
  const dividerGradient = `repeating-conic-gradient(rgba(255,255,255,0.9) 0deg 2deg, transparent 2deg ${step}deg)`;

  const style: CSSProperties = {
    backgroundImage: `${dividerGradient}, ${pieGradient}`,
  };

  return (
    <div
      className="h-44 w-44 animate-pop-in rounded-full shadow-2xl shadow-black/30 ring-8 ring-amber-800/50"
      style={style}
      role="img"
      aria-label={`Pizza with ${numerator} of ${denominator} slices shaded`}
    />
  );
}

function ChoiceTile({
  fractionLabel,
  visual,
  disabled,
  onTap,
}: {
  fractionLabel: string;
  visual: ChoiceVisual;
  disabled: boolean;
  onTap: () => void;
}) {
  const feedback =
    visual === "correct"
      ? "ring-4 ring-lime-400 scale-[1.04]"
      : visual === "wrong"
        ? "ring-4 ring-rose-400 opacity-80 animate-shake"
        : "";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={fractionLabel}
      className={`relative flex min-h-16 w-24 select-none items-center justify-center rounded-2xl bg-white px-3 py-4 text-slate-900 shadow-lg shadow-black/20 transition active:scale-95 disabled:active:scale-100 ${feedback}`}
    >
      <span className="text-2xl font-black tracking-tight">{fractionLabel}</span>
      {visual !== "idle" && (
        <span className="absolute right-1 top-1 text-xl leading-none" aria-hidden>
          {visual === "correct" ? "✅" : "❌"}
        </span>
      )}
    </button>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">🍕</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Fraction Feast</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Some slices of the pizza are shaded — tap the fraction that matches how much is
        shaded!
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
      <div className="text-5xl">{newBest ? "🏆" : "🍕"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-red-600">{score}</div>
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
