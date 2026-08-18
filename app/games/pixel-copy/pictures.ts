// Hand-authored pixel pictures for Pixel Copy.
//
// Every picture is a 2D array of palette indices, one number per grid cell.
// `0` means "leave this square blank"; `1`–`8` are the 1-based positions in
// PALETTE below. Authoring them as plain data keeps Game.tsx a thin renderer
// and lets the whole set be proof-read as coloured blocks in a scratch script.

/** One paint colour. `ink` is the readable text colour to print on top of it,
 *  used for the swatch number that makes the game playable colour-blind. */
export type Swatch = { index: number; name: string; hex: string; ink: string };

/** A blank square. Never appears in PALETTE — it is the absence of paint. */
export const EMPTY = 0;

/** Eight colours, every one of them used by at least one picture. The `index`
 *  is what the picture grids store, and what is printed on the swatch. */
export const PALETTE: Swatch[] = [
  { index: 1, name: "Red", hex: "#ef4444", ink: "#ffffff" },
  { index: 2, name: "Orange", hex: "#f97316", ink: "#ffffff" },
  { index: 3, name: "Yellow", hex: "#facc15", ink: "#422006" },
  { index: 4, name: "Green", hex: "#22c55e", ink: "#052e16" },
  { index: 5, name: "Blue", hex: "#3b82f6", ink: "#ffffff" },
  { index: 6, name: "Pink", hex: "#ec4899", ink: "#ffffff" },
  { index: 7, name: "Brown", hex: "#92400e", ink: "#ffffff" },
  { index: 8, name: "Black", hex: "#1e293b", ink: "#ffffff" },
];

/** Colour of an unpainted square on both grids. */
export const BLANK_HEX = "#e2e8f0";

export type Picture = {
  id: string;
  name: string;
  emoji: string;
  /** Side length; `grid` is always `size` rows of `size` numbers. */
  size: number;
  grid: number[][];
};

// Ordered smallest → largest, 5×5 up to 10×10. The array order IS the
// difficulty ramp: a bigger grid means more squares to place and more colours
// to juggle. `pictureFor` below is the only way the game reads it.
export const PICTURES: Picture[] = [
  {
    id: "heart",
    name: "Heart",
    emoji: "❤️",
    size: 5,
    grid: [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ],
  },
  {
    id: "star",
    name: "Star",
    emoji: "⭐",
    size: 5,
    grid: [
      [0, 0, 3, 0, 0],
      [3, 3, 3, 3, 3],
      [0, 3, 3, 3, 0],
      [0, 3, 0, 3, 0],
      [3, 0, 0, 0, 3],
    ],
  },
  {
    id: "smiley",
    name: "Smiley",
    emoji: "🙂",
    size: 6,
    grid: [
      [0, 3, 3, 3, 3, 0],
      [3, 3, 3, 3, 3, 3],
      [3, 8, 3, 3, 8, 3],
      [3, 3, 3, 3, 3, 3],
      [3, 8, 8, 8, 8, 3],
      [0, 3, 3, 3, 3, 0],
    ],
  },
  {
    id: "tree",
    name: "Tree",
    emoji: "🌳",
    size: 7,
    grid: [
      [0, 0, 0, 4, 0, 0, 0],
      [0, 0, 4, 4, 4, 0, 0],
      [0, 4, 4, 4, 4, 4, 0],
      [4, 4, 4, 4, 4, 4, 4],
      [0, 0, 4, 4, 4, 0, 0],
      [0, 0, 0, 7, 0, 0, 0],
      [0, 0, 0, 7, 0, 0, 0],
    ],
  },
  {
    id: "fish",
    name: "Fish",
    emoji: "🐟",
    size: 7,
    grid: [
      [0, 0, 0, 0, 0, 0, 2],
      [0, 0, 2, 2, 2, 0, 2],
      [0, 2, 2, 2, 2, 2, 2],
      [2, 8, 2, 2, 2, 2, 2],
      [0, 2, 2, 2, 2, 2, 2],
      [0, 0, 2, 2, 2, 0, 2],
      [0, 0, 0, 0, 0, 0, 2],
    ],
  },
  {
    id: "house",
    name: "House",
    emoji: "🏠",
    size: 8,
    grid: [
      [0, 0, 0, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1],
      [0, 3, 3, 3, 3, 3, 3, 0],
      [0, 3, 5, 5, 3, 7, 7, 0],
      [0, 3, 5, 5, 3, 7, 7, 0],
      [0, 3, 3, 3, 3, 7, 7, 0],
    ],
  },
  {
    id: "flower",
    name: "Flower",
    emoji: "🌸",
    size: 9,
    grid: [
      [0, 0, 0, 6, 6, 6, 0, 0, 0],
      [0, 0, 6, 6, 6, 6, 6, 0, 0],
      [0, 6, 6, 3, 3, 3, 6, 6, 0],
      [0, 6, 6, 3, 3, 3, 6, 6, 0],
      [0, 0, 6, 6, 6, 6, 6, 0, 0],
      [0, 0, 0, 0, 4, 0, 0, 0, 0],
      [0, 0, 4, 4, 4, 0, 0, 0, 0],
      [0, 0, 0, 0, 4, 4, 4, 0, 0],
      [0, 0, 0, 0, 4, 0, 0, 0, 0],
    ],
  },
  {
    id: "rocket",
    name: "Rocket",
    emoji: "🚀",
    size: 10,
    grid: [
      [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 5, 5, 5, 5, 0, 0, 0],
      [0, 0, 0, 5, 3, 3, 5, 0, 0, 0],
      [0, 0, 0, 5, 3, 3, 5, 0, 0, 0],
      [0, 0, 0, 5, 5, 5, 5, 0, 0, 0],
      [0, 0, 1, 5, 5, 5, 5, 1, 0, 0],
      [0, 1, 1, 5, 5, 5, 5, 1, 1, 0],
      [0, 0, 0, 2, 2, 2, 2, 0, 0, 0],
      [0, 0, 0, 0, 2, 2, 0, 0, 0, 0],
    ],
  },
];

export const TOTAL_PICTURES = PICTURES.length;

/** Half the book, rounded up — the shared threshold for the 2-star tier. */
const HALF_BOOK = Math.ceil(TOTAL_PICTURES / 2);

/** Mistakes allowed while still keeping the second star on a picture. */
const SLOPPY_AFTER = 3;

/** The picture for a 0-based level index, clamped so a stale stored level can
 *  never index past the end of the book. */
export function pictureFor(levelIndex: number): Picture {
  const safe = Math.min(Math.max(levelIndex, 0), TOTAL_PICTURES - 1);
  return PICTURES[safe];
}

/** Row-major flattening, so the game can compare grids with one loop. */
export function flatten(picture: Picture): number[] {
  return picture.grid.flat();
}

/** A fresh, all-blank canvas the same size as `picture`. */
export function blankCanvas(picture: Picture): number[] {
  return new Array<number>(picture.size * picture.size).fill(EMPTY);
}

/**
 * How close the canvas is to the target, as a 0–100 whole number.
 *
 * Squares that are blank in *both* grids are ignored, so a fresh canvas reads
 * 0% instead of a confusing "already 60% done". Painting the right colour in
 * the right place is the only thing that raises it; a wrong or extra square
 * lowers it. Floored, so it can never show 100 while a square is still wrong.
 */
export function matchPercent(canvas: number[], target: number[]): number {
  let matched = 0;
  let counted = 0;
  for (let i = 0; i < target.length; i += 1) {
    const want = target[i];
    const have = canvas[i];
    if (want === EMPTY && have === EMPTY) continue;
    counted += 1;
    if (want === have) matched += 1;
  }
  if (counted === 0) return 0;
  return Math.floor((matched / counted) * 100);
}

/** True only on an exact square-for-square match — never derived from the
 *  rounded percentage, which could read 100 while a square is still wrong. */
export function isComplete(canvas: number[], target: number[]): boolean {
  return target.every((want, i) => canvas[i] === want);
}

/** Squares currently holding a colour the picture does not want there. */
export function countWrong(canvas: number[], target: number[]): number {
  return canvas.reduce(
    (total, have, i) => (have !== EMPTY && have !== target[i] ? total + 1 : total),
    0,
  );
}

/**
 * Stars for one finished picture, from the number of squares that were ever
 * painted the wrong colour: 3 for a flawless copy, 2 up to three mistakes,
 * 1 beyond that.
 */
export function starsForPicture(mistakes: number): number {
  if (mistakes === 0) return 3;
  if (mistakes <= SLOPPY_AFTER) return 2;
  return 1;
}

/**
 * Stars saved for the home hub, from the whole book rather than one picture:
 * 1 star for finishing any picture, 2 for finishing half the book, and 3 only
 * for finishing every picture with at least half of them painted flawlessly.
 * Finishing the easy 5×5 heart cleanly must not max out the game.
 */
export function starsFor(cleared: number, flawless: number): number {
  if (cleared >= TOTAL_PICTURES && flawless >= HALF_BOOK) return 3;
  if (cleared >= HALF_BOOK) return 2;
  if (cleared >= 1) return 1;
  return 0;
}

/** Fill colour for a square, blank included. */
export function colorOf(value: number): string {
  return value === EMPTY ? BLANK_HEX : PALETTE[value - 1].hex;
}

/** Spoken name of a square's colour, for screen readers and the brush bar. */
export function nameOf(value: number): string {
  return value === EMPTY ? "Blank" : PALETTE[value - 1].name;
}
