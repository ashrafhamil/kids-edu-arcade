"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import TimerBar from "./TimerBar";
import { genRound, durationFor, starsFor, ALL_WORDS, type Round, type RhymeWord } from "./words";

const SLUG = "rhyme-time";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5; // streak multiplier caps here so scores stay sane

const CORRECT_DELAY = 320; // green tick shows, then the next word loads
const MISS_DELAY = 1100; // reveal the correct rhyme — give readers a beat to see it
const OVER_DELAY = 700; // last heart lost -> show the game-over panel

type Phase = "start" | "playing" | "over";
type RoundState = "active" | "resolving";
type ChoiceVisual = "idle" | "correct" | "wrong";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [round, setRound] = useState<Round | null>(null);
  const [roundState, setRoundState] = useState<RoundState>("active");

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [wrongWord, setWrongWord] = useState<string | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [shaking, setShaking] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  // Targets already shown this run — a target won't repeat until all have been seen.
  const usedTargets = useRef<string[]>([]);

  // Build the next round, drawing the target from the not-yet-seen pool and starting a
  // fresh cycle once every word has been a target.
  function makeRound(forCorrectCount: number, avoidWord?: string): Round {
    if (usedTargets.current.length >= ALL_WORDS.length) usedTargets.current = [];
    const r = genRound(forCorrectCount, nextId.current++, usedTargets.current, avoidWord);
    usedTargets.current.push(r.target.word);
    return r;
  }

  // Load the persisted best after mount (SSR-safe) so server and first client render agree.
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

  function loadNext(forCorrectCount: number, avoidWord?: string): void {
    setRound(makeRound(forCorrectCount, avoidWord));
    setWrongWord(null);
    setRevealAnswer(false);
    setShaking(false);
    setFloatGain(0);
    setRoundState("active");
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCorrectCount(0);
    setNewBest(false);
    setWrongWord(null);
    setRevealAnswer(false);
    setShaking(false);
    setFloatGain(0);
    usedTargets.current = [];
    setRound(makeRound(0));
    setRoundState("active");
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

  // Shared miss path for a wrong tap and a timeout: lose a heart, reveal the rhyme,
  // then either end the game or load the next round. Values read inside the scheduled
  // callbacks are snapshotted now (input is locked while resolving, so they can't drift).
  function registerMiss(): void {
    if (!round) return;
    sfx.wrong();
    setCombo(0);
    setFloatGain(0);
    setRevealAnswer(true);
    setShaking(true);

    const remaining = hearts - 1;
    setHearts(remaining);

    const finalScore = score;
    const keepCorrect = correctCount;
    const avoid = round.target.word;
    if (remaining <= 0) {
      schedule(() => endGame(finalScore), OVER_DELAY);
    } else {
      schedule(() => loadNext(keepCorrect, avoid), MISS_DELAY);
    }
  }

  function handleChoice(choice: RhymeWord): void {
    if (phase !== "playing" || roundState !== "active" || !round) return;
    setRoundState("resolving");

    if (choice.word !== round.correct.word) {
      setWrongWord(choice.word);
      registerMiss();
      return;
    }

    sfx.pop();
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo >= 2) sfx.combo(nextCombo);

    const multiplier = Math.min(nextCombo, MAX_MULTIPLIER);
    const points = BASE_POINTS * multiplier + nextCombo; // points x combo, plus a streak bonus
    const nextCorrect = correctCount + 1;
    if (durationFor(nextCorrect) < durationFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    setRevealAnswer(true);

    const avoid = round.target.word;
    schedule(() => loadNext(nextCorrect, avoid), CORRECT_DELAY);
  }

  function handleTimeout(): void {
    if (roundState !== "active") return;
    setRoundState("resolving");
    registerMiss();
  }

  function choiceVisual(choice: RhymeWord): ChoiceVisual {
    if (revealAnswer && round && choice.word === round.correct.word) return "correct";
    if (wrongWord === choice.word) return "wrong";
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

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "start" && <StartPanel onPlay={startGame} />}

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
                🔥 Streak x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          <div
            key={round.id}
            className="flex animate-pop-in flex-col items-center gap-1 rounded-3xl bg-white/95 px-8 py-5 shadow-2xl shadow-black/30"
          >
            <span className="text-7xl leading-none drop-shadow" aria-hidden>
              {round.target.emoji}
            </span>
            <span className="text-4xl font-black tracking-tight text-slate-900">
              {round.target.word}
            </span>
          </div>

          <div className="text-2xl font-black drop-shadow">Which one rhymes?</div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              roundId={round.id}
              durationMs={round.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div
            className={`flex w-full max-w-xs flex-wrap items-stretch justify-center gap-3 ${
              shaking ? "animate-shake" : ""
            }`}
          >
            {round.choices.map((choice, index) => (
              <div
                key={`${round.id}-${choice.word}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <ChoiceTile
                  word={choice.word}
                  emoji={choice.emoji}
                  visual={choiceVisual(choice)}
                  onTap={() => handleChoice(choice)}
                />
                {floatGain > 0 && round.correct.word === choice.word && (
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

function ChoiceTile({
  word,
  emoji,
  visual,
  onTap,
}: {
  word: string;
  emoji: string;
  visual: ChoiceVisual;
  onTap: () => void;
}) {
  const feedback =
    visual === "correct"
      ? "ring-4 ring-lime-400 scale-[1.04]"
      : visual === "wrong"
        ? "ring-4 ring-rose-400 opacity-80"
        : "";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={word}
      className={`relative flex min-h-24 w-32 select-none flex-col items-center justify-center gap-1 rounded-2xl bg-white px-2 py-3 text-slate-900 shadow-lg shadow-black/20 transition active:scale-95 ${feedback}`}
    >
      <span className="text-4xl leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="text-lg font-black tracking-tight">{word}</span>
      {visual !== "idle" && (
        <span className="absolute right-1 top-1 text-xl leading-none" aria-hidden>
          {visual === "correct" ? "✅" : "❌"}
        </span>
      )}
    </button>
  );
}

function StartPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl">🎤</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Rhyme Time</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">Tap the word that rhymes!</p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 lives &middot; ⭐ at 60 / 150 / 300 pts
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
      <div className="text-5xl">{newBest ? "🏆" : "🎤"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-rose-600">{score}</div>
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
