import { useEffect, useState } from "react";
import { DEFAULT_BGM_VOLUME, type Episode } from "../src/episode/episode.ts";
import type { BgmFile } from "./api.ts";
import { api } from "./client.ts";

/** BGM の曲と音量。曲は public/bgm/ に置いたものから選ぶ */
export function BgmControl({ episode, onChange }: { episode: Episode; onChange: (episode: Episode) => void }) {
  const [files, setFiles] = useState<BgmFile[]>([]);
  useEffect(() => {
    api.listBgm().then(setFiles, () => setFiles([]));
  }, []);

  const select = (src: string) => {
    const file = files.find((f) => f.src === src);
    onChange({
      ...episode,
      bgm: file && { src: file.src, durationSec: file.durationSec, volume: episode.bgm?.volume ?? DEFAULT_BGM_VOLUME },
    });
  };
  const bgm = episode.bgm;

  return (
    <span className="bgm" title="BGM は public/bgm/ に置いた曲から選びます。動画の最後まで繰り返し流します">
      BGM
      <select value={bgm?.src ?? ""} onChange={(e) => select(e.target.value)}>
        <option value="">なし</option>
        {files.map((f) => <option key={f.src} value={f.src}>{f.name}</option>)}
        {bgm && !files.some((f) => f.src === bgm.src) && <option value={bgm.src}>{bgm.src}（見つかりません）</option>}
      </select>
      {bgm && (
        <>
          <input
            type="range" min={0} max={0.5} step={0.01} value={bgm.volume}
            onChange={(e) => onChange({ ...episode, bgm: { ...bgm, volume: Number(e.target.value) } })}
          />
          <span className="progress">{Math.round(bgm.volume * 100)}%</span>
        </>
      )}
    </span>
  );
}
