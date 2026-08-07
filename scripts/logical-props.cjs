/**
 * One-shot codemod: migrate physical Tailwind utilities to logical ones, so the app
 * mirrors correctly under <html dir="rtl">.
 *
 *   ml-N, mr-N        -> ms-N, me-N
 *   pl-N, pr-N        -> ps-N, pe-N
 *   left-N, right-N    -> start-N, end-N
 *   text-left, text-right -> text-start, text-end
 *   rounded-l-N, rounded-r-N -> rounded-s-N, rounded-e-N
 *   border-l-N, border-r-N   -> border-s-N, border-e-N
 *   space-x-N        -> left alone (already direction-aware in Tailwind 3)
 *
 * Only rewrites inside className strings, and only tokens at a word boundary, so it
 * cannot touch CSS values, comments, prop names or arbitrary-value internals.
 *
 * NOT rewritten — reported instead, because they need a human decision:
 *   · translate-x-*        sign flips under RTL; a centring `-translate-x-1/2` is fine,
 *                          a directional nudge is not
 *   · inset-*              shorthand covers both axes
 *   · left-1/2, right-1/2  usually optical centring, not a directional offset
 *   · anything already carrying an `rtl:`/`ltr:` variant
 *
 * Usage: node scripts/logical-props.cjs [--dry]
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

// [pattern, replacement]. `(?<![\w:-])` keeps us off `rtl:ml-2`, `--left-x`, `overflow-left`.
const MAP = [
  [/(?<![\w:-])ml-(?=[\w[])/g, 'ms-'],
  [/(?<![\w:-])mr-(?=[\w[])/g, 'me-'],
  [/(?<![\w:-])pl-(?=[\w[])/g, 'ps-'],
  [/(?<![\w:-])pr-(?=[\w[])/g, 'pe-'],
  [/(?<![\w:-])-ml-(?=[\w[])/g, '-ms-'],
  [/(?<![\w:-])-mr-(?=[\w[])/g, '-me-'],
  [/(?<![\w:-])text-left(?![\w-])/g, 'text-start'],
  [/(?<![\w:-])text-right(?![\w-])/g, 'text-end'],
  [/(?<![\w:-])rounded-l-(?=[\w[])/g, 'rounded-s-'],
  [/(?<![\w:-])rounded-r-(?=[\w[])/g, 'rounded-e-'],
  [/(?<![\w:-])border-l-(?=[\w[])/g, 'border-s-'],
  [/(?<![\w:-])border-r-(?=[\w[])/g, 'border-e-'],
  // left-/right- only when they carry a concrete value AND are not the 1/2 centring idiom
  [/(?<![\w:-])left-(?!1\/2)(?=[\w[])/g, 'start-'],
  [/(?<![\w:-])right-(?!1\/2)(?=[\w[])/g, 'end-'],
]

const NEEDS_AUDIT = /(?<![\w:-])(-?translate-x-|inset-(?!y-)|left-1\/2|right-1\/2)/g

let files = 0, edits = 0
const audit = []

for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const src = fs.readFileSync(file, 'utf8')

  // Rewrite only inside className="..." / className={`...`} / className={cond ? '...' : '...'}
  // by operating on the quoted string literals that a className expression is built from.
  let count = 0
  const out = src.replace(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g, (whole) => {
    let next = whole
    for (const [re, to] of MAP) {
      next = next.replace(re, (m) => { count++; return to })
    }
    return next
  })

  src.split('\n').forEach((line, i) => {
    if (!/className/.test(line)) return
    const hits = line.match(NEEDS_AUDIT)
    if (hits) audit.push(`${rel}:${i + 1}  ${[...new Set(hits)].join(', ')}`)
  })

  if (count) {
    files++; edits += count
    if (!DRY) fs.writeFileSync(file, out)
  }
}

console.log(`${edits} utility rewrites across ${files} file(s)`)
console.log(`\n${audit.length} site(s) need a manual RTL decision (translate-x / inset / optical centring):`)
for (const a of audit.slice(0, 40)) console.log('  ' + a)
if (audit.length > 40) console.log(`  …and ${audit.length - 40} more`)
