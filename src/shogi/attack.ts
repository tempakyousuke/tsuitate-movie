import { opposite, pieceAt, type Color, type Piece, type PieceKind, type Position, type Square } from "./position.ts";

/** [筋方向, 前方向]。前方向は先手なら段が減る向き */
type Dir = readonly [number, number];

const FORWARD3: Dir[] = [[-1, 1], [0, 1], [1, 1]];
const GOLD: Dir[] = [...FORWARD3, [-1, 0], [1, 0], [0, -1]];
const ORTHO: Dir[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAG: Dir[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const STEPS: Record<PieceKind, Dir[]> = {
  FU: [[0, 1]],
  KY: [],
  KE: [[-1, 2], [1, 2]],
  GI: [...FORWARD3, [-1, -1], [1, -1]],
  KI: GOLD, TO: GOLD, NY: GOLD, NK: GOLD, NG: GOLD,
  KA: [],
  HI: [],
  OU: [...ORTHO, ...DIAG],
  UM: ORTHO,
  RY: DIAG,
};

const SLIDES: Partial<Record<PieceKind, Dir[]>> = {
  KY: [[0, 1]],
  KA: DIAG, UM: DIAG,
  HI: ORTHO, RY: ORTHO,
};

const onBoard = ({ file, rank }: Square) => file >= 1 && file <= 9 && rank >= 1 && rank <= 9;

/** from にある piece が利いているマス */
export function attackedSquares(pos: Position, from: Square, piece: Piece): Square[] {
  const forward = piece.color === "sente" ? -1 : 1;
  const step = ([df, dr]: Dir, n: number): Square => ({ file: from.file + df * n, rank: from.rank + dr * forward * n });
  const result: Square[] = [];
  for (const dir of STEPS[piece.kind]) {
    const sq = step(dir, 1);
    if (onBoard(sq)) result.push(sq);
  }
  for (const dir of SLIDES[piece.kind] ?? []) {
    for (let n = 1; ; n++) {
      const sq = step(dir, n);
      if (!onBoard(sq)) break;
      result.push(sq);
      if (pieceAt(pos, sq)) break;
    }
  }
  return result;
}

export function kingSquare(pos: Position, color: Color): Square | null {
  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 1; file <= 9; file++) {
      const p = pieceAt(pos, { file, rank });
      if (p?.color === color && p.kind === "OU") return { file, rank };
    }
  }
  return null;
}

/** color の玉に王手をかけている駒のマス（王手でなければ空） */
export function checkers(pos: Position, color: Color): Square[] {
  const king = kingSquare(pos, color);
  if (!king) return [];
  const attacker = opposite(color);
  const result: Square[] = [];
  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 1; file <= 9; file++) {
      const p = pieceAt(pos, { file, rank });
      if (p?.color !== attacker) continue;
      if (attackedSquares(pos, { file, rank }, p).some((sq) => sq.file === king.file && sq.rank === king.rank)) {
        result.push({ file, rank });
      }
    }
  }
  return result;
}

/** 王手の情報。王手がかかっていなければ null */
export interface CheckInfo {
  /** 王手をかけられている側 */
  checked: Color;
  king: Square;
  checkers: Square[];
}

/** 手番側（これから指す側）に王手がかかっているか */
export function checkInfo(pos: Position): CheckInfo | null {
  const found = checkers(pos, pos.turn);
  const king = kingSquare(pos, pos.turn);
  if (found.length === 0 || !king) return null;
  return { checked: pos.turn, king, checkers: found };
}
