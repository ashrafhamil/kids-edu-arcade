// Hand-authored logic-grid puzzles plus the pure grid helpers the UI drives.
//
// Every clue is a *unary* constraint: it only ever rules cells of the
// person x item grid in or out. That keeps two promises at once —
//   1. each puzzle is solvable by plain row/column elimination, never a guess;
//   2. a brute-force pass over all permutations finds exactly ONE solution.
// Both were verified before shipping (see the report in the build notes).
//
// Clue sentences are generated from the structured clue by `clueText`, so the
// words a child reads can never drift away from what the solver checks.

export type Gender = "boy" | "girl";

export type Person = { name: string; gender: Gender };
export type Item = { name: string; emoji: string };

export type Clue =
  /** "Mei has the ball." */
  | { kind: "is"; person: number; item: number }
  /** "Ali does not have the drum." */
  | { kind: "not"; person: number; item: number }
  /** "Ravi has the racket or the skates." */
  | { kind: "oneOf"; person: number; items: number[] }
  /** "Neither Amir nor Lina has the drum." */
  | { kind: "noneOf"; people: number[]; item: number }
  /** "The kid with the crown is a girl." */
  | { kind: "gender"; item: number; gender: Gender };

export type Puzzle = {
  /** 1-based puzzle number, shown to the child. */
  id: number;
  theme: string;
  emoji: string;
  /** Fills the prompt "Who has which ___?" */
  subject: string;
  people: Person[];
  items: Item[];
  clues: Clue[];
  /** solution[personIndex] = itemIndex. */
  solution: number[];
};

const BOY = (name: string): Person => ({ name, gender: "boy" });
const GIRL = (name: string): Person => ({ name, gender: "girl" });

/**
 * Difficulty ramp: puzzles 1-6 are 3x3, puzzles 7-10 are 4x4. Clue wording also
 * ramps — plain "does not have" first, then gender / either-or / neither-nor.
 */
export const PUZZLES: Puzzle[] = [
  {
    id: 1,
    theme: "Toy Time",
    emoji: "🧸",
    subject: "toy",
    people: [BOY("Ali"), GIRL("Mei"), BOY("Raj")],
    items: [
      { name: "ball", emoji: "⚽" },
      { name: "kite", emoji: "🪁" },
      { name: "drum", emoji: "🥁" },
    ],
    clues: [
      { kind: "is", person: 1, item: 0 },
      { kind: "not", person: 0, item: 2 },
      { kind: "not", person: 2, item: 1 },
    ],
    solution: [1, 0, 2],
  },
  {
    id: 2,
    theme: "Fruit Snack",
    emoji: "🍎",
    subject: "fruit",
    people: [GIRL("Siti"), BOY("Amir"), GIRL("Lina")],
    items: [
      { name: "apple", emoji: "🍎" },
      { name: "banana", emoji: "🍌" },
      { name: "mango", emoji: "🥭" },
    ],
    clues: [
      { kind: "not", person: 0, item: 0 },
      { kind: "not", person: 0, item: 2 },
      { kind: "not", person: 1, item: 0 },
    ],
    solution: [1, 2, 0],
  },
  {
    id: 3,
    theme: "Pet Day",
    emoji: "🐾",
    subject: "pet",
    people: [BOY("Hafiz"), GIRL("Devi"), BOY("Wei")],
    items: [
      { name: "cat", emoji: "🐱" },
      { name: "dog", emoji: "🐶" },
      { name: "fish", emoji: "🐠" },
    ],
    clues: [
      { kind: "gender", item: 2, gender: "boy" },
      { kind: "not", person: 1, item: 1 },
      { kind: "not", person: 2, item: 2 },
    ],
    solution: [2, 0, 1],
  },
  {
    id: 4,
    theme: "Drink Stand",
    emoji: "🥤",
    subject: "drink",
    people: [GIRL("Nurul"), BOY("Ravi"), GIRL("Farah")],
    items: [
      { name: "juice", emoji: "🧃" },
      { name: "milk", emoji: "🥛" },
      { name: "water", emoji: "💧" },
    ],
    clues: [
      { kind: "oneOf", person: 0, items: [0, 1] },
      { kind: "oneOf", person: 1, items: [0, 1] },
      { kind: "gender", item: 1, gender: "girl" },
    ],
    solution: [1, 0, 2],
  },
  {
    id: 5,
    theme: "Hat Shop",
    emoji: "🧢",
    subject: "hat",
    people: [BOY("Amir"), GIRL("Lina"), GIRL("Siti")],
    items: [
      { name: "cap", emoji: "🧢" },
      { name: "crown", emoji: "👑" },
      { name: "helmet", emoji: "⛑️" },
    ],
    clues: [
      { kind: "not", person: 0, item: 0 },
      { kind: "gender", item: 1, gender: "girl" },
      { kind: "not", person: 1, item: 1 },
    ],
    solution: [2, 0, 1],
  },
  {
    id: 6,
    theme: "Sports Club",
    emoji: "🏸",
    subject: "sport kit",
    people: [BOY("Ravi"), GIRL("Farah"), GIRL("Lina")],
    items: [
      { name: "ball", emoji: "⚽" },
      { name: "racket", emoji: "🏸" },
      { name: "skates", emoji: "⛸️" },
    ],
    clues: [
      { kind: "oneOf", person: 0, items: [1, 2] },
      { kind: "gender", item: 1, gender: "boy" },
      { kind: "not", person: 1, item: 0 },
    ],
    solution: [1, 2, 0],
  },
  {
    id: 7,
    theme: "Lunch Box",
    emoji: "🍱",
    subject: "lunch",
    people: [BOY("Ali"), GIRL("Mei"), BOY("Raj"), GIRL("Siti")],
    items: [
      { name: "rice", emoji: "🍚" },
      { name: "noodles", emoji: "🍜" },
      { name: "soup", emoji: "🥣" },
      { name: "salad", emoji: "🥗" },
    ],
    clues: [
      { kind: "gender", item: 0, gender: "girl" },
      { kind: "not", person: 3, item: 0 },
      { kind: "not", person: 0, item: 3 },
      { kind: "not", person: 0, item: 1 },
      { kind: "not", person: 2, item: 1 },
    ],
    solution: [2, 0, 3, 1],
  },
  {
    id: 8,
    theme: "Music Class",
    emoji: "🎵",
    subject: "instrument",
    people: [BOY("Amir"), GIRL("Lina"), BOY("Wei"), GIRL("Devi")],
    items: [
      { name: "drum", emoji: "🥁" },
      { name: "flute", emoji: "🪈" },
      { name: "piano", emoji: "🎹" },
      { name: "guitar", emoji: "🎸" },
    ],
    clues: [
      { kind: "noneOf", people: [0, 1], item: 0 },
      { kind: "not", person: 3, item: 0 },
      { kind: "gender", item: 2, gender: "girl" },
      { kind: "not", person: 3, item: 2 },
      { kind: "not", person: 0, item: 1 },
    ],
    solution: [3, 2, 0, 1],
  },
  {
    id: 9,
    theme: "Beach Day",
    emoji: "🏖️",
    subject: "beach thing",
    people: [BOY("Ali"), GIRL("Farah"), BOY("Ravi"), GIRL("Siti")],
    items: [
      { name: "shell", emoji: "🐚" },
      { name: "ball", emoji: "🏐" },
      { name: "kite", emoji: "🪁" },
      { name: "boat", emoji: "⛵" },
    ],
    clues: [
      { kind: "not", person: 0, item: 0 },
      { kind: "not", person: 0, item: 3 },
      { kind: "gender", item: 2, gender: "girl" },
      { kind: "noneOf", people: [1, 2], item: 0 },
      { kind: "not", person: 1, item: 3 },
    ],
    solution: [1, 2, 3, 0],
  },
  {
    id: 10,
    theme: "Space Camp",
    emoji: "🚀",
    subject: "space badge",
    people: [GIRL("Mei"), BOY("Hafiz"), GIRL("Devi"), BOY("Wei")],
    items: [
      { name: "rocket", emoji: "🚀" },
      { name: "star", emoji: "⭐" },
      { name: "moon", emoji: "🌙" },
      { name: "comet", emoji: "☄️" },
    ],
    clues: [
      { kind: "not", person: 1, item: 1 },
      { kind: "not", person: 3, item: 2 },
      { kind: "not", person: 2, item: 1 },
      { kind: "not", person: 3, item: 1 },
      { kind: "not", person: 1, item: 3 },
      { kind: "not", person: 3, item: 3 },
    ],
    solution: [1, 2, 3, 0],
  },
];

export const PUZZLE_COUNT = PUZZLES.length;

/** Grid width of a puzzle — 3 or 4. */
export function sizeOf(puzzle: Puzzle): number {
  return puzzle.people.length;
}

/** Joins names as "Ali, Mei and Raj". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Joins item phrases as "the ball or the kite". */
function joinItems(names: string[]): string {
  const withArticle = names.map((n) => `the ${n}`);
  if (withArticle.length <= 1) return withArticle[0] ?? "";
  return `${withArticle.slice(0, -1).join(", ")} or ${withArticle[withArticle.length - 1]}`;
}

/** The sentence a child reads — always generated from the checked constraint. */
export function clueText(puzzle: Puzzle, clue: Clue): string {
  const person = (i: number) => puzzle.people[i].name;
  const item = (i: number) => puzzle.items[i].name;

  switch (clue.kind) {
    case "is":
      return `${person(clue.person)} has the ${item(clue.item)}.`;
    case "not":
      return `${person(clue.person)} does not have the ${item(clue.item)}.`;
    case "oneOf":
      return `${person(clue.person)} has ${joinItems(clue.items.map(item))}.`;
    case "noneOf":
      return clue.people.length === 2
        ? `Neither ${person(clue.people[0])} nor ${person(clue.people[1])} has the ${item(clue.item)}.`
        : `${joinNames(clue.people.map(person))} do not have the ${item(clue.item)}.`;
    case "gender":
      return `The kid with the ${item(clue.item)} is a ${clue.gender}.`;
  }
}

/** True when `itemIndex` is still allowed for `personIndex` under one clue. */
export function clueAllows(
  puzzle: Puzzle,
  clue: Clue,
  personIndex: number,
  itemIndex: number,
): boolean {
  switch (clue.kind) {
    case "is":
      if (clue.person === personIndex) return clue.item === itemIndex;
      return clue.item !== itemIndex;
    case "not":
      return !(clue.person === personIndex && clue.item === itemIndex);
    case "oneOf":
      if (clue.person !== personIndex) return true;
      return clue.items.includes(itemIndex);
    case "noneOf":
      if (!clue.people.includes(personIndex)) return true;
      return clue.item !== itemIndex;
    case "gender":
      if (clue.item !== itemIndex) return true;
      return puzzle.people[personIndex].gender === clue.gender;
  }
}

/* ------------------------------------------------------------------ *
 * Grid marks — pure helpers, no React, no storage.
 * ------------------------------------------------------------------ */

export type Mark = "blank" | "yes" | "no";

/** Row-major index into the flat marks array. */
export const cellIndex = (size: number, row: number, col: number): number =>
  row * size + col;

export function emptyMarks(size: number): Mark[] {
  return Array<Mark>(size * size).fill("blank");
}

/** Tapping a cell walks blank -> yes -> no -> blank. */
export function nextMark(current: Mark): Mark {
  if (current === "blank") return "yes";
  if (current === "yes") return "no";
  return "blank";
}

/**
 * Writes one cell. A "yes" also crosses out the rest of its row and column —
 * the move a real logic-grid solver makes by hand, and the whole teaching point
 * of the game. It overwrites any competing "yes", so the grid can never hold
 * two ticks in one row or column.
 */
export function applyMark(
  marks: Mark[],
  size: number,
  row: number,
  col: number,
  mark: Mark,
): Mark[] {
  const next = [...marks];
  next[cellIndex(size, row, col)] = mark;
  if (mark !== "yes") return next;

  for (let i = 0; i < size; i++) {
    if (i !== col) next[cellIndex(size, row, i)] = "no";
    if (i !== row) next[cellIndex(size, i, col)] = "no";
  }
  return next;
}

export function countYes(marks: Mark[]): number {
  return marks.filter((m) => m === "yes").length;
}

/**
 * A grid is ready to check once every row holds a tick. Because `applyMark`
 * keeps at most one tick per row and per column, `size` ticks means exactly one
 * per row and one per column.
 */
export function isComplete(marks: Mark[], size: number): boolean {
  return countYes(marks) === size;
}

/** Flat indices of ticks that contradict the solution. */
export function wrongCells(marks: Mark[], puzzle: Puzzle): number[] {
  const size = sizeOf(puzzle);
  const wrong: number[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = cellIndex(size, row, col);
      if (marks[i] === "yes" && puzzle.solution[row] !== col) wrong.push(i);
    }
  }
  return wrong;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/** A perfect run is 10 checks — one per puzzle. */
export const THREE_STAR_CHECKS = 13;
export const TWO_STAR_CHECKS = 18;

/** Stars for the whole set, judged on how many Check taps it took. */
export function starsFor(totalChecks: number): number {
  if (totalChecks <= THREE_STAR_CHECKS) return 3;
  if (totalChecks <= TWO_STAR_CHECKS) return 2;
  return 1;
}
