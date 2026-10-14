import { freshVoice, type Episode, type Line, type LineTiming } from "../episode/episode.ts";
import type { Kifu } from "../kifu/parseKif.ts";
import { kifuSteps, moveStepIndex, stepIndexOf, type KifuStep } from "../kifu/steps.ts";
import type { View } from "../render/BoardView.tsx";

/** 駒が移動元から移動先へ滑るフレーム数 */
export const SLIDE_FRAMES = 8;
/** 盤面の場面どうしの最小間隔。滑り終わる前に次の手が始まらないようにする */
const MIN_STEP_FRAMES = SLIDE_FRAMES + 2;

/** 盤面に出す1つの場面 */
export type Step =
  | { type: "initial" }
  /** ply 手目を指す前の、index 番目の反則試行 */
  | { type: "attempt"; ply: number; index: number }
  | { type: "move"; ply: number };

export interface TimelineEntry {
  step: Step;
  startFrame: number;
  durationFrames: number;
}

export interface LineCue {
  lineId: string;
  segmentIndex: number;
  speaker: string;
  text: string;
  voice: Line["voice"];
  startFrame: number;
  durationFrames: number;
}

export interface Timeline {
  /** 盤面の場面。すき間なく並び、最後の場面は動画の終わりまで続く */
  entries: TimelineEntry[];
  lines: LineCue[];
  /** 視点の切り替え（frame 以降はその視点） */
  views: { frame: number; view: View }[];
  /** 区間 i の開始フレーム */
  segmentStarts: number[];
  /** 本編の後の神視点の再生が始まるフレーム（再生しないなら null） */
  replayStart: number | null;
  durationInFrames: number;
}

const toStep = (s: KifuStep): Step =>
  s.ref.attempt === undefined ? { type: "move", ply: s.ref.ply } : { type: "attempt", ply: s.ref.ply, index: s.ref.attempt };

/** 音声があればその長さ、なければ文字数から見積もった長さ（秒） */
export function lineDurationSec(line: Line, episode: Episode): number {
  const voice = freshVoice(line);
  if (voice) return voice.durationSec;
  const chars = [...(line.yomi || line.text)].length;
  return Math.max(episode.settings.minLineSec, chars * episode.settings.charSec);
}

const timingSec = (at: LineTiming, durationSec: number): number =>
  at.kind === "start" ? 0 : at.kind === "end" ? durationSec : durationSec * Math.min(1, Math.max(0, at.value));

/**
 * 台本から動画のタイムラインを作る。
 * セリフのない区間は一定間隔で自動再生し、セリフのある区間はセリフの advance に従って進め、
 * 区間の最後の手まで届かなかった分はセリフの後に自動再生する。
 */
export function buildTimeline(kifu: Kifu, episode: Episode, fps: number): Timeline {
  const { settings } = episode;
  const steps = kifuSteps(kifu);
  const stepSec = (s: KifuStep) => (s.ref.attempt === undefined ? settings.autoMoveSec : settings.autoAttemptSec);

  const events: { sec: number; step: Step }[] = [];
  const lines: LineCue[] = [];
  const views: Timeline["views"] = [];
  const segmentStarts: number[] = [];
  const f = (sec: number) => Math.round(sec * fps);

  let t = settings.initialSec;
  let current = 0;
  /** 盤面の自動再生がいつまで続くか */
  let boardBusyUntil = 0;
  const playSteps = (from: number, to: number, startSec: number, sec = stepSec): number => {
    let s = startSec;
    for (let i = from + 1; i <= to; i++) {
      const step = steps[i - 1]!;
      events.push({ sec: s, step: toStep(step) });
      s += sec(step);
    }
    return s;
  };

  episode.segments.forEach((seg, segmentIndex) => {
    const segStart = segmentIndex === 0 ? 0 : t;
    segmentStarts.push(f(segStart));
    views.push({ frame: f(segStart), view: seg.view });
    const end = Math.max(current, moveStepIndex(steps, Math.min(seg.endPly, kifu.moves.length)));

    for (const line of seg.lines) {
      const dur = lineDurationSec(line, episode);
      lines.push({
        lineId: line.id, segmentIndex, speaker: line.speaker, text: line.text, voice: freshVoice(line),
        startFrame: f(t), durationFrames: Math.max(1, f(dur)),
      });
      if (line.advance) {
        const target = Math.min(end, stepIndexOf(steps, line.advance.to));
        if (target > current) {
          boardBusyUntil = playSteps(current, target, Math.max(t + timingSec(line.advance.at, dur), boardBusyUntil));
          current = target;
        }
      }
      t += dur + settings.lineGapSec;
    }

    if (current < end) {
      t = playSteps(current, end, Math.max(t, boardBusyUntil));
      boardBusyUntil = t;
      current = end;
    }
    t = Math.max(t, boardBusyUntil);
  });
  t += settings.endSec;

  // 本編の最終局面を endSec だけ見せた後、初期局面に戻して神視点で最後まで並べ直す
  let replayStartSec: number | null = null;
  const replay = episode.godReplay;
  if (replay) {
    replayStartSec = t;
    events.push({ sec: t, step: { type: "initial" } });
    views.push({ frame: f(t), view: "god" });
    const replaySec = (s: KifuStep) => (s.ref.attempt === undefined ? replay.moveSec : replay.attemptSec);
    t = playSteps(0, steps.length, t + settings.initialSec, replaySec) + settings.endSec;
  }

  const durationInFrames = Math.max(1, f(t));
  const entries: TimelineEntry[] = [{ step: { type: "initial" }, startFrame: 0, durationFrames: 0 }];
  for (const { sec, step } of events) {
    const prev = entries.at(-1)!;
    const minStart = entries.length === 1 ? 0 : prev.startFrame + MIN_STEP_FRAMES;
    entries.push({ step, startFrame: Math.max(f(sec), minStart), durationFrames: 0 });
  }
  const last = entries.at(-1)!;
  const total = Math.max(durationInFrames, last.startFrame + MIN_STEP_FRAMES);
  entries.forEach((e, i) => {
    e.durationFrames = (entries[i + 1]?.startFrame ?? total) - e.startFrame;
  });

  // 神視点の再生の頭は、盤面の場面（初期局面に戻る）と同じフレームにそろえる
  const replayEntry = replayStartSec === null ? undefined : entries.find((e, i) => i > 0 && e.step.type === "initial");
  const replayStart = replayEntry?.startFrame ?? null;
  if (replayStart !== null) views[views.length - 1]!.frame = replayStart;

  return {
    entries: entries.filter((e) => e.durationFrames > 0), lines, views, segmentStarts, replayStart, durationInFrames: total,
  };
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

export function viewAt(timeline: Timeline, frame: number): View {
  let view = timeline.views[0]?.view ?? "god";
  for (const v of timeline.views) {
    if (v.frame > frame) break;
    view = v.view;
  }
  return view;
}

export const lineAt = (timeline: Timeline, frame: number): LineCue | null =>
  timeline.lines.find((l) => frame >= l.startFrame && frame < l.startFrame + l.durationFrames) ?? null;
