import { Fragment, useState } from "react";
import { freshVoice, newId, segmentStartPly, type Episode, type Line, type LineTiming, type Segment } from "../src/episode/episode.ts";
import { suggestedYomi } from "../src/episode/yomi.ts";
import { stepIndexOf, type KifuStep } from "../src/kifu/steps.ts";
import type { View } from "../src/render/BoardView.tsx";
import { DEFAULT_EXPRESSION, EXPRESSIONS, expressionOf } from "../src/render/characters.ts";
import type { Timeline } from "../src/timeline/timeline.ts";

interface Props {
  episode: Episode;
  index: number;
  steps: KifuStep[];
  timeline: Timeline;
  frame: number;
  onSeek: (frame: number) => void;
  onChange: (patch: Partial<Segment>) => void;
  onMergeNext: () => void;
  /** ゆっくり（AquesTalk）のセリフ1つを音声にする */
  onMakeVoice: (line: Line) => Promise<void>;
}

const VIEWS: { value: View; label: string }[] = [
  { value: "sente", label: "先手視点" },
  { value: "gote", label: "後手視点" },
  { value: "god", label: "神視点" },
];

export function SegmentEditor({ episode, index, steps, timeline, frame, onSeek, onChange, onMergeNext, onMakeVoice }: Props) {
  const seg = episode.segments[index]!;
  const startPly = segmentStartPly(episode, index);
  const isLast = index === episode.segments.length - 1;
  // 最後の区間は、最終手の後の反則（10回目の反則負けなど）まで選べる
  const segSteps = steps.filter((s) => s.ref.ply >= startPly && (s.ref.ply <= seg.endPly || isLast));

  const setLines = (lines: Line[]) => onChange({ lines });
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(seg.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const moveLine = (i: number, delta: number) => {
    const lines = seg.lines.slice();
    const [l] = lines.splice(i, 1);
    lines.splice(i + delta, 0, l!);
    setLines(lines);
  };
  /** 新しいセリフを at 番目に入れる（末尾に足すときは at = セリフ数）。入れたセリフの入力欄にすぐ書けるようにする */
  const [focusId, setFocusId] = useState<string | null>(null);
  const insertLine = (at: number) => {
    // 話者は直前のセリフの次の人にしておく（掛け合いを書きやすくする）
    const prev = seg.lines[at - 1];
    const prevIdx = episode.speakers.findIndex((s) => s.id === prev?.speaker);
    const speaker = episode.speakers[(prevIdx + 1) % episode.speakers.length]!.id;
    const line: Line = { id: newId(), speaker, text: "" };
    setLines([...seg.lines.slice(0, at), line, ...seg.lines.slice(at)]);
    setFocusId(line.id);
  };

  return (
    <div>
      <div className="seg-header">
        <h2>{startPly}〜{seg.endPly}手目</h2>
        <select value={seg.view} onChange={(e) => onChange({ view: e.target.value as View })}>
          {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
        {!isLast && <button onClick={onMergeNext} title="次の区間と1つにまとめる">次の区間と結合</button>}
      </div>
      {seg.lines.length === 0 && (
        <p className="note">セリフがない区間は、1手ずつ自動で再生します。</p>
      )}

      {seg.lines.map((line, i) => {
        // 前のセリフで進めた位置より後のステップだけ選べる
        const reached = Math.max(
          (segSteps[0]?.index ?? 1) - 1,
          ...seg.lines.slice(0, i).map((l) => (l.advance ? stepIndexOf(steps, l.advance.to) : 0)),
        );
        const options = segSteps.filter((s) => s.index > reached);
        const cue = timeline.lines.find((c) => c.lineId === line.id);
        const playing = cue && frame >= cue.startFrame && frame < cue.startFrame + cue.durationFrames;
        return (
          <Fragment key={line.id}>
            {/* セリフとセリフの間（と先頭）に挿入する。マウスを乗せたときだけ見える */}
            <button className="insert-line" onClick={() => insertLine(i)} title="ここに新しいセリフを入れる">
              ＋ ここにセリフを挿入
            </button>
            <LineEditor
              line={line}
              episode={episode}
              options={options}
              playing={!!playing}
              isFirst={i === 0}
              isLast={i === seg.lines.length - 1}
              autoFocus={line.id === focusId}
              onSeek={() => cue && onSeek(cue.startFrame)}
              onChange={(patch) => updateLine(i, patch)}
              onMove={(d) => moveLine(i, d)}
              onDelete={() => setLines(seg.lines.filter((_, j) => j !== i))}
              onMakeVoice={() => onMakeVoice(line)}
            />
          </Fragment>
        );
      })}
      <button className="add" onClick={() => insertLine(seg.lines.length)}>＋ セリフを追加</button>
      {seg.lines.length > 0 && (
        <p className="note">最後のセリフまでに {seg.endPly}手目まで進めなかった分は、セリフの後に自動で再生します。</p>
      )}
    </div>
  );
}

function LineEditor({ line, episode, options, playing, isFirst, isLast, autoFocus, onSeek, onChange, onMove, onDelete, onMakeVoice }: {
  line: Line;
  episode: Episode;
  options: KifuStep[];
  playing: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** 追加・挿入した直後のセリフなら、入力欄にカーソルを置く */
  autoFocus: boolean;
  onSeek: () => void;
  onChange: (patch: Partial<Line>) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
  onMakeVoice: () => Promise<void>;
}) {
  const speaker = episode.speakers.find((s) => s.id === line.speaker);
  const voice = freshVoice(line);
  // ゆかり（A.I.VOICE2）は A.I.VOICE2 の辞書で読みを直すので、自動の読みはゆっくりだけ
  const usesAutoYomi = speaker?.engine === "aquestalk";
  const suggested = suggestedYomi(line.text);
  const [making, setMaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const makeVoice = () => {
    setMaking(true);
    setVoiceError(null);
    onMakeVoice().catch((e: Error) => setVoiceError(e.message)).finally(() => setMaking(false));
  };
  const target = line.advance ? options.find((s) => s.ref.ply === line.advance!.to.ply && s.ref.attempt === line.advance!.to.attempt) : undefined;
  const at = line.advance?.at ?? { kind: "start" };
  // このセリフで進める手数（前のセリフで進めた位置の次から target まで。反則も1つと数える）
  const stepCount = target && options[0] ? target.index - options[0].index + 1 : 0;

  const setTarget = (value: string) => {
    const step = options.find((s) => String(s.index) === value);
    onChange({ advance: step ? { to: step.ref, at } : undefined });
  };
  const setTiming = (timing: LineTiming) => line.advance && onChange({ advance: { ...line.advance, at: timing } });

  return (
    <div className={`line ${playing ? "playing" : ""}`} style={{ borderLeftColor: speaker?.color }}>
      <div className="line-row">
        <select value={line.speaker} onChange={(e) => onChange({ speaker: e.target.value })}>
          {episode.speakers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button title="このセリフから再生位置を合わせる" onClick={onSeek}>▶</button>
        {voice
          ? <span className="voice-badge ok" title={`${voice.durationSec.toFixed(1)}秒`}>音声あり</span>
          : <span className="voice-badge" title="上の「音声…」から作成・取り込みできます">{line.voice ? "音声が古い" : "音声なし"}</span>}
        {/* ゆっくりはその場で作り直せる（ゆかりは A.I.VOICE2 で書き出して「音声…」から取り込む） */}
        {!voice && speaker?.engine === "aquestalk" && line.text.trim() && (
          <button className="make-voice" disabled={making} onClick={makeVoice}>
            {making ? "作成中…" : line.voice ? "作り直す" : "音声を作る"}
          </button>
        )}
        <span className="spacer" />
        <button disabled={isFirst} onClick={() => onMove(-1)} title="上へ">↑</button>
        <button disabled={isLast} onClick={() => onMove(1)} title="下へ">↓</button>
        <button onClick={onDelete} title="削除">✕</button>
      </div>
      <textarea
        rows={2}
        autoFocus={autoFocus}
        value={line.text}
        placeholder="セリフ（字幕に出す文）"
        onChange={(e) => onChange(
          // ゆっくりは読み間違える言葉の読みを自動で入れる。手で直した読み（自動で入れたものと違う）は書き換えない
          usesAutoYomi && (!line.yomi || line.yomi === suggestedYomi(line.text))
            ? { text: e.target.value, yomi: suggestedYomi(e.target.value) }
            : { text: e.target.value },
        )}
      />
      <details open={!!line.yomi}>
        <summary>読みを指定</summary>
        <div className="line-row">
          <input
            className="yomi"
            value={line.yomi ?? ""}
            placeholder="読み上げ用の文（空なら字幕と同じ）"
            onChange={(e) => onChange({ yomi: e.target.value || undefined })}
          />
          {usesAutoYomi && suggested && suggested !== line.yomi && (
            <button title={`字幕から自動で入れる読み: ${suggested}`} onClick={() => onChange({ yomi: suggested })}>自動で入れる</button>
          )}
        </div>
      </details>
      <div className="line-row expression">
        <span>表情</span>
        <select
          title="話している間の表情（話し終わったら普通に戻る）"
          value={expressionOf(line.expression) === DEFAULT_EXPRESSION ? "" : line.expression}
          onChange={(e) => onChange({ expression: e.target.value || undefined })}
        >
          {EXPRESSIONS.map((ex) => <option key={ex.id} value={ex === DEFAULT_EXPRESSION ? "" : ex.id}>{ex.label}</option>)}
        </select>
      </div>
      {/* 「盤面を〈どこ〉まで、セリフの〈いつ〉で進める」と1文で読めるように並べる */}
      <div className="line-row advance">
        <span>盤面を</span>
        <select value={target ? String(target.index) : ""} onChange={(e) => setTarget(e.target.value)}>
          <option value="">進めない</option>
          {options.map((s) => <option key={s.index} value={s.index}>{s.ref.ply}手目 {s.label}</option>)}
        </select>
        {line.advance && (
          <>
            <span>まで、セリフの</span>
            <select
              value={at.kind}
              onChange={(e) => {
                const kind = e.target.value as LineTiming["kind"];
                setTiming(kind === "ratio" ? { kind, value: 0.5 } : { kind });
              }}
            >
              <option value="start">頭</option>
              <option value="ratio">途中</option>
              <option value="end">終わり</option>
            </select>
            {at.kind === "ratio" && (
              <input
                type="number" min={0} max={100} step={5} className="ratio"
                value={Math.round(at.value * 100)}
                onChange={(e) => setTiming({ kind: "ratio", value: Number(e.target.value) / 100 })}
              />
            )}
            <span>{at.kind === "ratio" ? "% の所で進める" : "で進める"}</span>
          </>
        )}
      </div>
      {target && stepCount > 1 && (
        <p className="note">
          {at.kind === "start"
            ? `${stepCount}手分（反則も1つと数える）を、セリフの頭から自動再生と同じ間隔で1つずつ進めます。`
            : `${stepCount}手分（反則も1つと数える）を、セリフの頭から均等な間隔で進め、指定した所で最後の手に着きます。`}
        </p>
      )}
      {line.advance && !target && <p className="warn">進める先が前のセリフより前になっています。選び直してください。</p>}
      {voiceError && <p className="warn">音声を作れませんでした: {voiceError}</p>}
    </div>
  );
}
