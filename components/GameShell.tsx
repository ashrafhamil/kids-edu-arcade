"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { initMute, toggleMute, unlockAudio, sfx } from "@/lib/sound";
import type { GameMeta } from "@/app/games/registry";

/**
 * Consistent frame around every game: gradient backdrop, a big "Home" button,
 * the title, a mute toggle, and a slot on the right for live stats (score/best).
 * Handles audio unlock + mute persistence so individual games don't have to.
 */
export default function GameShell({
  meta,
  right,
  children,
}: {
  meta: GameMeta;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(initMute());
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <div className={`min-h-dvh w-full bg-gradient-to-b ${meta.gradient} text-white`}>
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-6 pt-4">
        <header className="flex items-center gap-3">
          <Link
            href="/"
            onClick={() => sfx.click()}
            className="flex h-12 items-center gap-1.5 rounded-2xl bg-white/30 px-4 text-lg font-extrabold transition active:scale-95 hover:bg-white/30"
            aria-label="Back to home"
          >
            <span className="text-2xl leading-none">←</span>
            <span className="hidden sm:inline">Home</span>
          </Link>

          <div className="flex flex-1 items-center justify-center gap-2">
            <span className="text-3xl leading-none" aria-hidden>
              {meta.emoji}
            </span>
            <h1 className="text-2xl font-black tracking-tight drop-shadow-sm">
              {meta.title}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              const m = toggleMute();
              setMuted(m);
              if (!m) sfx.click();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/30 text-2xl transition active:scale-95 hover:bg-white/30"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </header>

        {right && (
          <div className="mt-3 flex items-center justify-center gap-2">{right}</div>
        )}

        <main className="flex flex-1 flex-col items-center justify-center py-4">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Live stat chip shown in the GameShell `right` slot. */
export function StatBadge({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-20 flex-col items-center rounded-2xl bg-white/30 px-4 py-1.5">
      <span className="text-[0.65rem] font-bold uppercase tracking-widest opacity-80">
        {label}
      </span>
      <span className="text-2xl font-black leading-tight tabular-nums">{value}</span>
    </div>
  );
}
