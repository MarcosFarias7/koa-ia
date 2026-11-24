// Gera os ícones do app (SVG + PNG) sem dependências.  Rodar: node tools/make-icons.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Formas no espaço 512x512 (rosto do Koa dentro da "zona segura" de ícones maskable)
const S = [
  { t: 'rect', c: '#d6eadb' },
  { t: 'circle', x: 132, y: 196, r: 92, c: '#8e9aab' },
  { t: 'circle', x: 380, y: 196, r: 92, c: '#8e9aab' },
  { t: 'circle', x: 136, y: 202, r: 54, c: '#ecd3da' },
  { t: 'circle', x: 376, y: 202, r: 54, c: '#ecd3da' },
  { t: 'ellipse', x: 256, y: 292, rx: 168, ry: 146, c: '#9ba7b7' },
  { t: 'ellipse', x: 150, y: 330, rx: 30, ry: 18, c: '#f08ca0', a: 0.45 },
  { t: 'ellipse', x: 362, y: 330, rx: 30, ry: 18, c: '#f08ca0', a: 0.45 },
  { t: 'ellipse', x: 192, y: 266, rx: 18, ry: 23, c: '#262a33' },
  { t: 'ellipse', x: 320, y: 266, rx: 18, ry: 23, c: '#262a33' },
  { t: 'circle', x: 199, y: 257, r: 7, c: '#ffffff' },
  { t: 'circle', x: 327, y: 257, r: 7, c: '#ffffff' },
  { t: 'ellipse', x: 256, y: 318, rx: 42, ry: 54, c: '#343945' },
  { t: 'ellipse', x: 240, y: 292, rx: 11, ry: 6, c: '#ffffff', a: 0.35 },
];

function svg() {
  const parts = S.map((s) => {
    const op = s.a ? ` fill-opacity="${s.a}"` : '';
    if (s.t === 'rect') return `<rect width="512" height="512" rx="112" fill="${s.c}"/>`;
    if (s.t === 'circle') return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.c}"${op}/>`;
    return `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" fill="${s.c}"${op}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${parts.join('')}</svg>\n`;
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const inside = (s, x, y) => {
  if (s.t === 'rect') return true;
  if (s.t === 'circle') return (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r * s.r;
  return ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 <= 1;
};

function raster(size) {
  const ss = 4;
  const k = 512 / size;
  const px = Buffer.alloc(size * size * 3);
  const shapes = S.map((s) => Object.assign({ rgb: hex(s.c) }, s));
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (pxi + (sx + 0.5) / ss) * k;
          const y = (py + (sy + 0.5) / ss) * k;
          let c = [0, 0, 0];
          for (const s of shapes) {
            if (!inside(s, x, y)) continue;
            const a = s.a || 1;
            c = c.map((v, i) => v * (1 - a) + s.rgb[i] * a);
          }
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const o = (py * size + pxi) * 3;
      const n = ss * ss;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n);
    }
  }
  return png(size, size, px);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync(path.join(OUT, 'icon.svg'), svg());
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(OUT, name), raster(size));
  console.log('ok', name);
}
