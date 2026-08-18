// The tiny block language behind Code Loops.
//
// A program is a FLAT list of tokens, exactly like Robot Run's arrow list, so
// undo is always "drop the last token" and the queue renders in tap order:
//
//   [repeat x3] [right] [down] [end] [right]
//
// Only one level of nesting is offered (the UI disables `repeat` while a repeat
// is still open), which keeps both the picture and the mental model simple.
// Everything here is pure so the level data can be verified without React.

export type Dir = "up" | "down" | "left" | "right";

export type Token =
  | { kind: "move"; dir: Dir }
  | { kind: "repeat"; count: number }
  | { kind: "end" };

/** Safety net: a compiled program can never run longer than this. */
export const MAX_STEPS = 400;

export const DIR_DEF: Record<Dir, { dx: number; dy: number; glyph: string }> = {
  up: { dx: 0, dy: -1, glyph: "⬆️" },
  down: { dx: 0, dy: 1, glyph: "⬇️" },
  left: { dx: -1, dy: 0, glyph: "⬅️" },
  right: { dx: 1, dy: 0, glyph: "➡️" },
};

export const DIR_ORDER: Dir[] = ["up", "down", "left", "right"];

/** Loop counts a child can pick. Small enough to reason about, big enough to pay. */
export const REPEAT_COUNTS = [2, 3, 4, 5];

export const REPEAT_GLYPH = "🔁";
export const END_GLYPH = "🔚";

/** Index of the repeat block still waiting for an end block, or -1 if none. */
export function openRepeatIndex(program: Token[]): number {
  const open: number[] = [];
  for (let i = 0; i < program.length; i++) {
    const token = program[i];
    if (token.kind === "repeat") open.push(i);
    else if (token.kind === "end") open.pop();
  }
  return open.length === 0 ? -1 : open[open.length - 1];
}

/** A program only runs once every repeat block has been closed. */
export function isBalanced(program: Token[]): boolean {
  return openRepeatIndex(program) === -1;
}

/** How many move blocks are already inside the repeat that is still open. */
export function openBodyLength(program: Token[]): number {
  const open = openRepeatIndex(program);
  if (open === -1) return 0;
  let moves = 0;
  for (let i = open + 1; i < program.length; i++) {
    if (program[i].kind === "move") moves += 1;
  }
  return moves;
}

/**
 * For every token, the index of the repeat block that encloses it (-1 at the
 * top level). Used to tint the loop body in the queue.
 */
export function enclosingRepeats(program: Token[]): number[] {
  const owners: number[] = [];
  const open: number[] = [];
  for (let i = 0; i < program.length; i++) {
    const token = program[i];
    if (token.kind === "end") open.pop();
    owners.push(open.length === 0 ? -1 : open[open.length - 1]);
    if (token.kind === "repeat") open.push(i);
  }
  return owners;
}

/** One robot move, tagged with the blocks that produced it. */
export type Step = {
  dir: Dir;
  /** Index of the move block being executed — highlighted in the queue. */
  tokenIndex: number;
  /** Index of the repeat block driving it, or -1 at the top level. */
  loopIndex: number;
  /** 1-based pass through that repeat block, shown as "2/4". */
  iteration: number;
};

/** Index of the end block that closes the repeat at `open`, or -1. */
function matchingEnd(program: Token[], open: number): number {
  let depth = 0;
  for (let i = open + 1; i < program.length; i++) {
    const token = program[i];
    if (token.kind === "repeat") depth += 1;
    else if (token.kind === "end") {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

function appendBody(
  program: Token[],
  from: number,
  to: number,
  loopIndex: number,
  iteration: number,
  steps: Step[],
): void {
  for (let i = from; i < to && steps.length < MAX_STEPS; i++) {
    const token = program[i];
    if (token.kind === "move") {
      steps.push({ dir: token.dir, tokenIndex: i, loopIndex, iteration });
    }
  }
}

/**
 * Unroll a program into the flat list of moves the robot will walk, one entry
 * per animation tick. Nested repeats are not produced by the UI, so a repeat
 * body contributes its move blocks only.
 */
export function compile(program: Token[]): Step[] {
  const steps: Step[] = [];
  let i = 0;

  while (i < program.length && steps.length < MAX_STEPS) {
    const token = program[i];

    if (token.kind === "move") {
      steps.push({ dir: token.dir, tokenIndex: i, loopIndex: -1, iteration: 1 });
      i += 1;
      continue;
    }

    if (token.kind === "repeat") {
      const end = matchingEnd(program, i);
      const bodyEnd = end === -1 ? program.length : end;
      for (let pass = 1; pass <= token.count; pass++) {
        appendBody(program, i + 1, bodyEnd, i, pass, steps);
      }
      i = bodyEnd + 1;
      continue;
    }

    i += 1; // a stray end block simply does nothing
  }

  return steps;
}
