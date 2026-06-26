"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GAMES } from "./games/registry";
import { getBest, getStars } from "@/lib/storage";
import { sfx, initMute } from "@/lib/sound";

export default function Home() {
  // Best scores / stars come from localStorage, so read them after mount to
  // avoid a server/client hydration mismatch.
  const [stats, setStats] = useState<Record<string, { best: number; stars: number }>>({});

  useEffect(() => {
    initMute();
    const next: Record<string, { best: number; stars: number }> = {};
    for (const g of GAMES) next[g.slug] = { best: getBest(g.slug), stars: getStars(g.slug) };
    setStats(next);
  }, []);

  return (
    <div className="min-h-dvh w-full bg-gradient-to-b from-violet-500 via-purple-600 to-indigo-700 text-white">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-7 text-center">
          <div className="mb-2 text-6xl animate-bob" aria-hidden>
            🎮
          </div>
          <h1 className="text-4xl font-black tracking-tight drop-shadow sm:text-5xl">
            Kids Edu Arcade
          </h1>
          <p className="mt-2 text-base font-semibold text-white/80">
            Play &amp; learn — no ads, ever.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GAMES.map((g) => {
            const s = stats[g.slug];
            return (
              <Link
                key={g.slug}
                href={`/games/${g.slug}`}
                onClick={() => sfx.pop()}
                className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br ${g.gradient} p-5 shadow-xl shadow-black/20 transition active:scale-[0.97] hover:-translate-y-0.5 hover:shadow-2xl`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-5xl drop-shadow-md transition group-hover:scale-110">
                    {g.emoji}
                  </span>
                  <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                    {g.subject}
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight">{g.title}</h2>
                <p className="mt-1 text-sm font-medium leading-snug text-white/85">
                  {g.blurb}
                </p>
                <div className="mt-3 flex items-center justify-between text-sm font-bold">
                  <span aria-label={`${s?.stars ?? 0} stars`}>
                    {"⭐".repeat(s?.stars ?? 0) || "☆☆☆"}
                  </span>
                  {s && s.best > 0 && (
                    <span className="rounded-full bg-white/25 px-3 py-0.5">
                      Best {s.best} {g.scoreLabel}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        <footer className="mt-8 text-center text-sm font-semibold text-white/70">
          <p>5 games · Math · Coding · Memory · Spelling · Focus</p>
          <p className="mt-1 text-xs text-white/50">
            No sign-up · No tracking · Works offline after first load
          </p>
        </footer>
      </div>
    </div>
  );
}
