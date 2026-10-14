import { describe, expect, it } from "vitest";
import { defaultEpisode, type Episode } from "../src/episode/episode.ts";
import { DEFAULT_EXPRESSION, castOf, eyeStage, mouthStage, spriteParts } from "../src/render/characters.ts";

const withLines = (speakers: string[]): Episode => {
  const base = defaultEpisode(10, "sente");
  return {
    ...base,
    segments: [{ ...base.segments[0]!, lines: speakers.map((speaker, i) => ({ id: `l${i}`, speaker, text: "x" })) }],
  };
};

describe("castOf", () => {
  it("セリフのある話者だけを、ゆっくりは左・ゆかりは右に分ける", () => {
    const cast = castOf(withLines(["reimu", "yukari", "reimu"]));
    expect(cast.left.map((s) => s.id)).toEqual(["reimu"]);
    expect(cast.right.map((s) => s.id)).toEqual(["yukari"]);
  });

  it("セリフがなければ誰も出さない", () => {
    expect(castOf(withLines([]))).toEqual({ left: [], right: [] });
  });
});

describe("立ち絵のパーツ", () => {
  it("目と口は基本形と a〜e の6段階を持ち、ほかのパーツは1枚", () => {
    const parts = Object.fromEntries(spriteParts("reimu", DEFAULT_EXPRESSION).map((p) => [p.layer, p.srcs]));
    expect(parts["目"]).toEqual(["", "a", "b", "c", "d", "e"].map((s) => `characters/reimu/目/00${s}.png`));
    expect(parts["口"]![2]).toBe("characters/reimu/口/00b.png");
    expect(parts["体"]).toEqual(["characters/reimu/体/00.png"]);
  });

  it("まばたきはたまにだけ起き、人によって時刻がずれる", () => {
    const frames = Array.from({ length: 30 * 60 }, (_, f) => f);
    const blinking = (seed: string) => frames.filter((f) => eyeStage(f, 30, seed) > 0);
    // 1分に10〜20回程度（1回5フレーム）
    expect(blinking("reimu").length / 5).toBeGreaterThanOrEqual(8);
    expect(blinking("reimu").length / 5).toBeLessThanOrEqual(20);
    expect(blinking("reimu")).not.toEqual(blinking("yukari"));
  });

  it("話している間は口を開け閉めする", () => {
    const stages = Array.from({ length: 12 }, (_, f) => mouthStage(f));
    expect(Math.max(...stages)).toBe(5);
    expect(stages).toContain(0);
  });
});
