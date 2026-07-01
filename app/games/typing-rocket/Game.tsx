"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  levelFor,
  tierFor,
  keyCountFor,
  makeKeys,
  pickTarget,
  starsFor,
  type Target,
} from "./data";

const SLUG = "typing-rocket";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;

const RISE_MS = 260; // rocket lifts a step on each correct letter
const LAUNCH_MS = 700; // launch flight + pause before the next target loads
const SHAKE_MS = 400; // wrong-key shake + reveal
const OVER_DELAY = 650; // last heart lost -> show the game-over panel

// Bright, saturated key colours; white letters sit on top for contrast.
const KEY_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#16a34a",
  "#a855f7",
  "#0ea5e9",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
] as const;

type Phase = "start" | "playing" | "over";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [target, setTarget] = useState<Target | null>(null);
  const [targetId, setTargetId] = useState(0);
  const [keys, setKeys] = useState<string[]>([]);
  const [filled, setFilled] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [dying, setDying] = useState(false);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [completed, setCompleted] = useState(0);

  const [wrongKey, setWrongKey] = useState<number | null>(null);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState("");

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const prevText = useRef("");
  const nextTargetId = useRef(1);
  const timers = useRef<number[]>([]);

  // Load the persisted best after mount (SSR-safe).
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

  function loadTarget(completedCount: number): void {
    const level = levelFor(completedCount);
    const next = pickTarget(level, prevText.current);
    prevText.current = next.text;
    setTarget(next);
    setKeys(makeKeys(next.text, keyCountFor(level)));
    setFilled(0);
    setLaunching(false);
    setTargetId(nextTargetId.current++);
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    prevText.current = "";
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCompleted(0);
    setNewBest(false);
    setWrongKey(null);
    setShaking(false);
    setDying(false);
    setToast("");
    loadTarget(0);
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

  function completeTarget(): void {
    setLaunching(true);
    sfx.correct();
    schedule(() => sfx.win(), 120);
    setBurst((b) => b + 1);

    const level = levelFor(completed);
    const nextCompleted = completed + 1;
    const bonus = 20 + level * 10;
    setScore((s) => s + bonus);
    setLastPoints(bonus);
    setFloatKey((k) => k + 1);

    const steppedUp = tierFor(levelFor(nextCompleted)) > tierFor(level);
    if (steppedUp) {
      schedule(() => sfx.levelUp(), 260);
      setToast(`Level ${levelFor(nextCompleted)}! 🚀`);
    } else {
      setToast("🚀 LIFT OFF!");
    }
    schedule(() => setToast(""), LAUNCH_MS);

    setCompleted(nextCompleted);
    schedule(() => loadTarget(nextCompleted), LAUNCH_MS);
  }

  function registerWrong(index: number): void {
    sfx.wrong();
    setCombo(0);
    setWrongKey(index);
    setShaking(true);
    schedule(() => {
      setShaking(false);
      setWrongKey(null);
    }, SHAKE_MS);

    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      setDying(true);
      schedule(() => endGame(score), OVER_DELAY);
    }
  }

  function handleKey(letter: string, index: number): void {
    if (phase !== "playing" || launching || dying || !target) return;

    if (letter !== target.text[filled]) {
      registerWrong(index);
      return;
    }

    sfx.pop();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextFilled = filled + 1;

    setCombo(nextCombo);
    setScore((s) => s + points);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    setFilled(nextFilled);

    if (nextFilled >= target.text.length) completeTarget();
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

  const busy = launching || dying;

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={28} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel
          score={score}
          best={best}
          launches={completed}
          newBest={newBest}
          onPlay={startGame}
        />
      )}

      {phase === "playing" && target && (
        <div className="flex w-full max-w-sm flex-col items-center gap-2.5">
          <p className="text-sm font-bold uppercase tracking-wide text-white/80">
            Tap the letters in order
          </p>

          <TargetRow target={target} filled={filled} shaking={shaking} />

          <Sky
            targetId={targetId}
            fraction={target.text.length ? filled / target.text.length : 0}
            launching={launching}
            combo={combo}
            toast={toast}
            floatKey={floatKey}
            lastPoints={lastPoints}
          />

          <div className="flex max-w-[20rem] flex-wrap justify-center gap-2">
            {keys.map((letter, index) => (
              <button
                key={`${targetId}-${index}`}
                type="button"
                onClick={() => handleKey(letter, index)}
                disabled={busy}
                aria-label={`Letter ${letter}`}
                className={`flex h-12 w-14 select-none items-center justify-center rounded-2xl text-2xl font-black text-white shadow-md shadow-black/30 ring-2 ring-white/40 transition active:scale-90 disabled:opacity-60 ${
                  wrongKey === index ? "animate-shake ring-4 ring-red-200" : ""
                }`}
                style={{ background: KEY_COLORS[index % KEY_COLORS.length] }}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** The target word/letter as readable slots that fill in as you type. */
function TargetRow({
  target,
  filled,
  shaking,
}: {
  target: Target;
  filled: number;
  shaking: boolean;
}) {
  const letters = target.text.split("");
  const single = letters.length === 1;
  const box = single ? "h-16 w-16 text-4xl" : "h-12 w-11 text-2xl";

  return (
    <div className="flex flex-col items-center gap-1">
      {target.emoji && (
        <span className="text-2xl leading-none" aria-hidden>
          {target.emoji}
        </span>
      )}
      <div
        key={shaking ? "shake" : "still"}
        className={`flex justify-center gap-1.5 ${shaking ? "animate-shake" : ""}`}
        aria-label={`Spell ${target.text}`}
      >
        {letters.map((ch, i) => {
          const done = i < filled;
          const current = i === filled;
          return (
            <span
              key={i}
              className={`flex items-center justify-center rounded-xl border-2 font-black ${box} ${
                done
                  ? "border-transparent bg-white text-slate-900"
                  : current
                    ? "animate-bob border-white bg-white/25 text-white ring-2 ring-white"
                    : "border-white/40 bg-white/5 text-white/40"
              }`}
            >
              {done ? <span className="animate-pop-in">{ch}</span> : ch}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The launch pad: a rocket that rises with each letter and blasts off on completion. */
function Sky({
  targetId,
  fraction,
  launching,
  combo,
  toast,
  floatKey,
  lastPoints,
}: {
  targetId: number;
  fraction: number;
  launching: boolean;
  combo: number;
  toast: string;
  floatKey: number;
  lastPoints: number;
}) {
  const bottomPct = launching ? 120 : 6 + fraction * 64;
  const rocketTransition = launching
    ? `bottom ${LAUNCH_MS}ms cubic-bezier(0.45,0,0.9,0.35), opacity ${LAUNCH_MS}ms ease-in`
    : `bottom ${RISE_MS}ms ease-out`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-indigo-900/70 to-slate-900/60 ring-1 ring-white/25"
      style={{ height: "clamp(116px, 18dvh, 184px)" }}
    >
      <span className="pointer-events-none absolute left-5 top-3 text-sm opacity-70" aria-hidden>
        ⭐
      </span>
      <span className="pointer-events-none absolute right-6 top-6 text-xs opacity-60" aria-hidden>
        ✨
      </span>
      <span className="pointer-events-none absolute left-1/3 top-2 text-xs opacity-50" aria-hidden>
        ⭐
      </span>

      {/* vertical fuel gauge */}
      <div className="absolute bottom-2 left-2 top-2 w-2.5 overflow-hidden rounded-full bg-white/15">
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-amber-400 to-rose-400"
          style={{ height: `${fraction * 100}%`, transition: `height ${RISE_MS}ms ease-out` }}
        />
      </div>

      {combo >= 2 && (
        <div className="absolute right-3 top-3 rounded-full bg-amber-300 px-3 py-1 text-sm font-black text-amber-950 shadow animate-pop-in">
          🔥 x{Math.min(combo, MAX_MULTIPLIER)}
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
          <span className="rounded-2xl bg-white px-4 py-1.5 text-lg font-black text-rose-600 shadow-xl animate-pop-in">
            {toast}
          </span>
        </div>
      )}

      {lastPoints > 0 && (
        <span
          key={floatKey}
          className="pointer-events-none absolute bottom-12 left-1/2 z-10 -translate-x-1/2"
        >
          <FloatScore>+{lastPoints}</FloatScore>
        </span>
      )}

      {/* ground */}
      <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-emerald-700/80 to-emerald-600/40" />

      {/* rocket — re-keyed per target so each one starts back on the pad */}
      <div
        key={targetId}
        className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center will-change-transform"
        style={{ bottom: `${bottomPct}%`, opacity: launching ? 0 : 1, transition: rocketTransition }}
      >
        <span className="text-4xl leading-none drop-shadow" aria-hidden>
          🚀
        </span>
        {(launching || fraction > 0) && (
          <span className="-mt-1 text-xl leading-none animate-wiggle" aria-hidden>
            🔥
          </span>
        )}
      </div>
    </div>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🚀</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Typing Rocket</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Tap the letters <span className="font-black">in order</span> to fuel the rocket and blast
        off. Keep a streak for bonus points!
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at 100 / 250 / 500 pts
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
  launches,
  newBest,
  onPlay,
}: {
  score: number;
  best: number;
  launches: number;
  newBest: boolean;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl">{newBest ? "🏆" : "🚀"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-rose-600">{score}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
        points &middot; {launches} launched
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
