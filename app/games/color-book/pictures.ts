// Hand-authored inline-SVG coloring pages for Color Book.
// Geometry lives here as pure data (no JSX) so the game component stays a thin
// renderer. Every picture uses the same 0..200 viewBox so one render path fits
// all of them. Each `region` is a separately fillable area with its own id; the
// `details` are decorative overlays (eyes, panes, antennae) that are drawn on
// top and never receive taps, so they don't count toward completion.

/** A tappable, floodable area. Discriminated by `shape` so every variant is
 *  fully typed and the renderer's switch stays exhaustive. */
export type Region =
  | { id: string; label: string; shape: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { id: string; label: string; shape: "circle"; cx: number; cy: number; r: number }
  | { id: string; label: string; shape: "ellipse"; cx: number; cy: number; rx: number; ry: number; transform?: string }
  | { id: string; label: string; shape: "path"; d: string };

/** Decorative, non-interactive overlay drawn above the regions. */
export type Detail =
  | { shape: "circle"; cx: number; cy: number; r: number; fill: string }
  | { shape: "path"; d: string; fill: string; stroke: string; strokeWidth: number };

export type Picture = {
  id: string;
  name: string;
  emoji: string;
  /** Shared viewBox for every page. */
  viewBox: string;
  regions: Region[];
  details: Detail[];
};

/** Light grey "not coloured yet" fill. */
export const DEFAULT_FILL = "#eeeeee";
/** Bold dark outline so every region reads clearly before and after filling. */
export const STROKE = "#1f2937";
/** Outline thickness in viewBox units (~bold on a 200-unit canvas). */
export const STROKE_WIDTH = 5;

/** One bright swatch in the palette. */
export type Swatch = { id: string; name: string; hex: string };

export const PALETTE: Swatch[] = [
  { id: "red", name: "Red", hex: "#ef4444" },
  { id: "orange", name: "Orange", hex: "#f97316" },
  { id: "yellow", name: "Yellow", hex: "#facc15" },
  { id: "green", name: "Green", hex: "#22c55e" },
  { id: "teal", name: "Teal", hex: "#14b8a6" },
  { id: "sky", name: "Sky", hex: "#38bdf8" },
  { id: "blue", name: "Blue", hex: "#3b82f6" },
  { id: "purple", name: "Purple", hex: "#a855f7" },
  { id: "pink", name: "Pink", hex: "#ec4899" },
  { id: "brown", name: "Brown", hex: "#92400e" },
];

export const VIEWBOX = "0 0 200 200";

// Ordered easy → hard by fillable-region count (4, 5, 5, 6, 6, 9) so each new
// page the child unlocks is a small step up in effort. The game's unlock and
// completion logic is index-based, so this array order is the difficulty curve.
export const PICTURES: Picture[] = [
  {
    id: "fish",
    name: "Fish",
    emoji: "🐟",
    viewBox: VIEWBOX,
    regions: [
      { id: "tail", label: "tail", shape: "path", d: "M150 100 L196 64 L196 136 Z" },
      { id: "fin-top", label: "top fin", shape: "path", d: "M84 64 L110 36 L132 64 Z" },
      { id: "fin-bottom", label: "bottom fin", shape: "path", d: "M84 136 L110 164 L132 136 Z" },
      { id: "body", label: "body", shape: "ellipse", cx: 104, cy: 100, rx: 58, ry: 42 },
    ],
    details: [
      { shape: "circle", cx: 72, cy: 88, r: 11, fill: "#ffffff" },
      { shape: "circle", cx: 68, cy: 88, r: 5, fill: STROKE },
      { shape: "path", d: "M48 108 Q58 116 70 110", fill: "none", stroke: STROKE, strokeWidth: 4 },
    ],
  },
  {
    id: "butterfly",
    name: "Butterfly",
    emoji: "🦋",
    viewBox: VIEWBOX,
    regions: [
      { id: "wing-tl", label: "top left wing", shape: "ellipse", cx: 60, cy: 70, rx: 36, ry: 32 },
      { id: "wing-tr", label: "top right wing", shape: "ellipse", cx: 140, cy: 70, rx: 36, ry: 32 },
      { id: "wing-bl", label: "bottom left wing", shape: "ellipse", cx: 66, cy: 132, rx: 30, ry: 26 },
      { id: "wing-br", label: "bottom right wing", shape: "ellipse", cx: 134, cy: 132, rx: 30, ry: 26 },
      { id: "body", label: "body", shape: "ellipse", cx: 100, cy: 100, rx: 14, ry: 58 },
    ],
    details: [
      { shape: "path", d: "M97 46 Q86 28 76 24", fill: "none", stroke: STROKE, strokeWidth: 4 },
      { shape: "path", d: "M103 46 Q114 28 124 24", fill: "none", stroke: STROKE, strokeWidth: 4 },
      { shape: "circle", cx: 76, cy: 24, r: 4, fill: STROKE },
      { shape: "circle", cx: 124, cy: 24, r: 4, fill: STROKE },
      { shape: "circle", cx: 94, cy: 74, r: 3, fill: STROKE },
      { shape: "circle", cx: 106, cy: 74, r: 3, fill: STROKE },
    ],
  },
  {
    id: "icecream",
    name: "Ice Cream",
    emoji: "🍦",
    viewBox: VIEWBOX,
    regions: [
      { id: "cone", label: "cone", shape: "path", d: "M68 108 L132 108 L100 186 Z" },
      { id: "scoop-bottom", label: "bottom scoop", shape: "circle", cx: 100, cy: 100, r: 36 },
      { id: "scoop-middle", label: "middle scoop", shape: "circle", cx: 100, cy: 72, r: 31 },
      { id: "scoop-top", label: "top scoop", shape: "circle", cx: 100, cy: 46, r: 26 },
      { id: "cherry", label: "cherry", shape: "circle", cx: 100, cy: 27, r: 15 },
    ],
    details: [
      { shape: "path", d: "M82 124 L118 124 M90 142 L110 142 M97 160 L103 160", fill: "none", stroke: STROKE, strokeWidth: 2 },
      { shape: "path", d: "M100 12 Q108 4 116 8", fill: "none", stroke: STROKE, strokeWidth: 3 },
    ],
  },
  {
    id: "house",
    name: "House",
    emoji: "🏠",
    viewBox: VIEWBOX,
    regions: [
      { id: "chimney", label: "chimney", shape: "rect", x: 118, y: 50, width: 28, height: 34 },
      { id: "wall", label: "wall", shape: "rect", x: 46, y: 95, width: 108, height: 84 },
      { id: "roof", label: "roof", shape: "path", d: "M36 96 L100 42 L164 96 Z" },
      { id: "door", label: "door", shape: "rect", x: 86, y: 132, width: 30, height: 47, rx: 4 },
      { id: "window-left", label: "left window", shape: "rect", x: 57, y: 109, width: 28, height: 28, rx: 3 },
      { id: "window-right", label: "right window", shape: "rect", x: 115, y: 109, width: 28, height: 28, rx: 3 },
    ],
    details: [
      { shape: "circle", cx: 110, cy: 156, r: 3, fill: STROKE },
      { shape: "path", d: "M71 110 L71 136 M58 123 L84 123", fill: "none", stroke: STROKE, strokeWidth: 2 },
      { shape: "path", d: "M129 110 L129 136 M116 123 L142 123", fill: "none", stroke: STROKE, strokeWidth: 2 },
    ],
  },
  {
    id: "rocket",
    name: "Rocket",
    emoji: "🚀",
    viewBox: VIEWBOX,
    regions: [
      { id: "flame", label: "flame", shape: "path", d: "M85 138 Q100 188 115 138 Z" },
      { id: "fin-left", label: "left fin", shape: "path", d: "M80 108 L56 152 L80 142 Z" },
      { id: "fin-right", label: "right fin", shape: "path", d: "M120 108 L144 152 L120 142 Z" },
      { id: "body", label: "body", shape: "rect", x: 80, y: 66, width: 40, height: 76, rx: 8 },
      { id: "nose", label: "nose cone", shape: "path", d: "M100 28 L122 70 L78 70 Z" },
      { id: "window", label: "window", shape: "circle", cx: 100, cy: 96, r: 15 },
    ],
    details: [
      { shape: "circle", cx: 95, cy: 91, r: 4, fill: "#ffffff" },
      { shape: "circle", cx: 86, cy: 78, r: 2, fill: STROKE },
      { shape: "circle", cx: 114, cy: 78, r: 2, fill: STROKE },
      { shape: "circle", cx: 86, cy: 132, r: 2, fill: STROKE },
      { shape: "circle", cx: 114, cy: 132, r: 2, fill: STROKE },
    ],
  },
  {
    id: "flower",
    name: "Flower",
    emoji: "🌸",
    viewBox: VIEWBOX,
    regions: [
      { id: "stem", label: "stem", shape: "rect", x: 94, y: 95, width: 12, height: 82, rx: 6 },
      { id: "petal-top", label: "top petal", shape: "circle", cx: 100, cy: 50, r: 20 },
      { id: "petal-ur", label: "upper right petal", shape: "circle", cx: 130, cy: 67, r: 20 },
      { id: "petal-lr", label: "lower right petal", shape: "circle", cx: 130, cy: 103, r: 20 },
      { id: "petal-bottom", label: "bottom petal", shape: "circle", cx: 100, cy: 120, r: 20 },
      { id: "petal-ll", label: "lower left petal", shape: "circle", cx: 70, cy: 103, r: 20 },
      { id: "petal-ul", label: "upper left petal", shape: "circle", cx: 70, cy: 67, r: 20 },
      { id: "center", label: "flower center", shape: "circle", cx: 100, cy: 85, r: 24 },
      { id: "leaf", label: "leaf", shape: "ellipse", cx: 126, cy: 150, rx: 24, ry: 13, transform: "rotate(-35 126 150)" },
    ],
    details: [
      { shape: "circle", cx: 92, cy: 80, r: 3, fill: STROKE },
      { shape: "circle", cx: 108, cy: 82, r: 3, fill: STROKE },
      { shape: "circle", cx: 100, cy: 92, r: 3, fill: STROKE },
    ],
  },
];

export const TOTAL_PICTURES = PICTURES.length;

/** Stars earned from how many pictures the child has finished. */
export function starsFor(done: number, total: number): number {
  if (done >= total) return 3;
  if (done >= Math.ceil(total / 2)) return 2;
  if (done >= 1) return 1;
  return 0;
}
