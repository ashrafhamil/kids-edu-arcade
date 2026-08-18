// Hand-authored emoji sudoku puzzles for Mini Sudoku.
//
// Each puzzle is stored as digit-string rows: "0" is a blank, 1..size is an
// index into the symbol set for that size. Every puzzle was verified to have
// exactly ONE solution, and to be solvable with naked/hidden singles alone so a
// child never has to guess. Difficulty ramps by blank count: 4x4 (2x2 boxes)
// first, then 6x6 (boxes are 3 wide by 2 tall).

export type Puzzle = {
  /** Side length of the square grid. */
  size: number;
  /** Box width in cells. */
  boxW: number;
  /** Box height in cells. */
  boxH: number;
  /** Starting clues, "0" for a blank cell. */
  given: string[];
  /** The one and only solution. */
  solution: string[];
};

/** Symbol sets. Index 1..n maps to SYMBOLS[n - 1]; colours stay distinct. */
export const SYMBOLS_4 = ["🍎", "🍌", "🍇", "🥝"];
export const SYMBOLS_6 = ["🍎", "🍌", "🍇", "🥝", "🍊", "🫐"];

export function symbolsFor(size: number): string[] {
  return size === 4 ? SYMBOLS_4 : SYMBOLS_6;
}

export const PUZZLES: Puzzle[] = [
  { size: 4, boxW: 2, boxH: 2,
    given: ["1423", "0340", "0204", "4002"],
    solution: ["1423", "2341", "3214", "4132"] },
  { size: 4, boxW: 2, boxH: 2,
    given: ["0002", "3001", "0314", "4103"],
    solution: ["1432", "3241", "2314", "4123"] },
  { size: 4, boxW: 2, boxH: 2,
    given: ["0021", "2030", "0402", "0240"],
    solution: ["4321", "2134", "3412", "1243"] },
  { size: 4, boxW: 2, boxH: 2,
    given: ["0021", "1040", "4030", "0004"],
    solution: ["3421", "1243", "4132", "2314"] },
  { size: 4, boxW: 2, boxH: 2,
    given: ["0231", "1002", "0400", "0000"],
    solution: ["4231", "1342", "2413", "3124"] },
  { size: 4, boxW: 2, boxH: 2,
    given: ["0000", "0002", "3000", "4230"],
    solution: ["2413", "1342", "3124", "4231"] },
  { size: 6, boxW: 3, boxH: 2,
    given: ["210650", "005000", "632040", "451236", "040000", "023104"],
    solution: ["214653", "365412", "632541", "451236", "146325", "523164"] },
  { size: 6, boxW: 3, boxH: 2,
    given: ["065010", "010562", "100054", "304600", "500246", "000030"],
    solution: ["265413", "413562", "126354", "354621", "531246", "642135"] },
  { size: 6, boxW: 3, boxH: 2,
    given: ["035006", "000000", "600135", "050460", "040001", "002543"],
    solution: ["435216", "216354", "624135", "351462", "543621", "162543"] },
  { size: 6, boxW: 3, boxH: 2,
    given: ["006034", "413060", "035002", "004306", "000000", "040000"],
    solution: ["256134", "413265", "635412", "124356", "362541", "541623"] },
  { size: 6, boxW: 3, boxH: 2,
    given: ["364010", "000000", "002003", "030001", "050030", "013005"],
    solution: ["364512", "521346", "142653", "635421", "256134", "413265"] },
  { size: 6, boxW: 3, boxH: 2,
    given: ["400001", "000025", "200000", "604102", "001050", "000003"],
    solution: ["425361", "136425", "213546", "654132", "361254", "542613"] },
];

export const LEVEL_COUNT = PUZZLES.length;

/** Difficulty ramp: level 1 is the easiest 4x4, level 12 the emptiest 6x6. */
export function puzzleFor(levelIndex: number): Puzzle {
  const clamped = Math.min(Math.max(levelIndex, 0), LEVEL_COUNT - 1);
  return PUZZLES[clamped];
}

/** Flatten digit-string rows into a cell array (0 = blank). */
export function toCells(rows: string[]): number[] {
  return rows.join("").split("").map(Number);
}

/** Cells sharing a row, column or box with `index` (excluding itself). */
export function peersOf(puzzle: Puzzle, index: number): number[] {
  const { size, boxW, boxH } = puzzle;
  const row = Math.floor(index / size);
  const col = index % size;
  const boxTop = Math.floor(row / boxH) * boxH;
  const boxLeft = Math.floor(col / boxW) * boxW;
  const peers = new Set<number>();

  for (let i = 0; i < size; i++) {
    peers.add(row * size + i);
    peers.add(i * size + col);
  }
  for (let y = boxTop; y < boxTop + boxH; y++) {
    for (let x = boxLeft; x < boxLeft + boxW; x++) peers.add(y * size + x);
  }
  peers.delete(index);
  return [...peers];
}

/** Standard sudoku legality: the symbol is unused in row, column and box. */
export function isValidPlacement(
  cells: number[],
  puzzle: Puzzle,
  index: number,
  value: number,
): boolean {
  return peersOf(puzzle, index).every((peer) => cells[peer] !== value);
}

/** The grid is finished when every cell matches the unique solution. */
export function isSolved(cells: number[], puzzle: Puzzle): boolean {
  const solution = toCells(puzzle.solution);
  return cells.every((value, i) => value === solution[i]);
}

/** How many copies of `value` are already on the board. */
export function placedCount(cells: number[], value: number): number {
  return cells.filter((v) => v === value).length;
}

/**
 * Stars for a whole run, based on hints used: none is a clean sweep.
 * Thresholds: 0 hints -> 3, 1-2 hints -> 2, 3+ hints -> 1.
 */
export function starsFor(hintsUsed: number): number {
  if (hintsUsed === 0) return 3;
  if (hintsUsed <= 2) return 2;
  return 1;
}
