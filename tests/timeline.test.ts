import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKif } from "../src/kifu/parseKif.ts";
import { autoTimeline, entryAt } from "../src/timeline/timeline.ts";

const kifu = parseKif(readFileSync(new URL("../public/demo.kif", import.meta.url), "utf8"));

describe("autoTimeline", () => {
  const timeline = autoTimeline(kifu, { fps: 30 });

  it("反則試行を実際の手の直前に並べる", () => {
    const around62 = timeline.entries
      .map((e) => e.step)
      .filter((s) => (s.type === "attempt" || s.type === "move") && s.ply === 62);
    expect(around62).toEqual([
      { type: "attempt", ply: 62, index: 0 },
      { type: "attempt", ply: 62, index: 1 },
      { type: "attempt", ply: 62, index: 2 },
      { type: "move", ply: 62 },
    ]);
  });

  it("場面がすき間なく続き、長さの合計が尺になる", () => {
    let frame = 0;
    for (const e of timeline.entries) {
      expect(e.startFrame).toBe(frame);
      frame += e.durationFrames;
    }
    // 初期1.5秒 + 67手×1秒 + 反則9回×1.5秒 + 終了3秒
    expect(timeline.durationInFrames).toBe(45 + 67 * 30 + 9 * 45 + 90);
  });

  it("entryAt は frame を含む場面を返す", () => {
    expect(entryAt(timeline, 0)).toMatchObject({ entry: { step: { type: "initial" } }, local: 0 });
    expect(entryAt(timeline, 45)).toMatchObject({ entry: { step: { type: "move", ply: 1 } }, local: 0 });
    expect(entryAt(timeline, 74)).toMatchObject({ entry: { step: { type: "move", ply: 1 } }, local: 29 });
    expect(entryAt(timeline, timeline.durationInFrames - 1).entry.step).toEqual({ type: "end" });
  });
});
