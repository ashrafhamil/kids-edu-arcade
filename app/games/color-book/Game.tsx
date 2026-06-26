"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import { getBest, recordBest, setStars, loadJSON, saveJSON } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  PICTURES,
  PALETTE,
  TOTAL_PICTURES,
  DEFAULT_FILL,
  STROKE,
  STROKE_WIDTH,
  starsFor,
  type Picture,
  type Region,
  type Detail,
  type Swatch,
} from "./pictures";

const SLUG = "color-book";
const DONE_KEY = "color-book:done"; // persisted ids of finished pictures
const ERASER = "eraser"; // sentinel for the "back to grey" tool
const CELEBRATE_MS = 1700; // how long the "Great job!" toast stays before auto-advance

const meta = getGame(SLUG);

type Fills = Record<string, string>;
type Celebrate = { name: string; allDone: boolean; newBest: boolean } | null;

/** The next picture to open after finishing the one at `from`, staying inside
 *  the unlocked range (completed pictures + the single new frontier). */
function nextUnlockedIndex(from: number, unlockedCount: number): number {
  const last = Math.min(unlockedCount - 1, TOTAL_PICTURES - 1);
  return from < last ? from + 1 : 0;
}

export default function Game() {
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [pictureIndex, setPictureIndex] = useState(0);
  const [fills, setFills] = useState<Fills>({});
  const [selected, setSelected] = useState<string>(PALETTE[0].hex);

  const [best, setBest] = useState(0);
  const [burst, setBurst] = useState(0);
  const [celebrate, setCelebrate] = useState<Celebrate>(null);
  const [resolving, setResolving] = useState(false);

  const timers = useRef<number[]>([]);

  // Load persisted progress after mount (SSR-safe, deferred past hydration),
  // and resume on the picture the child was working toward.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const done = loadJSON<string[]>(DONE_KEY, []);
      setCompletedIds(done);
      setPictureIndex(Math.min(done.length, TOTAL_PICTURES - 1));
      setBest(getBest(SLUG));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Drop any pending auto-advance if the child leaves mid-celebration.
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

  const completedCount = completedIds.length;
  // Unlocked = every finished picture plus the one new "frontier" page.
  const unlockedCount = Math.min(completedCount + 1, TOTAL_PICTURES);
  const picture: Picture = PICTURES[pictureIndex];
  const isFrontier = pictureIndex === completedCount; // the page that can be finished now

  function selectTool(value: string): void {
    if (resolving) return;
    setSelected(value);
    sfx.click();
  }

  function openPicture(index: number): void {
    if (resolving || index >= unlockedCount) return;
    sfx.click();
    setPictureIndex(index);
    setFills({});
  }

  function nextPicture(): void {
    if (resolving) return;
    openPicture(nextUnlockedIndex(pictureIndex, unlockedCount));
  }

  function clearPicture(): void {
    if (resolving || Object.keys(fills).length === 0) return;
    sfx.click();
    setFills({});
  }

  function finishFrontier(): void {
    setResolving(true);
    sfx.win();
    setBurst((b) => b + 1);

    const nextDone = [...completedIds, picture.id];
    setCompletedIds(nextDone);
    saveJSON(DONE_KEY, nextDone);

    const doneCount = nextDone.length;
    const isBest = recordBest(SLUG, doneCount);
    if (isBest) setBest(doneCount);
    setStars(SLUG, starsFor(doneCount, TOTAL_PICTURES));

    const allDone = doneCount >= TOTAL_PICTURES;
    setCelebrate({ name: picture.name, allDone, newBest: isBest });

    const target = nextUnlockedIndex(pictureIndex, Math.min(doneCount + 1, TOTAL_PICTURES));
    schedule(() => {
      setCelebrate(null);
      setResolving(false);
      setFills({});
      setPictureIndex(target);
    }, CELEBRATE_MS);
  }

  function paintRegion(region: Region): void {
    if (resolving) return;
    sfx.pop();

    const nextFills: Fills = { ...fills };
    if (selected === ERASER) delete nextFills[region.id];
    else nextFills[region.id] = selected;
    setFills(nextFills);

    const everyFilled = picture.regions.every((r) => Boolean(nextFills[r.id]));
    if (everyFilled && isFrontier) finishFrontier();
  }

  const liveStats = (
    <>
      <StatBadge label="Done" value={completedCount} />
      <StatBadge label="Picture" value={`${pictureIndex + 1}/${TOTAL_PICTURES}`} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      <div className="flex w-full max-w-[20rem] flex-col items-center gap-3">
        <PictureTitle picture={picture} done={pictureIndex < completedCount} />

        <div className="relative w-full">
          <Canvas
            picture={picture}
            fills={fills}
            disabled={resolving}
            onPaint={paintRegion}
          />
          {celebrate && <CelebrateToast celebrate={celebrate} />}
        </div>

        <BrushBar selected={selected} />

        <Palette selected={selected} disabled={resolving} onSelect={selectTool} />

        <div className="flex w-full gap-3">
          <ControlButton
            onClick={clearPicture}
            disabled={resolving || Object.keys(fills).length === 0}
            label="🧽 Clear"
          />
          <ControlButton onClick={nextPicture} disabled={resolving} label="Next ▶" />
        </div>

        <Gallery
          pictureIndex={pictureIndex}
          completedCount={completedCount}
          unlockedCount={unlockedCount}
          disabled={resolving}
          onOpen={openPicture}
        />

        <div className="flex flex-col items-center gap-0.5">
          <StarRow value={starsFor(completedCount, TOTAL_PICTURES)} size="text-2xl" />
          <span className="text-xs font-bold uppercase tracking-widest text-white/80">
            Best {best} / {TOTAL_PICTURES}
          </span>
        </div>
      </div>
    </GameShell>
  );
}

function PictureTitle({ picture, done }: { picture: Picture; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-3xl leading-none" aria-hidden>
          {picture.emoji}
        </span>
        <h2 className="text-2xl font-black tracking-tight drop-shadow-sm">{picture.name}</h2>
        {done && <span className="text-xl" aria-label="finished">✅</span>}
      </div>
      <span className="text-xs font-bold uppercase tracking-widest text-white/80">
        Pick a colour, tap to fill
      </span>
    </div>
  );
}

function Canvas({
  picture,
  fills,
  disabled,
  onPaint,
}: {
  picture: Picture;
  fills: Record<string, string>;
  disabled: boolean;
  onPaint: (region: Region) => void;
}) {
  return (
    <div className="w-full rounded-3xl bg-white p-3 shadow-2xl shadow-black/30">
      <svg
        viewBox={picture.viewBox}
        className="block h-auto w-full select-none"
        role="img"
        aria-label={`${picture.name} colouring page`}
      >
        {picture.regions.map((region) => (
          <RegionShape
            key={region.id}
            region={region}
            fill={fills[region.id] ?? DEFAULT_FILL}
            disabled={disabled}
            onActivate={() => onPaint(region)}
          />
        ))}
        {picture.details.map((detail, i) => (
          <DetailShape key={i} detail={detail} />
        ))}
      </svg>
    </div>
  );
}

function RegionShape({
  region,
  fill,
  disabled,
  onActivate,
}: {
  region: Region;
  fill: string;
  disabled: boolean;
  onActivate: () => void;
}) {
  function onKeyDown(e: KeyboardEvent<SVGElement>): void {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  }

  const common = {
    fill,
    stroke: STROKE,
    strokeWidth: STROKE_WIDTH,
    strokeLinejoin: "round" as const,
    role: "button",
    tabIndex: disabled ? -1 : 0,
    "aria-label": region.label,
    onClick: disabled ? undefined : onActivate,
    onKeyDown,
    className: disabled ? "outline-none" : "cursor-pointer outline-none",
    style: { transition: "fill 160ms ease" },
  };

  switch (region.shape) {
    case "rect":
      return (
        <rect x={region.x} y={region.y} width={region.width} height={region.height} rx={region.rx} {...common} />
      );
    case "circle":
      return <circle cx={region.cx} cy={region.cy} r={region.r} {...common} />;
    case "ellipse":
      return (
        <ellipse cx={region.cx} cy={region.cy} rx={region.rx} ry={region.ry} transform={region.transform} {...common} />
      );
    case "path":
      return <path d={region.d} {...common} />;
  }
}

function DetailShape({ detail }: { detail: Detail }) {
  if (detail.shape === "circle") {
    return (
      <circle cx={detail.cx} cy={detail.cy} r={detail.r} fill={detail.fill} style={{ pointerEvents: "none" }} />
    );
  }
  return (
    <path
      d={detail.d}
      fill={detail.fill}
      stroke={detail.stroke}
      strokeWidth={detail.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pointerEvents: "none" }}
    />
  );
}

function BrushBar({ selected }: { selected: string }) {
  const isEraser = selected === ERASER;
  const swatch = PALETTE.find((p) => p.hex === selected);
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/25 px-4 py-1.5 shadow-md backdrop-blur">
      <span className="text-lg leading-none" aria-hidden>
        {isEraser ? "🧽" : "🖌️"}
      </span>
      <span className="text-sm font-black uppercase tracking-wide">
        {isEraser ? "Eraser" : (swatch?.name ?? "Colour")}
      </span>
      {!isEraser && (
        <span
          className="h-5 w-5 rounded-full border-2 border-white/80"
          style={{ backgroundColor: selected }}
          aria-hidden
        />
      )}
    </div>
  );
}

function Palette({
  selected,
  disabled,
  onSelect,
}: {
  selected: string;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-6 gap-2">
      {PALETTE.map((swatch) => (
        <ColorSwatch
          key={swatch.id}
          swatch={swatch}
          active={selected === swatch.hex}
          disabled={disabled}
          onSelect={() => onSelect(swatch.hex)}
        />
      ))}
      <button
        type="button"
        onClick={() => onSelect(ERASER)}
        disabled={disabled}
        aria-pressed={selected === ERASER}
        aria-label="Eraser"
        className={`flex aspect-square items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-md transition active:scale-90 disabled:opacity-50 ${
          selected === ERASER ? "ring-4 ring-white scale-105" : "ring-2 ring-white/40"
        }`}
      >
        🧽
      </button>
    </div>
  );
}

function ColorSwatch({
  swatch,
  active,
  disabled,
  onSelect,
}: {
  swatch: Swatch;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      aria-label={swatch.name}
      className={`aspect-square rounded-2xl shadow-md transition active:scale-90 disabled:opacity-50 ${
        active ? "ring-4 ring-white scale-105" : "ring-2 ring-white/50"
      }`}
      style={{ backgroundColor: swatch.hex }}
    />
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 select-none rounded-2xl bg-white/20 px-4 py-2.5 text-lg font-black tracking-tight text-white backdrop-blur transition active:scale-95 hover:bg-white/30 disabled:opacity-50 disabled:active:scale-100"
    >
      {label}
    </button>
  );
}

function Gallery({
  pictureIndex,
  completedCount,
  unlockedCount,
  disabled,
  onOpen,
}: {
  pictureIndex: number;
  completedCount: number;
  unlockedCount: number;
  disabled: boolean;
  onOpen: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {PICTURES.map((pic, i) => {
        const done = i < completedCount;
        const locked = i >= unlockedCount;
        const current = i === pictureIndex;
        return (
          <button
            key={pic.id}
            type="button"
            onClick={() => onOpen(i)}
            disabled={disabled || locked}
            aria-label={`${pic.name}${done ? " (finished)" : locked ? " (locked)" : ""}`}
            aria-current={current ? "true" : undefined}
            className={`relative flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition active:scale-90 ${
              locked ? "bg-white/10 opacity-60" : "bg-white/25 backdrop-blur"
            } ${current ? "ring-4 ring-white" : "ring-2 ring-white/30"}`}
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

function CelebrateToast({ celebrate }: { celebrate: NonNullable<Celebrate> }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="animate-pop-in rounded-3xl bg-slate-900/85 px-7 py-5 text-center shadow-2xl">
        {celebrate.newBest && (
          <div className="animate-bob text-sm font-black uppercase tracking-widest text-amber-300">
            🏆 New Best!
          </div>
        )}
        <div className="mt-1 text-4xl leading-none" aria-hidden>
          🎉
        </div>
        <div className="mt-1 text-2xl font-black uppercase tracking-tight text-white">
          {celebrate.allDone ? "Whole book done!" : "Great job!"}
        </div>
        <div className="mt-0.5 text-sm font-bold text-white/80">
          {celebrate.allDone ? `You coloured all ${TOTAL_PICTURES}!` : `${celebrate.name} finished — next unlocked!`}
        </div>
      </div>
    </div>
  );
}
