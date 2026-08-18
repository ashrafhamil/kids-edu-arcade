"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, Panel, StarRow } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx, unlockAudio } from "@/lib/sound";
import { getBest, getLevel, recordBest, setLevel, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  emptyGrid,
  LANES,
  LEVEL_COUNT,
  LEVELS,
  matchStats,
  starsFor,
  STEP_MS,
  STEPS,
  type Grid,
  type LaneId,
} from "./patterns";

const SLUG = "beat-builder";
const meta = getGame(SLUG);

// Three registers roughly an octave and a half apart, so the lanes stay
// distinguishable even when two of them land on the same step.
const KICK_HZ = 150; // low enough to thud, high enough to survive phone speakers
const KICK_MS = 130;
const CLAP_HZ = 440;
const CLAP_MS = 90;

type Phase = "ready" | "playing" | "over";
/** "off" = silent, "loop" = the child's pattern on repeat, "listen" = the target once. */
type PlayMode = "off" | "loop" | "listen";

// lib/sound.ts has no noise source, so each "drum" is the closest pitched tone
// it offers: a low sine thud, a bright blip and a short high tick.
const HIT: Record<LaneId, () => void> = {
  kick: () => sfx.note(KICK_HZ, KICK_MS),
  clap: () => sfx.note(CLAP_HZ, CLAP_MS),
  hat: () => sfx.tick(),
};

/** Fire every drum switched on at `step`. Module scope: no deps to track. */
function playStep(cells: Grid, step: number): void {
  LANES.forEach((lane, index) => {
    if (cells[index][step]) HIT[lane.id]();
  });
}

/** Toggle one cell, returning a new grid (never mutates the current one). */
function toggleCell(cells: Grid, lane: number, step: number): Grid {
  return cells.map((row, l) =>
    l === lane ? row.map((on, s) => (s === step ? !on : on)) : row
  );
}

/** Encouraging face for how close the built pattern is. */
function faceFor(matched: number, targetHits: number, exact: boolean): string {
  if (exact) return "🎉";
  if (matched === 0) return "😴";
  return matched * 2 >= targetHits ? "😃" : "🙂";
}

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [levelIndex, setLevelIndex] = useState(0);
  // First level of the current run.
  const [startIndex, setStartIndex] = useState(0);
  const [built, setBuilt] = useState<Grid>(emptyGrid);
  const [cleared, setCleared] = useState(false);

  const [mode, setMode] = useState<PlayMode>("off");
  // Bumped on every playback start so pressing Listen twice restarts the bar.
  const [runId, setRunId] = useState(0);
  const [step, setStep] = useState(-1);

  const [listens, setListens] = useState(0);
  // Stars frozen at the moment a level cleared, so the panels always agree with
  // what was written to storage even if 👂 is pressed again afterwards.
  const [earnedStars, setEarnedStars] = useState(0);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [burst, setBurst] = useState(0);

  // The sequencer reads patterns through refs, so editing a cell changes what
  // the very next step plays without restarting the loop.
  const builtRef = useRef<Grid>(built);
  const targetRef = useRef<Grid>(LEVELS[0].cells);

  const level = LEVELS[levelIndex];
  const target = level.cells;
  const stats = matchStats(built, target);
  const levelNumber = levelIndex + 1;
  // Stars are judged per level actually played, so resuming mid-way is fair.
  const levelsPlayed = Math.max(1, levelNumber - startIndex);

  useEffect(() => {
    builtRef.current = built;
    targetRef.current = target;
  });

  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  /**
   * The one and only playback loop. A self-rescheduling timeout keeps at most a
   * single pending timer, and the cleanup clears it — so leaving the phase, the
   * mode or the page stops the beat within one step.
   */
  useEffect(() => {
    if (phase !== "playing" || mode === "off") return;

    let index = 0;
    let timer = 0;
    let stopped = false;

    const tick = () => {
      playStep(mode === "listen" ? targetRef.current : builtRef.current, index);
      setStep(index);

      const next = index + 1;
      if (mode === "listen" && next >= STEPS) {
        timer = window.setTimeout(() => {
          if (!stopped) setMode("off");
        }, STEP_MS);
        return;
      }
      index = next % STEPS;
      timer = window.setTimeout(tick, STEP_MS);
    };

    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      setStep(-1);
    };
  }, [phase, mode, runId]);

  // Backgrounding the tab (or locking the phone) stops the beat too.
  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) setMode("off");
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, []);

  const startPlayback = useCallback((next: PlayMode) => {
    unlockAudio();
    setMode(next);
    setRunId((r) => r + 1);
  }, []);

  const loadLevel = useCallback((index: number) => {
    setMode("off");
    setLevelIndex(index);
    const fresh = emptyGrid();
    setBuilt(fresh);
    builtRef.current = fresh;
    targetRef.current = LEVELS[index].cells;
    setCleared(false);
  }, []);

  function startRun(fromIndex: number): void {
    sfx.click();
    setStartIndex(fromIndex);
    setListens(0);
    setEarnedStars(0);
    setNewBest(false);
    loadLevel(fromIndex);
    setPhase("playing");
  }

  /** Ready panel: pick up where the child left off. */
  function resumeRun(): void {
    startRun(Math.min(getLevel(SLUG), LEVEL_COUNT) - 1);
  }

  function clearLevel(): void {
    setCleared(true);
    setBurst((b) => b + 1);
    sfx.levelUp();

    // getLevel stores the NEXT level to play, so a fresh player and a player who
    // cleared level 1 never read the same value.
    setLevel(SLUG, levelNumber + 1);
    const stars = starsFor(levelNumber, listens / levelsPlayed);
    setEarnedStars(stars);
    setStars(SLUG, stars);
    if (recordBest(SLUG, levelNumber)) {
      setBest(levelNumber);
      setNewBest(true);
    }
  }

  function handleCell(lane: number, cellStep: number): void {
    if (phase !== "playing" || cleared) return;

    const next = toggleCell(built, lane, cellStep);
    setBuilt(next);
    builtRef.current = next; // the loop hears the edit on its very next step

    if (next[lane][cellStep]) HIT[LANES[lane].id]();
    else sfx.click();

    if (matchStats(next, target).exact) clearLevel();
  }

  function handlePlay(): void {
    if (mode === "loop") {
      sfx.click();
      setMode("off");
      return;
    }
    startPlayback("loop");
  }

  function handleListen(): void {
    setListens((n) => n + 1);
    startPlayback("listen");
  }

  function handleErase(): void {
    if (cleared) return;
    sfx.click();
    const fresh = emptyGrid();
    setBuilt(fresh);
    builtRef.current = fresh;
  }

  function handleNext(): void {
    sfx.click();
    loadLevel(levelIndex + 1);
  }

  function handleFinish(): void {
    setMode("off");
    setPhase("over");
    sfx.win();
    setBurst((b) => b + 1);
  }

  const liveStats = (
    <>
      <StatBadge label="Level" value={`${levelNumber}/${LEVEL_COUNT}`} />
      <StatBadge label="Best" value={best} />
      <StatBadge label="👂" value={listens} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={40} />

      {phase === "ready" && <ReadyPanel onPlay={resumeRun} />}

      {phase === "over" && (
        <OverPanel
          stars={earnedStars}
          listens={listens}
          best={best}
          newBest={newBest}
          onPlay={() => startRun(0)}
        />
      )}

      {phase === "playing" && (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 select-none">
          <LevelDots current={levelIndex} />

          <MatchMeter
            matched={stats.matched}
            extra={stats.extra}
            targetHits={stats.targetHits}
            exact={stats.exact}
          />

          <div className="w-full rounded-3xl bg-white/95 p-2 shadow-2xl shadow-black/30">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `1.75rem repeat(${STEPS}, minmax(0, 1fr))` }}
            >
              {LANES.map((lane, laneIndex) => (
                <Fragment key={lane.id}>
                  <div
                    className="flex items-center justify-center text-xl leading-none"
                    role="img"
                    aria-label={lane.label}
                  >
                    {lane.emoji}
                  </div>
                  {built[laneIndex].map((on, cellStep) => (
                    <button
                      key={cellStep}
                      type="button"
                      onClick={() => handleCell(laneIndex, cellStep)}
                      disabled={cleared}
                      aria-label={`${lane.label} beat ${cellStep + 1}`}
                      aria-pressed={on}
                      className={`h-11 rounded-lg transition active:scale-90 ${
                        on ? lane.on : cellStep % 4 === 0 ? "bg-slate-300" : "bg-slate-200"
                      } ${step === cellStep ? "ring-2 ring-slate-900" : ""}`}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <BigButton onClick={handlePlay} aria-label={mode === "loop" ? "Stop" : "Play"}>
              {mode === "loop" ? "⏹️" : "▶️"}
            </BigButton>
            <BigButton variant="ghost" onClick={handleListen} aria-label="Listen to the beat">
              👂
            </BigButton>
            <BigButton
              variant="ghost"
              onClick={handleErase}
              disabled={cleared}
              aria-label="Clear the grid"
            >
              🧹
            </BigButton>
          </div>

          {cleared && (
            <div className="flex animate-pop-in flex-col items-center gap-2 rounded-3xl bg-slate-900/90 px-6 py-4 text-white shadow-2xl shadow-black/30">
              <span className="text-5xl leading-none" aria-hidden>
                🎉
              </span>
              <StarRow value={earnedStars} />
              {levelNumber < LEVEL_COUNT ? (
                <BigButton onClick={handleNext} aria-label="Next beat">
                  ⏭️
                </BigButton>
              ) : (
                <BigButton onClick={handleFinish} aria-label="Finish">
                  🏆
                </BigButton>
              )}
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}

/** Six dots, one per target beat, with the current one lit. */
function LevelDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Beat ${current + 1} of ${LEVEL_COUNT}`}>
      {LEVELS.map((pattern, index) => (
        <span
          key={pattern.title}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-lg ${
            index === current
              ? "bg-white text-slate-900 shadow-md"
              : index < current
                ? "bg-white/40"
                : "bg-white/15 opacity-60"
          }`}
          aria-hidden
        >
          {index < current ? "⭐" : pattern.emoji}
        </span>
      ))}
    </div>
  );
}

/** Live "how close am I" readout — a face, a bar, and a count of stray hits. */
function MatchMeter({
  matched,
  extra,
  targetHits,
  exact,
}: {
  matched: number;
  extra: number;
  targetHits: number;
  exact: boolean;
}) {
  const pct = targetHits === 0 ? 0 : Math.round((matched / targetHits) * 100);

  return (
    <div className="flex w-full items-center gap-2">
      <span className="text-3xl leading-none" aria-hidden>
        {faceFor(matched, targetHits, exact)}
      </span>
      <div
        className="h-4 flex-1 overflow-hidden rounded-full bg-black/25"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={targetHits}
        aria-valuenow={matched}
        aria-label="Matching the beat"
      >
        <div
          className={`h-full rounded-full transition-all duration-200 ${
            exact ? "bg-lime-400" : "bg-white/80"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`min-w-9 rounded-full px-2 py-0.5 text-center text-sm font-black ${
          extra > 0 ? "bg-amber-300 text-amber-950" : "text-transparent"
        }`}
        aria-label={extra > 0 ? `${extra} extra taps` : undefined}
        aria-hidden={extra === 0}
      >
        ❌{extra}
      </span>
    </div>
  );
}

function ReadyPanel({ onPlay }: { onPlay: () => void }) {
  return (
    <Panel>
      <div className="text-6xl animate-bob">🥁</div>
      <h2 className="mt-2 text-3xl font-black text-slate-800">Beat Builder</h2>
      <p className="mt-2 text-base font-semibold text-slate-600">
        Press 👂 to hear a beat, then tap the squares to build it. Press ▶️ to play yours.
      </p>
      <div className="mt-3 flex justify-center gap-4 text-slate-700">
        {LANES.map((lane) => (
          <span key={lane.id} className="text-3xl leading-none" role="img" aria-label={lane.label}>
            {lane.emoji}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm font-bold text-slate-500">
        🎵 {LEVEL_COUNT} beats &middot; no timer &middot; ⭐⭐⭐ with 2 or fewer 👂 per beat
      </p>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>▶ Play</BigButton>
      </div>
    </Panel>
  );
}

function OverPanel({
  stars,
  listens,
  best,
  newBest,
  onPlay,
}: {
  stars: number;
  listens: number;
  best: number;
  newBest: boolean;
  onPlay: () => void;
}) {
  return (
    <Panel>
      <div className="text-5xl">{newBest ? "🏆" : "🥁"}</div>
      {newBest && (
        <div className="mt-1 animate-bob text-xl font-black text-amber-500">NEW BEST!</div>
      )}
      <h2 className="mt-1 text-2xl font-black text-slate-800">All {LEVEL_COUNT} beats!</h2>
      <div className="mt-3 flex justify-center">
        <StarRow value={stars} />
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-500">
        👂 {listens} &middot; Best level {best}
      </div>
      <div className="mt-5 flex justify-center">
        <BigButton onClick={onPlay}>🔁 Play Again</BigButton>
      </div>
    </Panel>
  );
}
