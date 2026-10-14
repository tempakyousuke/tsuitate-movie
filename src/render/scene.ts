import { attemptsAt, colorOfPly, type IllegalAttempt, type Kifu } from "../kifu/parseKif.ts";
import type { GameResult } from "../kifu/result.ts";
import { compareSteps } from "../kifu/steps.ts";
import { checkInfo, type CheckInfo } from "../shogi/attack.ts";
import { COLOR_MARK, attemptLabel } from "../shogi/notation.ts";
import { squareIndex, type Color, type Piece, type Position, type Square } from "../shogi/position.ts";
import { SLIDE_FRAMES, entryAt, type Step, type Timeline } from "../timeline/timeline.ts";

export interface Scene {
  /** 盤に置く局面（移動中の駒は除いてある） */
  position: Position;
  /** 移動中の駒。t は 0〜1 */
  sliding: { piece: Piece; from: Square | null; to: Square; t: number } | null;
  /** 直前に指された手（ハイライト用） */
  lastMove: { color: Color; to: Square } | null;
  /** 表示中の反則試行。local は試行が始まってからのフレーム数 */
  attempt: { color: Color; attempt: IllegalAttempt; local: number } | null;
  /** 何手目まで進んだか */
  ply: number;
  /** 手の表記（例: "▲７八銀"） */
  caption: { color: Color; text: string } | null;
  /** 表示中の局面で王手がかかっていればその情報。審判が両者に告げるので視点によらず出す */
  check: CheckInfo | null;
  /** 王手が告げられてからのフレーム数。この場面で告げられたのでなければ null */
  checkAnnouncedAt: number | null;
  /** ここまでに告げられた反則の回数（表示中の反則を含む）。審判が告げるので両者に見える */
  illegalCount: Record<Color, number>;
  /** 最終手が指された後なら対局の結果（このときは王手の告知を出さない）。local は告げてからのフレーム数 */
  result: { result: GameResult; local: number } | null;
}

/** ply 手目までの反則の回数。attempt を渡すと ply 手目の前の反則のうち attempt 番目までを数える */
export function illegalCountUntil(kifu: Kifu, ply: number, attempt?: number): Record<Color, number> {
  const count: Record<Color, number> = { sente: 0, gote: 0 };
  for (let p = 1; p <= ply; p++) {
    count[colorOfPly(p)] += p === ply && attempt !== undefined ? attempt + 1 : attemptsAt(kifu, p).length;
  }
  return count;
}

/** 反則で勝敗が決まったときは、反則のスタンプが出てから勝敗を出す */
const RESULT_AFTER_ATTEMPT_FRAMES = 24;

/** frame の時点の画面内容。positions は replay(kifu) の結果、result は gameResult() の結果 */
export function sceneAt(
  kifu: Kifu, positions: Position[], timeline: Timeline, frame: number, result: GameResult | null = null,
): Scene {
  const { entry, local } = entryAt(timeline, frame);
  const scene = sceneOfStep(kifu, positions, entry.step, local);
  const { step } = entry;
  if (!result || step.type === "initial") return scene;

  // 勝敗が決まったステップ（最終手、または10回目の反則）以降は勝敗を出し、王手の告知は出さない
  const decidedAt = result.at ?? { ply: kifu.moves.length };
  const order = compareSteps({ ply: step.ply, attempt: step.type === "attempt" ? step.index : undefined }, decidedAt);
  const delay = step.type === "move" ? SLIDE_FRAMES : RESULT_AFTER_ATTEMPT_FRAMES;
  if (order < 0 || (order === 0 && local < delay)) return scene;
  return { ...scene, checkAnnouncedAt: null, result: { result, local: order === 0 ? local - delay : Number.MAX_SAFE_INTEGER } };
}

function sceneOfStep(kifu: Kifu, positions: Position[], step: Step, local: number): Scene {
  const base: Scene = {
    position: positions[0]!, sliding: null, lastMove: null, attempt: null, ply: 0, caption: null,
    check: null, checkAnnouncedAt: null, illegalCount: { sente: 0, gote: 0 }, result: null,
  };
  const settled = (ply: number): Scene => {
    const move = kifu.moves[ply - 1];
    return {
      ...base,
      position: positions[ply]!,
      ply,
      illegalCount: illegalCountUntil(kifu, ply),
      check: checkInfo(positions[ply]!),
      lastMove: move ? { color: move.color, to: move.to } : null,
      caption: move ? { color: move.color, text: COLOR_MARK[move.color] + move.notation } : null,
    };
  };

  switch (step.type) {
    case "initial":
      return base;
    case "attempt": {
      // 終局の行の後の反則（指せずに終わった手番の反則）もここに来る
      const color = colorOfPly(step.ply);
      const attempt = attemptsAt(kifu, step.ply)[step.index]!;
      return {
        ...settled(step.ply - 1),
        attempt: { color, attempt, local },
        illegalCount: illegalCountUntil(kifu, step.ply, step.index),
        caption: { color, text: `${COLOR_MARK[color]}${attemptLabel(attempt)}` },
      };
    }
    case "move": {
      if (local >= SLIDE_FRAMES) {
        const scene = settled(step.ply);
        return { ...scene, checkAnnouncedAt: scene.check ? local - SLIDE_FRAMES : null };
      }
      const move = kifu.moves[step.ply - 1]!;
      const before = positions[step.ply - 1]!;
      const board = before.board.slice();
      if (move.from) board[squareIndex(move.from)] = null;
      return {
        ...settled(step.ply - 1),
        position: { ...before, board },
        sliding: { piece: { color: move.color, kind: move.piece }, from: move.from, to: move.to, t: local / SLIDE_FRAMES },
        ply: step.ply,
        illegalCount: illegalCountUntil(kifu, step.ply),
        lastMove: null,
        caption: { color: move.color, text: COLOR_MARK[move.color] + move.notation },
      };
    }
  }
}
