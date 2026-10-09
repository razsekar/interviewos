// Dependency-free PNG/SVG icon generation (zlib only). The mark is three descending bars: the three answer styles.
import zlib from 'node:zlib';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sdRoundRect = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const cover = (d) => Math.min(1, Math.max(0, 0.5 - d));

const BRAND = [29, 78, 216];
const BARS = [
  { x: 0.22, y: 0.34, w: 0.56 },
  { x: 0.22, y: 0.5, w: 0.42 },
  { x: 0.22, y: 0.66, w: 0.26 },
];

/** mark: draw the logo within [ox,oy,size]; bg: 'rounded' | 'square' | 'none'. */
function drawMark(buf, W, H, { ox, oy, size, bg, scaleMark = 1 }) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - ox) / size;
      const v = (y + 0.5 - oy) / size;
      let a = 0;
      if (bg === 'rounded') a = cover(sdRoundRect(u * size, v * size, size / 2, size / 2, size / 2, size / 2, size * 0.22));
      else if (bg === 'square') a = u >= 0 && u < 1 && v >= 0 && v < 1 ? 1 : 0;
      let r = BRAND[0];
      let g = BRAND[1];
      let b = BRAND[2];
      const i = (y * W + x) * 4;
      let outA = a;
      let outR = r;
      let outG = g;
      let outB = b;
      if (a > 0 || bg === 'none') {
        let barA = 0;
        for (const bar of BARS) {
          const cx = 0.5 + (bar.x + bar.w / 2 - 0.5) * scaleMark;
          const cy = 0.5 + (bar.y - 0.5) * scaleMark;
          const hw = (bar.w / 2) * scaleMark * size;
          const hh = 0.05 * scaleMark * size;
          barA = Math.max(barA, cover(sdRoundRect(u * size, v * size, cx * size, cy * size, hw, hh, hh)));
        }
        outR = r + (255 - r) * barA;
        outG = g + (255 - g) * barA;
        outB = b + (255 - b) * barA;
        if (bg === 'none') outA = barA;
      }
      if (outA > 0) {
        buf[i] = Math.round(outR);
        buf[i + 1] = Math.round(outG);
        buf[i + 2] = Math.round(outB);
        buf[i + 3] = Math.round(outA * 255);
      }
    }
  }
}

export function iconPng(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  drawMark(buf, size, size, { ox: 0, oy: 0, size, bg: maskable ? 'square' : 'rounded', scaleMark: maskable ? 0.72 : 1 });
  return encodePng(size, size, buf);
}

export function ogPng() {
  const W = 1200;
  const H = 630;
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;
      const i = (y * W + x) * 4;
      buf[i] = Math.round(29 + (15 - 29) * t);
      buf[i + 1] = Math.round(78 + (23 - 78) * t);
      buf[i + 2] = Math.round(216 + (42 - 216) * t);
      buf[i + 3] = 255;
    }
  }
  // white tile with the mark, centred
  const size = 360;
  const tile = Buffer.alloc(size * size * 4);
  drawMark(tile, size, size, { ox: 0, oy: 0, size, bg: 'rounded' });
  const ox = (W - size) / 2;
  const oy = (H - size) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const a = tile[s + 3] / 255;
      if (!a) continue;
      const d = ((oy + y) * W + (ox + x)) * 4;
      for (let c = 0; c < 3; c++) buf[d + c] = Math.round(buf[d + c] * (1 - a) + tile[s + c] * a);
    }
  }
  return encodePng(W, H, buf);
}

export const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="InterviewOS"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><rect x="14" y="19" width="36" height="6.4" rx="3.2" fill="#fff"/><rect x="14" y="28.8" width="27" height="6.4" rx="3.2" fill="#fff"/><rect x="14" y="38.6" width="17" height="6.4" rx="3.2" fill="#fff"/></svg>`;

export const logoInline = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><rect x="14" y="19" width="36" height="6.4" rx="3.2" fill="#fff"/><rect x="14" y="28.8" width="27" height="6.4" rx="3.2" fill="#fff"/><rect x="14" y="38.6" width="17" height="6.4" rx="3.2" fill="#fff"/></svg>`;
