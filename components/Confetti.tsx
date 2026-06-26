"use client";

import { useEffect, useState } from "react";

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotate: number;
  drift: number;
  color: string;
  size: number;
};

const COLORS = [
  "#f43f5e",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
];

/**
 * Full-screen confetti burst. Re-fires every time the `fire` prop changes to a
 * new truthy value (pass an incrementing counter). Pure CSS animation, cleans
 * itself up, and is pointer-events-none so it never blocks taps.
 */
export default function Confetti({ fire, count = 80 }: { fire: number; count?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!fire) return;
    const batch: Piece[] = Array.from({ length: count }, (_, i) => ({
      id: fire * 1000 + i,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      duration: 1.6 + Math.random() * 1.4,
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 240,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 8 + Math.random() * 8,
    }));
    setPieces(batch);
    const t = setTimeout(() => setPieces([]), 3200);
    return () => clearTimeout(t);
  }, [fire, count]);

  if (pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-[-5%] block rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // CSS custom props consumed by the keyframes in globals.css
            ["--drift" as string]: `${p.drift}px`,
            ["--spin" as string]: `${p.rotate + 540}deg`,
          }}
        />
      ))}
    </div>
  );
}
