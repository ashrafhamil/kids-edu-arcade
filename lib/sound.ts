// Zero-asset sound engine built on the Web Audio API.
// All sounds are synthesized at runtime, so there are no audio files to license,
// host, or load. Safe on the server: the AudioContext is created lazily on the
// first browser gesture and every public function no-ops outside the browser.

let ctx: AudioContext | null = null;
let muted = false;

const MUTE_KEY = "arcade:muted";

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers suspend the context until a gesture; resume opportunistically.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Read persisted mute preference. Call once on mount. */
export function initMute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(v: boolean): void {
  muted = v;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MUTE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

type ToneOpts = {
  freq: number;
  durMs?: number;
  type?: OscillatorType;
  gain?: number;
  /** glide to this frequency over the note duration */
  slideTo?: number;
  /** delay before the note starts, in seconds */
  delay?: number;
};

function tone({
  freq,
  durMs = 140,
  type = "sine",
  gain = 0.18,
  slideTo,
  delay = 0,
}: ToneOpts): void {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const dur = durMs / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  // Quick attack, smooth decay — keeps clicks out and feels "soft" for kids.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function chord(freqs: number[], durMs: number, type: OscillatorType = "triangle"): void {
  freqs.forEach((f, i) => tone({ freq: f, durMs, type, gain: 0.13, delay: i * 0.02 }));
}

// Musical note frequencies used by the cheerful little jingles below.
const N = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
  E6: 1318.5,
  G6: 1567.98,
};

/** Public sound effects. Each is tuned to feel friendly and "juicy" for kids. */
export const sfx = {
  /** Light UI tap. */
  click: () => tone({ freq: 440, durMs: 70, type: "triangle", gain: 0.12 }),
  /** Bubble / item pop. */
  pop: () => tone({ freq: 660, durMs: 90, type: "sine", gain: 0.16, slideTo: 990 }),
  /** Correct answer — bright rising third. */
  correct: () => {
    tone({ freq: N.E5, durMs: 110, type: "triangle", gain: 0.16 });
    tone({ freq: N.G5, durMs: 140, type: "triangle", gain: 0.16, delay: 0.09 });
  },
  /** Wrong / miss — soft descending buzz, never harsh. */
  wrong: () => tone({ freq: 220, durMs: 200, type: "sawtooth", gain: 0.1, slideTo: 140 }),
  /** Combo / streak chime — pitch rises with the streak length. */
  combo: (streak: number) =>
    tone({
      freq: 520 + Math.min(streak, 12) * 70,
      durMs: 120,
      type: "square",
      gain: 0.12,
    }),
  /** Level up fanfare. */
  levelUp: () => {
    chord([N.C5, N.E5, N.G5], 130);
    chord([N.E5, N.G5, N.C6], 200, "triangle");
  },
  /** Win / celebration jingle. */
  win: () => {
    const seq = [N.C5, N.E5, N.G5, N.C6, N.E6];
    seq.forEach((f, i) => tone({ freq: f, durMs: 160, type: "triangle", gain: 0.16, delay: i * 0.1 }));
    tone({ freq: N.G6, durMs: 320, type: "triangle", gain: 0.16, delay: seq.length * 0.1 });
  },
  /** Game over — gentle, not punishing. */
  gameOver: () => {
    [N.G5, N.E5, N.C5].forEach((f, i) =>
      tone({ freq: f, durMs: 220, type: "sine", gain: 0.14, delay: i * 0.14 })
    );
  },
  /** Countdown / metronome tick. */
  tick: () => tone({ freq: 880, durMs: 50, type: "square", gain: 0.08 }),
  /** Arbitrary musical note (used by Echo's sequence pads). */
  note: (freq: number, durMs = 320) => tone({ freq, durMs, type: "sine", gain: 0.2 }),
};

/** Resume the audio context — call inside the first user gesture handler. */
export function unlockAudio(): void {
  const a = ac();
  if (a && a.state === "suspended") void a.resume();
}
