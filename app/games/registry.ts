// Single source of truth for the five games. The home hub maps over this, and
// each game imports its own entry by slug for consistent titles/colors.

export type GameMeta = {
  slug: string;
  title: string;
  emoji: string;
  subject: string;
  blurb: string;
  /** Tailwind gradient classes for the card + in-game accent. */
  gradient: string;
  /** Solid accent used for buttons/borders inside the game. */
  accent: string;
  /** How the score is phrased on the home card, e.g. "pts" or "level". */
  scoreLabel: string;
};

export const GAMES: GameMeta[] = [
  {
    slug: "math-pop",
    title: "Math Pop",
    emoji: "🫧",
    subject: "Math",
    blurb: "Pop the bubble with the right answer before time runs out!",
    gradient: "from-sky-400 to-blue-600",
    accent: "#2563eb",
    scoreLabel: "pts",
  },
  {
    slug: "robot-run",
    title: "Robot Run",
    emoji: "🤖",
    subject: "Coding",
    blurb: "Snap arrow blocks together to drive the robot to the star.",
    gradient: "from-emerald-400 to-green-600",
    accent: "#059669",
    scoreLabel: "level",
  },
  {
    slug: "critter-match",
    title: "Critter Match",
    emoji: "🐾",
    subject: "Memory",
    blurb: "Flip the cards and match the animal pairs against the clock.",
    gradient: "from-fuchsia-400 to-purple-600",
    accent: "#9333ea",
    scoreLabel: "pts",
  },
  {
    slug: "word-drop",
    title: "Word Drop",
    emoji: "🔤",
    subject: "Spelling",
    blurb: "Catch the falling letters in order to spell the word.",
    gradient: "from-amber-400 to-orange-600",
    accent: "#ea580c",
    scoreLabel: "pts",
  },
  {
    slug: "echo",
    title: "Echo",
    emoji: "🎵",
    subject: "Focus",
    blurb: "Watch, listen, repeat. The glowing pattern grows every round.",
    gradient: "from-rose-400 to-pink-600",
    accent: "#e11d48",
    scoreLabel: "round",
  },
  {
    slug: "coin-count",
    title: "Coin Count",
    emoji: "🪙",
    subject: "Money",
    blurb: "Tap the coins that add up to the price before the timer runs out.",
    gradient: "from-amber-400 to-yellow-600",
    accent: "#ca8a04",
    scoreLabel: "pts",
  },
  {
    slug: "shape-sort",
    title: "Shape Sort",
    emoji: "🔺",
    subject: "Shapes",
    blurb: "Sort the falling shapes into the right bins. The rule keeps changing!",
    gradient: "from-cyan-400 to-teal-600",
    accent: "#0d9488",
    scoreLabel: "pts",
  },
  {
    slug: "clock-quest",
    title: "Clock Quest",
    emoji: "🕐",
    subject: "Time",
    blurb: "Read the clock and tap the matching time. Beat the clock to level up!",
    gradient: "from-indigo-400 to-blue-700",
    accent: "#4338ca",
    scoreLabel: "pts",
  },
  {
    slug: "typing-rocket",
    title: "Typing Rocket",
    emoji: "🚀",
    subject: "Typing",
    blurb: "Tap the right letters to launch the rocket before they reach the ground.",
    gradient: "from-red-500 to-rose-700",
    accent: "#e11d48",
    scoreLabel: "pts",
  },
  {
    slug: "color-mix",
    title: "Color Mix",
    emoji: "🎨",
    subject: "Colors",
    blurb: "Mix two paints to match the target color. Get it in fewer tries for more stars!",
    gradient: "from-lime-400 to-emerald-600",
    accent: "#16a34a",
    scoreLabel: "pts",
  },
];

export function getGame(slug: string): GameMeta {
  const g = GAMES.find((x) => x.slug === slug);
  if (!g) throw new Error(`Unknown game: ${slug}`);
  return g;
}
