// Synonyms dataset + pure round/scoring helpers.
//
// No React, and nothing random or time-based at module scope. The only Math.random
// lives inside genRound(), which the component calls strictly from handlers/effects,
// keeping this module SSR-safe.
//
// THE ONE INVARIANT: a distractor must never also be a valid synonym of the prompt.
// It is guaranteed structurally, not by review:
//   1. Every word belongs to exactly ONE sense group. Two words are synonyms if and
//      only if they share a group — the dataset has no other way to express synonymy.
//   2. The correct answer is always another member of the prompt's own group.
//   3. Distractors are only ever drawn from OTHER groups, one word per group.
//   4. Groups that a careful adult could read as overlapping (big/huge, nice/pretty)
//      are declared in NEAR and blocked as distractor sources. NEAR is made symmetric
//      when it is built, so a one-sided authoring mistake still blocks both ways.
//   5. NEAR-blocking also applies between the distractors themselves, so no two tiles
//      on screen ever mean the same thing either.

export type SynWord = {
  /** Display word. Unique across the whole dataset, so it doubles as an id. */
  word: string;
  /** Key of the sense group this word belongs to. Same key = same meaning. */
  group: string;
};

export type SenseGroup = {
  key: string;
  /** Words that all mean the same thing. Two or more makes the group promptable. */
  words: SynWord[];
  /** Key of the group holding this group's opposite meaning. */
  opposite: string;
};

type RawGroup = { key: string; words: string[]; opposite: string };

// Sense groups. A group with two or more words can host a prompt (it has a synonym to
// answer with); a one-word group exists only to supply the antonym / unrelated tiles.
// Vocabulary is deliberately kept to words a 7–10 year old uses; loosely-synonymous
// pairs (sleepy/tired, damp/wet, sea/ocean) are left out on purpose.
const RAW_GROUPS: RawGroup[] = [
  { key: "big", words: ["Big", "Large"], opposite: "small" },
  { key: "small", words: ["Small", "Tiny", "Little"], opposite: "big" },
  { key: "huge", words: ["Huge", "Enormous"], opposite: "small" },
  { key: "happy", words: ["Happy", "Glad"], opposite: "sad" },
  { key: "sad", words: ["Sad", "Unhappy"], opposite: "happy" },
  { key: "fast", words: ["Fast", "Quick"], opposite: "slow" },
  { key: "slow", words: ["Slow"], opposite: "fast" },
  { key: "cold", words: ["Cold", "Chilly"], opposite: "hot" },
  { key: "hot", words: ["Hot"], opposite: "cold" },
  { key: "angry", words: ["Angry", "Mad"], opposite: "calm" },
  { key: "calm", words: ["Calm", "Relaxed"], opposite: "angry" },
  { key: "begin", words: ["Begin", "Start"], opposite: "finish" },
  { key: "finish", words: ["Finish", "End"], opposite: "begin" },
  { key: "shout", words: ["Shout", "Yell"], opposite: "whisper" },
  { key: "whisper", words: ["Whisper"], opposite: "shout" },
  { key: "scared", words: ["Scared", "Afraid"], opposite: "brave" },
  { key: "brave", words: ["Brave"], opposite: "scared" },
  { key: "sick", words: ["Sick", "Ill"], opposite: "healthy" },
  { key: "healthy", words: ["Healthy"], opposite: "sick" },
  { key: "smart", words: ["Smart", "Clever"], opposite: "foolish" },
  { key: "foolish", words: ["Foolish"], opposite: "smart" },
  { key: "loud", words: ["Loud", "Noisy"], opposite: "quiet" },
  { key: "quiet", words: ["Quiet"], opposite: "loud" },
  { key: "rich", words: ["Rich", "Wealthy"], opposite: "poor" },
  { key: "poor", words: ["Poor"], opposite: "rich" },
  { key: "strong", words: ["Strong", "Powerful"], opposite: "weak" },
  { key: "weak", words: ["Weak"], opposite: "strong" },
  { key: "pretty", words: ["Pretty", "Beautiful"], opposite: "ugly" },
  { key: "ugly", words: ["Ugly"], opposite: "pretty" },
  { key: "child", words: ["Kid", "Child"], opposite: "adult" },
  { key: "adult", words: ["Adult"], opposite: "child" },
  { key: "talk", words: ["Talk", "Speak"], opposite: "listen" },
  { key: "listen", words: ["Listen"], opposite: "talk" },
  { key: "easy", words: ["Easy", "Simple"], opposite: "hard" },
  { key: "hard", words: ["Hard"], opposite: "easy" },
  { key: "buy", words: ["Buy", "Purchase"], opposite: "sell" },
  { key: "sell", words: ["Sell"], opposite: "buy" },
  { key: "nice", words: ["Nice", "Kind"], opposite: "mean" },
  { key: "mean", words: ["Mean"], opposite: "nice" },
  { key: "neat", words: ["Neat", "Tidy"], opposite: "messy" },
  { key: "messy", words: ["Messy"], opposite: "neat" },
  { key: "smile", words: ["Smile", "Grin"], opposite: "frown" },
  { key: "frown", words: ["Frown"], opposite: "smile" },
  { key: "help", words: ["Help", "Assist"], opposite: "hurt" },
  { key: "hurt", words: ["Hurt"], opposite: "help" },
  { key: "hurry", words: ["Hurry", "Rush"], opposite: "wait" },
  { key: "wait", words: ["Wait"], opposite: "hurry" },
  { key: "fix", words: ["Fix", "Repair"], opposite: "break" },
  { key: "break", words: ["Break"], opposite: "fix" },
  { key: "find", words: ["Find", "Discover"], opposite: "lose" },
  { key: "lose", words: ["Lose"], opposite: "find" },
  { key: "thin", words: ["Thin", "Slim"], opposite: "thick" },
  { key: "thick", words: ["Thick"], opposite: "thin" },
  { key: "answer", words: ["Answer", "Reply"], opposite: "question" },
  { key: "question", words: ["Question"], opposite: "answer" },
  { key: "lift", words: ["Lift", "Raise"], opposite: "lower" },
  { key: "lower", words: ["Lower"], opposite: "lift" },
  { key: "leave", words: ["Leave", "Depart"], opposite: "arrive" },
  { key: "arrive", words: ["Arrive"], opposite: "leave" },
  { key: "tasty", words: ["Tasty", "Delicious"], opposite: "yucky" },
  { key: "yucky", words: ["Yucky"], opposite: "tasty" },
];

export const GROUPS: SenseGroup[] = RAW_GROUPS.map((g) => ({
  key: g.key,
  words: g.words.map((word) => ({ word, group: g.key })),
  opposite: g.opposite,
}));

const GROUP_BY_KEY: Record<string, SenseGroup> = {};
for (const group of GROUPS) GROUP_BY_KEY[group.key] = group;

/** Every word in the dataset, prompts and antonym-only fodder alike. */
export const ALL_WORDS: SynWord[] = GROUPS.flatMap((g) => g.words);

/**
 * Words that can be a prompt: only words whose group holds a second word to answer
 * with. One-word groups (Slow, Whisper, Adult…) never become prompts.
 */
export const PROMPTABLE_WORDS: SynWord[] = GROUPS.filter((g) => g.words.length > 1).flatMap(
  (g) => g.words,
);

/** Distinct synonym pairs in the dataset — every unordered same-group word pair. */
export const PAIR_COUNT: number = GROUPS.reduce(
  (total, g) => total + (g.words.length * (g.words.length - 1)) / 2,
  0,
);

// Group pairs that a careful adult could argue overlap in meaning. Neither side may
// supply a distractor for the other, so the round always has exactly one defensible
// answer. Authored one-way; made symmetric below.
const RAW_NEAR: [string, string][] = [
  ["big", "huge"],
  ["big", "thick"],
  ["small", "thin"],
  ["shout", "loud"],
  ["shout", "talk"],
  ["talk", "answer"],
  ["happy", "calm"],
  ["fast", "hurry"],
  ["pretty", "nice"],
  ["pretty", "neat"],
  ["nice", "tasty"],
  ["calm", "quiet"],
  ["calm", "slow"],
  ["quiet", "whisper"],
  ["strong", "brave"],
  ["strong", "healthy"],
  ["sick", "weak"],
  ["angry", "mean"],
  ["sad", "hurt"],
];

/** groupKey -> group keys too close in meaning to serve as its distractor. Symmetric. */
const NEAR: Record<string, string[]> = {};
for (const group of GROUPS) NEAR[group.key] = [];
for (const [a, b] of RAW_NEAR) {
  if (!NEAR[a].includes(b)) NEAR[a].push(b);
  if (!NEAR[b].includes(a)) NEAR[b].push(a);
}

export type Round = {
  id: number;
  /** Difficulty level this round was built for (1-based). */
  level: number;
  /** The word shown big at the top. */
  prompt: SynWord;
  /** A different word from the prompt's own group — the one true answer. */
  correct: SynWord;
  /** The correct word plus distractors from other groups, shuffled. */
  choices: SynWord[];
  /** How long this round's timer bar lasts, in ms. */
  durationMs: number;
};

// --- Difficulty + scoring --------------------------------------------------

const STAR_THRESHOLDS = [80, 200, 400] as const;
const CORRECT_PER_LEVEL = 4;
const CHOICE_COUNT = 4;

/** Level at which one distractor becomes an antonym of the prompt. */
export const ANTONYM_LEVEL = 3;

/** 0–3 stars from the final score. */
export function starsFor(score: number): number {
  return STAR_THRESHOLDS.reduce((stars, threshold) => stars + (score >= threshold ? 1 : 0), 0);
}

/** Level ramps one step every four correct answers, starting at 1. */
export function levelFor(correctCount: number): number {
  return 1 + Math.floor(correctCount / CORRECT_PER_LEVEL);
}

/** Timer bar length: tightens with every level, never below 4s. */
export function durationFor(level: number): number {
  return Math.max(4000, 8000 - level * 600);
}

/** From ANTONYM_LEVEL on, one tile is an antonym of the prompt instead of a stranger. */
export function usesAntonym(level: number): boolean {
  return level >= ANTONYM_LEVEL;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** A word from `key`'s group, plus that group and its near-neighbours marked as spent. */
function takeFromGroup(key: string, spent: Set<string>): SynWord {
  const group = GROUP_BY_KEY[key];
  spent.add(key);
  for (const near of NEAR[key]) spent.add(near);
  return pick(group.words);
}

/**
 * Build a round: a prompt word, a synonym from its own group as the correct answer, and
 * distractors that each come from a DIFFERENT group which is neither the prompt's group
 * nor near it in meaning — so exactly one choice can ever be right.
 *
 * Below ANTONYM_LEVEL the prompt's opposite group is blocked too, keeping early
 * distractors unrelated. From ANTONYM_LEVEL one distractor is drawn from that opposite
 * group first, which is the sharpest possible wrong answer for this skill.
 *
 * `usedPrompts` keeps a prompt from repeating until the pool cycles; `avoidWord` blocks an
 * immediate repeat across a cycle reset. Random calls live only here, so callers must
 * invoke this from handlers/effects (never during render) to stay SSR-safe.
 */
export function genRound(
  level: number,
  id: number,
  usedPrompts: readonly string[] = [],
  avoidWord?: string,
): Round {
  const used = new Set(usedPrompts);
  let eligible = PROMPTABLE_WORDS.filter((w) => !used.has(w.word) && w.word !== avoidWord);
  // Fallbacks keep the game playable if the caller hasn't reset the cycle yet.
  if (eligible.length === 0) eligible = PROMPTABLE_WORDS.filter((w) => w.word !== avoidWord);
  if (eligible.length === 0) eligible = [...PROMPTABLE_WORDS];

  const prompt = pick(eligible);
  const promptGroup = GROUP_BY_KEY[prompt.group];
  const correct = pick(promptGroup.words.filter((w) => w.word !== prompt.word));

  // Groups that may no longer supply a tile: the prompt's own group (every word in it is
  // a synonym) and every group near it in meaning.
  const spent = new Set<string>([prompt.group, ...NEAR[prompt.group]]);

  const distractors: SynWord[] = [];
  if (usesAntonym(level)) {
    distractors.push(takeFromGroup(promptGroup.opposite, spent));
  } else {
    spent.add(promptGroup.opposite);
  }

  for (const group of shuffle(GROUPS)) {
    if (distractors.length >= CHOICE_COUNT - 1) break;
    if (spent.has(group.key)) continue;
    distractors.push(takeFromGroup(group.key, spent));
  }

  return {
    id,
    level,
    prompt,
    correct,
    choices: shuffle([correct, ...distractors]),
    durationMs: durationFor(level),
  };
}

/**
 * Pure dataset self-check, for verification scripts — never called at runtime, so a data
 * slip can't take the game down mid-play. Returns a human-readable problem per issue and
 * an empty array when the dataset is sound.
 */
export function datasetIssues(): string[] {
  const issues: string[] = [];
  const seenWords = new Set<string>();

  for (const group of GROUPS) {
    for (const { word } of group.words) {
      if (seenWords.has(word)) issues.push(`"${word}" appears in more than one group`);
      seenWords.add(word);
    }
    if (!GROUP_BY_KEY[group.opposite]) {
      issues.push(`group "${group.key}" points at unknown opposite "${group.opposite}"`);
      continue;
    }
    if (group.opposite === group.key) issues.push(`group "${group.key}" is its own opposite`);
    if (NEAR[group.key].includes(group.opposite)) {
      issues.push(`group "${group.key}" lists its opposite as a near-synonym`);
    }
  }

  for (const [a, b] of RAW_NEAR) {
    if (!GROUP_BY_KEY[a] || !GROUP_BY_KEY[b]) issues.push(`NEAR pair ${a}/${b} names an unknown group`);
  }

  return issues;
}
