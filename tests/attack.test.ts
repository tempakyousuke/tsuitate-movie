import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKif, replay } from "../src/kifu/parseKif.ts";
import { attackedSquares, checkInfo } from "../src/shogi/attack.ts";
import { initialPosition, squareName } from "../src/shogi/position.ts";

const kifu = parseKif(readFileSync(new URL("../public/demo.kif", import.meta.url), "utf8"));
const positions = replay(kifu);
const names = (squares: { file: number; rank: number }[]) => squares.map(squareName).sort();

describe("attackedSquares", () => {
  const pos = initialPosition();

  it("桂は前方2マス先の左右に利く（先手・後手で向きが逆）", () => {
    expect(names(attackedSquares(pos, { file: 2, rank: 9 }, { color: "sente", kind: "KE" }))).toEqual(["17", "37"]);
    expect(names(attackedSquares(pos, { file: 2, rank: 1 }, { color: "gote", kind: "KE" }))).toEqual(["13", "33"]);
  });

  it("飛び駒は最初にぶつかった駒で止まる", () => {
    // 初期局面の先手の飛車：前は27の歩まで、横は18と88の角まで、後ろは29まで
    expect(names(attackedSquares(pos, { file: 2, rank: 8 }, { color: "sente", kind: "HI" }))).toEqual(
      ["18", "27", "29", "38", "48", "58", "68", "78", "88"],
    );
  });

  it("龍は飛車の利きに斜め1マスを足す", () => {
    const sq = attackedSquares(pos, { file: 5, rank: 5 }, { color: "sente", kind: "RY" });
    expect(names(sq)).toEqual(expect.arrayContaining(["44", "46", "64", "66", "53", "57"]));
  });
});

describe("checkInfo（サンプル棋譜）", () => {
  const checks = kifu.moves
    .map((m) => ({ ply: m.ply, info: checkInfo(positions[m.ply]!) }))
    .filter((c) => c.info !== null);

  it("終盤の王手を検出する", () => {
    expect(checks.map((c) => c.ply)).toEqual([55, 59, 61, 63, 65, 67]);
  });

  it("王手をかけている駒と玉の位置を返す", () => {
    // 55手目 ▲５五歩：５四の後手玉の目の前
    expect(checks[0]!.info).toEqual({
      checked: "gote", king: { file: 5, rank: 4 }, checkers: [{ file: 5, rank: 5 }],
    });
    // 59手目 ▲５九香打：５五の後手玉に香が素通しで利く
    expect(checks[1]!.info?.checkers).toEqual([{ file: 5, rank: 9 }]);
    // 61手目 ▲４一龍：４四の後手玉に縦から
    expect(checks[2]!.info?.checkers).toEqual([{ file: 4, rank: 1 }]);
  });
});
