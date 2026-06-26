"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx, unlockAudio } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";

const SLUG = "echo";

/** A single Simon pad: dim resting colour, bright lit colour, its own tone + a
 *  non-colour emoji cue so colour-blind kids can still tell the pads apart. */
type Pad = { name: string; base: string; lit: string; freq: number; emoji: string };

const PADS: Pad[] = [
  { name: "green", base: "#16a34a", lit: "#86efac", freq: 392.0, emoji: "🐢" },
  { name: "red", base: "#dc2626", lit: "#fca5a5", freq: 329.63, emoji: "🦊" },
  { name: "yellow", base: "#ca8a04", lit: "#fde68a", freq: 587.33, emoji: "🐥" },
  { name: "blue", base: "#2563eb", lit: "#93c5fd", freq: 493.88, emoji: "🐳" },
];

type Phase = "start" | "playing" | "input" | "ready" | "reveal" | "over";

function randomPad(): number {
  return Math.floor(Math.random() * PADS.length);
}

/** Stars by furthest round reached. */
function starsFor(round: number): number {
  if (round >= 14) return 3;
  if (round >= 9) return 2;
  if (round >= 5) return 1;
  return 0;
}

export default function Game() {
  const meta = getGame(SLUG);

  const [phase, setPhase] = useState<Phase>("start");
  const [sequence, setSequence] = useState<number[]>([]);
  const [round, setRound] = useState(1);
  const [inputIndex, setInputIndex] = useState(0);

  const [activePad, setActivePad] = useState<number | null>(null);
  const [shakePad, setShakePad] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [best, setBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [earnedStars, setEarnedStars] = useState(0);
  const [burst, setBurst] = useState(0);

  // Drives the playback effect: bumping it re-plays the current sequence.
  const [playToken, setPlayToken] = useState(0);

  // Ad-hoc timers (tap flashes, between-round pauses, the reveal delay) that
  // live outside the playback effect. Cleared on new game and on unmount.
  const timersRef = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  // Load the stored best round once, after mount (SSR-safe).
  useEffect(() => {
    setBest(getBest(SLUG));
  }, []);

  // Cancel every pending timer when the component unmounts.
  useEffect(() => clearTimers, [clearTimers]);

  // ---- Sequence playback -------------------------------------------------
  // Runs only while phase === "playing". Lights each pad with its tone in turn,
  // speeding up as the round climbs, then hands the turn to the player.
  useEffect(() => {
    if (phase !== "playing") return;

    const timers: number[] = [];
    const litMs = Math.max(190, 520 - round * 24);
    const gapMs = Math.max(90, 220 - round * 9);
    const step = litMs + gapMs;
    const lead = 650;

    // The "Round N" banner is set wherever a round begins (an event/timer, not
    // here) so this effect only clears it once the pads start lighting.
    timers.push(window.setTimeout(() => setBanner(null), lead));

    sequence.forEach((pad, i) => {
      const at = lead + i * step;
      timers.push(
        window.setTimeout(() => {
          setActivePad(pad);
          sfx.note(PADS[pad].freq, litMs);
        }, at),
      );
      timers.push(
        window.setTimeout(
          () => setActivePad((cur) => (cur === pad ? null : cur)),
          at + litMs,
        ),
      );
    });

    timers.push(
      window.setTimeout(() => {
        setActivePad(null);
        setInputIndex(0);
        setPhase("input");
      }, lead + sequence.length * step + 60),
    );

    return () => timers.forEach((t) => clearTimeout(t));
  }, [phase, round, sequence, playToken]);

  // ---- Round / game control ---------------------------------------------
  const beginPlayback = useCallback((seq: number[], rnd: number) => {
    setSequence(seq);
    setRound(rnd);
    setActivePad(null);
    setShakePad(null);
    setBanner(`Round ${rnd}`);
    setPhase("playing");
    setPlayToken((t) => t + 1);
  }, []);

  const startGame = useCallback(() => {
    unlockAudio();
    sfx.click();
    clearTimers();
    setIsNewBest(false);
    setEarnedStars(0);
    setInputIndex(0);
    beginPlayback([randomPad()], 1);
  }, [beginPlayback, clearTimers]);

  const finishGame = useCallback(
    (reached: number) => {
      const newBest = recordBest(SLUG, reached);
      if (newBest) {
        setBest(reached);
        setBurst((b) => b + 1);
      }
      setIsNewBest(newBest);

      const stars = starsFor(reached);
      setStars(SLUG, stars);
      setEarnedStars(stars);

      setShakePad(null);
      setActivePad(null);
      setBanner(null);
      setPhase("over");
    },
    [],
  );

  // Flash a pad's light + tone on a correct tap.
  const flashPad = useCallback((index: number) => {
    setActivePad(index);
    sfx.note(PADS[index].freq, 200);
    later(() => setActivePad((cur) => (cur === index ? null : cur)), 200);
  }, [later]);

  const handlePad = useCallback(
    (index: number) => {
      if (phase !== "input") return;

      if (index !== sequence[inputIndex]) {
        // Wrong pad: shake it, sting, then reveal the game-over panel.
        sfx.gameOver();
        setActivePad(index);
        setShakePad(index);
        setPhase("reveal");
        later(() => finishGame(round), 800);
        return;
      }

      flashPad(index);
      const next = inputIndex + 1;

      if (next >= sequence.length) {
        // Whole sequence echoed back correctly -> grow it and speed up.
        sfx.levelUp();
        setInputIndex(0);
        setPhase("ready");
        setBanner(`Round ${round + 1}!`);
        const grown = [...sequence, randomPad()];
        const nextRound = round + 1;
        later(() => beginPlayback(grown, nextRound), 750);
      } else {
        setInputIndex(next);
      }
    },
    [phase, sequence, inputIndex, round, flashPad, later, finishGame, beginPlayback],
  );

  const showGrid = phase === "playing" || phase === "input" || phase === "ready" || phase === "reveal";
  const acceptTaps = phase === "input";

  const statusText =
    phase === "playing"
      ? "👀 Watch & listen"
      : phase === "input"
        ? "👆 Your turn!"
        : phase === "ready"
          ? "✅ Nice!"
          : phase === "reveal"
            ? "💥 Oops!"
            : "";

  const liveStats = (
    <>
      <StatBadge label="Round" value={phase === "start" ? "—" : round} />
      <StatBadge label="Best" value={best} />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} />

      <div className="relative flex w-full flex-col items-center">
        {showGrid && (
          <>
            <div className="mb-3 flex h-10 items-center gap-2 rounded-full bg-white/20 px-5 text-lg font-black backdrop-blur">
              {statusText}
            </div>

            {/* Progress dots: how much of the sequence the player has echoed. */}
            <div className="mb-3 flex min-h-4 flex-wrap items-center justify-center gap-1.5">
              {phase === "input" &&
                sequence.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-full transition ${
                      i < inputIndex ? "bg-white" : "bg-white/30"
                    }`}
                  />
                ))}
            </div>

            <div className="relative grid w-full max-w-[20rem] grid-cols-2 gap-3">
              {PADS.map((pad, index) => {
                const active = activePad === index;
                return (
                  <button
                    key={pad.name}
                    type="button"
                    aria-label={pad.name}
                    onPointerDown={() => handlePad(index)}
                    className={`relative flex aspect-square items-center justify-center rounded-3xl text-5xl transition-transform duration-100 ${
                      active ? "scale-105" : "scale-100"
                    } ${shakePad === index ? "animate-shake" : ""} ${
                      acceptTaps ? "cursor-pointer" : "cursor-default"
                    }`}
                    style={{
                      background: active ? pad.lit : pad.base,
                      filter: active ? "brightness(1.1)" : "brightness(0.82)",
                      boxShadow: active
                        ? `0 0 30px 8px ${pad.lit}`
                        : "inset 0 -7px 0 rgba(0,0,0,0.28)",
                    }}
                  >
                    <span
                      className={`transition-transform duration-100 ${active ? "scale-125" : "scale-100"}`}
                      aria-hidden
                    >
                      {pad.emoji}
                    </span>
                  </button>
                );
              })}

              {banner && (
                <div
                  key={banner}
                  className="animate-pop-in pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <span className="rounded-2xl bg-black/45 px-6 py-3 text-4xl font-black text-white drop-shadow-lg backdrop-blur-sm">
                    {banner}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {phase === "start" && (
          <Panel>
            <div className="mb-2 text-6xl" aria-hidden>
              🎵
            </div>
            <h2 className="text-3xl font-black">Echo</h2>
            <p className="mt-2 text-base font-semibold text-slate-600">
              Watch the colours light up, then tap them back in the same order. The
              pattern grows every round!
            </p>
            {best > 0 && (
              <p className="mt-3 text-sm font-bold text-slate-500">
                Best: Round {best}
              </p>
            )}
            <div className="mt-5">
              <BigButton onClick={startGame}>▶ Play</BigButton>
            </div>
          </Panel>
        )}

        {phase === "over" && (
          <Panel>
            <div className="mb-1 text-6xl" aria-hidden>
              {isNewBest ? "🏆" : "🎵"}
            </div>
            {isNewBest && (
              <p className="animate-wiggle text-xl font-black text-rose-500">
                NEW BEST!
              </p>
            )}
            <h2 className="mt-1 text-2xl font-black text-slate-800">
              You reached Round {round}
            </h2>
            <div className="mt-3 flex justify-center">
              <StarRow value={earnedStars} />
            </div>
            <p className="mt-2 text-sm font-bold text-slate-500">Best: Round {best}</p>
            <div className="mt-5">
              <BigButton onClick={startGame}>🔁 Play Again</BigButton>
            </div>
          </Panel>
        )}
      </div>
    </GameShell>
  );
}
