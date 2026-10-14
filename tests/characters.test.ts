import { describe, expect, it } from "vitest";
import { defaultEpisode, type Episode } from "../src/episode/episode.ts";
import { DEFAULT_EXPRESSION, castOf, eyeStage, mouthStage, spriteLayers } from "../src/render/characters.ts";

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
  it("目と口は段階に応じて a〜e のファイルを使う", () => {
    const layers = spriteLayers("reimu", DEFAULT_EXPRESSION, 5, 2);
    expect(layers).toContain("characters/reimu/目/00e.png");
    expect(layers).toContain("characters/reimu/口/00b.png");
    expect(spriteLayers("reimu", DEFAULT_EXPRESSION, 0, 0)).toContain("characters/reimu/目/00.png");
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
