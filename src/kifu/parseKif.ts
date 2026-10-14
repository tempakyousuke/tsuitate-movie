import {
  applyMove, initialPosition, opposite,
  type Color, type MoveSpec, type PieceKind, type Position, type Square,
} from "../shogi/position.ts";
import { KANJI_DIGITS, ZEN_DIGITS } from "../shogi/notation.ts";

/** 審判に止められた反則手（CSA 表記の駒種は「動かした後」の駒） */
export interface IllegalAttempt {
  from: Square | null;
  to: Square;
  piece: PieceKind;
  /** 元の表記（例: "0046FU"） */
  raw: string;
}

export interface KifuMove extends MoveSpec {
  ply: number;
  color: Color;
  /** 棋譜の表記から移動元を除いたもの（例: "７八銀", "同　歩", "４六歩打"） */
  notation: string;
  /** 秒。消費時間がない棋譜では null */
  time: { move: number; total: number } | null;
  /** この手を指す前に、同じ手番が試して弾かれた手（試した順） */
  attemptsBefore: IllegalAttempt[];
}

export interface Player {
  name: string;
  rating: number | null;
}

export interface Kifu {
  headers: Record<string, string>;
  sente: Player;
  gote: Player;
  moves: KifuMove[];
  /** 投了などの終局表記。棋譜にない場合は null */
  end: { ply: number; reason: string } | null;
}

const PIECE_NAMES: [string, PieceKind][] = [
  // 2文字の名前を先に照合する
  ["成香", "NY"], ["成桂", "NK"], ["成銀", "NG"],
  ["歩", "FU"], ["香", "KY"], ["桂", "KE"], ["銀", "GI"], ["金", "KI"],
  ["角", "KA"], ["飛", "HI"], ["玉", "OU"], ["王", "OU"],
  ["と", "TO"], ["馬", "UM"], ["龍", "RY"], ["竜", "RY"],
];

const END_REASONS = ["投了", "中断", "切れ負け", "反則勝ち", "反則負け", "詰み", "千日手", "持将棋", "入玉勝ち"];

// 「同　歩」は全角スペースを含むので、指し手部分は \S+ ではなく最短一致で取る
const MOVE_LINE = /^\s*(\d+)\s+(.+?)\s*(?:\(\s*(\d+):(\d+)\s*\/\s*(\d+):(\d+):(\d+)\s*\))?\s*$/;

function parsePlayer(value: string | undefined): Player {
  const m = value?.match(/^(.*?)\((\d+)\)$/);
  if (m) return { name: m[1]!, rating: Number(m[2]) };
  return { name: value ?? "", rating: null };
}

function parseCsaSquare(s: string): Square | null {
  const file = Number(s[0]);
  const rank = Number(s[1]);
  if (file === 0 && rank === 0) return null;
  return { file, rank };
}

export function parseIllegalAttempt(raw: string): IllegalAttempt {
  const m = raw.match(/^(\d\d)(\d\d)([A-Z]{2})$/);
  if (!m) throw new Error(`反則手の表記を読めません: ${raw}`);
  const to = parseCsaSquare(m[2]!);
  if (!to) throw new Error(`反則手の移動先が不正です: ${raw}`);
  return { from: parseCsaSquare(m[1]!), to, piece: m[3] as PieceKind, raw };
}

/** "７八銀(79)" / "同　歩(44)" / "４六歩打" / "２三歩成(24)" を読む */
function parseMoveText(text: string, prevTo: Square | null): MoveSpec {
  let rest = text;
  let to: Square;
  if (rest.startsWith("同")) {
    if (!prevTo) throw new Error(`直前の手がないのに「同」があります: ${text}`);
    to = prevTo;
    rest = rest.slice(1).replace(/^[\s　]+/, "");
  } else {
    const file = ZEN_DIGITS.indexOf(rest[0] ?? "") + 1;
    const rank = KANJI_DIGITS.indexOf(rest[1] ?? "") + 1;
    if (file === 0 || rank === 0) throw new Error(`移動先を読めません: ${text}`);
    to = { file, rank };
    rest = rest.slice(2);
  }

  const named = PIECE_NAMES.find(([name]) => rest.startsWith(name));
  if (!named) throw new Error(`駒名を読めません: ${text}`);
  const [name, piece] = named;
  rest = rest.slice(name.length);

  let promote = false;
  if (rest.startsWith("不成")) {
    rest = rest.slice(2);
  } else if (rest.startsWith("成")) {
    promote = true;
    rest = rest.slice(1);
  }

  if (rest === "打") return { from: null, to, piece, promote };
  const from = rest.match(/^\((\d)(\d)\)$/);
  if (!from) throw new Error(`移動元を読めません: ${text}`);
  return { from: { file: Number(from[1]), rank: Number(from[2]) }, to, piece, promote };
}

/**
 * 将棋クエストからコピーした KIF 形式の棋譜を読む。
 * `*illegal:0046FU,5554OU` 行は、直前の指し手を指した側がその手の前に試して弾かれた手として扱う。
 */
export function parseKif(text: string): Kifu {
  const headers: Record<string, string> = {};
  const moves: KifuMove[] = [];
  let end: Kifu["end"] = null;

  for (const [lineNo, line] of text.split(/\r?\n/).entries()) {
    const where = `${lineNo + 1}行目`;
    if (line.trim() === "" || line.startsWith("手数----")) continue;

    if (line.startsWith("*illegal:")) {
      const last = moves.at(-1);
      if (!last) throw new Error(`${where}: 最初の指し手より前に反則手があります`);
      last.attemptsBefore.push(...line.slice("*illegal:".length).split(",").map((s) => parseIllegalAttempt(s.trim())));
      continue;
    }
    if (line.startsWith("*") || line.startsWith("#")) continue;

    const header = line.match(/^([^\d\s][^：]*)：(.*)$/);
    if (header) {
      headers[header[1]!] = header[2]!.trim();
      continue;
    }

    const m = line.match(MOVE_LINE);
    if (!m) throw new Error(`${where}: 読めない行です: ${line}`);
    const ply = Number(m[1]);
    const moveText = m[2]!;
    if (ply !== moves.length + 1) throw new Error(`${where}: 手数が連続していません (${ply})`);

    if (END_REASONS.includes(moveText)) {
      end = { ply, reason: moveText };
      break;
    }

    const spec = parseMoveText(moveText, moves.at(-1)?.to ?? null);
    const time = m[3] === undefined ? null : {
      move: Number(m[3]) * 60 + Number(m[4]),
      total: Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]),
    };
    moves.push({
      ...spec,
      ply,
      color: ply % 2 === 1 ? "sente" : "gote",
      notation: moveText.replace(/\(\d\d\)$/, ""),
      time,
      attemptsBefore: [],
    });
  }

  if (headers["手合割"] && headers["手合割"] !== "平手") {
    throw new Error(`平手以外には対応していません: ${headers["手合割"]}`);
  }

  return { headers, sente: parsePlayer(headers["先手"]), gote: parsePlayer(headers["後手"]), moves, end };
}

/** positions[n] = n 手目を指した後の局面（positions[0] は初期局面） */
export function replay(kifu: Kifu): Position[] {
  const positions = [initialPosition()];
  for (const move of kifu.moves) {
    const prev = positions.at(-1)!;
    if (prev.turn !== move.color) throw new Error(`${move.ply}手目: 手番が ${opposite(move.color)} です`);
    try {
      positions.push(applyMove(prev, move));
    } catch (e) {
      throw new Error(`${move.ply}手目: ${(e as Error).message}`, { cause: e });
    }
  }
  return positions;
}
