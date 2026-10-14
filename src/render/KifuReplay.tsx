import { loadFont } from "@remotion/google-fonts/NotoSerifJP";
import { useMemo } from "react";
import {
  AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from "remotion";
import { parseKif, replay } from "../kifu/parseKif.ts";
import type { Color } from "../shogi/position.ts";
import { autoTimeline } from "../timeline/timeline.ts";
import { BoardView, type View } from "./BoardView.tsx";
import { SLIDE_FRAMES, sceneAt } from "./scene.ts";

// 日本語フォントは unicode-range ごとに分割配信されるのでリクエスト数が多くなるが、問題はない
loadFont("normal", { weights: ["700"], subsets: ["japanese", "latin"], ignoreTooManyRequestsWarning: true });

export const FPS = 30;

export type KifuReplayProps = {
  /** public/ 以下の棋譜ファイル */
  kifuFile: string;
  view: View;
  /** 動画の主役（自分）の手番。神視点でも王手の「かけた／かけられた」はこちら側から見て表示する */
  player: Color;
  /** false なら対局者名の代わりに「先手」「後手」と表示する */
  showNames: boolean;
  /** 駒が着いたときに鳴らす public/ 以下の効果音。null なら鳴らさない */
  moveSound: string | null;
  /** calculateMetadata で読み込んだ棋譜本文 */
  kifuText?: string;
};

export const calculateKifuReplayMetadata: CalculateMetadataFunction<KifuReplayProps> = async ({ props }) => {
  const kifuText = await fetch(staticFile(props.kifuFile)).then((r) => r.text());
  const timeline = autoTimeline(parseKif(kifuText), { fps: FPS });
  let { moveSound } = props;
  // 効果音は再配布できない素材なので、ない環境でも無音で書き出せるようにする
  if (moveSound && !(await fetch(staticFile(moveSound), { method: "HEAD" })).ok) {
    console.warn(`効果音 public/${moveSound} がないので無音にします（scripts/make-placeholder-sounds.sh で仮の音を作れます）`);
    moveSound = null;
  }
  return { durationInFrames: timeline.durationInFrames, props: { ...props, moveSound, kifuText } };
};

export function KifuReplay({ kifuText, view, player, showNames, moveSound }: KifuReplayProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = useMemo(() => {
    if (kifuText === undefined) return null;
    const kifu = parseKif(kifuText);
    return { kifu, positions: replay(kifu), timeline: autoTimeline(kifu, { fps }) };
  }, [kifuText, fps]);
  if (!data) return null;

  const { kifu, positions, timeline } = data;
  const names = showNames
    ? { sente: kifu.sente.name, gote: kifu.gote.name }
    : { sente: "先手", gote: "後手" };

  return (
    <AbsoluteFill>
      <BoardView scene={sceneAt(kifu, positions, timeline, frame)} view={view} player={player} names={names} fps={fps} />
      {moveSound && timeline.entries.map((entry) => entry.step.type === "move" && (
        // 駒が滑り終わって盤に着いた瞬間に鳴らす
        <Sequence key={entry.startFrame} from={entry.startFrame + SLIDE_FRAMES} durationInFrames={fps} layout="none">
          <Html5Audio src={staticFile(moveSound)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
