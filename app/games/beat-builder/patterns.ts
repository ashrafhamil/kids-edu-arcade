// Pure data + helpers for Beat Builder. No browser globals, no Math.random, no
// Date.now — safe to evaluate during SSR.

/** Steps in one bar of the sequencer. */
export const STEPS = 8;

/** Tempo of the loop. 8 steps = one bar of eighth notes at 100 bpm. */
export const BPM = 100;
export const STEP_MS = 60000 / BPM / 2;

export type LaneId = "kick" | "clap" | "hat";

export type Lane = {
  id: LaneId;
  /** The only label a child sees — this game requires no reading. */
  emoji: string;
  /** Screen-reader / aria label. */
  label: string;
  /** Tailwind background for a switched-on cell. */
  on: string;
};

// Row order here IS the row order of every Grid below.
export const LANES: Lane[] = [
  { id: "kick", emoji: "🥁", label: "Drum", on: "bg-rose-500" },
  { id: "clap", emoji: "👏", label: "Clap", on: "bg-amber-400" },
  { id: "hat", emoji: "🎩", label: "Hat", on: "bg-sky-400" },
];

/** cells[lane][step] — true when that drum fires on that step. */
export type Grid = boolean[][];

export type Pattern = {
  emoji: string;
  title: string;
  cells: Grid;
};

/** A fresh, all-off grid. Returns a new array every call so it is safe to edit. */
export function emptyGrid(): Grid {
  return LANES.map(() => new Array<boolean>(STEPS).fill(false));
}

/** Build a grid from the step indexes each lane plays. */
function grid(kick: number[], clap: number[], hat: number[]): Grid {
  return [kick, clap, hat].map((steps) => {
    const row = new Array<boolean>(STEPS).fill(false);
    steps.forEach((s) => {
      row[s] = true;
    });
    return row;
  });
}

const ALL_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Six targets of rising density: 2, 4, 6, 8, 10 then 14 hits. Level 1 is two
 * bare kicks; level 6 is a full eighth-note hat line over a busy kick.
 */
export const LEVELS: Pattern[] = [
  { emoji: "🐢", title: "Two Booms", cells: grid([0, 4], [], []) },
  { emoji: "👏", title: "Boom Clap", cells: grid([0, 4], [2, 6], []) },
  { emoji: "🎩", title: "Ticky Boom", cells: grid([0, 4], [], [0, 2, 4, 6]) },
  { emoji: "🚂", title: "Marching Band", cells: grid([0, 4], [2, 6], [0, 2, 4, 6]) },
  { emoji: "🐘", title: "Big Stomp", cells: grid([0, 3, 4, 6], [2, 6], [0, 2, 4, 6]) },
  { emoji: "🚀", title: "Rocket Beat", cells: grid([0, 3, 4, 6], [2, 6], ALL_STEPS) },
];

export const LEVEL_COUNT = LEVELS.length;

export type MatchStats = {
  /** Target hits the child has placed correctly. */
  matched: number;
  /** Hits placed where the target is silent. */
  extra: number;
  /** Total hits in the target. */
  targetHits: number;
  /** True only when every target hit is placed and nothing else is. */
  exact: boolean;
};

/** How close the built pattern is to the target. Drives the live meter. */
export function matchStats(built: Grid, target: Grid): MatchStats {
  let matched = 0;
  let extra = 0;
  let targetHits = 0;

  for (let lane = 0; lane < LANES.length; lane++) {
    for (let step = 0; step < STEPS; step++) {
      const wanted = target[lane][step];
      const placed = built[lane][step];
      if (wanted) targetHits++;
      if (wanted && placed) matched++;
      if (!wanted && placed) extra++;
    }
  }

  return { matched, extra, targetHits, exact: matched === targetHits && extra === 0 };
}

/**
 * Stars (0–3). Full marks need every level cleared with few "Listen" replays:
 * 3 stars at 2 or fewer replays per level played, 2 stars at 4 or fewer, else 1.
 * An unfinished run is worth 1 star once three levels are cleared.
 */
export function starsFor(highestLevelCleared: number, listensPerLevel: number): number {
  if (highestLevelCleared < LEVEL_COUNT) return highestLevelCleared >= 3 ? 1 : 0;
  if (listensPerLevel <= 2) return 3;
  if (listensPerLevel <= 4) return 2;
  return 1;
}
