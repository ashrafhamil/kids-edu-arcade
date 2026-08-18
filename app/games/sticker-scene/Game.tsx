"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx } from "@/lib/sound";
import {
  getLevel,
  setLevel,
  recordBest,
  setStars,
  loadJSON,
  saveJSON,
} from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  SCENES,
  SCENE_TARGET,
  TOTAL_SCENES,
  VIEWBOX,
  ASPECT,
  clampPercent,
  keyboardSpot,
  starsFor,
  type Scene,
  type SceneId,
} from "./scenes";

const SLUG = "sticker-scene";
const BOARDS_KEY = "sticker-scene:boards"; // per-scene placed stickers
const DONE_KEY = "sticker-scene:done"; // ids of scenes that reached the target
const CELEBRATE_MS = 1600;

const meta = getGame(SLUG);

/** A sticker sitting on a scene. `x`/`y` are percentages of the canvas box, so
 *  the picture survives a rotation, a resize or a different phone. */
type Placed = { id: number; emoji: string; x: number; y: number };
type Boards = Partial<Record<SceneId, Placed[]>>;

/** Stable empty board so scenes with nothing on them don't churn renders. */
const EMPTY_BOARD: Placed[] = [];

/** Highest id already used across every saved scene, so new stickers never
 *  collide with restored ones. */
function highestId(boards: Boards): number {
  let max = 0;
  for (const board of Object.values(boards)) {
    for (const sticker of board ?? EMPTY_BOARD) {
      if (sticker.id > max) max = sticker.id;
    }
  }
  return max;
}

export default function Game() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [boards, setBoards] = useState<Boards>({});
  const [doneIds, setDoneIds] = useState<SceneId[]>([]);
  const [scenesFinished, setScenesFinished] = useState(0);
  const [selected, setSelected] = useState(SCENES[0].stickers[0]);

  const [burst, setBurst] = useState(0);
  const [celebrating, setCelebrating] = useState(false);

  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  // Saved pictures live in localStorage, so the first paint must stay identical
  // to the server's: empty scene, nothing finished. Reading happens one tick
  // after mount, past hydration.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const savedBoards = loadJSON<Boards>(BOARDS_KEY, {});
      const savedDone = loadJSON<SceneId[]>(DONE_KEY, []);
      setBoards(savedBoards);
      setDoneIds(savedDone);
      // Level 1 means "no scene finished yet"; it is the durable counter even if
      // the picture blob was cleared, so take whichever is further along.
      setScenesFinished(Math.max(savedDone.length, getLevel(SLUG) - 1));
      nextId.current = highestId(savedBoards) + 1;
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Drop the pending celebration if the child leaves mid-confetti.
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

  const scene: Scene = SCENES[sceneIndex];
  const placed = boards[scene.id] ?? EMPTY_BOARD;
  const isFinished = doneIds.includes(scene.id);

  function openScene(index: number): void {
    if (celebrating || index === sceneIndex) return;
    sfx.click();
    setSceneIndex(index);
    setSelected(SCENES[index].stickers[0]);
  }

  function pickSticker(emoji: string): void {
    if (celebrating || emoji === selected) return;
    sfx.click();
    setSelected(emoji);
  }

  /** Single writer for the current scene's stickers: state + storage. */
  function writeBoard(next: Placed[]): void {
    const updated: Boards = { ...boards, [scene.id]: next };
    setBoards(updated);
    saveJSON(BOARDS_KEY, updated);
  }

  /** Places a sticker on the keyboard path, which has no pointer position. */
  function placeWithoutPointer(): void {
    const spot = keyboardSpot(placed.length);
    addSticker(spot.x, spot.y);
  }

  /** Fires once, the moment a scene first reaches the target. Removing stickers
   *  afterwards never takes the badge away. */
  function markFinished(): void {
    const nextDone = [...doneIds, scene.id];
    setDoneIds(nextDone);
    saveJSON(DONE_KEY, nextDone);

    const total = Math.max(scenesFinished + 1, nextDone.length);
    setScenesFinished(total);
    setLevel(SLUG, total + 1);
    recordBest(SLUG, total);
    setStars(SLUG, starsFor(total));

    sfx.win();
    setBurst((b) => b + 1);
    setCelebrating(true);
    schedule(() => setCelebrating(false), CELEBRATE_MS);
  }

  function addSticker(x: number, y: number): void {
    if (celebrating) return;
    const next = [...placed, { id: nextId.current, emoji: selected, x, y }];
    nextId.current += 1;
    writeBoard(next);
    sfx.pop();
    if (next.length >= SCENE_TARGET && !isFinished) markFinished();
  }

  /** Percentages come from the canvas's own box, never the window, so a shifted
   *  layout can't drag the drop point off target. */
  function placeOnCanvas(event: MouseEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    addSticker(clampPercent(x), clampPercent(y));
  }

  function removeSticker(id: number): void {
    if (celebrating) return;
    sfx.click();
    writeBoard(placed.filter((sticker) => sticker.id !== id));
  }

  function clearScene(): void {
    if (celebrating || placed.length === 0) return;
    sfx.click();
    writeBoard(EMPTY_BOARD);
  }

  const liveStats = (
    <>
      <StatBadge label="🖼️" value={`${scenesFinished}/${TOTAL_SCENES}`} />
      <StatBadge label="✨" value={`${placed.length}/${SCENE_TARGET}`} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      <div className="flex w-full max-w-[20rem] flex-col items-center gap-3">
        <ScenePicker
          sceneIndex={sceneIndex}
          doneIds={doneIds}
          disabled={celebrating}
          onOpen={openScene}
        />

        <div className="relative w-full">
          <Canvas
            scene={scene}
            placed={placed}
            onPlace={placeOnCanvas}
            onPlaceWithoutPointer={placeWithoutPointer}
            onRemove={removeSticker}
            disabled={celebrating}
          />
          {celebrating && <CelebrateToast stars={starsFor(scenesFinished)} />}
        </div>

        <ProgressPips filled={placed.length} total={SCENE_TARGET} />

        <Tray
          scene={scene}
          selected={selected}
          disabled={celebrating}
          onPick={pickSticker}
        />

        <ClearButton
          disabled={celebrating || placed.length === 0}
          onClear={clearScene}
        />

        <StarRow value={starsFor(scenesFinished)} size="text-2xl" />
      </div>
    </GameShell>
  );
}

function ScenePicker({
  sceneIndex,
  doneIds,
  disabled,
  onOpen,
}: {
  sceneIndex: number;
  doneIds: SceneId[];
  disabled: boolean;
  onOpen: (index: number) => void;
}) {
  return (
    <div className="grid w-full grid-cols-4 gap-2">
      {SCENES.map((scene, index) => {
        const active = index === sceneIndex;
        const done = doneIds.includes(scene.id);
        return (
          <button
            key={scene.id}
            type="button"
            onClick={() => onOpen(index)}
            disabled={disabled}
            aria-pressed={active}
            aria-label={done ? `${scene.label}, finished` : scene.label}
            className={`relative flex h-12 items-center justify-center rounded-2xl bg-white/25 text-2xl shadow-md transition active:scale-90 ${
              active ? "ring-4 ring-white" : "ring-2 ring-white/40"
            }`}
          >
            <span aria-hidden>{scene.emoji}</span>
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

function Canvas({
  scene,
  placed,
  disabled,
  onPlace,
  onPlaceWithoutPointer,
  onRemove,
}: {
  scene: Scene;
  placed: Placed[];
  disabled: boolean;
  onPlace: (event: MouseEvent<HTMLDivElement>) => void;
  onPlaceWithoutPointer: () => void;
  onRemove: (id: number) => void;
}) {
  const { Backdrop } = scene;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPlaceWithoutPointer();
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={scene.label}
      onClick={onPlace}
      onKeyDown={onKeyDown}
      className={`relative w-full ${ASPECT} cursor-pointer touch-manipulation select-none overflow-hidden rounded-3xl shadow-2xl shadow-black/30 ring-4 ring-white/70 outline-none`}
    >
      <svg
        viewBox={VIEWBOX}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        <Backdrop />
      </svg>

      {placed.map((sticker) => (
        <PlacedSticker
          key={sticker.id}
          sticker={sticker}
          onRemove={() => onRemove(sticker.id)}
        />
      ))}
    </div>
  );
}

function PlacedSticker({
  sticker,
  onRemove,
}: {
  sticker: Placed;
  onRemove: () => void;
}) {
  // Without this the tap bubbles to the canvas and drops a fresh sticker on the
  // spot the child just cleared.
  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onRemove();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Remove sticker ${sticker.emoji}`}
      className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[2.5rem] leading-none drop-shadow-md transition active:scale-90"
      style={{ left: `${sticker.x}%`, top: `${sticker.y}%` }}
    >
      <span aria-hidden>{sticker.emoji}</span>
    </button>
  );
}

function ProgressPips({ filled, total }: { filled: number; total: number }) {
  const shown = Math.min(filled, total);
  return (
    <div className="flex gap-1.5" aria-label={`${shown} of ${total} stickers placed`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2.5 w-2.5 rounded-full ${
            i < shown ? "bg-white" : "bg-white/30"
          }`}
        />
      ))}
    </div>
  );
}

function Tray({
  scene,
  selected,
  disabled,
  onPick,
}: {
  scene: Scene;
  selected: string;
  disabled: boolean;
  onPick: (emoji: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-5 gap-2 rounded-3xl bg-white/20 p-2 shadow-md">
      {scene.stickers.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          disabled={disabled}
          aria-pressed={emoji === selected}
          aria-label={`Sticker ${emoji}`}
          className={`flex aspect-square min-h-11 items-center justify-center rounded-2xl bg-white/80 text-3xl shadow-md transition active:scale-90 disabled:active:scale-100 ${
            emoji === selected ? "scale-105 ring-4 ring-white" : "ring-2 ring-white/40"
          }`}
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}

function ClearButton({
  disabled,
  onClear,
}: {
  disabled: boolean;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={disabled}
      aria-label="Clear all stickers"
      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/30 text-2xl transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
    >
      <span aria-hidden>🧹</span>
    </button>
  );
}

function CelebrateToast({ stars }: { stars: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="animate-pop-in flex flex-col items-center gap-2 rounded-3xl bg-slate-900/80 px-8 py-6 shadow-2xl">
        <span className="animate-bob text-5xl leading-none" aria-hidden>
          🎉
        </span>
        <StarRow value={stars} size="text-3xl" />
      </div>
    </div>
  );
}
