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
  lengthFor,
  levelFor,
  pointsFor,
  starsFor,
  MAX_MULTIPLIER,
  type Round,
} from "./words";

const SLUG = "spell-it";
const START_HEARTS = 3;

/** How long the word stays on screen before it hides. */
const REVEAL_MS = 1500;
/** How long a peek re-shows the word for. */
const PEEK_MS = 1000;

const CORRECT_DELAY = 950;
const WRONG_DELAY = 1700;
const OVER_DELAY = 700;

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

type Phase = "ready" | "playing" | "over";
/** Where the round is: word showing, child typing, or the answer being judged. */
type Stage = "reveal" | "input" | "correct" | "wrong";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [stage, setStage] = useState<Stage>("reveal");
  const [typed, setTyped] = useState<string[]>([]);

  const [peeking, setPeeking] = useState(false);
  const [peeked, setPeeked] = useState(false);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(0);

  const [toast, setToast] = useState("");
  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const prevWord = useRef("");
  const timers = useRef<number[]>([]);
  const resolving = useRef(false);

  // Load the persisted best after mount (SSR-safe).
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Drop the reveal/feedback timeouts if the player leaves mid-round.
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

  /** Show a round's word, then hide it and hand control to the child. */
  function present(next: Round): void {
    setRound(next);
    setTyped([]);
    setStage("reveal");
    setPeeking(false);
    setPeeked(false);
    setFloatGain(0);
    resolving.current = false;
    prevWord.current = next.entry.word;
    schedule(() => setStage("input"), REVEAL_MS);
  }

  function loadNext(correctSoFar: number): void {
    present(genRound(nextId.current++, levelFor(correctSoFar), prevWord.current));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setStreak(0);
    setCorrect(0);
    setToast("");
    setNewBest(false);
    prevWord.current = "";
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

  function announceLevelUp(nextCorrect: number): void {
    schedule(() => sfx.levelUp(), 250);
    setToast(`Level ${levelFor(nextCorrect)} — ${lengthFor(levelFor(nextCorrect))} letters!`);
    schedule(() => setToast(""), CORRECT_DELAY);
  }

  function registerHit(word: string): void {
    const nextStreak = streak + 1;
    const nextCorrect = correct + 1;
    const points = pointsFor(word, nextStreak, peeked);

    sfx.correct();
    if (nextStreak >= 2) sfx.combo(nextStreak);
    setBurst((b) => b + 1);

    setStage("correct");
    setStreak(nextStreak);
    setCorrect(nextCorrect);
    setScore(score + points);
    setFloatGain(points);
    setFloatKey((k) => k + 1);

    if (levelFor(nextCorrect) > levelFor(correct)) announceLevelUp(nextCorrect);
    schedule(() => loadNext(nextCorrect), CORRECT_DELAY);
  }

  function registerMiss(): void {
    sfx.wrong();
    setStage("wrong");
    setStreak(0);

    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(correct), WRONG_DELAY);
    }
  }

  function handleKey(letter: string): void {
    if (stage !== "input" || !round) return;
    if (typed.length >= round.entry.word.length) return;
    sfx.pop();
    // Clamp inside the updater too: two taps in one commit must not overfill the row.
    setTyped((t) => (t.length >= round.entry.word.length ? t : [...t, letter]));
  }

  function handleBackspace(): void {
    if (stage !== "input" || typed.length === 0) return;
    sfx.click();
    setTyped((t) => t.slice(0, -1));
  }

  function handlePeek(): void {
    if (stage !== "input" || peeked) return;
    sfx.click();
    setPeeked(true);
    setPeeking(true);
    schedule(() => setPeeking(false), PEEK_MS);
  }

  function handleSubmit(): void {
    if (stage !== "input" || !round || resolving.current) return;
    if (typed.length !== round.entry.word.length) return;
    resolving.current = true;

    if (typed.join("") === round.entry.word) registerHit(round.entry.word);
    else registerMiss();
  }

  const word = round?.entry.word ?? "";
  const wordVisible = stage === "reveal" || stage === "correct" || stage === "wrong" || peeking;
  const level = levelFor(correct);

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
        <OverPanel
          score={score}
          best={best}
          spelled={correct}
          newBest={newBest}
          onPlay={startGame}
        />
      )}

      {phase === "playing" && round && (
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <StatusLine level={level} streak={streak} toast={toast} />

          <PromptCard
            round={round}
            wordVisible={wordVisible}
            peeking={peeking}
            floatGain={floatGain}
            floatKey={floatKey}
          />

          <SlotRow word={word} typed={typed} stage={stage} />

          <Keyboard keys={round.keys} disabled={stage !== "input"} onTap={handleKey} />

          <ActionRow
            canEdit={stage === "input"}
            canSubmit={stage === "input" && typed.length === word.length}
            canPeek={stage === "input" && !peeked}
            hasTyped={typed.length > 0}
            onPeek={handlePeek}
            onBackspace={handleBackspace}
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </GameShell>
  );
}

/** Level + streak chip row, replaced by the level-up toast when one fires. */
function StatusLine({ level, streak, toast }: { level: number; streak: number; toast: string }) {
  if (toast) {
    return (
      <div className="flex min-h-9 items-center">
        <span className="animate-pop-in rounded-2xl bg-white px-4 py-1.5 text-lg font-black text-blue-700 shadow-xl">
          {toast}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-9 items-center gap-2">
      <span className="rounded-full bg-white/30 px-3 py-1 text-sm font-black">
        Level {level} · {lengthFor(level)} letters
      </span>
      {streak >= 2 && (
        <span
          key={streak}
          className="animate-pop-in rounded-full bg-amber-300 px-3 py-1 text-sm font-black text-amber-950 shadow"
        >
          🔥 x{Math.min(streak, MAX_MULTIPLIER)}
        </span>
      )}
    </div>
  );
}

/**
 * The picture cue, which never leaves, above the word — which only shows during
 * the opening flash, a peek, or the answer reveal. Dots hold the space the rest
 * of the time so the card never jumps.
 */
function PromptCard({
  round,
  wordVisible,
  peeking,
  floatGain,
  floatKey,
}: {
  round: Round;
  wordVisible: boolean;
  peeking: boolean;
  floatGain: number;
  floatKey: number;
}) {
  return (
    <div
      key={round.id}
      className="relative flex w-full animate-pop-in flex-col items-center gap-1 rounded-3xl bg-white/95 px-6 py-4 shadow-2xl shadow-black/30"
    >
      <span className="text-6xl leading-none drop-shadow" aria-hidden>
        {round.entry.emoji}
      </span>

      <div className="flex h-10 items-center">
        {wordVisible ? (
          <span
            className={`text-3xl font-black tracking-[0.2em] text-slate-900 ${
              peeking ? "animate-pop-in" : ""
            }`}
          >
            {round.entry.word}
          </span>
        ) : (
          <span className="text-3xl font-black tracking-[0.3em] text-slate-300" aria-hidden>
            {"•".repeat(round.entry.word.length)}
          </span>
        )}
      </div>

      {floatGain > 0 && (
        <span key={floatKey} className="pointer-events-none absolute left-1/2 top-2 z-10">
          <FloatScore>+{floatGain}</FloatScore>
        </span>
      )}
    </div>
  );
}

/** One box per letter of the answer, filling left-to-right as keys are tapped. */
function SlotRow({ word, typed, stage }: { word: string; typed: string[]; stage: Stage }) {
  const judged = stage === "correct" || stage === "wrong";
  const box =
    word.length >= 7
      ? "h-11 w-9 text-xl"
      : word.length === 6
        ? "h-11 w-10 text-2xl"
        : "h-12 w-11 text-2xl";

  return (
    <div
      className={`flex justify-center gap-1.5 ${stage === "wrong" ? "animate-shake" : ""}`}
      aria-label={`${typed.length} of ${word.length} letters typed`}
    >
      {word.split("").map((answerLetter, index) => {
        const letter = typed[index];
        const isCurrent = !judged && index === typed.length;
        const style = judged
          ? letter === answerLetter
            ? "border-transparent bg-lime-400 text-lime-950"
            : "border-transparent bg-rose-400 text-rose-950"
          : letter
            ? "border-transparent bg-white text-slate-900"
            : isCurrent
              ? "animate-bob border-white bg-white/25 text-white ring-2 ring-white"
              : "border-white/40 bg-white/5 text-white";

        return (
          <span
            key={index}
            className={`flex items-center justify-center rounded-xl border-2 font-black ${box} ${style}`}
          >
            {letter ? <span className="animate-pop-in">{letter}</span> : ""}
          </span>
        );
      })}
    </div>
  );
}

/** The shuffled letter pad. Capped at 12 keys, so it is always 3 rows or fewer. */
function Keyboard({
  keys,
  disabled,
  onTap,
}: {
  keys: string[];
  disabled: boolean;
  onTap: (letter: string) => void;
}) {
  return (
    <div className="flex max-w-[17rem] flex-wrap justify-center gap-2">
      {keys.map((letter, index) => (
        <button
          key={`${letter}-${index}`}
          type="button"
          onClick={() => onTap(letter)}
          disabled={disabled}
          aria-label={`Letter ${letter}`}
          className="flex h-12 w-14 select-none items-center justify-center rounded-2xl text-2xl font-black text-white shadow-md shadow-black/30 ring-2 ring-white/40 transition active:scale-90 disabled:opacity-60"
          style={{ background: KEY_COLORS[index % KEY_COLORS.length] }}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

/** Peek / backspace / check — the three things a child can do besides tap letters. */
function ActionRow({
  canEdit,
  canSubmit,
  canPeek,
  hasTyped,
  onPeek,
  onBackspace,
  onSubmit,
}: {
  canEdit: boolean;
  canSubmit: boolean;
  canPeek: boolean;
  hasTyped: boolean;
  onPeek: () => void;
  onBackspace: () => void;
  onSubmit: () => void;
}) {
  const secondary =
    "flex h-12 min-w-[3.5rem] select-none items-center justify-center rounded-2xl bg-white/30 px-4 text-xl font-black transition active:scale-95 disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPeek}
        disabled={!canPeek}
        aria-label="Peek at the word — this round scores no points"
        className={secondary}
      >
        👀
      </button>
      <button
        type="button"
        onClick={onBackspace}
        disabled={!canEdit || !hasTyped}
        aria-label="Delete last letter"
        className={secondary}
      >
        ⌫
      </button>
      <BigButton onClick={onSubmit} disabled={!canSubmit}>
        ✓ Check
      </BigButton>
    </div>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">✍️</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Spell It</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        A word flashes for a moment, then hides — tap the letters to spell it from memory.
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-500">
        👀 Peek shows it again, but that word scores 0.
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        ❤️❤️❤️ 3 hearts &middot; no timer &middot; ⭐ at 80 / 200 / 400 pts
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
  spelled,
  newBest,
  onPlay,
}: {
  score: number;
  best: number;
  spelled: number;
  newBest: boolean;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl">{newBest ? "🏆" : "✍️"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-blue-700">{score}</div>
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
        points &middot; {spelled} spelled
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
