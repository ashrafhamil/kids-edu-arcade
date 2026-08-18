// Hand-authored inline-SVG backdrops and sticker trays for Sticker Scene.
// Everything here is static data plus pure helpers so `Game.tsx` stays a thin
// renderer. No external assets: each backdrop is a handful of bands, circles
// and paths drawn on one shared viewBox.

import type { ReactElement } from "react";

/** Every backdrop is drawn on this box; the canvas keeps the same 3:2 aspect
 *  ratio so the art never letterboxes and percent coordinates stay honest. */
export const VIEWBOX = "0 0 300 200";
export const ASPECT = "aspect-[3/2]";

/** Stickers needed before a scene counts as finished. */
export const SCENE_TARGET = 8;

/** Placed stickers are stored as a percentage of the canvas box, so they land
 *  in the same spot on any screen size. Keep them off the very edge. */
const MIN_PERCENT = 5;
const MAX_PERCENT = 95;

export function clampPercent(value: number): number {
  if (value < MIN_PERCENT) return MIN_PERCENT;
  if (value > MAX_PERCENT) return MAX_PERCENT;
  return value;
}

/** Fallback drop points for keyboard placement, which has no pointer to read.
 *  A ring of `SCENE_TARGET` spots so repeated presses spread out instead of
 *  stacking one sticker on top of another. */
const KEYBOARD_SPOTS: { x: number; y: number }[] = [
  { x: 50, y: 26 },
  { x: 72, y: 34 },
  { x: 80, y: 54 },
  { x: 70, y: 74 },
  { x: 50, y: 80 },
  { x: 30, y: 74 },
  { x: 20, y: 54 },
  { x: 28, y: 34 },
];

export function keyboardSpot(placedCount: number): { x: number; y: number } {
  return KEYBOARD_SPOTS[placedCount % KEYBOARD_SPOTS.length];
}

export type SceneId = "beach" | "space" | "farm" | "city";

export type Scene = {
  id: SceneId;
  /** Picker glyph — the only thing a 3-year-old has to read. */
  emoji: string;
  /** Screen-reader text; never rendered as visible copy. */
  label: string;
  /** Themed tray, 5 stickers per scene. */
  stickers: string[];
  Backdrop: () => ReactElement;
};

/* ------------------------------------------------------------------ beach */

function BeachBackdrop(): ReactElement {
  return (
    <g>
      <rect x="0" y="0" width="300" height="110" fill="#7dd3fc" />
      <circle cx="252" cy="34" r="30" fill="#fef08a" opacity="0.55" />
      <circle cx="252" cy="34" r="21" fill="#fde047" />
      <rect x="0" y="100" width="300" height="58" fill="#0284c7" />
      <rect x="0" y="100" width="300" height="18" fill="#38bdf8" />
      <path
        d="M8 122 q11 -8 22 0 t22 0 t22 0 t22 0"
        fill="none"
        stroke="#e0f2fe"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M150 138 q11 -8 22 0 t22 0 t22 0 t22 0"
        fill="none"
        stroke="#e0f2fe"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="0" y="152" width="300" height="48" fill="#fcd34d" />
      <path d="M0 152 Q150 136 300 152 L300 162 L0 162 Z" fill="#fde68a" />
    </g>
  );
}

/* ------------------------------------------------------------------ space */

const STARS: { cx: number; cy: number; r: number }[] = [
  { cx: 18, cy: 22, r: 2.5 },
  { cx: 52, cy: 14, r: 1.6 },
  { cx: 86, cy: 34, r: 2.2 },
  { cx: 120, cy: 12, r: 1.4 },
  { cx: 148, cy: 40, r: 2.6 },
  { cx: 176, cy: 18, r: 1.8 },
  { cx: 206, cy: 36, r: 1.5 },
  { cx: 28, cy: 62, r: 1.8 },
  { cx: 68, cy: 82, r: 2.4 },
  { cx: 104, cy: 66, r: 1.5 },
  { cx: 140, cy: 92, r: 2 },
  { cx: 182, cy: 74, r: 2.7 },
  { cx: 222, cy: 96, r: 1.6 },
  { cx: 262, cy: 82, r: 2.1 },
  { cx: 288, cy: 30, r: 1.7 },
  { cx: 12, cy: 108, r: 2.3 },
  { cx: 58, cy: 124, r: 1.5 },
  { cx: 96, cy: 110, r: 2 },
  { cx: 236, cy: 20, r: 2.4 },
  { cx: 272, cy: 118, r: 1.8 },
];

function SpaceBackdrop(): ReactElement {
  return (
    <g>
      <rect x="0" y="0" width="300" height="200" fill="#0f172a" />
      {STARS.map((s) => (
        <circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} fill="#f8fafc" />
      ))}
      <circle cx="52" cy="46" r="24" fill="#f472b6" />
      <circle cx="44" cy="38" r="7" fill="#fbcfe8" opacity="0.8" />
      <ellipse
        cx="52"
        cy="46"
        rx="40"
        ry="11"
        fill="none"
        stroke="#fbcfe8"
        strokeWidth="3"
        transform="rotate(-18 52 46)"
      />
      <path
        d="M0 200 L0 162 Q78 130 152 154 Q226 178 300 142 L300 200 Z"
        fill="#4b5563"
      />
      <circle cx="70" cy="176" r="12" fill="#374151" />
      <circle cx="196" cy="184" r="9" fill="#374151" />
      <circle cx="258" cy="168" r="7" fill="#374151" />
    </g>
  );
}

/* ------------------------------------------------------------------- farm */

const FENCE_POSTS = [10, 50, 90, 130, 170, 210, 250, 284];

function FarmBackdrop(): ReactElement {
  return (
    <g>
      <rect x="0" y="0" width="300" height="120" fill="#bae6fd" />
      <circle cx="46" cy="32" r="20" fill="#fde047" />
      <ellipse cx="196" cy="34" rx="26" ry="13" fill="#ffffff" opacity="0.9" />
      <ellipse cx="220" cy="40" rx="20" ry="10" fill="#ffffff" opacity="0.9" />
      <path d="M0 120 Q64 74 128 120 Z" fill="#22c55e" />
      <path d="M132 120 Q206 68 280 120 Z" fill="#16a34a" />
      <rect x="0" y="112" width="300" height="88" fill="#86efac" />
      <path
        d="M0 132 H300 M0 146 H300"
        stroke="#4ade80"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="0" y="160" width="300" height="6" fill="#d97706" />
      <rect x="0" y="178" width="300" height="6" fill="#d97706" />
      {FENCE_POSTS.map((x) => (
        <rect key={x} x={x} y="150" width="7" height="44" rx="2" fill="#b45309" />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------- city */

type Building = {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  fill: string;
};

const BUILDINGS: Building[] = [
  { x: 6, y: 70, w: 46, h: 85, cols: 2, rows: 4, fill: "#475569" },
  { x: 58, y: 44, w: 38, h: 111, cols: 2, rows: 5, fill: "#334155" },
  { x: 102, y: 88, w: 52, h: 67, cols: 3, rows: 3, fill: "#64748b" },
  { x: 160, y: 56, w: 42, h: 99, cols: 2, rows: 5, fill: "#475569" },
  { x: 208, y: 96, w: 40, h: 59, cols: 2, rows: 3, fill: "#334155" },
  { x: 254, y: 66, w: 40, h: 89, cols: 2, rows: 4, fill: "#64748b" },
];

const WINDOW_SIZE = 9;
const WINDOW_STEP_X = 14;
const WINDOW_STEP_Y = 16;

/** Deterministic window grid for one building — no randomness, so server and
 *  client always draw the same city. */
function windowsFor(b: Building): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < b.rows; row += 1) {
    for (let col = 0; col < b.cols; col += 1) {
      cells.push({
        x: b.x + 7 + col * WINDOW_STEP_X,
        y: b.y + 9 + row * WINDOW_STEP_Y,
      });
    }
  }
  return cells;
}

function CityBackdrop(): ReactElement {
  return (
    <g>
      <rect x="0" y="0" width="300" height="158" fill="#bfdbfe" />
      <circle cx="270" cy="24" r="17" fill="#fcd34d" />
      {BUILDINGS.map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill={b.fill} />
          {windowsFor(b).map((w) => (
            <rect
              key={`${w.x}-${w.y}`}
              x={w.x}
              y={w.y}
              width={WINDOW_SIZE}
              height={WINDOW_SIZE}
              rx="1.5"
              fill="#fde68a"
            />
          ))}
        </g>
      ))}
      <rect x="0" y="150" width="300" height="9" fill="#cbd5e1" />
      <rect x="0" y="159" width="300" height="41" fill="#1f2937" />
      <path
        d="M0 180 H300"
        stroke="#fbbf24"
        strokeWidth="4"
        strokeDasharray="18 14"
        strokeLinecap="round"
      />
    </g>
  );
}

/* ------------------------------------------------------------------ table */

// Ordered gentlest -> busiest backdrop (open sand, empty sky, fenced field,
// packed street). A sandbox has no wrong answer to make harder, so this ordering
// is the ramp: each scene the child moves along has more going on to place
// stickers around than the one before it.
export const SCENES: Scene[] = [
  {
    id: "beach",
    emoji: "🏖️",
    label: "Beach scene",
    stickers: ["🐚", "🦀", "⛱️", "🏐", "🐠"],
    Backdrop: BeachBackdrop,
  },
  {
    id: "space",
    emoji: "🚀",
    label: "Space scene",
    stickers: ["🚀", "🛸", "👽", "⭐", "🪐"],
    Backdrop: SpaceBackdrop,
  },
  {
    id: "farm",
    emoji: "🐄",
    label: "Farm scene",
    stickers: ["🐄", "🐓", "🚜", "🌾", "🍎"],
    Backdrop: FarmBackdrop,
  },
  {
    id: "city",
    emoji: "🏙️",
    label: "City scene",
    stickers: ["🚕", "🚦", "🏢", "🐕", "🌳"],
    Backdrop: CityBackdrop,
  },
];

export const TOTAL_SCENES = SCENES.length;

/** One star per finished scene, capped at three. */
export function starsFor(scenesFinished: number): number {
  return Math.min(scenesFinished, 3);
}
