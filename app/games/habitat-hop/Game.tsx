"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import {
  ANIMALS,
  BINS,
  durationFor,
  nextAnimal,
  starsFor,
  type Animal,
  type Habitat,
} from "./animals";

const SLUG = "habitat-hop";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const SPEED_BONUS_MAX = 10; // extra points for answering with time to spare
const MAX_MULTIPLIER = 5;

const CORRECT_DELAY = 480; // animal hops into the bin, then the next one appears
const MISS_DELAY = 900; // shake + reveal the right bin
const OVER_DELAY = 700; // last heart lost -> show the game-over panel

// How far (px) the animal hops toward each bin when answered correctly.
const HOP_X: Record<Habitat, number> = { Land: -96, Sea: 0, Sky: 96 };

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type BinVisual = "idle" | "correct" | "wrong";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [roundState, setRoundState] = useState<RoundState>("active");

  const [animal, setAnimal] = useState<Animal | null>(null);
  const [roundId, setRoundId] = useState(0);
  const [durationMs, setDurationMs] = useState(() => durationFor(0));

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [reveal, setReveal] = useState(false); // flash the correct bin green
  const [wrongBin, setWrongBin] = useState<Habitat | null>(null);
  const [hopTarget, setHopTarget] = useState<Habitat | null>(null);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  // Refs read inside setTimeout callbacks so they never see stale closures.
  const scoreRef = useRef(0);
  const heartsRef = useRef(START_HEARTS);
  const correctRef = useRef(0);
  const animalRef = useRef<Animal | null>(null);
  // Synchronous guard against a double-resolve (two fast taps in one round).
  const resolvingRef = useRef(false);
  // Pending timeouts, cleared if the player leaves mid-round.
  const timers = useRef<number[]>([]);
  // Animals already shown this run; reset only once the whole pool has cycled.
  const usedNames = useRef<string[]>([]);
  const roundStart = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    heartsRef.current = hearts;
  }, [hearts]);
  useEffect(() => {
    correctRef.current = correctCount;
  }, [correctCount]);
  useEffect(() => {
    animalRef.current = animal;
  }, [animal]);

  // Load the persisted best after mount (SSR-safe) so the server and first
  // client render agree, then update once localStorage is available.
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Clear any pending timeouts if the player leaves mid-round.
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  function schedule(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  }

  function clearTimers(): void {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }

  // Draw the next animal from the not-yet-seen pool, starting a fresh cycle once
  // every animal has been shown.
  function drawAnimal(avoidName?: string): Animal {
    if (usedNames.current.length >= ANIMALS.length) usedNames.current = [];
    const a = nextAnimal(usedNames.current, avoidName);
    usedNames.current.push(a.name);
    return a;
  }

  function loadNext(forCorrectCount: number, avoidName?: string): void {
    const a = drawAnimal(avoidName);
    setAnimal(a);
    animalRef.current = a;
    setDurationMs(durationFor(forCorrectCount));
    setReveal(false);
    setWrongBin(null);
    setHopTarget(null);
    setFloatGain(0);
    roundStart.current = Date.now();
    resolvingRef.current = false;
    setRoundState("active");
    setRoundId((r) => r + 1);
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    scoreRef.current = 0;
    setHearts(START_HEARTS);
    heartsRef.current = START_HEARTS;
    setCombo(0);
    setCorrectCount(0);
    correctRef.current = 0;
    setNewBest(false);
    usedNames.current = [];
    loadNext(0);
    setPhase("playing");
  }

  function endGame(finalScore: number): void {
    setPhase("over");
    const isBest = recordBest(SLUG, finalScore);
    setNewBest(isBest);
    setStars(SLUG, starsFor(finalScore));
    if (isBest) {
      setBest(finalScore);
      setBurst((b) => b + 1);
      sfx.win();
    } else {
      sfx.gameOver();
    }
  }

  function speedBonus(): number {
    const elapsed = Date.now() - roundStart.current;
    const remaining = Math.min(1, Math.max(0, 1 - elapsed / durationMs));
    return Math.round(remaining * SPEED_BONUS_MAX);
  }

  function registerMiss(wrongHabitat: Habitat | null): void {
    sfx.wrong();
    setCombo(0);
    setFloatGain(0);
    setReveal(true);
    setWrongBin(wrongHabitat);

    const remaining = heartsRef.current - 1;
    heartsRef.current = remaining;
    setHearts(remaining);

    const missedName = animalRef.current?.name;
    const cc = correctRef.current;
    if (remaining <= 0) {
      schedule(() => endGame(scoreRef.current), OVER_DELAY);
    } else {
      schedule(() => loadNext(cc, missedName), MISS_DELAY);
    }
  }

  function handleCorrect(current: Animal): void {
    sfx.pop();
    sfx.correct();

    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);

    const multiplier = Math.min(nextCombo, MAX_MULTIPLIER);
    const points = (BASE_POINTS + speedBonus()) * multiplier;
    const nextCorrect = correctCount + 1;
    if (durationFor(nextCorrect) < durationFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    correctRef.current = nextCorrect;
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    setReveal(true);
    setHopTarget(current.habitat);

    schedule(() => loadNext(nextCorrect, current.name), CORRECT_DELAY);
  }

  function handleTap(habitat: Habitat): void {
    if (phase !== "playing" || resolvingRef.current || !animal) return;
    resolvingRef.current = true;
    setRoundState("resolving");

    if (habitat === animal.habitat) handleCorrect(animal);
    else registerMiss(habitat);
  }

  function handleTimeout(): void {
    if (phase !== "playing" || resolvingRef.current) return;
    resolvingRef.current = true;
    setRoundState("resolving");
    registerMiss(null);
  }

  function binVisual(habitat: Habitat): BinVisual {
    if (reveal && animal && habitat === animal.habitat) return "correct";
    if (wrongBin === habitat) return "wrong";
    return "idle";
  }

  const heartsDisplay =
    "❤️".repeat(Math.max(0, hearts)) +
    "🤍".repeat(Math.max(0, START_HEARTS - hearts));

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
      <StatBadge
        label="Lives"
        value={<span className="text-xl leading-none">{heartsDisplay}</span>}
      />
    </>
  );

  const comboLabel = Math.min(combo, MAX_MULTIPLIER);

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && animal && (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <div className="flex min-h-[2.25rem] items-center justify-center">
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{comboLabel}
              </div>
            )}
          </div>

          <div className="relative flex h-40 w-full items-center justify-center">
            <div
              key={roundId}
              className="animate-pop-in flex flex-col items-center"
              style={{
                transition: "transform 0.42s ease-in, opacity 0.42s ease-in",
                transform: hopTarget
                  ? `translate(${HOP_X[hopTarget]}px, 140px) scale(0.35)`
                  : "translate(0, 0) scale(1)",
                opacity: hopTarget ? 0 : 1,
              }}
            >
              <span className="text-8xl leading-none drop-shadow-lg" aria-hidden>
                {animal.emoji}
              </span>
              <span className="mt-1 text-2xl font-black tracking-tight drop-shadow">
                {animal.name}
              </span>
            </div>

            {floatGain > 0 && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2"
              >
                <FloatScore>+{floatGain}</FloatScore>
              </span>
            )}
          </div>

          <div className="text-xl font-black drop-shadow">Where does it live?</div>

          <div className="w-full px-2">
            <TimerBar
              roundId={roundId}
              durationMs={durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div className="grid w-full grid-cols-3 gap-2.5">
            {BINS.map((bin) => (
              <BinButton
                key={bin.habitat}
                emoji={bin.emoji}
                label={bin.label}
                visual={binVisual(bin.habitat)}
                onTap={() => handleTap(bin.habitat)}
              />
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

function BinButton({
  emoji,
  label,
  visual,
  onTap,
}: {
  emoji: string;
  label: string;
  visual: BinVisual;
  onTap: () => void;
}) {
  const feedback =
    visual === "correct"
      ? "ring-4 ring-lime-300 bg-white/35 scale-[1.04]"
      : visual === "wrong"
        ? "ring-4 ring-rose-400 bg-rose-500/30 animate-shake"
        : "bg-white/20 hover:bg-white/30";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${label} habitat`}
      className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-3xl px-2 py-3 backdrop-blur transition active:scale-95 ${feedback}`}
    >
      <span className="text-4xl leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="text-base font-black tracking-tight">{label}</span>
      {visual === "correct" && (
        <span className="text-lg leading-none" aria-hidden>
          ✅
        </span>
      )}
      {visual === "wrong" && (
        <span className="text-lg leading-none" aria-hidden>
          ❌
        </span>
      )}
    </button>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🦁</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Habitat Hop</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        An animal pops up — tap 🌳 Land, 🌊 Sea or 🌤️ Sky to send it home before
        the bar runs out!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at 80 / 200 / 400 pts
      </p>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>▶ Play</BigButton>
      </div>
    </Panel>
  );
}

function OverPanel({
  score,
  best,
  newBest,
  onPlay,
}: {
  score: number;
  best: number;
  newBest: boolean;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl">{newBest ? "🏆" : "🦁"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">
          NEW BEST!
        </div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-green-600">
        {score}
      </div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
        points
      </div>
      <div className="mt-3 flex justify-center">
        <StarRow value={starsFor(score)} />
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-500">Best {best}</div>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>🔁 Play Again</BigButton>
      </div>
    </Panel>
  );
}
