/**
 * BGM を動画の長さまで繰り返す。曲の終わりはフェードアウトせずに切れることが多い（Suno の曲もそう）ので、
 * 繰り返しのつなぎ目では前の回と次の回を CROSSFADE_SEC だけ重ねてクロスフェードする。
 * 動画の最後は END_FADE_SEC かけてフェードアウトする。
 */
const CROSSFADE_SEC = 1.5;
const END_FADE_SEC = 2;

export interface BgmPlay {
  /** この回が始まるフレーム */
  from: number;
  /** この回を流すフレーム数 */
  durationFrames: number;
}

/** 動画（totalFrames）の最後まで曲（trackSec 秒）を繰り返すときの、各回の位置 */
export function bgmPlays(totalFrames: number, trackSec: number, fps: number): BgmPlay[] {
  const track = Math.floor(trackSec * fps);
  const fade = Math.round(CROSSFADE_SEC * fps);
  // クロスフェードできないほど短い曲は、重ねずにそのまま繰り返す
  const step = track > fade * 2 ? track - fade : track;
  if (step <= 0) return [];
  const plays: BgmPlay[] = [];
  for (let from = 0; from < totalFrames; from += step) {
    plays.push({ from, durationFrames: Math.min(track, totalFrames - from) });
  }
  return plays;
}

/**
 * 音量の倍率（0〜1）。index 回目（0 始まり）の、始まってから local フレーム目。
 * 2回目以降は頭でフェードイン、次の回がある回は終わりでフェードアウト、動画の最後はフェードアウトする
 */
export function bgmGain(plays: BgmPlay[], index: number, local: number, totalFrames: number, fps: number): number {
  const play = plays[index]!;
  const fade = Math.round(CROSSFADE_SEC * fps);
  const overlapped = index + 1 < plays.length && plays[index + 1]!.from < play.from + play.durationFrames;
  let gain = 1;
  // クロスフェードは等パワー（平方根）にして、つなぎ目で音量がへこまないようにする
  if (index > 0 && plays[index - 1]!.from + plays[index - 1]!.durationFrames > play.from) {
    gain *= Math.sqrt(Math.min(1, local / fade));
  }
  if (overlapped) gain *= Math.sqrt(Math.min(1, (play.durationFrames - local) / fade));
  const endFade = Math.round(END_FADE_SEC * fps);
  gain *= Math.min(1, Math.max(0, (totalFrames - (play.from + local)) / endFade));
  return Math.max(0, gain);
}
