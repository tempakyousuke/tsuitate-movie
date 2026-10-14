# tsuitate-movie

ついたて将棋（将棋クエスト）の実況動画を、棋譜と台本から自動生成するツール。YouTube 投稿・将来の収益化が前提。
ゆっくり（AquesTalk）と結月ゆかり（A.I.VOICE2）の掛け合いで棋譜を再生する動画を、**盤面・立ち絵・字幕まですべて自前で描画**し（YMM4 は使わない）、Remotion で書き出す方針。

## コマンド

```sh
pnpm test          # vitest
pnpm typecheck     # tsc --noEmit
pnpm studio        # Remotion Studio でプレビュー（右側で props を切り替えられる）
pnpm render        # out/replay.mp4 を書き出す（神視点）
pnpm still out/x.png --frame=2020                      # 1フレームだけ画像に（`--` を挟むと --frame が無視される）
pnpm exec remotion render src/index.ts KifuReplay out/replay-sente.mp4 --props='{"view":"sente"}'
pnpm sounds:placeholder   # ffmpeg で仮の駒音 public/sounds/koma.wav を合成
```

変更したら `pnpm test` と `pnpm typecheck` を通し、見た目の変更は `pnpm still` で静止画を出して確認する。

## 構成

データは「棋譜 → 局面列 → タイムライン → フレームごとの画面内容 → 描画」と一方向に流れる。描画以外は純関数でテストしている。

| ファイル | 役割 |
|---|---|
| `src/kifu/parseKif.ts` | 将棋クエストからコピーした KIF を読む `parseKif()` と、全局面を作る `replay()`（`positions[n]` = n手目の後） |
| `src/shogi/position.ts` | 盤面・持ち駒のモデル。`applyMove()` は駒の有無と駒種の整合だけ検証（利きの合法性は見ない） |
| `src/shogi/attack.ts` | 駒の利きと王手判定（`checkInfo()`）。棋譜に王手の記録がないので局面から計算する |
| `src/shogi/notation.ts` | 駒の表示文字、棋譜表記 |
| `src/timeline/timeline.ts` | 場面（初期・反則試行・指し手・終局）を並べたタイムライン。今は `autoTimeline()`（1手1秒、反則1.5秒）の仮のもの |
| `src/render/scene.ts` | `sceneAt()`: フレーム番号 → その時点の画面内容（局面、移動中の駒、反則、王手など） |
| `src/render/BoardView.tsx` | 盤・駒・持ち駒・情報欄の SVG 描画 |
| `src/render/KifuReplay.tsx` | Remotion のコンポジション。`calculateMetadata` で棋譜を読み込み尺を決める。駒音の配置もここ |
| `src/Root.tsx` | コンポジション登録と既定の props |

## ドメイン知識（コードから読み取りにくいもの）

- **棋譜の `*illegal:0046FU,5554OU` 行**: 審判に止められた反則試行。CSA 風表記（移動元 `00` は打つ、駒種は動かした後の駒）。**直前の行の指し手を指した側が、その手を指す前に試した手**で、試した順に並ぶ。`KifuMove.attemptsBefore` に入れている。
- 将棋クエストの棋譜には終局行（投了など）がないことがある。
- **視点 `view`**: `god`（両方見える）/ `sente` / `gote`。先後の視点では相手の盤上の駒・持ち駒・指し手を隠す。`gote` は盤を180度回す。相手の手でも駒音は鳴らす（ユーザー確認済み）。
- **王手**は審判が両者に告げるので、どの視点でも表示する。ただし盤上の王手している駒は、その駒の側が見える視点でだけハイライトする。
- **`player`**: 動画の主役（ユーザー自身）の手番。神視点でも「自分」はこの側。
- **色の意味**: 自分に有利な出来事は緑（`COLORS.good`）、不利な出来事は赤（`COLORS.bad`）。王手は「王手をかけた」が緑、「王手をかけられた」が赤。反則は相手の反則が緑、自分の反則が赤。新しい告知を足すときもこれに揃える。
- 反則・王手の効果音は付けない（ユーザー判断）。

## 素材とライセンス（必ず守る）

- **再配布できない素材はリポジトリに入れない**。`public/sounds/`、`assets/`、`*.wav`、`*.mp3` は `.gitignore` 済み。素材を足すときは、入手元を `src/Root.tsx` 等のコメントに残す。
- **実戦の棋譜は対戦相手のユーザー名を含む**ので入れない（`sample.txt`、`kifu/` は除外済み）。テスト・デモ用は名前を伏せた `public/demo.kif` を使う。
- 駒音: On-Jin ～音人～「将棋・駒を強めに指す03」（`public/sounds/spo_ge_syogi_s03.mp3`）。個人なら収益化を含めて無料・クレジット任意。再配布と直リンクは禁止。YouTube 収入を個人事業として扱うなら利用連絡が必要な可能性がある。頭に約0.107秒の無音があるので `leadSilenceSec` で飛ばしている。
- フォントは Noto Serif JP（OFL）を `@remotion/google-fonts` で読み込むので、書き出しにはネット接続が要る。
- 今後の素材について事前に確認済みのこと:
  - AquesTalk（ゆっくりの声）は収益化するなら有料の使用ライセンスが必要。収益化プログラムに申し込む前に買えば、過去動画にも広告を付けてよい。
  - A.I.VOICE2 結月ゆかりは個人の収益化に追加ライセンス不要。生成した音声ファイルの配布は禁止。
  - 立ち絵はきつね式ゆっくり（霊夢・魔理沙・ゆづきゆかり）が候補。AI でのアップスケールや AI 学習への利用は禁止。生成 AI で作ったゆかり画像をそのまま使うと VOCALOMAKETS のガイドライン上収益化できない。

## 今後の予定

1. **台本（YAML）→ タイムライン**: セリフ1行ごとに盤面操作（手を進める・視点切替・反則試行の表示など）を紐づけ、`at` で start / end / 比率 / 秒数を指定できるようにする。音声 wav の長さからタイムラインを計算し、`autoTimeline()` を置き換える。視点の切り替えも台本で場面ごとに行う。
2. セリフ音声（AquesTalkPlayer のコマンドライン、A.I.VOICE2 の一括書き出し）の取り込み。
3. 立ち絵（パーツの口パク・まばたき）と字幕の描画。

## 作業上の注意

- コミットは `main` に直接せず、ブランチを切る（現在は `feat/kifu-replay`）。
- `pnpm add` で build script を持つ依存（esbuild など）が入ると止まる。`pnpm approve-builds <名前>` で許可する（`pnpm-workspace.yaml` の `allowBuilds`）。
