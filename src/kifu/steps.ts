import { COLOR_MARK, attemptLabel } from "../shogi/notation.ts";
import type { Color } from "../shogi/position.ts";
import type { Kifu } from "./parseKif.ts";

/** 棋譜上の1ステップ。attempt があれば ply 手目の前の反則試行、なければ ply 手目の指し手 */
export interface StepRef {
  ply: number;
  attempt?: number;
}

export interface KifuStep {
  /** 1 始まりの通し番号（0 は初期局面） */
  index: number;
  ref: StepRef;
  color: Color;
  /** 一覧に出す表記（例: "▲７八銀", "△４六歩打（反則）"） */
  label: string;
}

/** 反則試行と指し手を、起きた順に並べる */
export function kifuSteps(kifu: Kifu): KifuStep[] {
  const steps: KifuStep[] = [];
  for (const move of kifu.moves) {
    move.attemptsBefore.forEach((attempt, i) => {
      steps.push({
        index: steps.length + 1,
        ref: { ply: move.ply, attempt: i },
        color: move.color,
        label: `${COLOR_MARK[move.color]}${attemptLabel(attempt)}（反則）`,
      });
    });
    steps.push({
      index: steps.length + 1,
      ref: { ply: move.ply },
      color: move.color,
      label: COLOR_MARK[move.color] + move.notation,
    });
  }
  return steps;
}

export const sameStep = (a: StepRef, b: StepRef): boolean => a.ply === b.ply && a.attempt === b.attempt;

/** ref のステップ番号。棋譜にない場合は -1 */
export const stepIndexOf = (steps: KifuStep[], ref: StepRef): number =>
  steps.find((s) => sameStep(s.ref, ref))?.index ?? -1;

/** ply 手目の指し手のステップ番号（0 手目は 0） */
export const moveStepIndex = (steps: KifuStep[], ply: number): number => (ply === 0 ? 0 : stepIndexOf(steps, { ply }));
