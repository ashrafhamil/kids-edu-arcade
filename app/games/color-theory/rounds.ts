// Color Theory dataset + pure round/scoring helpers.
//
// Everything hangs off ONE 12-hue wheel. A hue's only real property is its
// position, and every relationship is arithmetic on that position:
//   complement = +6 (half a turn)   analogous = ±1 (one step)
// so the three game modes share a single source of truth instead of ad-hoc
// hardcoded pairs. The six "major" hues sit on the even positions, which makes
// the classic pairs fall out for free: Red↔Green, Orange↔Blue, Yellow↔Purple.
//
// No React, and nothing random or time-based at module scope. The only
// Math.random lives inside the generators, which the component calls strictly
// from handlers/effects, keeping this module SSR-safe.

export type Temperature = "warm" | "cool";

export type Hue = {
  /** Position on the 12-hue wheel. Every relationship is derived from this. */
  index: number;
  /** Display name, always shown next to the swatch so colour is never the only cue. */
  name: string;
  /** Rendered inline as a real swatch — Tailwind cannot build class names at runtime. */
  hex: string;
  /** The six hues of the simple wheel (even positions). */
  major: boolean;
  /** null for the two hues that sit on the warm/cool border, so they are never asked. */
  temperature: Temperature | null;
};

type HueSeed = Omit<Hue, "index">;

// Artist's wheel order. Majors (even positions) reuse Color Mix's palette so the
// two creative games speak the same colour vocabulary; the odd positions are the
// tertiaries that sit between them.
const SEEDS: readonly HueSeed[] = [
  { name: "Red", hex: "#ef4444", major: true, temperature: "warm" },
  { name: "Red Orange", hex: "#f4622f", major: false, temperature: "warm" },
  { name: "Orange", hex: "#f97316", major: true, temperature: "warm" },
  { name: "Yellow Orange", hex: "#fba00b", major: false, temperature: "warm" },
  { name: "Yellow", hex: "#facc15", major: true, temperature: "warm" },
  { name: "Yellow Green", hex: "#84cc16", major: false, temperature: null },
  { name: "Green", hex: "#22c55e", major: true, temperature: "cool" },
  { name: "Blue Green", hex: "#14b8a6", major: false, temperature: "cool" },
  { name: "Blue", hex: "#3b82f6", major: true, temperature: "cool" },
  { name: "Blue Purple", hex: "#7c3aed", major: false, temperature: "cool" },
  { name: "Purple", hex: "#a855f7", major: true, temperature: "cool" },
  { name: "Red Purple", hex: "#ec4899", major: false, temperature: null },
];

export const WHEEL: readonly Hue[] = SEEDS.map((seed, index) => ({ ...seed, index }));

const MAJORS: readonly Hue[] = WHEEL.filter((hue) => hue.major);

/** Half a turn of the wheel — the complement distance. */
const COMPLEMENT_STEP = WHEEL.length / 2;
/** Tiles offered for the two wheel modes. */
const WHEEL_CHOICES = 6;
/** Correct answers needed per level. */
const CORRECT_PER_LEVEL = 4;
/** From this level on, every mode can be asked and distractors turn nasty. */
const MIXED_LEVEL = 3;
/** From this level on, tertiaries may appear as choices. */
const TERTIARY_CHOICE_LEVEL = 2;

const STAR_THRESHOLDS = [80, 200, 400] as const;

export type Mode = "complement" | "warmcool" | "analogous";

/** One tap target: a wheel swatch (`hex`) or a warm/cool button (`emoji`). */
export type Choice = {
  /** Unique within a round; compared against `Round.answerId`. */
  id: string;
  label: string;
  hex: string | null;
  emoji: string | null;
};

export type Round = {
  id: number;
  mode: Mode;
  /** Says which relationship is being asked — the only thing that changes at level 3+. */
  prompt: string;
  /** The colour shown big at the top. */
  hue: Hue;
  answerId: string;
  choices: Choice[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

const PROMPTS: Record<Mode, string> = {
  complement: "Tap the OPPOSITE colour on the wheel",
  warmcool: "Is this colour warm or cool?",
  analogous: "Tap the colour NEXT TO it on the wheel",
};

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Difficulty band: one level up every 4 correct answers. */
export function levelFor(correctCount: number): number {
  return Math.floor(correctCount / CORRECT_PER_LEVEL);
}

/** Timer bar length, tightening one step per level and never below 4s. */
export function durationFor(level: number): number {
  return Math.max(4000, 8000 - level * 700);
}

/** One mode per level while each is being taught, all three once mixed. */
export function modesFor(level: number): readonly Mode[] {
  const order: readonly Mode[] = ["complement", "warmcool", "analogous"];
  return level >= MIXED_LEVEL ? order : [order[level]];
}

/** Colours that can be shown as the question. Tertiaries join at the mixed level. */
function promptPoolFor(level: number): readonly Hue[] {
  return level >= MIXED_LEVEL ? WHEEL : MAJORS;
}

/** Colours that can appear as tap targets. Level 0/1 keep to the simple 6-hue wheel. */
function choicePoolFor(level: number): readonly Hue[] {
  return level >= TERTIARY_CHOICE_LEVEL ? WHEEL : MAJORS;
}

function hueAt(index: number): Hue {
  const size = WHEEL.length;
  return WHEEL[((index % size) + size) % size];
}

/** The hue half a turn away. */
export function complementOf(hue: Hue): Hue {
  return hueAt(hue.index + COMPLEMENT_STEP);
}

/** The two hues one step away, in wheel order. */
export function neighboursOf(hue: Hue): [Hue, Hue] {
  return [hueAt(hue.index - 1), hueAt(hue.index + 1)];
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Append candidates the set does not already hold, until it reaches `size`. */
function fillTo(chosen: readonly Hue[], candidates: readonly Hue[], size: number): Hue[] {
  const out = chosen.slice();
  const taken = new Set(out.map((hue) => hue.name));
  for (const hue of candidates) {
    if (out.length >= size) break;
    if (taken.has(hue.name)) continue;
    out.push(hue);
    taken.add(hue.name);
  }
  return out;
}

function toChoice(hue: Hue): Choice {
  return { id: hue.name, label: hue.name, hex: hue.hex, emoji: null };
}

/**
 * Six wheel tiles, always containing the answer and the colour being asked about
 * (tapping the question's own colour is simply wrong). `traps` are near-misses
 * held back until the mixed level; `excluded` are hues that must never appear —
 * used by the analogous mode to keep exactly ONE correct neighbour on screen.
 * Tiles come out in wheel order so the positional lesson stays visible.
 */
function wheelChoices(args: {
  shown: Hue;
  answer: Hue;
  traps: readonly Hue[];
  excluded: readonly Hue[];
  level: number;
}): Choice[] {
  const { shown, answer, traps, excluded, level } = args;
  const banned = new Set(excluded.map((hue) => hue.name));
  const allowed = (hue: Hue): boolean => !banned.has(hue.name);

  const seeded = fillTo([answer], [shown], WHEEL_CHOICES);
  const withTraps = fillTo(seeded, level >= MIXED_LEVEL ? traps.filter(allowed) : [], WHEEL_CHOICES);
  const withPool = fillTo(withTraps, shuffle(choicePoolFor(level).filter(allowed)), WHEEL_CHOICES);
  const full = fillTo(withPool, shuffle(WHEEL.filter(allowed)), WHEEL_CHOICES);

  return full.sort((a, b) => a.index - b.index).map(toChoice);
}

const TEMPERATURE_CHOICES: readonly Choice[] = [
  { id: "warm", label: "Warm", hex: null, emoji: "☀️" },
  { id: "cool", label: "Cool", hex: null, emoji: "❄️" },
];

type TemperedHue = Hue & { temperature: Temperature };

function isTempered(hue: Hue): hue is TemperedHue {
  return hue.temperature !== null;
}

/** Everything a round needs except the bookkeeping the caller owns. */
type RoundCore = Pick<Round, "mode" | "prompt" | "hue" | "answerId" | "choices">;

/** A hue from `pool`, never the one just asked (unless the pool holds nothing else). */
function promptHue<T extends Hue>(pool: readonly T[], avoidName?: string): T {
  const fresh = pool.filter((hue) => hue.name !== avoidName);
  return pick(fresh.length > 0 ? fresh : pool);
}

function complementCore(level: number, avoidName?: string): RoundCore {
  const shown = promptHue(promptPoolFor(level), avoidName);
  const answer = complementOf(shown);
  return {
    mode: "complement",
    prompt: PROMPTS.complement,
    hue: shown,
    answerId: answer.name,
    // Split complements sit either side of the answer: the sharpest near-miss.
    choices: wheelChoices({ shown, answer, traps: neighboursOf(answer), excluded: [], level }),
  };
}

function analogousCore(level: number, avoidName?: string): RoundCore {
  const shown = promptHue(promptPoolFor(level), avoidName);
  const [before, after] = neighboursOf(shown);
  const answer = pick([before, after]);
  const otherNeighbour = answer.name === before.name ? after : before;
  return {
    mode: "analogous",
    prompt: PROMPTS.analogous,
    hue: shown,
    answerId: answer.name,
    // Two steps away looks adjacent but isn't.
    choices: wheelChoices({
      shown,
      answer,
      traps: [hueAt(shown.index - 2), hueAt(shown.index + 2)],
      excluded: [otherNeighbour],
      level,
    }),
  };
}

function temperatureCore(level: number, avoidName?: string): RoundCore {
  const shown = promptHue(promptPoolFor(level).filter(isTempered), avoidName);
  return {
    mode: "warmcool",
    prompt: PROMPTS.warmcool,
    hue: shown,
    answerId: shown.temperature,
    choices: TEMPERATURE_CHOICES.map((choice) => ({ ...choice })),
  };
}

const CORE_BY_MODE: Record<Mode, (level: number, avoidName?: string) => RoundCore> = {
  complement: complementCore,
  warmcool: temperatureCore,
  analogous: analogousCore,
};

/**
 * Build the next round. The mode is drawn first (so warm/cool never has to
 * re-roll a borderline hue), then the colour. `avoidName` keeps the same colour
 * from being asked twice in a row.
 */
export function genRound(id: number, level: number, avoidName?: string): Round {
  const mode = pick(modesFor(level));
  return { id, durationMs: durationFor(level), ...CORE_BY_MODE[mode](level, avoidName) };
}
