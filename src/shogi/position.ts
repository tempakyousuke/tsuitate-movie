export type Color = "sente" | "gote";

/** CSA 形式の駒種。成駒は TO/NY/NK/NG/UM/RY */
export type PieceKind =
  | "FU" | "KY" | "KE" | "GI" | "KI" | "KA" | "HI" | "OU"
  | "TO" | "NY" | "NK" | "NG" | "UM" | "RY";

/** 持ち駒になりうる駒種 */
export type HandKind = "FU" | "KY" | "KE" | "GI" | "KI" | "KA" | "HI";

export const HAND_KINDS: readonly HandKind[] = ["HI", "KA", "KI", "GI", "KE", "KY", "FU"];

export interface Piece {
  color: Color;
  kind: PieceKind;
}

/** 筋(file)・段(rank)ともに 1〜9 */
export interface Square {
  file: number;
  rank: number;
}

export interface Position {
  /** index = (rank - 1) * 9 + (file - 1) */
  board: readonly (Piece | null)[];
  hands: Readonly<Record<Color, Readonly<Record<HandKind, number>>>>;
  turn: Color;
}

/** 盤上の駒を動かす手、または持ち駒を打つ手（from = null） */
export interface MoveSpec {
  from: Square | null;
  to: Square;
  /** 動かす前の駒種（打つ場合は打つ駒） */
  piece: PieceKind;
  promote: boolean;
}

export const PROMOTE: Partial<Record<PieceKind, PieceKind>> = {
  FU: "TO", KY: "NY", KE: "NK", GI: "NG", KA: "UM", HI: "RY",
};

export const UNPROMOTE: Record<PieceKind, HandKind | "OU"> = {
  FU: "FU", KY: "KY", KE: "KE", GI: "GI", KI: "KI", KA: "KA", HI: "HI", OU: "OU",
  TO: "FU", NY: "KY", NK: "KE", NG: "GI", UM: "KA", RY: "HI",
};

export const opposite = (c: Color): Color => (c === "sente" ? "gote" : "sente");

export const squareIndex = ({ file, rank }: Square): number => (rank - 1) * 9 + (file - 1);

export const squareName = ({ file, rank }: Square): string => `${file}${rank}`;

export const pieceAt = (pos: Position, sq: Square): Piece | null => pos.board[squareIndex(sq)] ?? null;

const emptyHand = (): Record<HandKind, number> => ({ FU: 0, KY: 0, KE: 0, GI: 0, KI: 0, KA: 0, HI: 0 });

export function initialPosition(): Position {
  const board: (Piece | null)[] = Array(81).fill(null);
  const put = (file: number, rank: number, color: Color, kind: PieceKind) => {
    board[squareIndex({ file, rank })] = { color, kind };
  };
  const backRank: PieceKind[] = ["KY", "KE", "GI", "KI", "OU", "KI", "GI", "KE", "KY"];
  backRank.forEach((kind, i) => {
    put(i + 1, 1, "gote", kind);
    put(i + 1, 9, "sente", kind);
  });
  for (let file = 1; file <= 9; file++) {
    put(file, 3, "gote", "FU");
    put(file, 7, "sente", "FU");
  }
  put(8, 2, "gote", "HI");
  put(2, 2, "gote", "KA");
  put(8, 8, "sente", "KA");
  put(2, 8, "sente", "HI");
  return { board, hands: { sente: emptyHand(), gote: emptyHand() }, turn: "sente" };
}

/**
 * 手を適用した新しい局面を返す。
 * 棋譜の読み違いに早く気づけるよう、駒の有無と駒種の整合は検証する（利きの合法性までは見ない）。
 */
export function applyMove(pos: Position, move: MoveSpec): Position {
  const board = pos.board.slice();
  const hands = { sente: { ...pos.hands.sente }, gote: { ...pos.hands.gote } };
  const color = pos.turn;
  const toIdx = squareIndex(move.to);
  const target = board[toIdx];
  if (target?.color === color) {
    throw new Error(`${squareName(move.to)} に自分の駒があります`);
  }

  if (move.from === null) {
    const kind = move.piece as HandKind;
    if (target) throw new Error(`${squareName(move.to)} は空きマスではありません`);
    if (!(hands[color][kind] > 0)) throw new Error(`${color} は ${move.piece} を持っていません`);
    hands[color][kind]--;
    board[toIdx] = { color, kind };
  } else {
    const fromIdx = squareIndex(move.from);
    const moving = board[fromIdx];
    if (!moving || moving.color !== color || moving.kind !== move.piece) {
      throw new Error(`${squareName(move.from)} に ${color} の ${move.piece} がありません`);
    }
    let kind = moving.kind;
    if (move.promote) {
      const promoted = PROMOTE[kind];
      if (!promoted) throw new Error(`${kind} は成れません`);
      kind = promoted;
    }
    if (target) {
      const captured = UNPROMOTE[target.kind];
      if (captured === "OU") throw new Error("玉は取れません");
      hands[color][captured]++;
    }
    board[fromIdx] = null;
    board[toIdx] = { color, kind };
  }

  return { board, hands, turn: opposite(color) };
}
