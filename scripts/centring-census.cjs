/**
 * centring-census.cjs — authoritative census of physical horizontal positioning.
 *
 * WHY THIS EXISTS
 *
 * The centring sites were first counted with `grep -n 'left-1/2'` over raw source lines.
 * That produced 17, then 18, depending on when it was run — because a raw-line grep counts
 * things that are not sites:
 *
 *   - the explanatory COMMENT in Success.tsx, which names `left-1/2` in prose;
 *   - a `className` holding TWO physical insets, which greps as one line but is one site;
 *   - hover nudges like `group-hover:-translate-x-[2px]`, which are not centring at all.
 *
 * The exception list is derived from this number, so it is parsed out of className attribute
 * VALUES rather than counted off lines. Comments, strings and filenames cannot reach it.
 *
 * CLASSIFICATION — a className carrying a physical horizontal inset is one of:
 *
 *   CENTRING  physical inset at ~50% + `-translate-x-1/2`. The centring idiom. Direction-
 *             INDEPENDENT and correct as written: `left:50%` then pull back half your own
 *             width lands you centred whichever way the text runs. These are the sites the
 *             elimination pass targets.
 *   HAIRLINE  physical inset at 50%, NO translate. A rule that spans half the box — the inset
 *             is a WIDTH, not a centring offset. Mirrors wrongly under RTL and must be fixed,
 *             but it is a different repair, so it is counted separately.
 *   MIXED     a logical inset (`start-`/`end-`) together with a physical one, or with a
 *             physical translate. This is the exact bug class the codemod reintroduced:
 *             `start-` flips under RTL while `-translate-x-` does not, so the two disagree.
 *   OTHER     a physical inset at some other value. Plain positioning; mirrors wrongly, but
 *             is neither centring nor a hairline.
 */
const fs = require('fs')
const path = require('path')

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|css)$/.test(p)) files.push(p)
  }
})('src')

const CLASSNAME = /\w*[cC]lassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g

// Utility boundary: not preceded by an identifier char, and not an rtl:/ltr: variant (those
// are already direction-aware and are the intended escape hatch).
const V = '(?<![0-9A-Za-z_-])(?<!rtl:)(?<!ltr:)'
const physIn = new RegExp(V + '(left|right)-')
const logiIn = new RegExp(V + '(start|end)-')
// 50%-ish inset: 1/2, [50%], or any [calc(50%...)] the Figma export emits for optical centring.
const half = new RegExp(V + '(left|right)-(1/2|\\[50%\\]|\\[calc\\(50%)')
// Centring translate only — NOT `translate-x-[2px]` hover nudges.
const transX = new RegExp(V + '-?translate-x-(1/2|\\[50%\\])')

/**
 * Positional SIGNATURE of a className — the inset and translate tokens only, sorted.
 *
 * This is what the exception list is keyed on. Keying on line numbers would churn on every
 * unrelated edit above the site; keying on the whole className would churn on every colour or
 * spacing tweak. Keying on the positioning tokens means a cosmetic edit is silent and a
 * POSITIONAL edit forces the site back through review — which is the behaviour worth having.
 */
function signature(cls) {
  const tok = cls.match(new RegExp(V + '(?:left|right|start|end|-?translate-x)-[^\\s]*', 'g')) || []
  return [...new Set(tok)].sort().join(' ')
}

function census() {
  const rows = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    for (const m of src.matchAll(CLASSNAME)) {
      const cls = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
      const hasPhys = physIn.test(cls)
      const hasLogi = logiIn.test(cls)
      const hasT = transX.test(cls)
      if (!hasPhys && !(hasLogi && hasT)) continue
      const line = src.slice(0, m.index).split('\n').length
      const kind =
        hasLogi && hasPhys ? 'MIXED'
        : hasLogi && hasT ? 'MIXED'
        : half.test(cls) && hasT ? 'CENTRING'
        : half.test(cls) ? 'HAIRLINE'
        : 'OTHER'
      // Count physical insets in this className: two on one line is two repairs, one site.
      const insets = (cls.match(new RegExp(V + '(left|right)-', 'g')) || []).length
      const file = f.split(path.sep).join('/')
      rows.push({ kind, f: file, line, cls, insets, sig: `${file}  ${signature(cls)}` })
    }
  }
  return rows
}

module.exports = { census, signature }

// Only print when run directly — `require()`d by scripts/centring.test.mjs, which asserts
// against the SAME logic rather than a reimplementation of it.
if (require.main !== module) return

const rows = census()

// Regenerate the exception list. Deliberately NOT automatic: the list is a record of
// decisions, so refreshing it has to be a thing someone chose to do.
if (process.argv.includes('--write-exceptions')) {
  const file = path.join(__dirname, 'centring-exceptions.json')
  const prev = JSON.parse(fs.readFileSync(file, 'utf8'))
  prev.exceptions = rows.filter((r) => r.kind === 'CENTRING').map((r) => r.sig).sort()
  fs.writeFileSync(file, `${JSON.stringify(prev, null, 2)}\n`)
  console.log(`wrote ${prev.exceptions.length} exception(s) to scripts/centring-exceptions.json`)
  return
}

const order = ['CENTRING', 'HAIRLINE', 'MIXED', 'OTHER']
for (const k of order) {
  const g = rows.filter((r) => r.kind === k)
  const insets = g.reduce((a, r) => a + r.insets, 0)
  console.log(`\n== ${k} — ${g.length} site(s), ${insets} physical inset utilit(ies)`)
  for (const r of g) console.log(`   ${r.f}:${r.line}\n      ${r.cls.slice(0, 100)}`)
}
console.log(`\nTOTAL sites: ${rows.length}   TOTAL physical inset utilities: ${rows.reduce((a, r) => a + r.insets, 0)}`)
