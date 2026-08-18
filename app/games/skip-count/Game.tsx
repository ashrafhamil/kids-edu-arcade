"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, levelFor, starsFor, type Round } from "./rounds";
import TimerBar from "./TimerBar";

const SLUG = "skip-count";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CORRECT_DELAY = 520;
const WRONG_DELAY = 1200; // longer: the child reads the revealed number
const OVER_DELAY = 700;

// Sequence slots at 54px + 6px gaps fit five terms inside a 360px phone
// (328px usable in GameShell, minus the row's own padding).
const SLOT_PX = 54;

type Phase = "ready" | "playing" | "over";
type SlotVisual = "term" | "gap" | "revealed";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [wrongChoice, setWrongChoice] = useState<number | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const lastStep = useRef<number | undefined>(undefined);
  const timers = useRef<number[]>([]);
  // Synchronous lock so a round resolves exactly once, even on a double-tap.
  const resolving = useRef(false);

  // Load the persisted best after mount (SSR-safe), deferred past hydration.
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

  function present(next: Round): void {
    setRound(next);
    setWrongChoice(null);
    setRevealAnswer(false);
    setFloatGain(0);
    lastStep.current = next.step;
    resolving.current = false;
  }

  function loadNext(forCorrectCount: number): void {
    present(genRound(levelFor(forCorrectCount), nextId.current++, lastStep.current));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    lastStep.current = undefined;
    present(genRound(0, nextId.current++));
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

  function registerMiss(currentScore: number, choice: number | null): void {
    sfx.wrong();
    setCombo(0);
    setWrongChoice(choice);
    setRevealAnswer(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(currentScore), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount), WRONG_DELAY);
    }
  }

  function handleChoice(choice: number): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;

    if (choice !== round.answer) {
      registerMiss(score, choice);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextScore = score + points;
    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setRevealAnswer(true);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    schedule(() => loadNext(nextCorrect), CORRECT_DELAY);
  }

  function handleTimeout(): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    registerMiss(score, null);
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
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex min-h-[2.25rem] items-center justify-center gap-2">
            <span className="rounded-full bg-white/25 px-3 py-1 text-sm font-black uppercase tracking-widest">
              Level {levelFor(correctCount) + 1}
            </span>
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          <div className="relative flex w-full justify-center">
            <SequenceRow round={round} revealed={revealAnswer} />
            {floatGain > 0 && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
              >
                <FloatScore>+{floatGain}</FloatScore>
              </span>
            )}
          </div>

          <div className="text-2xl font-black drop-shadow">Which number is missing?</div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id}
              durationMs={round.durationMs}
              paused={revealAnswer}
              onTimeout={handleTimeout}
            />
          </div>

          <div className="grid w-full max-w-xs grid-cols-2 gap-3">
            {round.choices.map((choice, index) => (
              <ChoiceTile
                key={`${round.id}-${choice}`}
                index={index}
                value={choice}
                visual={
                  revealAnswer && choice === round.answer
                    ? "correct"
                    : wrongChoice === choice
                      ? "wrong"
                      : "idle"
                }
                disabled={revealAnswer}
                onTap={() => handleChoice(choice)}
              />
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** The sequence, one number per slot, with the hidden term shown as "?". */
function SequenceRow({ round, revealed }: { round: Round; revealed: boolean }) {
  return (
    <div
      key={round.id}
      className="flex animate-pop-in items-center justify-center gap-1.5 rounded-3xl bg-white/15 p-3 ring-2 ring-white/30"
      role="img"
      aria-label={`counting by ${round.step}, one number missing`}
    >
      {round.terms.map((term, index) => {
        const isGap = index === round.gapIndex;
        const visual: SlotVisual = !isGap ? "term" : revealed ? "revealed" : "gap";
        return <SequenceSlot key={index} value={term} visual={visual} />;
      })}
    </div>
  );
}

/** One fixed-size cell of the sequence row. */
function SequenceSlot({ value, visual }: { value: number; visual: SlotVisual }) {
  const skin =
    visual === "revealed"
      ? "bg-lime-400/25 ring-2 ring-lime-400"
      : visual === "gap"
        ? "border-2 border-dashed border-white/70 bg-white/10"
        : "bg-white/90 text-slate-900";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl text-2xl font-black tabular-nums ${skin}`}
      style={{ width: SLOT_PX, height: SLOT_PX }}
    >
      {visual === "gap" ? (
        <span aria-hidden>❓</span>
      ) : (
        <span className={visual === "revealed" ? "animate-pop-in" : ""}>{value}</span>
      )}
    </div>
  );
}

/** One tappable number, highlighted green/red once the round resolves. */
function ChoiceTile({
  index,
  value,
  visual,
  disabled,
  onTap,
}: {
  index: number;
  value: number;
  visual: "idle" | "correct" | "wrong";
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
      aria-label={String(value)}
      style={{ animationDelay: `${index * 0.05}s` }}
      className={`relative flex min-h-16 animate-pop-in select-none items-center justify-center rounded-2xl bg-white px-2 py-3 text-4xl font-black tabular-nums text-slate-900 shadow-lg shadow-black/20 transition active:scale-95 disabled:active:scale-100 ${feedback}`}
    >
      {value}
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
      <div className="animate-bob text-6xl">🦘</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Skip Count</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Numbers hop along by 2s, 5s, 10s or 3s — tap the number that fills the ❓ gap!
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
      <div className="text-5xl">{newBest ? "🏆" : "🦘"}</div>
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
