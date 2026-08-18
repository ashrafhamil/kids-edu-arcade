"use client";

import { useEffect, useMemo, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, Panel, StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import {
  getBest,
  getLevel,
  loadJSON,
  recordBest,
  saveJSON,
  setLevel,
  setStars,
} from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  blankCanvas,
  colorOf,
  EMPTY,
  flatten,
  isComplete,
  matchPercent,
  nameOf,
  PALETTE,
  pictureFor,
  starsFor,
  starsForPicture,
  TOTAL_PICTURES,
  type Picture,
  type Swatch,
} from "./pictures";

const SLUG = "pixel-copy";
/** Persisted `{ pictureId: fewest mistakes }` for every finished picture. */
const RESULTS_KEY = "pixel-copy:results";

/** Fewest mistakes ever made on each finished picture. */
type Results = Record<string, number>;

type Phase = "ready" | "playing" | "cleared" | "over";

const meta = getGame(SLUG);

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [levelIndex, setLevelIndex] = useState(0);
  const [canvas, setCanvas] = useState<number[]>(() => blankCanvas(pictureFor(0)));
  const [brush, setBrush] = useState(PALETTE[0].index);
  const [mistakes, setMistakes] = useState(0);

  const [results, setResults] = useState<Results>({});
  /** Highest 1-based level unlocked, mirroring `getLevel`. */
  const [highestLevel, setHighestLevel] = useState(1);
  const [best, setBest] = useState(0);
  const [burst, setBurst] = useState(0);

  // Read persisted progress after mount so the server render stays deterministic.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = getLevel(SLUG);
      setHighestLevel(stored);
      setResults(loadJSON<Results>(RESULTS_KEY, {}));
      setBest(getBest(SLUG));
      const resumeIndex = Math.min(stored - 1, TOTAL_PICTURES - 1);
      setLevelIndex(resumeIndex);
      setCanvas(blankCanvas(pictureFor(resumeIndex)));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const picture: Picture = pictureFor(levelIndex);
  const target = useMemo(() => flatten(picture), [picture]);
  const percent = matchPercent(canvas, target);
  const unlockedCount = Math.min(highestLevel, TOTAL_PICTURES);
  const clearedCount = Object.keys(results).length;
  const flawlessCount = Object.values(results).filter((m) => m === 0).length;

  function openLevel(index: number): void {
    const next = pictureFor(index);
    setLevelIndex(index);
    setCanvas(blankCanvas(next));
    setMistakes(0);
    setPhase("playing");
  }

  function startGame(): void {
    sfx.click();
    openLevel(Math.min(highestLevel - 1, TOTAL_PICTURES - 1));
  }

  function jumpToLevel(index: number): void {
    if (index >= unlockedCount || index === levelIndex) return;
    sfx.click();
    openLevel(index);
  }

  function nextLevel(): void {
    sfx.click();
    openLevel(levelIndex + 1);
  }

  function restartBook(): void {
    sfx.click();
    openLevel(0);
  }

  function clearCanvas(): void {
    if (canvas.every((v) => v === EMPTY)) return;
    sfx.click();
    setCanvas(blankCanvas(picture));
  }

  function selectBrush(index: number): void {
    sfx.click();
    setBrush(index);
  }

  /** Bank the finished picture: progress, best level, hub stars, celebration. */
  function finishPicture(finalMistakes: number): void {
    const previous = results[picture.id];
    const nextResults: Results = {
      ...results,
      [picture.id]: previous === undefined ? finalMistakes : Math.min(previous, finalMistakes),
    };
    setResults(nextResults);
    saveJSON(RESULTS_KEY, nextResults);

    const levelNumber = levelIndex + 1;
    setLevel(SLUG, levelNumber + 1); // unlock the next picture
    setHighestLevel((h) => Math.max(h, levelNumber + 1));
    if (recordBest(SLUG, levelNumber)) setBest(levelNumber);

    const cleared = Object.keys(nextResults).length;
    const flawless = Object.values(nextResults).filter((m) => m === 0).length;
    setStars(SLUG, starsFor(cleared, flawless));

    setBurst((b) => b + 1);
    const isLast = levelIndex === TOTAL_PICTURES - 1;
    if (isLast) sfx.win();
    else sfx.levelUp();
    setPhase(isLast ? "over" : "cleared");
  }

  /** Paint a square, or wipe it when it already holds the chosen colour. */
  function paintSquare(cellIndex: number): void {
    if (phase !== "playing") return;
    const value = canvas[cellIndex] === brush ? EMPTY : brush;
    const nextCanvas = canvas.map((v, i) => (i === cellIndex ? value : v));
    setCanvas(nextCanvas);
    sfx.pop();

    const nextMistakes =
      value !== EMPTY && value !== target[cellIndex] ? mistakes + 1 : mistakes;
    setMistakes(nextMistakes);

    if (isComplete(nextCanvas, target)) finishPicture(nextMistakes);
  }

  const liveStats = (
    <>
      <StatBadge label="Level" value={`${levelIndex + 1}/${TOTAL_PICTURES}`} />
      <StatBadge label="Match" value={`${percent}%`} />
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      {phase === "ready" && (
        <ReadyPanel
          stars={starsFor(clearedCount, flawlessCount)}
          cleared={clearedCount}
          onPlay={startGame}
        />
      )}

      {phase === "cleared" && (
        <ClearedPanel picture={picture} mistakes={mistakes} onNext={nextLevel} />
      )}

      {phase === "over" && (
        <OverPanel
          cleared={clearedCount}
          flawless={flawlessCount}
          onPlayAgain={restartBook}
        />
      )}

      {phase === "playing" && (
        <div className="flex w-full max-w-[20.5rem] flex-col items-center gap-3">
          <div className="flex w-full items-center gap-3">
            <ReferenceBoard picture={picture} />
            <div className="flex flex-1 flex-col items-start gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-2xl leading-none" aria-hidden>
                  {picture.emoji}
                </span>
                <h2 className="text-xl font-black tracking-tight">{picture.name}</h2>
              </div>
              <MatchMeter percent={percent} />
            </div>
          </div>

          <PixelBoard picture={picture} canvas={canvas} onPaint={paintSquare} />

          <BrushBar brush={brush} />

          <Palette brush={brush} onSelect={selectBrush} />

          <button
            type="button"
            onClick={clearCanvas}
            disabled={canvas.every((v) => v === EMPTY)}
            className="min-h-11 w-full select-none rounded-2xl bg-white/30 px-4 text-lg font-black tracking-tight transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            🧽 Start over
          </button>

          <PictureStrip
            levelIndex={levelIndex}
            unlockedCount={unlockedCount}
            results={results}
            onOpen={jumpToLevel}
          />
        </div>
      )}
    </GameShell>
  );
}

/** Shared square styling so the reference and the working board always agree. */
function squareStyle(value: number): { background: string; boxShadow: string } {
  return {
    background: colorOf(value),
    boxShadow:
      value === EMPTY
        ? "inset 0 0 0 1px #cbd5e1"
        : "inset 0 0 0 1px rgba(255, 255, 255, 0.55)",
  };
}

function gridColumns(size: number): { gridTemplateColumns: string } {
  return { gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` };
}

/** The picture to copy: small, static, and numbered so the colours can be read
 *  without relying on colour vision. */
function ReferenceBoard({ picture }: { picture: Picture }) {
  return (
    <div className="shrink-0">
      <div
        className="grid w-[11rem] overflow-hidden rounded-xl ring-4 ring-white/80"
        style={gridColumns(picture.size)}
        role="img"
        aria-label={`${picture.name} pixel picture to copy`}
      >
        {picture.grid.flat().map((value, i) => (
          <span
            key={i}
            className="flex aspect-square items-center justify-center text-[0.55rem] font-black leading-none"
            style={{ ...squareStyle(value), color: value === EMPTY ? "transparent" : PALETTE[value - 1].ink }}
          >
            {value === EMPTY ? "" : value}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-[0.6rem] font-bold uppercase tracking-widest text-white/80">
        Copy this
      </p>
    </div>
  );
}

/** The child's canvas. Squares are the largest the phone allows: at a 328px
 *  board a 10×10 picture still gives ~32px per square. */
function PixelBoard({
  picture,
  canvas,
  onPaint,
}: {
  picture: Picture;
  canvas: number[];
  onPaint: (cellIndex: number) => void;
}) {
  return (
    <div
      className="grid w-full overflow-hidden rounded-2xl bg-white ring-4 ring-white shadow-2xl shadow-black/30"
      style={gridColumns(picture.size)}
    >
      {canvas.map((value, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPaint(i)}
          aria-label={`Row ${Math.floor(i / picture.size) + 1}, column ${(i % picture.size) + 1}, ${nameOf(value)}`}
          className="aspect-square select-none transition-colors duration-100 active:brightness-90"
          style={squareStyle(value)}
        />
      ))}
    </div>
  );
}

/** Live match bar. The exact number lives in the "Match" badge up in the shell,
 *  so this stays a wordless progress cue and leaves room for the reference. */
function MatchMeter({ percent }: { percent: number }) {
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-white/30"
      role="progressbar"
      aria-label="Match with the picture"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-white transition-[width] duration-200"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function BrushBar({ brush }: { brush: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/25 px-4 py-1.5 shadow-md">
      <span className="text-lg leading-none" aria-hidden>
        🖌️
      </span>
      <span className="text-sm font-black uppercase tracking-wide">{nameOf(brush)}</span>
      <span
        className="h-5 w-5 rounded-full border-2 border-white/80"
        style={{ background: colorOf(brush) }}
        aria-hidden
      />
    </div>
  );
}

function Palette({
  brush,
  onSelect,
}: {
  brush: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="grid w-full grid-cols-4 gap-2">
      {PALETTE.map((swatch) => (
        <ColorSwatch
          key={swatch.index}
          swatch={swatch}
          active={brush === swatch.index}
          onSelect={() => onSelect(swatch.index)}
        />
      ))}
    </div>
  );
}

function ColorSwatch({
  swatch,
  active,
  onSelect,
}: {
  swatch: Swatch;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={swatch.name}
      className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 shadow-md transition active:scale-90 ${
        active ? "ring-4 ring-white scale-105" : "ring-2 ring-white/50"
      }`}
      style={{ background: swatch.hex, color: swatch.ink }}
    >
      <span className="text-sm font-black leading-none">{swatch.index}</span>
      <span className="text-[0.65rem] font-bold uppercase leading-none tracking-wide">
        {swatch.name}
      </span>
    </button>
  );
}

function PictureStrip({
  levelIndex,
  unlockedCount,
  results,
  onOpen,
}: {
  levelIndex: number;
  unlockedCount: number;
  results: Results;
  onOpen: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {Array.from({ length: TOTAL_PICTURES }, (_, i) => {
        const pic = pictureFor(i);
        const locked = i >= unlockedCount;
        const done = results[pic.id] !== undefined;
        return (
          <button
            key={pic.id}
            type="button"
            onClick={() => onOpen(i)}
            disabled={locked}
            aria-label={`${pic.name}${done ? " (finished)" : locked ? " (locked)" : ""}`}
            aria-current={i === levelIndex ? "true" : undefined}
            className={`relative flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition active:scale-90 ${
              locked ? "bg-white/10 opacity-60" : "bg-white/25"
            } ${i === levelIndex ? "ring-4 ring-white" : "ring-2 ring-white/30"}`}
          >
            <span aria-hidden>{locked ? "🔒" : pic.emoji}</span>
            {done && (
              <span
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[0.6rem] text-white shadow"
                aria-hidden
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ReadyPanel({
  stars,
  cleared,
  onPlay,
}: {
  stars: number;
  cleared: number;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">🖼️</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Pixel Copy</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Pick a colour, then tap the big grid to copy the little picture square by
        square. Tap a square again with the same colour to wipe it.
      </p>
      <p className="mt-3 text-sm font-bold text-slate-500">
        🖌️ No timer &middot; ⭐⭐⭐ for a picture with zero wrong squares
      </p>
      <div className="mt-3 flex justify-center">
        <StarRow value={stars} />
      </div>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>▶ Play</BigButton>
      </div>
      {cleared > 0 && (
        <p className="mt-3 text-sm font-bold text-slate-500">
          {cleared} of {TOTAL_PICTURES} pictures finished
        </p>
      )}
    </Panel>
  );
}

function ClearedPanel({
  picture,
  mistakes,
  onNext,
}: {
  picture: Picture;
  mistakes: number;
  onNext: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl">{picture.emoji}</div>
      <h2 className="mt-2 text-2xl font-black text-slate-800">
        {picture.name} matched!
      </h2>
      <div className="mt-1 text-4xl font-black tabular-nums text-emerald-600">100%</div>
      <div className="mt-3 flex justify-center">
        <StarRow value={starsForPicture(mistakes)} />
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-500">
        {mistakes === 0
          ? "Perfect — not one wrong square!"
          : `${mistakes} wrong ${mistakes === 1 ? "square" : "squares"} along the way`}
      </p>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onNext}>Next Picture ▶</BigButton>
      </div>
    </Panel>
  );
}

function OverPanel({
  cleared,
  flawless,
  onPlayAgain,
}: {
  cleared: number;
  flawless: number;
  onPlayAgain: () => void;
}) {
  return (
    <Panel>
      <div className="text-6xl">🏆</div>
      <h2 className="mt-2 text-2xl font-black text-slate-800">Gallery complete!</h2>
      <p className="mt-1 text-base font-semibold text-slate-600">
        You copied {cleared} of {TOTAL_PICTURES} pictures, {flawless} of them with
        zero wrong squares.
      </p>
      <div className="mt-4 flex justify-center">
        <StarRow value={starsFor(cleared, flawless)} />
      </div>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlayAgain}>🔁 Play Again</BigButton>
      </div>
    </Panel>
  );
}
