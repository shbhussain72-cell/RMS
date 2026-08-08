/**
 * build-fonts.mjs — one-off conversion of the authored Kanz al-Lulu TTF to webfont formats.
 *
 *   node scripts/build-fonts.mjs
 *
 * Emits `kanz-al-lulu.woff2` and `kanz-al-lulu.woff` beside the source TTF in public/fonts.
 *
 * Not wired into `npm run build`: the source face changes approximately never, the outputs are
 * committed, and making every production build depend on a compressor is a needless failure
 * mode. Re-run it by hand if the TTF is ever replaced.
 *
 * Both formats are emitted because `font-display: swap` only helps once the file arrives —
 * woff2 (Brotli) is roughly half the size of woff (zlib) and is what every current browser
 * takes; woff is the single-line insurance for anything that predates woff2 support.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ttf2woff from 'ttf2woff'
import { compress } from 'wawoff2'

const HERE = dirname(fileURLToPath(import.meta.url))
const FONTS = resolve(HERE, '../public/fonts')
const SRC = resolve(FONTS, 'KanzalLulu-Regular.ttf')

const ttf = readFileSync(SRC)
const kb = (b) => `${(b.length / 1024).toFixed(1)} KB`

const woff2 = Buffer.from(await compress(ttf))
writeFileSync(resolve(FONTS, 'kanz-al-lulu.woff2'), woff2)

const woff = Buffer.from(ttf2woff(new Uint8Array(ttf)).buffer)
writeFileSync(resolve(FONTS, 'kanz-al-lulu.woff'), woff)

console.log(`  source TTF : ${kb(ttf)}`)
console.log(`  woff2      : ${kb(woff2)}  (${((1 - woff2.length / ttf.length) * 100).toFixed(0)}% smaller)`)
console.log(`  woff       : ${kb(woff)}  (${((1 - woff.length / ttf.length) * 100).toFixed(0)}% smaller)`)
