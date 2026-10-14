import { attackedSquares, checkers } from "./attack.ts";
import {
  HAND_KINDS, PROMOTE, pieceAt, squareIndex, type Color, type HandKind, type Piece, type PieceKind, type Position, type Square,
} from "./position.ts";

/** その段に置くと二度と動けない（行き所のない駒）か */
function isDeadSquare(kind: PieceKind, color: Color, rank: number): boolean {
  const relRank = color === "sente" ? rank : 10 - rank;
  if (kind === "FU" || kind === "KY") return relRank === 1;
  if (kind === "KE") return relRank <= 2;
  return false;
}

const inZone = (color: Color, rank: number) => (color === "sente" ? rank <= 3 : rank >= 7);

/** 手を指した後に、指した側の玉に王手が残っていないか */
function leavesKingSafe(pos: Position, color: Color, board: (Piece | null)[]): boolean {
  return checkers({ ...pos, board, turn: color }, color).length === 0;
}

/**
 * 手番側が王手を解除できる合法手を1つでも持っているか。
 * 詰みの判定に使うので、見つかった時点で打ち切る（打ち歩詰めは攻める側の制限なのでここでは見ない）
 */
function hasEvasion(pos: Position): boolean {
  const color = pos.turn;
  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 1; file <= 9; file++) {
      const from: Square = { file, rank };
      const piece = pieceAt(pos, from);
      if (piece?.color !== color) continue;
      for (const to of attackedSquares(pos, from, piece)) {
        if (pieceAt(pos, to)?.color === color) continue;
        // 成れるなら成る形も試す（行き所のない駒になる不成は指せない）
        const kinds: PieceKind[] = [];
        if (!isDeadSquare(piece.kind, color, to.rank)) kinds.push(piece.kind);
        const promoted = PROMOTE[piece.kind];
        if (promoted && (inZone(color, from.rank) || inZone(color, to.rank))) kinds.push(promoted);
        for (const kind of kinds) {
          const board = pos.board.slice();
          board[squareIndex(from)] = null;
          board[squareIndex(to)] = { color, kind };
          if (leavesKingSafe(pos, color, board)) return true;
        }
      }
    }
  }

  const hand = pos.hands[color];
  for (const kind of HAND_KINDS.filter((k: HandKind) => hand[k] > 0)) {
    for (let file = 1; file <= 9; file++) {
      // 二歩
      if (kind === "FU" && [...Array(9).keys()].some((r) => {
        const p = pieceAt(pos, { file, rank: r + 1 });
        return p?.color === color && p.kind === "FU";
      })) continue;
      for (let rank = 1; rank <= 9; rank++) {
        const to = { file, rank };
        if (pieceAt(pos, to) || isDeadSquare(kind, color, rank)) continue;
        const board = pos.board.slice();
        board[squareIndex(to)] = { color, kind };
        if (leavesKingSafe(pos, color, board)) return true;
      }
    }
  }
  return false;
}

/** 手番側が詰んでいるか（王手がかかっていて、どう指しても王手が残る） */
export function isCheckmate(pos: Position): boolean {
  return checkers(pos, pos.turn).length > 0 && !hasEvasion(pos);
}
