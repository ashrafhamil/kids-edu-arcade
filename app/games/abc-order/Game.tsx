"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, starsFor, lettersFor, type Round, type Tile } from "./rounds";

const SLUG = "abc-order";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const ROUND_DELAY = 550; // last letter tapped -> next round loads
const WRONG_DELAY = 900; // shake plays, child re-reads the remaining letters
const OVER_DELAY = 700; // last heart lost -> show the game-over panel

type Phase = "ready" | "playing" | "over";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [progress, setProgress] = useState(0);
  const [tappedKeys, setTappedKeys] = useState<Set<string>>(new Set());
  // True only while a wrong-tap shake plays or a completed round hands off to the next —
  // taps between two correct-but-not-final steps are never locked.
  const [locked, setLocked] = useState(false);
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [roundsCompleted, setRoundsCompleted] = useState(0);

  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

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

  function present(next: Round): void {
    setRound(next);
    setProgress(0);
    setTappedKeys(new Set());
    setWrongKey(null);
    setLocked(false);
  }

  function loadNext(forRoundsCompleted: number, avoidOrder: string[]): void {
    present(genRound(nextId.current++, forRoundsCompleted, avoidOrder));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setRoundsCompleted(0);
    setNewBest(false);
    present(genRound(nextId.current++, 0));
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

  function registerWrongTap(tile: Tile, currentScore: number): void {
    sfx.wrong();
    setCombo(0);
    setWrongKey(tile.key);
    setShakeKey((k) => k + 1);
    setLocked(true);

    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(currentScore), OVER_DELAY);
    } else {
      schedule(() => {
        setLocked(false);
        setWrongKey(null);
      }, WRONG_DELAY);
    }
  }

  function registerCorrectStep(tile: Tile, activeRound: Round): void {
    sfx.pop();
    const nextProgress = progress + 1;
    setTappedKeys((prev) => new Set(prev).add(tile.key));
    setProgress(nextProgress);

    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextScore = score + points;
    setCombo(nextCombo);
    setScore(nextScore);

    if (nextProgress < activeRound.order.length) return; // more letters left — stay interactive

    sfx.correct();
    const nextRoundsCompleted = roundsCompleted + 1;
    if (lettersFor(nextRoundsCompleted) > lettersFor(roundsCompleted)) sfx.levelUp();
    setRoundsCompleted(nextRoundsCompleted);
    setLocked(true);
    schedule(() => loadNext(nextRoundsCompleted, activeRound.order), ROUND_DELAY);
  }

  function handleTap(tile: Tile): void {
    if (phase !== "playing" || !round || locked || tappedKeys.has(tile.key)) return;

    if (tile.letter === round.order[progress]) {
      registerCorrectStep(tile, round);
    } else {
      registerWrongTap(tile, score);
    }
  }

  const heartsDisplay =
    "❤️".repeat(Math.max(0, hearts)) + "🤍".repeat(Math.max(0, START_HEARTS - hearts));

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

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={28} />

      {phase === "ready" && <ReadyPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <div className="flex min-h-[2.25rem] items-center justify-center">
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          <div className="text-center text-2xl font-black drop-shadow sm:text-3xl">
            Tap the letters A→Z! 🔡
          </div>

          <OrderSlots order={round.order} progress={progress} />

          <div key={shakeKey} className={shakeKey > 0 ? "animate-shake" : ""}>
            <div
              className={`grid gap-3 ${round.tiles.length > 3 ? "grid-cols-4" : "grid-cols-3"}`}
            >
              {round.tiles.map((tile, index) => (
                <LetterTile
                  key={tile.key}
                  tile={tile}
                  index={index}
                  done={tappedKeys.has(tile.key)}
                  wrong={wrongKey === tile.key}
                  disabled={locked || tappedKeys.has(tile.key)}
                  onTap={handleTap}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** Empty-to-filled slots showing the target A→Z sequence as it's completed. */
function OrderSlots({ order, progress }: { order: string[]; progress: number }) {
  return (
    <div className="flex justify-center gap-2" aria-label={`Order: ${order.join(", ")}`}>
      {order.map((letter, i) => {
        const done = i < progress;
        return (
          <span
            key={i}
            className={`flex h-14 w-12 items-center justify-center rounded-xl border-2 text-2xl font-black ${
              done
                ? "border-transparent bg-lime-400 text-lime-950"
                : "border-white/40 bg-white/10 text-white/40"
            }`}
          >
            {done ? (
              <span key={`f${i}`} className="animate-pop-in">
                {letter}
              </span>
            ) : (
              "•"
            )}
          </span>
        );
      })}
    </div>
  );
}

function LetterTile({
  tile,
  index,
  done,
  wrong,
  disabled,
  onTap,
}: {
  tile: Tile;
  index: number;
  done: boolean;
  wrong: boolean;
  disabled: boolean;
  onTap: (tile: Tile) => void;
}) {
  const feedback = done
    ? "opacity-40 ring-4 ring-lime-400"
    : wrong
      ? "ring-8 ring-rose-400 opacity-80"
      : "";

  return (
    <button
      type="button"
      onClick={() => onTap(tile)}
      disabled={disabled}
      aria-label={`Letter ${tile.letter}`}
      style={{ animationDelay: `${index * 0.05}s` }}
      className={`flex min-h-20 animate-pop-in items-center justify-center rounded-2xl bg-white text-4xl font-black text-slate-900 shadow-lg shadow-black/20 transition-transform duration-200 active:scale-95 disabled:active:scale-100 ${feedback}`}
    >
      {done ? <span aria-hidden>✅</span> : tile.letter}
    </button>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">🔡</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">ABC Order</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        A few shuffled letters appear — tap them in alphabetical order, from A towards Z.
        A wrong tap costs a heart!
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
      <div className="text-5xl">{newBest ? "🏆" : "🔡"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-sky-700">{score}</div>
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
