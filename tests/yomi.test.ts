import { describe, expect, it } from "vitest";
import { autoYomi, suggestedYomi } from "../src/episode/yomi.ts";

describe("autoYomi", () => {
  it("将棋の符号を、筋と段の読みにする（駒が続けば駒も）", () => {
    expect(autoYomi("早速4六の歩が取られたわね。")).toBe("早速ヨンロクの歩が取られたわね。");
    expect(autoYomi("次は4五歩ってするの？")).toBe("次はヨンゴーフってするの？");
    expect(autoYomi("3一馬でも良かったんじゃない？")).toBe("サンイチウマでも良かったんじゃない？");
    expect(autoYomi("8七の歩")).toBe("ハチナナの歩");
    expect(autoYomi("全角の５五角")).toBe("全角のゴーゴーカク");
  });

  it("「同」＋駒、「〇筋」を読む", () => {
    expect(autoYomi("これは同玉の一手ね")).toBe("これはドウギョクの一手ね");
    expect(autoYomi("相手は4筋に逃げたのね")).toBe("相手はヨン筋に逃げたのね");
    expect(autoYomi("同じ手")).toBe("同じ手");
  });

  it("辞書の言葉と、〇割〇分を読む", () => {
    expect(autoYomi("ここで入玉を目指すのね")).toBe("ここでニュウギョクを目指すのね");
    expect(autoYomi("駒割は互角に戻ったわね。")).toBe("コマワリは互角に戻ったわね。");
    expect(autoYomi("勝率8割2分の化け物")).toBe("勝率ハチワリニブの化け物");
  });

  it("置き換える所がなければ読みを指定しない", () => {
    expect(suggestedYomi("こんにちは")).toBeUndefined();
    expect(suggestedYomi("4五歩")).toBe("ヨンゴーフ");
  });
});
