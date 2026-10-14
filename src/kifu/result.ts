import { isCheckmate } from "../shogi/mate.ts";
import { opposite, type Color, type Position } from "../shogi/position.ts";
import type { Kifu } from "./parseKif.ts";
import { kifuSteps, type StepRef } from "./steps.ts";

export interface GameResult {
  /** 勝った側。引き分けなら null */
  winner: Color | null;
  /** 勝敗の理由（詰み・投了・時間切れなど） */
  reason: string;
  /** 勝敗が決まったステップ（10回目の反則なら、その反則）。省略時は最終手 */
  at?: StepRef;
}

/** この回数目の反則で負けになる（9回までは指し直せる） */
export const ILLEGAL_LOSS_COUNT = 10;

/** どちらかの反則が累計 ILLEGAL_LOSS_COUNT 回に達したら、その反則で反則負け */
function illegalLoss(kifu: Kifu): GameResult | null {
  const count: Record<Color, number> = { sente: 0, gote: 0 };
  for (const step of kifuSteps(kifu)) {
    if (step.ref.attempt === undefined) continue;
    if (++count[step.color] >= ILLEGAL_LOSS_COUNT) {
      return { winner: opposite(step.color), reason: "反則負け", at: step.ref };
    }
  }
  return null;
}

/**
 * 対局の結果。反則が累計10回に達していればその時点で反則負け。そうでなければ、棋譜に終局の行（投了など）が
 * あればそれを使い、なければ最終局面が詰みかどうかで決める。
 * 将棋クエストの棋譜は終局の行がないことがあり、詰みで終わった対局もそうなる。分からなければ null
 */
export function gameResult(kifu: Kifu, positions: Position[]): GameResult | null {
  const foul = illegalLoss(kifu);
  if (foul) return foul;
  if (kifu.end) {
    // 終局の行の手数は「その手番の側が指す代わりに終わった」位置。奇数なら先手の番
    const toMove: Color = kifu.end.ply % 2 === 1 ? "sente" : "gote";
    switch (kifu.end.reason) {
      case "投了":
      case "反則負け":
        return { winner: opposite(toMove), reason: kifu.end.reason };
      case "切れ負け":
        return { winner: opposite(toMove), reason: "時間切れ" };
      case "詰み":
        return { winner: opposite(toMove), reason: "詰み" };
      case "反則勝ち":
      case "入玉勝ち":
        return { winner: toMove, reason: kifu.end.reason };
      case "千日手":
      case "持将棋":
        return { winner: null, reason: kifu.end.reason };
      default:
        return null;
    }
  }
  const last = positions[kifu.moves.length];
  if (last && kifu.moves.length > 0 && isCheckmate(last)) return { winner: opposite(last.turn), reason: "詰み" };
  return null;
}
