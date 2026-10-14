import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_GOD_REPLAY, mergeWithNext, segmentIndexOfPly, segmentStartPly, setVoices, speechText, splitSegment,
  updateSegment, type Episode, type GodReplay,
} from "../src/episode/episode.ts";
import { attemptsAt, colorOfPly, parseKif, replay } from "../src/kifu/parseKif.ts";
import { kifuSteps } from "../src/kifu/steps.ts";
import { HEIGHT, WIDTH } from "../src/render/BoardView.tsx";
import { EpisodeVideo, FPS, type MoveSound } from "../src/render/EpisodeVideo.tsx";
import { checkInfo } from "../src/shogi/attack.ts";
import { COLOR_MARK, attemptLabel } from "../src/shogi/notation.ts";
import { buildTimeline, entryAt, lineAt } from "../src/timeline/timeline.ts";
import { api } from "./client.ts";
import { SegmentEditor } from "./SegmentEditor.tsx";

/** 棋譜一覧の行のキー。attempt があれば ply 手目の前の反則 */
const stepKey = (ply: number, attempt?: number) => (attempt === undefined ? `${ply}` : `${ply}:${attempt}`);

interface Props {
  /** 台本の名前（public/episodes/<名前>/） */
  name: string;
  episode: Episode;
  kifuText: string;
  moveSound: MoveSound;
  onChange: (episode: Episode) => void;
}

export function EpisodeEditor({ name, episode, kifuText, moveSound, onChange }: Props) {
  const { kifu, positions, steps } = useMemo(() => {
    const kifu = parseKif(kifuText);
    return { kifu, positions: replay(kifu), steps: kifuSteps(kifu) };
  }, [kifuText]);
  const timeline = useMemo(() => buildTimeline(kifu, episode, FPS), [kifu, episode]);
  const [selected, setSelected] = useState(0);
  const [frame, setFrame] = useState(0);
  const playerRef = useRef<PlayerRef>(null);
  const inputProps = useMemo(() => ({ episode, kifuText, moveSound }), [episode, kifuText, moveSound]);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const episodeRef = useRef(episode);
  episodeRef.current = episode;

  // 再生中に毎フレーム描き直すと、セリフの多い台本では重くなってプレビューの映像と音声がずれ、
  // Player が音声を巻き戻して同じ言葉が繰り返して聞こえる。表示中の手かセリフが変わったときだけ更新する
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    let marker = "";
    const onFrame = (e: { detail: { frame: number } }) => {
      const f = e.detail.frame;
      const tl = timelineRef.current;
      const next = `${entryAt(tl, f).entry.startFrame}|${lineAt(tl, f)?.lineId ?? ""}`;
      if (next === marker) return;
      marker = next;
      setFrame(f);
    };
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

  const rowClass = (seg: number, key: string, ...extra: (string | false)[]) => [
    "move", `seg-${seg % 2}`, seg === segIndex && "selected", key === shownKey && "current", ...extra,
  ].filter(Boolean).join(" ");
  const goto = (seg: number, key: string) => {
    setSelected(seg);
    seek(stepFrames.get(key) ?? 0);
  };
  /** ply 手目の前の反則の行。反則は、その手番の側が指す前に試した手なので、手の行の上に起きた順で並べる */
  const attemptRows = (ply: number, seg: number) => {
    const color = colorOfPly(ply);
    return attemptsAt(kifu, ply).map((attempt, i) => {
      const key = stepKey(ply, i);
      return (
        <div key={key} className={rowClass(seg, key, "attempt")} onClick={() => goto(seg, key)}>
          <span className="ply" />
          <span className="notation">{COLOR_MARK[color]}{attemptLabel(attempt)}</span>
          <span className={`badge ${color === episode.player ? "bad" : "good"}`}>反則</span>
        </div>
      );
    });
  };
  const lastSeg = episode.segments.length - 1;

  return (
    <div className="editor">
      <aside className="moves">
        {kifu.moves.map((move) => {
          const seg = segmentIndexOfPly(episode, move.ply);
          const isEnd = episode.segments[seg]!.endPly === move.ply;
          const check = checkInfo(positions[move.ply]!);
          const attempts = attemptRows(move.ply, seg);
          const key = stepKey(move.ply);
          return [...attempts, (
            <div
              key={key}
              className={rowClass(seg, key, isEnd && seg < lastSeg && "boundary")}
              onClick={() => goto(seg, key)}
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
        {/* 指せずに終わった手番の反則（10回目の反則負けなど）と終局の理由 */}
        {kifu.end && attemptRows(kifu.end.ply, lastSeg)}
        {kifu.end && (
          <div className={`move seg-${lastSeg % 2} end`}>
            <span className="ply">{kifu.end.ply}</span>
            <span className="notation">{kifu.end.reason}</span>
          </div>
        )}
      </aside>

      <main className="preview">
        <Player
          ref={playerRef}
          component={EpisodeVideo}
          inputProps={inputProps}
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
            onMakeVoice={async (line) => {
              const speaker = episode.speakers.find((s) => s.id === line.speaker)!;
              const voice = await api.aquestalk(name, line.id, speaker.preset ?? speaker.name, speechText(line));
              // 作成中に編集されていても消さないよう、最新の台本に入れる
              onChange(setVoices(episodeRef.current, { [line.id]: voice }));
            }}
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
