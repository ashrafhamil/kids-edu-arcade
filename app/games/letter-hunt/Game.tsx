"use client";

import { useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel, FloatScore } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars, setLevel } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import { genRound, levelFor, starsFor, type Round, type Tile } from "./rounds";
import TimerBar from "./TimerBar";

const SLUG = "letter-hunt";
const START_HEARTS = 3;
const BASE_POINTS = 10;
const CLEAR_BONUS = 20;
const MAX_MULTIPLIER = 5;
const COMBO_SOUND_EVERY = 4;

const CLEARED_DELAY = 700;
const MISS_DELAY = 1100;
const OVER_DELAY = 700;
const FLOAT_MS = 800;

type Phase = "ready" | "playing" | "over";
type TileVisual = "idle" | "found" | "wrong" | "missed";
type Float = { id: number; tileId: number; text: string };

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [hearts, setHearts] = useState(START_HEARTS);
  const [combo, setCombo] = useState(0);
  const [level, setLevelState] = useState(0);

  const [found, setFound] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number[]>([]);
  /** True between "round is over" and "next round is on screen": freezes the board. */
  const [resolved, setResolved] = useState(false);
  const [floats, setFloats] = useState<Float[]>([]);
  const [burst, setBurst] = useState(0);
  const [newBest, setNewBest] = useState(false);

  // Authoritative game state. Two taps in the same frame both read these, so the
  // closure copies above are for rendering only.
  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const heartsRef = useRef(START_HEARTS);
  const clearedRef = useRef(0);
  const foundRef = useRef<Set<number>>(new Set());
  /** Tiles already scored this round, so a fast double-tap can never count twice. */
  const handledRef = useRef<Set<number>>(new Set());
  const roundRef = useRef<Round | null>(null);

  const nextId = useRef(1);
  const floatId = useRef(1);
  const timers = useRef<number[]>([]);
  /** Guards round *resolution* only — never individual taps. */
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
    roundRef.current = next;
    foundRef.current = new Set();
    handledRef.current = new Set();
    resolving.current = false;
    setRound(next);
    setFound([]);
    setWrong([]);
    setFloats([]);
    setResolved(false);
  }

  function loadNext(): void {
    const nextLevel = levelFor(clearedRef.current);
    setLevelState(nextLevel);
    present(genRound(nextId.current++, nextLevel, roundRef.current?.target));
  }

  function startGame(): void {
    clearTimers();
    sfx.click();

    scoreRef.current = 0;
    comboRef.current = 0;
    heartsRef.current = START_HEARTS;
    clearedRef.current = 0;
    phaseRef.current = "playing";

    setScore(0);
    setCombo(0);
    setHearts(START_HEARTS);
    setLevelState(0);
    setNewBest(false);
    present(genRound(nextId.current++, 0));
    setPhase("playing");
  }

  function endGame(): void {
    clearTimers();
    phaseRef.current = "over";
    setPhase("over");

    const final = scoreRef.current;
    const isBest = recordBest(SLUG, final);
    setNewBest(isBest);
    setStars(SLUG, starsFor(final));
    if (isBest) {
      setBest(final);
      setBurst((b) => b + 1);
      sfx.win();
    } else {
      sfx.gameOver();
    }
  }

  function addFloat(tileId: number, text: string): void {
    const id = floatId.current++;
    setFloats((list) => [...list, { id, tileId, text }]);
    schedule(() => setFloats((list) => list.filter((f) => f.id !== id)), FLOAT_MS);
  }

  /** All copies found: bank the bonus, ramp the level, queue the next round. */
  function resolveCleared(): void {
    resolving.current = true;
    setResolved(true);
    sfx.correct();

    scoreRef.current += CLEAR_BONUS;
    setScore(scoreRef.current);

    const beforeLevel = levelFor(clearedRef.current);
    clearedRef.current += 1;
    const afterLevel = levelFor(clearedRef.current);
    if (afterLevel > beforeLevel) {
      setLevel(SLUG, afterLevel + 1);
      schedule(() => sfx.levelUp(), 260);
    }

    schedule(loadNext, CLEARED_DELAY);
  }

  /** Timer expired with copies still hidden: show them, take a heart, move on. */
  function resolveTimeout(): void {
    if (phaseRef.current !== "playing" || resolving.current) return;
    resolving.current = true;
    setResolved(true);
    sfx.wrong();

    comboRef.current = 0;
    setCombo(0);
    heartsRef.current -= 1;
    setHearts(Math.max(0, heartsRef.current));

    if (heartsRef.current <= 0) schedule(endGame, OVER_DELAY);
    else schedule(loadNext, MISS_DELAY);
  }

  function registerFind(tile: Tile): void {
    const current = roundRef.current;
    if (!current) return;

    foundRef.current.add(tile.id);
    setFound(Array.from(foundRef.current));

    sfx.pop();
    comboRef.current += 1;
    setCombo(comboRef.current);
    if (comboRef.current % COMBO_SOUND_EVERY === 0) sfx.combo(comboRef.current);

    const points = BASE_POINTS * Math.min(comboRef.current, MAX_MULTIPLIER);
    scoreRef.current += points;
    setScore(scoreRef.current);
    addFloat(tile.id, `+${points}`);

    if (foundRef.current.size >= current.targetCount) resolveCleared();
  }

  /** A wrong tap costs a heart but never ends the round — only the hunt can do that. */
  function registerWrongTap(tile: Tile): void {
    sfx.wrong();
    comboRef.current = 0;
    setCombo(0);
    setWrong((list) => [...list, tile.id]);

    heartsRef.current -= 1;
    setHearts(Math.max(0, heartsRef.current));
    if (heartsRef.current > 0) return;

    resolving.current = true;
    setResolved(true);
    schedule(endGame, OVER_DELAY);
  }

  function handleTap(tile: Tile): void {
    if (phaseRef.current !== "playing" || resolving.current) return;
    if (handledRef.current.has(tile.id)) return;
    handledRef.current.add(tile.id);
    if (tile.isTarget) registerFind(tile);
    else registerWrongTap(tile);
  }

  function tileVisual(tile: Tile): TileVisual {
    if (found.includes(tile.id)) return "found";
    if (wrong.includes(tile.id)) return "wrong";
    if (resolved && tile.isTarget) return "missed";
    return "idle";
  }

  const remaining = round ? round.targetCount - found.length : 0;
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
          <div className="flex min-h-[2.25rem] items-center justify-center gap-2">
            <div className="rounded-full bg-white/25 px-4 py-1 text-base font-black tabular-nums">
              🎚 {level + 1}
            </div>
            {combo >= 2 && (
              <div
                key={combo}
                className="animate-pop-in rounded-full bg-amber-300 px-4 py-1 text-base font-black text-amber-950 shadow-md"
              >
                🔥 x{Math.min(combo, MAX_MULTIPLIER)}
              </div>
            )}
          </div>

          <TargetCard round={round} />

          <RemainingCounter total={round.targetCount} remaining={remaining} />

          <div className="w-full max-w-xs px-2">
            <TimerBar
              questionId={round.id}
              durationMs={round.durationMs}
              paused={resolved}
              onTimeout={resolveTimeout}
            />
          </div>

          <div
            className={`grid w-full max-w-xs gap-2.5 ${
              round.columns === 4 ? "grid-cols-4" : "grid-cols-3"
            }`}
          >
            {round.tiles.map((tile, index) => (
              <div key={`${round.id}-${tile.id}`} className="relative">
                <LetterTile
                  glyph={tile.glyph}
                  visual={tileVisual(tile)}
                  index={index}
                  onTap={() => handleTap(tile)}
                />
                {floats
                  .filter((f) => f.tileId === tile.id)
                  .map((f) => (
                    <span
                      key={f.id}
                      className="pointer-events-none absolute left-1/2 top-1/4 z-10 -translate-x-1/2"
                      aria-hidden
                    >
                      <FloatScore>{f.text}</FloatScore>
                    </span>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}

/** The letter being hunted, plus its lowercase twin once both cases count. */
function TargetCard({ round }: { round: Round }) {
  return (
    <div
      key={round.id}
      className="flex animate-pop-in items-end justify-center gap-3 rounded-3xl bg-white/95 px-10 py-3 shadow-2xl shadow-black/30"
    >
      {round.targetGlyphs.map((glyph) => (
        <span key={glyph} className="text-6xl font-black leading-none text-slate-900">
          {glyph}
        </span>
      ))}
    </div>
  );
}

/** How many copies are still hidden: a numeral plus one pip per copy. */
function RemainingCounter({ total, remaining }: { total: number; remaining: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${remaining} of ${total} left`}>
      <span className="min-w-10 rounded-full bg-white/25 px-3 py-1 text-2xl font-black tabular-nums">
        {remaining}
      </span>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${
              i < total - remaining ? "bg-lime-300" : "bg-white/35"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function LetterTile({
  glyph,
  visual,
  index,
  onTap,
}: {
  glyph: string;
  visual: TileVisual;
  index: number;
  onTap: () => void;
}) {
  const skin =
    visual === "found"
      ? "bg-lime-300 text-lime-950 ring-4 ring-lime-100"
      : visual === "wrong"
        ? "bg-rose-200 text-rose-900 opacity-70 ring-4 ring-rose-400 animate-shake"
        : visual === "missed"
          ? "bg-white text-slate-900 ring-4 ring-amber-400 animate-bob"
          : "bg-white text-slate-900";

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={visual !== "idle"}
      aria-label={glyph}
      className={`relative flex aspect-square min-h-16 w-full animate-pop-in select-none items-center justify-center rounded-2xl text-4xl font-black shadow-lg shadow-black/20 transition active:scale-95 disabled:active:scale-100 ${skin}`}
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      {glyph}
      {visual === "found" && (
        <span className="absolute right-1 top-1 text-base leading-none" aria-hidden>
          ✅
        </span>
      )}
    </button>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob" aria-hidden>
        🔠
      </div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Letter Hunt</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        One letter shows up big — tap every copy of it in the grid before the bar runs out.
        Later on, small letters count too!
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
      <div className="text-5xl" aria-hidden>
        {newBest ? "🏆" : "🔠"}
      </div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">Game Over</h2>
      <div className="mt-3 text-5xl font-black tabular-nums text-green-600">{score}</div>
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
