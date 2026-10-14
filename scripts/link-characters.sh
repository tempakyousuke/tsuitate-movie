#!/bin/sh
# 立ち絵の素材（assets/ に展開したきつね式ゆっくり）を public/characters/<話者id> から読めるようにリンクする。
# 素材のフォルダ名は macOS では濁点が分解された形（NFD）で保存されていて、開発サーバーが URL と照合できないので、
# 英字のリンク名を通して読む。素材は再配布できないので、リンクも含めてコミットしない。
set -eu
cd "$(dirname "$0")/.."
mkdir -p public/characters
for pair in reimu:れいむ marisa:まりさ yukari:ゆづきゆかり; do
  id=${pair%%:*}
  name=${pair#*:}
  # 濁点の表し方（NFC/NFD）によらず、assets/ の中から名前の一致するフォルダを探す
  dir=$(ls assets | node -e 'const n = process.argv[1].normalize("NFC"); process.stdin.on("data", (d) => { const hit = d.toString().split("\n").find((s) => s.normalize("NFC") === n); if (hit) console.log(hit); });' "$name")
  if [ -z "$dir" ]; then
    echo "assets/$name がありません（スキップ）"
    continue
  fi
  ln -sfn "../../assets/$dir" "public/characters/$id"
  echo "public/characters/$id -> assets/$dir"
done
