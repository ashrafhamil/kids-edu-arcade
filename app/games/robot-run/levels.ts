// Handcrafted mazes for Robot Run, authored as readable ASCII rows and parsed
// once into typed `Level` objects. Every level is verified solvable (the goal is
// reachable from the start by orthogonal moves), so a valid arrow-block program
// always exists for a child to discover.
//
// Legend:  R = robot start   S = star (goal)   # = wall   G = gem   . = floor

export type Pos = { x: number; y: number };

export type Level = {
  cols: number;
  rows: number;
  start: Pos;
  goal: Pos;
  /** "x,y" keys for fast lookup during the run loop. */
  walls: Set<string>;
  gems: Set<string>;
};

export const cellKey = (x: number, y: number): string => `${x},${y}`;

/** Difficulty grows: 4x4 trivial → 6x6 with walls, gems and a long path. */
const RAW_LEVELS: string[][] = [
  // 1 — straight line, one direction
  ["R..S", "....", "....", "...."],
  // 2 — first corner, two directions
  ["R...", "....", "....", "...S"],
  // 3 — go over the wall row
  ["R...", "###.", "...S", "...."],
  // 4 — first gem to grab on the way down
  ["R.G.", "....", "....", "...S"],
  // 5 — weave through a comb of walls
  ["R....", ".###.", ".....", ".###.", "...S."],
  // 6 — gem in the far corner, longer detour
  ["R...G", ".###.", ".....", ".###.", "S...."],
  // 7 — tight squeeze with a gem in the middle
  ["R.#..", "..#.#", "#.G..", "#.##.", "..#.S"],
  // 8 — first 6x6, a winding ten-step path
  ["R.....", ".####.", "....#.", ".##.#.", ".#....", ".####S"],
  // 9 — 6x6 with a gem tucked top-right
  ["R....G", ".####.", "......", ".####.", "......", "#####S"],
  // 10 — grand serpentine: the longest path, gem along the way
  ["R.....", "#####.", "..G...", ".#####", "......", "#####S"],
];

function parseLevel(grid: string[]): Level {
  const rows = grid.length;
  const cols = grid[0].length;
  const walls = new Set<string>();
  const gems = new Set<string>();
  let start: Pos = { x: 0, y: 0 };
  let goal: Pos = { x: 0, y: 0 };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = grid[y][x];
      if (ch === "R") start = { x, y };
      else if (ch === "S") goal = { x, y };
      else if (ch === "#") walls.add(cellKey(x, y));
      else if (ch === "G") gems.add(cellKey(x, y));
    }
  }

  return { cols, rows, start, goal, walls, gems };
}

export const LEVELS: Level[] = RAW_LEVELS.map(parseLevel);
export const LEVEL_COUNT = LEVELS.length;
