"use client";

import { useEffect, useRef } from "react";

/**
 * Thin countdown bar that shrinks 100% -> 0% over `durationMs` via a pure CSS
 * transition, so it never triggers a React re-render per frame. A new `levelId`
 * restarts it from full; `paused` freezes it in place and cancels the deadline
 * (used during the level-clear celebration so no game-over fires in the gap).
 *
 * `onTimeout` is read through a ref so the latest handler — with fresh game
 * state via refs — always fires, never a stale closure.
 */
export default function TimerBar({
  levelId,
  durationMs,
  paused,
  onTimeout,
}: {
  levelId: number;
  durationMs: number;
  paused: boolean;
  onTimeout: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (paused) {
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
  }, [levelId, durationMs, paused]);

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-black/25" aria-hidden>
      <div
        ref={barRef}
        className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
        style={{ width: "100%" }}
      />
    </div>
  );
}
