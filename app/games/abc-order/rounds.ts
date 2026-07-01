// ABC Order round generation + scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type Tile = { key: string; letter: string };

export type Round = {
  id: number;
  /** Letters shown as tappable tiles, in shuffled (display) order. */
  tiles: Tile[];
  /** The same letters sorted A→Z — the sequence the player must tap. */
  order: string[];
};

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Three letters to start, four once the player has cleared a few rounds. */
export function lettersFor(roundsCompleted: number): number {
  return roundsCompleted >= 5 ? 4 : 3;
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sameLetters(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((letter, i) => letter === sortedB[i]);
}

/**
 * Build the next round: `count` distinct random letters, shuffled for display. `avoidOrder`
 * (the previous round's sorted letters) is used to redraw if the exact same letter set — or
 * a display order that's already alphabetical — would come up again, so every round is both
 * fresh and an actual puzzle.
 */
export function genRound(id: number, roundsCompleted: number, avoidOrder?: readonly string[]): Round {
  const count = lettersFor(roundsCompleted);

  let letters: string[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    letters = shuffle(ALPHABET).slice(0, count);
    if (avoidOrder && sameLetters(letters, avoidOrder)) continue;
    break;
  }

  const order = [...letters].sort();

  let display: string[] = letters;
  for (let attempt = 0; attempt < 6; attempt++) {
    display = shuffle(letters);
    if (!display.every((letter, i) => letter === order[i])) break;
  }

  const tiles: Tile[] = display.map((letter, i) => ({ key: `${id}-${i}-${letter}`, letter }));
  return { id, tiles, order };
}
