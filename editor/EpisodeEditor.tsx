import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_GOD_REPLAY, mergeWithNext, segmentIndexOfPly, segmentStartPly, splitSegment, updateSegment, type Episode,
  type GodReplay,
} from "../src/episode/episode.ts";
import { parseKif, replay } from "../src/kifu/parseKif.ts";
import { kifuSteps } from "../src/kifu/steps.ts";
import { HEIGHT, WIDTH } from "../src/render/BoardView.tsx";
import { EpisodeVideo, FPS, type MoveSound } from "../src/render/EpisodeVideo.tsx";
import { checkInfo } from "../src/shogi/attack.ts";
import { COLOR_MARK, attemptLabel } from "../src/shogi/notation.ts";
import { buildTimeline, entryAt } from "../src/timeline/timeline.ts";
import { SegmentEditor } from "./SegmentEditor.tsx";

/** 棋譜一覧の行のキー。attempt があれば ply 手目の前の反則 */
const stepKey = (ply: number, attempt?: number) => (attempt === undefined ? `${ply}` : `${ply}:${attempt}`);

interface Props {
  episode: Episode;
  kifuText: string;
  moveSound: MoveSound;
  onChange: (episode: Episode) => void;
}

export function EpisodeEditor({ episode, kifuText, moveSound, onChange }: Props) {
  const { kifu, positions, steps } = useMemo(() => {
    const kifu = parseKif(kifuText);
    return { kifu, positions: replay(kifu), steps: kifuSteps(kifu) };
  }, [kifuText]);
  const timeline = useMemo(() => buildTimeline(kifu, episode, FPS), [kifu, episode]);
  const [selected, setSelected] = useState(0);
  const [frame, setFrame] = useState(0);
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    player.addEventListener("frameupdate", onFrame);
    return () => player.removeEventListener("frameupdate", onFrame);
  }, []);

  const seek = (f: number) => {
    playerRef.current?.seekTo(f);
    setFrame(f);
  };
  const selectSegment = (i: number) => {
    setSelected(i);
    seek(timeline.segmentStarts[i] ?? 0);
  };

  /** 各手・各反則が盤に出るフレーム（キーは stepKey） */
  const stepFrames = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of timeline.entries) {
      // 本編の後の神視点の再生ではなく、本編で出るフレームを指す
      if (timeline.replayStart !== null && e.startFrame >= timeline.replayStart) break;
      if (e.step.type === "move") map.set(stepKey(e.step.ply), e.startFrame);
      if (e.step.type === "attempt") map.set(stepKey(e.step.ply, e.step.index), e.startFrame);
    }
    return map;
  }, [timeline]);

  const shownStep = entryAt(timeline, frame).entry.step;
  const shownKey = shownStep.type === "initial" ? "" : stepKey(shownStep.ply, shownStep.type === "attempt" ? shownStep.index : undefined);
  const segIndex = Math.min(selected, episode.segments.length - 1);
  /** 区間の後ろの「神視点で振り返り」を選んでいるか */
  const replaySelected = !!episode.godReplay && selected === episode.segments.length;
  const selectReplay = () => {
    setSelected(episode.segments.length);
    if (timeline.replayStart !== null) seek(timeline.replayStart);
  };

  // 再生位置の手が棋譜一覧の外に出たらスクロールして見せる
  useEffect(() => {
    document.querySelector(".moves .current")?.scrollIntoView({ block: "nearest" });
  }, [shownKey]);

  return (
    <div className="editor">
      <aside className="moves">
        {kifu.moves.map((move) => {
          const seg = segmentIndexOfPly(episode, move.ply);
          const isEnd = episode.segments[seg]!.endPly === move.ply;
          const check = checkInfo(positions[move.ply]!);
          const rowClass = (key: string, ...extra: (string | false)[]) => [
            "move", `seg-${seg % 2}`, seg === segIndex && "selected", key === shownKey && "current", ...extra,
          ].filter(Boolean).join(" ");
          const goto = (key: string) => {
            setSelected(seg);
            seek(stepFrames.get(key) ?? 0);
          };
          // 反則は、その手を指した側が指す前に試した手なので、手の行の上に起きた順で並べる
          const attempts = move.attemptsBefore.map((attempt, i) => {
            const key = stepKey(move.ply, i);
            return (
              <div key={key} className={rowClass(key, "attempt")} onClick={() => goto(key)}>
                <span className="ply" />
                <span className="notation">{COLOR_MARK[move.color]}{attemptLabel(attempt)}</span>
                <span className={`badge ${move.color === episode.player ? "bad" : "good"}`}>反則</span>
              </div>
            );
          });
          const key = stepKey(move.ply);
          return [...attempts, (
            <div
              key={key}
              className={rowClass(key, isEnd && seg < episode.segments.length - 1 && "boundary")}
              onClick={() => goto(key)}
            >
              <span className="ply">{move.ply}</span>
              <span className="notation">{COLOR_MARK[move.color]}{move.notation}</span>
              {check && <span className="badge check">王手</span>}
              {!isEnd && (
                <button
                  className="split"
                  title="この手の後で区間を区切る"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(splitSegment(episode, move.ply));
                  }}
                >✂</button>
              )}
            </div>
          )];
        })}
      </aside>

      <main className="preview">
        <Player
          ref={playerRef}
          component={EpisodeVideo}
          inputProps={{ episode, kifuText, moveSound }}
          durationInFrames={timeline.durationInFrames}
          compositionWidth={WIDTH}
          compositionHeight={HEIGHT}
          fps={FPS}
          controls
          clickToPlay
          style={{ width: "100%" }}
          acknowledgeRemotionLicense
        />
      </main>

      <section className="segment">
        {replaySelected ? (
          <ReplayEditor
            replay={episode.godReplay!}
            onChange={(godReplay) => onChange({ ...episode, godReplay })}
            onRemove={() => {
              setSelected(episode.segments.length - 1);
              onChange({ ...episode, godReplay: undefined });
            }}
          />
        ) : (
          <SegmentEditor
            episode={episode}
            index={segIndex}
            steps={steps}
            timeline={timeline}
            frame={frame}
            onSeek={seek}
            onChange={(patch) => onChange(updateSegment(episode, segIndex, patch))}
            onMergeNext={() => onChange(mergeWithNext(episode, segIndex))}
          />
        )}
      </section>

      <footer className="segbar">
        {episode.segments.map((seg, i) => {
          const start = timeline.segmentStarts[i]!;
          const end = timeline.segmentStarts[i + 1] ?? timeline.replayStart ?? timeline.durationInFrames;
          return (
            <button
              key={seg.id}
              className={`segchip ${i === segIndex && !replaySelected ? "selected" : ""} ${seg.lines.length ? "talk" : "auto"}`}
              style={{ flexGrow: Math.max(1, end - start) }}
              onClick={() => selectSegment(i)}
              title={`${segmentStartPly(episode, i)}〜${seg.endPly}手目`}
            >
              {segmentStartPly(episode, i)}-{seg.endPly}
              <small>{seg.lines.length ? ` セリフ${seg.lines.length}` : " 自動"}</small>
            </button>
          );
        })}
        {episode.godReplay && timeline.replayStart !== null ? (
          <button
            className={`segchip replay ${replaySelected ? "selected" : ""}`}
            style={{ flexGrow: Math.max(1, timeline.durationInFrames - timeline.replayStart) }}
            onClick={selectReplay}
            title="本編の後に、初手から最終手までを神視点で再生する"
          >
            神視点で振り返り
          </button>
        ) : (
          <button
            className="segchip add-replay"
            title="本編の後に、初手から最終手までを神視点で再生する"
            onClick={() => {
              setSelected(episode.segments.length);
              onChange({ ...episode, godReplay: DEFAULT_GOD_REPLAY });
            }}
          >＋ 最後に神視点で振り返り</button>
        )}
      </footer>
    </div>
  );
}

function ReplayEditor({ replay, onChange, onRemove }: {
  replay: GodReplay;
  onChange: (replay: GodReplay) => void;
  onRemove: () => void;
}) {
  const secInput = (key: keyof GodReplay) => (
    <input
      type="number" min={0.2} max={5} step={0.1} className="ratio"
      value={replay[key]}
      onChange={(e) => {
        const value = Number(e.target.value);
        if (value > 0) onChange({ ...replay, [key]: value });
      }}
    />
  );
  return (
    <div>
      <div className="seg-header">
        <h2>神視点で振り返り</h2>
        <button onClick={onRemove} title="振り返りをやめる">削除</button>
      </div>
      <p className="note">本編の後に、初手から最終手までを神視点（お互いの駒が見える）で再生します。反則も含めて並べます。</p>
      <div className="line-row advance">
        <span>1手</span>{secInput("moveSec")}<span>秒</span>
        <span>反則1回</span>{secInput("attemptSec")}<span>秒</span>
      </div>
    </div>
  );
}
