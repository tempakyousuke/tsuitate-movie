import type { Color, PieceKind, Square } from "./position.ts";

export const ZEN_DIGITS = "１２３４５６７８９";
export const KANJI_DIGITS = "一二三四五六七八九";

/** 盤上に描く1文字 */
export const PIECE_CHAR: Record<PieceKind, string> = {
  FU: "歩", KY: "香", KE: "桂", GI: "銀", KI: "金", KA: "角", HI: "飛", OU: "玉",
  TO: "と", NY: "杏", NK: "圭", NG: "全", UM: "馬", RY: "龍",
};

/** 棋譜で使う名前 */
export const PIECE_NAME: Record<PieceKind, string> = {
  FU: "歩", KY: "香", KE: "桂", GI: "銀", KI: "金", KA: "角", HI: "飛", OU: "玉",
  TO: "と", NY: "成香", NK: "成桂", NG: "成銀", UM: "馬", RY: "龍",
};

export const COLOR_MARK: Record<Color, string> = { sente: "▲", gote: "△" };

export const zenFile = (file: number): string => ZEN_DIGITS[file - 1] ?? "?";
export const kanjiRank = (rank: number): string => KANJI_DIGITS[rank - 1] ?? "?";

export const squareLabel = ({ file, rank }: Square): string => zenFile(file) + kanjiRank(rank);

/** 反則試行の表記（例: "４六歩打", "５四玉"）。CSA の駒種は動かした後の駒 */
export function attemptLabel(attempt: { from: Square | null; to: Square; piece: PieceKind }): string {
  return squareLabel(attempt.to) + PIECE_NAME[attempt.piece] + (attempt.from === null ? "打" : "");
}
