import type { Episode, Speaker, Voice } from "../episode/episode.ts";

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
export const hasSprite = (speakerId: string): boolean => SPRITE_IDS.has(speakerId);

/** 重ねる順（下から）。髪は目の上に前髪を重ね、眉は前髪の上に出す */
const LAYERS = ["体", "顔", "口", "目", "髪", "眉"] as const;

/** 表情。値はパーツの番号で、全/セット.txt の書き方（顔00-眉03-目00-口00）と同じ。体と髪はいつも 00 */
export interface Expression {
  顔: string;
  眉: string;
  目: string;
  口: string;
}

/** 「顔00-眉03-目00-口00」の形（全/セット.txt の書き方）から */
const parts = (spec: string): Expression =>
  Object.fromEntries(spec.split("-").map((p) => [p[0], p.slice(1)])) as unknown as Expression;

/**
 * セリフで選べる表情。全/セット.txt のセットから選んで名前を付けた（3人とも同じ番号で同じ表情になる）。
 * 先頭が基本の表情で、表情を指定しないセリフや、話していない間はこれ
 */
export const EXPRESSIONS = [
  { id: "normal", label: "普通", ...parts("顔00-眉03-目00-口00") }, // セット01
  { id: "smile", label: "笑顔", ...parts("顔00-眉04-目31-口14") }, // 55
  { id: "grin", label: "にっこり", ...parts("顔00-眉05-目27-口10") }, // 54
  { id: "smug", label: "ドヤ顔", ...parts("顔00-眉04-目02-口10") }, // 61
  { id: "surprised", label: "驚き", ...parts("顔00-眉05-目05-口05") }, // 113
  { id: "shout", label: "叫び", ...parts("顔00-眉01-目06-口19") }, // 73
  { id: "flustered", label: "焦り", ...parts("顔00-眉06-目06-口03") }, // 66
  { id: "puzzled", label: "困惑", ...parts("顔00-眉04-目23-口09") }, // 56
  { id: "angry", label: "怒り", ...parts("顔00-眉04-目03-口26") }, // 22
  { id: "jito", label: "ジト目", ...parts("顔00-眉08-目01-口09") }, // 49（目10〜13 は片目を閉じていくウインクで、基本形は普通の目と変わらない）
  { id: "thinking", label: "考え中", ...parts("顔00-眉09-目19-口02") }, // 26
  { id: "shy", label: "照れ", ...parts("顔01-眉04-目01-口10") }, // 38
  { id: "teary", label: "涙目", ...parts("顔00-眉03-目28-口03") }, // 51
  { id: "crying", label: "号泣", ...parts("顔00-眉11-目08-口17") }, // 95
  { id: "pale", label: "青ざめ", ...parts("顔03-眉07-目06-口11") }, // 16
  // id は「不穏」（セット07）だったころのまま（台本に保存済みの指定を変えないため）
  { id: "gloomy", label: "企み", ...parts("顔04-眉00-目00-口00") }, // 172
] as const satisfies readonly (Expression & { id: string; label: string })[];

export type ExpressionId = (typeof EXPRESSIONS)[number]["id"];

export const DEFAULT_EXPRESSION: Expression = EXPRESSIONS[0];

/** 全/セット.txt（Shift_JIS をデコードした文字列）の各行「01=顔00-眉03-目00-口00-体00」から、番号と表情 */
export function parseExpressionSets(text: string): { no: string; expression: Expression }[] {
  return text.split(/\r?\n/).flatMap((row) => {
    const m = /^(\d+)=(.+)$/.exec(row.trim());
    return m ? [{ no: m[1]!, expression: parts(m[2]!) }] : [];
  });
}

/** セットと同じ組み合わせの、セリフで選べる表情（なければ undefined） */
export const namedExpression = (e: Expression) =>
  EXPRESSIONS.find((n) => n.顔 === e.顔 && n.眉 === e.眉 && n.目 === e.目 && n.口 === e.口);

/** セリフで指定した表情（指定がない・知らない id なら基本の表情） */
export const expressionOf = (id?: string): Expression => EXPRESSIONS.find((e) => e.id === id) ?? DEFAULT_EXPRESSION;

const STAGES = ["", "a", "b", "c", "d", "e"];

/**
 * 顔のファイル名は番号の後に a か b が付く。a は頬の赤みなどをそのまま重ねる絵、
 * b は白い頭のシルエットに影（青ざめ・暗い顔）を描いた絵で、乗算で重ねる（そのまま重ねると頭が白く塗りつぶされる）
 */
const FACE_FILES: Record<string, string> = {
  "00": "00a", "01": "01a", "02": "02b", "03": "03b", "04": "04b", "05": "05a", "06": "06a", "07": "07a",
};

/**
 * 目のファイル名（段階 0〜5。段階がない目は1枚）。素材によって段階の付け方が違う:
 * 00〜06・14〜17 は a〜e、07〜09・18 は a〜e の後に「-15」、10〜13 は k〜o、19 以降は段階なし（23・34 は「z」付き）
 */
function eyeFiles(n: string): string[] {
  const num = Number(n);
  if (num <= 6 || (num >= 14 && num <= 17)) return STAGES.map((s) => n + s);
  if ((num >= 7 && num <= 9) || num === 18) return STAGES.map((s) => `${n}${s}-15`);
  if (num >= 10 && num <= 13) return ["", "k", "l", "m", "n", "o"].map((s) => n + s);
  return [n === "23" || n === "34" ? `${n}z` : n];
}

/** 口のファイル名（段階 0〜5）。19 以降は段階がなく、口パクしない */
const mouthFiles = (n: string): string[] => (Number(n) <= 18 ? STAGES.map((s) => n + s) : [n]);

/** 乗算で重ねるパーツか（顔の b） */
export const isMultiplyLayer = (src: string): boolean => /\/顔\/\d+b\.png$/.test(src);

/** 1人分のパーツ（下から重ねる順）。目と口は段階の数だけ（段階がなければ1枚）、ほかは1枚 */
export function spriteParts(speakerId: string, expression: Expression): { layer: string; srcs: string[] }[] {
  const names: Record<(typeof LAYERS)[number], string[]> = {
    体: ["00"],
    顔: [FACE_FILES[expression.顔] ?? `${expression.顔}a`],
    口: mouthFiles(expression.口),
    目: eyeFiles(expression.目),
    髪: ["00"],
    眉: [expression.眉],
  };
  return LAYERS.map((layer) => ({ layer, srcs: names[layer].map((name) => `characters/${speakerId}/${layer}/${name}.png`) }));
}

/** 台本でその話者が使う表情（基本の表情を含む） */
export function expressionsUsed(episode: Episode, speakerId: string): Expression[] {
  const ids = episode.segments.flatMap((s) => s.lines.filter((l) => l.speaker === speakerId).map((l) => l.expression));
  return [...new Set([DEFAULT_EXPRESSION, ...ids.map(expressionOf)])];
}

/**
 * 立ち絵を描くための、層ごとの全画像と、今見せる1枚。
 * 再生中に画像の src を差し替えると、プレビューが読み込みのたびに止まって音声が少し巻き戻る
 * （セリフが繰り返して聞こえる）ので、台本で使う表情の全段階を最初から重ねておき、見せる1枚だけを切り替える
 */
export function spriteLayers(
  speakerId: string, used: Expression[], current: Expression, eye: number, mouth: number,
): { layer: string; srcs: string[]; shown: string }[] {
  const all = used.map((e) => spriteParts(speakerId, e));
  return spriteParts(speakerId, current).map(({ layer, srcs }, i) => {
    const stage = layer === "目" ? eye : layer === "口" ? mouth : 0;
    return {
      layer,
      srcs: [...new Set(all.flatMap((p) => p[i]!.srcs))],
      // 段階のないパーツ（閉じた目、大きく開けた口など）は段階によらず同じ1枚
      shown: srcs[Math.min(stage, srcs.length - 1)]!,
    };
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

/**
 * 話している間の口の段階（0 = 閉じている）。local はセリフが始まってからのフレーム数。
 * 音声があればその音量に合わせ、なければ一定のリズムで開け閉めする
 */
export const mouthStage = (local: number, voice?: Voice): number =>
  voice ? Number(voice.mouth[local] ?? 0) : TALK[local % TALK.length]!;

export type Side = "left" | "right";

/** ゆっくり（AquesTalk）は左、それ以外（ゆかり）は右に置いて向き合わせる */
export const sideOf = (speaker: Speaker): Side => (speaker.engine === "aquestalk" ? "left" : "right");

/** 台本でセリフがある話者だけを、左右に分けて返す（まだ登場しない人は出さない） */
export function castOf(episode: Episode): Record<Side, Speaker[]> {
  const used = new Set(episode.segments.flatMap((s) => s.lines.map((l) => l.speaker)));
  const cast = episode.speakers.filter((s) => used.has(s.id) && SPRITE_IDS.has(s.id));
  return { left: cast.filter((s) => sideOf(s) === "left"), right: cast.filter((s) => sideOf(s) === "right") };
}
