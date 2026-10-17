import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultEpisode, mergeWithNext, splitSegment, type Episode, type Line } from "../src/episode/episode.ts";
import { parseKif } from "../src/kifu/parseKif.ts";
import { kifuSteps } from "../src/kifu/steps.ts";
import { buildTimeline, entryAt, lineDurationSec, viewAt, type Step, type Timeline } from "../src/timeline/timeline.ts";

const kifu = parseKif(readFileSync(new URL("../public/demo.kif", import.meta.url), "utf8"));
const FPS = 30;

const startOf = (timeline: Timeline, pred: (s: Step) => boolean) => timeline.entries.find((e) => pred(e.step))!.startFrame;
const line = (id: string, text: string, advance?: Line["advance"]): Line => ({ id, speaker: "reimu", text, advance });

describe("buildTimeline（セリフなし＝自動再生）", () => {
  const timeline = buildTimeline(kifu, defaultEpisode(kifu.moves.length, "sente"), FPS);

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
    expect(frame).toBe(timeline.durationInFrames);
  });

  it("entryAt は frame を含む場面を返す", () => {
    expect(entryAt(timeline, 0)).toMatchObject({ entry: { step: { type: "initial" } }, local: 0 });
    expect(entryAt(timeline, 45)).toMatchObject({ entry: { step: { type: "move", ply: 1 } }, local: 0 });
    expect(entryAt(timeline, 74)).toMatchObject({ entry: { step: { type: "move", ply: 1 } }, local: 29 });
    expect(entryAt(timeline, timeline.durationInFrames - 1).entry.step).toEqual({ type: "move", ply: 67 });
  });
});

describe("buildTimeline（セリフあり）", () => {
  // 1〜33手目は自動再生、34手目の区間でセリフに合わせて反則と実際の手を見せ、残りは自動再生
  const base = splitSegment(splitSegment(defaultEpisode(kifu.moves.length, "sente"), 33), 34);
  const lineA = line("a", "後手、歩を打とうとして", { to: { ply: 34, attempt: 0 }, at: { kind: "ratio", value: 0.6 } });
  const lineB = line("b", "反則！", { to: { ply: 34 }, at: { kind: "end" } });
  const episode: Episode = {
    ...base,
    segments: base.segments.map((s, i) => (i === 1 ? { ...s, view: "god", lines: [lineA, lineB] } : s)),
  };
  const timeline = buildTimeline(kifu, episode, FPS);
  const cue = (id: string) => timeline.lines.find((l) => l.lineId === id)!;

  it("セリフは区間の頭から順に、間を空けて並ぶ", () => {
    const segStart = timeline.segmentStarts[1]!;
    expect(cue("a").startFrame).toBe(segStart);
    const gap = Math.round((lineDurationSec(lineA, episode) + episode.settings.lineGapSec) * FPS);
    expect(Math.abs(cue("b").startFrame - (segStart + gap))).toBeLessThanOrEqual(1);
  });

  it("セリフの指定した時点で盤面を進める", () => {
    const attempt = startOf(timeline, (s) => s.type === "attempt" && s.ply === 34);
    expect(Math.abs(attempt - (cue("a").startFrame + 0.6 * cue("a").durationFrames))).toBeLessThanOrEqual(1);
    const move = startOf(timeline, (s) => s.type === "move" && s.ply === 34);
    // 「反則！」の終わり。ただし反則の表示（1.5秒）より前にはならない
    expect(move).toBeGreaterThanOrEqual(cue("b").startFrame + cue("b").durationFrames - 1);
    expect(move).toBeGreaterThanOrEqual(attempt + 45 - 1);
  });

  it("区間ごとに視点を切り替える", () => {
    expect(viewAt(timeline, timeline.segmentStarts[1]! - 1)).toBe("sente");
    expect(viewAt(timeline, timeline.segmentStarts[1]!)).toBe("god");
    expect(viewAt(timeline, timeline.segmentStarts[2]!)).toBe("sente");
  });

  it("最後まで全部のステップが1回ずつ順に出る", () => {
    const shown = timeline.entries.filter((e) => e.step.type !== "initial").length;
    expect(shown).toBe(kifuSteps(kifu).length);
  });

  it("進める指定がないセリフの後は、区間の残りの手を自動再生する", () => {
    const noAdvance: Episode = {
      ...episode,
      segments: episode.segments.map((s, i) => (i === 1 ? { ...s, lines: [line("c", "ここは見ているだけ")] } : s)),
    };
    const t = buildTimeline(kifu, noAdvance, FPS);
    const c = t.lines[0]!;
    expect(startOf(t, (s) => s.type === "attempt" && s.ply === 34)).toBeGreaterThanOrEqual(c.startFrame + c.durationFrames);
  });

  // 62手目の区間（62手目の前に反則が3回ある）に、セリフを1つだけ置く
  const at62 = (l: Line): Episode => {
    const b = splitSegment(splitSegment(defaultEpisode(kifu.moves.length, "sente"), 61), 62);
    return { ...b, segments: b.segments.map((s, i) => (i === 1 ? { ...s, lines: [l] } : s)) };
  };

  it("複数の手を進めるときは、セリフの頭から指定の時点までに均等に並べ、最後の手を指定の時点に着かせる", () => {
    // 反則3回と62手目（4ステップ）を、セリフの終わりまでに進める
    const t = buildTimeline(kifu, at62(line("e", "ここで反則を三回してから指すのよね。長いセリフで確かめる", { to: { ply: 62 }, at: { kind: "end" } })), FPS);
    const e = t.lines[0]!;
    const starts = t.entries.filter((x) => x.step.type !== "initial" && x.step.ply === 62).map((x) => x.startFrame);
    expect(starts).toHaveLength(4);
    expect(starts[0]).toBe(e.startFrame);
    expect(Math.abs(starts[3]! - (e.startFrame + e.durationFrames))).toBeLessThanOrEqual(1);
    const gaps = starts.slice(1).map((s, i) => s - starts[i]!);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it("「頭」で複数の手を進めるときは、頭から自動再生の間隔で進める", () => {
    const t = buildTimeline(kifu, at62(line("f", "一気に", { to: { ply: 62, attempt: 1 }, at: { kind: "start" } })), FPS);
    const starts = t.entries.filter((x) => x.step.type === "attempt" && x.step.ply === 62).map((x) => x.startFrame);
    expect(starts[0]).toBe(t.lines[0]!.startFrame);
    // 反則は1.5秒ずつ
    expect(starts[1]! - starts[0]!).toBe(45);
  });

  it("同じ時点に重なった手は、駒が滑り終わる間隔をあけて順に出す", () => {
    const rushed: Episode = {
      ...episode,
      segments: episode.segments.map((s, i) => (i === 1
        ? { ...s, lines: [line("d", "一気に", { to: { ply: 34 }, at: { kind: "start" } })] }
        : s)),
    };
    const t = buildTimeline(kifu, rushed, FPS);
    const attempt = startOf(t, (s) => s.type === "attempt" && s.ply === 34);
    const move = startOf(t, (s) => s.type === "move" && s.ply === 34);
    expect(move - attempt).toBeGreaterThanOrEqual(10);
  });
});

describe("区間の分割と結合", () => {
  it("分割すると後ろ半分はセリフなしで始まり、前半の先へ進める指定は外れる", () => {
    const ep = defaultEpisode(67, "sente");
    const withLine: Episode = {
      ...ep,
      segments: [{ ...ep.segments[0]!, lines: [line("x", "先まで", { to: { ply: 50 }, at: { kind: "end" } })] }],
    };
    const split = splitSegment(withLine, 40);
    expect(split.segments.map((s) => s.endPly)).toEqual([40, 67]);
    expect(split.segments[0]!.lines[0]!.advance).toBeUndefined();
    expect(split.segments[1]!.lines).toEqual([]);
    expect(mergeWithNext(split, 0).segments.map((s) => s.endPly)).toEqual([67]);
  });
});

describe("buildTimeline（神視点で振り返り）", () => {
  const base = defaultEpisode(kifu.moves.length, "sente");
  const plain = buildTimeline(kifu, base, FPS);
  const timeline = buildTimeline(kifu, { ...base, godReplay: { moveSec: 0.5, attemptSec: 1 } }, FPS);

  it("本編はそのままで、本編の終わりから初期局面に戻して全ステップを並べ直す", () => {
    expect(plain.replayStart).toBeNull();
    expect(timeline.replayStart).toBe(plain.durationInFrames);
    const main = timeline.entries.filter((e) => e.startFrame < timeline.replayStart!);
    expect(main.map((e) => [e.step, e.startFrame])).toEqual(plain.entries.map((e) => [e.step, e.startFrame]));
    const replayed = timeline.entries.filter((e) => e.startFrame >= timeline.replayStart!);
    expect(replayed[0]).toMatchObject({ step: { type: "initial" }, startFrame: timeline.replayStart });
    expect(replayed.length).toBe(kifuSteps(kifu).length + 1);
  });

  it("振り返りの間は神視点", () => {
    expect(viewAt(timeline, timeline.replayStart! - 1)).toBe("sente");
    expect(viewAt(timeline, timeline.replayStart!)).toBe("god");
    expect(viewAt(timeline, timeline.durationInFrames - 1)).toBe("god");
  });
});
