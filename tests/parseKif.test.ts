import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKif, replay } from "../src/kifu/parseKif.ts";
import { pieceAt } from "../src/shogi/position.ts";

const sample = readFileSync(new URL("../public/demo.kif", import.meta.url), "utf8");

describe("parseKif（将棋クエストのサンプル）", () => {
  const kifu = parseKif(sample);

  it("ヘッダと対局者を読む", () => {
    expect(kifu.headers["棋戦"]).toBe("Shogi Quest");
    expect(kifu.sente).toEqual({ name: "sente_player", rating: 1989 });
    expect(kifu.gote).toEqual({ name: "gote_player", rating: 1824 });
    expect(kifu.moves).toHaveLength(67);
    expect(kifu.end).toBeNull();
  });

  it("通常の手・同・打・成と消費時間を読む", () => {
    expect(kifu.moves[0]).toMatchObject({
      ply: 1, color: "sente", from: { file: 7, rank: 9 }, to: { file: 7, rank: 8 },
      piece: "GI", promote: false, time: { move: 1, total: 1 },
    });
    expect(kifu.moves[27]).toMatchObject({ ply: 28, from: { file: 4, rank: 4 }, to: { file: 4, rank: 5 }, piece: "FU" });
    expect(kifu.moves[30]).toMatchObject({ ply: 31, from: null, to: { file: 4, rank: 6 }, piece: "FU" });
    expect(kifu.moves[34]).toMatchObject({ ply: 35, piece: "FU", promote: true });
    expect(kifu.moves[60]).toMatchObject({ ply: 61, piece: "RY", from: { file: 2, rank: 1 } });
    expect(kifu.moves[47]!.time).toEqual({ move: 45, total: 136 });
  });

  it("反則手を、その手番が直後に指した手の前の試行として紐づける", () => {
    const withAttempts = kifu.moves
      .filter((m) => m.attemptsBefore.length > 0)
      .map((m) => [m.ply, m.color, m.attemptsBefore.map((a) => a.raw)]);
    expect(withAttempts).toEqual([
      [34, "gote", ["0046FU"]],
      [60, "gote", ["5554OU"]],
      [62, "gote", ["4443OU", "5354FU", "3435FU"]],
      [63, "sente", ["4146RY"]],
      [66, "gote", ["4746TO"]],
      [67, "sente", ["0045FU", "0035KA"]],
    ]);
    expect(kifu.moves[33]!.attemptsBefore[0]).toEqual({ from: null, to: { file: 4, rank: 6 }, piece: "FU", raw: "0046FU" });
  });

  it("最後まで矛盾なく再生できる", () => {
    const positions = replay(kifu);
    expect(positions).toHaveLength(68);
    const last = positions[67]!;
    expect(pieceAt(last, { file: 3, rank: 5 })).toEqual({ color: "sente", kind: "UM" });
    expect(pieceAt(last, { file: 4, rank: 5 })).toEqual({ color: "gote", kind: "OU" });
    expect(last.turn).toBe("gote");
  });

  it("反則手の試行元には、その手番の駒がある", () => {
    const positions = replay(kifu);
    for (const move of kifu.moves) {
      const before = positions[move.ply - 1]!;
      for (const a of move.attemptsBefore) {
        if (a.from === null) {
          expect(before.hands[move.color][a.piece as "FU"], a.raw).toBeGreaterThan(0);
        } else {
          expect(pieceAt(before, a.from)?.color, a.raw).toBe(move.color);
        }
      }
    }
  });
});

describe("parseKif（その他の表記）", () => {
  it("投了で終局を記録する", () => {
    const kifu = parseKif("手合割：平手\n1 ７六歩(77)\n2 投了\n");
    expect(kifu.moves).toHaveLength(1);
    expect(kifu.end).toEqual({ ply: 2, reason: "投了" });
  });

  it("読めない行はエラーにする", () => {
    expect(() => parseKif("1 ７六歩(77)\nなにか\n")).toThrow("2行目");
  });
});
