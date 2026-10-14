import type { Kifu } from "../kifu/parseKif.ts";

/** 画面に出す1つの場面 */
export type Step =
  | { type: "initial" }
  /** ply 手目を指す前の、index 番目の反則試行 */
  | { type: "attempt"; ply: number; index: number }
  | { type: "move"; ply: number }
  | { type: "end" };

export interface TimelineEntry {
  step: Step;
  startFrame: number;
  durationFrames: number;
}

export interface Timeline {
  entries: TimelineEntry[];
  durationInFrames: number;
}

export interface AutoTimelineOptions {
  fps: number;
  initialSec?: number;
  moveSec?: number;
  attemptSec?: number;
  endSec?: number;
}

/** 台本がないときの既定のタイムライン。反則試行 → 実際の手、を一定間隔で並べる */
export function autoTimeline(kifu: Kifu, opts: AutoTimelineOptions): Timeline {
  const { fps, initialSec = 1.5, moveSec = 1.0, attemptSec = 1.5, endSec = 3 } = opts;
  const steps: [Step, number][] = [[{ type: "initial" }, initialSec]];
  for (const move of kifu.moves) {
    move.attemptsBefore.forEach((_, index) => steps.push([{ type: "attempt", ply: move.ply, index }, attemptSec]));
    steps.push([{ type: "move", ply: move.ply }, moveSec]);
  }
  steps.push([{ type: "end" }, endSec]);

  const entries: TimelineEntry[] = [];
  let frame = 0;
  for (const [step, sec] of steps) {
    const durationFrames = Math.max(1, Math.round(sec * fps));
    entries.push({ step, startFrame: frame, durationFrames });
    frame += durationFrames;
  }
  return { entries, durationInFrames: frame };
}

/** frame の時点で表示中の場面と、その場面が始まってからのフレーム数 */
export function entryAt(timeline: Timeline, frame: number): { entry: TimelineEntry; local: number } {
  const { entries } = timeline;
  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (entries[mid]!.startFrame <= frame) lo = mid;
    else hi = mid - 1;
  }
  const entry = entries[lo]!;
  return { entry, local: frame - entry.startFrame };
}
