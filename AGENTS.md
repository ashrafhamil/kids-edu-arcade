# Kids Edu Arcade — agent notes

52 games across 5 categories x 3 age bands, defined in `app/games/registry.ts`.
`CATEGORIES` and `AGE_BANDS` live there alongside `gamesInCategory` and
`gamesInBand`. Every category/band cell holds at least three games, so either
axis can be filtered alone or the two combined without hitting an empty grid.

`subject` is a per-game display label, distinct from `category` — it is the
badge on the home card, and it is not a grouping.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Adding a game

Copy the structure of an existing game rather than writing Next.js from memory.
The block above warns this Next.js differs from training data; cloning a
working sibling sidesteps that entirely.

1. **Files** live only in `app/games/<slug>/`:
   - `page.tsx` — 8-line metadata wrapper, identical to every sibling.
   - `Game.tsx` — `"use client"`, default-exports `Game`.
   - a data module (`rounds.ts` / `data.ts` / `levels.ts`) holding the dataset
     and pure helpers.
   - `TimerBar.tsx` — copy verbatim from `app/games/weather-watch/TimerBar.tsx`
     if the game is timed. 20 games already keep a local copy; do not try to
     share one.
2. **Register it** in `app/games/registry.ts` with a `category` and an
   `ageBand`, then import that entry with `getGame(SLUG)`. Add the route to
   `NAV_ROUTES` in `public/sw.js` and bump `CACHE` — the install handler uses
   `cache.addAll`, which rejects wholesale if any single route 404s.
3. **Never run a build while the dev server is up** — they share `.next` and
   the cache corrupts.
4. **Sound** comes only from the existing `sfx` exports in `lib/sound.ts`:
   `click, pop, correct, wrong, levelUp, combo, win, gameOver`. Need a new
   sound? Report it, don't add it.
5. **Persistence** only via `lib/storage.ts`: `getBest`, `recordBest`,
   `setStars`, `getLevel`, `setLevel`, `loadJSON`, `saveJSON`.
6. **SSR safety** — no `Math.random()`, `Date.now()`, or `window` at module
   scope. Randomness lives inside generator functions called from handlers and
   effects only. This is the single most common way these games break.
7. **Frame** — wrap in `<GameShell meta={meta} right={liveStats}>`, use
   `Panel` / `BigButton` / `StarRow` / `FloatScore` from `components/ui`, and
   `StatBadge` from `components/GameShell`.
8. **Phases** — `"ready" | "playing" | "over"` for scored games, with a
   ReadyPanel explaining the game in one sentence and an OverPanel showing
   score, stars and best. Untimed level-based games follow `robot-run` instead,
   which adds a per-level interstitial and never ends by losing.
9. **Timers must clean up** — keep a `timers.current` array, clear on unmount.
   Copy the `schedule`/`clearTimers` pair from `weather-watch/Game.tsx`.
10. **Touch targets** — minimum 44px, layout must fit a 360px-wide phone. Tap
    only: no drag, no physical keyboard dependency, no `alert`/`confirm`.
11. **Reading load must match the band.** `little` games may not require reading
    a word to answer — the answer must be inferable from emoji, shape, colour or
    count alone. `middle` may use single familiar words. `big` may use sentences.
12. **Difficulty must ramp** via a `bandFor`/`levelFor`-style pure function in the
    data module, the way `math-pop` and `count-it` do. Never a flat difficulty.
13. **3 hearts** for timed games; untimed games end by completing their levels.
14. **Stars** — export `starsFor(score)` with three thresholds, and call
    `setStars(SLUG, starsFor(final))` when the run ends.
