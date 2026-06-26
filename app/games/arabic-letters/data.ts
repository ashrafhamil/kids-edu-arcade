// Pure, framework-free data + question logic for Hijaiyah (Arabic Letters).
// CORRECTNESS IS CRITICAL: the letter -> name table below is transcribed
// verbatim from the game spec and must not be reordered, renamed, or
// "normalized" to academic transliteration. Note that ح = "Hha" and
// ه = "Ha" are deliberately distinct labels — keep them distinct.

export type Letter = {
  /** The Arabic glyph, rendered RTL in a system Arabic font. */
  ar: string;
  /** The romanized name shown/picked by the player. */
  name: string;
};

/** The 28 Hijaiyah letters, in canonical order. Do not reorder. */
export const LETTERS: readonly Letter[] = [
  { ar: "ا", name: "Alif" },
  { ar: "ب", name: "Ba" },
  { ar: "ت", name: "Ta" },
  { ar: "ث", name: "Tsa" },
  { ar: "ج", name: "Jim" },
  { ar: "ح", name: "Hha" },
  { ar: "خ", name: "Kha" },
  { ar: "د", name: "Dal" },
  { ar: "ذ", name: "Zal" },
  { ar: "ر", name: "Ra" },
  { ar: "ز", name: "Zai" },
  { ar: "س", name: "Sin" },
  { ar: "ش", name: "Syin" },
  { ar: "ص", name: "Sod" },
  { ar: "ض", name: "Dhod" },
  { ar: "ط", name: "Tho" },
  { ar: "ظ", name: "Zho" },
  { ar: "ع", name: "Ain" },
  { ar: "غ", name: "Ghain" },
  { ar: "ف", name: "Fa" },
  { ar: "ق", name: "Qof" },
  { ar: "ك", name: "Kaf" },
  { ar: "ل", name: "Lam" },
  { ar: "م", name: "Mim" },
  { ar: "ن", name: "Nun" },
  { ar: "ه", name: "Ha" },
  { ar: "و", name: "Wau" },
  { ar: "ي", name: "Ya" },
];

/** Forward: show the name, tap the matching Arabic glyph. */
/** Reverse: show the Arabic glyph, tap the matching name. */
export type Mode = "forward" | "reverse";

export type Question = {
  id: number;
  mode: Mode;
  /** The correct letter (uniquely identified by its glyph). */
  answer: Letter;
  /** Four distinct letters incl. the answer, shuffled. */
  choices: Letter[];
  /** How long this question's timer bar lasts, in ms. */
  durationMs: number;
};

const CHOICE_COUNT = 4;
const CORRECT_PER_LEVEL = 6; // level up after every ~6 correct answers
const MAX_LEVEL_BAND = 5; // difficulty stops ramping past this band
const REVERSE_CHANCE = 0.4; // chance a round is "reverse" once unlocked

/** Difficulty band (0-based). Ramps every 6 correct answers, then caps. */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / CORRECT_PER_LEVEL), MAX_LEVEL_BAND);
}

/** The 1-based level number shown to the player ("Level 1", "Level 2", ...). */
export function displayLevel(band: number): number {
  return band + 1;
}

/** Reverse rounds unlock once the player reaches the level labeled "2". */
export function reverseUnlocked(band: number): boolean {
  return displayLevel(band) >= 2;
}

/** Timer shrinks each band but never below 3s, so late reverse rounds stay fair. */
export function durationFor(band: number): number {
  return Math.max(3000, 6500 - band * 600);
}

/** Stars from the final score, per the spec thresholds. */
export function starsFor(score: number): number {
  if (score >= 500) return 3;
  if (score >= 250) return 2;
  if (score >= 100) return 1;
  return 0;
}

function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickAnswer(avoidAr: string | undefined): Letter {
  const pool = avoidAr ? LETTERS.filter((l) => l.ar !== avoidAr) : LETTERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build a round. `avoidAr` prevents the same answer appearing twice in a row.
 * Distractors are distinct letters, so every option's glyph AND name is unique.
 */
export function genQuestion(band: number, id: number, avoidAr?: string): Question {
  const answer = pickAnswer(avoidAr);
  const distractors = shuffle(LETTERS.filter((l) => l.ar !== answer.ar)).slice(
    0,
    CHOICE_COUNT - 1,
  );
  const choices = shuffle([answer, ...distractors]);
  const mode: Mode =
    reverseUnlocked(band) && Math.random() < REVERSE_CHANCE ? "reverse" : "forward";
  return { id, mode, answer, choices, durationMs: durationFor(band) };
}
