// Pure data + helpers for Tap Tunes. No browser globals, no Math.random here, so
// this module is safe to evaluate during SSR.

export type Note = {
  /** Display label (the pitch letter), e.g. "C", "G". */
  name: string;
  /** Frequency in Hz fed to sfx.note() so tapping literally performs the pitch. */
  freq: number;
  /** Tile fill colour — pitch-coded, like coloured bells / Boomwhackers. */
  color: string;
  /** Legible text colour for that fill. */
  text: string;
};

// Octave-4 note frequencies (plus C5) the melody draws from.
const FREQ: Record<string, number> = {
  C: 261.63,
  D: 293.66,
  E: 329.63,
  F: 349.23,
  G: 392.0,
  A: 440.0,
  B: 493.88,
};

// Pitch-coded colours: each note always wears the same colour, so kids start to
// "see" the tune. White text everywhere except the bright yellow E.
const COLOR: Record<string, { color: string; text: string }> = {
  C: { color: "#ef4444", text: "#ffffff" }, // red
  D: { color: "#f97316", text: "#ffffff" }, // orange
  E: { color: "#eab308", text: "#1f2937" }, // yellow (dark text for contrast)
  F: { color: "#22c55e", text: "#ffffff" }, // green
  G: { color: "#3b82f6", text: "#ffffff" }, // blue
  A: { color: "#a855f7", text: "#ffffff" }, // purple
  B: { color: "#ec4899", text: "#ffffff" }, // pink
};

function note(name: string): Note {
  return { name, freq: FREQ[name], color: COLOR[name].color, text: COLOR[name].text };
}

/** A playable tune: a friendly title, an emoji, and the note sequence (looped). */
export type Song = {
  id: string;
  title: string;
  emoji: string;
  notes: Note[];
};

// Each tune is written in C major within the C–B palette above (no sharps/flats,
// single octave) so every pitch already has a colour and plays via sfx.note().
// The game loops whichever song is picked, exactly as before.
const SCORES: { id: string; title: string; emoji: string; pitches: string }[] = [
  {
    id: "twinkle",
    title: "Twinkle Twinkle",
    emoji: "⭐",
    pitches:
      "C C G G A A G F F E E D D C G G F F E E D G G F F E E D C C G G A A G F F E E D D C",
  },
  {
    id: "mary",
    title: "Mary Had a Little Lamb",
    emoji: "🐑",
    pitches: "E D C D E E E D D D E G G E D C D E E E E D D E D C",
  },
  {
    id: "row",
    title: "Row Your Boat",
    emoji: "🚣",
    pitches: "C C C D E E D E F G C C C G G G E E E C C C G F E D C",
  },
  {
    id: "hotcross",
    title: "Hot Cross Buns",
    emoji: "🥐",
    pitches: "E D C E D C C C C C D D D D E D C",
  },
  {
    id: "macdonald",
    title: "Old MacDonald",
    emoji: "🐮",
    pitches: "C C C G A A G E E D D C",
  },
  {
    id: "london",
    title: "London Bridge",
    emoji: "🌉",
    pitches: "G A G F E F G D E F E F G G A G F E F G D G E C",
  },
];

export const SONGS: Song[] = SCORES.map((s) => ({
  id: s.id,
  title: s.title,
  emoji: s.emoji,
  notes: s.pitches.split(" ").map(note),
}));

/** Fall speed (px/sec) climbs gently with score, then caps so it stays catchable. */
export function speedFor(score: number): number {
  return Math.min(120 + Math.floor(score / 60) * 12, 300);
}

/** Stars (0–3) earned for a final score. */
export function starsFor(score: number): number {
  if (score >= 400) return 3;
  if (score >= 200) return 2;
  if (score >= 80) return 1;
  return 0;
}
