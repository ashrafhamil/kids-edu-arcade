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
];

export function getGame(slug: string): GameMeta {
  const g = GAMES.find((x) => x.slug === slug);
  if (!g) throw new Error(`Unknown game: ${slug}`);
  return g;
}
