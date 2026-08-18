"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, Panel, StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx, unlockAudio } from "@/lib/sound";
import { getBest, getLevel, getStars, recordBest, setLevel, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  applyMark,
  cellIndex,
  clueText,
  emptyMarks,
  isComplete,
  nextMark,
  PUZZLE_COUNT,
  PUZZLES,
  sizeOf,
  starsFor,
  THREE_STAR_CHECKS,
  TWO_STAR_CHECKS,
  wrongCells,
  type Mark,
  type Puzzle,
} from "./puzzles";

const SLUG = "logic-grid";
const SHAKE_MS = 500;

type Phase = "start" | "playing" | "solved" | "finished";

const MARK_GLYPH: Record<Mark, string> = { blank: "", yes: "✓", no: "✗" };
const MARK_LABEL: Record<Mark, string> = { blank: "empty", yes: "yes", no: "no" };
const GENDER_EMOJI = { boy: "👦", girl: "👧" } as const;

// Hydration-safe read of a persisted number: the server (and first client paint)
// sees 0, then it syncs to the stored value. Must return a primitive.
const subscribeNoop = () => () => {};
function usePersistedNumber(read: () => number): number {
  return useSyncExternalStore(subscribeNoop, read, () => 0);
}

/** The clue sentences, numbered so a child can tick them off as they go. */
function ClueList({ puzzle }: { puzzle: Puzzle }) {
  return (
    <ol className="w-full max-w-[22rem] space-y-1.5 rounded-2xl bg-black/25 px-3 py-3">
      {puzzle.clues.map((clue, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-xs font-black text-slate-900">
            {i + 1}
          </span>
          <span className="text-[0.95rem] font-bold leading-snug">
            {clueText(puzzle, clue)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One tappable grid cell. */
function GridCell({
  mark,
  wrong,
  shaking,
  label,
  onTap,
  tall,
}: {
  mark: Mark;
  wrong: boolean;
  shaking: boolean;
  label: string;
  onTap: () => void;
  tall: boolean;
}) {
  const tone =
    mark === "yes"
      ? "bg-lime-300 text-lime-900"
      : mark === "no"
        ? "bg-rose-100 text-rose-600"
        : "bg-white/95 text-slate-900";
  const flag = wrong ? `ring-4 ring-rose-500 ${shaking ? "animate-shake" : ""}` : "";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      className={`flex w-full items-center justify-center rounded-xl text-2xl font-black shadow transition active:scale-90 ${tone} ${flag}`}
      style={{ height: tall ? 60 : 52 }}
    >
      {MARK_GLYPH[mark]}
    </button>
  );
}

/** Person x item grid with emoji column headers and name row headers. */
function PuzzleGrid({
  puzzle,
  marks,
  wrong,
  shaking,
  onTapCell,
}: {
  puzzle: Puzzle;
  marks: Mark[];
  wrong: number[];
  shaking: boolean;
  onTapCell: (row: number, col: number) => void;
}) {
  const size = sizeOf(puzzle);
  const tall = size === 3;

  return (
    <div
      className="grid w-full max-w-[22rem] gap-1"
      style={{
        gridTemplateColumns: `minmax(0, 1.15fr) repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      <div aria-hidden />
      {puzzle.items.map((item) => (
        <div
          key={item.name}
          className="flex flex-col items-center justify-end gap-0.5 pb-1"
        >
          <span className="text-2xl leading-none" role="img" aria-label={item.name}>
            {item.emoji}
          </span>
          {tall && (
            <span className="text-[0.6rem] font-black uppercase tracking-tight">
              {item.name}
            </span>
          )}
        </div>
      ))}

      {puzzle.people.map((person, row) => (
        <Fragment key={person.name}>
          <div className="flex items-center gap-0.5 pr-1">
            <span className="text-lg leading-none" role="img" aria-label={person.gender}>
              {GENDER_EMOJI[person.gender]}
            </span>
            <span className="truncate text-sm font-black">{person.name}</span>
          </div>
          {puzzle.items.map((item, col) => {
            const i = cellIndex(size, row, col);
            return (
              <GridCell
                key={item.name}
                mark={marks[i]}
                wrong={wrong.includes(i)}
                shaking={shaking}
                tall={tall}
                label={`${person.name}, ${item.name}: ${MARK_LABEL[marks[i]]}`}
                onTap={() => onTapCell(row, col)}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

export default function Game() {
  const meta = getGame(SLUG);

  const [phase, setPhase] = useState<Phase>("start");
  const [index, setIndex] = useState(0);
  const [marks, setMarks] = useState<Mark[]>(() => emptyMarks(sizeOf(PUZZLES[0])));
  const [wrong, setWrong] = useState<number[]>([]);
  const [shaking, setShaking] = useState(false);
  const [checks, setChecks] = useState(0);
  const [burst, setBurst] = useState(0);

  const timers = useRef<number[]>([]);

  const best = usePersistedNumber(() =>
    Math.max(getBest(SLUG), getLevel(SLUG) > 1 ? getLevel(SLUG) : 0),
  );
  const earnedStars = usePersistedNumber(() => getStars(SLUG));

  const puzzle = PUZZLES[index];
  const size = sizeOf(puzzle);
  const complete = isComplete(marks, size);
  // After a failed Check the grid must change before it can be checked again,
  // so every counted attempt is a genuinely different guess.
  const canCheck = complete && wrong.length === 0;

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

  const openPuzzle = useCallback((puzzleIndex: number) => {
    setIndex(puzzleIndex);
    setMarks(emptyMarks(sizeOf(PUZZLES[puzzleIndex])));
    setWrong([]);
    setShaking(false);
    setPhase("playing");
  }, []);

  const startGame = useCallback(() => {
    unlockAudio();
    sfx.click();
    setChecks(0);
    openPuzzle(0);
  }, [openPuzzle]);

  const tapCell = useCallback(
    (row: number, col: number) => {
      const mark = nextMark(marks[cellIndex(size, row, col)]);
      if (mark === "yes") sfx.pop();
      else sfx.click();
      setMarks(applyMark(marks, size, row, col, mark));
      setWrong([]);
      setShaking(false);
    },
    [marks, size],
  );

  const clearGrid = useCallback(() => {
    sfx.click();
    setMarks(emptyMarks(size));
    setWrong([]);
    setShaking(false);
  }, [size]);

  const finishPuzzle = useCallback(
    (totalChecks: number) => {
      const levelNumber = index + 1;
      setLevel(SLUG, levelNumber);
      recordBest(SLUG, levelNumber);
      setBurst((b) => b + 1);

      if (levelNumber === PUZZLE_COUNT) {
        setStars(SLUG, starsFor(totalChecks));
        sfx.win();
        setPhase("finished");
        return;
      }
      sfx.levelUp();
      setPhase("solved");
    },
    [index],
  );

  const check = useCallback(() => {
    if (!canCheck) return;
    const totalChecks = checks + 1;
    setChecks(totalChecks);

    const bad = wrongCells(marks, puzzle);
    if (bad.length === 0) {
      finishPuzzle(totalChecks);
      return;
    }
    // The red rings stay until the child edits a cell — only the shake stops.
    sfx.wrong();
    setWrong(bad);
    setShaking(true);
    schedule(() => setShaking(false), SHAKE_MS);
  }, [canCheck, checks, marks, puzzle, finishPuzzle, schedule]);

  const nextPuzzle = useCallback(() => {
    sfx.click();
    openPuzzle(index + 1);
  }, [index, openPuzzle]);

  const playAgain = useCallback(() => {
    sfx.click();
    setChecks(0);
    openPuzzle(0);
  }, [openPuzzle]);

  const liveStats = (
    <>
      <StatBadge label="Puzzle" value={`${index + 1}/${PUZZLE_COUNT}`} />
      <StatBadge label="Checks" value={checks} />
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && (
        <Panel>
          <div className="mb-2 text-6xl">🧠</div>
          <h2 className="mb-1 text-2xl font-black">Logic Grid</h2>
          <p className="mb-3 font-semibold text-slate-600">
            Read the clues, then tap the grid: once for ✓, twice for ✗. A ✓ crosses
            out the rest of its row and column for you. Press Check when every kid
            has one ✓.
          </p>
          <p className="mb-4 text-sm font-bold text-slate-500">
            {PUZZLE_COUNT} puzzles &middot; no timer &middot; ⭐⭐⭐ in {THREE_STAR_CHECKS}{" "}
            checks or fewer, ⭐⭐ up to {TWO_STAR_CHECKS}
          </p>
          <div className="mb-4 flex justify-center">
            <StarRow value={earnedStars} />
          </div>
          <BigButton onClick={startGame} className="w-full">
            ▶ Play
          </BigButton>
          {best > 0 && (
            <p className="mt-3 text-sm font-bold text-slate-500">Best puzzle: {best}</p>
          )}
        </Panel>
      )}

      {phase === "solved" && (
        <Panel>
          <div className="mb-2 text-5xl">🎉</div>
          <h2 className="text-2xl font-black">Puzzle {index + 1} solved!</h2>
          <p className="mt-1 font-semibold text-slate-600">
            Every clue fits. {checks} check{checks === 1 ? "" : "s"} so far.
          </p>
          <div className="my-4 text-4xl">{PUZZLES[index + 1].emoji}</div>
          <BigButton onClick={nextPuzzle} className="w-full">
            Next Puzzle ▶
          </BigButton>
        </Panel>
      )}

      {phase === "finished" && (
        <Panel>
          <div className="mb-2 text-6xl">🏆</div>
          <h2 className="text-2xl font-black">All {PUZZLE_COUNT} solved!</h2>
          <p className="mt-1 font-semibold text-slate-600">
            You cracked every grid in {checks} checks. Real detective work. 🧠
          </p>
          <div className="my-4 flex justify-center">
            <StarRow value={starsFor(checks)} />
          </div>
          <BigButton onClick={playAgain} className="w-full">
            Play Again ▶
          </BigButton>
        </Panel>
      )}

      {phase === "playing" && (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-lg font-black">
            <span className="text-2xl leading-none" aria-hidden>
              {puzzle.emoji}
            </span>
            <span>
              {puzzle.theme} — who has which {puzzle.subject}?
            </span>
          </div>

          <ClueList puzzle={puzzle} />

          <PuzzleGrid
            puzzle={puzzle}
            marks={marks}
            wrong={wrong}
            shaking={shaking}
            onTapCell={tapCell}
          />

          <div className="flex w-full max-w-[22rem] items-center gap-2">
            <BigButton onClick={check} disabled={!canCheck} className="flex-1 !px-4 !py-3">
              ✅ Check
            </BigButton>
            <button
              type="button"
              onClick={clearGrid}
              aria-label="Clear the grid"
              className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-white/20 px-3 text-xl font-black text-white backdrop-blur transition active:scale-90"
            >
              🗑
            </button>
          </div>

          <p className="min-h-5 text-sm font-bold text-white/80">
            {wrong.length > 0
              ? "The ✓ marks ringed in red are wrong — change one to try again."
              : complete
                ? "Looks full! Press Check."
                : `Put one ✓ on each of the ${size} kids.`}
          </p>
        </div>
      )}
    </GameShell>
  );
}
