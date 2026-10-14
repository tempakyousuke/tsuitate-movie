import { useEffect, useRef, useState } from "react";
import type { Episode } from "../src/episode/episode.ts";
import { DEFAULT_MOVE_SOUND, availableMoveSound, type MoveSound } from "../src/render/EpisodeVideo.tsx";
import type { Color } from "../src/shogi/position.ts";
import { api, type LoadedEpisode } from "./client.ts";
import { BgmControl } from "./BgmControl.tsx";
import { EpisodeEditor } from "./EpisodeEditor.tsx";
import { VoicePanel } from "./VoicePanel.tsx";

type SaveState = "saved" | "saving" | "error";

const renderCommand = (name: string) =>
  `pnpm exec remotion render src/index.ts Episode out/${name}.mp4 --props='{"episodeName":"${name}"}'`;
const SAVE_DELAY_MS = 600;

export function App() {
  const [names, setNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<(LoadedEpisode & { name: string }) | null>(null);
  const [creating, setCreating] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [moveSound, setMoveSound] = useState<MoveSound>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSave = useRef<{ name: string; episode: Episode } | null>(null);

  useEffect(() => {
    api.list().then(setNames, (e: Error) => setError(e.message));
    availableMoveSound(DEFAULT_MOVE_SOUND).then(setMoveSound);
    const last = localStorage.getItem("lastEpisode");
    if (last) open(last);
  }, []);

  const open = (name: string) => {
    api.load(name).then(
      (loaded) => {
        setCurrent({ ...loaded, name });
        setError(null);
        localStorage.setItem("lastEpisode", name);
      },
      (e: Error) => setError(e.message),
    );
  };

  // 保存待ちのままタブを閉じても編集が消えないようにする。閉じる前に確認を出しつつすぐ保存を始め、
  // それでも閉じられたら keepalive で送る（keepalive は 64KB までなので、長い台本は確認の間の保存が頼り）
  useEffect(() => {
    const confirmLeave = (e: BeforeUnloadEvent) => {
      const pending = pendingSave.current;
      if (!pending) return;
      clearTimeout(saveTimer.current);
      api.save(pending.name, pending.episode).then(() => {
        if (pendingSave.current !== pending) return;
        pendingSave.current = null;
        setSaveState("saved");
      });
      e.preventDefault();
    };
    const flush = () => {
      if (pendingSave.current) api.saveOnUnload(pendingSave.current.name, pendingSave.current.episode);
    };
    window.addEventListener("beforeunload", confirmLeave);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", confirmLeave);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  /** 編集のたびに呼ばれる。少し待ってからまとめて保存する */
  const change = (episode: Episode) => {
    if (!current) return;
    setCurrent({ ...current, episode });
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    const name = current.name;
    const pending = { name, episode };
    pendingSave.current = pending;
    saveTimer.current = setTimeout(() => {
      api.save(name, episode).then(
        () => {
          // 保存が終わるまでは「保存待ち」として残し、その間に閉じられても送り直せるようにする
          if (pendingSave.current !== pending) return;
          pendingSave.current = null;
          setSaveState("saved");
        },
        (e: Error) => {
          setSaveState("error");
          setError(`保存に失敗しました: ${e.message}`);
        },
      );
    }, SAVE_DELAY_MS);
  };

  const created = (name: string, loaded: LoadedEpisode) => {
    setNames((n) => [...n, name].sort());
    setCurrent({ ...loaded, name });
    localStorage.setItem("lastEpisode", name);
    setCreating(false);
  };

  return (
    <div className="app">
      <header className="topbar">
        <strong>ついたて台本エディタ</strong>
        <select value={current?.name ?? ""} onChange={(e) => open(e.target.value)}>
          <option value="" disabled>台本を選ぶ</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => setCreating(true)}>＋ 新しい台本</button>
        {current && (
          <>
            <button onClick={() => setVoicing(true)}>音声…</button>
            <BgmControl episode={current.episode} onChange={change} />
            <span className={`save save-${saveState}`}>
              {{ saved: "保存済み", saving: "保存中…", error: "保存エラー" }[saveState]}
            </span>
            <code className="hint" title={renderCommand(current.name)}>{renderCommand(current.name)}</code>
          </>
        )}
        {!moveSound && <span className="warn">駒音がないので無音です</span>}
      </header>
      {error && <div className="error" onClick={() => setError(null)}>{error}（クリックで閉じる）</div>}
      {creating && <NewEpisodeDialog onCreated={created} onCancel={() => setCreating(false)} />}
      {voicing && current && (
        <VoicePanel name={current.name} episode={current.episode} onChange={change} onClose={() => setVoicing(false)} />
      )}
      {current
        ? <EpisodeEditor key={current.name} {...current} moveSound={moveSound} onChange={change} />
        : <p className="empty">台本を選ぶか、「新しい台本」から将棋クエストの棋譜を貼り付けて作ってください。</p>}
    </div>
  );
}

function NewEpisodeDialog({ onCreated, onCancel }: {
  onCreated: (name: string, loaded: LoadedEpisode) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [kifuText, setKifuText] = useState("");
  const [player, setPlayer] = useState<Color>("sente");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    api.create(name, kifuText, player).then((loaded) => onCreated(name, loaded), (e: Error) => setError(e.message));
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h2>新しい台本</h2>
        <label>
          名前（フォルダ名。英数字・_・-）
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="001" />
        </label>
        <label>
          自分の手番
          <select value={player} onChange={(e) => setPlayer(e.target.value as Color)}>
            <option value="sente">先手</option>
            <option value="gote">後手</option>
          </select>
        </label>
        <label>
          将棋クエストの棋譜（貼り付け）
          <textarea rows={14} value={kifuText} onChange={(e) => setKifuText(e.target.value)} />
        </label>
        <p className="note">棋譜は public/episodes/{name || "<名前>"}/kifu.kif に保存されます（対戦相手の名前を含むのでコミットされません）。</p>
        {error && <p className="error">{error}</p>}
        <div className="buttons">
          <button onClick={onCancel}>やめる</button>
          <button className="primary" disabled={!name || !kifuText} onClick={submit}>作成</button>
        </div>
      </div>
    </div>
  );
}
