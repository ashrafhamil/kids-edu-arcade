"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  genRound,
  levelFor,
  poolFor,
  focusFor,
  starsFor,
  type Round,
  type RegionId,
} from "./rounds";
import WorldMap from "./WorldMap";
import TimerBar from "./TimerBar";

const SLUG = "map-quest";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CORRECT_DELAY = 560; // green flash on the region, then the next prompt
const WRONG_DELAY = 1400; // long enough to read where the answer really was
const OVER_DELAY = 900;
const SHAKE_MS = 400;

type Phase = "ready" | "playing" | "over";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [wrongId, setWrongId] = useState<RegionId | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const resolving = useRef(false);
  // Regions already asked in the current pool — nothing repeats until the whole
  // pool has been seen, so every continent and ocean gets its turn. The pool
  // changes with the level, so the cycle is tracked per level.
  const usedIds = useRef<RegionId[]>([]);
  const usedLevel = useRef(0);

  // Load the persisted best after mount so server and first client render agree.
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

  /** Draw the next target, restarting the cycle on a new level or an empty pool. */
  function makeRound(forCorrectCount: number, avoidId?: RegionId): Round {
    const level = levelFor(forCorrectCount);
    if (level !== usedLevel.current || usedIds.current.length >= poolFor(level).length) {
      usedIds.current = [];
      usedLevel.current = level;
    }
    const next = genRound(nextId.current++, forCorrectCount, usedIds.current, avoidId);
    usedIds.current.push(next.target.id);
    return next;
  }

  function present(next: Round): void {
    setRound(next);
    setWrongId(null);
    setRevealAnswer(false);
    setShaking(false);
    setFloatGain(0);
    resolving.current = false;
  }

  function loadNext(forCorrectCount: number, avoidId: RegionId): void {
    present(makeRound(forCorrectCount, avoidId));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    usedIds.current = [];
    usedLevel.current = 0;
    present(makeRound(0));
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

  /**
   * A miss always leaves the correct region flashing green (and the tapped one
   * red) for WRONG_DELAY, so the child sees where the answer actually was
   * before the next prompt arrives.
   */
  function registerMiss(tappedId: RegionId | null, prevAnswer: RegionId): void {
    sfx.wrong();
    setCombo(0);
    setWrongId(tappedId);
    setRevealAnswer(true);
    setShaking(true);
    schedule(() => setShaking(false), SHAKE_MS);

    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount, prevAnswer), WRONG_DELAY);
    }
  }

  function registerHit(): void {
    if (!round) return;
    sfx.pop();
    sfx.correct();

    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);

    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextCorrect = correctCount + 1;
    const nextRound = makeRound(nextCorrect, round.target.id);
    if (nextRound.level > round.level) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setRevealAnswer(true);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    schedule(() => present(nextRound), CORRECT_DELAY);
  }

  function handlePick(pickedId: RegionId): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;

    if (pickedId === round.target.id) registerHit();
    else registerMiss(pickedId, round.target.id);
  }

  function handleTimeout(): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    registerMiss(null, round.target.id);
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
        <div className="flex w-full flex-col items-center gap-3">
          <div className="relative flex flex-col items-center">
            <div
              key={round.id}
              className="animate-pop-in rounded-3xl bg-white/95 px-6 py-3 text-center shadow-2xl shadow-black/30"
            >
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Lv {round.level + 1} &middot; {focusFor(round.level)}
              </div>
              <div className="text-3xl font-black leading-tight text-slate-800">
                {round.target.name}
              </div>
            </div>

            {combo >= 2 && (
              <span
                key={combo}
                className="animate-pop-in absolute -right-3 -top-3 rounded-full bg-amber-300 px-3 py-1 text-sm font-black text-amber-950 shadow-md"
              >
                🔥 x{Math.min(combo, MAX_MULTIPLIER)}
              </span>
            )}

            {floatGain > 0 && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
              >
                <FloatScore>+{floatGain}</FloatScore>
              </span>
            )}
          </div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id}
              durationMs={round.durationMs}
              paused={revealAnswer}
              onTimeout={handleTimeout}
            />
          </div>

          <div
            className={`w-full max-w-md rounded-3xl bg-white/95 p-1 shadow-2xl shadow-black/30 ${
              shaking ? "animate-shake" : ""
            }`}
          >
            <WorldMap
              correctId={revealAnswer ? round.target.id : null}
              wrongId={wrongId}
              disabled={revealAnswer}
              onPick={handlePick}
            />
          </div>
        </div>
      )}
    </GameShell>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="animate-bob text-6xl">🗺️</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Map Quest</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        A place is named — tap it on the world map. Continents first, then the oceans, then
        both mixed together.
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
      <div className="text-5xl">{newBest ? "🏆" : "🗺️"}</div>
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
