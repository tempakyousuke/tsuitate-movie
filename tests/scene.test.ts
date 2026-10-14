import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKif, replay } from "../src/kifu/parseKif.ts";
import { SLIDE_FRAMES, sceneAt } from "../src/render/scene.ts";
import { pieceAt } from "../src/shogi/position.ts";
import { autoTimeline } from "../src/timeline/timeline.ts";

const kifu = parseKif(readFileSync(new URL("../public/demo.kif", import.meta.url), "utf8"));
const positions = replay(kifu);
const timeline = autoTimeline(kifu, { fps: 30 });
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
});
