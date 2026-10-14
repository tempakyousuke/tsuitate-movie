import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKif, replay } from "../src/kifu/parseKif.ts";
import { defaultEpisode } from "../src/episode/episode.ts";
import { gameResult } from "../src/kifu/result.ts";
import { illegalCountUntil, sceneAt } from "../src/render/scene.ts";
import { pieceAt } from "../src/shogi/position.ts";
import { SLIDE_FRAMES, buildTimeline } from "../src/timeline/timeline.ts";

const kifu = parseKif(readFileSync(new URL("../public/demo.kif", import.meta.url), "utf8"));
const positions = replay(kifu);
const timeline = buildTimeline(kifu, defaultEpisode(kifu.moves.length, "sente"), 30);
const startOf = (pred: (s: (typeof timeline.entries)[number]["step"]) => boolean) =>
  timeline.entries.find((e) => pred(e.step))!.startFrame;

describe("sceneAt", () => {
  it("指した直後は駒が移動元から滑り、移動元は空く", () => {
    const start = startOf((s) => s.type === "move" && s.ply === 1);
    const scene = sceneAt(kifu, positions, timeline, start + 2);
    expect(scene.sliding).toMatchObject({ piece: { color: "sente", kind: "GI" }, from: { file: 7, rank: 9 }, t: 2 / SLIDE_FRAMES });
    expect(pieceAt(scene.position, { file: 7, rank: 9 })).toBeNull();
    expect(scene.caption?.text).toBe("▲７八銀");
  });

  it("滑り終わると指した後の局面になる", () => {
    const start = startOf((s) => s.type === "move" && s.ply === 1);
    const scene = sceneAt(kifu, positions, timeline, start + SLIDE_FRAMES);
    expect(scene.sliding).toBeNull();
    expect(scene.position).toBe(positions[1]);
    expect(scene.lastMove).toEqual({ color: "sente", to: { file: 7, rank: 8 } });
  });

  it("王手をかけた手は、滑り終わった瞬間に王手を告げる", () => {
    const start = startOf((s) => s.type === "move" && s.ply === 61);
    expect(sceneAt(kifu, positions, timeline, start + 2).check).toBeNull();
    const scene = sceneAt(kifu, positions, timeline, start + SLIDE_FRAMES + 5);
    expect(scene.check).toMatchObject({ checked: "gote", checkers: [{ file: 4, rank: 1 }] });
    expect(scene.checkAnnouncedAt).toBe(5);
  });

  it("王手が続いている間の反則試行では、王手を出したままにする", () => {
    const start = startOf((s) => s.type === "attempt" && s.ply === 62 && s.index === 0);
    const scene = sceneAt(kifu, positions, timeline, start + 3);
    expect(scene.check?.checked).toBe("gote");
    expect(scene.checkAnnouncedAt).toBeNull();
  });

  it("反則試行中は指す前の局面に試行を重ねる", () => {
    const start = startOf((s) => s.type === "attempt" && s.ply === 62 && s.index === 1);
    const scene = sceneAt(kifu, positions, timeline, start + 3);
    expect(scene.position).toBe(positions[61]);
    expect(scene.attempt).toMatchObject({ color: "gote", attempt: { raw: "5354FU" }, local: 3 });
    expect(scene.caption?.text).toBe("△５四歩");
  });

  it("最終手が着いたら勝敗を出し、途中の王手では出さない", () => {
    const result = { winner: "sente" as const, reason: "詰み" };
    const last = startOf((s) => s.type === "move" && s.ply === kifu.moves.length);
    expect(sceneAt(kifu, positions, timeline, last + 2, result).result).toBeNull();
    expect(sceneAt(kifu, positions, timeline, last + SLIDE_FRAMES + 3, result).result).toEqual({ result, local: 3 });
    const check61 = startOf((s) => s.type === "move" && s.ply === 61);
    const scene = sceneAt(kifu, positions, timeline, check61 + SLIDE_FRAMES, result);
    expect(scene.result).toBeNull();
    expect(scene.checkAnnouncedAt).toBe(0);
  });

  it("10回目の反則で負けたときは、その反則を再生してから勝敗を出す", () => {
    const fouls = (n: number) => `*illegal:${Array.from({ length: n }, () => "0055FU").join(",")}`;
    const lost = parseKif(["手合割：平手", "1 ７六歩(77)", "2 ３四歩(33)", fouls(9), "3 ２六歩(27)", "4 反則負け", fouls(1)].join("\n"));
    const lostPositions = replay(lost);
    const tl = buildTimeline(lost, defaultEpisode(lost.moves.length, "sente"), 30);
    const result = gameResult(lost, lostPositions)!;
    const last = tl.entries.find((e) => e.step.type === "attempt" && e.step.ply === 4)!.startFrame;
    const atFoul = sceneAt(lost, lostPositions, tl, last + 2, result);
    expect(atFoul.attempt).not.toBeNull();
    expect(atFoul.illegalCount.gote).toBe(10);
    expect(atFoul.result).toBeNull();
    expect(sceneAt(lost, lostPositions, tl, tl.durationInFrames - 1, result).result?.result)
      .toEqual({ winner: "sente", reason: "反則負け", at: { ply: 4, attempt: 0 } });
  });

  it("反則の回数は、反則が告げられた時点で増える", () => {
    const before = startOf((s) => s.type === "attempt" && s.ply === 34);
    expect(sceneAt(kifu, positions, timeline, before - 1).illegalCount).toEqual({ sente: 0, gote: 0 });
    expect(sceneAt(kifu, positions, timeline, before).illegalCount).toEqual({ sente: 0, gote: 1 });

    const second = startOf((s) => s.type === "attempt" && s.ply === 62 && s.index === 1);
    const until61 = illegalCountUntil(kifu, 61);
    expect(sceneAt(kifu, positions, timeline, second).illegalCount).toEqual({ ...until61, gote: until61.gote + 2 });
    // 指し手が滑っている間も、その手の前の反則は数えたまま
    const move62 = startOf((s) => s.type === "move" && s.ply === 62);
    expect(sceneAt(kifu, positions, timeline, move62).illegalCount).toEqual({ ...until61, gote: until61.gote + 3 });
  });
});
