"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, levelFor, starsFor, type Round } from "./rounds";
import TimerBar from "./TimerBar";

const SLUG = "number-line-hop";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const HOP_DELAY = 420;
const CORRECT_DELAY = 480;
const WRONG_DELAY = 1000;
const OVER_DELAY = 700;

/** Timer ids stay unique across gaps of the same round so stale timeouts can't land. */
const GAPS_PER_ROUND = 10;

type Phase = "ready" | "playing" | "over";
type TileState = "number" | "filled" | "active" | "pending" | "revealed";
type ChoiceVisual = "idle" | "correct" | "wrong";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [gapOrder, setGapOrder] = useState(0);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [wrongValue, setWrongValue] = useState<number | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const resolving = useRef(false);

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

  /** Clear the per-question feedback so the next gap or round starts clean. */
  function armNextTap(): void {
    setWrongValue(null);
    setRevealAnswer(false);
    setFloatGain(0);
    resolving.current = false;
  }

  function present(next: Round): void {
    setRound(next);
    setGapOrder(0);
    armNextTap();
  }

  function loadNext(forCorrectCount: number, forScore: number): void {
    present(genRound(nextId.current++, levelFor(forCorrectCount), forScore));
  }

  function advanceGap(): void {
    setGapOrder((order) => order + 1);
    armNextTap();
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    present(genRound(nextId.current++, 0, 0));
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

  function registerMiss(tapped: number | null): void {
    sfx.wrong();
    setCombo(0);
    setWrongValue(tapped);
    setRevealAnswer(true);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correctCount, score), WRONG_DELAY);
    }
  }

  function registerHit(hasMoreGaps: boolean): void {
    sfx.pop();
    sfx.correct();

    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);

    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextScore = score + points;
    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setRevealAnswer(true);
    setFloatGain(points);
    setFloatKey((k) => k + 1);

    if (hasMoreGaps) {
      schedule(advanceGap, HOP_DELAY);
    } else {
      schedule(() => loadNext(nextCorrect, nextScore), CORRECT_DELAY);
    }
  }

  function handleChoice(value: number): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;

    if (value !== answerValue(round, gapOrder)) {
      registerMiss(value);
      return;
    }
    registerHit(gapOrder + 1 < round.gapIndexes.length);
  }

  function handleTimeout(): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    registerMiss(null);
  }

  function choiceVisual(value: number): ChoiceVisual {
    if (!round) return "idle";
    if (revealAnswer && value === answerValue(round, gapOrder)) return "correct";
    if (wrongValue === value) return "wrong";
    return "idle";
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

  const choices = round ? round.choicesPerGap[gapOrder] : [];

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={28} />

      {phase === "ready" && <ReadyPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full flex-col items-center gap-4">
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

          <NumberLine
            round={round}
            gapOrder={gapOrder}
            revealAnswer={revealAnswer}
            missed={revealAnswer && floatGain === 0}
          />

          <div className="flex items-center gap-2 text-2xl font-black drop-shadow">
            <span className="animate-bob text-3xl leading-none" aria-hidden>
              🐰
            </span>
            <span>Fill the gap!</span>
          </div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id * GAPS_PER_ROUND + gapOrder}
              durationMs={round.durationMs}
              paused={revealAnswer}
              onTimeout={handleTimeout}
            />
          </div>

          <div className="relative flex w-full max-w-sm flex-wrap items-stretch justify-center gap-3">
            {choices.map((value, index) => (
              <div
                key={`${round.id}-${gapOrder}-${value}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <ChoiceTile
                  value={value}
                  visual={choiceVisual(value)}
                  disabled={revealAnswer}
                  onTap={() => handleChoice(value)}
                />
                {floatGain > 0 && value === answerValue(round, gapOrder) && (
                  <span
                    key={floatKey}
                    className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
                  >
                    <FloatScore>+{floatGain}</FloatScore>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** The number this gap expects. */
function answerValue(round: Round, gapOrder: number): number {
  return round.tiles[round.gapIndexes[gapOrder]];
}

/** How one tile of the line should render right now. */
function tileState(
  round: Round,
  index: number,
  gapOrder: number,
  revealAnswer: boolean
): TileState {
  const order = round.gapIndexes.indexOf(index);
  if (order < 0) return "number";
  if (order < gapOrder) return "filled";
  if (order > gapOrder) return "pending";
  return revealAnswer ? "revealed" : "active";
}

function NumberLine({
  round,
  gapOrder,
  revealAnswer,
  missed,
}: {
  round: Round;
  gapOrder: number;
  revealAnswer: boolean;
  missed: boolean;
}) {
  return (
    <div className="grid w-full max-w-[20rem] grid-cols-5 gap-1.5 rounded-3xl bg-white/20 p-2">
      {round.tiles.map((value, index) => (
        <LineTile
          key={`${round.id}-${value}`}
          value={value}
          state={tileState(round, index, gapOrder, revealAnswer)}
          missed={missed}
        />
      ))}
    </div>
  );
}

function LineTile({
  value,
  state,
  missed,
}: {
  value: number;
  state: TileState;
  missed: boolean;
}) {
  if (state === "number") {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-white text-2xl font-black tabular-nums text-slate-900 shadow-md shadow-black/20">
        {value}
      </div>
    );
  }

  if (state === "filled" || state === "revealed") {
    const tone = state === "revealed" && missed ? "ring-rose-400" : "ring-lime-400";
    return (
      <div
        className={`flex aspect-square animate-pop-in items-center justify-center rounded-2xl bg-white text-2xl font-black tabular-nums text-slate-900 shadow-md shadow-black/20 ring-4 ${tone}`}
      >
        {value}
      </div>
    );
  }

  const gapTone =
    state === "active"
      ? "animate-bob border-white bg-white/35 text-white"
      : "border-white/50 bg-white/10 text-white/60";

  return (
    <div
      className={`flex aspect-square items-center justify-center rounded-2xl border-4 border-dashed text-2xl font-black ${gapTone}`}
      aria-hidden
    >
      ?
    </div>
  );
}

function ChoiceTile({
  value,
  visual,
  disabled,
  onTap,
}: {
  value: number;
  visual: ChoiceVisual;
  disabled: boolean;
  onTap: () => void;
}) {
  const feedback =
    visual === "correct"
      ? "ring-4 ring-lime-400 scale-[1.04]"
      : visual === "wrong"
        ? "ring-4 ring-rose-400 opacity-80 animate-shake"
        : "";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={`${value}`}
      className={`relative flex min-h-20 w-24 select-none items-center justify-center rounded-2xl bg-white text-5xl font-black tabular-nums text-slate-900 shadow-lg shadow-black/20 transition active:scale-95 disabled:active:scale-100 ${feedback}`}
    >
      {value}
      {visual !== "idle" && (
        <span className="absolute right-1 top-1 text-xl leading-none" aria-hidden>
          {visual === "correct" ? "✅" : "❌"}
        </span>
      )}
    </button>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">🐰</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Number Line Hop</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        A number is missing from the line — tap the tile that fills the gap!
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
      <div className="text-5xl">{newBest ? "🏆" : "🐰"}</div>
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
