/**
 * BGM を動画の長さまで繰り返す。つなぎ目は重ねずに、曲が終わってから GAP_SEC の無音を空けて頭から流し直す
 * （クロスフェードで重ねると 0.5秒でも不自然で、間を空けずにつなぐより間を空けるほうが自然に聞こえた）。
 * 動画の最後は END_FADE_SEC かけてフェードアウトする。
 */
const GAP_SEC = 1;
const END_FADE_SEC = 2;

export interface BgmPlay {
  /** この回が始まるフレーム */
  from: number;
  /** この回を流すフレーム数 */
  durationFrames: number;
}

/** 動画（totalFrames）の最後まで曲（trackSec 秒）を繰り返すときの、各回の位置 */
export function bgmPlays(totalFrames: number, trackSec: number, fps: number): BgmPlay[] {
  const track = Math.ceil(trackSec * fps);
  if (track <= 0) return [];
  const step = track + Math.round(GAP_SEC * fps);
  const plays: BgmPlay[] = [];
  for (let from = 0; from < totalFrames; from += step) {
    plays.push({ from, durationFrames: Math.min(track, totalFrames - from) });
  }
  return plays;
}

/** 音量の倍率（0〜1）。index 回目（0 始まり）の、始まってから local フレーム目。動画の最後だけフェードアウトする */
export function bgmGain(plays: BgmPlay[], index: number, local: number, totalFrames: number, fps: number): number {
  const endFade = Math.round(END_FADE_SEC * fps);
  return Math.min(1, Math.max(0, (totalFrames - (plays[index]!.from + local)) / endFade));
}
