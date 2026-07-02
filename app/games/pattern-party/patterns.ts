// Pure, framework-free puzzle logic for Pattern Party.
// Kept out of the React component so the pattern families, difficulty ramp and
// scoring rules stay readable. Every random call here runs only from inside a
// generator that the component invokes from an event handler / effect
// (startGame, loadNext) — never at render or module scope. SSR-safe.

/** A drawable shape, rendered with CSS (no image assets). */
export type Shape = "circle" | "square" | "triangle";

/**
 * One visual unit in a sequence or a choice. A token is either:
 *  - a colored CSS `shape` (with `scale` for the size family), or
 *  - an `emoji` glyph (with `scale` for the size family), or
 *  - an emoji `cluster` (`count` copies, for the growing-count family).
 * `count` being present marks "cluster" rendering; its absence marks a single
 * glyph. Only the meaningful fields are set, so `tokenKey` can compare them.
 */
export type Token = {
  emoji?: string;
  shape?: Shape;
  /** Hex color, only set alongside `shape`. */
  color?: string;
  /** Size multiplier for the size family; defaults to 1. */
  scale?: number;
  /** Number of emoji copies for the count family; absence = single glyph. */
  count?: number;
};

export type FamilyId = "abab" | "aabb" | "abcabc" | "count" | "size" | "twist";

export type Puzzle = {
  id: number;
  family: FamilyId;
  /** Tokens shown before the "?" slot. */
  prompt: Token[];
  /** The one correct continuation. */
  answer: Token;
  /** Shuffled choices: the answer plus tempting distractors, all distinct. */
  choices: Token[];
  /** How long this puzzle's timer bar lasts, in ms. */
  durationMs: number;
};

type Built = { prompt: Token[]; answer: Token; distractors: [Token, Token] };

// ---- Visual pools (no randomness at module scope) ----

// Curated for maximum mutual contrast: any 2–3 sampled here stay clearly
// distinguishable for young kids and color-vision deficiency. Perceptually close
// pairs (orange↔red, pink↔red/purple, teal↔green) are deliberately excluded,
// since abab/aabb/abcabc encode the pattern as one shape differing only by color.
const COLORS = [
  { hex: "#ef4444", name: "red" },
  { hex: "#3b82f6", name: "blue" },
  { hex: "#22c55e", name: "green" },
  { hex: "#eab308", name: "yellow" },
  { hex: "#a855f7", name: "purple" },
] as const;

/** Hex -> friendly color name, used for choice aria-labels. */
export const COLOR_NAME: Record<string, string> = Object.fromEntries(
  COLORS.map((c) => [c.hex, c.name])
);

const SHAPES: Shape[] = ["circle", "square", "triangle"];

const EMOJIS = [
  "🍎", "🍌", "🍓", "🍇", "🐶", "🐱", "🐠", "🦋",
  "⭐", "🌙", "🌸", "🍀", "🚗", "🚀", "🎈", "🍩",
] as const;

// Size ladder for the size family. Spread so the answer reads as clearly the
// biggest/smallest: the answer-vs-nearest-distractor ratio is ~1.42x.
const SCALES = [0.5, 0.78, 1.06, 1.5] as const;

// ---- Token builders ----

const glyph = (emoji: string, scale = 1): Token => ({ emoji, scale });
const cluster = (emoji: string, count: number): Token => ({ emoji, count });
const shapeTok = (shape: Shape, color: string, scale = 1): Token => ({
  shape,
  color,
  scale,
});

// ---- Small pure random helpers (called only from generators) ----

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** `n` distinct items from a pool. */
function sample<T>(arr: readonly T[], n: number): T[] {
  return shuffle([...arr]).slice(0, n);
}

/**
 * `n` distinct simple tokens for the sequence families, in one of two visual
 * styles chosen at random: distinct emojis, or one shape in distinct colors.
 * The colored-shape style is the spec's "color cycle (3-color)" rendering.
 */
function distinctTokens(n: number): Token[] {
  if (Math.random() < 0.5) {
    return sample(EMOJIS, n).map((e) => glyph(e));
  }
  const shape = pick(SHAPES);
  return sample(COLORS, n).map((c) => shapeTok(shape, c.hex));
}

/** Stable identity for equality + de-duping choices. */
export function tokenKey(t: Token): string {
  return [t.emoji ?? "", t.shape ?? "", t.color ?? "", t.scale ?? 1, t.count ?? 1].join(
    "|"
  );
}

// ---- Pattern families (easiest -> hardest) ----

// ABAB: alternate two tokens. Shown twice so the repeat is visible. -> A.
function buildABAB(): Built {
  const [a, b, c] = distinctTokens(3);
  return { prompt: [a, b, a, b], answer: a, distractors: [b, c] };
}

// AABB: doubled pairs, shown into the second block so the rhythm is visible. -> A.
function buildAABB(): Built {
  const [a, b, c] = distinctTokens(3);
  return { prompt: [a, a, b, b, a], answer: a, distractors: [b, c] };
}

// ABCABC: three tokens cycling. Shown into the second cycle. -> C.
function buildABCABC(): Built {
  const [a, b, c] = distinctTokens(3);
  return { prompt: [a, b, c, a, b], answer: c, distractors: [a, b] };
}

// Growing / shrinking count of one emoji (1,2,3,?). Distractors: repeat-the-last
// (non-growing) and an over/under step.
function buildCount(): Built {
  const emoji = pick(EMOJIS);
  if (Math.random() < 0.6) {
    const start = rand(1, 2);
    return {
      prompt: [cluster(emoji, start), cluster(emoji, start + 1), cluster(emoji, start + 2)],
      answer: cluster(emoji, start + 3),
      distractors: [cluster(emoji, start + 2), cluster(emoji, start + 4)],
    };
  }
  const start = rand(4, 5);
  return {
    prompt: [cluster(emoji, start), cluster(emoji, start - 1), cluster(emoji, start - 2)],
    answer: cluster(emoji, start - 3),
    distractors: [cluster(emoji, start - 2), cluster(emoji, start - 1)],
  };
}

// Growing / shrinking size of one glyph (or shape). Distractors: repeat-the-last
// size (non-growing) and the opposite extreme. The base glyph is constant, so
// the choices differ purely by size.
function buildSize(): Built {
  const base: Token =
    Math.random() < 0.5 ? glyph(pick(EMOJIS)) : shapeTok(pick(SHAPES), pick(COLORS).hex);
  const at = (i: number): Token => ({ ...base, scale: SCALES[i] });
  if (Math.random() < 0.5) {
    // grow: 0 1 2 -> 3 (biggest). distractors: last-shown (2) and smallest (0).
    return { prompt: [at(0), at(1), at(2)], answer: at(3), distractors: [at(2), at(0)] };
  }
  // shrink: 3 2 1 -> 0 (smallest). distractors: last-shown (1) and biggest (3).
  return { prompt: [at(3), at(2), at(1)], answer: at(0), distractors: [at(1), at(3)] };
}

// Twist: a constant glyph alternates with a growing count.
//   A, 🍎, A, 🍎🍎, A, ?  ->  🍎🍎🍎
// Distractors: the constant A (wrong slot) and the repeated last count.
function buildTwist(): Built {
  const constEmoji = pick(EMOJIS);
  let countEmoji = pick(EMOJIS);
  while (countEmoji === constEmoji) countEmoji = pick(EMOJIS);
  const a = glyph(constEmoji);
  return {
    prompt: [a, cluster(countEmoji, 1), a, cluster(countEmoji, 2), a],
    answer: cluster(countEmoji, 3),
    distractors: [a, cluster(countEmoji, 2)],
  };
}

type Family = { id: FamilyId; minStage: number; build: () => Built };

// Harder families unlock at higher stages (see `levelFor`).
const FAMILIES: Family[] = [
  { id: "abab", minStage: 0, build: buildABAB },
  { id: "aabb", minStage: 0, build: buildAABB },
  { id: "abcabc", minStage: 1, build: buildABCABC },
  { id: "count", minStage: 1, build: buildCount },
  { id: "size", minStage: 2, build: buildSize },
  { id: "twist", minStage: 3, build: buildTwist },
];

/** Difficulty stage, widening the family pool every 3 correct answers (max 3). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / 3), 3);
}

/** Timer tightens each stage: 9s at the start (reading a sequence takes longer than a
 * simple tap), never below 6s. */
export function durationFor(stage: number): number {
  return Math.max(6000, 9000 - stage * 1000);
}

/** Stars from the final score, matching the on-screen thresholds. */
export function starsFor(score: number): number {
  if (score >= 300) return 3;
  if (score >= 150) return 2;
  if (score >= 60) return 1;
  return 0;
}

// De-dupe by key so there is always exactly one correct choice and every choice
// is visually distinct. The deliberate distractors never collide with the
// answer, so this only ever guards against accidental sameness.
function assembleChoices({ answer, distractors }: Built): Token[] {
  const seen = new Set<string>([tokenKey(answer)]);
  const choices: Token[] = [answer];
  for (const d of distractors) {
    const k = tokenKey(d);
    if (!seen.has(k)) {
      seen.add(k);
      choices.push(d);
    }
  }
  return shuffle(choices);
}

/**
 * Build the next puzzle for the given difficulty stage. `avoid` is the previous
 * family id, so the same family is not served twice in a row when the pool has
 * room. Random calls live here, invoked only from handlers/effects.
 */
export function genPuzzle(stage: number, id: number, avoid?: FamilyId): Puzzle {
  const pool = FAMILIES.filter((f) => f.minStage <= stage);
  let family = pick(pool);
  let guard = 0;
  while (avoid && pool.length > 1 && family.id === avoid && guard < 20) {
    family = pick(pool);
    guard++;
  }
  const built = family.build();
  return {
    id,
    family: family.id,
    prompt: built.prompt,
    answer: built.answer,
    choices: assembleChoices(built),
    durationMs: durationFor(stage),
  };
}
