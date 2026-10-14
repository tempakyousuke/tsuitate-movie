import { describe, expect, it } from "vitest";
import { analyzeVoice, parseWav } from "../src/audio/wav.ts";
import { freshVoice, speechText, type Line } from "../src/episode/episode.ts";

/** 16bit モノラルの WAV を作る */
function wav(sampleRate: number, samples: number[]): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(s * 32767), true));
  return new Uint8Array(buf);
}

const RATE = 8000;
const silence = (sec: number) => Array<number>(Math.round(sec * RATE)).fill(0);
const tone = (sec: number, amp: number) => Array.from({ length: Math.round(sec * RATE) }, (_, i) => amp * Math.sin(i / 3));

describe("analyzeVoice", () => {
  // 頭0.1秒・末尾0.8秒の無音（A.I.VOICE2 の書き出しに近い形）
  const pcm = parseWav(wav(RATE, [...silence(0.1), ...tone(0.3, 0.8), ...tone(0.2, 0.2), ...silence(0.8)]));

  it("16bit の WAV を読む", () => {
    expect(pcm.sampleRate).toBe(RATE);
    expect(pcm.samples.length).toBe(RATE * 1.4);
  });

  it("末尾の無音を除いた長さにする", () => {
    const { durationSec } = analyzeVoice(pcm, 30);
    expect(durationSec).toBeGreaterThan(0.6);
    expect(durationSec).toBeLessThan(0.7);
  });

  it("口の開きは無音で閉じ、大きい声ほど大きく開く", () => {
    const { mouth, durationSec } = analyzeVoice(pcm, 30);
    expect(mouth.length).toBe(Math.ceil(durationSec * 30));
    expect(mouth.slice(0, 3)).toBe("000");
    const loud = Number(mouth[6]);
    const quiet = Number(mouth[14]);
    expect(loud).toBeGreaterThan(quiet);
    expect(quiet).toBeGreaterThan(0);
  });

  it("WAV でなければ分かるエラーにする", () => {
    expect(() => parseWav(new Uint8Array(64))).toThrow("WAV ファイルではありません");
  });
});

describe("freshVoice", () => {
  const line: Line = { id: "a", speaker: "reimu", text: "こんにちは\nゆっくり" };
  const voice = { src: "x.wav", durationSec: 1, text: "こんにちは ゆっくり", mouth: "0" };

  it("改行は空白にして読み上げる", () => {
    expect(speechText(line)).toBe("こんにちは ゆっくり");
    expect(speechText({ ...line, yomi: "こんにちわ" })).toBe("こんにちわ");
  });

  it("セリフを書き換えた後の古い音声は使わない", () => {
    expect(freshVoice({ ...line, voice })).toBe(voice);
    expect(freshVoice({ ...line, text: "さようなら", voice })).toBeUndefined();
    expect(freshVoice({ ...line, yomi: "こんにちわ", voice })).toBeUndefined();
  });
});
