// Pure data + helpers for Melody Match. No browser globals and no Math.random at
// module scope, so this module is safe to evaluate during SSR — the generator
// below is only ever called from an event handler or an effect.

export type Key = {
  /** Stable id used for React keys and aria labels. */
  id: string;
  /** Pitch letter shown on the bar, e.g. "C", "G". */
  name: string;
  /** Frequency in Hz fed to sfx.note(). */
  freq: number;
  /** Bar fill colour — pitch-coded, like a coloured glockenspiel. */
  color: string;
  /** Legible text colour on that fill. */
  text: string;
  /** Bar height in px. Low pitch = long bar, exactly like a real xylophone. */
  barPx: number;
};

/**
 * C major pentatonic, one octave up from middle C. A pentatonic scale has no
 * semitone clashes, so a wrong tap still sounds musical instead of sour — which
 * matters because a wrong tap already costs a heart.
 */
export const KEYS: Key[] = [
  { id: "c5", name: "C", freq: 523.25, color: "#ef4444", text: "#ffffff", barPx: 152 },
  { id: "d5", name: "D", freq: 587.33, color: "#f97316", text: "#ffffff", barPx: 140 },
  { id: "e5", name: "E", freq: 659.25, color: "#eab308", text: "#1f2937", barPx: 128 },
  { id: "g5", name: "G", freq: 783.99, color: "#22c55e", text: "#ffffff", barPx: 116 },
  { id: "a5", name: "A", freq: 880.0, color: "#3b82f6", text: "#ffffff", barPx: 104 },
];

/** Manual "Play again" listens allowed per round. */
export const REPLAYS_PER_ROUND = 2;

export const MAX_HEARTS = 3;

const MIN_NOTES = 3;
const MAX_NOTES = 6;
const ROUNDS_PER_STEP = 3;

/** Melody length for a given number of fully completed rounds: 3 → 6 notes. */
export function lengthFor(roundsCleared: number): number {
  const grown = MIN_NOTES + Math.floor(roundsCleared / ROUNDS_PER_STEP);
  return Math.min(MAX_NOTES, grown);
}

/**
 * A fresh melody of `length` notes as key indices. Consecutive repeats are
 * avoided: two identical notes in a row are hard to tell from one long note by
 * ear alone, and by ear alone is the whole point here.
 */
export function randomMelody(length: number): number[] {
  const notes: number[] = [];
  while (notes.length < length) {
    const next = Math.floor(Math.random() * KEYS.length);
    if (next !== notes[notes.length - 1]) notes.push(next);
  }
  return notes;
}

/** Points for a cleared round; listening without a replay is worth more. */
export function scoreForRound(length: number, replaysUsed: number): number {
  const base = length * 10;
  const firstListenBonus = replaysUsed === 0 ? length * 5 : 0;
  return base + firstListenBonus;
}

/** Stars (0–3) earned for a final score. */
export function starsFor(score: number): number {
  if (score >= 400) return 3;
  if (score >= 200) return 2;
  if (score >= 80) return 1;
  return 0;
}
