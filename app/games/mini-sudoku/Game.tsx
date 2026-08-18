"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, Panel, StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx, unlockAudio } from "@/lib/sound";
import { getBest, getLevel, getStars, recordBest, setLevel, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  LEVEL_COUNT,
  isSolved,
  isValidPlacement,
  peersOf,
  placedCount,
  puzzleFor,
  starsFor,
  symbolsFor,
  toCells,
  type Puzzle,
} from "./puzzles";

const SLUG = "mini-sudoku";
const SHAKE_MS = 420;
const CLEAR_DELAY = 520;
/** Cell edge in px; 6 x 56 = 336 still fits a 360px phone (328px of content). */
const CELL_PX = 56;

type Phase = "ready" | "playing" | "won" | "over";

const meta = getGame(SLUG);

// Hydration-safe localStorage read: the server (and first client paint) sees 0,
// then it syncs to the stored value. Mirrors robot-run.
const subscribeNoop = () => () => {};
function usePersistedNumber(read: () => number): number {
  return useSyncExternalStore(subscribeNoop, read, () => 0);
}

/**
 * The stored "level" number means the level to resume at, matching getLevel's
 * default of 1. It is monotone (setLevel only writes a bigger number), so
 * replaying earlier levels never rewinds a child's progress.
 */
function resumeIndex(): number {
  return Math.min(Math.max(getLevel(SLUG) - 1, 0), LEVEL_COUNT - 1);
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [levelIndex, setLevelIndex] = useState(0);
  const [cells, setCells] = useState<number[]>(() => toCells(puzzleFor(0).given));
  const [selected, setSelected] = useState<number | null>(null);
  const [hinted, setHinted] = useState<number[]>([]);
  const [hints, setHints] = useState(0);
  const [shake, setShake] = useState<{ index: number; id: number } | null>(null);
  const [burst, setBurst] = useState(0);

  const hintsRef = useRef(0);
  // Locks input during the short celebration delay after the final cell lands.
  const resolving = useRef(false);
  const shakeId = useRef(0);
  const timers = useRef<number[]>([]);

  const bestLevel = usePersistedNumber(() => getBest(SLUG));
  const earnedStars = usePersistedNumber(() => getStars(SLUG));
  const savedLevel = usePersistedNumber(() => getLevel(SLUG));

  const puzzle = puzzleFor(levelIndex);
  const givens = useMemo(() => toCells(puzzle.given), [puzzle]);
  const symbols = symbolsFor(puzzle.size);
  const blanksLeft = cells.filter((v) => v === 0).length;

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const enterLevel = useCallback(
    (index: number) => {
      clearTimers();
      resolving.current = false;
      setLevelIndex(index);
      setCells(toCells(puzzleFor(index).given));
      setSelected(null);
      setHinted([]);
      setShake(null);
      setPhase("playing");
    },
    [clearTimers],
  );

  const startRun = useCallback(
    (index: number) => {
      unlockAudio();
      sfx.click();
      hintsRef.current = 0;
      setHints(0);
      enterLevel(index);
    },
    [enterLevel],
  );

  /** Bank the cleared level, then either move on or finish the set. */
  const clearLevel = useCallback(() => {
    const cleared = levelIndex + 1;
    recordBest(SLUG, cleared);
    setLevel(SLUG, Math.min(cleared + 1, LEVEL_COUNT));
    setSelected(null);
    setBurst((b) => b + 1);

    if (cleared === LEVEL_COUNT) {
      setStars(SLUG, starsFor(hintsRef.current));
      sfx.win();
      setPhase("over");
      return;
    }
    sfx.levelUp();
    setPhase("won");
  }, [levelIndex]);

  const rejectPlacement = useCallback(
    (index: number) => {
      sfx.wrong();
      shakeId.current += 1;
      setShake({ index, id: shakeId.current });
      schedule(() => setShake(null), SHAKE_MS);
    },
    [schedule],
  );

  const commit = useCallback(
    (next: number[]) => {
      setCells(next);
      if (!isSolved(next, puzzle)) return;
      resolving.current = true;
      schedule(clearLevel, CLEAR_DELAY);
    },
    [puzzle, schedule, clearLevel],
  );

  const selectCell = useCallback(
    (index: number) => {
      sfx.click();
      setSelected(index);
    },
    [],
  );

  /** Tap a palette symbol: legal placements land, illegal ones shake and bounce. */
  const placeSymbol = useCallback(
    (value: number) => {
      if (phase !== "playing" || resolving.current || selected === null) return;
      if (givens[selected] !== 0 || cells[selected] === value) return;

      if (!isValidPlacement(cells, puzzle, selected, value)) {
        rejectPlacement(selected);
        return;
      }
      sfx.pop();
      const next = [...cells];
      next[selected] = value;
      commit(next);
    },
    [phase, selected, givens, cells, puzzle, rejectPlacement, commit],
  );

  const eraseSelected = useCallback(() => {
    if (phase !== "playing" || resolving.current || selected === null) return;
    if (givens[selected] !== 0 || cells[selected] === 0) return;
    sfx.click();
    const next = [...cells];
    next[selected] = 0;
    setHinted((h) => h.filter((i) => i !== selected));
    setCells(next);
  }, [phase, selected, givens, cells]);

  /** Fill one correct cell — the selected one when it is free, else the first blank. */
  const useHint = useCallback(() => {
    if (phase !== "playing" || resolving.current) return;
    const target =
      selected !== null && givens[selected] === 0 ? selected : cells.indexOf(0);
    if (target < 0) return;

    const value = toCells(puzzle.solution)[target];
    const next = [...cells];
    // Clear any wrong copy of this symbol that would clash with the revealed one.
    peersOf(puzzle, target).forEach((peer) => {
      if (next[peer] === value && givens[peer] === 0) next[peer] = 0;
    });
    next[target] = value;

    hintsRef.current += 1;
    setHints(hintsRef.current);
    setHinted((h) => (h.includes(target) ? h : [...h, target]));
    setSelected(target);
    sfx.correct();
    commit(next);
  }, [phase, selected, givens, cells, puzzle, commit]);

  const nextLevel = useCallback(() => {
    sfx.click();
    enterLevel(levelIndex + 1);
  }, [enterLevel, levelIndex]);

  const liveStats = (
    <>
      <StatBadge label="Level" value={`${levelIndex + 1}/${LEVEL_COUNT}`} />
      <StatBadge label="Left" value={blanksLeft} />
      <StatBadge label="Hints" value={hints} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "ready" && (
        <ReadyPanel
          stars={earnedStars}
          bestLevel={bestLevel}
          savedLevel={savedLevel}
          onPlay={startRun}
        />
      )}

      {phase === "won" && (
        <Panel>
          <div className="mb-2 text-5xl">🎉</div>
          <h2 className="text-2xl font-black">Level {levelIndex + 1} Solved!</h2>
          <p className="mt-1 font-semibold text-slate-600">
            Every row, column and box has one of each. 🔳
          </p>
          <div className="my-4 flex justify-center">
            <StarRow value={starsFor(hints)} />
          </div>
          <BigButton onClick={nextLevel} className="w-full">
            Next Puzzle ▶
          </BigButton>
        </Panel>
      )}

      {phase === "over" && (
        <Panel>
          <div className="mb-2 text-6xl">🏆</div>
          <h2 className="text-2xl font-black">All 12 puzzles solved!</h2>
          <div className="my-4 flex justify-center">
            <StarRow value={starsFor(hints)} />
          </div>
          <p className="font-semibold text-slate-600">
            {hints === 0 ? "No hints at all — perfect logic!" : `Hints used: ${hints}`}
          </p>
          <BigButton onClick={() => startRun(0)} className="mt-4 w-full">
            🔁 Play Again
          </BigButton>
        </Panel>
      )}

      {phase === "playing" && (
        <div className="flex w-full flex-col items-center gap-3">
          <SudokuGrid
            puzzle={puzzle}
            cells={cells}
            givens={givens}
            symbols={symbols}
            selected={selected}
            hinted={hinted}
            shake={shake}
            onSelect={selectCell}
          />

          <div
            className="grid w-full gap-2"
            style={{
              gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
              maxWidth: `min(100%, ${puzzle.size * CELL_PX}px)`,
            }}
          >
            {symbols.map((symbol, i) => {
              const value = i + 1;
              const done = placedCount(cells, value) >= puzzle.size;
              return (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => placeSymbol(value)}
                  aria-label={`Place symbol ${value}`}
                  className={`flex h-14 items-center justify-center rounded-2xl bg-white/95 text-3xl shadow-lg transition active:scale-90 ${
                    done ? "opacity-40" : ""
                  }`}
                >
                  <span aria-hidden>{symbol}</span>
                </button>
              );
            })}
          </div>

          <div
            className="flex w-full items-center gap-2"
            style={{ maxWidth: `min(100%, ${puzzle.size * CELL_PX}px)` }}
          >
            <button
              type="button"
              onClick={useHint}
              aria-label="Reveal one cell"
              className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/25 px-3 text-lg font-black text-white backdrop-blur transition active:scale-95"
            >
              <span aria-hidden>💡</span> Hint
            </button>
            <button
              type="button"
              onClick={eraseSelected}
              aria-label="Clear the selected cell"
              className="flex h-12 min-w-14 items-center justify-center rounded-2xl bg-white/25 px-4 text-xl font-black text-white backdrop-blur transition active:scale-95"
            >
              <span aria-hidden>🧽</span>
            </button>
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** Pure presentational board: clues, placed symbols, selection and box borders. */
function SudokuGrid({
  puzzle,
  cells,
  givens,
  symbols,
  selected,
  hinted,
  shake,
  onSelect,
}: {
  puzzle: Puzzle;
  cells: number[];
  givens: number[];
  symbols: string[];
  selected: number | null;
  hinted: number[];
  shake: { index: number; id: number } | null;
  onSelect: (index: number) => void;
}) {
  const { size, boxW, boxH } = puzzle;
  const peers = selected === null ? [] : peersOf(puzzle, selected);

  return (
    <div
      className="grid w-full overflow-hidden rounded-2xl border-4 border-purple-900 bg-white"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        maxWidth: `min(100%, ${size * CELL_PX}px)`,
        fontSize: `clamp(20px, ${size === 4 ? 9 : 6.4}vw, 34px)`,
      }}
      aria-label="sudoku grid"
    >
      {cells.map((value, index) => {
        const row = Math.floor(index / size);
        const col = index % size;
        const isGivenCell = givens[index] !== 0;
        const isSelected = selected === index;
        const isPeer = peers.includes(index);
        const isHinted = hinted.includes(index);

        const edges = [
          col < size - 1 && (col + 1) % boxW === 0 ? "border-r-4 border-r-purple-900" : "border-r border-r-purple-200",
          row < size - 1 && (row + 1) % boxH === 0 ? "border-b-4 border-b-purple-900" : "border-b border-b-purple-200",
        ].join(" ");

        const isShaking = shake?.index === index;

        let bg = "bg-white";
        if (isGivenCell) bg = "bg-purple-100";
        if (isPeer) bg = isGivenCell ? "bg-purple-200" : "bg-fuchsia-100";
        if (isHinted) bg = "bg-amber-100";
        if (isSelected) bg = "bg-fuchsia-300";
        // Rejections must read with motion reduced, so colour carries it too.
        if (isShaking) bg = "bg-rose-200 ring-4 ring-inset ring-rose-400";

        return (
          <button
            // Remount on every shake so a rapid second reject replays the animation.
            key={shake?.index === index ? `${index}-${shake.id}` : index}
            type="button"
            onClick={() => onSelect(index)}
            disabled={isGivenCell}
            aria-label={`Row ${row + 1} column ${col + 1}`}
            className={`flex aspect-square items-center justify-center leading-none transition-colors disabled:cursor-default ${bg} ${edges} ${
              isShaking ? "animate-shake" : ""
            }`}
          >
            <span aria-hidden className={isGivenCell ? "opacity-100" : "drop-shadow-sm"}>
              {value === 0 ? "" : symbols[value - 1]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReadyPanel({
  stars,
  bestLevel,
  savedLevel,
  onPlay,
}: {
  stars: number;
  bestLevel: number;
  savedLevel: number;
  onPlay: (index: number) => void;
}) {
  const canResume = savedLevel > 1;

  return (
    <Panel>
      <div className="mb-2 animate-bob text-6xl">🔳</div>
      <h2 className="mb-1 text-2xl font-black">Mini Sudoku</h2>
      <p className="mb-4 font-semibold text-slate-600">
        Tap a square, then tap a fruit to place it. Each fruit fits once in every row,
        column and box — 12 puzzles to solve.
      </p>
      <div className="mb-4 flex justify-center">
        <StarRow value={stars} />
      </div>
      <BigButton onClick={() => onPlay(canResume ? resumeIndex() : 0)} className="w-full">
        {canResume ? `▶ Continue · Level ${savedLevel}` : "▶ Play"}
      </BigButton>
      {canResume && (
        <button
          type="button"
          onClick={() => onPlay(0)}
          className="mt-3 text-sm font-black text-slate-500 underline underline-offset-4"
        >
          Start from level 1
        </button>
      )}
      {bestLevel > 0 && (
        <p className="mt-3 text-sm font-bold text-slate-500">Best level: {bestLevel}</p>
      )}
    </Panel>
  );
}
