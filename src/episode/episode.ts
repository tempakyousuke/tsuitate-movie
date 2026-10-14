import type { StepRef } from "../kifu/steps.ts";
import type { View } from "../render/BoardView.tsx";
import type { Color } from "../shogi/position.ts";

/**
 * 1本の動画の台本。public/episodes/<名前>/script.json に保存する（棋譜は同じフォルダの kifu.kif）。
 * エディタで編集するもので、手で書く想定ではない。
 */
export interface Episode {
  version: 1;
  /** 動画の主役（自分）の手番 */
  player: Color;
  speakers: Speaker[];
  /** 棋譜を先頭から区切った区間。最後の区間は最終手まで */
  segments: Segment[];
  settings: EpisodeSettings;
  /** あれば、本編の後に初期局面から最終手までを神視点で再生する（反則も含む） */
  godReplay?: GodReplay;
}

export interface GodReplay {
  /** 1手にかける時間 */
  moveSec: number;
  /** 反則試行1回にかける時間 */
  attemptSec: number;
}

export const DEFAULT_GOD_REPLAY: GodReplay = { moveSec: 0.8, attemptSec: 1.0 };

export interface Speaker {
  id: string;
  name: string;
  engine: "aquestalk" | "aivoice2";
  /** AquesTalkPlayer のプリセット名 */
  preset?: string;
  /** 字幕の名前の色 */
  color: string;
}

export interface Segment {
  id: string;
  /** この区間の最後の手（前の区間の最後の手の次から、この手まで） */
  endPly: number;
  view: View;
  lines: Line[];
}

export interface Line {
  id: string;
  speaker: string;
  /** 字幕に出す文 */
  text: string;
  /** 読み上げに使う文。省略時は text */
  yomi?: string;
  /** このセリフの間に盤面をどこまで進めるか */
  advance?: { to: StepRef; at: LineTiming };
  /** 取り込んだ音声（public/ 以下のパスと、末尾の無音を除いた長さ） */
  voice?: { src: string; durationSec: number };
}

/** セリフのどの時点で操作するか。ratio は 0〜1 */
export type LineTiming = { kind: "start" } | { kind: "end" } | { kind: "ratio"; value: number };

export interface EpisodeSettings {
  /** 冒頭、最初の手までの時間 */
  initialSec: number;
  /** セリフのない区間で、1手にかける時間 */
  autoMoveSec: number;
  /** セリフのない区間で、反則試行1回にかける時間 */
  autoAttemptSec: number;
  /** 最後の手の後に残す時間 */
  endSec: number;
  /** セリフとセリフの間 */
  lineGapSec: number;
  /** 音声がないセリフの長さの見積もり（1文字あたり） */
  charSec: number;
  minLineSec: number;
}

export const DEFAULT_SETTINGS: EpisodeSettings = {
  initialSec: 1.5,
  autoMoveSec: 1.0,
  autoAttemptSec: 1.5,
  endSec: 3,
  lineGapSec: 0.3,
  charSec: 0.13,
  minLineSec: 0.8,
};

export const DEFAULT_SPEAKERS: Speaker[] = [
  { id: "reimu", name: "霊夢", engine: "aquestalk", preset: "れいむ", color: "#e0605a" },
  { id: "marisa", name: "魔理沙", engine: "aquestalk", preset: "まりさ", color: "#e3b94b" },
  { id: "yukari", name: "ゆかり", engine: "aivoice2", color: "#b48ae6" },
];

export const newId = (): string => Math.random().toString(36).slice(2, 10);

/** 棋譜全体を1区間（セリフなし＝自動再生）にした台本 */
export function defaultEpisode(lastPly: number, player: Color, view: View = player): Episode {
  return {
    version: 1,
    player,
    speakers: DEFAULT_SPEAKERS,
    segments: [{ id: newId(), endPly: lastPly, view, lines: [] }],
    settings: DEFAULT_SETTINGS,
  };
}

/** 区間 i の最初の手（1 始まり） */
export const segmentStartPly = (episode: Episode, i: number): number =>
  i === 0 ? 1 : episode.segments[i - 1]!.endPly + 1;

/** ply 手目を含む区間の番号 */
export const segmentIndexOfPly = (episode: Episode, ply: number): number => {
  const i = episode.segments.findIndex((s) => ply <= s.endPly);
  return i === -1 ? episode.segments.length - 1 : i;
};

/** ply 手目の後で区間を2つに分ける。後ろ半分はセリフなしで始まり、前半で ply より先に進めていた指定は外す */
export function splitSegment(episode: Episode, ply: number): Episode {
  const i = segmentIndexOfPly(episode, ply);
  const seg = episode.segments[i]!;
  if (ply >= seg.endPly || ply < segmentStartPly(episode, i)) return episode;
  const first: Segment = {
    ...seg,
    endPly: ply,
    lines: seg.lines.map((l) => (l.advance && l.advance.to.ply > ply ? { ...l, advance: undefined } : l)),
  };
  const second: Segment = { id: newId(), endPly: seg.endPly, view: seg.view, lines: [] };
  const segments = episode.segments.slice();
  segments.splice(i, 1, first, second);
  return { ...episode, segments };
}

/** 区間 i と次の区間を1つにまとめる */
export function mergeWithNext(episode: Episode, i: number): Episode {
  const a = episode.segments[i];
  const b = episode.segments[i + 1];
  if (!a || !b) return episode;
  const segments = episode.segments.slice();
  segments.splice(i, 2, { ...a, endPly: b.endPly, lines: [...a.lines, ...b.lines] });
  return { ...episode, segments };
}

export function updateSegment(episode: Episode, i: number, patch: Partial<Segment>): Episode {
  const segments = episode.segments.slice();
  segments[i] = { ...segments[i]!, ...patch };
  return { ...episode, segments };
}
