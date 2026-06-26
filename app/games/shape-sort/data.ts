// Pure, framework-free sorting logic for Shape Sort.
// Kept out of the React component so the game loop stays readable and the
// difficulty/rule/scoring rules are easy to reason about.
//
// Emoji constraint: only circle, square, and heart exist cleanly in red, green,
// and blue as standard emoji (triangles are red-only), so those are the three
// shapes. The SHAPE-rule bins use white shapes (color stripped out) and the
// COLOR-rule bins use circles (shape stripped out) so each rule has exactly one
// unambiguous cue.

export type ShapeKind = "circle" | "square" | "heart";
export type ColorKind = "red" | "green" | "blue";
export type SortRule = "shape" | "color";

export type Item = {
  id: number;
  shape: ShapeKind;
  color: ColorKind;
  /** The colored shape glyph shown big in the center. */
  emoji: string;
};

/** A discriminated bin: a shape bin matches by shape, a color bin by color. */
export type Bin =
  | { rule: "shape"; key: ShapeKind; emoji: string; label: string }
  | { rule: "color"; key: ColorKind; emoji: string; label: string };

const SHAPES: ShapeKind[] = ["circle", "square", "heart"];
const COLORS: ColorKind[] = ["red", "green", "blue"];

/** Colored shape glyphs for the center item — varies in BOTH shape and color. */
const ITEM_EMOJI: Record<ShapeKind, Record<ColorKind, string>> = {
  circle: { red: "🔴", green: "🟢", blue: "🔵" },
  square: { red: "🟥", green: "🟩", blue: "🟦" },
  heart: { red: "❤️", green: "💚", blue: "💙" },
};

/** SHAPE-rule bins: white shapes, so only the SHAPE is a cue (color removed). */
const SHAPE_BIN: Record<ShapeKind, { emoji: string; label: string }> = {
  circle: { emoji: "⚪", label: "Circle" },
  square: { emoji: "⬜", label: "Square" },
  heart: { emoji: "🤍", label: "Heart" },
};

/** COLOR-rule bins: circles, so only the COLOR is a cue (shape removed). */
const COLOR_BIN: Record<ColorKind, { emoji: string; label: string }> = {
  red: { emoji: "🔴", label: "Red" },
  green: { emoji: "🟢", label: "Green" },
  blue: { emoji: "🔵", label: "Blue" },
};

/** Difficulty band — levels up every 6 correct answers. */
export function levelFor(correctCount: number): number {
  return Math.floor(correctCount / 6);
}

/** The sorting rule flips each level: shape, color, shape, color... */
export function ruleFor(level: number): SortRule {
  return level % 2 === 0 ? "shape" : "color";
}

/** Per-item timer shrinks each level, never below 2.4s. */
export function durationFor(level: number): number {
  return Math.max(2400, 4800 - level * 400);
}

/** Stars from the final score, matching the arcade's shared thresholds. */
export function starsFor(score: number): number {
  if (score >= 500) return 3;
  if (score >= 250) return 2;
  if (score >= 100) return 1;
  return 0;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Next item with a random shape and color. Avoids repeating the exact previous
 * item so the screen always visibly changes. Bounded: only one of nine combos
 * is ever excluded, so the loop terminates immediately.
 */
export function genItem(id: number, prev: Item | null): Item {
  let shape: ShapeKind;
  let color: ColorKind;
  do {
    shape = pick(SHAPES);
    color = pick(COLORS);
  } while (prev !== null && prev.shape === shape && prev.color === color);
  return { id, shape, color, emoji: ITEM_EMOJI[shape][color] };
}

/** The three bins for the active rule, left to right. */
export function binsFor(rule: SortRule): Bin[] {
  if (rule === "shape") {
    return SHAPES.map((key) => ({ rule, key, ...SHAPE_BIN[key] }));
  }
  return COLORS.map((key) => ({ rule, key, ...COLOR_BIN[key] }));
}

/** True when the item belongs in this bin under its rule. */
export function isCorrect(item: Item, bin: Bin): boolean {
  return bin.rule === "shape" ? bin.key === item.shape : bin.key === item.color;
}
