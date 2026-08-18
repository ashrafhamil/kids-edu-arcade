// Puzzle data for Symmetry Paint.
//
// Only the LEFT half of every picture is authored. The right half the child has
// to paint is always derived from that left half by `mirrorRow`, so the two
// halves can never drift apart: there is exactly one place a pattern is written
// down, and exactly one rule that turns it into the expected answer.
//
// Rows are written as ASCII art ("X" = painted, anything else = empty) purely so
// the picture is visible in source; `parseHalf` turns each drawing into the
// `boolean[][]` the game actually works with. Grid width is never stored — it is
// twice the authored half-width, which keeps every grid an even width and the
// mirror line exactly down the middle.

/** A painted/empty flag per cell, row-major. */
export type Half = boolean[][];

export type Puzzle = {
  id: string;
  /** Spoken label for screen readers only — the game itself needs no reading. */
  name: string;
  emoji: string;
  /** LEFT half of the picture. The right half is derived, never authored. */
  left: Half;
  /** Paint colour for this picture. */
  ink: string;
};

const PAINTED = "X";

/** Turn one ASCII drawing into a boolean grid. Pure, so it is safe at module scope. */
function parseHalf(rows: string[]): Half {
  return rows.map((row) => [...row].map((char) => char.toUpperCase() === PAINTED));
}

/** The single mirroring rule: a row reflected across the centre line. */
export function mirrorRow(row: boolean[]): boolean[] {
  return [...row].reverse();
}

/** The right half the child must produce, derived from the authored left half. */
export function expectedRight(left: Half): Half {
  return left.map(mirrorRow);
}

/** Half-width in cells (the authored side). */
export function halfWidth(puzzle: Puzzle): number {
  return puzzle.left[0].length;
}

/** Full grid width in cells — always even, because it is twice the half. */
export function gridWidth(puzzle: Puzzle): number {
  return halfWidth(puzzle) * 2;
}

export function rowCount(puzzle: Puzzle): number {
  return puzzle.left.length;
}

/** An all-empty right half, sized to the puzzle. */
export function emptyRight(puzzle: Puzzle): Half {
  return puzzle.left.map((row) => row.map(() => false));
}

/** Whether the cell at (row, col) of the right half is meant to be painted. */
export function shouldBePainted(puzzle: Puzzle, row: number, col: number): boolean {
  return mirrorRow(puzzle.left[row])[col];
}

/** True once the painted right half is the exact mirror of the left half. */
export function isMirrored(puzzle: Puzzle, right: Half): boolean {
  const target = expectedRight(puzzle.left);
  return target.every((row, r) => row.every((cell, c) => cell === right[r][c]));
}

/**
 * How many cells of the right half do not yet match the mirror — missing cells
 * and misplaced ones alike, so the count reaches zero exactly when the picture
 * clears and never reads "done" while an ✕ is still on the board.
 */
export function cellsRemaining(puzzle: Puzzle, right: Half): number {
  const target = expectedRight(puzzle.left);
  return target.reduce(
    (total, row, r) => total + row.filter((cell, c) => cell !== right[r][c]).length,
    0,
  );
}

// Ordered easy → hard: 4×4, 4×4, 6×6, 6×6, 8×8, 8×8. Each picture is obviously
// lopsided until the second half lands, which is the whole point of the game.
export const PUZZLES: Puzzle[] = [
  {
    id: "heart",
    name: "Heart",
    emoji: "❤️",
    ink: "#ef4444",
    left: parseHalf([
      "X.",
      "XX",
      "XX",
      ".X",
    ]),
  },
  {
    id: "arrow",
    name: "Arrow",
    emoji: "⬆️",
    ink: "#3b82f6",
    left: parseHalf([
      ".X",
      "XX",
      ".X",
      ".X",
    ]),
  },
  {
    id: "butterfly",
    name: "Butterfly",
    emoji: "🦋",
    ink: "#a855f7",
    left: parseHalf([
      "XX.",
      "XXX",
      "XXX",
      ".XX",
      "..X",
      "..X",
    ]),
  },
  {
    id: "tree",
    name: "Tree",
    emoji: "🌳",
    ink: "#16a34a",
    left: parseHalf([
      "..X",
      ".XX",
      "XXX",
      "XXX",
      "..X",
      ".XX",
    ]),
  },
  {
    id: "face",
    name: "Face",
    emoji: "🙂",
    ink: "#f59e0b",
    left: parseHalf([
      "..XX",
      ".XXX",
      "XXXX",
      "X.XX",
      "XXXX",
      "XXX.",
      ".XXX",
      "..XX",
    ]),
  },
  {
    id: "flower",
    name: "Flower",
    emoji: "🌸",
    ink: "#ec4899",
    left: parseHalf([
      ".XX.",
      "XXXX",
      "XXXX",
      ".XX.",
      "...X",
      ".X.X",
      "...X",
      "..XX",
    ]),
  },
];

export const TOTAL_PUZZLES = PUZZLES.length;

/**
 * Stars for one finished picture, from how many distinct cells were painted in
 * the wrong place at any point during the attempt:
 *   0 wrong cells → ⭐⭐⭐ · 1–2 → ⭐⭐ · 3 or more → ⭐
 * Painting is never punished beyond that — a cleared picture always earns a star.
 */
export function starsFor(wrongCells: number): number {
  if (wrongCells === 0) return 3;
  if (wrongCells <= 2) return 2;
  return 1;
}
