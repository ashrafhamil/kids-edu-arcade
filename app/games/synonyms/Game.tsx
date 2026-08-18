"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars, setLevel } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, levelFor, starsFor, PROMPTABLE_WORDS, type Round, type SynWord } from "./rounds";
import TimerBar from "./TimerBar";

const SLUG = "synonyms";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const MAX_MULTIPLIER = 5; // streak multiplier caps here so scores stay sane
const COMBO_CHIME_EVERY = 4; // sfx.combo fires each time the streak hits a multiple of this

const CORRECT_DELAY = 320; // green tick shows, then the next word loads
const MISS_DELAY = 1100; // reveal the true synonym — give readers a beat to see it
const OVER_DELAY = 700; // last heart lost -> show the game-over panel

/** Words past this length drop a size so they never overflow a tile on a 360px phone. */
const LONG_WORD_CHARS = 7;

type Phase = "ready" | "playing" | "over";
type RoundState = "active" | "resolving";
type ChoiceVisual = "idle" | "correct" | "wrong";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [roundState, setRoundState] = useState<RoundState>("active");

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const [wrongWord, setWrongWord] = useState<string | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  // Prompts already shown this run — a prompt won't repeat until all have been seen.
  const usedPrompts = useRef<string[]>([]);
  // Synchronous lock so a round resolves exactly once, even against a timer deadline
  // firing in the same tick a tap was already processed.
  const resolving = useRef(false);

  // Build the next round, drawing the prompt from the not-yet-seen pool and starting a
  // fresh cycle once every promptable word has been a prompt.
  function makeRound(forCorrectCount: number, avoidWord?: string): Round {
    if (usedPrompts.current.length >= PROMPTABLE_WORDS.length) usedPrompts.current = [];
    const next = genRound(
      levelFor(forCorrectCount),
      nextId.current++,
      usedPrompts.current,
      avoidWord,
    );
    usedPrompts.current.push(next.prompt.word);
    return next;
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
    setFloatGain(0);
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
    setWrongWord(null);
    setRevealAnswer(false);
    setFloatGain(0);
    usedPrompts.current = [];
    setRound(makeRound(0));
    setRoundState("active");
    resolving.current = false;
    setPhase("playing");
  }

  function endGame(finalScore: number, finalCorrect: number): void {
    setPhase("over");
    const isBest = recordBest(SLUG, finalScore);
    setNewBest(isBest);
    setStars(SLUG, starsFor(finalScore));
    setLevel(SLUG, levelFor(finalCorrect));
    if (isBest) {
      setBest(finalScore);
      setBurst((b) => b + 1);
      sfx.win();
    } else {
      sfx.gameOver();
    }
  }

  // A wrong tap and a timeout cost the same: reveal the true synonym, lose a heart, and
  // either end the run or move on. `tappedWord` is null when the timer ran out.
  function registerMiss(tappedWord: string | null, prevPrompt: string): void {
    sfx.wrong();
    setWrongWord(tappedWord);
    setRevealAnswer(true);
    setCombo(0);

    const remaining = hearts - 1;
    setHearts(remaining);

    // Snapshotted now — input stays locked while resolving, so these can't drift.
    const finalScore = score;
    const keepCorrect = correctCount;
    if (remaining <= 0) {
      schedule(() => endGame(finalScore, keepCorrect), OVER_DELAY);
    } else {
      schedule(() => loadNext(keepCorrect, prevPrompt), MISS_DELAY);
    }
  }

  function registerHit(prevPrompt: string): void {
    sfx.correct();
    const nextCombo = combo + 1;
    if (nextCombo % COMBO_CHIME_EVERY === 0) sfx.combo(nextCombo);

    const points = BASE_POINTS * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextCorrect = correctCount + 1;
    if (levelFor(nextCorrect) > levelFor(correctCount)) sfx.levelUp();

    setCombo(nextCombo);
    setScore((s) => s + points);
    setCorrectCount(nextCorrect);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    setRevealAnswer(true);

    schedule(() => loadNext(nextCorrect, prevPrompt), CORRECT_DELAY);
  }

  function lockRound(): boolean {
    if (phase !== "playing" || roundState !== "active" || !round || resolving.current) {
      return false;
    }
    resolving.current = true;
    setRoundState("resolving");
    return true;
  }

  function handleChoice(choice: SynWord): void {
    if (!round || !lockRound()) return;
    if (choice.word === round.correct.word) registerHit(round.prompt.word);
    else registerMiss(choice.word, round.prompt.word);
  }

  function handleTimeout(): void {
    if (!round || !lockRound()) return;
    registerMiss(null, round.prompt.word);
  }

  function choiceVisual(choice: SynWord): ChoiceVisual {
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
      <Confetti fire={burst} count={28} />

      {phase === "ready" && <ReadyPanel onPlay={startGame} />}

      {phase === "over" && (
        <OverPanel score={score} best={best} newBest={newBest} onPlay={startGame} />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex min-h-[2.25rem] flex-wrap items-center justify-center gap-2">
            <div className="rounded-full bg-white/25 px-3 py-1 text-sm font-black uppercase tracking-wide">
              Level {round.level}
            </div>
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
            className="flex w-full max-w-xs animate-pop-in items-center justify-center rounded-3xl bg-white/95 px-6 py-5 shadow-2xl shadow-black/30"
          >
            <span className="break-words text-center text-4xl font-black tracking-tight text-slate-900">
              {round.prompt.word}
            </span>
          </div>

          <div className="text-2xl font-black drop-shadow">Which means the same?</div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id}
              durationMs={round.durationMs}
              paused={roundState !== "active"}
              onTimeout={handleTimeout}
            />
          </div>

          <div className="grid w-full max-w-xs grid-cols-2 gap-3">
            {round.choices.map((choice, index) => (
              <div
                key={`${round.id}-${choice.word}`}
                className="relative animate-pop-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <ChoiceTile
                  word={choice.word}
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
  visual,
  onTap,
}: {
  word: string;
  visual: ChoiceVisual;
  onTap: () => void;
}) {
  const feedback =
    visual === "correct"
      ? "ring-4 ring-lime-400 scale-[1.04]"
      : visual === "wrong"
        ? "ring-4 ring-rose-400 opacity-80 animate-shake"
        : "";
  const wordSize = word.length > LONG_WORD_CHARS ? "text-base" : "text-xl";

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={word}
      className={`relative flex min-h-16 w-full select-none items-center justify-center rounded-2xl bg-white px-3 py-3 text-slate-900 shadow-lg shadow-black/20 transition active:scale-95 ${feedback}`}
    >
      <span className={`break-words text-center font-black leading-tight ${wordSize}`}>{word}</span>
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
      <div className="animate-bob text-6xl">💬</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Synonyms</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Read the word, then tap the one that means the same.
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
      <div className="text-5xl">{newBest ? "🏆" : "💬"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-violet-600">{score}</div>
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
