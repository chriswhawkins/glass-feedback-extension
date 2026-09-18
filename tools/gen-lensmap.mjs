// Generates a lens displacement map PNG for the glass refraction filter.
// R channel = horizontal bend, G = vertical bend (0.5 gray = neutral).
// The bend is ~zero in the center (clear glass) and ramps up toward the rim
// (a squircle ring), so feDisplacementMap refracts only at the edges — the
// signature "liquid glass" lens look. (Aave's portable trick: a generated map.)
//
// Run: node tools/gen-lensmap.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "assets");
mkdirSync(OUT, { recursive: true });

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function lensMap(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = ((x + 0.5) / size) * 2 - 1; // -1..1
      const v = ((y + 0.5) / size) * 2 - 1;
      // squircle radius -> rounded-rect ring instead of a circle
      const r = Math.pow(Math.abs(u) ** 4 + Math.abs(v) ** 4, 0.25);
      const edge = smoothstep(0.32, 1.0, r); // clear center, bend toward rim
      const len = Math.hypot(u, v) || 1;
      const dx = (u / len) * edge;
      const dy = (v / len) * edge;
      buf[i] = Math.max(0, Math.min(255, Math.round(128 + dx * 127)));
      buf[i + 1] = Math.max(0, Math.min(255, Math.round(128 + dy * 127)));
      buf[i + 2] = 128;
      buf[i + 3] = 255;
    }
  }
  return encodePNG(size, size, buf);
}

const png = lensMap(160);
writeFileSync(join(OUT, "lens-map.png"), png);
console.log(`wrote assets/lens-map.png (${png.length} bytes)`);
