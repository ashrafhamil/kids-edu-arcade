// Static data + pure round builder for Odd One Out. Kept out of the component so
// the game logic stays declarative and the emoji sets are easy to tweak.

export type Category = {
  id: string;
  /** Human-readable name, used for the screen-reader round description. */
  name: string;
  /** At least 6 distinct emoji so the majority never runs short at 6 tiles. */
  emoji: string[];
};

export const CATEGORIES: Category[] = [
  { id: "animals", name: "animals", emoji: ["🐶", "🐱", "🐰", "🐴", "🐮", "🐷", "🐵"] },
  { id: "fruits", name: "fruits", emoji: ["🍎", "🍌", "🍇", "🍓", "🍊", "🍑", "🍉"] },
  { id: "vehicles", name: "vehicles", emoji: ["🚗", "🚌", "🚂", "✈️", "🚁", "🚀", "🚲"] },
  { id: "sea", name: "sea creatures", emoji: ["🐟", "🐙", "🦀", "🐬", "🦈", "🐠", "🦑"] },
  { id: "sports", name: "sports", emoji: ["⚽", "🏀", "🏈", "🎾", "🏐", "⚾", "🏓"] },
  { id: "faces", name: "faces", emoji: ["😀", "😎", "😴", "😭", "😡", "🤔", "😍"] },
  { id: "weather", name: "weather", emoji: ["☀️", "🌧️", "⛈️", "❄️", "🌈", "🌪️", "☁️"] },
  { id: "food", name: "food", emoji: ["🍕", "🍔", "🌭", "🍟", "🥪", "🌮", "🍿"] },
];

export type Tile = {
  /** Stable React key + resolve identity, unique within a round. */
  key: string;
  emoji: string;
  /** True for the single tile from the different category. */
  isOdd: boolean;
};

export type Round = {
  id: number;
  tiles: Tile[];
  /** Category id of the majority, so the next round can avoid repeating it. */
  majorityId: string;
  /** Screen-reader hint, e.g. "5 fruits and 1 vehicle". */
  label: string;
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

/** Star thresholds for the final score. */
export function starsFor(score: number): number {
  if (score >= 400) return 3;
  if (score >= 200) return 2;
  if (score >= 80) return 1;
  return 0;
}

/** Tiles on the board — 4 early, 6 once the child is warmed up. */
export function tilesFor(correctCount: number): number {
  return correctCount < 5 ? 4 : 6;
}

/** Timer bar length for a board of this many tiles — a touch tighter once 6 are on screen. */
export function durationFor(tileCount: number): number {
  return tileCount <= 4 ? 7000 : 6500;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Fisher–Yates shuffle on a copy, so callers keep their source array intact. */
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build one round: `count - 1` distinct emoji from a majority category plus a
 * single emoji from a different category (the odd one out), shuffled together.
 * `avoidMajorityId` keeps the same majority from appearing twice in a row.
 */
export function genRound(count: number, id: number, avoidMajorityId?: string): Round {
  const majorityPool = CATEGORIES.filter((c) => c.id !== avoidMajorityId);
  const majority = pick(majorityPool);
  const odd = pick(CATEGORIES.filter((c) => c.id !== majority.id));

  const majorityEmoji = shuffle(majority.emoji).slice(0, count - 1);
  const oddEmoji = pick(odd.emoji);

  const tiles: Tile[] = shuffle([
    ...majorityEmoji.map((emoji) => ({ emoji, isOdd: false })),
    { emoji: oddEmoji, isOdd: true },
  ]).map((tile, index) => ({ ...tile, key: `${id}-${index}` }));

  return {
    id,
    tiles,
    majorityId: majority.id,
    label: `${count - 1} ${majority.name} and 1 ${odd.name}`,
    durationMs: durationFor(count),
  };
}
