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

        {/* Picture-only filters. The audience starts at three, so a word on a
            control is a word that does not get read — the emoji is the label,
            and the text lives in aria-label for screen readers. */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <FilterRow label="Age">
            <Bubble active={band === ALL} title="All ages" onSelect={() => setBand(ALL)}>
              🌈
            </Bubble>
            {AGE_BANDS.map((b) => (
              <Bubble
                key={b.id}
                active={band === b.id}
                title={`Ages ${b.label}`}
                onSelect={() => setBand(b.id)}
              >
                {b.emoji}
              </Bubble>
            ))}
          </FilterRow>

          <FilterRow label="Category">
            <Bubble
              active={category === ALL}
              title="All games"
              onSelect={() => setCategory(ALL)}
            >
              🎮
            </Bubble>
            {CATEGORIES.map((c) => (
              <Bubble
                key={c.id}
                active={category === c.id}
                title={c.label}
                onSelect={() => setCategory(c.id)}
              >
                {c.emoji}
              </Bubble>
            ))}
          </FilterRow>
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

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  // Six 48px bubbles plus gaps come to 328px, so the widest row fits one line
  // on a 360px phone. It wraps rather than scrolls, because a control that
  // scrolls out of sight is a control a small child never finds.
  return (
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-2">
      {children}
    </div>
  );
}

function Bubble({
  active,
  title,
  onSelect,
  children,
}: {
  active: boolean;
  title: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={title}
      title={title}
      onClick={() => {
        sfx.click();
        onSelect();
      }}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl leading-none transition ${
        active
          ? "scale-110 bg-white shadow-lg ring-4 ring-white/50"
          : "bg-white/20 hover:bg-white/30 active:scale-95"
      }`}
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}
