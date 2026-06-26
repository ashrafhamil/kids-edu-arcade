"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  genPuzzle,
  levelFor,
  starsFor,
  tokenKey,
  COLOR_NAME,
  type Puzzle,
  type Token,
  type FamilyId,
} from "./patterns";

const SLUG = "pattern-party";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;

const CORRECT_DELAY = 650; // let the pop + reveal play before the next puzzle
const WRONG_DELAY = 1200; // longer: the child reads the revealed answer
const OVER_DELAY = 700; // last heart lost -> show the game-over panel

const SEQ_BOX = 42; // px per slot in the sequence row (fits 6 slots at 390px)
const CHOICE_BOX = 64; // px per choice glyph (button stays a >=44px tap target)

const meta = getGame(SLUG);

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [roundState, setRoundState] = useState<RoundState>("active");

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const lastFamily = useRef<FamilyId | undefined>(undefined);
  const timers = useRef<number[]>([]);
  // Synchronous lock so a puzzle resolves exactly once, even against a same-frame
  // double-tap or a scheduled callback firing in the commit gap.
  const resolving = useRef(false);

  // Load the persisted best after mount (SSR-safe), deferred past hydration.
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Clear any pending timeouts if the player leaves mid-puzzle.
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

  function present(next: Puzzle): void {
    setPuzzle(next);
    setChosenKey(null);
    setLastCorrect(false);
    setShaking(false);
    setRoundState("active");
    resolving.current = false;
    lastFamily.current = next.family;
  }

  function loadNext(forCorrectCount: number): void {
    present(genPuzzle(levelFor(forCorrectCount), nextId.current++, lastFamily.current));
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
    lastFamily.current = undefined;
    present(genPuzzle(0, nextId.current++, undefined));
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
    setShaking(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount), WRONG_DELAY);
    }
  }

  function handleChoice(choice: Token): void {
    if (phase !== "playing" || !puzzle || resolving.current) return;
    resolving.current = true;
    setRoundState("resolving");
    setChosenKey(tokenKey(choice));

    if (tokenKey(choice) !== tokenKey(puzzle.answer)) {
      setLastCorrect(false);
      registerMiss();
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setLastCorrect(true);
    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    schedule(() => loadNext(nextCorrect), CORRECT_DELAY);
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

  const resolved = roundState === "resolving";

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && puzzle && (
        <div className="flex w-full flex-col items-center gap-5">
          <div className="flex min-h-[2.25rem] items-center">
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
            What comes next? 🤔
          </div>

          <div className="relative flex w-full max-w-sm justify-center">
            <SequenceRow puzzle={puzzle} resolved={resolved} />
            {resolved && lastCorrect && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2"
              >
                <FloatScore>+{lastPoints}</FloatScore>
              </span>
            )}
          </div>

          <div
            className={`grid w-full max-w-xs grid-cols-3 gap-3 ${
              shaking ? "animate-shake" : ""
            }`}
          >
            {puzzle.choices.map((choice, index) => (
              <ChoiceButton
                key={`${puzzle.id}-${index}`}
                index={index}
                choice={choice}
                puzzle={puzzle}
                resolved={resolved}
                chosenKey={chosenKey}
                onPick={handleChoice}
              />
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** The visible pattern: prompt tokens followed by the reveal "?" slot. */
function SequenceRow({ puzzle, resolved }: { puzzle: Puzzle; resolved: boolean }) {
  return (
    <div
      key={puzzle.id}
      className="flex w-full max-w-sm animate-pop-in items-center justify-center gap-1.5 overflow-hidden rounded-3xl bg-white/15 p-3 ring-2 ring-white/30"
      role="img"
      aria-label="pattern to continue"
    >
      {puzzle.prompt.map((token, i) => (
        <Slot key={i}>
          <TokenView token={token} box={SEQ_BOX} />
        </Slot>
      ))}
      <Slot reveal={resolved ? "answer" : "question"}>
        {resolved ? (
          <div key="reveal" className="animate-pop-in">
            <TokenView token={puzzle.answer} box={SEQ_BOX} />
          </div>
        ) : (
          <span className="text-3xl leading-none" aria-hidden>
            ❓
          </span>
        )}
      </Slot>
    </div>
  );
}

/** A fixed-size cell in the sequence row. The final cell reveals the answer. */
function Slot({
  children,
  reveal,
}: {
  children: ReactNode;
  reveal?: "answer" | "question";
}) {
  const ring =
    reveal === "answer"
      ? "ring-2 ring-lime-400 bg-lime-400/15"
      : reveal === "question"
        ? "border-2 border-dashed border-white/70 bg-white/10"
        : "";
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-xl ${ring}`}
      style={{ width: SEQ_BOX + 6, height: SEQ_BOX + 6 }}
    >
      {children}
    </div>
  );
}

/** One tappable answer, highlighted green/red after the puzzle resolves. */
function ChoiceButton({
  index,
  choice,
  puzzle,
  resolved,
  chosenKey,
  onPick,
}: {
  index: number;
  choice: Token;
  puzzle: Puzzle;
  resolved: boolean;
  chosenKey: string | null;
  onPick: (choice: Token) => void;
}) {
  const key = tokenKey(choice);
  const isAnswer = key === tokenKey(puzzle.answer);
  const state = !resolved
    ? ""
    : isAnswer
      ? "scale-105 ring-8 ring-lime-400"
      : key === chosenKey
        ? "scale-95 opacity-70 ring-8 ring-rose-400"
        : "opacity-40";
  return (
    <button
      type="button"
      onClick={() => onPick(choice)}
      disabled={resolved}
      aria-label={describe(choice)}
      style={{ minHeight: CHOICE_BOX + 16, animationDelay: `${index * 0.05}s` }}
      className={`flex animate-pop-in items-center justify-center rounded-2xl bg-white p-2 text-slate-900 shadow-lg shadow-black/20 transition-all duration-200 active:scale-95 disabled:active:scale-100 ${state}`}
    >
      <TokenView token={choice} box={CHOICE_BOX} />
    </button>
  );
}

/** Renders any token: a CSS shape, a single emoji, or an emoji cluster. */
function TokenView({ token, box }: { token: Token; box: number }) {
  const scale = token.scale ?? 1;

  if (token.shape) {
    return (
      <div className="flex items-center justify-center" style={{ width: box, height: box }}>
        <ShapeView shape={token.shape} color={token.color ?? "#64748b"} size={box * 0.62 * scale} />
      </div>
    );
  }

  if (token.count !== undefined) {
    const per = box * 0.26;
    return (
      <div
        className="flex flex-wrap content-center items-center justify-center"
        style={{ width: box, height: box, gap: 2 }}
      >
        {Array.from({ length: token.count }).map((_, i) => (
          <span key={i} aria-hidden style={{ fontSize: per, lineHeight: 1 }}>
            {token.emoji}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center" style={{ width: box, height: box }}>
      <span aria-hidden style={{ fontSize: box * 0.6 * scale, lineHeight: 1 }}>
        {token.emoji}
      </span>
    </div>
  );
}

/** A colored CSS shape — circle, rounded square, or triangle. */
function ShapeView({ shape, color, size }: { shape: Token["shape"]; color: string; size: number }) {
  if (shape === "triangle") {
    return (
      <div
        aria-hidden
        style={{
          width: 0,
          height: 0,
          borderLeft: `${size / 2}px solid transparent`,
          borderRight: `${size / 2}px solid transparent`,
          borderBottom: `${size}px solid ${color}`,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        background: color,
        borderRadius: shape === "circle" ? 9999 : size * 0.2,
      }}
    />
  );
}

/** Screen-reader label for a choice. */
function describe(t: Token): string {
  if (t.shape) {
    const name = COLOR_NAME[t.color ?? ""] ?? "";
    return `${sizeWord(t.scale)}${name} ${t.shape}`.trim();
  }
  if (t.count !== undefined) {
    return `${t.count} ${t.emoji}`;
  }
  return `${sizeWord(t.scale)}${t.emoji}`.trim();
}

function sizeWord(scale?: number): string {
  if (scale === undefined) return "";
  if (scale <= 0.7) return "small ";
  if (scale >= 1.2) return "big ";
  return "";
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🧩</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Pattern Party</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Look at the pattern, then tap the piece that comes next. The patterns get
        trickier the further you go — keep a streak for bonus points!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at 60 / 150 / 300 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🧩"}</div>
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
