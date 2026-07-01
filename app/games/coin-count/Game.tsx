"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import CoinTimerBar from "./CoinTimerBar";
import {
  COIN_VALUES,
  durationFor,
  levelFor,
  multiplierFor,
  pointsFor,
  priceFor,
  starsFor,
  type CoinValue,
} from "./coins";

const SLUG = "coin-count";
const START_HEARTS = 3;

const SUCCESS_DELAY = 650; // show the "paid!" state + confetti before next price
const MISS_DELAY = 850; // show the over-pay / timeout before retrying the price
const OVER_DELAY = 650; // last heart lost -> reveal the game-over panel

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type RoundResult = "none" | "solved" | "exceeded" | "timeout";

// Distinct colours so a child reads each coin at a glance (penny / copper / silver / gold).
const COIN_STYLE: Record<CoinValue, string> = {
  1: "bg-amber-700 text-white ring-amber-200",
  2: "bg-orange-500 text-white ring-orange-200",
  5: "bg-zinc-400 text-zinc-900 ring-white",
  10: "bg-yellow-400 text-yellow-950 ring-amber-100",
};

const meta = getGame(SLUG);

function sumCoins(coins: CoinValue[]): number {
  return coins.reduce((acc, c) => acc + c, 0);
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [roundState, setRoundState] = useState<RoundState>("active");
  const [result, setResult] = useState<RoundResult>("none");

  const [price, setPrice] = useState(0);
  const [duration, setDuration] = useState(durationFor(0));
  const [coins, setCoins] = useState<CoinValue[]>([]);
  const [roundId, setRoundId] = useState(0);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [solved, setSolved] = useState(0);

  const [floatText, setFloatText] = useState("");
  const [floatKey, setFloatKey] = useState(0);
  const [solveBurst, setSolveBurst] = useState(0);
  const [bestBurst, setBestBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const priceStart = useRef(0);
  const timers = useRef<number[]>([]);

  const total = sumCoins(coins);

  // Load the persisted best after mount (SSR-safe, post-hydration).
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

  function showFloat(text: string): void {
    setFloatText(text);
    setFloatKey((k) => k + 1);
  }

  function beginRound(nextPrice: number, nextDuration: number): void {
    setPrice(nextPrice);
    setDuration(nextDuration);
    setCoins([]);
    setResult("none");
    setRoundState("active");
    setRoundId((id) => id + 1);
    priceStart.current = Date.now();
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setSolved(0);
    setNewBest(false);
    setPhase("playing");
    beginRound(priceFor(0), durationFor(0));
  }

  function endGame(finalScore: number): void {
    setPhase("over");
    const isBest = recordBest(SLUG, finalScore);
    setNewBest(isBest);
    setStars(SLUG, starsFor(finalScore));
    if (isBest) {
      setBest(finalScore);
      setBestBurst((b) => b + 1);
      sfx.win();
    } else {
      sfx.gameOver();
    }
  }

  // A miss is either an over-payment or a timeout. Both cost a heart, reset the
  // streak, and retry the SAME price with a fresh timer.
  function registerMiss(): void {
    sfx.wrong();
    setCombo(0);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      const samePrice = price;
      const sameDuration = durationFor(levelFor(solved));
      schedule(() => beginRound(samePrice, sameDuration), MISS_DELAY);
    }
  }

  function handleCoin(value: CoinValue): void {
    if (phase !== "playing" || roundState !== "active") return;

    const nextCoins = [...coins, value];
    const nextTotal = total + value;

    if (nextTotal === price) {
      setRoundState("resolving");
      setCoins(nextCoins);
      setResult("solved");
      sfx.pop();
      sfx.correct();

      const remainingMs = Math.max(0, duration - (Date.now() - priceStart.current));
      const nextCombo = combo + 1;
      const points = pointsFor(remainingMs, duration, nextCombo);
      const nextSolved = solved + 1;
      if (nextCombo >= 2) sfx.combo(nextCombo);
      if (levelFor(nextSolved) > levelFor(solved)) sfx.levelUp();

      setCombo(nextCombo);
      setScore((s) => s + points);
      setSolved(nextSolved);
      showFloat(`+${points}`);
      setSolveBurst((b) => b + 1);
      schedule(() => beginRound(priceFor(levelFor(nextSolved)), durationFor(levelFor(nextSolved))), SUCCESS_DELAY);
      return;
    }

    if (nextTotal > price) {
      setRoundState("resolving");
      setCoins(nextCoins); // reveal the over-pay (e.g. "14¢ / 12¢") before clearing
      setResult("exceeded");
      registerMiss();
      return;
    }

    // Still under the price: add the coin with a juicy pop + "+N¢".
    sfx.pop();
    setCoins(nextCoins);
    showFloat(`+${value}¢`);
  }

  function handleTimeout(): void {
    if (roundState !== "active") return;
    setRoundState("resolving");
    setResult("timeout");
    registerMiss();
  }

  function handleUndo(): void {
    if (phase !== "playing" || roundState !== "active" || coins.length === 0) return;
    sfx.click();
    setCoins(coins.slice(0, -1));
  }

  function handleClear(): void {
    if (phase !== "playing" || roundState !== "active" || coins.length === 0) return;
    sfx.click();
    setCoins([]);
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

  const progress = price > 0 ? Math.min(100, (total / price) * 100) : 0;
  const totalColor =
    result === "solved"
      ? "text-lime-200"
      : result === "exceeded"
        ? "text-red-200"
        : "text-white";
  const fillColor =
    result === "solved"
      ? "bg-lime-300"
      : result === "exceeded"
        ? "bg-red-400"
        : "bg-white";

  const statusMessage =
    result === "solved"
      ? "✅ Paid!"
      : result === "exceeded"
        ? "❌ Too much!"
        : result === "timeout"
          ? "⏰ Too slow!"
          : null;

  const shownCoins = coins.slice(-12);
  const hiddenCount = coins.length - shownCoins.length;

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={solveBurst} count={26} />
      <Confetti fire={bestBurst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && (
        <div className="flex w-full max-w-xs flex-col items-center gap-4">
          {/* Combo / status zone — fixed height to avoid layout shift. */}
          <div className="flex min-h-[2.25rem] flex-col items-center justify-center gap-1">
            {statusMessage ? (
              <div
                key={`${roundId}-${result}`}
                className="animate-pop-in rounded-full bg-white/30 px-4 py-1 text-base font-black"
              >
                {statusMessage}
              </div>
            ) : (
              combo >= 2 && (
                <div
                  key={combo}
                  className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
                >
                  🔥 Combo x{multiplierFor(combo)}
                </div>
              )
            )}
          </div>

          <div className="text-center text-3xl font-black drop-shadow sm:text-4xl">
            Pay {price}
            <span className="align-top text-2xl">¢</span>
          </div>

          {/* Running total with a fill bar + the floating "+N" popup. */}
          <div
            className={`relative flex w-full flex-col items-center ${
              result === "exceeded" ? "animate-shake" : ""
            }`}
          >
            <div className={`text-4xl font-black tabular-nums drop-shadow ${totalColor}`}>
              {total}
              <span className="text-2xl opacity-90">¢</span>
              <span className="px-1 text-2xl opacity-60">/</span>
              {price}
              <span className="text-2xl opacity-90">¢</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-black/20">
              <div
                className={`h-full rounded-full transition-all duration-200 ${fillColor}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {floatKey > 0 && (
              <span
                key={floatKey}
                className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2"
              >
                <FloatScore>{floatText}</FloatScore>
              </span>
            )}
          </div>

          <CoinTimerBar
            roundId={roundId}
            durationMs={duration}
            paused={roundState !== "active"}
            onTimeout={handleTimeout}
          />

          {/* Tray of coins dropped in so far (undo removes the last one). */}
          <div className="flex min-h-[2.25rem] w-full flex-wrap items-center justify-center gap-1.5">
            {hiddenCount > 0 && (
              <span className="text-sm font-black opacity-80">+{hiddenCount}</span>
            )}
            {shownCoins.map((c, i) => (
              <span
                key={`${roundId}-${hiddenCount + i}`}
                className="animate-pop-in flex h-7 items-center gap-0.5 rounded-full bg-white/25 px-2 text-sm font-black"
              >
                🪙{c}
              </span>
            ))}
          </div>

          {/* Coin buttons. */}
          <div className="grid w-full grid-cols-4 gap-2">
            {COIN_VALUES.map((value) => (
              <CoinButton
                key={value}
                value={value}
                disabled={roundState !== "active"}
                onTap={() => handleCoin(value)}
              />
            ))}
          </div>

          {/* Undo + Clear. */}
          <div className="flex w-full gap-3">
            <ActionButton
              label="↩️ Undo"
              disabled={roundState !== "active" || coins.length === 0}
              onTap={handleUndo}
            />
            <ActionButton
              label="🗑️ Clear"
              disabled={roundState !== "active" || coins.length === 0}
              onTap={handleClear}
            />
          </div>
        </div>
      )}
    </GameShell>
  );
}

function CoinButton({
  value,
  disabled,
  onTap,
}: {
  value: CoinValue;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`flex aspect-square w-full select-none flex-col items-center justify-center rounded-full ring-4 shadow-lg shadow-black/30 transition active:scale-90 disabled:opacity-60 disabled:active:scale-100 ${COIN_STYLE[value]}`}
      aria-label={`Add ${value} cent coin`}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {"🪙"}
      </span>
      <span className="text-base font-black leading-none tabular-nums">
        {value}
        <span className="text-xs">{"¢"}</span>
      </span>
    </button>
  );
}

function ActionButton({
  label,
  disabled,
  onTap,
}: {
  label: string;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className="h-12 flex-1 select-none rounded-2xl bg-white/30 text-base font-black text-white transition active:scale-95 hover:bg-white/30 disabled:opacity-40 disabled:active:scale-100"
    >
      {label}
    </button>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">{"🪙"}</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Coin Count</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Tap coins to pay the price <b>exactly</b>! Go over and you lose a heart. Pay fast and
        keep a streak for bonus points.
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        {"❤️❤️❤️"} 3 lives &middot; {"⭐"} at 80 / 200 / 400 pts
      </p>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>{"▶ Play"}</BigButton>
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
      <div className="text-5xl">{newBest ? "🏆" : "🪙"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-yellow-600">{score}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">points</div>
      <div className="mt-3 flex justify-center">
        <StarRow value={starsFor(score)} />
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-500">Best {best}</div>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>{"🔁 Play Again"}</BigButton>
      </div>
    </Panel>
  );
}
