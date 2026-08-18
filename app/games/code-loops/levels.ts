// Hand-authored mazes for Code Loops, written as readable ASCII rows and parsed
// once into typed `Level` objects — same shape as Robot Run's level data.
//
// Legend:  R = robot start   S = star (goal)   # = wall   . = floor
//
// Every level carries a `budget`: the largest program the child may build,
// counting EVERY block in the queue (each arrow, each repeat block, each end
// block). The budget is always smaller than the shortest arrow-only path, so
// listing every step can never fit — the repeat block is the only way through.
// `optimal` is the shortest looped program, used for the per-level star rating.
//
// Both numbers were verified with an exhaustive search over the block language
// (moves + one level of repeat, counts 2–5) and a BFS shortest path:
//
//   lvl  size  budget  optimal(looped)  shortest flat
//    1   5x5     3           3                4
//    2   5x5     5           4                8
//    3   5x5     7           6                8
//    4   6x6     6           4               10
//    5   6x6     6           4               10
//    6   6x6     8           7               10
//    7   7x7     9           8               12
//    8   7x7     9           8               12
//    9   7x7     7           6               12
//   10   7x7    12          11               16

export type Pos = { x: number; y: number };

export type Level = {
  cols: number;
  rows: number;
  start: Pos;
  goal: Pos;
  /** "x,y" keys for fast lookup during the run loop. */
  walls: Set<string>;
  /** Maximum blocks in the program — too few to spell the path out by hand. */
  budget: number;
  /** Shortest program that solves it, used for the star rating. */
  optimal: number;
};

export const cellKey = (x: number, y: number): string => `${x},${y}`;

type RawLevel = { grid: string[]; budget: number; optimal: number };

/** Difficulty grows: one straight run → staircases → a three-sided detour. */
const RAW_LEVELS: RawLevel[] = [
  // 1 — one straight run: repeat x4 [➡️]
  {
    grid: ["R...S", ".###.", ".....", ".###.", "....."],
    budget: 3,
    optimal: 3,
  },
  // 2 — the staircase: repeat x4 [➡️ ⬇️]
  {
    grid: ["R.###", "...##", "#....", "##...", "####S"],
    budget: 5,
    optimal: 4,
  },
  // 3 — two runs, so two loops: repeat x4 [⬇️] then repeat x4 [➡️]
  {
    grid: ["R####", ".####", ".####", ".####", "....S"],
    budget: 7,
    optimal: 6,
  },
  // 4 — a longer staircase on a bigger board
  {
    grid: ["R..###", "...###", "#....#", "##....", "###...", "####.S"],
    budget: 6,
    optimal: 4,
  },
  // 5 — the same idea climbing the other way: repeat x5 [⬅️ ⬆️]
  {
    grid: ["S#####", "..####", "#...##", "##...#", "###...", "####.R"],
    budget: 6,
    optimal: 4,
  },
  // 6 — a single step, then two loops: ⬇️ repeat x5 [➡️] repeat x4 [⬇️]
  {
    grid: ["R#####", "......", "#####.", "#####.", "#####.", "#####S"],
    budget: 8,
    optimal: 7,
  },
  // 7 — wide steps: repeat x3 [➡️ ➡️ ⬇️], then a run down
  {
    grid: ["R..####", "##...##", "####...", "######.", "######.", "######.", "######S"],
    budget: 9,
    optimal: 8,
  },
  // 8 — tall steps: repeat x3 [⬇️ ⬇️ ➡️], then a run right
  {
    grid: ["R######", ".######", "..#####", "#.#####", "#..####", "##.####", "##....S"],
    budget: 9,
    optimal: 8,
  },
  // 9 — six staircase steps, more than any single count can cover
  {
    grid: ["R.#####", "#..####", "##..###", "###..##", "####..#", "#####..", "######S"],
    budget: 7,
    optimal: 6,
  },
  // 10 — the long way round: right, down, then back left along the bottom
  {
    grid: ["R......", "######.", "######.", "######.", "######.", "######.", "##S...."],
    budget: 12,
    optimal: 11,
  },
];

function parseLevel(raw: RawLevel): Level {
  const rows = raw.grid.length;
  const cols = raw.grid[0].length;
  const walls = new Set<string>();
  let start: Pos = { x: 0, y: 0 };
  let goal: Pos = { x: 0, y: 0 };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = raw.grid[y][x];
      if (ch === "R") start = { x, y };
      else if (ch === "S") goal = { x, y };
      else if (ch === "#") walls.add(cellKey(x, y));
    }
  }

  return { cols, rows, start, goal, walls, budget: raw.budget, optimal: raw.optimal };
}

export const LEVELS: Level[] = RAW_LEVELS.map(parseLevel);
export const LEVEL_COUNT = LEVELS.length;

/** Stars for the hub card, earned by working through the levels. */
export function starsFor(levelsCleared: number): number {
  if (levelsCleared >= LEVEL_COUNT) return 3;
  if (levelsCleared >= 7) return 2;
  if (levelsCleared >= 4) return 1;
  return 0;
}

/** Stars for a single level: tight programs score higher than baggy ones. */
export function starsForProgram(blocks: number, optimal: number): number {
  if (blocks <= optimal) return 3;
  if (blocks <= optimal + 2) return 2;
  return 1;
}

/**
 * Cell size in px. The board shrinks as it grows so the whole level, the
 * program queue and the block palette all fit a 360px phone without scrolling.
 */
export function cellSizeFor(cols: number): number {
  if (cols >= 7) return 40;
  if (cols >= 6) return 44;
  return 48;
}
