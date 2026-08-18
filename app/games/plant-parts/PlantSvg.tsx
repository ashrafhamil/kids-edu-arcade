"use client";

import type { PartId } from "./rounds";

// Hand-authored inline-SVG plant. Geometry is plain data keyed by PartId so the
// renderer stays one small code path, and so the highlight pass can re-draw the
// exact same shapes as a thick outline without duplicating any coordinates.
//
// Everything here is a module-scope constant: pure numbers, no randomness, no
// browser APIs, so the picture is identical on server and client.

const VIEWBOX_WIDTH = 220;
const VIEWBOX_HEIGHT = 230;
/** Soil surface: roots live below this line, everything else above it. */
const SOIL_TOP = 178;
const FLOWER_CENTER = { x: 110, y: 52 };

const OUTLINE = "#1f2937";
const OUTLINE_WIDTH = 3;
/** Non-highlighted parts fade back so the glowing one wins on brightness alone. */
const DIM_OPACITY = 0.28;
/** Dark ring drawn widest, then a white ring inside it: a colour-blind-safe halo. */
const HALO_DARK = "#0f172a";
const HALO_LIGHT = "#ffffff";
const HALO_DARK_EXTRA = 14;
const HALO_LIGHT_EXTRA = 7;

type Paint = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Small trims (fruit stalk, shine) that would clutter the halo if outlined. */
  skipHalo?: boolean;
};

type Shape = Paint &
  (
    | { kind: "path"; d: string }
    | { kind: "circle"; cx: number; cy: number; r: number }
    | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotate?: number }
  );

/** Six petals evenly spaced around the flower centre, each turned to point outward. */
const PETAL_COUNT = 6;
const PETAL_ORBIT = 17;
const PETALS: Shape[] = Array.from({ length: PETAL_COUNT }, (_, i) => {
  const angle = (i * 360) / PETAL_COUNT;
  const radians = (angle * Math.PI) / 180;
  return {
    kind: "ellipse",
    cx: FLOWER_CENTER.x + PETAL_ORBIT * Math.sin(radians),
    cy: FLOWER_CENTER.y - PETAL_ORBIT * Math.cos(radians),
    rx: 7,
    ry: 15,
    rotate: angle,
    fill: "#f472b6",
  };
});

const PART_SHAPES: Record<PartId, Shape[]> = {
  // Taproot plus four side roots, fanning out under the soil line.
  root: [
    { kind: "path", d: "M110 176 L110 214", stroke: "#6b4423", strokeWidth: 9 },
    { kind: "path", d: "M110 190 C 98 200 84 202 70 212", stroke: "#6b4423", strokeWidth: 6 },
    { kind: "path", d: "M110 196 C 124 206 140 206 152 214", stroke: "#6b4423", strokeWidth: 6 },
    { kind: "path", d: "M110 206 C 104 212 100 216 97 220", stroke: "#6b4423", strokeWidth: 5 },
    { kind: "path", d: "M110 206 C 116 212 120 216 123 220", stroke: "#6b4423", strokeWidth: 5 },
  ],
  // One gently bowed stalk from the soil up into the flower.
  stem: [
    { kind: "path", d: "M110 180 C 106 150 114 116 110 80", stroke: "#3f8f29", strokeWidth: 11 },
  ],
  // Two mirrored leaves, each a closed two-curve almond off the stalk.
  leaf: [
    { kind: "path", d: "M106 140 C 84 120 50 122 40 148 C 58 168 92 164 106 140 Z", fill: "#6cc24a" },
    { kind: "path", d: "M114 150 C 136 130 170 132 178 158 C 160 178 128 174 114 150 Z", fill: "#6cc24a" },
  ],
  // Six petals with a fat golden middle drawn last, over the petal bases.
  flower: [...PETALS, { kind: "circle", cx: FLOWER_CENTER.x, cy: FLOWER_CENTER.y, r: 13, fill: "#fbbf24" }],
  // A round berry on its own little branch off the stem.
  fruit: [
    { kind: "path", d: "M112 116 C 130 106 150 102 164 100", stroke: "#3f8f29", strokeWidth: 6, skipHalo: true },
    { kind: "circle", cx: 168, cy: 112, r: 18, fill: "#ef4444" },
    { kind: "ellipse", cx: 162, cy: 105, rx: 5, ry: 3, rotate: -35, fill: "#ffffff", stroke: "none", skipHalo: true },
  ],
  // Two loose seeds resting on the soil, clear of the roots below.
  seed: [
    { kind: "ellipse", cx: 46, cy: 170, rx: 12, ry: 8, rotate: -12, fill: "#b3703a" },
    { kind: "ellipse", cx: 69, cy: 174, rx: 9, ry: 6, rotate: 10, fill: "#b3703a" },
  ],
};

// Backdrop that is never an answer, so it never dims and never glows.
const SOIL: Shape[] = [
  {
    kind: "path",
    d: `M0 ${SOIL_TOP} H${VIEWBOX_WIDTH} V${VIEWBOX_HEIGHT} H0 Z`,
    fill: "#e6bd8c",
    stroke: "none",
  },
  { kind: "path", d: `M0 ${SOIL_TOP} H${VIEWBOX_WIDTH}`, stroke: "#b8823f", strokeWidth: 5 },
  { kind: "circle", cx: 26, cy: 205, r: 3, fill: "#c99a63", stroke: "none" },
  { kind: "circle", cx: 190, cy: 196, r: 4, fill: "#c99a63", stroke: "none" },
  { kind: "circle", cx: 168, cy: 220, r: 3, fill: "#c99a63", stroke: "none" },
];

/**
 * Base stacking order. Later parts paint over earlier ones, and the highlighted
 * part is lifted to the very end so no dimmed neighbour washes over its halo.
 */
const STACK_ORDER: PartId[] = ["root", "stem", "leaf", "fruit", "flower", "seed"];

function baseWidth(shape: Shape): number {
  return shape.strokeWidth ?? OUTLINE_WIDTH;
}

function ShapeNode({
  shape,
  fill,
  stroke,
  strokeWidth,
}: {
  shape: Shape;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const paint = {
    fill,
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (shape.kind) {
    case "path":
      return <path d={shape.d} {...paint} />;
    case "circle":
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
    case "ellipse":
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          transform={
            shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined
          }
          {...paint}
        />
      );
  }
}

/** The shapes as drawn normally: their own fill plus a cartoon outline. */
function ShapeLayer({ shapes }: { shapes: Shape[] }) {
  return (
    <>
      {shapes.map((shape, i) => (
        <ShapeNode
          key={i}
          shape={shape}
          fill={shape.fill ?? "none"}
          stroke={shape.stroke ?? OUTLINE}
          strokeWidth={shape.strokeWidth ?? OUTLINE_WIDTH}
        />
      ))}
    </>
  );
}

/** One halo ring: the same outlines, unfilled and fattened, in a single colour. */
function HaloLayer({ shapes, color, extra }: { shapes: Shape[]; color: string; extra: number }) {
  return (
    <>
      {shapes.map((shape, i) => (
        <ShapeNode
          key={i}
          shape={shape}
          fill="none"
          stroke={color}
          strokeWidth={baseWidth(shape) + extra}
        />
      ))}
    </>
  );
}

function PlantPartGroup({ id, highlighted }: { id: PartId; highlighted: boolean }) {
  const shapes = PART_SHAPES[id];
  const outlined = shapes.filter((shape) => !shape.skipHalo);

  return (
    <g opacity={highlighted ? 1 : DIM_OPACITY}>
      {highlighted && (
        <>
          <HaloLayer shapes={outlined} color={HALO_DARK} extra={HALO_DARK_EXTRA} />
          <HaloLayer shapes={outlined} color={HALO_LIGHT} extra={HALO_LIGHT_EXTRA} />
        </>
      )}
      <ShapeLayer shapes={shapes} />
    </g>
  );
}

/**
 * The plant with exactly one part lit up. The lit part keeps full opacity and gains
 * a dark-then-white double outline, while every other part fades — so the answer
 * reads by brightness and thickness, never by hue alone.
 *
 * Scales to its container through the viewBox; the caller caps the width.
 */
export default function PlantSvg({ highlight }: { highlight: PartId }) {
  const order = [...STACK_ORDER.filter((id) => id !== highlight), highlight];

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      className="block h-auto w-full"
      role="img"
      aria-label="A plant with one of its parts glowing"
    >
      <ShapeLayer shapes={SOIL} />
      {order.map((id) => (
        <PlantPartGroup key={id} id={id} highlighted={id === highlight} />
      ))}
    </svg>
  );
}
