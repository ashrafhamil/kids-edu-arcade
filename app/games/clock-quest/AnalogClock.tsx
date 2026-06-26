"use client";

import { hourAngle, minuteAngle, type Time } from "./questions";

const CENTER = 100;

/** Point on a circle of radius `r`, measured clockwise from the 12 o'clock mark. */
function pointAt(r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + r * Math.sin(rad),
    y: CENTER - r * Math.cos(rad),
  };
}

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const angle = i * 30;
  const isMajor = i % 3 === 0;
  const outer = pointAt(90, angle);
  const inner = pointAt(isMajor ? 78 : 83, angle);
  return { i, isMajor, outer, inner };
});

// Only the four cardinal numbers are labelled, per the game spec.
const NUMBERS = [12, 3, 6, 9].map((n) => {
  const angle = (n % 12) * 30;
  const p = pointAt(66, angle);
  return { n, x: p.x, y: p.y };
});

/**
 * Inline-SVG analog clock. Scales to its container via the viewBox (the parent
 * caps the width), so it never overflows a phone. Hands rotate to the question's
 * time; angles are computed in the pure questions module.
 */
export default function AnalogClock({ time }: { time: Time }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className="block h-auto w-full"
      role="img"
      aria-label="Clock showing a time to read"
    >
      <circle cx={CENTER} cy={CENTER} r={96} fill="#ffffff" stroke="#1e1b4b" strokeWidth={5} />
      <circle cx={CENTER} cy={CENTER} r={88} fill="#eef2ff" />

      {TICKS.map((t) => (
        <line
          key={t.i}
          x1={t.outer.x}
          y1={t.outer.y}
          x2={t.inner.x}
          y2={t.inner.y}
          stroke="#4338ca"
          strokeWidth={t.isMajor ? 5 : 2.5}
          strokeLinecap="round"
        />
      ))}

      {NUMBERS.map((label) => (
        <text
          key={label.n}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={22}
          fontWeight={900}
          fill="#1e1b4b"
        >
          {label.n}
        </text>
      ))}

      {/* Hour hand — short and thick. */}
      <line
        x1={CENTER}
        y1={CENTER}
        x2={CENTER}
        y2={52}
        stroke="#1e1b4b"
        strokeWidth={8}
        strokeLinecap="round"
        transform={`rotate(${hourAngle(time)} ${CENTER} ${CENTER})`}
      />
      {/* Minute hand — long and slimmer. */}
      <line
        x1={CENTER}
        y1={CENTER}
        x2={CENTER}
        y2={26}
        stroke="#e11d48"
        strokeWidth={5}
        strokeLinecap="round"
        transform={`rotate(${minuteAngle(time)} ${CENTER} ${CENTER})`}
      />

      <circle cx={CENTER} cy={CENTER} r={7} fill="#1e1b4b" />
      <circle cx={CENTER} cy={CENTER} r={3} fill="#e11d48" />
    </svg>
  );
}
