"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, starsFor, tilesFor, type Round, type Tile } from "./categories";

const SLUG = "odd-one-out";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;

const CORRECT_DELAY = 480; // let the pop + green highlight land before the next board
const WRONG_DELAY = 1000; // longer: the child sees which tile was the odd one
const OVER_DELAY = 700; // last heart lost -> show the game-over panel

type Phase = "ready" | "playing" | "over";
type RoundState = "active" | "resolving";
type TileVisual = "idle" | "correct" | "wrong" | "dim";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [roundState, setRoundState] = useState<RoundState>("active");
  const [round, setRound] = useState<Round | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [reveal, setReveal] = useState(false); // flash correct green, wrong tile red
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  // Refs read inside setTimeout callbacks so they never see stale closures.
  const scoreRef = useRef(0);
  const heartsRef = useRef(START_HEARTS);
  const correctRef = useRef(0);
  // Synchronous guard against a double-resolve (two fast taps in one round).
  const resolvingRef = useRef(false);
  // Pending timeouts, cleared if the player leaves mid-round.
  const timers = useRef<number[]>([]);
  const lastMajorityId = useRef<string | undefined>(undefined);
  // Monotonic id per board so tile keys always change -> pop-in replays.
  const nextRoundId = useRef(1);

  // Load the persisted best after mount (SSR-safe), deferred past hydration.
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

  function loadNext(forCorrectCount: number): void {
    const next = genRound(tilesFor(forCorrectCount), nextRoundId.current++, lastMajorityId.current);
    lastMajorityId.current = next.majorityId;
    setRound(next);
    setReveal(false);
    setChosenKey(null);
    setShaking(false);
    setFloatGain(0);
    resolvingRef.current = false;
    setRoundState("active");
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
    lastMajorityId.current = undefined;
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

  function registerMiss(): void {
    sfx.wrong();
    setCombo(0);
    setReveal(true);
    setShaking(true);
    setFloatGain(0);

    const remaining = heartsRef.current - 1;
    heartsRef.current = remaining;
    setHearts(remaining);

    if (remaining <= 0) {
      schedule(() => endGame(scoreRef.current), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctRef.current), WRONG_DELAY);
    }
  }

  function registerHit(): void {
    sfx.pop();
    sfx.correct();

    const nextCombo = combo + 1;
    if (nextCombo % 4 === 0) sfx.combo(nextCombo);

    const multiplier = Math.min(nextCombo, MAX_MULTIPLIER);
    const points = BASE_POINTS * multiplier;
    const nextCorrect = correctCount + 1;
    if (tilesFor(nextCorrect) > tilesFor(correctCount)) sfx.levelUp();

    const nextScore = scoreRef.current + points;
    scoreRef.current = nextScore;
    correctRef.current = nextCorrect;

    setCombo(nextCombo);
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setReveal(true);
    setFloatGain(points);
    setFloatKey((k) => k + 1);

    schedule(() => loadNext(nextCorrect), CORRECT_DELAY);
  }

  function handleTap(tile: Tile): void {
    if (phase !== "playing" || resolvingRef.current || !round) return;
    resolvingRef.current = true;
    setRoundState("resolving");
    setChosenKey(tile.key);

    if (tile.isOdd) registerHit();
    else registerMiss();
  }

  function tileVisual(tile: Tile): TileVisual {
    if (!reveal) return "idle";
    if (tile.isOdd) return "correct";
    if (tile.key === chosenKey) return "wrong";
    return "dim";
  }

  const heartsDisplay =
    "❤️".repeat(Math.max(0, hearts)) +
    "🤍".repeat(Math.max(0, START_HEARTS - hearts));

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
      <StatBadge
        label="Hearts"
        value={<span className="text-xl leading-none">{heartsDisplay}</span>}
      />
    </>
  );

  const comboLabel = Math.min(combo, MAX_MULTIPLIER);
  const cols = round && round.tiles.length > 4 ? "grid-cols-3" : "grid-cols-2";

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={28} />

      {phase === "ready" && <ReadyPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full max-w-sm flex-col items-center gap-5">
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

          <div className="text-center text-2xl font-black drop-shadow sm:text-3xl">
            Which one doesn&apos;t belong? 🔍
          </div>

          <div className="relative w-full">
            <div className={`grid w-full gap-3 ${cols} ${shaking ? "animate-shake" : ""}`}>
              {round.tiles.map((tile, index) => (
                <TileButton
                  key={tile.key}
                  tile={tile}
                  index={index}
                  visual={tileVisual(tile)}
                  disabled={roundState !== "active"}
                  onTap={handleTap}
                />
              ))}
            </div>

            {floatGain > 0 && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
              >
                <FloatScore>+{floatGain}</FloatScore>
              </span>
            )}
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** One big emoji tile. Highlights green (odd) or red (mistaken) once revealed. */
function TileButton({
  tile,
  index,
  visual,
  disabled,
  onTap,
}: {
  tile: Tile;
  index: number;
  visual: TileVisual;
  disabled: boolean;
  onTap: (tile: Tile) => void;
}) {
  const feedback =
    visual === "correct"
      ? "scale-105 ring-8 ring-lime-400 bg-white"
      : visual === "wrong"
        ? "scale-95 opacity-80 ring-8 ring-rose-400 bg-white"
        : visual === "dim"
          ? "opacity-40 bg-white"
          : "bg-white active:scale-95";

  return (
    <button
      type="button"
      onClick={() => onTap(tile)}
      disabled={disabled}
      aria-label={`tile ${index + 1}`}
      style={{ animationDelay: `${index * 0.05}s` }}
      className={`flex min-h-24 animate-pop-in items-center justify-center rounded-3xl p-2 text-slate-900 shadow-lg shadow-black/20 transition-transform duration-200 ${feedback}`}
    >
      <span className="text-6xl leading-none" aria-hidden>
        {tile.emoji}
      </span>
    </button>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="animate-bob text-6xl">🔍</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Odd One Out</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Most tiles are alike — one is the odd one out. Tap the tile that doesn&apos;t
        belong! More tiles appear as you get better.
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 hearts &middot; ⭐ at 80 / 200 / 400 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🔍"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-indigo-600">{score}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">points</div>
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
