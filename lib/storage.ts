// Tiny, SSR-safe localStorage wrapper for per-game progress and high scores.
// No backend, no accounts, no tracking — everything lives in the child's browser.

const PREFIX = "arcade:";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or privacy mode — fail silently, the game still works */
  }
}

/** Best score for a game. */
export function getBest(gameId: string): number {
  return read<number>(`best:${gameId}`, 0);
}

/**
 * Record a score; returns true when it beats the stored best (used to trigger
 * "NEW BEST!" celebrations).
 */
export function recordBest(gameId: string, score: number): boolean {
  const prev = getBest(gameId);
  if (score > prev) {
    write(`best:${gameId}`, score);
    return true;
  }
  return false;
}

/** Highest level / stage reached (defaults to 1). */
export function getLevel(gameId: string): number {
  return read<number>(`level:${gameId}`, 1);
}

export function setLevel(gameId: string, level: number): void {
  if (level > getLevel(gameId)) write(`level:${gameId}`, level);
}

/** Stars earned for a game (0–3), shown on the home hub cards. */
export function getStars(gameId: string): number {
  return read<number>(`stars:${gameId}`, 0);
}

export function setStars(gameId: string, stars: number): void {
  if (stars > getStars(gameId)) write(`stars:${gameId}`, stars);
}

/** Generic escape hatches for game-specific blobs. */
export function loadJSON<T>(key: string, fallback: T): T {
  return read<T>(key, fallback);
}

export function saveJSON<T>(key: string, value: T): void {
  write(key, value);
}
