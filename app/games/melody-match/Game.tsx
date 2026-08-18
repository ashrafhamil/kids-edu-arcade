"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameShell, { StatBadge } from "@/components/GameShell";
import { BigButton, StarRow, Panel } from "@/components/ui";
import Confetti from "@/components/Confetti";
import { sfx, unlockAudio } from "@/lib/sound";
import { getBest, recordBest, setStars } from "@/lib/storage";
import { getGame } from "@/app/games/registry";
import {
  KEYS,
  MAX_HEARTS,
  REPLAYS_PER_ROUND,
  lengthFor,
  randomMelody,
  scoreForRound,
  starsFor,
} from "./melodies";

const SLUG = "melody-match";
const meta = getGame(SLUG);

/* ---- playback timing (ms) ---- */
const LEAD_MS = 700; // silence before the first note, so the ear settles
const NOTE_MS = 400;
const GAP_MS = 200;
const STEP_MS = NOTE_MS + GAP_MS;

/* ---- feedback timing (ms) ---- */
const TAP_FLASH_MS = 180;
const WRONG_FLASH_MS = 500;
const WRONG_STING_MS = 220; // let the tapped pitch ring before the buzz
const RETRY_PAUSE_MS = 1000;
const NEXT_ROUND_PAUSE_MS = 1100;
const GAME_OVER_PAUSE_MS = 800;

type Phase = "ready" | "listening" | "answer" | "pause" | "over";

export default function Game() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [melody, setMelody] = useState<number[]>([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [notesHeard, setNotesHeard] = useState(0);

  const [roundsCleared, setRoundsCleared] = useState(0);
  const [replaysLeft, setReplaysLeft] = useState(REPLAYS_PER_ROUND);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [score, setScore] = useState(0);

  const [tappedKey, setTappedKey] = useState<number | null>(null);
  const [wrongKey, setWrongKey] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [best, setBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [earnedStars, setEarnedStars] = useState(0);
  const [burst, setBurst] = useState(0);

  // Bumping this re-runs the playback effect with the same melody (replays).
  const [playToken, setPlayToken] = useState(0);

  // Feedback / pacing timers that live outside the playback effect.
  const timersRef = useRef<number[]>([]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  // Load the stored best once, after mount (SSR-safe).
  useEffect(() => {
    const id = window.setTimeout(() => setBest(getBest(SLUG)), 0);
    return () => window.clearTimeout(id);
  }, []);

  // Cancel every pending timer when the child leaves the game.
  useEffect(() => clearTimers, [clearTimers]);

  /* ---- playback --------------------------------------------------------
   * The keys are deliberately NOT lit here. Only the pitch is revealed, so the
   * child has to track the sound rather than a position on screen. Each note
   * gets its own timeout so leaving mid-melody cancels the notes that have not
   * sounded yet. */
  useEffect(() => {
    if (phase !== "listening") return;

    const timers: number[] = [];

    melody.forEach((keyIndex, i) => {
      timers.push(
        window.setTimeout(() => {
          sfx.note(KEYS[keyIndex].freq, NOTE_MS);
          setNotesHeard(i + 1);
        }, LEAD_MS + i * STEP_MS),
      );
    });

    timers.push(
      window.setTimeout(() => {
        setInputIndex(0);
        setPhase("answer");
      }, LEAD_MS + melody.length * STEP_MS),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, melody, playToken]);

  /* ---- round control --------------------------------------------------- */

  /** Play the melody currently in state (start of round, replay, or retry). */
  const listen = useCallback(() => {
    setNotesHeard(0);
    setTappedKey(null);
    setWrongKey(null);
    setPhase("listening");
    setPlayToken((t) => t + 1);
  }, []);

  /** Deal a fresh melody sized for how many rounds are already cleared. */
  const startRound = useCallback(
    (cleared: number) => {
      setMelody(randomMelody(lengthFor(cleared)));
      setReplaysLeft(REPLAYS_PER_ROUND);
      setInputIndex(0);
      setBanner(null);
      listen();
    },
    [listen],
  );

  const startGame = useCallback(() => {
    unlockAudio();
    sfx.click();
    clearTimers();
    setRoundsCleared(0);
    setHearts(MAX_HEARTS);
    setScore(0);
    setIsNewBest(false);
    setEarnedStars(0);
    startRound(0);
  }, [clearTimers, startRound]);

  const endGame = useCallback((finalScore: number) => {
    const newBest = recordBest(SLUG, finalScore);
    setIsNewBest(newBest);
    if (newBest) {
      setBest(finalScore);
      setBurst((b) => b + 1);
      sfx.win();
    } else {
      sfx.gameOver();
    }
    const stars = starsFor(finalScore);
    setStars(SLUG, stars);
    setEarnedStars(stars);
    setBanner(null);
    setPhase("over");
  }, []);

  const replayMelody = () => {
    if (phase !== "answer" || replaysLeft <= 0) return;
    sfx.click();
    setReplaysLeft(replaysLeft - 1);
    listen();
  };

  /* ---- answering ------------------------------------------------------- */

  const clearRound = () => {
    const gained = scoreForRound(melody.length, REPLAYS_PER_ROUND - replaysLeft);
    const cleared = roundsCleared + 1;
    const grew = lengthFor(cleared) > melody.length;

    setScore(score + gained);
    setRoundsCleared(cleared);
    setPhase("pause");
    setBanner(grew ? `${lengthFor(cleared)} notes!` : `+${gained}`);

    if (grew) sfx.levelUp();
    else sfx.correct();

    schedule(() => startRound(cleared), NEXT_ROUND_PAUSE_MS);
  };

  const missNote = (index: number) => {
    const left = hearts - 1;

    setWrongKey(index);
    setHearts(left);
    setInputIndex(0);
    setPhase("pause");
    schedule(() => sfx.wrong(), WRONG_STING_MS);
    schedule(() => setWrongKey(null), WRONG_FLASH_MS);

    if (left <= 0) {
      setBanner(null);
      schedule(() => endGame(score), GAME_OVER_PAUSE_MS);
      return;
    }

    setBanner("Listen again…");
    schedule(listen, RETRY_PAUSE_MS);
  };

  const handleKey = (index: number) => {
    if (phase !== "answer") return;

    // Every tap performs its pitch — the scale is pentatonic, so even a wrong
    // key sounds musical instead of sour.
    sfx.note(KEYS[index].freq, 300);
    setTappedKey(index);
    schedule(() => setTappedKey((cur) => (cur === index ? null : cur)), TAP_FLASH_MS);

    if (index !== melody[inputIndex]) {
      missNote(index);
      return;
    }

    const next = inputIndex + 1;
    if (next < melody.length) setInputIndex(next);
    else clearRound();
  };

  /* ---- render ---------------------------------------------------------- */

  const inRound = phase === "listening" || phase === "answer" || phase === "pause";
  const heartRow = "❤️".repeat(Math.max(hearts, 0)) + "🤍".repeat(MAX_HEARTS - Math.max(hearts, 0));

  const liveStats = (
    <>
      <StatBadge label="Score" value={score} />
      <StatBadge label="Best" value={best} />
      <StatBadge
        label="Hearts"
        value={<span className="text-xl leading-none">{heartRow}</span>}
      />
    </>
  );

  return (
    <GameShell meta={meta} right={liveStats}>
      <Confetti fire={burst} count={70} />

      <div className="flex w-full max-w-sm flex-col items-center select-none">
        {inRound && (
          <>
            <div className="mb-3 flex h-10 items-center gap-2 rounded-full bg-white/20 px-5 text-lg font-black backdrop-blur">
              {phase === "listening" && "👂 Listen…"}
              {phase === "answer" && "🎹 Play it back"}
              {phase === "pause" && (banner ?? "…")}
            </div>

            <p className="mb-3 text-sm font-bold text-white/80">
              Round {roundsCleared + 1} · {melody.length} notes
            </p>

            {/* Neutral listening stage: a pulsing note icon that is identical
                for every pitch. It never shows WHICH key is sounding — that is
                the whole difference from Echo. */}
            <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/25">
              {phase === "listening" ? (
                <span key={notesHeard} className="animate-pop-in text-5xl" aria-hidden>
                  🎵
                </span>
              ) : (
                <span className="animate-bob text-5xl opacity-70" aria-hidden>
                  {phase === "answer" ? "👆" : "🎼"}
                </span>
              )}
            </div>

            {/* Count-only dots: how many notes have sounded / been played back.
                Uniform white, never key-coloured, so no pitch leaks. */}
            <div className="mb-4 flex min-h-3 items-center justify-center gap-1.5">
              {melody.map((_, i) => {
                const filled = phase === "listening" ? i < notesHeard : i < inputIndex;
                return (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full transition ${
                      filled ? "bg-white" : "bg-white/25"
                    }`}
                  />
                );
              })}
            </div>

            {/* The keyboard: low pitch on the left with the longest bar, like a
                xylophone. Bars never light during playback. */}
            <div className="flex w-full items-start justify-center gap-1.5">
              {KEYS.map((key, index) => {
                const lit = tappedKey === index;
                return (
                  <button
                    key={key.id}
                    type="button"
                    aria-label={`Note ${key.name}`}
                    disabled={phase !== "answer"}
                    onPointerDown={() => handleKey(index)}
                    className={`flex flex-1 items-end justify-center rounded-2xl pb-3 text-2xl font-black transition-transform duration-100 disabled:opacity-80 ${
                      lit ? "scale-105" : "scale-100"
                    } ${wrongKey === index ? "animate-shake" : ""}`}
                    style={{
                      minWidth: 44,
                      height: key.barPx,
                      background: key.color,
                      color: key.text,
                      filter: lit ? "brightness(1.25)" : "brightness(1)",
                      boxShadow: lit
                        ? `0 0 24px 6px ${key.color}`
                        : "inset 0 -6px 0 rgba(0,0,0,0.28)",
                    }}
                  >
                    {key.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <BigButton
                variant="ghost"
                onClick={replayMelody}
                disabled={phase !== "answer" || replaysLeft <= 0}
              >
                🔁 Play again ({replaysLeft})
              </BigButton>
            </div>
          </>
        )}

        {phase === "ready" && (
          <Panel>
            <div className="mb-2 text-6xl animate-bob" aria-hidden>
              🎼
            </div>
            <h2 className="text-3xl font-black">Melody Match</h2>
            <p className="mt-2 text-base font-semibold text-slate-600">
              Listen to the tune — the keys stay dark, so use your ears — then tap
              the keys to play it back.
            </p>
            <p className="mt-3 text-xs font-bold text-slate-500">
              ❤️❤️❤️ 3 hearts · no timer · ⭐ at 80 / 200 / 400 pts
            </p>
            {best > 0 && (
              <p className="mt-1 text-sm font-bold text-slate-500">Best: {best} pts</p>
            )}
            <div className="mt-5">
              <BigButton onClick={startGame}>▶ Play</BigButton>
            </div>
          </Panel>
        )}

        {phase === "over" && (
          <Panel>
            <div className="mb-1 text-6xl" aria-hidden>
              {isNewBest ? "🏆" : "🎼"}
            </div>
            {isNewBest && (
              <p className="animate-wiggle text-xl font-black text-rose-500">NEW BEST!</p>
            )}
            <h2 className="mt-1 text-2xl font-black text-slate-800">
              {roundsCleared} {roundsCleared === 1 ? "melody" : "melodies"} matched
            </h2>
            <div className="mt-3 text-5xl font-black tabular-nums text-amber-600">
              {score}
            </div>
            <div className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              points
            </div>
            <div className="mt-3 flex justify-center">
              <StarRow value={earnedStars} />
            </div>
            <p className="mt-2 text-sm font-bold text-slate-500">Best: {best} pts</p>
            <div className="mt-5">
              <BigButton onClick={startGame}>🔁 Play Again</BigButton>
            </div>
          </Panel>
        )}
      </div>
    </GameShell>
  );
}
