"use client";

import type { KeyboardEvent } from "react";
import { regionById, type RegionId } from "./rounds";

/**
 * A hand-authored, deliberately blocky world map.
 *
 * Layout is a 320x260 user-space grid where x runs 180W -> 180E and y runs
 * 90N -> 90S, so relative geography is right even though no coastline is:
 * Europe sits above Africa, Australia sits southeast of Asia, Antarctica caps
 * the bottom. Nothing here is measured from real data — every point is placed
 * by hand for tappability first and likeness second.
 *
 * The five oceans are drawn first and *tile the whole canvas edge to edge*, so
 * there is no dead space anywhere. The seven continents are then painted on
 * top; SVG hit-testing takes the topmost shape, so a tap on land is a
 * continent and a tap on any gap falls through to the ocean that owns that
 * part of the grid.
 */

const VIEW_BOX_WIDTH = 320;
const VIEW_BOX_HEIGHT = 260;

/**
 * Hover/focus lives in a real stylesheet rather than utility classes: these
 * are SVG-only properties, and a plain <style> is guaranteed to apply without
 * depending on what the CSS scanner picked up.
 *
 * Cascade, weakest to strongest: presentation attributes hold the resting
 * look, this stylesheet adds hover/focus, the inline style wins for feedback.
 */
const REGION_CLASS = "mq-region";
const LIVE_CLASS = "mq-region--live";
const REGION_CSS = `
  .${REGION_CLASS} {
    outline: none;
    transition: fill 150ms ease, stroke 150ms ease, stroke-width 150ms ease;
  }
  .${LIVE_CLASS} { cursor: pointer; }
  .${LIVE_CLASS}:hover {
    stroke: #ffffff;
    stroke-opacity: 1;
    stroke-width: 3.5;
  }
  .${LIVE_CLASS}:focus-visible {
    stroke: #1e293b;
    stroke-opacity: 1;
    stroke-dasharray: 6 3;
    stroke-width: 4;
  }
`;

type Shape = {
  /** Path data in the 320x260 user space. */
  d: string;
  /** Resting colour. */
  fill: string;
  /** Centre of mass-ish point, used to place the tick/cross feedback marker. */
  marker: { x: number; y: number };
};

/**
 * Every ocean shares one blue. Tinting them apart would turn the tile seams
 * into hard colour blocks — the dashed white borders below already show where
 * one ocean stops and the next begins, the way a paper atlas does.
 */
const OCEAN_FILL = "#4aa3e0";

/** Ids ending in "-ocean" vs everything else, so each table is checked total. */
type OceanId = Extract<RegionId, `${string}-ocean`>;
type LandId = Exclude<RegionId, OceanId>;

/**
 * Ocean tiles. Together they cover 0,0 -> 320,260 exactly once:
 *   y 0-42    Arctic (plus a lobe over northern Asia, x 200-250, y 42-96)
 *   y 42-186  Pacific west (x 0-70) | Atlantic (70-200) | Indian | Pacific east
 *   y 186-260 Southern
 * They never overlap, so no tap can land on dead space.
 */
const OCEAN_SHAPES: Record<OceanId, Shape> = {
  "arctic-ocean": {
    d: "M0 0 H320 V42 H0 Z M200 42 H250 V96 H200 Z",
    fill: OCEAN_FILL,
    marker: { x: 160, y: 22 },
  },
  "pacific-ocean": {
    // Two limbs: west of the Americas, and east of Asia wrapping past Australia.
    d: "M0 42 H70 V186 H0 Z M250 42 H320 V186 H286 V116 H250 Z",
    fill: OCEAN_FILL,
    marker: { x: 34, y: 150 },
  },
  "atlantic-ocean": {
    d: "M70 42 H200 V186 H70 Z",
    fill: OCEAN_FILL,
    marker: { x: 130, y: 160 },
  },
  "indian-ocean": {
    d: "M200 96 H250 V116 H286 V186 H200 Z",
    fill: OCEAN_FILL,
    marker: { x: 216, y: 156 },
  },
  "southern-ocean": {
    d: "M0 186 H320 V260 H0 Z",
    fill: OCEAN_FILL,
    marker: { x: 160, y: 202 },
  },
};

/**
 * Continent shapes, 9-15 points each. Painted after the oceans, and in an
 * order that puts Europe after Asia so the shared Eurasian edge never steals
 * Europe's taps.
 */
const LAND_SHAPES: Record<LandId, Shape> = {
  antarctica: {
    d: "M24 240 L58 228 L110 222 L172 220 L230 224 L280 232 L300 244 L286 256 L220 258 L140 256 L70 254 L30 250 Z",
    fill: "#f1f7fc",
    marker: { x: 160, y: 240 },
  },
  "north-america": {
    d: "M34 56 L54 46 L86 44 L110 52 L104 66 L94 70 L98 82 L88 88 L84 98 L86 112 L76 114 L70 100 L60 90 L46 82 L36 68 Z",
    fill: "#f2a765",
    marker: { x: 72, y: 66 },
  },
  "south-america": {
    d: "M76 120 L102 118 L116 132 L112 148 L102 162 L94 174 L88 182 L82 168 L76 152 L66 138 L64 126 Z",
    fill: "#8ed36a",
    marker: { x: 90, y: 138 },
  },
  africa: {
    d: "M150 100 L186 98 L200 108 L194 124 L188 138 L182 152 L174 168 L164 178 L156 164 L150 146 L144 128 L146 110 Z",
    fill: "#f4c64f",
    marker: { x: 170, y: 130 },
  },
  asia: {
    d: "M204 60 L218 48 L248 44 L274 48 L286 60 L282 74 L270 82 L278 94 L266 104 L252 100 L240 112 L228 106 L216 92 L206 76 Z",
    fill: "#b28ce4",
    marker: { x: 244, y: 72 },
  },
  europe: {
    d: "M152 58 L164 48 L184 46 L200 52 L196 64 L186 70 L192 82 L178 90 L166 84 L156 74 L150 66 Z",
    fill: "#ef7f96",
    marker: { x: 173, y: 66 },
  },
  australia: {
    d: "M242 146 L260 140 L276 146 L282 158 L276 172 L260 178 L246 174 L236 162 L234 152 Z",
    fill: "#ef8a5c",
    marker: { x: 258, y: 159 },
  },
};

/** Paint order: every ocean tile, then every landmass on top of them. */
const DRAW_ORDER: RegionId[] = [
  "arctic-ocean",
  "pacific-ocean",
  "atlantic-ocean",
  "indian-ocean",
  "southern-ocean",
  "antarctica",
  "north-america",
  "south-america",
  "africa",
  "asia",
  "europe",
  "australia",
];

/** Typed as a total map, so adding a RegionId without geometry fails to compile. */
const SHAPES: Record<RegionId, Shape> = { ...OCEAN_SHAPES, ...LAND_SHAPES };

const LAND_STROKE = "#0f3550";
const OCEAN_STROKE = "#ffffff";
/** Dashes mark ocean-to-ocean seams without walling the water off. */
const OCEAN_DASH = "5 4";
const CORRECT_FILL = "#22c55e";
const CORRECT_STROKE = "#14532d";
const WRONG_FILL = "#fb7185";
const WRONG_STROKE = "#881337";
const FEEDBACK_STROKE_WIDTH = 4;

type Feedback = "none" | "correct" | "wrong";

export default function WorldMap({
  correctId,
  wrongId,
  disabled,
  onPick,
}: {
  /** Flashed green — the region that *was* the answer. */
  correctId: RegionId | null;
  /** Flashed red — the region the child actually tapped. */
  wrongId: RegionId | null;
  disabled: boolean;
  onPick: (id: RegionId) => void;
}) {
  function feedbackFor(id: RegionId): Feedback {
    if (id === wrongId) return "wrong";
    if (id === correctId) return "correct";
    return "none";
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      className="block h-auto w-full max-w-full select-none rounded-2xl"
      style={{ touchAction: "manipulation" }}
      role="group"
      aria-label="World map"
    >
      <style>{REGION_CSS}</style>

      {DRAW_ORDER.map((id) => (
        <MapRegion
          key={id}
          id={id}
          feedback={feedbackFor(id)}
          disabled={disabled}
          onActivate={() => onPick(id)}
        />
      ))}

      {DRAW_ORDER.filter((id) => feedbackFor(id) !== "none").map((id) => (
        <FeedbackMarker key={`marker-${id}`} id={id} feedback={feedbackFor(id)} />
      ))}
    </svg>
  );
}

function MapRegion({
  id,
  feedback,
  disabled,
  onActivate,
}: {
  id: RegionId;
  feedback: Feedback;
  disabled: boolean;
  onActivate: () => void;
}) {
  const shape = SHAPES[id];
  const region = regionById(id);
  const isOcean = region.kind === "ocean";

  function onKeyDown(e: KeyboardEvent<SVGPathElement>): void {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  }

  const feedbackStyle =
    feedback === "none"
      ? undefined
      : {
          fill: feedback === "correct" ? CORRECT_FILL : WRONG_FILL,
          stroke: feedback === "correct" ? CORRECT_STROKE : WRONG_STROKE,
          strokeWidth: FEEDBACK_STROKE_WIDTH,
          strokeDasharray: "none",
        };

  return (
    <path
      d={shape.d}
      fill={shape.fill}
      stroke={isOcean ? OCEAN_STROKE : LAND_STROKE}
      strokeWidth={isOcean ? 1.6 : 1.4}
      strokeOpacity={isOcean ? 0.65 : 1}
      strokeDasharray={isOcean ? OCEAN_DASH : undefined}
      strokeLinejoin="round"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={region.name}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onActivate}
      onKeyDown={onKeyDown}
      className={disabled ? REGION_CLASS : `${REGION_CLASS} ${LIVE_CLASS}`}
      style={feedbackStyle}
    />
  );
}

/** Non-interactive tick/cross dropped on a region during the reveal pause. */
function FeedbackMarker({ id, feedback }: { id: RegionId; feedback: Feedback }) {
  const { marker } = SHAPES[id];
  return (
    <text
      x={marker.x}
      y={marker.y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={26}
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {feedback === "correct" ? "✅" : "❌"}
    </text>
  );
}
