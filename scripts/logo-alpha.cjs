/**
 * Produce a transparent-background version of the Miqaat logo.
 *
 * The supplied `miqaat logo.png` is PNG colour-type 2 — RGB with NO alpha channel at all,
 * so the dark plate behind the calligraphy is baked in as opaque pixels. It shows as a grey
 * box on every dark/photographic background (login hero, list hero, cards, footer).
 *
 * The artwork is cleanly bimodal — a flat plate around rgb(67,68,65) and white calligraphy
 * at rgb(255,255,255), with only antialiasing in between — so the mark can be recovered
 * exactly by a luminance key rather than by redrawing it:
 *
 *     alpha = (luma - plateLuma) / (255 - plateLuma)     clamped to 0..1
 *     rgb   = white
 *
 * Antialiased edge pixels land on intermediate alpha, which is what makes the result look
 * right over a gradient instead of showing a hard fringe. Output is straight (not
 * premultiplied) alpha, which is what browsers expect.
 *
 * Usage: node scripts/logo-alpha.cjs <in.png> <out.png> [r,g,b]
 *   The optional colour paints the mark for LIGHT backgrounds (default white).
 */
const fs = require('fs')
const zlib = require('zlib')

const [, , IN, OUT, INK] = process.argv
const ink = (INK || '255,255,255').split(',').map(Number)
if (!IN || !OUT) { console.error('usage: node scripts/logo-alpha.cjs <in.png> <out.png>'); process.exit(1) }

// ─── decode ───────────────────────────────────────────────────────────────────
const buf = fs.readFileSync(IN)
let off = 8, ihdr = null
const idat = []
while (off < buf.length) {
  const len = buf.readUInt32BE(off)
  const type = buf.slice(off + 4, off + 8).toString()
  const data = buf.slice(off + 8, off + 8 + len)
  if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9] }
  if (type === 'IDAT') idat.push(data)
  if (type === 'IEND') break
  off += 12 + len
}
if (!ihdr) throw new Error('no IHDR')
if (ihdr.depth !== 8 || (ihdr.color !== 2 && ihdr.color !== 6)) {
  throw new Error(`unsupported PNG: depth=${ihdr.depth} colorType=${ihdr.color} (need 8-bit RGB or RGBA)`)
}

const { w: W, h: H } = ihdr
const bpp = ihdr.color === 6 ? 4 : 3
const stride = W * bpp + 1
const raw = zlib.inflateSync(Buffer.concat(idat))

// PNG per-scanline filters must be reversed before the pixels mean anything.
const px = Buffer.alloc(W * H * bpp)
let prev = Buffer.alloc(W * bpp)
for (let y = 0; y < H; y++) {
  const ft = raw[y * stride]
  const line = raw.slice(y * stride + 1, y * stride + 1 + W * bpp)
  const cur = Buffer.alloc(W * bpp)
  for (let i = 0; i < W * bpp; i++) {
    const a = i >= bpp ? cur[i - bpp] : 0
    const b = prev[i]
    const c = i >= bpp ? prev[i - bpp] : 0
    let v = line[i]
    if (ft === 1) v += a
    else if (ft === 2) v += b
    else if (ft === 3) v += (a + b) >> 1
    else if (ft === 4) {
      const p = a + b - c
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
    }
    cur[i] = v & 255
  }
  cur.copy(px, y * W * bpp)
  prev = cur
}

// ─── key out the plate ────────────────────────────────────────────────────────
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b
// Plate level measured from the border, which is all background on this artwork.
let sum = 0, n = 0
for (let x = 0; x < W; x++) {
  for (const y of [0, H - 1]) {
    const i = (y * W + x) * bpp
    sum += luma(px[i], px[i + 1], px[i + 2]); n++
  }
}
const plate = sum / n
const span = 255 - plate
console.log(`plate luma ${plate.toFixed(1)} → keying against a span of ${span.toFixed(1)}`)

const out = Buffer.alloc(W * H * 4)
let opaque = 0
for (let p = 0; p < W * H; p++) {
  const i = p * bpp
  const L = luma(px[i], px[i + 1], px[i + 2])
  const a = Math.max(0, Math.min(1, (L - plate) / span))
  out[p * 4] = ink[0]; out[p * 4 + 1] = ink[1]; out[p * 4 + 2] = ink[2]
  out[p * 4 + 3] = Math.round(a * 255)
  if (a > 0.98) opaque++
}
console.log(`${((opaque / (W * H)) * 100).toFixed(1)}% of pixels are the mark itself; the rest is now transparent`)

// ─── encode ───────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c }
  return (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
})()
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td))
  return Buffer.concat([len, td, crc])
}
const ihdrOut = Buffer.alloc(13)
ihdrOut.writeUInt32BE(W, 0); ihdrOut.writeUInt32BE(H, 4)
ihdrOut[8] = 8; ihdrOut[9] = 6; ihdrOut[10] = 0; ihdrOut[11] = 0; ihdrOut[12] = 0

// Filter 0 (None) on every scanline — simple, and the flat alpha compresses well anyway.
const rawOut = Buffer.alloc(H * (W * 4 + 1))
for (let y = 0; y < H; y++) {
  rawOut[y * (W * 4 + 1)] = 0
  out.copy(rawOut, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
}
fs.writeFileSync(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdrOut),
  chunk('IDAT', zlib.deflateSync(rawOut, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]))
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, RGBA)`)
