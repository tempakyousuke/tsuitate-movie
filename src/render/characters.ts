import type { Episode, Speaker } from "../episode/episode.ts";

/**
 * 立ち絵（きつね式ゆっくり）。素材は再配布できないのでリポジトリには入れず、assets/<フォルダ>/ に展開し、
 * `pnpm characters:link` で作る public/characters/<話者id> のリンク経由で staticFile から読む。
 * パーツはすべて同じ 400x320 の画像で、LAYERS の順に重ねると1人分になる。
 * 目と口は「00」が基本形で、「00a」〜「00e」が段階（目は閉じていく、口は開いていく）。
 */
export const SPRITE_W = 400;
export const SPRITE_H = 320;

/** 立ち絵がある話者（public/characters/<id> にリンクがある） */
const SPRITE_IDS = new Set(["reimu", "marisa", "yukari"]);

/** 重ねる順（下から）。髪は目の上に前髪を重ね、眉は前髪の上に出す */
const LAYERS = ["体", "顔", "口", "目", "髪", "眉"] as const;

/** 表情。値はパーツのファイル名（拡張子なし）。全/セット.txt の 01（顔00-眉03-目00-口00-体00）に相当 */
export interface Expression {
  体: string;
  顔: string;
  眉: string;
  /** まばたきの段階は末尾に a〜e を付けたファイル */
  目: string;
  /** 口パクの段階は末尾に a〜e を付けたファイル */
  口: string;
  髪: string;
}

export const DEFAULT_EXPRESSION: Expression = { 体: "00", 顔: "00a", 眉: "03", 目: "00", 口: "00", 髪: "00" };

const STAGES = ["", "a", "b", "c", "d", "e"];

/** 1人分のパーツの画像パス（public/ からの相対パス）。eye・mouth は 0（基本形）〜5（e） */
export function spriteLayers(speakerId: string, expression: Expression, eye: number, mouth: number): string[] {
  return LAYERS.map((layer) => {
    const name = layer === "目" ? expression.目 + STAGES[eye] : layer === "口" ? expression.口 + STAGES[mouth] : expression[layer];
    return `characters/${speakerId}/${layer}/${name}.png`;
  });
}

/** 文字列から決まる疑似乱数（まばたきの間隔を人ごとにずらす） */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** まばたきで目を閉じていく段階（1フレームずつ） */
const BLINK = [2, 4, 5, 4, 2];

/** frame の時点の目の段階（0 = 開いている）。3〜6秒おきにまばたきする */
export function eyeStage(frame: number, fps: number, seed: string): number {
  const random = seeded(seed);
  let start = Math.round(fps * (1 + random() * 3));
  while (start + BLINK.length <= frame) start += Math.round(fps * (3 + random() * 3));
  return frame >= start ? BLINK[frame - start]! : 0;
}

/** 音声がないセリフで口を開け閉めする段階（1フレームずつ、1周で約1音） */
const TALK = [1, 3, 5, 4, 2, 0];

/** 話している間の口の段階（0 = 閉じている）。local はセリフが始まってからのフレーム数 */
export const mouthStage = (local: number): number => TALK[local % TALK.length]!;

export type Side = "left" | "right";

/** ゆっくり（AquesTalk）は左、それ以外（ゆかり）は右に置いて向き合わせる */
export const sideOf = (speaker: Speaker): Side => (speaker.engine === "aquestalk" ? "left" : "right");

/** 台本でセリフがある話者だけを、左右に分けて返す（まだ登場しない人は出さない） */
export function castOf(episode: Episode): Record<Side, Speaker[]> {
  const used = new Set(episode.segments.flatMap((s) => s.lines.map((l) => l.speaker)));
  const cast = episode.speakers.filter((s) => used.has(s.id) && SPRITE_IDS.has(s.id));
  return { left: cast.filter((s) => sideOf(s) === "left"), right: cast.filter((s) => sideOf(s) === "right") };
}
