// Dependency-free PNG icon generator.
// Draws a "glass lens" mark: a rounded gradient tile with a translucent
// circle and a specular highlight. Outputs icon16/48/128 + a toolbar glyph.
//
// Run: node tools/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "icons");
mkdirSync(OUT, { recursive: true });

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
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// simple linear interpolation helpers
const lerp = (a, b, t) => a + (b - a) * t;
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
// smooth coverage for anti-aliasing a signed distance (in px, negative = inside)
function cov(d) {
  return Math.min(1, Math.max(0, 0.5 - d));
}

function drawIcon(size) {
  const s = size;
  const buf = Buffer.alloc(s * s * 4);
  const cx = s / 2;
  const cy = s / 2;
  const tileR = s * 0.26; // corner radius
  const half = s * 0.5 - s * 0.06; // tile half-extent (margin)
  const lensR = s * 0.30;
  // brand gradient (indigo -> teal)
  const top = [99, 102, 241];
  const bot = [45, 212, 191];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;
      // rounded-rect signed distance
      const qx = Math.abs(px - cx) - (half - tileR);
      const qy = Math.abs(py - cy) - (half - tileR);
      const dRect =
        Math.min(Math.max(qx, qy), 0) +
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
        tileR;
      const tileA = cov(dRect);
      if (tileA <= 0) {
        buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0;
        continue;
      }
      const g = mix(top, bot, py / s);
      let r = g[0];
      let gg = g[1];
      let b = g[2];
      // translucent lens circle
      const dLens = Math.hypot(px - cx, py - cy) - lensR;
      const lensA = cov(dLens);
      if (lensA > 0) {
        // glassy lighten toward white at top of lens
        const shade = 0.18 + 0.32 * (1 - (py - (cy - lensR)) / (2 * lensR));
        r = lerp(r, 255, shade * lensA);
        gg = lerp(gg, 255, shade * lensA);
        b = lerp(b, 255, shade * lensA);
        // rim light
        const rim = 1 - Math.min(1, Math.abs(dLens) / Math.max(1, s * 0.05));
        if (dLens < 0 && dLens > -s * 0.05) {
          r = lerp(r, 255, 0.5 * rim);
          gg = lerp(gg, 255, 0.5 * rim);
          b = lerp(b, 255, 0.5 * rim);
        }
      }
      // specular highlight dot (upper-left of lens)
      const hx = cx - lensR * 0.42;
      const hy = cy - lensR * 0.42;
      const dHi = Math.hypot(px - hx, py - hy) - lensR * 0.28;
      const hiA = cov(dHi);
      if (hiA > 0) {
        r = lerp(r, 255, 0.85 * hiA);
        gg = lerp(gg, 255, 0.85 * hiA);
        b = lerp(b, 255, 0.85 * hiA);
      }
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(gg);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(255 * tileA);
    }
  }
  return encodePNG(s, s, buf);
}

for (const size of [16, 32, 48, 128]) {
  const png = drawIcon(size);
  writeFileSync(join(OUT, `icon${size}.png`), png);
  console.log(`wrote icons/icon${size}.png (${png.length} bytes)`);
}
