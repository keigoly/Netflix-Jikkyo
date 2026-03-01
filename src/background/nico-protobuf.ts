// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

/**
 * ニコ生 NDGR (Protobuf) デコーダー
 *
 * ニコ生のコメントストリームは Length-Delimited Protobuf (ChunkedMessage) で送られる。
 * CSP制約(eval禁止)のため protobufjs の動的コード生成は使えない。
 * 最小限の手動 varint/protobuf パーサーで必要なフィールドのみデコードする。
 */

/** varint デコード: [value, bytesRead]
 * 64bit varint (最大10バイト) に対応。下位32ビットのみ返す。
 */
function readVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos];
    pos++;
    if (shift < 32) {
      result |= (byte & 0x7f) << shift;
    }
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 63) throw new Error('Varint too long');
  }
  return [result >>> 0, pos - offset];
}

/** Length-delimited フィールド読み取り */
function readLengthDelimited(buf: Uint8Array, offset: number): [Uint8Array, number] {
  const [len, lenBytes] = readVarint(buf, offset);
  const start = offset + lenBytes;
  return [buf.slice(start, start + len), lenBytes + len];
}

/** Protobuf wire type */
const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_32BIT = 5;

interface ProtoField {
  fieldNumber: number;
  wireType: number;
  data: Uint8Array | number;
}

/** 単一メッセージの全フィールドをパース */
function parseMessage(buf: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const [tag, tagBytes] = readVarint(buf, offset);
    offset += tagBytes;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;

    switch (wireType) {
      case WIRE_VARINT: {
        const [value, valBytes] = readVarint(buf, offset);
        offset += valBytes;
        fields.push({ fieldNumber, wireType, data: value });
        break;
      }
      case WIRE_64BIT: {
        fields.push({ fieldNumber, wireType, data: buf.slice(offset, offset + 8) });
        offset += 8;
        break;
      }
      case WIRE_LENGTH_DELIMITED: {
        const [data, totalBytes] = readLengthDelimited(buf, offset);
        offset += totalBytes;
        fields.push({ fieldNumber, wireType, data });
        break;
      }
      case WIRE_32BIT: {
        fields.push({ fieldNumber, wireType, data: buf.slice(offset, offset + 4) });
        offset += 4;
        break;
      }
      default:
        // 不明な wire type → パース終了
        return fields;
    }
  }
  return fields;
}

/** フィールド番号でフィルタ */
function getField(fields: ProtoField[], num: number): ProtoField | undefined {
  return fields.find(f => f.fieldNumber === num);
}

function getFields(fields: ProtoField[], num: number): ProtoField[] {
  return fields.filter(f => f.fieldNumber === num);
}

function getStringField(fields: ProtoField[], num: number): string | undefined {
  const f = getField(fields, num);
  if (!f || !(f.data instanceof Uint8Array)) return undefined;
  return new TextDecoder().decode(f.data);
}

function getVarintField(fields: ProtoField[], num: number): number | undefined {
  const f = getField(fields, num);
  if (!f || typeof f.data !== 'number') return undefined;
  return f.data;
}

function getMessageField(fields: ProtoField[], num: number): ProtoField[] | undefined {
  const f = getField(fields, num);
  if (!f || !(f.data instanceof Uint8Array)) return undefined;
  return parseMessage(f.data);
}

/** google.protobuf.Timestamp フィールドを読み取り、unix seconds を返す
 * Timestamp { int64 seconds = 1; int32 nanos = 2; }
 * varint (plain int64) の場合にもフォールバック対応 */
function getTimestampField(fields: ProtoField[], num: number): number | undefined {
  const f = getField(fields, num);
  if (!f) return undefined;
  // plain varint の場合 (サーバーが int64 で返す場合)
  if (typeof f.data === 'number') return f.data;
  // nested Timestamp message の場合
  if (f.data instanceof Uint8Array) {
    try {
      const tsFields = parseMessage(f.data);
      return getVarintField(tsFields, 1); // seconds
    } catch { return undefined; }
  }
  return undefined;
}

/** ニコ生コメント (デコード済み) */
export interface NicoLiveComment {
  /** コメントID (no フィールド) */
  no: number;
  /** コメント本文 */
  content: string;
  /** ユーザーID */
  userId?: string;
  /** コメント投稿時刻 (unix seconds) */
  postedAt?: number;
  /** vpos (1/100秒単位の再生位置) */
  vpos?: number;
  /** プレミアム会員か */
  premium?: boolean;
}

/** 視聴者数情報 */
export interface NicoLiveStatistics {
  viewers: number;
  comments: number;
}

/** NDGR ChunkedMessage のデコード結果 */
export interface NdgrChunkedResult {
  comments: NicoLiveComment[];
  statistics?: NicoLiveStatistics;
  /** messageServer URI (初回接続情報) */
  messageServerUri?: string;
}

/**
 * Length-Delimited Protobuf ストリームから複数メッセージを分割する
 * consumed: 正常にパースできたバイト数 (残りは次のチャンクと結合)
 */
export function splitLengthDelimited(buf: Uint8Array): { messages: Uint8Array[], consumed: number } {
  const messages: Uint8Array[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const savedOffset = offset;
    try {
      const [len, lenBytes] = readVarint(buf, offset);
      offset += lenBytes;
      if (offset + len > buf.length) {
        offset = savedOffset;
        break;
      }
      messages.push(buf.slice(offset, offset + len));
      offset += len;
    } catch {
      offset = savedOffset;
      break;
    }
  }
  return { messages, consumed: offset };
}

/**
 * ニコ生 ChunkedMessage をデコードする
 *
 * ChunkedMessage 構造 (実データから確認済み):
 *   field 1: meta (メタ情報)
 *     field 2: timestamps
 *       field 1: postedAt (varint, unix seconds)
 *       field 2: nanoseconds (varint)
 *   field 2: payload (NicoliveMessage) — コメント
 *     field 1: chat
 *       field 1: body (string)
 *       field 3: no (varint)
 *       field 6: userId (string)
 *       field 8: vpos (varint)
 *   field 4: state (統計情報, flat)
 *     field 1: viewers (varint)
 *     field 2: comments (varint)
 *   field 5: signal (varint, heartbeat等)
 */
export function decodeChunkedMessage(buf: Uint8Array): NdgrChunkedResult {
  const result: NdgrChunkedResult = { comments: [] };
  const fields = parseMessage(buf);

  // meta (field 1) — タイムスタンプ取得
  let postedAt: number | undefined;
  const metaFields = getMessageField(fields, 1);
  if (metaFields) {
    const tsFields = getMessageField(metaFields, 2);
    if (tsFields) {
      postedAt = getVarintField(tsFields, 1);
    }
  }

  // payload (field 2) — NicoliveMessage (コメント)
  for (const msgField of getFields(fields, 2)) {
    if (!(msgField.data instanceof Uint8Array)) continue;
    const msgFields = parseMessage(msgField.data);

    // chat (field 1)
    const chatFields = getMessageField(msgFields, 1);
    if (chatFields) {
      const content = getStringField(chatFields, 1);
      if (content) {
        const comment: NicoLiveComment = {
          no: getVarintField(chatFields, 3) ?? 0,
          content,
          userId: getStringField(chatFields, 6),
          postedAt,
          vpos: getVarintField(chatFields, 8),
          premium: getVarintField(chatFields, 7) === 1,
        };
        result.comments.push(comment);
      }
    }
  }

  // state (field 4) — 統計情報 (flat, ネストなし)
  const stateFields = getMessageField(fields, 4);
  if (stateFields) {
    const viewers = getVarintField(stateFields, 1);
    const comments = getVarintField(stateFields, 2);
    if (viewers !== undefined) {
      result.statistics = {
        viewers,
        comments: comments ?? 0,
      };
    }
  }

  return result;
}

/** フィールドの説明文を生成 */
function describeField(f: ProtoField): string {
  if (f.wireType === WIRE_VARINT) return `f${f.fieldNumber}=${f.data}`;
  if (f.data instanceof Uint8Array) {
    const type = f.wireType === WIRE_LENGTH_DELIMITED ? 'l' : f.wireType === WIRE_64BIT ? '64' : '32';
    if (f.wireType === WIRE_LENGTH_DELIMITED && f.data.length < 200) {
      try {
        const str = new TextDecoder().decode(f.data);
        if (/^[\x20-\x7e\u3000-\u9fff\uff00-\uffef\u0080-\u024f]+$/.test(str)) {
          return `f${f.fieldNumber}="${str.slice(0, 60)}"`;
        }
      } catch { /* not utf8 */ }
    }
    return `f${f.fieldNumber}(${type}:${f.data.length}b)`;
  }
  return `f${f.fieldNumber}(?)`;
}

/** 再帰的にメッセージ構造をダンプ */
function dumpMessage(buf: Uint8Array, prefix: string, depth: number, out: string[], maxDepth: number): void {
  const indent = '  '.repeat(depth);
  const fields = parseMessage(buf);
  const desc = fields.map(f => describeField(f));
  out.push(`${indent}${prefix}(${buf.length}b): ${desc.join(', ')}`);
  if (depth >= maxDepth) return;

  for (const f of fields) {
    if (f.wireType === WIRE_LENGTH_DELIMITED && f.data instanceof Uint8Array && f.data.length > 2) {
      try {
        const sub = parseMessage(f.data);
        if (sub.length > 0 && sub.some(sf => sf.fieldNumber > 0)) {
          dumpMessage(f.data, `f${f.fieldNumber}`, depth + 1, out, maxDepth);
        }
      } catch { /* not a valid submessage */ }
    }
  }
}

/**
 * デバッグ: protobuf メッセージのフィールド構造を再帰的にダンプ (最大3階層)
 */
export function debugProtobufFields(chunk: Uint8Array): string[] {
  const { messages } = splitLengthDelimited(chunk);
  const result: string[] = [];

  if (messages.length === 0) {
    // length-delimited でない場合、chunk 全体を1メッセージとして試行
    result.push(`[raw chunk ${chunk.length}b, no LD framing]`);
    try {
      dumpMessage(chunk, 'raw', 0, result, 3);
    } catch (e) {
      result.push(`  parse error: ${String(e).slice(0, 80)}`);
    }
    return result;
  }

  for (let i = 0; i < Math.min(messages.length, 5); i++) {
    dumpMessage(messages[i], `msg[${i}]`, 0, result, 3);
  }
  if (messages.length > 5) {
    result.push(`... and ${messages.length - 5} more messages`);
  }
  return result;
}

/** NDGR View エントリ (view endpoint の ChunkedEntry) */
export interface NdgrViewEntry {
  segment?: {
    uri: string;
    /** セグメント開始時刻 (unix seconds) */
    from?: number;
    /** セグメント終了時刻 (unix seconds) */
    until?: number;
    /** field 1 (segment/LIVE) か field 3 (previous/完了済み) か */
    source?: 'segment' | 'previous';
  };
  next?: { uri?: string; at?: number };
}

/**
 * NDGR View レスポンスの ChunkedEntry をパース
 *
 * ChunkedEntry 構造 (n-air-app/nicolive-comment-protobuf 準拠):
 *   field 1: segment  (MessageSegment) — 現在/次のライブセグメント
 *   field 2: backward (BackwardSegment) — 過去コメント遡り用 (ライブでは不要)
 *   field 3: previous (MessageSegment) — 最近完了したセグメント
 *   field 4: next     (ReadyForNext) { field 1: at (varint, unix seconds) }
 *
 * MessageSegment { field 1: from (Timestamp), field 2: until (Timestamp), field 3: uri (string) }
 *
 * segment (field 1) と previous (field 3) は同じ MessageSegment 型。
 * from < now < until なら現在ストリーミング中のセグメント (progressive delivery)。
 * now >= until なら完了済みセグメント (全データ即時取得可能)。
 */
export function parseViewEntries(data: Uint8Array): { entries: NdgrViewEntry[]; debugLines: string[] } {
  const { messages } = splitLengthDelimited(data);
  const entries: NdgrViewEntry[] = [];
  const debugLines: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const fields = parseMessage(messages[i]);
    const entry: NdgrViewEntry = {};

    // field 1: segment (MessageSegment) — ライブセグメント
    // field 3: previous (MessageSegment) — 最近完了セグメント (同じ構造)
    // oneof なので各メッセージにはどちらか一方のみ存在
    const segField1 = getMessageField(fields, 1);
    const segField3 = !segField1 ? getMessageField(fields, 3) : undefined;
    const segFields = segField1 || segField3;
    if (segFields) {
      const uri = getStringField(segFields, 3);
      if (uri) {
        entry.segment = {
          uri,
          from: getTimestampField(segFields, 1),
          until: getTimestampField(segFields, 2),
          source: segField1 ? 'segment' : 'previous',
        };
      }
    }

    // field 4: next (ReadyForNext) { field 1: at (Timestamp or varint) }
    const nextFields = getMessageField(fields, 4);
    if (nextFields) {
      const uri = getStringField(nextFields, 1);
      if (uri) {
        entry.next = { uri };
      } else {
        const at = getTimestampField(nextFields, 1);
        if (at !== undefined) {
          entry.next = { at };
        }
      }
    }

    // field 2: backward (BackwardSegment — 過去遡り用、ライブでは不要)

    if (entry.segment || entry.next) {
      entries.push(entry);
    } else {
      // field 2 (backward) or unknown → ダンプ
      if (i < 5) {
        const dump = debugProtobufFields(messages[i]);
        debugLines.push(`entry[${i}] dump: ${dump.join(' | ')}`);
      }
    }
  }

  return { entries, debugLines };
}

/**
 * 単一の View エントリ (pre-split されたメッセージ) をパース。
 * ストリーミング処理で 1 メッセージずつ処理する場合に使用。
 *
 * ChunkedEntry oneof:
 *   field 1: segment (MessageSegment) — ライブセグメント
 *   field 2: backward (BackwardSegment) — 過去遡り (無視)
 *   field 3: previous (MessageSegment) — 最近完了セグメント
 *   field 4: next (ReadyForNext)
 */
export function parseSingleViewEntry(msgBuf: Uint8Array): NdgrViewEntry | null {
  const fields = parseMessage(msgBuf);
  const entry: NdgrViewEntry = {};

  // field 1: segment (ライブ) / field 3: previous (完了済み) — 両方 MessageSegment 型
  // oneof なので各メッセージにはどちらか一方のみ。field 1 を優先チェック。
  const segField1 = getMessageField(fields, 1);
  const segField3 = !segField1 ? getMessageField(fields, 3) : undefined;
  const segFields = segField1 || segField3;
  if (segFields) {
    const uri = getStringField(segFields, 3);
    if (uri) {
      entry.segment = {
        uri,
        from: getTimestampField(segFields, 1),
        until: getTimestampField(segFields, 2),
        source: segField1 ? 'segment' : 'previous',
      };
    }
  }

  // field 4: next (ReadyForNext) { field 1: at (Timestamp or varint) }
  const nextFields = getMessageField(fields, 4);
  if (nextFields) {
    const uri = getStringField(nextFields, 1);
    if (uri) {
      entry.next = { uri };
    } else {
      const at = getTimestampField(nextFields, 1);
      if (at !== undefined) {
        entry.next = { at };
      }
    }
  }

  return (entry.segment || entry.next) ? entry : null;
}

/**
 * NDGR HTTP ストリームの1チャンク (複数メッセージ含む可能性) をデコード
 * leftover: 未消費バイト (次のチャンクと結合する必要あり)
 */
export function decodeNdgrStream(chunk: Uint8Array): NdgrChunkedResult & { leftover: Uint8Array } {
  const { messages, consumed } = splitLengthDelimited(chunk);
  const combined: NdgrChunkedResult & { leftover: Uint8Array } = {
    comments: [],
    leftover: new Uint8Array(chunk.buffer.slice(chunk.byteOffset + consumed, chunk.byteOffset + chunk.length)),
  };

  if (messages.length === 0 && chunk.length > 0) {
    // length-delimited フレーミングがない → chunk 全体を1メッセージとして試行
    try {
      const decoded = decodeChunkedMessage(chunk);
      combined.comments.push(...decoded.comments);
      if (decoded.statistics) combined.statistics = decoded.statistics;
      if (decoded.messageServerUri) combined.messageServerUri = decoded.messageServerUri;
      combined.leftover = new Uint8Array(0);
    } catch {
      // パースも失敗 → チャンク境界の不整合。全体をleftoverとして次チャンクと結合
      combined.leftover = new Uint8Array(chunk);
    }
    return combined;
  }

  for (const msg of messages) {
    const decoded = decodeChunkedMessage(msg);
    combined.comments.push(...decoded.comments);
    if (decoded.statistics) {
      combined.statistics = decoded.statistics;
    }
    if (decoded.messageServerUri) {
      combined.messageServerUri = decoded.messageServerUri;
    }
  }

  return combined;
}
