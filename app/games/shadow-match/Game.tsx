"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, choiceCountFor, starsFor, type Round } from "./rounds";

const SLUG = "shadow-match";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4; // chime when the streak hits a multiple of 4

const CORRECT_DELAY = 620; // let the color reveal + pop play before the next shadow
const WRONG_DELAY = 900; // shake plays, child re-reads the shadow
const OVER_DELAY = 700; // last heart lost -> show the game-over panel

const meta = getGame(SLUG);

type Phase = "ready" | "playing" | "over";
type RoundState = "active" | "resolving";

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [roundState, setRoundState] = useState<RoundState>("active");

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);

  const [chosen, setChosen] = useState<string | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const [lastPoints, setLastPoints] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  // Synchronous lock so a round resolves exactly once, even against a same-frame
  // double-tap or a scheduled callback firing in the commit gap.
  const resolving = useRef(false);

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

  function present(next: Round): void {
    setRound(next);
    setChosen(null);
    setLastCorrect(false);
    setShaking(false);
    setRoundState("active");
    resolving.current = false;
  }

  // `forScore` is threaded explicitly so the choice count reflects the score
  // *after* the answer that triggered this load, not the stale render value.
  function loadNext(forScore: number, avoidAnswer: string): void {
    present(genRound(nextId.current++, forScore, avoidAnswer));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setNewBest(false);
    setLastPoints(0);
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

  function registerMiss(currentScore: number, prevAnswer: string): void {
    sfx.wrong();
    setCombo(0);
    setShaking(true);
    setShakeKey((k) => k + 1);
    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(currentScore), OVER_DELAY);
    } else {
      schedule(() => loadNext(currentScore, prevAnswer), WRONG_DELAY);
    }
  }

  function handleChoice(choice: string): void {
    if (phase !== "playing" || !round || resolving.current) return;
    resolving.current = true;
    setRoundState("resolving");
    setChosen(choice);

    if (choice !== round.answer) {
      setLastCorrect(false);
      registerMiss(score, round.answer);
      return;
    }

    sfx.pop();
    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextScore = score + points;
    if (choiceCountFor(nextScore) > choiceCountFor(score)) sfx.levelUp();

    setLastCorrect(true);
    setCombo(nextCombo);
    setScore(nextScore);
    setLastPoints(points);
    setFloatKey((k) => k + 1);
    schedule(() => loadNext(nextScore, round.answer), CORRECT_DELAY);
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

  const resolved = roundState === "resolving";
  const revealColor = resolved && lastCorrect; // solid black -> full color on a win

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={28} />

      {phase === "ready" && <ReadyPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full flex-col items-center gap-5">
          <div className="flex min-h-[2.25rem] items-center">
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
            Whose shadow is this? 🔦
          </div>

          <div className="relative flex justify-center">
            <div
              key={`${round.id}-${shakeKey}`}
              className={`flex h-40 w-40 items-center justify-center rounded-3xl bg-white/95 shadow-2xl shadow-black/30 ${
                shaking ? "animate-shake" : "animate-pop-in"
              }`}
            >
              <span
                className="text-8xl leading-none"
                style={revealColor ? undefined : { filter: "brightness(0)" }}
                aria-hidden
              >
                {round.answer}
              </span>
            </div>
            {revealColor && (
              <span
                key={floatKey}
                className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
              >
                <FloatScore>+{lastPoints}</FloatScore>
              </span>
            )}
          </div>

          <div
            className={`grid w-full max-w-xs gap-3 ${
              round.choices.length === 4 ? "grid-cols-4" : "grid-cols-3"
            }`}
          >
            {round.choices.map((choice, index) => (
              <ChoiceButton
                key={`${round.id}-${index}`}
                index={index}
                choice={choice}
                answer={round.answer}
                resolved={resolved}
                chosen={chosen}
                onPick={handleChoice}
              />
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** One tappable emoji, highlighted green/red once the round resolves. */
function ChoiceButton({
  index,
  choice,
  answer,
  resolved,
  chosen,
  onPick,
}: {
  index: number;
  choice: string;
  answer: string;
  resolved: boolean;
  chosen: string | null;
  onPick: (choice: string) => void;
}) {
  const isAnswer = choice === answer;
  const state = !resolved
    ? ""
    : isAnswer
      ? "scale-105 ring-8 ring-lime-400"
      : choice === chosen
        ? "scale-95 opacity-70 ring-8 ring-rose-400"
        : "opacity-40";
  return (
    <button
      type="button"
      onClick={() => onPick(choice)}
      disabled={resolved}
      aria-label={`Pick ${choice}`}
      className={`flex min-h-16 items-center justify-center rounded-2xl bg-white p-2 text-4xl leading-none shadow-lg shadow-black/20 transition-all duration-200 animate-pop-in active:scale-95 disabled:active:scale-100 ${state}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <span aria-hidden>{choice}</span>
    </button>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">🔦</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Shadow Match</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        A black shadow appears up top. Tap the picture below that makes that exact
        shadow. Keep a streak going for bonus points!
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
      <div className="text-5xl">{newBest ? "🏆" : "🔦"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-slate-800">{score}</div>
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
