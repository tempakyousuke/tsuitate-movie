import type { IllegalAttempt, Kifu } from "../kifu/parseKif.ts";
import { checkInfo, type CheckInfo } from "../shogi/attack.ts";
import { COLOR_MARK, attemptLabel } from "../shogi/notation.ts";
import { squareIndex, type Color, type Piece, type Position, type Square } from "../shogi/position.ts";
import { entryAt, type Timeline } from "../timeline/timeline.ts";

/** 駒が移動元から移動先へ滑るフレーム数 */
export const SLIDE_FRAMES = 8;

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
}

/** frame の時点の画面内容。positions は replay(kifu) の結果 */
export function sceneAt(kifu: Kifu, positions: Position[], timeline: Timeline, frame: number): Scene {
  const { entry, local } = entryAt(timeline, frame);
  const { step } = entry;

  const base: Scene = {
    position: positions[0]!, sliding: null, lastMove: null, attempt: null, ply: 0, caption: null,
    check: null, checkAnnouncedAt: null,
  };
  const settled = (ply: number): Scene => {
    const move = kifu.moves[ply - 1];
    return {
      ...base,
      position: positions[ply]!,
      ply,
      check: checkInfo(positions[ply]!),
      lastMove: move ? { color: move.color, to: move.to } : null,
      caption: move ? { color: move.color, text: COLOR_MARK[move.color] + move.notation } : null,
    };
  };

  switch (step.type) {
    case "initial":
      return base;
    case "end":
      return settled(kifu.moves.length);
    case "attempt": {
      const move = kifu.moves[step.ply - 1]!;
      const attempt = move.attemptsBefore[step.index]!;
      return {
        ...settled(step.ply - 1),
        attempt: { color: move.color, attempt, local },
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
        lastMove: null,
        caption: { color: move.color, text: COLOR_MARK[move.color] + move.notation },
      };
    }
  }
}
