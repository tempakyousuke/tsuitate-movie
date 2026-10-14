import type { Episode, Voice } from "../src/episode/episode.ts";
import type { Color } from "../src/shogi/position.ts";
import type { BgmFile } from "./api.ts";
import type { ImportResult } from "./voices.ts";

export interface LoadedEpisode {
  episode: Episode;
  kifuText: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export const api = {
  list: () => request<string[]>("GET", "/episodes"),
  load: (name: string) => request<LoadedEpisode>("GET", `/episodes/${name}`),
  create: (name: string, kifuText: string, player: Color) =>
    request<LoadedEpisode>("POST", "/episodes", { name, kifuText, player }),
  save: (name: string, episode: Episode) => request<{ ok: true }>("PUT", `/episodes/${name}`, episode),
  /** ページを閉じる途中でも送り切る（keepalive）。結果は待たない */
  saveOnUnload: (name: string, episode: Episode) => {
    void fetch(`/api/episodes/${name}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(episode), keepalive: true,
    });
  },
  aquestalk: (name: string, lineId: string, preset: string, text: string) =>
    request<Voice>("POST", `/episodes/${name}/voices/aquestalk`, { lineId, preset, text }),
  importAivoice: (name: string, folder: string, lines: { id: string; text: string }[]) =>
    request<ImportResult>("POST", `/episodes/${name}/voices/import`, { folder, lines }),
  listBgm: () => request<BgmFile[]>("GET", "/bgm"),
  normalizeVoice: (name: string, lineId: string, voice: Voice) =>
    request<Voice>("POST", `/episodes/${name}/voices/normalize`, { lineId, voice }),
};
