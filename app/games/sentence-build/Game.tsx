"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, starsFor, levelFor, lengthFor, type Round, type Tile } from "./sentences";
import TimerBar from "./TimerBar";

const SLUG = "sentence-build";
const START_HEARTS = 3;
const POINTS_PER_WORD = 3;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CORRECT_DELAY = 750; // sentence turns green -> next sentence loads
const WRONG_DELAY = 1800; // long enough to read the revealed correct order
const OVER_DELAY = 900; // last heart lost -> show the game-over panel

type Phase = "ready" | "playing" | "over";
type Verdict = "correct" | "wrong" | null;

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  /** Tile keys on the sentence line, in the order the child placed them. */
  const [placedKeys, setPlacedKeys] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict>(null);
  // True only while a verdict is showing. Tapping words back and forth before the
  // line is full is never locked — that is how the child rearranges.
  const [locked, setLocked] = useState(false);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [completed, setCompleted] = useState(0);

  const [floatGain, setFloatGain] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  // Synchronous lock mirroring `locked`, so a timeout deadline firing in the same tick
  // the last word was placed can never double-resolve the sentence.
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

  function present(next: Round): void {
    setRound(next);
    setPlacedKeys([]);
    setVerdict(null);
    setLocked(false);
    setFloatGain(0);
    resolving.current = false;
  }

  function loadNext(forCompleted: number, avoidText: string): void {
    present(genRound(nextId.current++, forCompleted, avoidText));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();
    setScore(0);
    setHearts(START_HEARTS);
    setCombo(0);
    setCompleted(0);
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

  function registerCorrect(activeRound: Round): void {
    sfx.pop();
    sfx.correct();
    setVerdict("correct");
    setLocked(true);
    resolving.current = true;

    const nextCombo = combo + 1;
    if (nextCombo % COMBO_SOUND_EVERY === 0) sfx.combo(nextCombo);
    const points =
      activeRound.sentence.words.length * POINTS_PER_WORD * Math.min(nextCombo, MAX_MULTIPLIER);
    const nextScore = score + points;
    const nextCompleted = completed + 1;
    if (lengthFor(levelFor(nextCompleted)) > lengthFor(levelFor(completed))) sfx.levelUp();

    setCombo(nextCombo);
    setScore(nextScore);
    setCompleted(nextCompleted);
    setFloatGain(points);
    setFloatKey((k) => k + 1);
    schedule(() => loadNext(nextCompleted, activeRound.sentence.text), CORRECT_DELAY);
  }

  // A wrong order and a timeout cost the same: one heart, the correct order shown, then
  // a fresh sentence — so a sentence the child cannot crack never eats all three hearts.
  function registerMiss(activeRound: Round): void {
    sfx.wrong();
    setCombo(0);
    setVerdict("wrong");
    setLocked(true);
    resolving.current = true;

    const remaining = hearts - 1;
    setHearts(remaining);
    if (remaining <= 0) {
      schedule(() => endGame(score), OVER_DELAY);
    } else {
      schedule(() => loadNext(completed, activeRound.sentence.text), WRONG_DELAY);
    }
  }

  /** Judge only once every word is on the line, comparing the read-out sentence. */
  function judge(keys: string[], activeRound: Round): void {
    const built = keys.map((key) => wordFor(activeRound, key)).join(" ");
    if (built === activeRound.sentence.text) registerCorrect(activeRound);
    else registerMiss(activeRound);
  }

  function handleTapPool(tile: Tile): void {
    if (phase !== "playing" || !round || locked || placedKeys.includes(tile.key)) return;
    sfx.click();
    const nextPlaced = [...placedKeys, tile.key];
    setPlacedKeys(nextPlaced);
    if (nextPlaced.length === round.tiles.length) judge(nextPlaced, round);
  }

  function handleTapPlaced(key: string): void {
    if (phase !== "playing" || locked) return;
    sfx.click();
    setPlacedKeys((prev) => prev.filter((k) => k !== key));
  }

  function handleTimeout(): void {
    if (phase !== "playing" || !round || locked || resolving.current) return;
    registerMiss(round);
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
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <div className="relative flex min-h-[2.25rem] items-center justify-center">
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 Combo x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
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

          <div className="text-center text-2xl font-black drop-shadow sm:text-3xl">
            Tap the words in order! 📝
          </div>

          <SentenceLine
            round={round}
            placedKeys={placedKeys}
            verdict={verdict}
            onTapPlaced={handleTapPlaced}
          />

          <div className="min-h-6 text-center text-sm font-bold text-white/90">
            {verdict === "wrong" && <span>✅ {round.sentence.text}</span>}
          </div>

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id}
              durationMs={round.durationMs}
              paused={locked}
              onTimeout={handleTimeout}
            />
          </div>

          <WordPool
            round={round}
            placedKeys={placedKeys}
            disabled={locked}
            onTapPool={handleTapPool}
          />
        </div>
      )}
    </GameShell>
  );
}

/** The word a tile carries, or "" if the key is not in this round. */
function wordFor(round: Round, key: string): string {
  return round.tiles.find((tile) => tile.key === key)?.word ?? "";
}

const TILE_BASE =
  "flex min-h-12 min-w-12 select-none items-center justify-center rounded-xl px-3 py-2 text-lg font-black shadow-lg shadow-black/20 transition active:scale-95 disabled:active:scale-100";

/** The line being built. Placed words tap back to the pool; empty slots show as dashes. */
function SentenceLine({
  round,
  placedKeys,
  verdict,
  onTapPlaced,
}: {
  round: Round;
  placedKeys: string[];
  verdict: Verdict;
  onTapPlaced: (key: string) => void;
}) {
  const remaining = round.tiles.length - placedKeys.length;
  const frame =
    verdict === "correct"
      ? "border-lime-400 bg-lime-400/20"
      : verdict === "wrong"
        ? "border-rose-400 bg-rose-400/20 animate-shake"
        : "border-white/40 bg-white/10";

  return (
    <div
      className={`flex min-h-24 w-full flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 ${frame}`}
    >
      {placedKeys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onTapPlaced(key)}
          disabled={verdict !== null}
          aria-label={`Remove ${wordFor(round, key)}`}
          className={`${TILE_BASE} animate-pop-in bg-amber-200 text-amber-950`}
        >
          {wordFor(round, key)}
        </button>
      ))}
      {Array.from({ length: remaining }, (_, i) => (
        <span
          key={`slot-${i}`}
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-white/40 text-xl font-black text-white/40"
        >
          _
        </span>
      ))}
    </div>
  );
}

/**
 * The scrambled words. A placed word keeps its slot as a faded ghost so the pool never
 * reflows under the child's finger mid-sentence.
 */
function WordPool({
  round,
  placedKeys,
  disabled,
  onTapPool,
}: {
  round: Round;
  placedKeys: string[];
  disabled: boolean;
  onTapPool: (tile: Tile) => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2">
      {round.tiles.map((tile, index) => {
        const placed = placedKeys.includes(tile.key);
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onTapPool(tile)}
            disabled={disabled || placed}
            aria-hidden={placed}
            aria-label={`Place ${tile.word}`}
            style={{ animationDelay: `${index * 0.04}s` }}
            className={`${TILE_BASE} animate-pop-in bg-white text-slate-900 ${
              placed ? "opacity-20" : ""
            }`}
          >
            {tile.word}
          </button>
        );
      })}
    </div>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">📝</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Sentence Build</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        The words are jumbled — tap them in order to build the sentence. Tap a word on the
        line to send it back. The capital letter starts it, the full stop ends it!
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
      <div className="text-5xl">{newBest ? "🏆" : "📝"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-teal-700">{score}</div>
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
