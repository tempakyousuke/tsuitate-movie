import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defaultEpisode, type Episode } from "../src/episode/episode.ts";
import { parseKif, replay } from "../src/kifu/parseKif.ts";
import type { Color } from "../src/shogi/position.ts";

/**
 * エディタ用の API（開発サーバーのミドルウェア）。台本と棋譜を public/episodes/<名前>/ に読み書きする。
 *   GET  /api/episodes          → 台本の一覧
 *   POST /api/episodes          → 棋譜を貼り付けて新しい台本を作る { name, kifuText, player }
 *   GET  /api/episodes/:name    → { episode, kifuText }
 *   PUT  /api/episodes/:name    → script.json を上書き保存
 */
export function episodeApi(publicDir: string): Plugin {
  const episodesDir = join(publicDir, "episodes");
  const dirOf = (name: string) => {
    if (!/^[\w-]+$/.test(name)) throw new HttpError(400, "名前は英数字・_・- だけにしてください");
    return join(episodesDir, name);
  };

  const routes = async (req: IncomingMessage, url: URL): Promise<unknown> => {
    const name = url.pathname.match(/^\/episodes\/([^/]+)$/)?.[1];

    if (url.pathname === "/episodes" && req.method === "GET") {
      if (!existsSync(episodesDir)) return [];
      const entries = await readdir(episodesDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && existsSync(join(episodesDir, e.name, "script.json")))
        .map((e) => e.name)
        .sort();
    }

    if (url.pathname === "/episodes" && req.method === "POST") {
      const body = (await readJson(req)) as { name: string; kifuText: string; player: Color };
      const dir = dirOf(body.name);
      if (existsSync(dir)) throw new HttpError(409, `${body.name} はもうあります`);
      let lastPly: number;
      try {
        const kifu = parseKif(body.kifuText);
        replay(kifu);
        lastPly = kifu.moves.length;
      } catch (e) {
        throw new HttpError(400, `棋譜を読めません: ${(e as Error).message}`);
      }
      const episode = defaultEpisode(lastPly, body.player);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "kifu.kif"), body.kifuText);
      await writeFile(join(dir, "script.json"), JSON.stringify(episode, null, 2) + "\n");
      return { episode, kifuText: body.kifuText };
    }

    if (name && req.method === "GET") {
      const dir = dirOf(name);
      if (!existsSync(dir)) throw new HttpError(404, `${name} がありません`);
      const [script, kifuText] = await Promise.all([
        readFile(join(dir, "script.json"), "utf8"), readFile(join(dir, "kifu.kif"), "utf8"),
      ]);
      return { episode: JSON.parse(script) as Episode, kifuText };
    }

    if (name && req.method === "PUT") {
      const dir = dirOf(name);
      if (!existsSync(dir)) throw new HttpError(404, `${name} がありません`);
      const episode = (await readJson(req)) as Episode;
      await writeFile(join(dir, "script.json"), JSON.stringify(episode, null, 2) + "\n");
      return { ok: true };
    }

    throw new HttpError(404, "not found");
  };

  return {
    name: "episode-api",
    configureServer(server) {
      server.middlewares.use("/api", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        routes(req, url)
          .then((data) => send(res, 200, data))
          .catch((e: unknown) => send(res, e instanceof HttpError ? e.status : 500, { error: (e as Error).message }));
      });
    },
  };
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
