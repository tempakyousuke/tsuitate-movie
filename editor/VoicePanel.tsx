import { useEffect, useRef, useState } from "react";
import {
  freshVoice, setVoices, speechText, type Episode, type Line, type Speaker, type Voice,
} from "../src/episode/episode.ts";
import { api } from "./client.ts";

interface Props {
  name: string;
  episode: Episode;
  onChange: (episode: Episode) => void;
  onClose: () => void;
}

const FOLDER_KEY = "aivoiceFolder";

/** 「未作成 3 件・作り直し 2 件」。作り直しは、読みやセリフを書き換えて音声が古くなったもの */
function pendingLabel(lines: Line[]): string {
  const stale = lines.filter((l) => l.voice).length;
  const missing = lines.length - stale;
  return [missing && `未作成 ${missing} 件`, stale && `作り直し ${stale} 件`].filter(Boolean).join("・");
}

/**
 * セリフ音声の作成・取り込み。
 * ゆっくり（AquesTalk）は AquesTalkPlayer で自動で作る。ゆかり（A.I.VOICE2）は API がないので、
 * セリフをコピー → A.I.VOICE2 で一括書き出し → 書き出しフォルダを取り込む、の半自動
 */
export function VoicePanel({ name, episode, onChange, onClose }: Props) {
  // 作成中に台本が変わっても上書きしないよう、最新の台本に音声を足していく
  const latest = useRef(episode);
  useEffect(() => {
    latest.current = episode;
  }, [episode]);
  const addVoices = (voices: Record<string, Voice>) => {
    latest.current = setVoices(latest.current, voices);
    onChange(latest.current);
  };

  const lines = episode.segments.flatMap((s) => s.lines).filter((l) => speechText(l));
  const speakers = episode.speakers.filter((s) => lines.some((l) => l.speaker === s.id));
  const linesOf = (s: Speaker) => lines.filter((l) => l.speaker === s.id);
  const pending = (s: Speaker) => linesOf(s).filter((l) => !freshVoice(l));

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog voice-panel" onClick={(e) => e.stopPropagation()}>
        <h2>セリフ音声</h2>
        <p className="note">
          セリフ（読みを指定していれば読み）を音声にします。セリフを書き換えると、その音声は古いものとして使われなくなるので、作り直してください。
        </p>
        <NormalizeSection name={name} lines={lines.filter((l) => freshVoice(l) && freshVoice(l)!.lufs === undefined)} onVoices={addVoices} />
        {speakers.map((s) => (
          <section key={s.id} className="voice-speaker" style={{ borderLeftColor: s.color }}>
            <h3>
              {s.name}
              <small>　{linesOf(s).length - pending(s).length} / {linesOf(s).length} 件できています</small>
            </h3>
            {s.engine === "aquestalk"
              ? <AquesTalkSection name={name} speaker={s} pending={pending(s)} onVoices={addVoices} />
              : <AivoiceSection name={name} pending={pending(s)} onVoices={addVoices} />}
          </section>
        ))}
        {speakers.length === 0 && <p className="note">セリフがまだありません。</p>}
        <div className="buttons">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

/** 音量をそろえる仕組みを入れる前に作った音声を、そろえ直す（今後作る・取り込む音声は自動でそろう） */
function NormalizeSection({ name, lines, onVoices }: {
  name: string; lines: Line[]; onVoices: (v: Record<string, Voice>) => void;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (lines.length === 0 && !progress) return null;

  const run = async () => {
    setError(null);
    setProgress({ done: 0, total: lines.length });
    for (const [i, line] of lines.entries()) {
      try {
        onVoices({ [line.id]: await api.normalizeVoice(name, line.id, line.voice!) });
      } catch (e) {
        setError(`「${line.text.slice(0, 20)}」: ${(e as Error).message}`);
        return;
      }
      setProgress({ done: i + 1, total: lines.length });
    }
  };

  return (
    <section className="voice-speaker" style={{ borderLeftColor: "var(--accent)" }}>
      <h3>音量をそろえる</h3>
      <p className="note">
        話者によって音量が違う（ゆっくりが大きい）ので、音声はすべて同じ音量（-18 LUFS）にそろえます。
        これから作る・取り込む音声は自動でそろいます。
      </p>
      <button className="primary" disabled={lines.length === 0 || (progress !== null && progress.done < progress.total)} onClick={run}>
        {lines.length === 0 ? "すべてそろっています" : `作成済みの ${lines.length} 件の音量をそろえる`}
      </button>
      {progress && <span className="progress">　{progress.done} / {progress.total}</span>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function AquesTalkSection({ name, speaker, pending, onVoices }: {
  name: string; speaker: Speaker; pending: Line[]; onVoices: (v: Record<string, Voice>) => void;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const generate = async () => {
    const targets = pending;
    setErrors([]);
    setProgress({ done: 0, total: targets.length });
    for (const [i, line] of targets.entries()) {
      try {
        const voice = await api.aquestalk(name, line.id, speaker.preset ?? speaker.name, speechText(line));
        onVoices({ [line.id]: voice });
      } catch (e) {
        setErrors((errs) => [...errs, `「${line.text.slice(0, 20)}」: ${(e as Error).message}`]);
        // AquesTalkPlayer がない・プリセットがない場合は全部失敗するので止める
        if (/ありません/.test((e as Error).message)) break;
      }
      setProgress({ done: i + 1, total: targets.length });
    }
  };

  const running = progress !== null && progress.done < progress.total && errors.length === 0;
  return (
    <div>
      <button className="primary" disabled={pending.length === 0 || running} onClick={generate}>
        {pending.length === 0 ? "すべてできています" : `${pendingLabel(pending)}を AquesTalk で作る`}
      </button>
      {progress && <span className="progress">　{progress.done} / {progress.total}</span>}
      {errors.map((e) => <p key={e} className="error">{e}</p>)}
    </div>
  );
}

function AivoiceSection({ name, pending, onVoices }: {
  name: string; pending: Line[]; onVoices: (v: Record<string, Voice>) => void;
}) {
  const [folder, setFolder] = useState(() => {
    try {
      return localStorage.getItem(FOLDER_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 同じ文のセリフは1つの音声で足りるので、コピーするときは重複を除く
  const texts = [...new Set(pending.map(speechText))];

  const copy = () => {
    navigator.clipboard.writeText(texts.join("\n")).then(() => setCopied(true), (e: Error) => setError(e.message));
  };
  const importFolder = () => {
    setError(null);
    try {
      localStorage.setItem(FOLDER_KEY, folder);
    } catch {
      // 保存できなくても取り込みはできる
    }
    api.importAivoice(name, folder, pending.map((l) => ({ id: l.id, text: speechText(l) }))).then(
      (r) => {
        onVoices(r.voices);
        const lines = [`${Object.keys(r.voices).length} 件取り込みました。`];
        if (r.missing.length) lines.push(`まだ音声がないセリフが ${r.missing.length} 件あります（フォルダに同じ文の音声がありません）。`);
        if (r.unmatched.length) {
          lines.push(`どのセリフとも一致しなかった音声が ${r.unmatched.length} 件あります（セリフを書き換えた後の古い書き出しかもしれません）:`);
          lines.push(...r.unmatched.slice(0, 5).map((t) => `・${t}`));
        }
        setResult(lines);
      },
      (e: Error) => setError(e.message),
    );
  };

  return (
    <ol className="steps">
      <li>
        <button disabled={texts.length === 0} onClick={copy}>
          {texts.length === 0 ? "すべてできています" : `${pendingLabel(pending)}をコピー`}
        </button>
        {copied && <span className="progress">　コピーしました</span>}
      </li>
      <li>A.I.VOICE2 に貼り付けて「改行位置で分割」する</li>
      <li>
        「一括書き出し」する。命名規則は「番号_テキスト」など何でもよいですが、
        <strong>「テキストファイルを音声ファイルと一緒に保存する」を有効</strong>にしてください（文の中身で照合します）
      </li>
      <li>
        書き出したフォルダを取り込む
        <div className="line-row">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/A.I.VOICE2/書き出し" />
          <button className="primary" disabled={!folder || pending.length === 0} onClick={importFolder}>取り込む</button>
        </div>
      </li>
      {error && <p className="error">{error}</p>}
      {result?.map((l) => <p key={l} className="note">{l}</p>)}
    </ol>
  );
}
