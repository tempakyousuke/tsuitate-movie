import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKif, replay } from "../src/kifu/parseKif.ts";
import { gameResult } from "../src/kifu/result.ts";
import { checkInfo } from "../src/shogi/attack.ts";
import { isCheckmate } from "../src/shogi/mate.ts";

const text = readFileSync(new URL("../public/demo.kif", import.meta.url), "utf8");
const kifu = parseKif(text);
const positions = replay(kifu);

describe("isCheckmate", () => {
  it("デモ棋譜は最終手で詰んでいる", () => {
    expect(isCheckmate(positions[kifu.moves.length]!)).toBe(true);
  });

  it("途中の王手は詰みではない", () => {
    const checks = positions.map((p, ply) => ({ p, ply })).filter(({ p, ply }) => ply < kifu.moves.length && checkInfo(p));
    expect(checks.map((c) => c.ply)).toEqual([55, 59, 61, 63, 65]);
    for (const { p } of checks) expect(isCheckmate(p)).toBe(false);
  });

  it("王手がかかっていなければ詰みではない", () => {
    expect(isCheckmate(positions[0]!)).toBe(false);
  });
});

describe("gameResult", () => {
  it("終局の行がなければ、最終局面の詰みで勝ちを決める", () => {
    expect(gameResult(kifu, positions)).toEqual({ winner: "sente", reason: "詰み" });
  });

  it("終局の行があればそれに従う（投了した側の負け）", () => {
    const resigned = parseKif(text.replace(/^(\s*\d+ )?\*illegal:0045FU,0035KA\s*$/m, "") + "\n68 投了\n");
    expect(gameResult(resigned, replay(resigned))).toEqual({ winner: "sente", reason: "投了" });
  });

  it("反則が累計10回に達したら、その反則で反則負け", () => {
    // 2手目（後手）の前に 4 回、4手目の前に 5 回、終局の行の後に 1 回 → 10 回目は終局の後の反則
    const fouls = (n: number) => `*illegal:${Array.from({ length: n }, () => "0055FU").join(",")}`;
    const lost = parseKif([
      "手合割：平手", "1 ７六歩(77)", "2 ３四歩(33)", fouls(4), "3 ２六歩(27)", "4 ８四歩(83)", fouls(5), "5 ２五歩(26)",
      "6 反則負け", fouls(1),
    ].join("\n"));
    expect(gameResult(lost, replay(lost))).toEqual({ winner: "sente", reason: "反則負け", at: { ply: 6, attempt: 0 } });
    // 9 回なら反則負けにならず、終局の行に従う
    const nine = parseKif(["手合割：平手", "1 ７六歩(77)", "2 ３四歩(33)", fouls(9), "3 投了"].join("\n"));
    expect(gameResult(nine, replay(nine))).toEqual({ winner: "gote", reason: "投了" });
  });

  it("途中で終わった棋譜（詰みでも終局の行もない）は分からない", () => {
    const cut = parseKif(text.split(/\r?\n/).filter((l) => !/^\s*(6[0-7])\s/.test(l) && !/^\*illegal:(5554OU|4443OU|4146RY|4746TO|0045FU)/.test(l)).join("\n"));
    expect(gameResult(cut, replay(cut))).toBeNull();
  });
});
