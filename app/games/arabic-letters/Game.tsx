"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import {
  displayLevel,
  genQuestion,
  levelFor,
  starsFor,
  type Letter,
  type Question,
} from "./data";

const SLUG = "arabic-letters";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const MAX_SPEED_BONUS = 10;

const POP_DELAY = 200; // correct: let the tile pop before the next round
const MISS_DELAY = 850; // wrong/timeout: shake + reveal the right letter
const OVER_DELAY = 650; // last heart lost -> show the game-over panel

// System Arabic font stack so glyphs never inherit the Latin-only Fredoka.
const ARABIC_FONT = '"Geeza Pro","Noto Naskh Arabic","Segoe UI",serif';

const TILE_COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-rose-500",
] as const;

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type TileVisual = "idle" | "popped" | "wrong" | "correct";

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
  const questionStart = useRef(0);
  const timers = useRef<number[]>([]);

  // Load the persisted best after mount (SSR-safe), deferred one tick.
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

  function loadNext(forCorrectCount: number, avoidAr: string | undefined): void {
    questionStart.current = Date.now();
    setQuestion(genQuestion(levelFor(forCorrectCount), nextId.current++, avoidAr));
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
    questionStart.current = Date.now();
    setQuestion(genQuestion(0, nextId.current++, undefined));
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
    if (!question) return;
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
      schedule(() => loadNext(correctCount, question.answer.ar), MISS_DELAY);
    }
  }

  function speedBonus(durationMs: number): number {
    const elapsed = Date.now() - questionStart.current;
    const fraction = Math.max(0, Math.min(1, (durationMs - elapsed) / durationMs));
    return Math.round(MAX_SPEED_BONUS * fraction);
  }

  function handleAnswer(choice: Letter, index: number): void {
    if (phase !== "playing" || roundState !== "active" || !question) return;
    setRoundState("resolving");

    if (choice.ar !== question.answer.ar) {
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
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    setPoppedIndex(index);
    schedule(() => loadNext(nextCorrect, question.answer.ar), POP_DELAY);
  }

  function handleTimeout(): void {
    if (roundState !== "active") return;
    setRoundState("resolving");
    registerMiss(null);
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

  const tileVisual = (index: number, choice: Letter): TileVisual => {
    if (poppedIndex === index) return "popped";
    if (revealAnswer && question && choice.ar === question.answer.ar) return "correct";
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
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex min-h-[2.25rem] items-center gap-2">
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-black backdrop-blur">
              Level {displayLevel(levelFor(correctCount))}
            </span>
            {combo >= 2 && (
              <span
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-3 py-1 text-sm font-black text-amber-950 shadow-md"
              >
                🔥 x{Math.min(combo, MAX_MULTIPLIER)}
              </span>
            )}
          </div>

          <Prompt question={question} />

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
                  letter={choice}
                  mode={question.mode}
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

/** RTL-wrapped Arabic glyph in a guaranteed system Arabic font. */
function ArabicGlyph({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span dir="rtl" className={className} style={{ fontFamily: ARABIC_FONT }}>
      {children}
    </span>
  );
}

/** The big question: a name to find, or a glyph to name. */
function Prompt({ question }: { question: Question }) {
  const isForward = question.mode === "forward";
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <div className="text-base font-bold uppercase tracking-widest text-white/85">
        {isForward ? "Find this letter" : "What is its name?"}
      </div>
      <div className="flex min-h-[6rem] w-full items-center justify-center rounded-3xl bg-white/95 px-4 py-3 text-slate-900 shadow-xl">
        {isForward ? (
          <span className="text-6xl font-black leading-none">{question.answer.name}</span>
        ) : (
          <ArabicGlyph className="text-8xl font-black leading-none">
            {question.answer.ar}
          </ArabicGlyph>
        )}
      </div>
    </div>
  );
}

function Tile({
  letter,
  mode,
  color,
  visual,
  disabled,
  onTap,
}: {
  letter: Letter;
  mode: Question["mode"];
  color: string;
  visual: TileVisual;
  disabled: boolean;
  onTap: () => void;
}) {
  const stateClass =
    visual === "popped"
      ? "scale-125 opacity-0 transition-all duration-200"
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
      className={`flex aspect-square w-full select-none items-center justify-center rounded-3xl ${color} px-2 text-white shadow-lg shadow-black/30 ring-4 ring-white/50 ${stateClass}`}
      aria-label={letter.name}
    >
      {mode === "forward" ? (
        <ArabicGlyph className="text-6xl font-black leading-none">{letter.ar}</ArabicGlyph>
      ) : (
        <span className="text-3xl font-black leading-tight">{letter.name}</span>
      )}
    </button>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">📖</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Hijaiyah</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        See the name, tap the matching Arabic letter! Keep a streak for bonus points.
        Later on, you&apos;ll name the letters too.
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
      <div className="text-5xl">{newBest ? "🏆" : "📖"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-emerald-600">{score}</div>
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
