import { Composition } from "remotion";
import { HEIGHT, WIDTH } from "./render/BoardView.tsx";
import { FPS, KifuReplay, calculateKifuReplayMetadata, type KifuReplayProps } from "./render/KifuReplay.tsx";

const defaultProps: KifuReplayProps = { kifuFile: "demo.kif", view: "god", player: "sente", showNames: false, moveSound: "sounds/koma.wav" };

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
