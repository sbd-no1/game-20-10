'use strict';
// Minimal pure-JS PNG decode/encode using Node's built-in zlib.
// Supports 8-bit PNG, color types 2 (RGB), 6 (RGBA), 0 (grayscale), 4 (gray+alpha), 3 (palette).
const zlib = require('zlib');

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readChunks(buf) {
  if (!buf.slice(0, 8).equals(PNG_SIG)) throw new Error('Không phải file PNG');
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Decode a PNG buffer into { width, height, data } where data is RGBA bytes.
function decodePNG(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('Thiếu IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data.readUInt8(8);
  const colorType = ihdr.data.readUInt8(9);
  const interlace = ihdr.data.readUInt8(12);
  if (bitDepth !== 8) throw new Error('Chỉ hỗ trợ PNG 8-bit, nhận bitDepth=' + bitDepth);
  if (interlace !== 0) throw new Error('Không hỗ trợ PNG interlaced');

  const channelsMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsMap[colorType];
  if (!channels) throw new Error('colorType không hỗ trợ: ' + colorType);

  let palette = null;
  let trns = null;
  if (colorType === 3) {
    const plte = chunks.find((c) => c.type === 'PLTE');
    if (!plte) throw new Error('Thiếu PLTE cho ảnh palette');
    palette = plte.data;
    const t = chunks.find((c) => c.type === 'tRNS');
    if (t) trns = t.data;
  }

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);

  const bpp = channels; // bytes per pixel in filtered stream (8-bit)
  const stride = width * bpp;
  const recon = Buffer.alloc(height * stride);

  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[pos++];
      const a = x >= bpp ? recon[y * stride + x - bpp] : 0;
      const b = y > 0 ? recon[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? recon[(y - 1) * stride + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: val = rawByte + paeth(a, b, c); break;
        default: throw new Error('Filter không hợp lệ: ' + filter);
      }
      recon[y * stride + x] = val & 0xff;
    }
  }

  // Expand to RGBA.
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp;
    const d = i * 4;
    if (colorType === 6) {
      out[d] = recon[s]; out[d + 1] = recon[s + 1]; out[d + 2] = recon[s + 2]; out[d + 3] = recon[s + 3];
    } else if (colorType === 2) {
      out[d] = recon[s]; out[d + 1] = recon[s + 1]; out[d + 2] = recon[s + 2]; out[d + 3] = 255;
    } else if (colorType === 0) {
      out[d] = out[d + 1] = out[d + 2] = recon[s]; out[d + 3] = 255;
    } else if (colorType === 4) {
      out[d] = out[d + 1] = out[d + 2] = recon[s]; out[d + 3] = recon[s + 1];
    } else if (colorType === 3) {
      const idx = recon[s];
      out[d] = palette[idx * 3]; out[d + 1] = palette[idx * 3 + 1]; out[d + 2] = palette[idx * 3 + 2];
      out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }

  return { width, height, data: out };
}

// Box-sampling (area average) resize of an RGBA image. Each destination pixel
// averages all source pixels in its covered box. Colors are averaged
// premultiplied by alpha so transparent edges don't darken the result.
function resizeRGBA(img, newW, newH) {
  const { width: sw, height: sh, data: src } = img;
  const out = Buffer.alloc(newW * newH * 4);

  for (let y = 0; y < newH; y++) {
    const sy0 = Math.floor((y * sh) / newH);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * sh) / newH));
    for (let x = 0; x < newW; x++) {
      const sx0 = Math.floor((x * sw) / newW);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * sw) / newW));

      let ar = 0, ag = 0, ab = 0, aa = 0, n = 0;
      for (let yy = sy0; yy < sy1 && yy < sh; yy++) {
        for (let xx = sx0; xx < sx1 && xx < sw; xx++) {
          const s = (yy * sw + xx) * 4;
          const a = src[s + 3];
          // Premultiply color by alpha for correct edge blending.
          ar += src[s] * a;
          ag += src[s + 1] * a;
          ab += src[s + 2] * a;
          aa += a;
          n++;
        }
      }

      const d = (y * newW + x) * 4;
      if (aa > 0) {
        out[d] = Math.round(ar / aa);
        out[d + 1] = Math.round(ag / aa);
        out[d + 2] = Math.round(ab / aa);
        out[d + 3] = Math.round(aa / n);
      } else {
        out[d] = out[d + 1] = out[d + 2] = out[d + 3] = 0;
      }
    }
  }
  return { width: newW, height: newH, data: out };
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = crc32(body);
  return Buffer.concat([u32(data.length), body, u32(crc)]);
}

// CRC-32 (PNG polynomial) with a lazily-built lookup table.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Encode an RGBA image into a PNG buffer (color type 6, filter 0).
function encodePNG(img) {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { decodePNG, encodePNG, resizeRGBA };
