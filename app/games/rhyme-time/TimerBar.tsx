"use client";

import { useEffect, useRef } from "react";

/**
 * A thin countdown bar that shrinks 100% -> 0% over `durationMs`, driven purely by a
 * CSS transition so it never triggers a React re-render per frame. The deadline is a
 * single setTimeout; when `paused` the bar freezes in place.
 *
 * A new `roundId` restarts the bar from full. `onTimeout` is read through a ref so the
 * latest handler (with fresh game state) always fires.
 */
export default function TimerBar({
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
      // Freeze the bar at its current visual width.
      const frozen = window.getComputedStyle(bar).width;
      bar.style.transition = "none";
      bar.style.width = frozen;
      return;
    }

    // Restart from full with no transition, force a reflow, then shrink.
    bar.style.transition = "none";
    bar.style.width = "100%";
    void bar.offsetWidth;
    bar.style.transition = `width ${durationMs}ms linear`;
    bar.style.width = "0%";

    const id = window.setTimeout(() => onTimeoutRef.current(), durationMs);
    return () => window.clearTimeout(id);
  }, [roundId, durationMs, paused]);

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-black/20" aria-hidden>
      <div
        ref={barRef}
        className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
        style={{ width: "100%" }}
      />
    </div>
  );
}
