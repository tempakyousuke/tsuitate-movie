/**
 * セリフ音声（WAV）の解析。AquesTalkPlayer（44.1kHz）と A.I.VOICE2（48kHz）の書き出しはどちらも PCM 16bit。
 * 末尾の無音の長さが話者で違う（AquesTalk 約0.13秒、A.I.VOICE2 約0.8秒）ので、声が終わった所までを長さとし、
 * セリフの間はタイムラインの lineGapSec でそろえる。
 */

export interface Pcm {
  sampleRate: number;
  /** モノラルにした -1〜1 のサンプル */
  samples: Float32Array;
}

/** RIFF/WAVE を読む。PCM 16bit・24bit・32bit と float 32bit に対応（複数チャンネルは平均する） */
export function parseWav(buf: Uint8Array): Pcm {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (at: number) => String.fromCharCode(buf[at]!, buf[at + 1]!, buf[at + 2]!, buf[at + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("WAV ファイルではありません");

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data: { start: number; size: number } | null = null;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
      // WAVE_FORMAT_EXTENSIBLE はサブフォーマットの先頭2バイトが実際の形式
      if (format === 0xfffe) format = view.getUint16(at + 32, true);
    } else if (id === "data") {
      data = { start: at + 8, size: Math.min(size, buf.length - at - 8) };
    }
    at += 8 + size + (size % 2);
  }
  if (!data || !channels || !sampleRate) throw new Error("WAV の fmt / data がありません");

  const bytes = bits / 8;
  const read: ((at: number) => number) | null =
    format === 3 && bits === 32 ? (at) => view.getFloat32(at, true)
    : format !== 1 ? null
    : bits === 16 ? (at) => view.getInt16(at, true) / 32768
    : bits === 24 ? (at) => ((view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)) / 8388608)
    : bits === 32 ? (at) => view.getInt32(at, true) / 2147483648
    : null;
  if (!read) throw new Error(`対応していない WAV の形式です（format ${format}, ${bits}bit）`);

  const frames = Math.floor(data.size / (bytes * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(data.start + (i * channels + c) * bytes);
    samples[i] = sum / channels;
  }
  return { sampleRate, samples };
}

/** これより小さい音は無音とみなす */
const SILENCE = 0.01;
/** 声が終わった後に残す余韻 */
const TAIL_SEC = 0.05;

export interface VoiceAnalysis {
  /** 声が終わるまでの長さ（末尾の無音を除く） */
  durationSec: number;
  /** 1フレームごとの口の開き（0〜5 の数字を並べた文字列） */
  mouth: string;
}

/** 声の長さと、音量から決めた口パクの段階を求める */
export function analyzeVoice({ sampleRate, samples }: Pcm, fps: number): VoiceAnalysis {
  let last = samples.length - 1;
  while (last > 0 && Math.abs(samples[last]!) < SILENCE) last--;
  const durationSec = Math.min(samples.length / sampleRate, (last + 1) / sampleRate + TAIL_SEC);

  const frameLen = sampleRate / fps;
  const frames = Math.max(1, Math.ceil(durationSec * fps));
  const rms = Array.from({ length: frames }, (_, f) => {
    const from = Math.floor(f * frameLen);
    const to = Math.min(samples.length, Math.floor((f + 1) * frameLen));
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i]! ** 2;
    return to > from ? Math.sqrt(sum / (to - from)) : 0;
  });
  // セリフの中で大きい方の音量を「口を一番開ける」基準にする（声の大きさの違いをならす）
  const sorted = rms.filter((v) => v > 0).sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const mouth = rms
    .map((v) => (loud === 0 || v < loud * 0.15 ? 0 : Math.min(5, Math.max(1, Math.round((v / loud) * 5)))))
    .join("");
  return { durationSec, mouth };
}
