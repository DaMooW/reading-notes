// 生成 App 图标的临时脚本：纯 Node 实现 PNG 编码，无外部依赖
// 设计：朱砂红圆角底 + 白色「书页线条」图形（三条横线 + 左侧竖线，像一页笔记）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- PNG 编码 ----------
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
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘图 ----------
function makeCanvas(w, h) { return { w, h, buf: Buffer.alloc(w * h * 4) }; } // 透明底
function setPx(c, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.buf[i] = r; c.buf[i + 1] = g; c.buf[i + 2] = b; c.buf[i + 3] = a;
}
function insideRounded(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + rad, Math.min(x, x1 - rad));
  const cy = Math.max(y0 + rad, Math.min(y, y1 - rad));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}
function fillRounded(c, x0, y0, x1, y1, rad, [r, g, b, a]) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (insideRounded(x, y, x0, y0, x1, y1, rad)) setPx(c, x, y, r, g, b, a);
}
function fillRect(c, x0, y0, x1, y1, [r, g, b, a]) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) setPx(c, x, y, r, g, b, a);
}

const VERMILION = [176, 58, 46, 255];   // #B03A2E 朱砂红
const VERMILION_D = [143, 43, 33, 255];
const WHITE = [255, 252, 246, 255];     // 纸白

function drawIcon(size) {
  const c = makeCanvas(size, size);
  const m = Math.round(size * 0.045);   // 外边距（透明安全区）
  // 圆角底
  fillRounded(c, m, m, size - 1 - m, size - 1 - m, Math.round(size * 0.22), VERMILION);
  // 底部略深的书脊色块
  fillRounded(c, m, Math.round(size * 0.78), size - 1 - m, size - 1 - m, Math.round(size * 0.16), VERMILION_D);
  // 左侧「装订线」竖线
  fillRect(c, Math.round(size * 0.20), Math.round(size * 0.24), Math.round(size * 0.20) + Math.max(2, Math.round(size * 0.02)), Math.round(size * 0.66), WHITE);
  // 三条横线（像一页笔记上的文字行）
  const lx0 = Math.round(size * 0.30), lx1 = Math.round(size * 0.74);
  const lt = Math.max(2, Math.round(size * 0.028));
  const rows = [0.26, 0.40, 0.54];
  for (const r of rows) fillRect(c, lx0, Math.round(size * r), lx1, Math.round(size * r) + lt, WHITE);
  // 右上角一个点（句读）
  const dotR = Math.max(2, Math.round(size * 0.035));
  const cx = Math.round(size * 0.76), cy = Math.round(size * 0.66);
  for (let y = cy - dotR; y <= cy + dotR; y++)
    for (let x = cx - dotR; x <= cx + dotR; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= dotR * dotR) setPx(c, x, y, WHITE[0], WHITE[1], WHITE[2], WHITE[3]);
    }
  return encodePNG(size, size, c.buf);
}

const outDir = path.join(__dirname);
fs.writeFileSync(path.join(outDir, 'icon-512.png'), drawIcon(512));
fs.writeFileSync(path.join(outDir, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), drawIcon(180));
fs.writeFileSync(path.join(outDir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="23" y="23" width="466" height="466" rx="113" fill="#B03A2E"/><rect x="23" y="399" width="466" height="90" rx="45" fill="#8F2B21"/><rect x="102" y="123" width="12" height="215" fill="#FFFCF6"/><rect x="154" y="133" width="225" height="14" fill="#FFFCF6"/><rect x="154" y="205" width="225" height="14" fill="#FFFCF6"/><rect x="154" y="277" width="225" height="14" fill="#FFFCF6"/><circle cx="389" cy="338" r="18" fill="#FFFCF6"/></svg>`
);
console.log('icons done:', fs.readdirSync(outDir).filter(f => f !== 'make-icons.js').join(', '));
