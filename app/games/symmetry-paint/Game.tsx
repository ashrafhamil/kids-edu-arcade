"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, Panel, StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, getLevel, getStars, recordBest, setLevel, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  PUZZLES,
  TOTAL_PUZZLES,
  cellsRemaining,
  emptyRight,
  gridWidth,
  halfWidth,
  isMirrored,
  shouldBePainted,
  starsFor,
  type Half,
  type Puzzle,
} from "./patterns";

const SLUG = "symmetry-paint";
const CELEBRATE_MS = 1800; // how long the toast stays before the next picture opens

const meta = getGame(SLUG);

type Phase = "start" | "playing" | "finished";
type Celebrate = { emoji: string; stars: number; allDone: boolean; newBest: boolean } | null;

/** Key identifying a cell of the right half, used to remember misplaced taps. */
function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** The next picture to open, staying inside the unlocked range. */
function nextUnlockedIndex(from: number, unlockedCount: number): number {
  const last = Math.min(unlockedCount, TOTAL_PUZZLES) - 1;
  return from < last ? from + 1 : 0;
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [right, setRight] = useState<Half>(() => emptyRight(PUZZLES[0]));
  const [wrongKeys, setWrongKeys] = useState<Set<string>>(() => new Set());

  const [unlockedCount, setUnlockedCount] = useState(1);
  const [best, setBest] = useState(0);
  const [earnedStars, setEarnedStars] = useState(0);
  const [burst, setBurst] = useState(0);
  const [celebrate, setCelebrate] = useState<Celebrate>(null);
  const [resolving, setResolving] = useState(false);

  const timers = useRef<number[]>([]);

  // Read persisted progress after mount so the first render stays SSR-safe.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setUnlockedCount(Math.min(Math.max(getLevel(SLUG), 1), TOTAL_PUZZLES));
      setBest(getBest(SLUG));
      setEarnedStars(getStars(SLUG));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Drop any pending auto-advance if the child leaves mid-celebration.
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

  const puzzle: Puzzle = PUZZLES[puzzleIndex];
  const remaining = cellsRemaining(puzzle, right);
  const hasPaint = right.some((cells) => cells.some(Boolean));
  // The frontier picture is the last unlocked one, so "next" has nowhere to go —
  // keep it disabled there rather than silently wiping work in progress.
  const nextIndex = nextUnlockedIndex(puzzleIndex, unlockedCount);
  const liveStars = starsFor(wrongKeys.size);

  function openPuzzle(index: number): void {
    setPuzzleIndex(index);
    setRight(emptyRight(PUZZLES[index]));
    setWrongKeys(new Set());
    setPhase("playing");
  }

  function startGame(): void {
    sfx.click();
    openPuzzle(Math.min(unlockedCount, TOTAL_PUZZLES) - 1);
  }

  function playAgain(): void {
    sfx.click();
    openPuzzle(0);
  }

  function pickPuzzle(index: number): void {
    if (resolving || index >= unlockedCount) return;
    sfx.click();
    openPuzzle(index);
  }

  function nextPuzzle(): void {
    if (resolving || nextIndex === puzzleIndex) return;
    sfx.click();
    openPuzzle(nextIndex);
  }

  function clearPaint(): void {
    if (resolving || !hasPaint) return;
    sfx.click();
    setRight(emptyRight(puzzle));
  }

  function finishPuzzle(wrongCells: number): void {
    setResolving(true);
    sfx.win();
    setBurst((b) => b + 1);

    const puzzleNumber = puzzleIndex + 1;
    const isLast = puzzleNumber === TOTAL_PUZZLES;
    const beat = recordBest(SLUG, puzzleNumber);
    if (beat) setBest(puzzleNumber);

    const unlocked = Math.min(puzzleNumber + 1, TOTAL_PUZZLES);
    setLevel(SLUG, unlocked);
    setUnlockedCount((count) => Math.max(count, unlocked));
    const stars = starsFor(wrongCells);
    setStars(SLUG, stars);
    setEarnedStars((current) => Math.max(current, stars));

    setCelebrate({
      emoji: puzzle.emoji,
      stars,
      allDone: isLast,
      newBest: beat,
    });

    schedule(() => {
      setCelebrate(null);
      setResolving(false);
      if (isLast) setPhase("finished");
      else openPuzzle(puzzleIndex + 1);
    }, CELEBRATE_MS);
  }

  /** Toggle one cell of the right half, then check the mirror against that new grid. */
  function toggleCell(row: number, col: number): void {
    if (resolving) return;

    const nextRight = right.map((cells) => [...cells]);
    const painted = !nextRight[row][col];
    nextRight[row][col] = painted;
    setRight(nextRight);

    const misplaced = painted && !shouldBePainted(puzzle, row, col);
    const key = cellKey(row, col);
    // Wrong cells are remembered for the whole attempt: clearing one undoes the
    // paint, not the record, so stars reflect what actually happened.
    const nextWrong = misplaced && !wrongKeys.has(key) ? new Set(wrongKeys).add(key) : wrongKeys;
    if (nextWrong !== wrongKeys) setWrongKeys(nextWrong);

    if (painted) sfx.pop();
    else sfx.click();

    if (isMirrored(puzzle, nextRight)) finishPuzzle(nextWrong.size);
  }

  const liveStats = (
    <>
      <StatBadge label="Level" value={`${puzzleIndex + 1}/${TOTAL_PUZZLES}`} />
      <StatBadge label="To go" value={remaining} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <ReadyPanel best={best} onPlay={startGame} />}

      {phase === "finished" && <FinishedPanel stars={earnedStars} onPlayAgain={playAgain} />}

      {phase === "playing" && (
        <div className="flex w-full max-w-[22rem] flex-col items-center gap-3">
          <SideCue puzzle={puzzle} />

          <div className="relative w-full">
            <Board puzzle={puzzle} right={right} disabled={resolving} onToggle={toggleCell} />
            {celebrate && <CelebrateToast celebrate={celebrate} />}
          </div>

          <div className="flex w-full gap-3">
            <ControlButton label="🧽" onClick={clearPaint} disabled={resolving || !hasPaint} />
            <ControlButton label="▶" onClick={nextPuzzle} disabled={resolving || nextIndex === puzzleIndex} />
          </div>

          <PuzzlePicker
            puzzleIndex={puzzleIndex}
            unlockedCount={unlockedCount}
            disabled={resolving}
            onPick={pickPuzzle}
          />

          <div className="flex flex-col items-center gap-0.5">
            <StarRow value={liveStars} size="text-2xl" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/80">
              Best {best} / {TOTAL_PUZZLES}
            </span>
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** Wordless "picture on the left, your turn on the right" hint above the board. */
function SideCue({ puzzle }: { puzzle: Puzzle }) {
  return (
    <div className="grid w-full grid-cols-2 items-center text-center text-2xl leading-none">
      <span aria-hidden>{puzzle.emoji}</span>
      <span className="animate-bob" aria-hidden>
        👆
      </span>
    </div>
  );
}

function Board({
  puzzle,
  right,
  disabled,
  onToggle,
}: {
  puzzle: Puzzle;
  right: Half;
  disabled: boolean;
  onToggle: (row: number, col: number) => void;
}) {
  const half = halfWidth(puzzle);
  const width = gridWidth(puzzle);

  return (
    <div className="relative w-full rounded-3xl bg-white p-2 shadow-2xl shadow-black/30">
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
        role="group"
        aria-label={`${puzzle.name} mirror puzzle`}
      >
        {puzzle.left.map((cells, row) => (
          <Fragment key={row}>
            {cells.map((painted, col) => (
              <ModelCell key={`model-${row}-${col}`} painted={painted} ink={puzzle.ink} />
            ))}
            {right[row].map((painted, col) => (
              <PaintCell
                key={`paint-${row}-${col}`}
                painted={painted}
                misplaced={painted && !shouldBePainted(puzzle, row, col)}
                ink={puzzle.ink}
                label={`Row ${row + 1}, column ${half + col + 1}`}
                disabled={disabled}
                onToggle={() => onToggle(row, col)}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <MirrorLine />
    </div>
  );
}

/** The mirror line, drawn on top of the grid so it never steals cell width. */
function MirrorLine() {
  return (
    <div
      className="pointer-events-none absolute inset-y-2 left-1/2 -translate-x-1/2 border-l-[3px] border-dashed border-slate-500"
      aria-hidden
    />
  );
}

/** A cell of the pre-painted left half — shown, never tappable. */
function ModelCell({ painted, ink }: { painted: boolean; ink: string }) {
  return (
    <div
      className="aspect-square rounded-md"
      style={{ backgroundColor: painted ? ink : "#f1f5f9" }}
      aria-hidden
    />
  );
}

/**
 * A cell of the right half. Empty cells carry a dashed edge so the tappable side
 * reads differently from the model side, and a misplaced cell is marked by both
 * colour and an ✕ glyph — never colour alone.
 */
function PaintCell({
  painted,
  misplaced,
  ink,
  label,
  disabled,
  onToggle,
}: {
  painted: boolean;
  misplaced: boolean;
  ink: string;
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  const emptyStyles = "border-2 border-dashed border-slate-300 bg-slate-50";
  // Misplaced cells keep their paint but gain a ring and an ✕ — colour alone is
  // never the signal, and the cue stays gentle rather than scolding.
  const misplacedStyles = "ring-2 ring-rose-600 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={painted}
      aria-label={label}
      className={`flex aspect-square items-center justify-center rounded-md text-sm font-black leading-none transition active:scale-90 disabled:active:scale-100 ${
        painted ? (misplaced ? misplacedStyles : "") : emptyStyles
      }`}
      style={painted ? { backgroundColor: ink } : undefined}
    >
      {misplaced && <span aria-hidden>✕</span>}
    </button>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "🧽" ? "Clear my painting" : "Next picture"}
      className="flex-1 select-none rounded-2xl bg-white/30 px-4 py-2.5 text-2xl font-black leading-none text-white transition active:scale-95 hover:bg-white/30 disabled:opacity-50 disabled:active:scale-100"
    >
      <span aria-hidden>{label}</span>
    </button>
  );
}

function PuzzlePicker({
  puzzleIndex,
  unlockedCount,
  disabled,
  onPick,
}: {
  puzzleIndex: number;
  unlockedCount: number;
  disabled: boolean;
  onPick: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {PUZZLES.map((item, i) => {
        const locked = i >= unlockedCount;
        const current = i === puzzleIndex;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(i)}
            disabled={disabled || locked}
            aria-label={`${item.name}${locked ? " (locked)" : ""}`}
            aria-current={current ? "true" : undefined}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition active:scale-90 ${
              locked ? "bg-white/10 opacity-60" : "bg-white/25"
            } ${current ? "ring-4 ring-white" : "ring-2 ring-white/30"}`}
          >
            <span aria-hidden>{locked ? "🔒" : item.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

function CelebrateToast({ celebrate }: { celebrate: NonNullable<Celebrate> }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="animate-pop-in rounded-3xl bg-slate-900/85 px-7 py-5 text-center shadow-2xl">
        {celebrate.newBest && (
          <div className="animate-bob text-sm font-black uppercase tracking-widest text-amber-300">
            🏆 New Best!
          </div>
        )}
        <div className="mt-1 text-4xl leading-none" aria-hidden>
          {celebrate.allDone ? "🏆" : celebrate.emoji}
        </div>
        <div className="mt-2 flex justify-center">
          <StarRow value={celebrate.stars} size="text-2xl" />
        </div>
      </div>
    </div>
  );
}

function ReadyPanel({ best, onPlay }: { best: number; onPlay: () => void }) {
  return (
    <Panel>
      <div className="animate-bob text-6xl">🦋</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Symmetry Paint</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Half the picture is painted — tap the empty side to mirror it!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        🖌️ No timer &middot; ⭐⭐⭐ for a picture with no wrong cells
      </p>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>▶ Play</BigButton>
      </div>
      {best > 0 && (
        <p className="mt-3 text-sm font-bold text-slate-500">
          Best picture: {best} / {TOTAL_PUZZLES}
        </p>
      )}
    </Panel>
  );
}

function FinishedPanel({ stars, onPlayAgain }: { stars: number; onPlayAgain: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🏆</div>
      <h2 className="mt-2 text-2xl font-black text-slate-800">
        All {TOTAL_PUZZLES} pictures mirrored!
      </h2>
      <p className="mt-1 font-semibold text-slate-600">
        Every half found its other half. 🦋
      </p>
      <div className="my-4 flex justify-center">
        <StarRow value={stars} />
      </div>
      <BigButton onClick={onPlayAgain} className="w-full">
        Play Again ▶
      </BigButton>
    </Panel>
  );
}
