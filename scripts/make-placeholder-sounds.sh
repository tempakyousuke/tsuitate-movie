#!/bin/sh
# 本番の効果音を用意するまでの仮の駒音を ffmpeg で合成する。
# 本番の素材（効果音ラボ等）は再配布禁止なのでリポジトリには入れず、public/sounds/ に置く（.gitignore 済み）。
set -eu
cd "$(dirname "$0")/.."
mkdir -p public/sounds
ffmpeg -v error -y \
  -f lavfi -i "anoisesrc=d=0.15:c=pink:a=0.9" \
  -f lavfi -i "sine=f=700:d=0.15" \
  -filter_complex "[0]bandpass=f=2200:w=1800,afade=t=out:st=0:d=0.04[n];[1]volume=0.5,afade=t=out:st=0:d=0.09[s];[n][s]amix=inputs=2:normalize=0,afade=t=in:d=0.002" \
  -ar 48000 public/sounds/koma.wav
echo "public/sounds/koma.wav を作成しました（仮の駒音）"
