// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

// ===== NGワードリスト =====

/** 暴言・侮辱 (日本語) */
const INSULTS_JA: string[] = [
  'しね', 'しねよ', 'しねば', 'くたばれ', 'ころす', 'ころすぞ', 'ころされろ',
  'ころしてやる', 'くそ', 'くそが', 'くそやろう', 'くそったれ',
  'きもい', 'きめぇ', 'きっしょ', 'きしょい', 'きもちわるい',
  'うざい', 'うぜぇ', 'うぜー', 'だまれ', 'すっこんでろ',
  'ばか', 'ばーか', 'あほ', 'まぬけ', 'のろま', 'ぼけ', 'かす', 'くず',
  'ごみ', 'ごみくず', 'ざこ', 'よわすぎ', 'へたくそ', 'にわか',
  'たひね', 'じさつしろ', 'いきてるかちない',
];

/** 差別・ヘイトスピーチ (日本語) */
const HATE_JA: string[] = [
  'がいじ', 'しょうがいじ', 'しょうがいしゃ', 'ちしょう', 'きちがい', 'きちげー',
  'めくら', 'つんぼ', 'おし', 'びっこ', 'かたわ',
  'ちょん', 'ちゅん', 'しな', 'しなじん', 'ちょうせんじん',
  'くろんぼ', 'こじき', 'えた', 'ひにん', 'ぶらく',
  'ほもきもい', 'おかま', 'おなべ',
];

/** 性的・卑猥 (日本語) */
const SEXUAL_JA: string[] = [
  'ちんこ', 'ちんぽ', 'ちんちん', 'まんこ', 'おまんこ', 'おっぱい',
  'おぱい', 'ちくび', 'きんたま', 'せっくす', 'せくろす',
  'ふぇら', 'ぱいずり', 'なかだし', 'れいぷ', 'ごうかん',
  'えっち', 'えろ', 'やりまん', 'やりちん', 'びっち',
  'うんこ', 'うんち', 'しっこ', 'おしっこ',
  'おなにー', 'しこしこ', 'ぼっき', 'せいし',
  'ぱんつ', 'ぱんちら', 'のーぱん',
  'あへがお', 'いかせて', 'いかせろ', 'いくいく',
];

/** 暴言・侮辱 (英語) */
const INSULTS_EN: string[] = [
  'fuck', 'fucking', 'fucked', 'fucker', 'fck', 'fuk', 'f*ck',
  'shit', 'shitty', 'bullshit', 'sh1t',
  'damn', 'damned', 'goddamn',
  'bastard', 'moron', 'idiot', 'dumb', 'stupid',
  'stfu', 'gtfo', 'kys',
  'kill yourself', 'go die',
];

/** 差別・スラー (英語) */
const HATE_EN: string[] = [
  'nigger', 'nigga', 'n1gger', 'n1gga',
  'faggot', 'fag', 'f4ggot',
  'retard', 'retarded', 'r3tard',
  'tranny', 'shemale',
  'chink', 'gook', 'spic', 'wetback', 'beaner',
  'kike', 'kyke',
];

/** 性的 (英語) */
const SEXUAL_EN: string[] = [
  'dick', 'cock', 'penis', 'pussy', 'vagina', 'cunt',
  'bitch', 'whore', 'slut', 'hoe',
  'tits', 'boobs', 'titties',
  'blowjob', 'handjob', 'cumshot', 'creampie',
  'anal', 'dildo', 'orgasm',
  'porn', 'hentai', 'xxx',
  'rape', 'molest',
];

/** なりすまし防止 */
const IMPERSONATION: string[] = [
  'admin', 'administrator', 'かんりしゃ', '管理者', '管理人',
  'うんえい', '運営', 'official', 'おふぃしゃる',
  'system', 'しすてむ', 'システム',
  'netflix', 'ねっとふりっくす',
  'moderator', 'もでれーたー',
];

// ===== NGパターン (正規表現) =====

/** スパムパターン */
const SPAM_PATTERNS: RegExp[] = [
  // 同一文字の過剰連続 (30文字以上)
  /(.)\1{29,}/,
  // 同一2文字パターンの過剰繰り返し (15回以上 = 30文字相当)
  /(.{2,})\1{14,}/,
  // URL・リンク
  /https?:\/\//i,
  /www\.[a-z0-9]/i,
  /\.[a-z]{2,4}\//i,
  // 連絡先誘導
  /line[\s@＠:：]?id/i,
  /lineの?id/i,
  /twitter[\s@＠:：]/i,
  /discord[\s\.]/i,
  /instagram[\s@＠:：]/i,
  /tiktok[\s@＠:：]/i,
  /telegram[\s@＠:：]/i,
  // メールアドレス
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  // 電話番号パターン
  /0[789]0[-\s]?\d{4}[-\s]?\d{4}/,
  /\d{3}[-\s]\d{4}[-\s]\d{4}/,
  // 金銭・詐欺・宣伝
  /[￥¥$]\d+/,
  /\d+円[もで]?[稼か]せ/,
  /儲[けか][るら]|もう[けか][るら]/,
  /副業|ふくぎょう/,
  /無料配布|むりょうはいふ/,
  /プレゼント企画|ぷれぜんときかく/,
  // 荒らしパターン: 全角記号のみの連打
  /^[！？!?＠＃＄％＾＆＊☆★♪♫♬♡♥◆◇○●□■△▲▽▼※→←↑↓\s]{5,}$/,
  // 空白のみ
  /^\s+$/,
];

/** コメント全体パターン: 完全一致でNGとするもの */
const EXACT_NG: string[] = [
  // 現状なし (草「www」や拍手「888」は実況文化として許可)
];

// ===== フィルタリングロジック =====

/** 全NGワードを統合 */
const ALL_NG_WORDS: string[] = [
  ...INSULTS_JA,
  ...HATE_JA,
  ...SEXUAL_JA,
  ...INSULTS_EN,
  ...HATE_EN,
  ...SEXUAL_EN,
  ...IMPERSONATION,
];

/** カタカナをひらがなに変換 */
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** 正規化: 小文字化 + カタカナ→ひらがな + 一部記号除去 */
function normalize(text: string): string {
  let s = text.toLowerCase();
  s = katakanaToHiragana(s);
  // ゼロ幅文字・不可視文字を除去
  s = s.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
  // 回避用の記号挿入を除去 (例: "し★ね" → "しね")
  s = s.replace(/[★☆♪♫♬♡♥・.。、,，\s\-_＿]/g, '');
  return s;
}

/** NGワードチェック */
function containsNGWord(normalizedText: string): boolean {
  return ALL_NG_WORDS.some((word) => {
    const normalizedWord = normalize(word);
    return normalizedText.includes(normalizedWord);
  });
}

/** スパムパターンチェック */
function matchesSpamPattern(text: string): boolean {
  return SPAM_PATTERNS.some((pattern) => pattern.test(text));
}

/** 完全一致NGチェック */
function isExactNG(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return EXACT_NG.includes(lower);
}

// ===== エクスポート =====

export interface NGFilterResult {
  blocked: boolean;
  reason?: string;
}

/**
 * コメントをNGフィルターにかける
 * @param text コメント本文
 * @returns フィルター結果
 */
export function filterComment(text: string): NGFilterResult {
  const trimmed = text.trim();

  // 空コメント
  if (trimmed.length === 0) {
    return { blocked: true, reason: 'empty' };
  }

  // 完全一致NG
  if (isExactNG(trimmed)) {
    return { blocked: true, reason: 'exact_ng' };
  }

  // スパムパターン (正規化前の原文でチェック)
  if (matchesSpamPattern(trimmed)) {
    return { blocked: true, reason: 'spam' };
  }

  // NGワード (正規化後テキストでチェック)
  const normalized = normalize(trimmed);
  if (containsNGWord(normalized)) {
    return { blocked: true, reason: 'ng_word' };
  }

  return { blocked: false };
}

/**
 * コメントがNGかどうかを簡易判定
 * @param text コメント本文
 * @returns true = NG (ブロック対象)
 */
export function isNGComment(text: string): boolean {
  return filterComment(text).blocked;
}

/**
 * ユーザー定義NGリストでコメントをチェック
 * @param text コメント本文
 * @param ngComments ユーザーが登録したNGコメントワード
 * @param senderId 送信者ID (P2PのpeerId等)
 * @param ngUserIds ユーザーが登録したNGユーザーID
 * @returns true = NG (ブロック対象)
 */
export function isUserNGComment(
  text: string,
  ngComments: string[],
  senderId?: string,
  ngUserIds?: string[],
): boolean {
  // NGコメントワード
  if (ngComments.length > 0) {
    const normalizedText = normalize(text);
    for (const word of ngComments) {
      if (normalizedText.includes(normalize(word))) {
        return true;
      }
    }
  }

  // NGユーザーID
  if (senderId && ngUserIds && ngUserIds.length > 0) {
    if (ngUserIds.includes(senderId)) {
      return true;
    }
  }

  return false;
}
