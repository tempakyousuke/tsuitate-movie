import { useEffect, useState } from "react";
import { staticFile } from "remotion";
import type { Episode } from "../src/episode/episode.ts";
import {
  SPRITE_H, SPRITE_W, hasSprite, isMultiplyLayer, namedExpression, parseExpressionSets, spriteParts, type Expression,
} from "../src/render/characters.ts";

type ExpressionSet = { no: string; expression: Expression };

/** 立ち絵の素材に入っている表情のセット（全/セット.txt）を、すべて並べて見る */
export function ExpressionGallery({ episode, onClose }: { episode: Episode; onClose: () => void }) {
  const speakers = episode.speakers.filter((s) => hasSprite(s.id));
  const [speakerId, setSpeakerId] = useState(speakers[0]?.id ?? "");
  const [sets, setSets] = useState<ExpressionSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSets(null);
    setError(null);
    fetch(staticFile(`characters/${speakerId}/全/セット.txt`))
      .then((res) => {
        if (!res.ok) throw new Error(`セット.txt を読めませんでした（${res.status}）`);
        return res.arrayBuffer();
      })
      .then((buf) => setSets(parseExpressionSets(new TextDecoder("shift_jis").decode(buf))))
      .catch((e: Error) => setError(e.message));
  }, [speakerId]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog expression-gallery" onClick={(e) => e.stopPropagation()}>
        <h2>表情一覧</h2>
        <p className="note">
          素材に入っている表情のセットです。名前があるものはセリフの「表情」で選べます。
          ほかのセットを使いたいときは番号で伝えてください（番号は3人とも同じ表情です）。
        </p>
        <div className="line-row">
          {speakers.map((s) => (
            <button key={s.id} className={s.id === speakerId ? "primary" : ""} onClick={() => setSpeakerId(s.id)}>{s.name}</button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        {!sets && !error && <p className="progress">読み込み中…</p>}
        <div className="expression-grid">
          {sets?.map(({ no, expression }) => {
            const named = namedExpression(expression);
            const spec = `顔${expression.顔}-眉${expression.眉}-目${expression.目}-口${expression.口}`;
            return (
              <figure key={no} className={named ? "named" : ""} title={spec}>
                <FacePreview speakerId={speakerId} expression={expression} />
                <figcaption>{no}{named && <strong> {named.label}</strong>}</figcaption>
              </figure>
            );
          })}
        </div>
        <div className="buttons">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

/** 顔の周りだけを切り出して表示する（立ち絵は 400x320 で、顔は下の中央にある） */
const CROP = { x: 80, y: 110, w: 240, h: 210 };
const SCALE = 0.55;

function FacePreview({ speakerId, expression }: { speakerId: string; expression: Expression }) {
  return (
    <div className="face" style={{ width: CROP.w * SCALE, height: CROP.h * SCALE }}>
      <div style={{
        position: "absolute", width: SPRITE_W, height: SPRITE_H,
        transform: `scale(${SCALE}) translate(${-CROP.x}px, ${-CROP.y}px)`, transformOrigin: "0 0",
      }}>
        {/* 目と口は段階 0（開いた目・閉じた口）の1枚 */}
        {spriteParts(speakerId, expression).map(({ layer, srcs }) => (
          <img key={layer} src={staticFile(srcs[0]!)} loading="lazy" alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", mixBlendMode: isMultiplyLayer(srcs[0]!) ? "multiply" : undefined }} />
        ))}
      </div>
    </div>
  );
}
