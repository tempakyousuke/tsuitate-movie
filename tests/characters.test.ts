import { describe, expect, it } from "vitest";
import { defaultEpisode, type Episode } from "../src/episode/episode.ts";
import {
  DEFAULT_EXPRESSION, castOf, expressionOf, expressionsUsed, eyeStage, isMultiplyLayer, mouthStage, namedExpression, parseExpressionSets, spriteLayers, spriteParts, type Expression,
} from "../src/render/characters.ts";

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
    expect(parts["顔"]).toEqual(["characters/reimu/顔/00a.png"]);
  });

  it("素材ごとの段階の付け方に合わせたファイル名にする", () => {
    const parts = (spec: Partial<Expression>) =>
      Object.fromEntries(spriteParts("reimu", { ...DEFAULT_EXPRESSION, ...spec }).map((p) => [p.layer, p.srcs.map((s) => s.split("/").at(-1))]));
    expect(parts({ 目: "08" })["目"]).toEqual(["08-15.png", "08a-15.png", "08b-15.png", "08c-15.png", "08d-15.png", "08e-15.png"]);
    expect(parts({ 目: "10" })["目"]).toEqual(["10.png", "10k.png", "10l.png", "10m.png", "10n.png", "10o.png"]);
    expect(parts({ 目: "23" })["目"]).toEqual(["23z.png"]);
    expect(parts({ 目: "28" })["目"]).toEqual(["28.png"]);
    expect(parts({ 口: "19" })["口"]).toEqual(["19.png"]);
    expect(parts({ 顔: "03" })["顔"]).toEqual(["03b.png"]);
    // 顔の b は乗算で重ねる
    expect(isMultiplyLayer("characters/reimu/顔/03b.png")).toBe(true);
    expect(isMultiplyLayer("characters/reimu/顔/00a.png")).toBe(false);
  });

  it("台本で使う表情の画像を全部重ね、今の表情の1枚だけを見せる", () => {
    const episode = withLines(["reimu", "reimu"]);
    episode.segments[0]!.lines[1]!.expression = "shout";
    const used = expressionsUsed(episode, "reimu");
    expect(used).toEqual([DEFAULT_EXPRESSION, expressionOf("shout")]);
    const layers = Object.fromEntries(spriteLayers("reimu", used, expressionOf("shout"), 0, 3).map((l) => [l.layer, l]));
    // 口は基本の 00 の6段階と、叫びの 19（段階なし）
    expect(layers["口"]!.srcs).toHaveLength(7);
    // 段階のない口は、口パクの段階によらず同じ1枚
    expect(layers["口"]!.shown).toBe("characters/reimu/口/19.png");
    expect(expressionOf("unknown")).toBe(DEFAULT_EXPRESSION);
  });

  it("全/セット.txt を読み、選べる表情と同じ組み合わせには名前が付く", () => {
    const sets = parseExpressionSets("01=顔00-眉03-目00-口00-体00\r\n49=顔00-眉08-目01-口09-体00\r\n02=顔00-眉00-目00-口00-体00\r\n");
    expect(sets.map((s) => s.no)).toEqual(["01", "49", "02"]);
    expect(sets[1]!.expression).toMatchObject({ 顔: "00", 眉: "08", 目: "01", 口: "09" });
    expect(sets.map((s) => namedExpression(s.expression)?.label)).toEqual(["普通", "ジト目", undefined]);
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
