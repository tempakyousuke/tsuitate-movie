import type { IllegalAttempt, Kifu } from "../kifu/parseKif.ts";
import { checkInfo, type CheckInfo } from "../shogi/attack.ts";
import { COLOR_MARK, attemptLabel } from "../shogi/notation.ts";
import { squareIndex, type Color, type Piece, type Position, type Square } from "../shogi/position.ts";
import { SLIDE_FRAMES, entryAt, type Timeline } from "../timeline/timeline.ts";

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
}

/** ply 手目までの反則の回数。attempt を渡すと ply 手目の前の反則のうち attempt 番目までを数える */
export function illegalCountUntil(kifu: Kifu, ply: number, attempt?: number): Record<Color, number> {
  const count: Record<Color, number> = { sente: 0, gote: 0 };
  for (const move of kifu.moves) {
    if (move.ply > ply) break;
    count[move.color] += move.ply === ply && attempt !== undefined ? attempt + 1 : move.attemptsBefore.length;
  }
  return count;
}

/** frame の時点の画面内容。positions は replay(kifu) の結果 */
export function sceneAt(kifu: Kifu, positions: Position[], timeline: Timeline, frame: number): Scene {
  const { entry, local } = entryAt(timeline, frame);
  const { step } = entry;

  const base: Scene = {
    position: positions[0]!, sliding: null, lastMove: null, attempt: null, ply: 0, caption: null,
    check: null, checkAnnouncedAt: null, illegalCount: { sente: 0, gote: 0 },
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
      const move = kifu.moves[step.ply - 1]!;
      const attempt = move.attemptsBefore[step.index]!;
      return {
        ...settled(step.ply - 1),
        attempt: { color: move.color, attempt, local },
        illegalCount: illegalCountUntil(kifu, step.ply, step.index),
        caption: { color: move.color, text: `${COLOR_MARK[move.color]}${attemptLabel(attempt)}` },
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
