// Pure, framework-free question logic for Clock Quest.
// Kept out of the React component so the game loop stays readable and the
// difficulty/scoring rules are easy to reason about and unit-friendly.

export type Time = {
  /** Displayed hour, 1–12. */
  hour: number;
  /** Minutes past the hour, 0–55. */
  minute: number;
};

export type Question = {
  id: number;
  /** The time the clock hands show. */
  time: Time;
  /** Four formatted options, shuffled, exactly one equals the clock's time. */
  choices: Time[];
  /** How long this question's timer bar lasts, in ms. */
  durationMs: number;
};

/** Difficulty band, ramps every 3 correct answers (capped at 6). */
export function levelFor(correctCount: number): number {
  return Math.min(Math.floor(correctCount / 3), 6);
}

/** Reading a clock takes longer than arithmetic; start generous, never below 3.5s. */
export function durationFor(level: number): number {
  return Math.max(3500, 8000 - level * 700);
}

/** Stars from final score, per the game spec thresholds. */
export function starsFor(score: number): number {
  if (score >= 600) return 3;
  if (score >= 300) return 2;
  if (score >= 120) return 1;
  return 0;
}

/** Format a time as "H:MM", e.g. { hour: 3, minute: 5 } -> "3:05". */
export function formatTime(t: Time): string {
  return `${t.hour}:${String(t.minute).padStart(2, "0")}`;
}

/** Minute hand angle in degrees (0 = pointing at 12, clockwise). */
export function minuteAngle(t: Time): number {
  return t.minute * 6;
}

/** Hour hand angle in degrees; drifts forward as the minutes pass. */
export function hourAngle(t: Time): number {
  return (t.hour % 12) * 30 + t.minute * 0.5;
}

/**
 * Which minute values are allowed at a given difficulty band:
 *  0: on the hour only        (X:00)
 *  1: + half hours            (:30)
 *  2: + quarter hours         (:15 / :45)
 *  3+: every five minutes
 */
function allowedMinutes(level: number): number[] {
  if (level <= 0) return [0];
  if (level === 1) return [0, 30];
  if (level === 2) return [0, 15, 30, 45];
  return [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Wrap an hour value back into the 1–12 range. */
function wrapHour(hour: number): number {
  return ((hour - 1 + 12) % 12) + 1;
}

function timeKey(t: Time): string {
  return `${t.hour}:${t.minute}`;
}

/**
 * Three plausible, distinct wrong times near the truth. Distractors mirror the
 * mistakes kids actually make: misreading the hour hand (off by one or two) and
 * misreading the minutes within the same granularity. Bounded loop + a
 * deterministic padding fallback so it can never spin forever.
 */
function makeChoices(answer: Time, level: number): Time[] {
  const minutes = allowedMinutes(level);
  const byKey = new Map<string, Time>([[timeKey(answer), answer]]);

  let guard = 0;
  while (byKey.size < 4 && guard < 60) {
    guard++;
    const roll = Math.random();
    let candidate: Time;
    if (roll < 0.45) {
      // Wrong hour, same minutes.
      candidate = { hour: wrapHour(answer.hour + rand(-2, 2)), minute: answer.minute };
    } else if (roll < 0.8) {
      // Same hour, wrong minutes.
      candidate = { hour: answer.hour, minute: pick(minutes) };
    } else {
      // Both off — the trickiest mix-up.
      candidate = { hour: wrapHour(answer.hour + (Math.random() < 0.5 ? -1 : 1)), minute: pick(minutes) };
    }
    byKey.set(timeKey(candidate), candidate);
  }

  // Padding fallback for tiny option pools (e.g. level 0 has only ":00").
  let step = 1;
  while (byKey.size < 4) {
    const candidate: Time = { hour: wrapHour(answer.hour + step), minute: answer.minute };
    byKey.set(timeKey(candidate), candidate);
    step++;
  }

  return shuffle([...byKey.values()]);
}

export function genQuestion(level: number, id: number): Question {
  const minutes = allowedMinutes(level);
  const time: Time = { hour: rand(1, 12), minute: pick(minutes) };
  return {
    id,
    time,
    choices: makeChoices(time, level),
    durationMs: durationFor(level),
  };
}
