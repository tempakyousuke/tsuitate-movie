import { loadFont } from "@remotion/google-fonts/NotoSerifJP";
import { useMemo } from "react";
import {
  AbsoluteFill, Html5Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from "remotion";
import { defaultEpisode, type Bgm, type Episode, type Speaker } from "../episode/episode.ts";
import { parseKif, replay, type Kifu } from "../kifu/parseKif.ts";
import { gameResult } from "../kifu/result.ts";
import { opposite, type Color } from "../shogi/position.ts";
import { SLIDE_FRAMES, buildTimeline, lineAt, viewAt } from "../timeline/timeline.ts";
import { bgmGain, bgmPlays } from "./bgm.ts";
import { BoardView, HEIGHT, WIDTH, type PlayerLabel, type View } from "./BoardView.tsx";
import {
  DEFAULT_EXPRESSION, SPRITE_H, SPRITE_W, castOf, expressionOf, expressionsUsed, eyeStage, isMultiplyLayer, mouthStage, spriteLayers,
  type Expression, type Side,
} from "./characters.ts";
import { sceneAt } from "./scene.ts";

// 日本語フォントは unicode-range ごとに分割配信されるのでリクエスト数が多くなるが、問題はない
loadFont("normal", { weights: ["700"], subsets: ["japanese", "latin"], ignoreTooManyRequestsWarning: true });

export const FPS = 30;
const FONT = "'Noto Serif JP', serif";
/** 下に字幕の帯を空けるため、盤面全体を縮めて上に寄せる */
const BOARD_SCALE = 0.86;
const SUBTITLE_TOP = HEIGHT * BOARD_SCALE;

/**
 * 駒が着いたときに鳴らす効果音。null なら鳴らさない。
 * src は public/ 以下のパス。leadSilenceSec は音の頭の無音（この分を飛ばして着手と音を合わせる）、volume は音量（0〜1）
 */
export type MoveSound = { src: string; leadSilenceSec: number; volume: number } | null;

// On-Jin ～音人～「将棋・駒を強めに指す03」。再配布不可のためリポジトリには含めない
// （https://on-jin.com/sound/index.php?kensaku=将棋の駒 から取得して public/sounds/ に置く）
// 素材そのままだとピークが +0.4dBFS あり、セリフや BGM と重なると音が割れるので、少し（約 -3dB）下げる
/** セリフ音声を、セリフの長さ（末尾の無音を除く）より余分に流す秒数 */
const VOICE_TAIL_SEC = 0.5;

export const DEFAULT_MOVE_SOUND: MoveSound ={ src: "sounds/spo_ge_syogi_s03.mp3", leadSilenceSec: 0.107, volume: 0.7 };

export type EpisodeVideoProps = {
  episode?: Episode;
  kifuText?: string;
  moveSound: MoveSound;
};

/** 効果音ファイルがなければ null にする（素材は再配布できないので、ない環境でも無音で書き出せるようにする） */
export async function availableMoveSound(sound: MoveSound): Promise<MoveSound> {
  if (sound && !(await fetch(staticFile(sound.src), { method: "HEAD" })).ok) {
    console.warn(`効果音 public/${sound.src} がないので無音にします（入手元は src/render/EpisodeVideo.tsx のコメント参照）`);
    return null;
  }
  return sound;
}

const fetchText = async (path: string) => {
  const res = await fetch(staticFile(path));
  if (!res.ok) throw new Error(`public/${path} を読めません (${res.status})`);
  return res.text();
};

export type EpisodeCompositionProps = EpisodeVideoProps & { episodeName: string };
export type KifuReplayCompositionProps = EpisodeVideoProps & { kifuFile: string; view: View; player: Color };

/** 台本 public/episodes/<episodeName>/script.json を書き出すコンポジション */
export const calculateEpisodeMetadata: CalculateMetadataFunction<EpisodeCompositionProps> =
  async ({ props }) => {
    const dir = `episodes/${props.episodeName}`;
    const [script, kifuText, moveSound] = await Promise.all([
      fetchText(`${dir}/script.json`), fetchText(`${dir}/kifu.kif`), availableMoveSound(props.moveSound),
    ]);
    const episode = JSON.parse(script) as Episode;
    const timeline = buildTimeline(parseKif(kifuText), episode, FPS);
    return { durationInFrames: timeline.durationInFrames, props: { ...props, episode, kifuText, moveSound } };
  };

/** 台本なしで棋譜をそのまま再生するコンポジション（視点の確認用） */
export const calculateKifuReplayMetadata: CalculateMetadataFunction<KifuReplayCompositionProps> = async ({ props }) => {
  const [kifuText, moveSound] = await Promise.all([fetchText(props.kifuFile), availableMoveSound(props.moveSound)]);
  const kifu = parseKif(kifuText);
  const episode = defaultEpisode(kifu.moves.length, props.player, props.view);
  const timeline = buildTimeline(kifu, episode, FPS);
  return { durationInFrames: timeline.durationInFrames, props: { ...props, episode, kifuText, moveSound } };
};

/** コンポジションごとの入力 props を受け取れるようにした別名（描画は EpisodeVideo と同じ） */
export const EpisodeComposition: React.FC<EpisodeCompositionProps> = (props) => <EpisodeVideo {...props} />;
export const KifuReplayComposition: React.FC<KifuReplayCompositionProps> = (props) => <EpisodeVideo {...props} />;

/** BGM を動画の最後まで繰り返す */
function BgmTrack({ bgm, totalFrames, fps }: { bgm: Bgm; totalFrames: number; fps: number }) {
  const plays = useMemo(() => bgmPlays(totalFrames, bgm.durationSec, fps), [totalFrames, bgm.durationSec, fps]);
  return plays.map((play, i) => (
    <Sequence key={`bgm${play.from}`} from={play.from} durationInFrames={play.durationFrames} layout="none">
      <Html5Audio src={staticFile(bgm.src)} volume={(f) => bgm.volume * bgmGain(plays, i, f, totalFrames, fps)} />
    </Sequence>
  ));
}

/** 片側に count 人並べるときの立ち絵の倍率と、隣の人との間隔 */
const spriteScale = (count: number) => (count > 1 ? 0.8 : 1);
const SPRITE_STEP = 230;
/** 立ち絵の外側の端からの位置（素材の左右には余白があるので少しはみ出させる） */
const SPRITE_INSET = -40;

/** 片側の立ち絵が画面の端から占める幅（字幕の帯をその内側に置く）。いなければ 0 */
function groupWidth(count: number): number {
  if (count === 0) return 0;
  const scale = spriteScale(count);
  return SPRITE_INSET + (count - 1) * SPRITE_STEP + SPRITE_W * scale * 0.85;
}

/** 字幕が帯の高さ（3行まで）に収まる一番大きい文字サイズ */
function subtitleFontSize(text: string, width: number): number {
  const height = HEIGHT - SUBTITLE_TOP - 40;
  const chars = [...text].length;
  for (const size of [46, 42, 38, 34, 30]) {
    const lines = Math.ceil(chars / Math.floor(width / size));
    if (lines * size * 1.3 <= height) return size;
  }
  return 28;
}

/**
 * 1人分の立ち絵。素材は画面の左を向いているので、左側の人は左右反転して右（相手）を向かせる。
 * 話していない人は、誰かが話している間は少し暗くする
 */
function CharacterSprite({ speaker, side, index, count, used, expression, eye, mouth, dimmed }: {
  speaker: Speaker; side: Side; index: number; count: number;
  used: Expression[]; expression: Expression; eye: number; mouth: number; dimmed: boolean;
}) {
  const scale = spriteScale(count);
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;
  const offset = SPRITE_INSET + index * SPRITE_STEP;
  return (
    <div style={{
      position: "absolute", bottom: 0, width: w, height: h,
      ...(side === "left" ? { left: offset } : { right: offset }),
      transform: side === "left" ? "scaleX(-1)" : undefined,
      filter: dimmed ? "brightness(0.7)" : undefined,
    }}>
      {spriteLayers(speaker.id, used, expression, eye, mouth).flatMap(({ srcs, shown }) => srcs.map((src) => (
        <Img key={src} src={staticFile(src)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", opacity: src === shown ? 1 : 0,
            mixBlendMode: isMultiplyLayer(src) ? "multiply" : undefined,
          }} />
      )))}
    </div>
  );
}

/** 対局者欄の表示。相手のユーザー名は動画に出さず、レートだけ出す */
function playerLabels(kifu: Kifu, player: Color): Record<Color, PlayerLabel> {
  const opponent = opposite(player);
  return {
    [player]: kifu[player],
    [opponent]: { name: "相手", rating: kifu[opponent].rating },
  } as Record<Color, PlayerLabel>;
}

export function EpisodeVideo({ episode, kifuText, moveSound }: EpisodeVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 棋譜から決まるもの（詰みの判定を含む）は、台本を編集するたびには計算し直さない
  const game = useMemo(() => {
    if (kifuText === undefined) return null;
    const kifu = parseKif(kifuText);
    const positions = replay(kifu);
    return { kifu, positions, result: gameResult(kifu, positions) };
  }, [kifuText]);
  const timeline = useMemo(() => (episode && game ? buildTimeline(game.kifu, episode, fps) : null), [episode, game, fps]);
  if (!episode || !game || !timeline) return null;

  const { kifu, positions, result } = game;
  const line = lineAt(timeline, frame);
  const speaker = line && episode.speakers.find((s) => s.id === line.speaker);
  const cast = castOf(episode);
  // 字幕の帯は左右の立ち絵の間に置く
  const subtitleLeft = groupWidth(cast.left.length) || 160;
  const subtitleRight = groupWidth(cast.right.length) || 160;

  return (
    <AbsoluteFill style={{ background: "#1d2433" }}>
      <div style={{ width: WIDTH, height: HEIGHT, transform: `scale(${BOARD_SCALE})`, transformOrigin: "top center" }}>
        <BoardView
          scene={sceneAt(kifu, positions, timeline, frame, result)}
          view={viewAt(timeline, frame)}
          player={episode.player}
          players={playerLabels(kifu, episode.player)}
          fps={fps}
        />
      </div>
      {!line && timeline.replayStart !== null && frame >= timeline.replayStart && (
        <div style={{
          position: "absolute", left: subtitleLeft, right: subtitleRight, top: SUBTITLE_TOP + 12, height: HEIGHT - SUBTITLE_TOP - 30,
          display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16,
          background: "rgba(0, 0, 0, 0.55)", fontFamily: FONT, color: "#f6f2ea", fontSize: 46, fontWeight: 700,
        }}>
          神視点で振り返り（お互いの駒がすべて見えます）
        </div>
      )}
      {line && (
        <div style={{
          position: "absolute", left: subtitleLeft, right: subtitleRight, top: SUBTITLE_TOP + 12, height: HEIGHT - SUBTITLE_TOP - 30,
          display: "flex", alignItems: "center", gap: 28, padding: "0 36px", borderRadius: 16,
          background: "rgba(0, 0, 0, 0.55)", fontFamily: FONT, color: "#f6f2ea",
        }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: speaker?.color ?? "#fff", whiteSpace: "nowrap" }}>
            {speaker?.name ?? line.speaker}
          </span>
          <span style={{ fontSize: subtitleFontSize(line.text, WIDTH - subtitleLeft - subtitleRight - 220), fontWeight: 700, lineHeight: 1.3 }}>
            {line.text}
          </span>
        </div>
      )}
      {(["left", "right"] as const).flatMap((side) => cast[side].map((s, i) => {
        const talking = line?.speaker === s.id;
        return (
          <CharacterSprite
            key={s.id}
            speaker={s}
            side={side}
            index={i}
            count={cast[side].length}
            used={expressionsUsed(episode, s.id)}
            // セリフで指定した表情は話している間だけ。話し終わったら基本の表情に戻す
            expression={talking ? expressionOf(line!.expression) : DEFAULT_EXPRESSION}
            eye={eyeStage(frame, fps, s.id)}
            mouth={talking ? mouthStage(frame - line!.startFrame, line!.voice) : 0}
            dimmed={!!line && !talking}
          />
        );
      }))}
      {moveSound && timeline.entries.map((entry) => entry.step.type === "move" && (
        // 駒が滑り終わって盤に着いた瞬間に鳴らす
        <Sequence key={`m${entry.startFrame}`} from={entry.startFrame + SLIDE_FRAMES} durationInFrames={fps} layout="none">
          <Html5Audio src={staticFile(moveSound.src)} trimBefore={Math.round(moveSound.leadSilenceSec * fps)} volume={moveSound.volume} />
        </Sequence>
      ))}
      {episode.bgm && <BgmTrack bgm={episode.bgm} totalFrames={timeline.durationInFrames} fps={fps} />}
      {timeline.lines.map((cue) => cue.voice && (
        // セリフの長さは末尾の無音を除いたもの。プレビューは音声の再生が少し遅れて始まるので、
        // セリフの長さちょうどで止めると最後が切れる。後ろは無音なので、余分に流しても書き出しの聞こえ方は変わらない
        <Sequence key={`v${cue.lineId}`} from={cue.startFrame} durationInFrames={cue.durationFrames + Math.round(VOICE_TAIL_SEC * fps)} layout="none">
          <Html5Audio src={staticFile(cue.voice.src)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
