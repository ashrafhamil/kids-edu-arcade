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
  binsFor,
  durationFor,
  genItem,
  isCorrect,
  levelFor,
  ruleFor,
  starsFor,
  type Bin,
  type Item,
  type SortRule,
} from "./data";

const SLUG = "shape-sort";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;

const POP_DELAY = 180; // correct: time for the item to pop before the next one
const MISS_DELAY = 750; // wrong/timeout: time to shake before the next item
const OVER_DELAY = 650; // last heart lost -> show the game-over panel
const FLASH_MS = 1100; // level-up: how long the new-rule banner stays up

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type ItemVisual = "idle" | "correct" | "wrong";
type Flash = { rule: SortRule; level: number; key: number };

const meta = getGame(SLUG);

const RULE_TEXT: Record<SortRule, { title: string; hint: string; icon: string }> = {
  shape: { title: "Sort by SHAPE", hint: "Match the shape", icon: "🔷" },
  color: { title: "Sort by COLOR", hint: "Match the color", icon: "🎨" },
};

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [roundState, setRoundState] = useState<RoundState>("active");
  const [rule, setRule] = useState<SortRule>("shape");
  const [item, setItem] = useState<Item | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [level, setLevel] = useState(0);

  const [itemVisual, setItemVisual] = useState<ItemVisual>("idle");
  const [tappedBin, setTappedBin] = useState<string | null>(null);
  const [tappedCorrect, setTappedCorrect] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const flashId = useRef(1);
  const lastItem = useRef<Item | null>(null);
  const timers = useRef<number[]>([]);
  // Synchronous resolution latch: flips the instant a round is decided, so a
  // last-millisecond tap and the about-to-fire timeout can't both resolve the
  // same item. (roundState is React state and would be stale in the timer's
  // closure during the gap before passive effects clear the deadline.)
  const resolving = useRef(false);

  // Load the persisted best after mount (SSR-safe), deferred so the read happens
  // post-hydration without a synchronous-setState-in-effect cascade.
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
    const lvl = levelFor(forCorrectCount);
    const next = genItem(nextId.current++, lastItem.current);
    lastItem.current = next;
    setLevel(lvl);
    setRule(ruleFor(lvl));
    setItem(next);
    setItemVisual("idle");
    setTappedBin(null);
    setShaking(false);
    setRoundState("active");
    resolving.current = false;
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    setFlash(null);
    setTappedCorrect(false);
    setFloatKey(0);
    lastItem.current = null;
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

  function registerMiss(binKey: string | null): void {
    sfx.wrong();
    setCombo(0);
    setTappedBin(binKey);
    setTappedCorrect(false);
    setItemVisual("wrong");
    setShaking(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount), MISS_DELAY);
    }
  }

  function handleSort(bin: Bin): void {
    if (phase !== "playing" || roundState !== "active" || !item || resolving.current)
      return;
    resolving.current = true;
    setRoundState("resolving");

    if (!isCorrect(item, bin)) {
      registerMiss(bin.key);
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextCorrect = correctCount + 1;
    const leveledUp = levelFor(nextCorrect) > levelFor(correctCount);

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    setTappedBin(bin.key);
    setTappedCorrect(true);
    setItemVisual("correct");

    if (leveledUp) {
      const newLevel = levelFor(nextCorrect);
      sfx.levelUp();
      setFlash({ rule: ruleFor(newLevel), level: newLevel, key: flashId.current++ });
      schedule(() => setFlash(null), FLASH_MS);
      schedule(() => loadNext(nextCorrect), FLASH_MS);
    } else {
      schedule(() => loadNext(nextCorrect), POP_DELAY);
    }
  }

  function handleTimeout(): void {
    if (roundState !== "active" || resolving.current) return;
    resolving.current = true;
    setRoundState("resolving");
    registerMiss(null);
  }

  const heartsDisplay =
    "❤️".repeat(Math.max(0, hearts)) +
    "💔".repeat(Math.max(0, START_HEARTS - hearts));

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

  const bins = binsFor(rule);

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && item && (
        <div className="relative flex w-full max-w-xs flex-col items-center gap-4">
          <RuleBanner rule={rule} level={level} />

          <div className="flex min-h-[2rem] items-center justify-center">
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          <div className="w-full px-1">
            <TimerBar
              itemId={item.id}
              durationMs={durationFor(level)}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div className={`relative ${shaking ? "animate-shake" : ""}`}>
            <ItemCard item={item} visual={itemVisual} />
            {floatKey > 0 && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2"
              >
                <FloatScore>+{lastPoints}</FloatScore>
              </span>
            )}
          </div>

          <div
            className={`grid w-full grid-cols-3 gap-3 ${shaking ? "animate-shake" : ""}`}
          >
            {bins.map((bin) => (
              <BinButton
                key={bin.key}
                bin={bin}
                disabled={roundState !== "active"}
                tapped={tappedBin === bin.key}
                tappedCorrect={tappedCorrect}
                onTap={() => handleSort(bin)}
              />
            ))}
          </div>

          {flash && <RuleFlash key={flash.key} rule={flash.rule} level={flash.level} />}
        </div>
      )}
    </GameShell>
  );
}

function RuleBanner({ rule, level }: { rule: SortRule; level: number }) {
  const info = RULE_TEXT[rule];
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <div className="flex items-center gap-2 rounded-full bg-white/25 px-5 py-2 shadow-md backdrop-blur">
        <span className="text-2xl leading-none" aria-hidden>
          {info.icon}
        </span>
        <span className="text-xl font-black uppercase tracking-tight">{info.title}</span>
      </div>
      <span className="text-xs font-bold uppercase tracking-widest text-white/80">
        {info.hint} · Level {level + 1}
      </span>
    </div>
  );
}

function ItemCard({ item, visual }: { item: Item; visual: ItemVisual }) {
  const stateClass =
    visual === "correct"
      ? "scale-150 opacity-0 transition-all duration-200"
      : visual === "wrong"
        ? "ring-8 ring-rose-300 transition-all duration-200"
        : "animate-pop-in";

  return (
    <div
      key={item.id}
      className={`flex h-32 w-32 select-none items-center justify-center rounded-3xl bg-white/15 text-7xl shadow-lg shadow-black/20 ring-4 ring-white/30 ${stateClass}`}
      aria-label={`Sort this: ${item.color} ${item.shape}`}
    >
      {item.emoji}
    </div>
  );
}

function BinButton({
  bin,
  disabled,
  tapped,
  tappedCorrect,
  onTap,
}: {
  bin: Bin;
  disabled: boolean;
  tapped: boolean;
  tappedCorrect: boolean;
  onTap: () => void;
}) {
  const feedback = tapped
    ? tappedCorrect
      ? "ring-emerald-300 scale-105 bg-emerald-500/30"
      : "ring-rose-400 bg-rose-500/30 animate-shake"
    : "ring-white/30 active:scale-95";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl bg-black/15 ring-4 backdrop-blur transition-all duration-150 disabled:active:scale-100 ${feedback}`}
      aria-label={`${bin.label} bin`}
    >
      <span className="text-4xl leading-none drop-shadow" aria-hidden>
        {bin.emoji}
      </span>
      <span className="text-xs font-black uppercase tracking-wide">{bin.label}</span>
    </button>
  );
}

function RuleFlash({ rule, level }: { rule: SortRule; level: number }) {
  const info = RULE_TEXT[rule];
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="animate-pop-in rounded-3xl bg-slate-900/85 px-7 py-5 text-center shadow-2xl">
        <div className="text-sm font-black uppercase tracking-widest text-amber-300">
          ⬆️ Level {level + 1}
        </div>
        <div className="mt-1 text-3xl leading-none" aria-hidden>
          {info.icon}
        </div>
        <div className="mt-1 text-2xl font-black uppercase tracking-tight text-white">
          {info.title}!
        </div>
      </div>
    </div>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🔵🟩❤️</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Shape Sort</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Drop the item in the right bin! Watch the rule at the top — it flips
        between <span className="font-black text-teal-600">SHAPE</span> and{" "}
        <span className="font-black text-teal-600">COLOR</span> as you level up.
      </p>
      <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-2 text-3xl">
        <span aria-hidden>⚪</span>
        <span aria-hidden>⬜</span>
        <span aria-hidden>🤍</span>
        <span className="px-1 text-slate-400">/</span>
        <span aria-hidden>🔴</span>
        <span aria-hidden>🟢</span>
        <span aria-hidden>🔵</span>
      </div>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives · ⭐ at 100 / 250 / 500 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🟦"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-teal-600">{score}</div>
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
