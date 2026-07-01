"use client";

import { useEffect, useRef } from "react";

/**
 * A thin countdown bar that shrinks 100% -> 0% over `durationMs`, driven purely
 * by a CSS transition so it never re-renders per frame. The deadline is a single
 * setTimeout; when `paused` the bar freezes in place.
 *
 * A new `roundId` restarts the bar from full. `onTimeout` is read through a ref
 * so the latest handler (with fresh game state) always fires on expiry.
 */
export default function CountTimerBar({
  roundId,
  durationMs,
  paused,
  onTimeout,
}: {
  roundId: number;
  durationMs: number;
  paused: boolean;
  onTimeout: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const onTimeoutRef = useRef(onTimeout);

  // Keep the latest handler without restarting the deadline effect.
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (paused) {
      // Freeze at the current visual scale: read the live transform matrix
      // first, then kill the transition so the freeze write doesn't animate.
      const transform = window.getComputedStyle(bar).transform;
      bar.style.transition = "none";
      bar.style.transform =
        transform === "none"
          ? "scaleX(1)"
          : `scaleX(${new DOMMatrix(transform).a})`;
      return;
    }

    // Restart from full with no transition, force a reflow, then shrink via a
    // GPU-composited transform (no per-frame layout/paint).
    bar.style.transition = "none";
    bar.style.transform = "scaleX(1)";
    void bar.offsetWidth;
    bar.style.transition = `transform ${durationMs}ms linear`;
    bar.style.transform = "scaleX(0)";

    const id = window.setTimeout(() => onTimeoutRef.current(), durationMs);
    return () => window.clearTimeout(id);
  }, [roundId, durationMs, paused]);

  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-black/20 shadow-[0_0_8px_rgba(255,255,255,0.6)]"
      aria-hidden
    >
      <div
        ref={barRef}
        className="h-full rounded-full bg-white"
        style={{ width: "100%", transformOrigin: "left" }}
      />
    </div>
  );
}
