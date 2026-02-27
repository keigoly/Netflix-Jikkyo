/**
 * アイコン生成スクリプト
 * Node.js の canvas は不要。最小限の1色 PNG を生成する。
 *
 * 使い方: node scripts/create-icons.js
 */

import { writeFileSync } from 'fs';

// 最小限のPNG生成 (単色)
function createPNG(size, r, g, b) {
  // PNGファイル構造:
  // Signature + IHDR + IDAT (非圧縮) + IEND

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT - zlib 非圧縮
  // 各行: filter byte (0) + RGB * width
  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize;
    rawData[offset] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }

  // zlib: 非圧縮ブロック
  const zlibData = zlibStore(rawData);
  const idat = makeChunk('IDAT', zlibData);

  // IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function zlibStore(data) {
  // zlib header: CMF=0x78 FLG=0x01
  const header = Buffer.from([0x78, 0x01]);
  // DEFLATE stored block
  const blocks = [];
  const maxBlock = 65535;
  for (let i = 0; i < data.length; i += maxBlock) {
    const chunk = data.subarray(i, Math.min(i + maxBlock, data.length));
    const isLast = (i + maxBlock >= data.length) ? 1 : 0;
    const blockHeader = Buffer.alloc(5);
    blockHeader[0] = isLast;
    blockHeader.writeUInt16LE(chunk.length, 1);
    blockHeader.writeUInt16LE(chunk.length ^ 0xFFFF, 3);
    blocks.push(blockHeader, chunk);
  }
  // Adler32
  const adler = adler32(data);
  const adlerBuf = Buffer.alloc(4);
  adlerBuf.writeUInt32BE(adler >>> 0, 0);
  return Buffer.concat([header, ...blocks, adlerBuf]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Netflix red: #E50914 = 229, 9, 20
for (const size of [16, 48, 128]) {
  const png = createPNG(size, 229, 9, 20);
  writeFileSync(`public/icons/icon${size}.png`, png);
  console.log(`Created icon${size}.png`);
}
