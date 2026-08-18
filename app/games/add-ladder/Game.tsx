"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  genQuestion,
  levelFor,
  rungFor,
  starsFor,
  RUNGS_PER_LEVEL,
  type Question,
} from "./rounds";
import TimerBar from "./TimerBar";

const SLUG = "add-ladder";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CLIMB_MS = 400; // how long the sprite takes to slide up one rung
const CORRECT_DELAY = 520; // let the climb land before the next question loads
const WRONG_DELAY = 1000; // shake + reveal the right answer
const LEVEL_DELAY = 1100; // celebrate the top rung before the ladder resets
const OVER_DELAY = 700; // last heart lost -> game-over panel

// Ladder geometry, in px. Ten short rungs keep the whole column at 248px so the
// question and choices beside it always fit a 360x568 phone without scrolling.
const RUNG_GAP = 22;
const SPRITE_SIZE = 28;
const LADDER_HEIGHT = RUNGS_PER_LEVEL * RUNG_GAP + SPRITE_SIZE;

type Phase = "ready" | "playing" | "over";
type ChoiceVisual = "idle" | "correct" | "wrong";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [question, setQuestion] = useState<Question | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [rung, setRung] = useState(0);

  const [wrongChoice, setWrongChoice] = useState<number | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const resolving = useRef(false);

  // Read the persisted best after mount so the server render stays deterministic.
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Drop any pending timeouts if the player leaves mid-round.
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

  function present(next: Question): void {
    setQuestion(next);
    setWrongChoice(null);
    setRevealAnswer(false);
    setFloatGain(0);
    resolving.current = false;
  }

  function loadNext(forCorrectCount: number, avoidText: string): void {
    present(genQuestion(levelFor(forCorrectCount), nextId.current++, avoidText));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setRung(0);
    setNewBest(false);
    present(genQuestion(0, nextId.current++));
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

  /** A miss costs a heart; the climber holds its rung. */
  function registerMiss(choice: number | null, prevText: string): void {
    sfx.wrong();
    setCombo(0);
    setWrongChoice(choice);
    setRevealAnswer(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount, prevText), WRONG_DELAY);
    }
  }

  /** A hit moves the climber up one rung, and clears the ladder every tenth one. */
  function registerHit(prevText: string): void {
    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextCorrect = correctCount + 1;
    const nextRung = rungFor(nextCorrect);
    const ladderCleared = nextRung === RUNGS_PER_LEVEL;

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setRung(nextRung);
    setRevealAnswer(true);
    setFloatGain(points);
    setFloatKey((k) => k + 1);

    if (!ladderCleared) {
      sfx.pop();
      sfx.correct();
      schedule(() => loadNext(nextCorrect, prevText), CORRECT_DELAY);
      return;
    }

    sfx.levelUp();
    setBurst((b) => b + 1);
    // One callback resets the ladder and loads the next question, so the frozen
    // round can never resolve twice during the celebration.
    schedule(() => {
      setRung(0);
      loadNext(nextCorrect, prevText);
    }, LEVEL_DELAY);
  }

  function handleChoice(choice: number): void {
    if (phase !== "playing" || !question || resolving.current) return;
    resolving.current = true;

    if (choice === question.answer) registerHit(question.text);
    else registerMiss(choice, question.text);
  }

  function handleTimeout(): void {
    if (phase !== "playing" || !question || resolving.current) return;
    resolving.current = true;
    registerMiss(null, question.text);
  }

  function choiceVisual(choice: number): ChoiceVisual {
    if (revealAnswer && question && choice === question.answer) return "correct";
    if (wrongChoice === choice) return "wrong";
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

      {phase === "playing" && question && (
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
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

          <div className="flex w-full items-center justify-center gap-3">
            <Ladder rung={rung} level={levelFor(correctCount)} />

            <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <div
                key={question.id}
                className="animate-pop-in text-center text-3xl font-black tabular-nums leading-none drop-shadow"
              >
                {question.text}
              </div>

              <div className="w-full px-1">
                <TimerBar
                  questionId={question.id}
                  durationMs={question.durationMs}
                  paused={revealAnswer}
                  onTimeout={handleTimeout}
                />
              </div>

              <div className="grid w-full grid-cols-2 gap-2">
                {question.choices.map((choice, index) => (
                  <div
                    key={`${question.id}-${choice}`}
                    className="relative animate-pop-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <ChoiceTile
                      value={choice}
                      visual={choiceVisual(choice)}
                      disabled={revealAnswer}
                      onTap={() => handleChoice(choice)}
                    />
                    {floatGain > 0 && choice === question.answer && (
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
          </div>
        </div>
      )}
    </GameShell>
  );
}

/**
 * Compact progress column: ten short rungs with the climber sliding up one gap
 * per correct answer. The move is a GPU-composited transform transition, so the
 * climb animates without a re-render per frame.
 */
function Ladder({ rung, level }: { rung: number; level: number }) {
  const rungs = Array.from({ length: RUNGS_PER_LEVEL }, (_, i) => i + 1);

  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
      <div className="rounded-full bg-white/30 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider tabular-nums">
        Lv{level + 1} · {rung}/{RUNGS_PER_LEVEL}
      </div>

      <div className="relative w-full" style={{ height: LADDER_HEIGHT }} aria-hidden>
        <div className="absolute inset-y-0 left-1.5 w-2 rounded-full bg-amber-900/60" />
        <div className="absolute inset-y-0 right-1.5 w-2 rounded-full bg-amber-900/60" />

        {rungs.map((index) => (
          <div
            key={index}
            className={`absolute left-1.5 right-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              index <= rung ? "bg-lime-300 shadow-[0_0_6px_rgba(190,242,100,0.9)]" : "bg-amber-900/60"
            }`}
            style={{ bottom: index * RUNG_GAP }}
          />
        ))}

        <div
          className="absolute bottom-0 left-1/2 flex items-center justify-center leading-none ease-out"
          style={{
            width: SPRITE_SIZE,
            height: SPRITE_SIZE,
            fontSize: SPRITE_SIZE - 4,
            transform: `translate(-50%, ${-rung * RUNG_GAP}px)`,
            transitionProperty: "transform",
            transitionDuration: `${CLIMB_MS}ms`,
          }}
        >
          🧗
        </div>
      </div>
    </div>
  );
}

function ChoiceTile({
  value,
  visual,
  disabled,
  onTap,
}: {
  value: number;
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
      aria-label={`Answer ${value}`}
      className={`flex min-h-14 w-full select-none items-center justify-center rounded-2xl bg-white text-3xl font-black tabular-nums text-slate-900 shadow-lg shadow-black/20 transition active:scale-95 disabled:active:scale-100 ${feedback}`}
    >
      {value}
    </button>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="animate-bob text-6xl">🪜</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Add Ladder</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Tap the right answer to climb one rung — {RUNGS_PER_LEVEL} rungs and the ladder starts
        again, a little harder!
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
      <div className="text-5xl">{newBest ? "🏆" : "🪜"}</div>
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
