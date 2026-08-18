"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AGE_BANDS,
  CATEGORIES,
  GAMES,
  type AgeBandId,
  type CategoryId,
} from "./games/registry";
import { getBest, getStars } from "@/lib/storage";
import { sfx, initMute } from "@/lib/sound";

/** "all" is the unset state for either filter axis, not a real band/category. */
const ALL = "all" as const;
type BandFilter = AgeBandId | typeof ALL;
type CategoryFilter = CategoryId | typeof ALL;

export default function Home() {
  // Best scores / stars come from localStorage, so read them after mount to
  // avoid a server/client hydration mismatch.
  const [stats, setStats] = useState<Record<string, { best: number; stars: number }>>({});
  const [band, setBand] = useState<BandFilter>(ALL);
  const [category, setCategory] = useState<CategoryFilter>(ALL);

  useEffect(() => {
    initMute();
    const next: Record<string, { best: number; stars: number }> = {};
    for (const g of GAMES) next[g.slug] = { best: getBest(g.slug), stars: getStars(g.slug) };
    setStats(next);
  }, []);

  const shown = useMemo(
    () =>
      GAMES.filter(
        (g) =>
          (band === ALL || g.ageBand === band) &&
          (category === ALL || g.category === category)
      ),
    [band, category]
  );

  const filtered = band !== ALL || category !== ALL;

  return (
    <div className="min-h-dvh w-full bg-gradient-to-b from-violet-500 via-purple-600 to-indigo-700 text-white">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <header className="mb-5 text-center">
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

        {/* Sticky so the filters stay reachable while scrolling 52 cards. The
            blurred bar is a sibling of the grid, never an ancestor — a
            backdrop-filter ancestor would trap any fixed child inside it. */}
        <div className="sticky top-0 z-10 -mx-5 mb-4 bg-purple-700/70 px-5 py-3 backdrop-blur-md">
          <ChipRow label="Age">
            <Chip active={band === ALL} onSelect={() => setBand(ALL)}>
              All ages
            </Chip>
            {AGE_BANDS.map((b) => (
              <Chip key={b.id} active={band === b.id} onSelect={() => setBand(b.id)}>
                <span aria-hidden>{b.emoji}</span> {b.label}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow label="Category">
            <Chip active={category === ALL} onSelect={() => setCategory(ALL)}>
              All games
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                active={category === c.id}
                onSelect={() => setCategory(c.id)}
              >
                <span aria-hidden>{c.emoji}</span> {c.label}
              </Chip>
            ))}
          </ChipRow>

          <div className="mt-2 flex items-center justify-between text-xs font-bold text-white/70">
            <span aria-live="polite">
              {shown.length} {shown.length === 1 ? "game" : "games"}
            </span>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  sfx.click();
                  setBand(ALL);
                  setCategory(ALL);
                }}
                className="rounded-full bg-white/20 px-3 py-1 font-bold transition active:scale-95 hover:bg-white/30"
              >
                Show all ✕
              </button>
            )}
          </div>
        </div>

        <main className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shown.map((g) => {
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
        </main>

        <footer className="mt-8 text-center text-sm font-semibold text-white/70">
          <p>
            {GAMES.length} games ·{" "}
            {CATEGORIES.map((c) => `${c.emoji} ${c.label}`).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-white/50">
            No sign-up · No tracking · Works offline after first load
          </p>
        </footer>
      </div>
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}

function Chip({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        sfx.click();
        onSelect();
      }}
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-black transition active:scale-95 ${
        active
          ? "bg-white text-purple-800 shadow-md"
          : "bg-white/20 text-white hover:bg-white/30"
      }`}
    >
      {children}
    </button>
  );
}
