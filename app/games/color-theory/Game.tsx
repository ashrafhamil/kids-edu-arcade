"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, levelFor, starsFor, type Choice, type Round } from "./rounds";
import TimerBar from "./TimerBar";

const SLUG = "color-theory";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CORRECT_DELAY = 480;
const WRONG_DELAY = 1000;
const OVER_DELAY = 700;
const TOAST_DELAY = 1300;

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
  const [correct, setCorrect] = useState(0);
  const [levelToast, setLevelToast] = useState("");

  const [wrongId, setWrongId] = useState<string | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const resolving = useRef(false);

  /** Difficulty band, derived from the running correct count — never stored twice. */
  const level = levelFor(correct);

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
    setWrongId(null);
    setRevealAnswer(false);
    setFloatGain(0);
    resolving.current = false;
  }

  function loadNext(forLevel: number, avoidName: string): void {
    present(genRound(nextId.current++, forLevel, avoidName));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrect(0);
    setLevelToast("");
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

  function registerMiss(currentScore: number, choiceId: string | null, prevHue: string): void {
    sfx.wrong();
    setCombo(0);
    setWrongId(choiceId);
    setRevealAnswer(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(currentScore), OVER_DELAY);
    } else {
      schedule(() => loadNext(level, prevHue), WRONG_DELAY);
    }
  }

  function announceLevel(nextLevel: number): void {
    sfx.levelUp();
    setLevelToast(`Level ${nextLevel + 1}! 🌈`);
    schedule(() => setLevelToast(""), TOAST_DELAY);
  }

  function handleChoice(choiceId: string): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;

    if (choiceId !== round.answerId) {
      registerMiss(score, choiceId, round.hue.name);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextScore = score + points;
    const nextCorrect = correct + 1;
    const nextLevel = levelFor(nextCorrect);
    if (nextLevel > level) announceLevel(nextLevel);

    setCombo(nextCombo);
    setScore(nextScore);
    setCorrect(nextCorrect);
    setRevealAnswer(true);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    schedule(() => loadNext(nextLevel, round.hue.name), CORRECT_DELAY);
  }

  function handleTimeout(): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    registerMiss(score, null, round.hue.name);
  }

  function choiceVisual(choiceId: string): ChoiceVisual {
    if (revealAnswer && round && choiceId === round.answerId) return "correct";
    if (wrongId === choiceId) return "wrong";
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
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <div className="flex min-h-[2.25rem] flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-white/25 px-3 py-1 text-sm font-black tracking-wide">
              Level {level + 1}
            </span>
            {levelToast && (
              <span className="animate-pop-in rounded-full bg-lime-300 px-3 py-1 text-sm font-black text-lime-950 shadow-md">
                {levelToast}
              </span>
            )}
            {combo >= 2 && (
              <span
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-3 py-1 text-sm font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </span>
            )}
          </div>

          <div
            key={round.id}
            className="flex animate-pop-in flex-col items-center gap-2 rounded-3xl bg-white/95 px-8 py-5 shadow-2xl shadow-black/30"
          >
            <span
              className="h-20 w-32 rounded-2xl border-4 border-slate-200 shadow-inner"
              style={{ background: round.hue.hex }}
              aria-hidden
            />
            <span className="text-2xl font-black leading-none text-slate-900">
              {round.hue.name}
            </span>
          </div>

          <p className="px-2 text-center text-lg font-black leading-tight drop-shadow">
            {round.prompt}
          </p>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id}
              durationMs={round.durationMs}
              paused={revealAnswer}
              onTimeout={handleTimeout}
            />
          </div>

          <div
            className={`grid w-full gap-2.5 ${
              round.mode === "warmcool" ? "grid-cols-2" : "grid-cols-3"
            }`}
          >
            {round.choices.map((choice, index) => (
              <div
                key={`${round.id}-${choice.id}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <ChoiceTile
                  choice={choice}
                  visual={choiceVisual(choice.id)}
                  large={round.mode === "warmcool"}
                  disabled={revealAnswer}
                  onTap={() => handleChoice(choice.id)}
                />
                {floatGain > 0 && round.answerId === choice.id && (
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

/**
 * One tap target. A wheel choice shows its swatch AND its name — never colour
 * alone — so the game stays playable without colour vision. A warm/cool choice
 * has no hex and shows its emoji instead.
 */
function ChoiceTile({
  choice,
  visual,
  large,
  disabled,
  onTap,
}: {
  choice: Choice;
  visual: ChoiceVisual;
  large: boolean;
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
      aria-label={choice.label}
      className={`relative flex h-full w-full select-none flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-2 py-3 text-slate-900 shadow-lg shadow-black/20 transition active:scale-95 disabled:active:scale-100 ${
        large ? "min-h-28" : "min-h-24"
      } ${feedback}`}
    >
      {choice.hex ? (
        <span
          className="h-11 w-full rounded-xl border-2 border-slate-200"
          style={{ background: choice.hex }}
          aria-hidden
        />
      ) : (
        <span className="text-4xl leading-none" aria-hidden>
          {choice.emoji}
        </span>
      )}
      <span
        className={`font-black leading-tight tracking-tight ${large ? "text-2xl" : "text-sm"}`}
      >
        {choice.label}
      </span>
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
      <div className="text-6xl animate-bob">🌈</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Color Theory</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        A colour appears — tap the one opposite it on the wheel, then warm-or-cool, then the
        colours that sit right next to it.
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
      <div className="text-5xl">{newBest ? "🏆" : "🌈"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-violet-600">{score}</div>
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
