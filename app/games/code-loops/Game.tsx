"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, Panel, StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx, unlockAudio } from "@/lib/sound";
import {
  getBest,
  getLevel,
  getStars,
  recordBest,
  setLevel,
  setStars,
} from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  cellKey,
  cellSizeFor,
  LEVELS,
  LEVEL_COUNT,
  starsFor,
  starsForProgram,
  type Level,
  type Pos,
} from "./levels";
import {
  compile,
  DIR_DEF,
  DIR_ORDER,
  END_GLYPH,
  enclosingRepeats,
  isBalanced,
  openBodyLength,
  openRepeatIndex,
  REPEAT_COUNTS,
  REPEAT_GLYPH,
  type Dir,
  type Step,
  type Token,
} from "./interpreter";

const SLUG = "code-loops";
const STEP_MS = 320;
const CRASH_MS = 450;
/** repeat block + one move + end block: the smallest loop worth opening. */
const LOOP_BLOCKS = 3;

type Phase = "start" | "playing" | "won" | "finished";

// Read a persisted number straight from localStorage, hydration-safe: the server
// (and first client paint) sees 0, then it syncs to the stored value and stays
// in lockstep with every recordBest/setStars write — no setState-in-effect.
const subscribeNoop = () => () => {};
function usePersistedNumber(read: () => number): number {
  return useSyncExternalStore(subscribeNoop, read, () => 0);
}

/** Pure presentational maze. Renders floor/walls/goal plus the robot. */
function LevelGrid({
  level,
  robotPos,
  crashing,
}: {
  level: Level;
  robotPos: Pos;
  crashing: boolean;
}) {
  const cells: ReactNode[] = [];
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const k = cellKey(x, y);
      const isRobot = robotPos.x === x && robotPos.y === y;
      const isGoal = level.goal.x === x && level.goal.y === y;
      const isWall = level.walls.has(k);

      let bg = "bg-white/10";
      if (isWall) bg = "bg-slate-900/70";
      else if (isGoal) bg = "bg-yellow-300/30 ring-2 ring-yellow-200";

      let content: ReactNode = null;
      if (isRobot) {
        content = (
          <span key={`r${k}`} className="animate-pop-in">
            🤖
          </span>
        );
      } else if (isWall) {
        content = "🧱";
      } else if (isGoal) {
        content = (
          <span className="animate-bob" aria-hidden>
            ⭐
          </span>
        );
      }

      cells.push(
        <div
          key={k}
          className={`flex aspect-square items-center justify-center rounded-lg ${bg}`}
        >
          {content}
        </div>,
      );
    }
  }

  const cell = cellSizeFor(level.cols);
  return (
    <div
      className={`mx-auto grid w-full gap-1 ${crashing ? "animate-shake" : ""}`}
      style={{
        gridTemplateColumns: `repeat(${level.cols}, minmax(0, 1fr))`,
        maxWidth: `min(100%, ${level.cols * cell}px)`,
        fontSize: "clamp(16px, 5.4vw, 26px)",
      }}
      aria-label="robot maze"
    >
      {cells}
    </div>
  );
}

/** One block in the queue. Loop blocks are amber; their body is tinted to match. */
function QueueTile({
  token,
  inLoop,
  active,
  pass,
  tileRef,
}: {
  token: Token;
  inLoop: boolean;
  active: boolean;
  pass: number | null;
  tileRef: Ref<HTMLSpanElement> | null;
}) {
  const ring = active ? "ring-4 ring-yellow-300" : "";

  if (token.kind === "move") {
    const body = inLoop ? "bg-amber-100 ring-2 ring-amber-400" : "bg-white/95";
    return (
      <span
        ref={tileRef}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl shadow ${body} ${ring}`}
      >
        {DIR_DEF[token.dir].glyph}
      </span>
    );
  }

  const label =
    token.kind === "repeat"
      ? `${REPEAT_GLYPH}${pass === null ? `×${token.count}` : ` ${pass}/${token.count}`}`
      : END_GLYPH;

  return (
    <span
      ref={tileRef}
      className={`flex h-9 shrink-0 items-center justify-center rounded-lg bg-amber-300 px-2 text-base font-black text-amber-950 shadow ${ring}`}
    >
      {label}
    </span>
  );
}

/** The program the child has built, left to right, in tap order. */
function ProgramQueue({
  program,
  active,
}: {
  program: Token[];
  active: Step | null;
}) {
  const owners = enclosingRepeats(program);
  const runningIndex = active === null ? -1 : active.tokenIndex;
  const runningTile = useRef<HTMLSpanElement | null>(null);

  // Long programs scroll sideways, so keep the block being executed in view.
  useEffect(() => {
    runningTile.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [runningIndex]);

  return (
    <div
      className="flex w-full max-w-md items-center gap-1.5 overflow-x-auto rounded-2xl bg-black/25 px-3 py-2"
      style={{ minHeight: 52 }}
    >
      {program.length === 0 ? (
        <span className="text-sm font-bold text-white/70">
          Tap blocks to build your program…
        </span>
      ) : (
        program.map((token, i) => (
          <QueueTile
            key={i}
            token={token}
            inLoop={owners[i] !== -1}
            active={active !== null && (active.tokenIndex === i || active.loopIndex === i)}
            pass={active !== null && active.loopIndex === i ? active.iteration : null}
            tileRef={i === runningIndex ? runningTile : null}
          />
        ))
      )}
    </div>
  );
}

export default function Game() {
  const meta = getGame(SLUG);

  const [phase, setPhase] = useState<Phase>("start");
  const [levelIndex, setLevelIndex] = useState(0);
  const [program, setProgram] = useState<Token[]>([]);
  const [robotPos, setRobotPos] = useState<Pos>(LEVELS[0].start);
  const [running, setRunning] = useState(false);
  const [crashing, setCrashing] = useState(false);
  const [active, setActive] = useState<Step | null>(null);
  const [picking, setPicking] = useState(false);

  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [levelStars, setLevelStars] = useState(0);
  const [levelBlocks, setLevelBlocks] = useState(0);

  // Best level + earned stars live in localStorage; read them reactively.
  const best = usePersistedNumber(() => getBest(SLUG));
  const earnedStars = usePersistedNumber(() => getStars(SLUG));
  const savedLevel = usePersistedNumber(() => getLevel(SLUG));
  const canResume = savedLevel > 1 && savedLevel < LEVEL_COUNT;

  const timeoutRef = useRef<number | null>(null);
  const level = LEVELS[levelIndex];

  const openIndex = openRepeatIndex(program);
  const insideLoop = openIndex !== -1;
  const blocksLeft = level.budget - program.length;
  // Inside a loop, one block is always reserved for the end block, so a child
  // can never build a program they are unable to close.
  const canAddMove = !running && blocksLeft > (insideLoop ? 1 : 0);
  const canOpenLoop = !running && !insideLoop && blocksLeft >= LOOP_BLOCKS;
  const canCloseLoop = !running && insideLoop && openBodyLength(program) > 0;
  const canRun = !running && program.length > 0 && isBalanced(program);
  // The loop has filled its budget: closing it is the only move left, so nudge.
  const mustCloseLoop = canCloseLoop && !canAddMove;

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Always stop a pending step/crash timer when the game unmounts.
  useEffect(() => clearTimer, [clearTimer]);

  const resetRobot = useCallback((lvl: Level) => {
    setRobotPos(lvl.start);
    setActive(null);
    setCrashing(false);
  }, []);

  const win = useCallback(
    (blocks: number) => {
      clearTimer();
      setRunning(false);
      setActive(null);

      const levelNumber = levelIndex + 1;
      const isLast = levelIndex === LEVEL_COUNT - 1;

      setLevel(SLUG, levelNumber);
      setStars(SLUG, starsFor(levelNumber));
      setNewBest(recordBest(SLUG, levelNumber));
      setLevelStars(starsForProgram(blocks, level.optimal));
      setLevelBlocks(blocks);

      setBurst((b) => b + 1);
      sfx.levelUp();
      if (isLast) {
        sfx.win();
        setPhase("finished");
      } else {
        setPhase("won");
      }
    },
    [clearTimer, levelIndex, level.optimal],
  );

  /** Run the program, one cell per tick, highlighting the block that drives it. */
  const go = useCallback(() => {
    if (!canRun) return;
    unlockAudio();
    sfx.click();
    setRunning(true);
    setPicking(false);
    resetRobot(level);

    const steps = compile(program);
    const blocks = program.length;
    let i = 0;
    let pos: Pos = { ...level.start };

    const fail = () => {
      sfx.wrong();
      setCrashing(true);
      timeoutRef.current = window.setTimeout(() => {
        resetRobot(level);
        setRunning(false);
      }, CRASH_MS);
    };

    const step = () => {
      if (i >= steps.length) {
        fail(); // program ended before the robot reached the star
        return;
      }
      const current = steps[i];
      setActive(current);
      const def = DIR_DEF[current.dir];
      const nx = pos.x + def.dx;
      const ny = pos.y + def.dy;
      i += 1;

      const offGrid = nx < 0 || ny < 0 || nx >= level.cols || ny >= level.rows;
      if (offGrid || level.walls.has(cellKey(nx, ny))) {
        fail();
        return;
      }

      pos = { x: nx, y: ny };
      setRobotPos(pos);
      sfx.tick();

      if (nx === level.goal.x && ny === level.goal.y) {
        win(blocks);
        return;
      }
      timeoutRef.current = window.setTimeout(step, STEP_MS);
    };

    timeoutRef.current = window.setTimeout(step, STEP_MS);
  }, [canRun, program, level, resetRobot, win]);

  const appendToken = useCallback((token: Token) => {
    sfx.pop();
    setProgram((p) => [...p, token]);
  }, []);

  const addMove = useCallback(
    (dir: Dir) => {
      if (!canAddMove) return;
      appendToken({ kind: "move", dir });
    },
    [canAddMove, appendToken],
  );

  const addRepeat = useCallback(
    (count: number) => {
      setPicking(false);
      appendToken({ kind: "repeat", count });
    },
    [appendToken],
  );

  const addEnd = useCallback(() => {
    if (!canCloseLoop) return;
    appendToken({ kind: "end" });
  }, [canCloseLoop, appendToken]);

  const openPicker = useCallback(() => {
    if (!canOpenLoop) return;
    sfx.click();
    setPicking(true);
  }, [canOpenLoop]);

  const closePicker = useCallback(() => {
    sfx.click();
    setPicking(false);
  }, []);

  const undo = useCallback(() => {
    if (running) return;
    sfx.click();
    setPicking(false);
    setProgram((p) => p.slice(0, -1));
  }, [running]);

  const clearProgram = useCallback(() => {
    if (running) return;
    sfx.click();
    setPicking(false);
    setProgram([]);
  }, [running]);

  const enterLevel = useCallback(
    (index: number) => {
      setLevelIndex(index);
      setProgram([]);
      setPicking(false);
      setRunning(false);
      resetRobot(LEVELS[index]);
      setPhase("playing");
    },
    [resetRobot],
  );

  const startGame = useCallback(() => {
    unlockAudio();
    sfx.click();
    enterLevel(0);
  }, [enterLevel]);

  const resumeGame = useCallback(() => {
    unlockAudio();
    sfx.click();
    enterLevel(Math.min(savedLevel, LEVEL_COUNT - 1));
  }, [enterLevel, savedLevel]);

  const nextLevel = useCallback(() => {
    sfx.click();
    enterLevel(levelIndex + 1);
  }, [enterLevel, levelIndex]);

  const playAgain = useCallback(() => {
    sfx.click();
    enterLevel(0);
  }, [enterLevel]);

  const liveStats = (
    <>
      <StatBadge label="Level" value={levelIndex + 1} />
      {phase === "playing" && (
        <StatBadge label="Blocks" value={`${program.length}/${level.budget}`} />
      )}
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && (
        <Panel>
          <div className="mb-2 text-6xl">🔁</div>
          <h2 className="mb-1 text-2xl font-black">Code Loops</h2>
          <p className="mb-4 font-semibold text-slate-600">
            You never get enough blocks to spell out every step. Tap 🔁, pick how
            many times, and the blocks you add next run again and again — tap 🔚
            to close the loop, then GO.
          </p>
          <div className="mb-4 flex justify-center">
            <StarRow value={earnedStars} />
          </div>
          <BigButton onClick={startGame} className="w-full">
            ▶ Play
          </BigButton>
          {canResume && (
            <BigButton
              onClick={resumeGame}
              variant="ghost"
              className="mt-3 w-full !bg-slate-200 !text-slate-900"
            >
              Continue level {savedLevel + 1}
            </BigButton>
          )}
          {best > 0 && (
            <p className="mt-3 text-sm font-bold text-slate-500">
              Best level: {best}
            </p>
          )}
        </Panel>
      )}

      {phase === "won" && (
        <Panel>
          <div className="mb-2 text-5xl">🎉</div>
          <h2 className="text-2xl font-black">Level {levelIndex + 1} Complete!</h2>
          {newBest && (
            <div className="mx-auto mt-2 w-fit rounded-full bg-amber-400 px-4 py-1 text-sm font-black text-amber-950">
              NEW BEST! ⭐
            </div>
          )}
          <p className="mt-2 font-bold text-slate-600">
            {levelBlocks} blocks · best possible {level.optimal}
          </p>
          <div className="my-4 flex justify-center">
            <StarRow value={levelStars} />
          </div>
          <BigButton onClick={nextLevel} className="w-full">
            Next Level ▶
          </BigButton>
        </Panel>
      )}

      {phase === "finished" && (
        <Panel>
          <div className="mb-2 text-6xl">🏆</div>
          <h2 className="text-2xl font-black">All 10 loops cracked!</h2>
          <p className="mt-1 font-semibold text-slate-600">
            You made the robot repeat itself like a real coder. 🤖🔁
          </p>
          <div className="my-4 flex justify-center">
            <StarRow value={3} />
          </div>
          <BigButton onClick={playAgain} className="w-full">
            Play Again ▶
          </BigButton>
        </Panel>
      )}

      {phase === "playing" && (
        <div className="flex w-full flex-col items-center gap-3">
          <LevelGrid level={level} robotPos={robotPos} crashing={crashing} />

          <ProgramQueue program={program} active={active} />

          {/* One row, two faces: the blocks, or the count picker for a new loop. */}
          {picking ? (
            <div className="grid w-full max-w-md grid-cols-5 gap-1.5">
              {REPEAT_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => addRepeat(count)}
                  aria-label={`repeat ${count} times`}
                  className="flex h-12 items-center justify-center rounded-2xl bg-amber-300 text-xl font-black text-amber-950 shadow-lg transition active:scale-90"
                >
                  ×{count}
                </button>
              ))}
              <button
                type="button"
                onClick={closePicker}
                aria-label="Cancel repeat"
                className="flex h-12 items-center justify-center rounded-2xl bg-white/20 text-xl font-black text-white backdrop-blur transition active:scale-90"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="grid w-full max-w-md grid-cols-6 gap-1.5">
              {DIR_ORDER.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => addMove(dir)}
                  disabled={!canAddMove}
                  aria-label={dir}
                  className="flex h-12 items-center justify-center rounded-2xl bg-white/95 text-2xl font-black text-slate-900 shadow-lg transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
                >
                  {DIR_DEF[dir].glyph}
                </button>
              ))}
              <button
                type="button"
                onClick={openPicker}
                disabled={!canOpenLoop}
                aria-label="Repeat block"
                className="flex h-12 items-center justify-center rounded-2xl bg-amber-300 text-2xl shadow-lg transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
              >
                {REPEAT_GLYPH}
              </button>
              <button
                type="button"
                onClick={addEnd}
                disabled={!canCloseLoop}
                aria-label="End repeat"
                className={`flex h-12 items-center justify-center rounded-2xl bg-amber-300 text-2xl shadow-lg transition active:scale-90 disabled:opacity-40 disabled:active:scale-100 ${
                  mustCloseLoop ? "animate-wiggle" : ""
                }`}
              >
                {END_GLYPH}
              </button>
            </div>
          )}

          {/* Run + edit controls. */}
          <div className="flex w-full max-w-md items-center gap-2">
            <BigButton onClick={go} disabled={!canRun} className="flex-1 !px-4 !py-3">
              ▶ GO
            </BigButton>
            <button
              type="button"
              onClick={undo}
              disabled={running || program.length === 0}
              aria-label="Undo last block"
              className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-white/20 px-3 text-xl font-black text-white backdrop-blur transition active:scale-90 disabled:opacity-40"
            >
              ⌫
            </button>
            <button
              type="button"
              onClick={clearProgram}
              disabled={running || program.length === 0}
              aria-label="Clear program"
              className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-white/20 px-3 text-xl font-black text-white backdrop-blur transition active:scale-90 disabled:opacity-40"
            >
              🗑
            </button>
          </div>
        </div>
      )}
    </GameShell>
  );
}
