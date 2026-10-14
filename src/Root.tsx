import { Composition } from "remotion";
import { HEIGHT, WIDTH } from "./render/BoardView.tsx";
import { FPS, KifuReplay, calculateKifuReplayMetadata, type KifuReplayProps } from "./render/KifuReplay.tsx";

const defaultProps: KifuReplayProps = {
  kifuFile: "demo.kif",
  view: "god",
  player: "sente",
  showNames: false,
  // On-Jin ～音人～「将棋・駒を強めに指す03」。再配布不可のためリポジトリには含めない
  // （https://on-jin.com/sound/index.php?kensaku=将棋の駒 から取得して public/sounds/ に置く）
  moveSound: { src: "sounds/spo_ge_syogi_s03.mp3", leadSilenceSec: 0.107 },
};

export function Root() {
  return (
    <Composition
      id="KifuReplay"
      component={KifuReplay}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={1}
      defaultProps={defaultProps}
      calculateMetadata={calculateKifuReplayMetadata}
    />
  );
}
