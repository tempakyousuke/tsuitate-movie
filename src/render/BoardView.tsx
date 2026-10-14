import type { ReactNode } from "react";
import { interpolate, spring } from "remotion";
import { COLOR_MARK, PIECE_CHAR, kanjiRank, zenFile } from "../shogi/notation.ts";
import { HAND_KINDS, opposite, pieceAt, type Color, type Piece, type Square } from "../shogi/position.ts";
import type { Scene } from "./scene.ts";

/** god: 両方の駒を見せる / sente・gote: その手番から見える盤（相手の駒は隠す） */
export type View = "god" | "sente" | "gote";

export const WIDTH = 1920;
export const HEIGHT = 1080;
const CELL = 96;
const BOARD = CELL * 9;
const BOARD_X = (WIDTH - BOARD) / 2;
const BOARD_Y = (HEIGHT - BOARD) / 2;
const INFO_X = BOARD_X + BOARD + 220;
const FONT = "'Noto Serif JP', serif";

const COLORS = {
  background: "#1d2433",
  wood: "#e3bd74",
  woodEdge: "#b98d45",
  line: "#3b2a14",
  piece: "#f6e2b3",
  pieceEdge: "#8a6a35",
  text: "#1b1209",
  promoted: "#b3261e",
  lastMove: "rgba(255, 140, 40, 0.35)",
  /** 自分に有利な出来事（王手をかけた・相手の反則） */
  good: "#16a06b",
  goodSquare: "rgba(22, 160, 107, 0.45)",
  /** 自分に不利な出来事（王手をかけられた・自分の反則） */
  bad: "#d63a2f",
  badSquare: "rgba(214, 58, 47, 0.45)",
  panel: "rgba(255, 255, 255, 0.08)",
  panelText: "#f2efe8",
};

interface Props {
  scene: Scene;
  view: View;
  /** 動画の主役（自分）の手番。神視点での「かけた／かけられた」の向きに使う */
  player: Color;
  names: Record<Color, string>;
  fps: number;
}

export function BoardView({ scene, view, player, names, fps }: Props) {
  // 後手視点では盤を180度回す
  const flipped = view === "gote";
  const near: Color = flipped ? "gote" : "sente";
  const far: Color = flipped ? "sente" : "gote";
  const visible = (color: Color) => view === "god" || view === color;
  const self: Color = view === "god" ? player : view;
  /** 自分が王手をかけている側なら true */
  const checkGiven = scene.check !== null && scene.check.checked !== self;

  const cellOrigin = ({ file, rank }: Square) => ({
    x: BOARD_X + (flipped ? file - 1 : 9 - file) * CELL,
    y: BOARD_Y + (flipped ? 9 - rank : rank - 1) * CELL,
  });
  const cellCenter = (sq: Square) => {
    const { x, y } = cellOrigin(sq);
    return { x: x + CELL / 2, y: y + CELL / 2 };
  };
  /** 手前側の駒台の位置（打つ駒の移動元に使う） */
  const handAnchor = (color: Color) =>
    color === near ? { x: BOARD_X + BOARD + 110, y: BOARD_Y + BOARD - 60 } : { x: BOARD_X - 110, y: BOARD_Y + 60 };

  const pieces: ReactNode[] = [];
  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 1; file <= 9; file++) {
      const piece = pieceAt(scene.position, { file, rank });
      if (!piece || !visible(piece.color)) continue;
      const { x, y } = cellCenter({ file, rank });
      pieces.push(<PieceGlyph key={`${file}${rank}`} piece={piece} x={x} y={y} upsideDown={piece.color === far} />);
    }
  }

  const { sliding, attempt, lastMove } = scene;
  let slidingNode: ReactNode = null;
  if (sliding && visible(sliding.piece.color)) {
    const to = cellCenter(sliding.to);
    const from = sliding.from ? cellCenter(sliding.from) : handAnchor(sliding.piece.color);
    const t = interpolate(sliding.t, [0, 1], [0, 1], { easing: (v) => 1 - (1 - v) ** 3 });
    slidingNode = (
      <PieceGlyph
        piece={sliding.piece}
        x={from.x + (to.x - from.x) * t}
        y={from.y + (to.y - from.y) * t}
        upsideDown={sliding.piece.color === far}
        scale={1.08}
      />
    );
  }

  let attemptNode: ReactNode = null;
  if (attempt) {
    const stamp = spring({ frame: attempt.local, fps, config: { damping: 12, stiffness: 180 } });
    const showDetail = visible(attempt.color);
    const color = attempt.color === self ? COLORS.bad : COLORS.good;
    const to = cellCenter(attempt.attempt.to);
    const from = attempt.attempt.from ? cellCenter(attempt.attempt.from) : handAnchor(attempt.color);
    attemptNode = (
      <g>
        {showDetail && (
          <>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={8}
              strokeLinecap="round" strokeDasharray="4 14" opacity={0.85} />
            <g opacity={0.6}>
              <PieceGlyph piece={{ color: attempt.color, kind: attempt.attempt.piece }} x={to.x} y={to.y}
                upsideDown={attempt.color === far} />
            </g>
            <XMark x={to.x} y={to.y} size={CELL * 0.42 * stamp} color={color} />
          </>
        )}
        {/* 盤上の試行位置を隠さないよう、スタンプは右の情報欄に出す */}
        <g transform={`translate(${INFO_X + 130} ${BOARD_Y + 300}) scale(${0.6 + 0.4 * stamp}) rotate(-8)`}
          opacity={Math.min(1, stamp * 1.5)}>
          <rect x={-125} y={-55} width={250} height={110} rx={16} fill="rgba(255,255,255,0.9)"
            stroke={color} strokeWidth={8} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={72} fontWeight={700}
            fontFamily={FONT} fill={color}>反則</text>
        </g>
      </g>
    );
  }

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <rect width={WIDTH} height={HEIGHT} fill={COLORS.background} />
      <rect x={BOARD_X - 30} y={BOARD_Y - 30} width={BOARD + 60} height={BOARD + 60} rx={10}
        fill={COLORS.wood} stroke={COLORS.woodEdge} strokeWidth={4} />
      {lastMove && visible(lastMove.color) && (() => {
        const { x, y } = cellOrigin(lastMove.to);
        return <rect x={x} y={y} width={CELL} height={CELL} fill={COLORS.lastMove} />;
      })()}
      {scene.check && (
        <g>
          {visible(scene.check.checked) && (() => {
            const { x, y } = cellOrigin(scene.check.king);
            return <rect x={x} y={y} width={CELL} height={CELL}
              fill={checkGiven ? COLORS.goodSquare : COLORS.badSquare} />;
          })()}
          {visible(opposite(scene.check.checked)) && scene.check.checkers.map((sq) => {
            const { x, y } = cellOrigin(sq);
            return <rect key={`${sq.file}${sq.rank}`} x={x + 4} y={y + 4} width={CELL - 8} height={CELL - 8}
              fill="none" stroke={checkGiven ? COLORS.good : COLORS.bad} strokeWidth={6} />;
          })}
        </g>
      )}
      <Grid />
      <Coordinates flipped={flipped} />
      {pieces}
      {slidingNode}
      <Hand color={far} position={scene.position} name={names[far]} hidden={!visible(far)} side="far" />
      <Hand color={near} position={scene.position} name={names[near]} hidden={!visible(near)} side="near" />
      <InfoPanel scene={scene} view={view} visible={visible} />
      {scene.check && <CheckBadge given={checkGiven} announcedAt={scene.checkAnnouncedAt} fps={fps} />}
      {attemptNode}
    </svg>
  );
}

function Grid() {
  const lines: ReactNode[] = [];
  for (let i = 0; i <= 9; i++) {
    const w = i === 0 || i === 9 ? 4 : 2;
    lines.push(<line key={`v${i}`} x1={BOARD_X + i * CELL} y1={BOARD_Y} x2={BOARD_X + i * CELL} y2={BOARD_Y + BOARD} stroke={COLORS.line} strokeWidth={w} />);
    lines.push(<line key={`h${i}`} x1={BOARD_X} y1={BOARD_Y + i * CELL} x2={BOARD_X + BOARD} y2={BOARD_Y + i * CELL} stroke={COLORS.line} strokeWidth={w} />);
  }
  for (const [i, j] of [[3, 3], [6, 3], [3, 6], [6, 6]] as const) {
    lines.push(<circle key={`s${i}${j}`} cx={BOARD_X + i * CELL} cy={BOARD_Y + j * CELL} r={6} fill={COLORS.line} />);
  }
  return <g>{lines}</g>;
}

function Coordinates({ flipped }: { flipped: boolean }) {
  const labels: ReactNode[] = [];
  for (let i = 0; i < 9; i++) {
    const file = flipped ? i + 1 : 9 - i;
    const rank = flipped ? 9 - i : i + 1;
    labels.push(
      <text key={`f${i}`} x={BOARD_X + i * CELL + CELL / 2} y={BOARD_Y - 13} textAnchor="middle"
        fontSize={20} fontFamily={FONT} fill={COLORS.line}>{zenFile(file)}</text>,
      <text key={`r${i}`} x={BOARD_X + BOARD + 15} y={BOARD_Y + i * CELL + CELL / 2} dominantBaseline="central"
        textAnchor="middle" fontSize={20} fontFamily={FONT} fill={COLORS.line}>{kanjiRank(rank)}</text>,
    );
  }
  return <g>{labels}</g>;
}

function PieceGlyph({ piece, x, y, upsideDown, scale = 1 }: {
  piece: Piece; x: number; y: number; upsideDown: boolean; scale?: number;
}) {
  const promoted = ["TO", "NY", "NK", "NG", "UM", "RY"].includes(piece.kind);
  const char = piece.kind === "OU" && piece.color === "gote" ? "王" : PIECE_CHAR[piece.kind];
  return (
    <g transform={`translate(${x} ${y}) rotate(${upsideDown ? 180 : 0}) scale(${scale})`}>
      <polygon points="0,-42 30,-30 38,42 -38,42 -30,-30" fill={COLORS.piece} stroke={COLORS.pieceEdge} strokeWidth={2} />
      <text y={6} textAnchor="middle" dominantBaseline="central" fontSize={50} fontWeight={700}
        fontFamily={FONT} fill={promoted ? COLORS.promoted : COLORS.text}>{char}</text>
    </g>
  );
}

function XMark({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={12} strokeLinecap="round">
      <line x1={x - size} y1={y - size} x2={x + size} y2={y + size} />
      <line x1={x - size} y1={y + size} x2={x + size} y2={y - size} />
    </g>
  );
}

function Hand({ color, position, name, hidden, side }: {
  color: Color; position: Scene["position"]; name: string; hidden: boolean; side: "near" | "far";
}) {
  const hand = position.hands[color];
  const kinds = HAND_KINDS.filter((k) => hand[k] > 0);
  const x = side === "near" ? BOARD_X + BOARD + 110 : BOARD_X - 110;
  // 手前は下から、奥は上から積む
  const slotY = (i: number) => (side === "near" ? BOARD_Y + BOARD - 60 - i * 92 : BOARD_Y + 60 + i * 92);
  const nameY = side === "near" ? BOARD_Y - 10 : BOARD_Y + BOARD + 10;
  return (
    <g>
      <rect x={x - 70} y={BOARD_Y} width={140} height={BOARD} rx={10} fill={COLORS.panel} />
      <text x={x} y={nameY} textAnchor="middle" dominantBaseline={side === "near" ? "auto" : "hanging"}
        fontSize={28} fontFamily={FONT} fill={COLORS.panelText}>{COLOR_MARK[color]}{name}</text>
      {hidden
        ? <text x={x} y={BOARD_Y + BOARD / 2} textAnchor="middle" fontSize={64} fill={COLORS.panelText} opacity={0.4}>?</text>
        : kinds.map((kind, i) => (
          <g key={kind}>
            <PieceGlyph piece={{ color, kind }} x={x - 12} y={slotY(i)} upsideDown={side === "far"} scale={0.85} />
            {hand[kind] > 1 && (
              <text x={x + 44} y={slotY(i) + 24} textAnchor="middle" fontSize={30} fontWeight={700}
                fontFamily={FONT} fill={COLORS.panelText}>{hand[kind]}</text>
            )}
          </g>
        ))}
    </g>
  );
}

/** 王手の告知。告げられた瞬間に弾むように出て、王手が続く間は残る */
function CheckBadge({ given, announcedAt, fps }: { given: boolean; announcedAt: number | null; fps: number }) {
  const pop = announcedAt === null ? 1 : spring({ frame: announcedAt, fps, config: { damping: 10, stiffness: 200 } });
  return (
    <g fontFamily={FONT}>
      <g transform={`translate(${INFO_X + 130} ${BOARD_Y + 470}) scale(${0.5 + 0.5 * pop})`} opacity={Math.min(1, pop * 1.5)}>
        <rect x={-125} y={-55} width={250} height={110} rx={16} fill={given ? COLORS.good : COLORS.bad} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={72} fontWeight={700} fill="#fff">王手</text>
      </g>
      <text x={INFO_X + 130} y={BOARD_Y + 580} textAnchor="middle" fontSize={34} fontWeight={700}
        fill={COLORS.panelText}>{given ? "王手をかけた" : "王手をかけられた"}</text>
    </g>
  );
}

const VIEW_LABEL: Record<View, string> = { god: "神視点", sente: "先手視点", gote: "後手視点" };

function InfoPanel({ scene, view, visible }: { scene: Scene; view: View; visible: (c: Color) => boolean }) {
  const x = INFO_X;
  const caption = scene.caption && (visible(scene.caption.color) ? scene.caption.text : `${scene.caption.text[0]}？`);
  return (
    <g fontFamily={FONT} fill={COLORS.panelText}>
      <text x={x} y={BOARD_Y + 40} fontSize={30} opacity={0.7}>{VIEW_LABEL[view]}</text>
      <text x={x} y={BOARD_Y + 110} fontSize={44} fontWeight={700}>{scene.ply}手目</text>
      {caption && <text x={x} y={BOARD_Y + 180} fontSize={48} fontWeight={700}>{caption}</text>}
    </g>
  );
}
