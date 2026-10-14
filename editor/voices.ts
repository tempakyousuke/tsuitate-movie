import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { analyzeVoice, parseWav } from "../src/audio/wav.ts";
import type { Voice } from "../src/episode/episode.ts";

const run = promisify(execFile);

/** Mac 版 AquesTalkPlayer。-P プリセット -T 文 -W 出力 で、ウィンドウを開かずに WAV を書き出す */
const AQUESTALK = "/Applications/AquesTalkPlayer.app/Contents/MacOS/AquesTalkPlayer";
const AQUESTALK_ERRORS: Record<number, string> = {
  26: "WAV を書き出せません",
  29: "プリセットがありません（AquesTalkPlayer に「れいむ」「まりさ」があるか確認してください）",
  32: "文を読めません",
};
const FPS = 30;

/**
 * セリフ音声のファイル。public/episodes/<名前>/voices/<セリフid>-<文のハッシュ>.wav に置く。
 * 文が変わると名前も変わるので、プレビューで古い音声がキャッシュから再生されることがない
 */
async function store(episodeDir: string, episodeName: string, lineId: string, text: string, wav: Buffer): Promise<Voice> {
  const dir = join(episodeDir, "voices");
  await mkdir(dir, { recursive: true });
  for (const f of await readdir(dir)) if (f.startsWith(`${lineId}-`)) await rm(join(dir, f));
  const file = `${lineId}-${createHash("sha1").update(text).digest("hex").slice(0, 8)}.wav`;
  await writeFile(join(dir, file), wav);
  const { durationSec, mouth } = analyzeVoice(parseWav(wav), FPS);
  return { src: `episodes/${episodeName}/voices/${file}`, durationSec, text, mouth };
}

/** AquesTalkPlayer でゆっくりのセリフを1つ作る */
export async function generateAquesTalk(
  episodeDir: string, episodeName: string, lineId: string, preset: string, text: string,
): Promise<Voice> {
  if (!existsSync(AQUESTALK)) throw new Error(`AquesTalkPlayer がありません（${AQUESTALK}）`);
  const tmp = join(episodeDir, `.aquestalk-${lineId}.wav`);
  try {
    await run(AQUESTALK, ["-P", preset, "-T", text, "-W", tmp]);
  } catch (e) {
    const code = (e as { code?: number }).code;
    throw new Error(`AquesTalkPlayer が失敗しました: ${AQUESTALK_ERRORS[code ?? -1] ?? `終了コード ${code}`}`);
  }
  try {
    return await store(episodeDir, episodeName, lineId, text, await readFile(tmp));
  } finally {
    await rm(tmp, { force: true });
  }
}

export interface ImportResult {
  /** 取り込めたセリフ id → 音声 */
  voices: Record<string, Voice>;
  /** 書き出しフォルダにあったが、どのセリフとも一致しなかった文 */
  unmatched: string[];
  /** 音声が見つからなかったセリフ id */
  missing: string[];
}

const normalize = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * A.I.VOICE2 の一括書き出しフォルダを取り込む。「テキストファイルを音声ファイルと一緒に保存する」で
 * wav と同名の .txt に全文が入るので、ファイル名（10文字で切られる）ではなく .txt の中身でセリフと照合する
 */
export async function importAivoice(
  episodeDir: string, episodeName: string, folder: string, lines: { id: string; text: string }[],
): Promise<ImportResult> {
  const dir = folder.replace(/^~(?=\/|$)/, homedir());
  if (!existsSync(dir)) throw new Error(`フォルダがありません: ${dir}`);
  const files = await readdir(dir);
  const byText = new Map<string, string>();
  for (const f of files) {
    if (!f.toLowerCase().endsWith(".txt")) continue;
    const wav = files.find((w) => w.toLowerCase() === f.toLowerCase().replace(/\.txt$/, ".wav"));
    if (wav) byText.set(normalize(await readFile(join(dir, f), "utf8")), join(dir, wav));
  }
  if (byText.size === 0) {
    throw new Error("wav と同名の .txt がありません。A.I.VOICE2 の書き出し設定で「テキストファイルを音声ファイルと一緒に保存する」を有効にしてください");
  }

  const voices: Record<string, Voice> = {};
  const used = new Set<string>();
  for (const line of lines) {
    const wav = byText.get(normalize(line.text));
    if (!wav) continue;
    used.add(normalize(line.text));
    voices[line.id] = await store(episodeDir, episodeName, line.id, line.text, await readFile(wav));
  }
  return {
    voices,
    unmatched: [...byText.keys()].filter((t) => !used.has(t)),
    missing: lines.filter((l) => !voices[l.id]).map((l) => l.id),
  };
}
