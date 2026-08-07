/**
 * mirror-census.cjs — inventory of everything that must MIRROR under `dir="rtl"`.
 *
 * Scoped to every UI root, not just `src/screens/`. The Group 4 sweep was scoped to screens,
 * which meant `src/components/figma/` — 26 files including AppBar, Breadcrumb, StickyFooter
 * and NotificationPanel, i.e. most of the app's chrome — was never examined. Chrome is
 * exactly where directional affordances live, so that is the tree that matters most here.
 *
 * WHAT MIRRORS AND WHAT DOES NOT
 *
 * A glyph or icon mirrors when its meaning is "onward in the reading direction": a
 * breadcrumb separator, a back chevron, a disclosure arrow, a send/paper-plane. Those must
 * flip under RTL or they point backwards.
 *
 * A glyph does NOT mirror when it denotes something with a fixed physical identity: a clock,
 * a checkmark, a media play button (transport controls are not text), a logo. Flipping those
 * is a bug in the other direction.
 *
 * This script only INVENTORIES. Each hit still needs the judgement above applied to it.
 *
 * LIMITATION, accepted: comment stripping is per-line, so a `{/* … *␀/}` block spanning
 * several lines still leaks its inner lines into the glyph bucket. Tightening that needs a
 * real parser, which is not worth it for a worklist — read the bucket, ignore the prose.
 *
 * Two things worth knowing that this found:
 *   · src/components/figma/DemoProgressionControl.tsx — a literal `▶` rendered next to a
 *     label. A media-transport triangle does not mirror, but it also is not a play button
 *     here; it needs a decision.
 *   · src/screens/ZoneSelection.tsx — `tx('View all →')` bakes a directional arrow INTO a
 *     dictionary string. It cannot be mirrored with CSS because it is text, and the LSD row
 *     for it will carry the arrow too. This is a copy fix, not a layout fix.
 */
const fs = require('fs')
const path = require('path')

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|css)$/.test(p) && !/\.test\./.test(p)) files.push(p)
  }
})('src')

const rel = (f) => f.split(path.sep).join('/')

// Directional GLYPHS. Matched as real code points — a byte-wise grep character class in a
// non-UTF-8 locale matches the continuation bytes of unrelated characters (it reported every
// em-dash in the codebase as a chevron).
const GLYPHS = ['›', '‹', '»', '«', '→', '←', '▶', '◀', '➤', '↳']
const GLYPH_NAME = {
  '›': 'SINGLE RIGHT-POINTING ANGLE QUOTATION MARK', '‹': 'SINGLE LEFT-POINTING ANGLE',
  '»': 'RIGHT DOUBLE ANGLE', '«': 'LEFT DOUBLE ANGLE',
  '→': 'RIGHTWARDS ARROW', '←': 'LEFTWARDS ARROW',
  '▶': 'BLACK RIGHT-POINTING TRIANGLE', '◀': 'BLACK LEFT-POINTING TRIANGLE',
  '➤': 'BLACK RIGHTWARDS ARROWHEAD', '↳': 'DOWNWARDS ARROW WITH TIP RIGHTWARDS',
}

// SVG path commands that draw a horizontal chevron/arrow. Heuristic by design: it is a
// worklist, not an assertion.
const CHEVRON_PATH = /\bd="M\s*[\d.]+[\s,]+[\d.]+\s*[lL]\s*-?[\d.]+/

const buckets = { glyph: [], rtlAware: [], chevronSvg: [], rotate: [] }

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  src.split('\n').forEach((line, i) => {
    const at = `${rel(f)}:${i + 1}`
    const trimmed = line.trim()
    const isComment = /^(\*|\/\/|\/\*)/.test(trimmed)
    // Strip TRAILING comments and JSX `{/* … */}` before looking for glyphs. Without this the
    // bucket is almost entirely prose: this codebase uses `→` constantly in explanatory
    // comments ("registered → Select zone"), and those reported as directional UI glyphs.
    const code = line.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
    for (const g of GLYPHS) {
      if (code.includes(g) && !isComment) {
        buckets.glyph.push(`${at}  ${GLYPH_NAME[g]}  ${trimmed.slice(0, 78)}`)
        break
      }
    }
    if (/\brtl:(rotate|scale-x|-scale-x)/.test(line)) buckets.rtlAware.push(`${at}  ${trimmed.slice(0, 78)}`)
    if (/(?<![0-9A-Za-z_-])rotate-(180|\[180)/.test(line) && !isComment) buckets.rotate.push(`${at}  ${trimmed.slice(0, 78)}`)
    if (CHEVRON_PATH.test(line)) buckets.chevronSvg.push(`${at}  ${trimmed.slice(0, 78)}`)
  })
}

const root = (s) => {
  const p = s.split(':')[0]
  if (p.startsWith('src/screens/')) return 'src/screens/'
  if (p.startsWith('src/components/figma/')) return 'src/components/figma/'
  if (p.startsWith('src/components/')) return 'src/components/*'
  if (p.startsWith('src/chat/')) return 'src/chat/'
  return `${p.split('/').slice(0, 2).join('/')}/`
}

for (const [name, rows] of Object.entries(buckets)) {
  console.log(`\n=== ${name} (${rows.length}) ===`)
  const by = {}
  for (const r of rows) (by[root(r)] = by[root(r)] || []).push(r)
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  -- ${k} (${v.length})`)
    for (const r of v.slice(0, 14)) console.log(`     ${r}`)
    if (v.length > 14) console.log(`     …${v.length - 14} more`)
  }
}

console.log('\n--- SCOPE CHECK: how much of each bucket lives OUTSIDE src/screens/ ---')
for (const [name, rows] of Object.entries(buckets)) {
  const out = rows.filter((r) => root(r) !== 'src/screens/').length
  console.log(`  ${name.padEnd(12)} ${String(out).padStart(3)} / ${rows.length} outside src/screens/`)
}
