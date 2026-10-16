import { describe, expect, it } from "vitest";
import { bgmGain, bgmPlays } from "../src/render/bgm.ts";

const FPS = 30;

describe("bgmPlays", () => {
  it("動画の最後まで、1秒の間を空けて繰り返す", () => {
    const plays = bgmPlays(FPS * 120, 50, FPS);
    expect(plays.map((p) => p.from)).toEqual([0, 1530, 3060]);
    expect(plays[0]!.durationFrames).toBe(1500);
    // 最後の回は動画の終わりで切る
    expect(plays.at(-1)!.from + plays.at(-1)!.durationFrames).toBe(FPS * 120);
  });

  it("曲より短い動画では1回だけ流す", () => {
    expect(bgmPlays(FPS * 10, 50, FPS)).toEqual([{ from: 0, durationFrames: FPS * 10 }]);
  });
});

describe("bgmGain", () => {
  const total = FPS * 120;
  const plays = bgmPlays(total, 50, FPS);

  it("1回目の頭はフェードインしない", () => {
    expect(bgmGain(plays, 0, 0, total, FPS)).toBe(1);
  });

  it("つなぎ目では音量を変えない", () => {
    expect(bgmGain(plays, 0, 1499, total, FPS)).toBe(1);
    expect(bgmGain(plays, 1, 0, total, FPS)).toBe(1);
  });

  it("曲の端数（1フレーム未満）は切らずに最後まで流す", () => {
    const plays = bgmPlays(FPS * 120, 50.02, FPS);
    expect(plays[0]!.durationFrames).toBe(1501);
    expect(plays[1]!.from).toBe(1531);
  });

  it("動画の最後はフェードアウトして無音で終わる", () => {
    const last = plays.length - 1;
    const local = plays[last]!.durationFrames;
    expect(bgmGain(plays, last, local, total, FPS)).toBe(0);
    expect(bgmGain(plays, last, local - FPS, total, FPS)).toBeCloseTo(0.5, 1);
  });
});
