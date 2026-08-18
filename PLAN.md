# Kids Edu Arcade — 22-game expansion

Adds 22 games (30 → 52) so that every `category` × `ageBand` cell holds at least
three games. Categories and bands are defined in `app/games/registry.ts`.

## Band rule

A game's `ageBand` is the band containing the **low end** of its playable range.
Bands overlap on purpose — a game that works at 5 often still works at 7.

| Band | id | Range |
|---|---|---|
| 🐣 Little | `little` | 3–5 |
| 🧒 Middle | `middle` | 5–7 |
| 🎓 Big | `big` | 7–10 |

## Target grid

Existing 30 in plain text, **new 22 in bold**. Every cell ends at ≥3.

| | 🐣 little | 🧒 middle | 🎓 big |
|---|---|---|---|
| 🔢 numbers | Count It, Big Number, **Number Line Hop** | **Number Bonds**, **Skip Count**, **Add Ladder** | Math Pop, Coin Count, Clock Quest, Times Tiles, Fraction Feast |
| 🔤 words | ABC Order, **First Sound**, **Letter Hunt** | Rhyme Time, Opposites, Word Drop, Hijaiyah | **Spell It**, **Sentence Build**, **Synonyms** |
| 🧩 logic | Shadow Match, Critter Match, Echo, Pattern Party, Odd One Out, Typing Rocket, Quick Tap | Maze Dash, Shape Sort, Robot Run | **Code Loops**, **Mini Sudoku**, **Logic Grid** |
| 🌍 world | Habitat Hop, Weather Watch, **Baby Animals** | Body Bop, **Plant Parts**, **Jobs & Tools** | Feelings, Flag Dash, **Map Quest** |
| 🎨 creative | Color Book, Tap Tunes, **Sticker Scene** | Color Mix, **Symmetry Paint**, **Beat Builder** | **Pixel Copy**, **Melody Match**, **Color Theory** |

Totals after the build: numbers 11, words 10, logic 13, world 9, creative 9 = **52**.

## House rules — every new game

Copy the structure of an existing game rather than writing Next.js from memory.
`AGENTS.md` warns this Next.js differs from training data; cloning a working
sibling sidesteps that entirely.

1. **Files** live only in `app/games/<slug>/`:
   - `page.tsx` — 8-line metadata wrapper, identical to every sibling.
   - `Game.tsx` — `"use client"`, default-exports `Game`.
   - a data module (`rounds.ts` / `data.ts` / `levels.ts`) holding the dataset
     and pure helpers.
   - `TimerBar.tsx` — copy verbatim from `app/games/weather-watch/TimerBar.tsx`
     if the game is timed. 20 games already keep a local copy; do not try to
     share one.
2. **Never touch** `app/games/registry.ts`, `public/sw.js`, `lib/*`,
   `components/*`, `app/page.tsx`, or any sibling game folder. The registry
   entry already exists — import it with `getGame(SLUG)`.
3. **Never run** `npm run build`, `npm run dev`, or any git command. One
   serialized build happens at the end.
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
8. **Phases** — `"ready" | "playing" | "over"`, with a ReadyPanel that explains
   the game in one sentence and an OverPanel showing score, stars and best.
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

## The 22 games

Registry entries (slug, title, emoji, colours, blurb) are already written. Build
to the spec; do not invent a different mechanic.

### 🐣 Little — 5 games

**number-line-hop** · 🔢 numbers · *Number Line Hop* — A 1–10 number line with one
number missing. Tap the tile that fills the gap. `rangeFor`: 1–5 → 1–10 → 1–10
with two gaps → 1–20 counting by 2. Timer `max(4000, 8000 - lvl*700)`. No reading.

**first-sound** · 🔤 words · *First Sound* — An emoji appears (🍎). Tap the letter
it starts with. 3 letter tiles, 4 after 5 correct. 26 emoji, one per letter,
distractors exclude letters that sound close (b/p, d/t, m/n, f/v). Timer
`max(4000, 7000 - step*300)`.

**letter-hunt** · 🔤 words · *Letter Hunt* — A target letter shows big; tap every
copy of it in a grid of 6 → 12 letters before the timer runs out. Case-mixed from
level 3 so `a` and `A` both count. Distractors avoid mirror pairs (b/d, p/q) until
level 4.

**baby-animals** · 🌍 world · *Baby Animals* — Grown animal emoji shows; tap its
baby from 3 → 4 choices. 20 pairs (🐄→🐮, 🐔→🐣, 🐸→🦎 no — use real pairs only).
Emoji-only tiles, no words. Timer 7000/6000ms.

**sticker-scene** · 🎨 creative · *Sticker Scene* — Untimed sandbox. Pick a
background (beach/space/farm/city), tap a sticker from a tray, tap the canvas to
place it. Tap a placed sticker to remove. Scene persists via `saveJSON`. No
score, no hearts — mirror `color-book`'s completion model: 4 scenes, each
"finished" at 8 stickers.

### 🧒 Middle — 7 games

**number-bonds** · 🔢 numbers · *Number Bonds* — "7 + ? = 10". Tap the missing
partner. Bonds to 10 → to 20 → to 100 in tens. Timer `max(3500, 7000 - lvl*600)`.

**skip-count** · 🔢 numbers · *Skip Count* — A sequence with the next term missing
(2, 4, 6, ?). Steps of 2 → 5 → 10 → 3. Four numeric choices, distractors are
off-by-one-step. Timer `max(3500, 7500 - lvl*650)`.

**add-ladder** · 🔢 numbers · *Add Ladder* — Climb a ladder; each rung is an
addition or subtraction within 20. Correct answer moves the sprite up a rung, 10
rungs per level. Addition only until level 2. Timer `max(3500, 7000 - lvl*600)`.

**plant-parts** · 🌍 world · *Plant Parts* — A plant SVG with one part highlighted;
tap its name from 3 → 4 choices (root, stem, leaf, flower, fruit, seed). Word
tiles carry a small emoji cue. Timer 7000/6000ms.

**jobs-tools** · 🌍 world · *Jobs & Tools* — Worker emoji shows; tap the tool they
use. 18 pairs (👩‍🚒→🧯, 👨‍🍳→🍳, 👩‍⚕️→🩺). Tiles are emoji + word. Distractors
avoid same-setting tools until level 3. Timer 7000/6000ms.

**symmetry-paint** · 🎨 creative · *Symmetry Paint* — Untimed. A 6×6 grid shows a
pattern on the left half; tap cells on the right to mirror it. Grid 4×4 → 8×8
across 6 puzzles. Completion check on every tap, confetti when the mirror matches.

**beat-builder** · 🎨 creative · *Beat Builder* — Untimed. An 8-step × 3-lane
(kick/clap/hat) grid. Tap cells to toggle, press play to loop at 100bpm using
`sfx`. 6 target patterns to reproduce by ear; "Listen" replays the target.
Matching the target 100% clears the level.

### 🎓 Big — 10 games

**spell-it** · 🔤 words · *Spell It* — Emoji + audio-free prompt shows a word for
1.5s, then hides it. Tap on-screen letters to spell it from memory. This is the
recall counterpart to `word-drop`, which leaves letters visible — do not show the
word during input. 4-letter → 7-letter words, 3 hearts, no timer.

**sentence-build** · 🔤 words · *Sentence Build* — Scrambled word tiles; tap them
in order to build a correct sentence. 4-word → 8-word sentences, 20 sentences.
Tap a placed word to send it back. Timer `max(8000, 20000 - lvl*1500)`.

**synonyms** · 🔤 words · *Synonyms* — A word shows; tap the one of 4 that means
the same. 40 pairs, age-appropriate vocabulary (big/large, happy/glad,
fast/quick). Antonym distractors appear from level 3 to sharpen it. Timer
`max(4000, 8000 - lvl*600)`.

**code-loops** · 🧩 logic · *Code Loops* — `robot-run` plus a repeat block: queue
arrows, wrap a selection in `repeat ×N`. 10 hand-authored levels on 5×5 → 7×7
grids, each solvable only within a move budget that forces loop use. Untimed.
Read `app/games/robot-run/` first and mirror its execution model.

**mini-sudoku** · 🧩 logic · *Mini Sudoku* — 4×4 emoji sudoku, then 6×6. Tap a
cell, tap a symbol to place. Invalid placement shakes and costs nothing; a full
correct grid clears. 12 puzzles, hand-authored, each with a unique solution.
Untimed, hint button reveals one cell (costs a star).

**logic-grid** · 🧩 logic · *Logic Grid* — Three kids, three items, three clues
("Ali does not have the ball"). Tap the grid to mark ✓/✗, submit when solved.
3×3 → 4×4 across 10 puzzles. Untimed.

**map-quest** · 🌍 world · *Map Quest* — Tap the named continent or ocean on a
simplified world SVG. 7 continents, then 5 oceans, then both mixed. Timer
`max(4000, 9000 - lvl*800)`. Wrong taps flash the correct region.

**pixel-copy** · 🎨 creative · *Pixel Copy* — A small pixel picture shows on the
left; reproduce it on a blank grid with a colour palette. 5×5 → 10×10 across 8
pictures. Untimed, live match-percentage readout, clears at 100%.

**melody-match** · 🎨 creative · *Melody Match* — 3 → 6 notes play on a 5-key
keyboard; replay them. Unlike `echo`, keys are not lit during playback — the
child tracks pitch, not position. Uses `sfx` tones. Untimed, 3 hearts.

**color-theory** · 🎨 creative · *Color Theory* — A colour shows; tap its
complement from a 6-colour wheel. Then warm/cool sorting, then analogous pairs.
Three modes unlock by level. Timer `max(4000, 8000 - lvl*700)`.

## Verification

Run after everything lands — count from the registry, not from this file:

```
node --input-type=module -e '
import { GAMES, CATEGORIES, AGE_BANDS } from "./app/games/registry.ts";
'
```

In practice: `npm run build` must pass, then assert all 15 cells ≥3 and
`GAMES.length === 52`.
