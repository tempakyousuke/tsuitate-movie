import { loadFont } from "@remotion/google-fonts/NotoSerifJP";
import { useMemo } from "react";
import {
  AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from "remotion";
import { defaultEpisode, type Episode } from "../episode/episode.ts";
import { parseKif, replay, type Kifu } from "../kifu/parseKif.ts";
import { opposite, type Color } from "../shogi/position.ts";
import { SLIDE_FRAMES, buildTimeline, lineAt, viewAt } from "../timeline/timeline.ts";
import { BoardView, HEIGHT, WIDTH, type PlayerLabel, type View } from "./BoardView.tsx";
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
 * src は public/ 以下のパス。leadSilenceSec は音の頭の無音（この分を飛ばして着手と音を合わせる）
 */
export type MoveSound = { src: string; leadSilenceSec: number } | null;

// On-Jin ～音人～「将棋・駒を強めに指す03」。再配布不可のためリポジトリには含めない
// （https://on-jin.com/sound/index.php?kensaku=将棋の駒 から取得して public/sounds/ に置く）
export const DEFAULT_MOVE_SOUND: MoveSound = { src: "sounds/spo_ge_syogi_s03.mp3", leadSilenceSec: 0.107 };

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
  const data = useMemo(() => {
    if (!episode || kifuText === undefined) return null;
    const kifu = parseKif(kifuText);
    return { kifu, positions: replay(kifu), timeline: buildTimeline(kifu, episode, fps) };
  }, [episode, kifuText, fps]);
  if (!episode || !data) return null;

  const { kifu, positions, timeline } = data;
  const line = lineAt(timeline, frame);
  const speaker = line && episode.speakers.find((s) => s.id === line.speaker);

  return (
    <AbsoluteFill style={{ background: "#1d2433" }}>
      <div style={{ width: WIDTH, height: HEIGHT, transform: `scale(${BOARD_SCALE})`, transformOrigin: "top center" }}>
        <BoardView
          scene={sceneAt(kifu, positions, timeline, frame)}
          view={viewAt(timeline, frame)}
          player={episode.player}
          players={playerLabels(kifu, episode.player)}
          fps={fps}
        />
      </div>
      {!line && timeline.replayStart !== null && frame >= timeline.replayStart && (
        <div style={{
          position: "absolute", left: 160, right: 160, top: SUBTITLE_TOP + 12, height: HEIGHT - SUBTITLE_TOP - 30,
          display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16,
          background: "rgba(0, 0, 0, 0.55)", fontFamily: FONT, color: "#f6f2ea", fontSize: 46, fontWeight: 700,
        }}>
          神視点で振り返り（お互いの駒がすべて見えます）
        </div>
      )}
      {line && (
        <div style={{
          position: "absolute", left: 160, right: 160, top: SUBTITLE_TOP + 12, height: HEIGHT - SUBTITLE_TOP - 30,
          display: "flex", alignItems: "center", gap: 28, padding: "0 36px", borderRadius: 16,
          background: "rgba(0, 0, 0, 0.55)", fontFamily: FONT, color: "#f6f2ea",
        }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: speaker?.color ?? "#fff", whiteSpace: "nowrap" }}>
            {speaker?.name ?? line.speaker}
          </span>
          <span style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.3 }}>{line.text}</span>
        </div>
      )}
      {moveSound && timeline.entries.map((entry) => entry.step.type === "move" && (
        // 駒が滑り終わって盤に着いた瞬間に鳴らす
        <Sequence key={`m${entry.startFrame}`} from={entry.startFrame + SLIDE_FRAMES} durationInFrames={fps} layout="none">
          <Html5Audio src={staticFile(moveSound.src)} trimBefore={Math.round(moveSound.leadSilenceSec * fps)} />
        </Sequence>
      ))}
      {timeline.lines.map((cue) => cue.voice && (
        <Sequence key={`v${cue.lineId}`} from={cue.startFrame} durationInFrames={cue.durationFrames} layout="none">
          <Html5Audio src={staticFile(cue.voice.src)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
