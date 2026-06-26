// Color Mix — the colour engine.
//
// A "pot" is a list of paint taps. `mix()` turns any pot into ONE named colour
// via a fixed, predictable rule table (never muddy RGB averaging): the primary
// paints decide the hue, then white tints it lighter / black shades it darker.
// Targets are defined purely as recipes, and a target's displayed name + hex are
// derived by running `mix()` on its recipe — so the goal swatch and the live
// preview swatch always share a single source of truth.

export type Paint = "red" | "yellow" | "blue" | "white" | "black";

export type Mix = { name: string; hex: string };

/** The five paint blobs the child can tap, in display order. */
export const PAINTS: ReadonlyArray<{ id: Paint; label: string; hex: string }> = [
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "yellow", label: "Yellow", hex: "#facc15" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "white", label: "White", hex: "#ffffff" },
  { id: "black", label: "Black", hex: "#1f2937" },
];

type BaseHue = "Red" | "Yellow" | "Blue" | "Orange" | "Green" | "Purple" | "Brown";

const EMPTY: Mix = { name: "Empty", hex: "transparent" };

/** Pure hue, no white or black added. */
const BASE: Record<BaseHue, Mix> = {
  Red: { name: "Red", hex: "#ef4444" },
  Yellow: { name: "Yellow", hex: "#facc15" },
  Blue: { name: "Blue", hex: "#3b82f6" },
  Orange: { name: "Orange", hex: "#f97316" },
  Green: { name: "Green", hex: "#22c55e" },
  Purple: { name: "Purple", hex: "#a855f7" },
  Brown: { name: "Brown", hex: "#92400e" },
};

/** Hue + white = a lighter, named tint. */
const TINT: Record<BaseHue, Mix> = {
  Red: { name: "Pink", hex: "#f9a8d4" },
  Yellow: { name: "Cream", hex: "#fef08a" },
  Blue: { name: "Sky Blue", hex: "#7dd3fc" },
  Orange: { name: "Peach", hex: "#fdba74" },
  Green: { name: "Mint", hex: "#86efac" },
  Purple: { name: "Lavender", hex: "#d8b4fe" },
  Brown: { name: "Tan", hex: "#d6b588" },
};

/** Hue + black = a darker, named shade. */
const SHADE: Record<BaseHue, Mix> = {
  Red: { name: "Maroon", hex: "#7f1d1d" },
  Yellow: { name: "Olive", hex: "#4d7c0f" },
  Blue: { name: "Navy", hex: "#1e3a8a" },
  Orange: { name: "Rust", hex: "#9a3412" },
  Green: { name: "Forest", hex: "#166534" },
  Purple: { name: "Plum", hex: "#581c87" },
  Brown: { name: "Dark Brown", hex: "#451a03" },
};

/** Optional flair shown next to a target's name. The swatch carries the colour. */
const EMOJI: Record<string, string> = {
  Orange: "🟠",
  Green: "🟢",
  Purple: "🟣",
  Pink: "🌸",
  "Sky Blue": "☁️",
  Maroon: "🍷",
  Brown: "🟤",
  Peach: "🍑",
  Mint: "🌿",
  Forest: "🌲",
  Lavender: "💜",
};

export function emojiFor(name: string): string {
  return EMOJI[name] ?? "🎨";
}

function baseHue(hasR: boolean, hasY: boolean, hasB: boolean): BaseHue {
  if (hasR && hasY && hasB) return "Brown";
  if (hasR && hasY) return "Orange";
  if (hasY && hasB) return "Green";
  if (hasR && hasB) return "Purple";
  if (hasR) return "Red";
  if (hasY) return "Yellow";
  return "Blue";
}

/**
 * Collapse any pot into a single named colour using the fixed rule table.
 * Primaries set the hue; net (white − black) lightens, darkens, or cancels.
 */
export function mix(pot: ReadonlyArray<Paint>): Mix {
  if (pot.length === 0) return EMPTY;

  const count = (p: Paint): number => pot.filter((x) => x === p).length;
  const hasR = count("red") > 0;
  const hasY = count("yellow") > 0;
  const hasB = count("blue") > 0;
  const w = count("white");
  const k = count("black");

  // White and/or black only.
  if (!hasR && !hasY && !hasB) {
    if (w > 0 && k > 0) return { name: "Gray", hex: "#9ca3af" };
    if (w > 0) return { name: "White", hex: "#ffffff" };
    return { name: "Black", hex: "#1f2937" };
  }

  const hue = baseHue(hasR, hasY, hasB);
  const net = w - k;
  if (net > 0) return TINT[hue];
  if (net < 0) return SHADE[hue];
  return BASE[hue];
}

/** A goal: just a recipe. Name, colour, and ideal tap count derive from it. */
export type Target = {
  recipe: ReadonlyArray<Paint>;
  mix: Mix;
  /** Fewest taps that can make this colour (its true minimum). */
  ideal: number;
  emoji: string;
};

function makeTarget(recipe: Paint[]): Target {
  const m = mix(recipe);
  return { recipe, mix: m, ideal: recipe.length, emoji: emojiFor(m.name) };
}

/** ~11 goals, escalating: secondaries → tints/shades → three-paint mixes. */
export const TARGETS: ReadonlyArray<Target> = [
  makeTarget(["red", "yellow"]), // Orange
  makeTarget(["yellow", "blue"]), // Green
  makeTarget(["red", "blue"]), // Purple
  makeTarget(["red", "white"]), // Pink
  makeTarget(["blue", "white"]), // Sky Blue
  makeTarget(["red", "black"]), // Maroon
  makeTarget(["red", "yellow", "blue"]), // Brown
  makeTarget(["red", "yellow", "white"]), // Peach
  makeTarget(["yellow", "blue", "white"]), // Mint
  makeTarget(["yellow", "blue", "black"]), // Forest
  makeTarget(["red", "blue", "white"]), // Lavender
];

/** Hard cap on pot size — filling it without a match is the "over-mixed" signal. */
export const MAX_POT = 4;
