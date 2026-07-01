// Round data + generation for Shadow Match. Kept in the game's own folder so no
// shared file is touched. The pool is deliberately made of emojis with bold,
// distinctive silhouettes so a solid-black shadow stays recognizable.

/** Emojis with distinctive outlines, safe to read as a pure black silhouette. */
export const EMOJIS = [
  "🐘",
  "🦒",
  "🐧",
  "🦋",
  "🐢",
  "🚗",
  "✈️",
  "🌳",
  "🍎",
  "🐟",
  "🦕",
  "🦈",
  "🎸",
  "⚽",
  "🚀",
  "🐬",
  "🦆",
  "🍄",
  "🏠",
  "⭐",
] as const;

export type Round = {
  id: number;
  /** The emoji whose black silhouette is shown as the shadow. */
  answer: string;
  /** Shuffled tap options; always contains the answer plus distinct distractors. */
  choices: string[];
};

/** Star thresholds for the game-over screen. */
export function starsFor(score: number): number {
  if (score >= 400) return 3;
  if (score >= 200) return 2;
  if (score >= 80) return 1;
  return 0;
}

/** Choices grow from 3 to 4 as the score climbs, ramping the difficulty. */
export function choiceCountFor(score: number): number {
  return score >= 120 ? 4 : 3;
}

/** Fisher–Yates shuffle on a copy — never mutates the input. */
function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build the next round for the given score. `avoidAnswer` keeps the same shadow
 * from appearing twice in a row so consecutive rounds always feel fresh.
 */
export function genRound(id: number, score: number, avoidAnswer?: string): Round {
  const count = choiceCountFor(score);
  const answerPool = avoidAnswer ? EMOJIS.filter((e) => e !== avoidAnswer) : [...EMOJIS];
  const answer = answerPool[Math.floor(Math.random() * answerPool.length)];
  const distractors = shuffle(EMOJIS.filter((e) => e !== answer)).slice(0, count - 1);
  const choices = shuffle([answer, ...distractors]);
  return { id, answer, choices };
}
