# 🎮 Kids Edu Arcade

Ten fast, fun, **ad-free** learning games for kids under 12. No sign-up, no tracking, no in-app purchases — just play and learn. Built because kids' games shouldn't be interrupted by ads every two rounds.

🔗 **Live:** https://kids-edu-arcade.vercel.app

## The games

| Game | Subject | What it teaches |
|------|---------|-----------------|
| 🫧 **Math Pop** | Math | Pop the bubble with the right answer. Combos, hearts, escalating arithmetic. |
| 🤖 **Robot Run** | Coding | Snap arrow blocks into a program to drive the robot to the star. Sequencing & planning. |
| 🐾 **Critter Match** | Memory | Flip cards and match animal pairs against the clock. Concentration. |
| 🔤 **Word Drop** | Spelling | Catch falling letters in order to spell the word. Reading & spelling. |
| 🎵 **Echo** | Focus | Watch, listen, repeat the growing color-and-sound pattern. Attention & memory. |
| 🪙 **Coin Count** | Money | Tap coins to add up to the price. Addition & money sense. |
| 🔺 **Shape Sort** | Shapes | Sort items into bins; the rule flips between shape and colour. Classification. |
| 🕐 **Clock Quest** | Time | Read an analog clock and pick the matching time. Telling time. |
| 🚀 **Typing Rocket** | Typing | Tap the on-screen letters in order to launch the rocket. Letter recognition. |
| 🎨 **Color Mix** | Colors | Mix two paints to match the target colour. Colour theory. |

## Why it's different

- **Zero ads. Zero monetization. Zero tracking.** Nothing pops up, nothing asks for money.
- **Addictive the good way** — instant juicy feedback, combo streaks, stars, and difficulty that ramps just fast enough to keep kids saying "one more round."
- **Works offline** after the first load, on any phone or tablet.
- **No accounts** — progress and high scores live in the browser (localStorage).
- **No assets to license** — every graphic is an emoji and every sound is synthesized in the browser with the Web Audio API.

## Tech

- [Next.js 16](https://nextjs.org) (App Router) · React 19 · TypeScript (strict)
- Tailwind CSS v4
- Web Audio API for all sound · `localStorage` for high scores

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

```
app/
  page.tsx              # home hub — game cards with best scores & stars
  games/
    registry.ts         # single source of truth for all 5 games
    <slug>/page.tsx     # server wrapper (metadata)
    <slug>/Game.tsx     # the game (client component)
components/
  GameShell.tsx         # shared frame: gradient, back button, mute, stats
  Confetti.tsx          # CSS confetti burst
  ui.tsx                # buttons, stars, panels
lib/
  sound.ts              # synthesized sound effects
  storage.ts            # localStorage high scores & progress
```

---

Made for kids. No ads, ever.
