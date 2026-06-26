"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, FloatScore, Panel, StarRow } from "@/components/ui";
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
import { cellKey, LEVEL_COUNT, LEVELS, type Level, type Pos } from "./levels";

const SLUG = "robot-run";
const STEP_MS = 350;
const CRASH_MS = 450;
const MAX_PROGRAM = 32;

type Dir = "up" | "down" | "left" | "right";
type Phase = "start" | "playing" | "won" | "finished";

const DIR_DEF: Record<Dir, { dx: number; dy: number; glyph: string }> = {
  up: { dx: 0, dy: -1, glyph: "⬆️" },
  down: { dx: 0, dy: 1, glyph: "⬇️" },
  left: { dx: -1, dy: 0, glyph: "⬅️" },
  right: { dx: 1, dy: 0, glyph: "➡️" },
};
const DIR_ORDER: Dir[] = ["up", "down", "left", "right"];

/** Stars persisted for the hub, based purely on how many levels are cleared. */
function starsForLevel(highestCleared: number): number {
  if (highestCleared >= LEVEL_COUNT) return 3;
  if (highestCleared >= 6) return 2;
  if (highestCleared >= 3) return 1;
  return 0;
}

// Read a persisted number straight from localStorage, hydration-safe: the server
// (and first client paint) sees 0, then it syncs to the stored value and stays
// in lockstep with every recordBest/setStars write — no setState-in-effect.
const subscribeNoop = () => () => {};
function usePersistedNumber(read: () => number): number {
  return useSyncExternalStore(subscribeNoop, read, () => 0);
}

/** Pure presentational maze. Renders the floor/walls/goal/gems + the robot. */
function LevelGrid({
  level,
  robotPos,
  collected,
  crashing,
}: {
  level: Level;
  robotPos: Pos;
  collected: Set<string>;
  crashing: boolean;
}) {
  const cells: ReactNode[] = [];
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const k = cellKey(x, y);
      const isRobot = robotPos.x === x && robotPos.y === y;
      const isGoal = level.goal.x === x && level.goal.y === y;
      const isWall = level.walls.has(k);
      const isGem = level.gems.has(k) && !collected.has(k);

      let bg = "bg-white/10";
      if (isWall) bg = "bg-emerald-950/70";
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
      } else if (isGem) {
        content = (
          <span className="animate-bob" aria-hidden>
            💎
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

  return (
    <div
      className={`mx-auto grid w-full gap-1 ${crashing ? "animate-shake" : ""}`}
      style={{
        gridTemplateColumns: `repeat(${level.cols}, minmax(0, 1fr))`,
        maxWidth: `min(100%, ${level.cols * 46}px)`,
        fontSize: "clamp(18px, 6.2vw, 30px)",
      }}
      aria-label="robot maze"
    >
      {cells}
    </div>
  );
}

export default function Game() {
  const meta = getGame(SLUG);

  const [phase, setPhase] = useState<Phase>("start");
  const [levelIndex, setLevelIndex] = useState(0);
  const [program, setProgram] = useState<Dir[]>([]);
  const [robotPos, setRobotPos] = useState<Pos>(LEVELS[0].start);
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [crashing, setCrashing] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);

  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [wonGems, setWonGems] = useState(0);
  const [streak, setStreak] = useState(0);
  // Transient "+💎" popup. Null between pickups so a stale element can never
  // linger (matches the codebase's other games, and stays invisible even when
  // prefers-reduced-motion disables the fade-out animation).
  const [gemFx, setGemFx] = useState<{ id: number } | null>(null);

  // Best level + earned stars live in localStorage; read them reactively.
  const best = usePersistedNumber(() =>
    Math.max(getBest(SLUG), getLevel(SLUG) > 1 ? getLevel(SLUG) : 0),
  );
  const earnedStars = usePersistedNumber(() => getStars(SLUG));

  const streakRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const gemFxIdRef = useRef(0);
  const gemFxTimerRef = useRef<number | null>(null);
  const level = LEVELS[levelIndex];

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showGemFx = useCallback(() => {
    gemFxIdRef.current += 1;
    setGemFx({ id: gemFxIdRef.current });
    if (gemFxTimerRef.current !== null) window.clearTimeout(gemFxTimerRef.current);
    gemFxTimerRef.current = window.setTimeout(() => setGemFx(null), 900);
  }, []);

  // Always stop any pending step/crash + popup timer when the game unmounts.
  useEffect(() => {
    return () => {
      clearTimer();
      if (gemFxTimerRef.current !== null) window.clearTimeout(gemFxTimerRef.current);
    };
  }, [clearTimer]);

  const resetRobot = useCallback((lvl: Level) => {
    setRobotPos(lvl.start);
    setCollected(new Set());
    setActiveStep(-1);
    setCrashing(false);
  }, []);

  const win = useCallback(
    (gemCount: number) => {
      clearTimer();
      setRunning(false);
      setActiveStep(-1);

      const levelNumber = levelIndex + 1;
      const isLast = levelIndex === LEVEL_COUNT - 1;
      const beat = recordBest(SLUG, levelNumber);
      const stars = starsForLevel(levelNumber);

      setLevel(SLUG, levelNumber);
      setStars(SLUG, stars);
      setNewBest(beat);
      setWonGems(gemCount);

      streakRef.current += 1;
      setStreak(streakRef.current);

      setBurst((b) => b + 1);
      sfx.levelUp();
      sfx.combo(streakRef.current); // rising chime that climbs with the win streak
      if (isLast) {
        sfx.win();
        setPhase("finished");
      } else {
        setPhase("won");
      }
    },
    [clearTimer, levelIndex],
  );

  /** Run the built program, one cell per tick, with juicy per-step feedback. */
  const go = useCallback(() => {
    if (running || program.length === 0) return;
    unlockAudio();
    sfx.click();
    setRunning(true);
    resetRobot(level);

    const steps = program;
    const got = new Set<string>();
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
        fail(); // ran out of blocks before reaching the star
        return;
      }
      setActiveStep(i);
      const def = DIR_DEF[steps[i]];
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

      const here = cellKey(nx, ny);
      if (level.gems.has(here) && !got.has(here)) {
        got.add(here);
        setCollected(new Set(got));
        showGemFx();
        sfx.pop();
      }

      if (nx === level.goal.x && ny === level.goal.y) {
        win(got.size);
        return;
      }
      timeoutRef.current = window.setTimeout(step, STEP_MS);
    };

    timeoutRef.current = window.setTimeout(step, STEP_MS);
  }, [running, program, level, resetRobot, win, showGemFx]);

  const appendDir = useCallback(
    (d: Dir) => {
      if (running) return;
      sfx.pop();
      setProgram((p) => (p.length >= MAX_PROGRAM ? p : [...p, d]));
    },
    [running],
  );

  const undo = useCallback(() => {
    if (running) return;
    sfx.click();
    setProgram((p) => p.slice(0, -1));
  }, [running]);

  const clearProgram = useCallback(() => {
    if (running) return;
    sfx.click();
    setProgram([]);
  }, [running]);

  const enterLevel = useCallback(
    (index: number) => {
      const lvl = LEVELS[index];
      setLevelIndex(index);
      setProgram([]);
      resetRobot(lvl);
      setPhase("playing");
    },
    [resetRobot],
  );

  const startFresh = useCallback(() => {
    streakRef.current = 0;
    setStreak(0);
    enterLevel(0);
  }, [enterLevel]);

  const startGame = useCallback(() => {
    unlockAudio();
    sfx.click();
    startFresh();
  }, [startFresh]);

  const nextLevel = useCallback(() => {
    sfx.click();
    enterLevel(levelIndex + 1);
  }, [enterLevel, levelIndex]);

  const playAgain = useCallback(() => {
    sfx.click();
    startFresh();
  }, [startFresh]);

  const liveStats = (
    <>
      <StatBadge label="Level" value={levelIndex + 1} />
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && (
        <Panel>
          <div className="mb-2 text-6xl">🤖</div>
          <h2 className="mb-1 text-2xl font-black">Robot Run</h2>
          <p className="mb-4 font-semibold text-slate-600">
            Tap arrow blocks to build a program, then press GO to drive the robot
            🤖 to the star ⭐. Grab 💎 for a bonus and dodge the walls 🧱!
          </p>
          <div className="mb-4 flex justify-center">
            <StarRow value={earnedStars} />
          </div>
          <BigButton onClick={startGame} className="w-full">
            ▶ Play
          </BigButton>
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
          {wonGems > 0 && (
            <p className="mt-2 font-bold text-emerald-600">
              💎 x{wonGems} bonus collected!
            </p>
          )}
          {streak > 1 && (
            <p className="mt-1 font-bold text-orange-500">
              🔥 {streak} levels in a row!
            </p>
          )}
          <div className="my-4 flex justify-center">
            <StarRow value={earnedStars} />
          </div>
          <BigButton onClick={nextLevel} className="w-full">
            Next Level ▶
          </BigButton>
        </Panel>
      )}

      {phase === "finished" && (
        <Panel>
          <div className="mb-2 text-6xl">🏆</div>
          <h2 className="text-2xl font-black">You finished all levels!</h2>
          <p className="mt-1 font-semibold text-slate-600">
            You drove the robot like a real coder. 🤖💚
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
          <div className="relative flex w-full justify-center">
            <LevelGrid
              level={level}
              robotPos={robotPos}
              collected={collected}
              crashing={crashing}
            />
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2">
              {gemFx && <FloatScore key={gemFx.id}>+💎</FloatScore>}
            </div>
          </div>

          {/* Program: the sequence of blocks the child has built. */}
          <div
            className="flex w-full max-w-md items-center gap-1.5 overflow-x-auto rounded-2xl bg-black/25 px-3 py-2"
            style={{ minHeight: 52 }}
          >
            {program.length === 0 ? (
              <span className="text-sm font-bold text-white/70">
                Tap arrows to build your program…
              </span>
            ) : (
              program.map((d, i) => (
                <span
                  key={i}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/95 text-xl shadow ${
                    i === activeStep ? "ring-4 ring-yellow-300" : ""
                  }`}
                >
                  {DIR_DEF[d].glyph}
                </span>
              ))
            )}
          </div>

          {/* Direction blocks. */}
          <div className="grid w-full max-w-md grid-cols-4 gap-2">
            {DIR_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => appendDir(d)}
                disabled={running}
                aria-label={d}
                className="flex h-12 items-center justify-center rounded-2xl bg-white/95 text-2xl font-black text-slate-900 shadow-lg transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
              >
                {DIR_DEF[d].glyph}
              </button>
            ))}
          </div>

          {/* Run + edit controls. */}
          <div className="flex w-full max-w-md items-center gap-2">
            <BigButton
              onClick={go}
              disabled={running || program.length === 0}
              className="flex-1 !px-4 !py-3"
            >
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
