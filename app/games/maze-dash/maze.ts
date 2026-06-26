// Pure, framework-free maze logic for Maze Dash.
// No React, no module-level randomness — `generate(size)` is the only function
// that touches Math.random, and only when called (from an effect/handler).
//
// Wall model: every cell owns four boolean walls (N/E/S/W); `true` means a wall
// is present on that side. The carver removes shared walls SYMMETRICALLY, so a
// wall between two cells is recorded identically on both — which is exactly what
// lets `canMove` (collision) and the border rendering agree without drift.

export type Dir = "N" | "E" | "S" | "W";
export type Cell = { N: boolean; E: boolean; S: boolean; W: boolean };
export type Pos = { r: number; c: number };
export type Maze = { size: number; cells: Cell[] };

export const DIRS: Dir[] = ["N", "E", "S", "W"];

const OPPOSITE: Record<Dir, Dir> = { N: "S", S: "N", E: "W", W: "E" };
const DELTA: Record<Dir, { dr: number; dc: number }> = {
  N: { dr: -1, dc: 0 },
  S: { dr: 1, dc: 0 },
  E: { dr: 0, dc: 1 },
  W: { dr: 0, dc: -1 },
};

export function idx(r: number, c: number, size: number): number {
  return r * size + c;
}

function inBounds(r: number, c: number, size: number): boolean {
  return r >= 0 && c >= 0 && r < size && c < size;
}

export function cellAt(maze: Maze, r: number, c: number): Cell {
  return maze.cells[idx(r, c, maze.size)];
}

/**
 * Recursive-backtracker (randomized DFS) carver. Starts with every wall present
 * and visits all cells via a stack, knocking down one shared wall per step. The
 * result is a "perfect" maze (a spanning tree): exactly one path between any two
 * cells, so start (0,0) can ALWAYS reach the goal (size-1, size-1). Outer-
 * boundary walls are never candidates for carving, so the player can't leave.
 */
export function generate(size: number): Maze {
  const cells: Cell[] = Array.from({ length: size * size }, () => ({
    N: true,
    E: true,
    S: true,
    W: true,
  }));
  const visited = new Array<boolean>(size * size).fill(false);
  const stack: Pos[] = [{ r: 0, c: 0 }];
  visited[idx(0, 0, size)] = true;

  while (stack.length > 0) {
    const cur = stack[stack.length - 1];

    const options: { dir: Dir; r: number; c: number }[] = [];
    for (const dir of DIRS) {
      const nr = cur.r + DELTA[dir].dr;
      const nc = cur.c + DELTA[dir].dc;
      if (inBounds(nr, nc, size) && !visited[idx(nr, nc, size)]) {
        options.push({ dir, r: nr, c: nc });
      }
    }

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const pick = options[Math.floor(Math.random() * options.length)];
    // Remove the wall between `cur` and `pick` on BOTH cells (symmetric).
    cells[idx(cur.r, cur.c, size)][pick.dir] = false;
    cells[idx(pick.r, pick.c, size)][OPPOSITE[pick.dir]] = false;
    visited[idx(pick.r, pick.c, size)] = true;
    stack.push({ r: pick.r, c: pick.c });
  }

  return { size, cells };
}

/** Can the player at (r,c) step in `dir`? False if it would leave the grid or a wall blocks it. */
export function canMove(maze: Maze, r: number, c: number, dir: Dir): boolean {
  const nr = r + DELTA[dir].dr;
  const nc = c + DELTA[dir].dc;
  if (!inBounds(nr, nc, maze.size)) return false;
  return !cellAt(maze, r, c)[dir];
}

export function step(pos: Pos, dir: Dir): Pos {
  return { r: pos.r + DELTA[dir].dr, c: pos.c + DELTA[dir].dc };
}

/** Direction from `from` to `to` if they're orthogonally adjacent, else null (for tap-to-move). */
export function dirBetween(from: Pos, to: Pos): Dir | null {
  const dr = to.r - from.r;
  const dc = to.c - from.c;
  if (dr === -1 && dc === 0) return "N";
  if (dr === 1 && dc === 0) return "S";
  if (dr === 0 && dc === 1) return "E";
  if (dr === 0 && dc === -1) return "W";
  return null;
}

export function isGoal(maze: Maze, pos: Pos): boolean {
  return pos.r === maze.size - 1 && pos.c === maze.size - 1;
}

// ---- Difficulty / scoring curve -------------------------------------------

export const START_SIZE = 5;
export const MAX_SIZE = 9;

/** Mazes grow by one cell per level, capped at MAX_SIZE. */
export function sizeForLevel(level: number): number {
  return Math.min(START_SIZE + (level - 1), MAX_SIZE);
}

const MIN_TIME = 8000;

/**
 * Countdown budget for a level. Generous while mazes are small, then tightens as
 * the endless climb continues so every run eventually ends and "best" is fair.
 */
export function timeForLevel(level: number): number {
  const base = 12000 + (sizeForLevel(level) - START_SIZE) * 3500; // 12s..26s
  return Math.max(MIN_TIME, base - (level - 1) * 400);
}

const BONUS_MAX = 80;

/** Flat reward for clearing a level, larger for bigger mazes. */
export function basePointsForLevel(level: number): number {
  return 80 + (sizeForLevel(level) - START_SIZE) * 10; // 80..120
}

/** Speed bonus from the fraction of the timer still remaining at the moment of solving. */
export function timeBonus(remainingFrac: number): number {
  const f = Math.max(0, Math.min(1, remainingFrac));
  return Math.round(f * BONUS_MAX);
}

/** Stars from the final run score, tuned to reaching ~3 / ~6 / ~10 levels. */
export function starsFor(score: number): number {
  if (score >= 1050) return 3;
  if (score >= 600) return 2;
  if (score >= 250) return 1;
  return 0;
}
