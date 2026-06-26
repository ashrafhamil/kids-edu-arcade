"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import {
  generate,
  canMove,
  step,
  dirBetween,
  isGoal,
  sizeForLevel,
  timeForLevel,
  basePointsForLevel,
  timeBonus,
  starsFor,
  type Dir,
  type Maze,
  type Pos,
} from "./maze";

const SLUG = "maze-dash";
const MAZE_PX = 320; // target maze width; cells scale to fit inside this
const CLEAR_DELAY = 750; // celebrate a solved maze before loading the next

type Phase = "start" | "playing" | "over";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [maze, setMaze] = useState<Maze | null>(null);
  const [player, setPlayer] = useState<Pos>({ r: 0, c: 0 });
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [levelId, setLevelId] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [lastGain, setLastGain] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Refs mirror state so handlers fired from timeouts/listeners never read a
  // stale closure (graded requirement).
  const mazeRef = useRef<Maze | null>(null);
  const playerRef = useRef<Pos>({ r: 0, c: 0 });
  const levelRef = useRef(1);
  const scoreRef = useRef(0);
  const activeRef = useRef(false); // true only while a move is allowed
  const levelStartRef = useRef(0);
  const timers = useRef<number[]>([]);
  const moveRef = useRef<(dir: Dir) => void>(() => {});

  // Load persisted best after mount (SSR-safe), deferred off the render pass.
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Respect reduced-motion for the player's slide tween (read once on mount,
  // deferred off the render pass to avoid a synchronous-setState cascade).
  useEffect(() => {
    const id = window.setTimeout(
      () => setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
      0,
    );
    return () => window.clearTimeout(id);
  }, []);

  // Clear pending timers and freeze moves if the player leaves mid-run.
  useEffect(() => {
    return () => {
      activeRef.current = false;
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

  function beginLevel(nextLevel: number): void {
    const m = generate(sizeForLevel(nextLevel));
    const start: Pos = { r: 0, c: 0 };
    mazeRef.current = m;
    playerRef.current = start;
    levelRef.current = nextLevel;
    levelStartRef.current = Date.now();
    activeRef.current = true;
    setMaze(m);
    setPlayer(start);
    setLevel(nextLevel);
    setResolving(false);
    setLevelId((id) => id + 1); // restart the countdown bar from full
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    scoreRef.current = 0;
    setScore(0);
    setNewBest(false);
    setPhase("playing");
    beginLevel(1);
  }

  // Fired by the countdown bar. Guarded so a stray timeout during the
  // level-clear gap can never wrongly end the run.
  function handleTimeout(): void {
    if (!activeRef.current) return;
    endGame();
  }

  function endGame(): void {
    clearTimers();
    activeRef.current = false;
    setPhase("over");
    const finalScore = scoreRef.current;
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

  function solveLevel(): void {
    activeRef.current = false;
    setResolving(true); // freezes + cancels the countdown during the celebration

    const elapsed = Date.now() - levelStartRef.current;
    const budget = timeForLevel(levelRef.current);
    const remainingFrac = (budget - elapsed) / budget;
    const gained = basePointsForLevel(levelRef.current) + timeBonus(remainingFrac);

    scoreRef.current += gained;
    setScore(scoreRef.current);
    setLastGain(gained);
    setBurst((b) => b + 1);
    sfx.levelUp();

    schedule(() => beginLevel(levelRef.current + 1), CLEAR_DELAY);
  }

  function move(dir: Dir): void {
    if (!activeRef.current) return;
    const m = mazeRef.current;
    if (!m) return;
    const p = playerRef.current;

    if (!canMove(m, p.r, p.c, dir)) {
      sfx.tick(); // soft bump — no progress
      return;
    }

    const np = step(p, dir);
    playerRef.current = np;
    setPlayer(np);
    sfx.click();

    if (isGoal(m, np)) solveLevel();
  }

  // Tap an orthogonally-adjacent cell to step onto it (nice on touch).
  function tapCell(target: Pos): void {
    if (!activeRef.current) return;
    const dir = dirBetween(playerRef.current, target);
    if (dir) move(dir);
  }

  // Keep the keyboard handler pointed at the latest `move` without re-binding.
  useEffect(() => {
    moveRef.current = move;
  });

  // Desktop bonus: arrow keys / WASD. Refs keep it stale-closure-free.
  useEffect(() => {
    if (phase !== "playing") return;
    const KEYS: Record<string, Dir> = {
      ArrowUp: "N", ArrowDown: "S", ArrowLeft: "W", ArrowRight: "E",
      w: "N", s: "S", a: "W", d: "E",
      W: "N", S: "S", A: "W", D: "E",
    };
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      moveRef.current(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const liveStats = (
    <>
      <StatBadge label="Level" value={level} />
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={48} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel
          score={score}
          level={level}
          best={best}
          newBest={newBest}
          onPlay={startGame}
        />
      )}

      {phase === "playing" && maze && (
        <div className="flex w-full flex-col items-center gap-5">
          <div className="w-full max-w-xs px-1">
            <TimerBar
              levelId={levelId}
              durationMs={timeForLevel(level)}
              paused={resolving}
              onTimeout={handleTimeout}
            />
          </div>

          <MazeBoard
            maze={maze}
            player={player}
            reducedMotion={reducedMotion}
            cleared={resolving}
            gain={lastGain}
            gainKey={burst}
            onTapCell={tapCell}
          />

          <ArrowPad disabled={resolving} onMove={move} />
        </div>
      )}
    </GameShell>
  );
}

// ---- Board -----------------------------------------------------------------

const TILE = "#fffaf0";
const START_TILE = "#dcfce7";
const GOAL_TILE = "#fde68a";
const WALL_COLOR = "#1e293b";

function MazeBoard({
  maze,
  player,
  reducedMotion,
  cleared,
  gain,
  gainKey,
  onTapCell,
}: {
  maze: Maze;
  player: Pos;
  reducedMotion: boolean;
  cleared: boolean;
  gain: number;
  gainKey: number;
  onTapCell: (target: Pos) => void;
}) {
  const { size } = maze;
  const cellPx = Math.floor(MAZE_PX / size);
  const wall = size <= 6 ? 4 : 3;
  const emoji = Math.round(cellPx * 0.6);

  const slide = reducedMotion ? "none" : "transform 110ms ease-out";

  return (
    <div className="relative">
      <div
        className="relative rounded-xl shadow-xl shadow-black/30"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, ${cellPx}px)`,
          gridTemplateRows: `repeat(${size}, ${cellPx}px)`,
          width: size * cellPx + wall,
          height: size * cellPx + wall,
          boxSizing: "border-box",
          // Outer right/bottom boundary; top/left come from row 0 / col 0 cells.
          borderRight: `${wall}px solid ${WALL_COLOR}`,
          borderBottom: `${wall}px solid ${WALL_COLOR}`,
        }}
      >
        {maze.cells.map((cell, i) => {
          const r = Math.floor(i / size);
          const c = i % size;
          const goalCell = r === size - 1 && c === size - 1;
          const startCell = r === 0 && c === 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onTapCell({ r, c })}
              aria-label={`Cell row ${r + 1}, column ${c + 1}`}
              style={{
                width: cellPx,
                height: cellPx,
                boxSizing: "border-box",
                background: startCell ? START_TILE : goalCell ? GOAL_TILE : TILE,
                borderTop: cell.N ? `${wall}px solid ${WALL_COLOR}` : "none",
                borderLeft: cell.W ? `${wall}px solid ${WALL_COLOR}` : "none",
              }}
            />
          );
        })}

        {/* Goal + player float above the tiles; pointer-events-none so taps reach cells. */}
        <span
          className="pointer-events-none absolute left-0 top-0 flex items-center justify-center"
          style={{
            width: cellPx,
            height: cellPx,
            fontSize: emoji,
            transform: `translate(${(size - 1) * cellPx}px, ${(size - 1) * cellPx}px)`,
          }}
          aria-hidden
        >
          ⭐
        </span>
        <span
          className="pointer-events-none absolute left-0 top-0 z-10 flex items-center justify-center"
          style={{
            width: cellPx,
            height: cellPx,
            fontSize: emoji,
            transform: `translate(${player.c * cellPx}px, ${player.r * cellPx}px)`,
            transition: slide,
          }}
          aria-label="Player"
        >
          🐭
        </span>
      </div>

      {cleared && (
        <span
          key={gainKey}
          className="float-score pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 text-3xl font-black text-white drop-shadow"
        >
          +{gain}
        </span>
      )}
    </div>
  );
}

// ---- Controls --------------------------------------------------------------

function ArrowPad({
  disabled,
  onMove,
}: {
  disabled: boolean;
  onMove: (dir: Dir) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span />
      <MoveButton label="⬆️" dir="N" disabled={disabled} onMove={onMove} />
      <span />
      <MoveButton label="⬅️" dir="W" disabled={disabled} onMove={onMove} />
      <span />
      <MoveButton label="➡️" dir="E" disabled={disabled} onMove={onMove} />
      <span />
      <MoveButton label="⬇️" dir="S" disabled={disabled} onMove={onMove} />
      <span />
    </div>
  );
}

function MoveButton({
  label,
  dir,
  disabled,
  onMove,
}: {
  label: string;
  dir: Dir;
  disabled: boolean;
  onMove: (dir: Dir) => void;
}) {
  const aria: Record<Dir, string> = { N: "Move up", S: "Move down", W: "Move left", E: "Move right" };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onMove(dir)}
      aria-label={aria[dir]}
      className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/25 text-3xl backdrop-blur transition active:scale-90 hover:bg-white/35 disabled:opacity-50 disabled:active:scale-100"
    >
      {label}
    </button>
  );
}

// ---- Panels ----------------------------------------------------------------

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">{meta.emoji}</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Maze Dash</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Use the arrows to guide the 🐭 through the maze to reach the ⭐. Tap a
        nearby open square to hop there too!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ⏱️ Beat the timer each maze &middot; ⭐ at 250 / 600 / 1050 pts
      </p>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>▶ Play</BigButton>
      </div>
    </Panel>
  );
}

function OverPanel({
  score,
  level,
  best,
  newBest,
  onPlay,
}: {
  score: number;
  level: number;
  best: number;
  newBest: boolean;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl">{newBest ? "🏆" : meta.emoji}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Time&apos;s Up!</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-orange-600">{score}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">points</div>
      <div className="mt-2 text-base font-bold text-slate-600">Reached Level {level}</div>
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
