// Jobs & Tools dataset + pure round/scoring helpers.
//
// No React here, and nothing random or time-based at module scope. The only
// Math.random calls live inside genRound(), which the component invokes strictly
// from handlers/effects, keeping this module SSR-safe.

/** Where a tool is usually found. Drives the "similar setting" distractor rule. */
export type Setting =
  | "emergency"
  | "kitchen"
  | "health"
  | "farm"
  | "art"
  | "school"
  | "lab"
  | "workshop"
  | "travel"
  | "space"
  | "stage"
  | "office"
  | "city";

export type Tool = {
  /** Stable id, also used as the React key and the tap payload. */
  id: string;
  emoji: string;
  /** Short familiar word shown on the tile (band `middle` allows single words). */
  name: string;
  setting: Setting;
};

export type Worker = {
  /** Job word shown under the big worker emoji. Unique, so it doubles as an id. */
  job: string;
  emoji: string;
  /** The one right answer. */
  toolId: string;
  /**
   * Other tools this worker could plausibly reach for. These are never offered
   * as distractors for this worker, so exactly one choice is ever defensible.
   */
  alsoUses: readonly string[];
};

// Tools that are somebody's answer, plus a few that only ever play distractor.
// Every emoji is a plain object pictograph, so nothing here depends on ZWJ.
export const TOOLS: readonly Tool[] = [
  // ── answers ──
  { id: "extinguisher", emoji: "🧯", name: "Extinguisher", setting: "emergency" },
  { id: "pan", emoji: "🍳", name: "Frying Pan", setting: "kitchen" },
  { id: "stethoscope", emoji: "🩺", name: "Stethoscope", setting: "health" },
  { id: "tractor", emoji: "🚜", name: "Tractor", setting: "farm" },
  { id: "paintbrush", emoji: "🖌️", name: "Paintbrush", setting: "art" },
  { id: "police-car", emoji: "🚓", name: "Police Car", setting: "emergency" },
  { id: "books", emoji: "📚", name: "Books", setting: "school" },
  { id: "microscope", emoji: "🔬", name: "Microscope", setting: "lab" },
  { id: "hammer", emoji: "🔨", name: "Hammer", setting: "workshop" },
  { id: "wrench", emoji: "🔧", name: "Wrench", setting: "workshop" },
  { id: "plane", emoji: "✈️", name: "Plane", setting: "travel" },
  { id: "rocket", emoji: "🚀", name: "Rocket", setting: "space" },
  { id: "microphone", emoji: "🎤", name: "Microphone", setting: "stage" },
  { id: "magnifier", emoji: "🔍", name: "Magnifier", setting: "city" },
  { id: "laptop", emoji: "💻", name: "Laptop", setting: "office" },

  // ── distractor-only ──
  { id: "knife", emoji: "🔪", name: "Knife", setting: "kitchen" },
  { id: "spoon", emoji: "🥄", name: "Spoon", setting: "kitchen" },
  { id: "needle", emoji: "💉", name: "Needle", setting: "health" },
  { id: "basket", emoji: "🧺", name: "Basket", setting: "farm" },
  { id: "paints", emoji: "🎨", name: "Paints", setting: "art" },
  { id: "pencil", emoji: "✏️", name: "Pencil", setting: "school" },
  { id: "ruler", emoji: "📏", name: "Ruler", setting: "school" },
  { id: "test-tube", emoji: "🧪", name: "Test Tube", setting: "lab" },
  { id: "saw", emoji: "🪚", name: "Saw", setting: "workshop" },
  { id: "ladder", emoji: "🪜", name: "Ladder", setting: "workshop" },
  { id: "camera", emoji: "📷", name: "Camera", setting: "city" },
  { id: "map", emoji: "🗺️", name: "Map", setting: "travel" },
] as const;

// 15 workers, deliberately gender-varied: six women, six men, three neutral, and
// the stereotypes are mixed on purpose (woman firefighter, man teacher).
export const WORKERS: readonly Worker[] = [
  { job: "Firefighter", emoji: "👩‍🚒", toolId: "extinguisher", alsoUses: ["ladder", "basket"] },
  { job: "Chef", emoji: "👨‍🍳", toolId: "pan", alsoUses: ["knife", "spoon"] },
  { job: "Doctor", emoji: "👩‍⚕️", toolId: "stethoscope", alsoUses: ["needle"] },
  { job: "Farmer", emoji: "👨‍🌾", toolId: "tractor", alsoUses: ["basket", "saw"] },
  { job: "Artist", emoji: "👩‍🎨", toolId: "paintbrush", alsoUses: ["paints", "pencil"] },
  { job: "Police", emoji: "👮", toolId: "police-car", alsoUses: ["magnifier", "camera"] },
  { job: "Teacher", emoji: "👨‍🏫", toolId: "books", alsoUses: ["pencil", "ruler", "laptop"] },
  { job: "Scientist", emoji: "👩‍🔬", toolId: "microscope", alsoUses: ["test-tube", "needle"] },
  { job: "Builder", emoji: "👷", toolId: "hammer", alsoUses: ["wrench", "saw", "ladder", "ruler"] },
  { job: "Mechanic", emoji: "👨‍🔧", toolId: "wrench", alsoUses: ["hammer", "saw"] },
  { job: "Pilot", emoji: "👩‍✈️", toolId: "plane", alsoUses: ["map", "rocket"] },
  { job: "Astronaut", emoji: "👨‍🚀", toolId: "rocket", alsoUses: ["plane"] },
  { job: "Singer", emoji: "👩‍🎤", toolId: "microphone", alsoUses: [] },
  { job: "Detective", emoji: "🕵️", toolId: "magnifier", alsoUses: ["camera", "police-car", "map"] },
  { job: "Office Worker", emoji: "👨‍💼", toolId: "laptop", alsoUses: ["pencil", "ruler"] },
] as const;

// Settings that feel like the same corner of the world. Used from level 3 on to
// pull distractors closer to the answer (a chef's pan against a farm basket).
const NEAR_SETTINGS: Record<Setting, readonly Setting[]> = {
  emergency: ["health", "city"],
  kitchen: ["farm", "workshop"],
  health: ["lab", "emergency"],
  farm: ["kitchen", "workshop"],
  art: ["school", "stage"],
  school: ["office", "art"],
  lab: ["health", "school"],
  workshop: ["farm", "emergency"],
  travel: ["space", "city"],
  space: ["travel", "lab"],
  stage: ["art", "office"],
  office: ["school", "city"],
  city: ["emergency", "travel"],
};

export type Round = {
  id: number;
  /** The worker shown big as the prompt. */
  worker: Worker;
  /** Id of the one correct tool. */
  answerId: string;
  /** Shuffled tap options; always the answer plus distinct distractors. */
  choices: Tool[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

const STAR_THRESHOLDS = [80, 200, 400] as const;

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/**
 * Difficulty band, 1-based, ramping every 4 correct answers and capped at 5.
 * Mirrors the `levelFor(correctCount)` shape used by math-pop and count-it.
 */
export function levelFor(correctCount: number): number {
  return Math.min(1 + Math.floor(correctCount / 4), 5);
}

/** Level at which distractors start favouring same/similar-setting tools. */
const CLOSE_DISTRACTOR_LEVEL = 3;

/** Three choices to start, four once the player is warmed up. */
export function choiceCountFor(score: number): number {
  return score >= 150 ? 4 : 3;
}

/** Timer bar length, tightening once the fourth choice tile appears. */
export function durationFor(score: number): number {
  return choiceCountFor(score) >= 4 ? 6000 : 7000;
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

function toolById(id: string): Tool {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool id: ${id}`);
  return tool;
}

/** True when `other` sits in the same corner of the world as `setting`. */
export function isNearSetting(setting: Setting, other: Setting): boolean {
  return other === setting || NEAR_SETTINGS[setting].includes(other);
}

/**
 * Build the next round. `avoidJob` keeps the same worker from appearing twice in
 * a row. From CLOSE_DISTRACTOR_LEVEL on, distractors are drawn from the answer's
 * own or a neighbouring setting to sharpen the choice. Tools the prompt worker
 * could plausibly use are stripped out first, at every level, so exactly one
 * choice is ever right.
 */
export function genRound(
  id: number,
  score: number,
  correctCount: number,
  avoidJob?: string,
): Round {
  const count = choiceCountFor(score);
  const workerPool = avoidJob ? WORKERS.filter((w) => w.job !== avoidJob) : WORKERS;
  const worker = pick(workerPool);
  const answer = toolById(worker.toolId);

  const plausible = new Set<string>([worker.toolId, ...worker.alsoUses]);
  const pool = TOOLS.filter((t) => !plausible.has(t.id));
  const needed = count - 1;
  const distractors: Tool[] = [];

  if (levelFor(correctCount) >= CLOSE_DISTRACTOR_LEVEL) {
    const close = shuffle(pool.filter((t) => isNearSetting(answer.setting, t.setting)));
    for (const tool of close) {
      if (distractors.length >= needed) break;
      distractors.push(tool);
    }
  }

  const rest = shuffle(pool.filter((t) => !distractors.includes(t)));
  for (const tool of rest) {
    if (distractors.length >= needed) break;
    distractors.push(tool);
  }

  return {
    id,
    worker,
    answerId: answer.id,
    choices: shuffle([answer, ...distractors]),
    durationMs: durationFor(score),
  };
}
