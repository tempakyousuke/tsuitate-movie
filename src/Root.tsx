import { Composition } from "remotion";
import { HEIGHT, WIDTH } from "./render/BoardView.tsx";
import {
  DEFAULT_MOVE_SOUND, EpisodeComposition, FPS, KifuReplayComposition,
  calculateEpisodeMetadata, calculateKifuReplayMetadata,
} from "./render/EpisodeVideo.tsx";

export function Root() {
  return (
    <>
      {/* 台本（public/episodes/<episodeName>/）から動画を書き出す */}
      <Composition
        id="Episode"
        component={EpisodeComposition}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={1}
        defaultProps={{ episodeName: "demo", moveSound: DEFAULT_MOVE_SOUND }}
        calculateMetadata={calculateEpisodeMetadata}
      />
      {/* 台本なしで棋譜を自動再生する（視点の確認用） */}
      <Composition
        id="KifuReplay"
        component={KifuReplayComposition}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={1}
        defaultProps={{ kifuFile: "demo.kif", view: "god", player: "sente", moveSound: DEFAULT_MOVE_SOUND }}
        calculateMetadata={calculateKifuReplayMetadata}
      />
    </>
  );
}
