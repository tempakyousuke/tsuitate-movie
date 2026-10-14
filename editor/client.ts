import type { Episode } from "../src/episode/episode.ts";
import type { Color } from "../src/shogi/position.ts";

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
};
