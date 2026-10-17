/**
 * ゆっくり（AquesTalk）が読み間違える言葉を、読み（カタカナ）に置き換える。
 * 台本で読みを手で直した記録から作った。AquesTalk は「5六」を「ゴジュウロク」と読むなど、
 * 将棋の符号を読めないので、符号は規則で、それ以外の言葉は辞書で置き換える。
 * ゆかり（A.I.VOICE2）は A.I.VOICE2 側の辞書で直しているので使わない
 */

/** 読み間違える言葉と、その読み。台本で直した言葉を見つけたらここに足す */
const DICTIONARY: [word: string, yomi: string][] = [
  ["入玉", "ニュウギョク"],
  ["駒割り", "コマワリ"],
  ["駒割", "コマワリ"],
  ["あの方", "あのかた"],
];

/** 筋（算用数字）と段（漢数字）の読み。将棋の読み上げに合わせて2と5は伸ばす */
const FILE_YOMI: Record<string, string> = {
  1: "イチ", 2: "ニー", 3: "サン", 4: "ヨン", 5: "ゴー", 6: "ロク", 7: "ナナ", 8: "ハチ", 9: "キュウ",
};
const RANK_YOMI: Record<string, string> = {
  一: "イチ", 二: "ニー", 三: "サン", 四: "ヨン", 五: "ゴー", 六: "ロク", 七: "ナナ", 八: "ハチ", 九: "キュウ",
};
/** 数（割・分の前）の読み */
const DIGIT_YOMI: Record<string, string> = {
  1: "イチ", 2: "ニ", 3: "サン", 4: "ヨン", 5: "ゴ", 6: "ロク", 7: "ナナ", 8: "ハチ", 9: "キュウ",
};
/** 符号の後や「同」の後の駒の読み（「歩」を「ホ」と読むなどを防ぐ） */
const PIECE_YOMI: Record<string, string> = {
  歩: "フ", 香: "キョウ", 桂: "ケイ", 銀: "ギン", 金: "キン", 角: "カク", 飛: "ヒ", 玉: "ギョク", 王: "オウ",
  と: "ト", 馬: "ウマ", 竜: "リュウ", 龍: "リュウ",
};

/** 全角の数字は半角にそろえる */
const halfDigit = (d: string) => String.fromCharCode(d.charCodeAt(0) >= 0xff10 ? d.charCodeAt(0) - 0xfee0 : d.charCodeAt(0));

const PIECES = "[歩香桂銀金角飛玉王と馬竜龍]";

/** 字幕の文を、AquesTalk が正しく読める読みにする。置き換える所がなければ元の文のまま */
export function autoYomi(text: string): string {
  let yomi = text;
  for (const [word, reading] of DICTIONARY) yomi = yomi.replaceAll(word, reading);
  return yomi
    // 符号: 5六・4五歩・3一馬
    .replace(new RegExp(`([1-9１-９])([一二三四五六七八九])(${PIECES})?`, "g"), (_, f: string, r: string, p?: string) =>
      FILE_YOMI[halfDigit(f)]! + RANK_YOMI[r]! + (p ? PIECE_YOMI[p]! : ""))
    // 同玉・同歩
    .replace(new RegExp(`同(${PIECES})`, "g"), (_, p: string) => `ドウ${PIECE_YOMI[p]!}`)
    // 4筋
    .replace(/([1-9１-９])筋/g, (_, f: string) => `${FILE_YOMI[halfDigit(f)]!}筋`)
    // 8割2分
    .replace(/([1-9１-９])割(?:([1-9１-９])分)?/g, (_, w: string, b?: string) =>
      `${DIGIT_YOMI[halfDigit(w)]!}ワリ${b ? `${DIGIT_YOMI[halfDigit(b)]!}ブ` : ""}`)
    // 単独の「桂」「香」（「カツラ」「カオリ」と読まれる）。桂馬・香車・香りはそのまま
    .replace(/桂(?!馬)/g, "ケイ")
    .replace(/香(?![車り])/g, "キョウ");
}

/** 字幕から自動で入れる読み。置き換える所がなければ undefined（読みを指定しない） */
export function suggestedYomi(text: string): string | undefined {
  const yomi = autoYomi(text);
  return yomi === text ? undefined : yomi;
}
