import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { episodeApi } from "./api.ts";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

// public/ をルートで配信するので、Remotion の staticFile("x") が "/x" のままエディタでも使える
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir,
  plugins: [react(), episodeApi(publicDir)],
  server: { port: 5180 },
});
