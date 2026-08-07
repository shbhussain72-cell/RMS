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

// [pattern, replacement].
//
// ⚠️ THE LOOKBEHIND USED TO BE `${V}`, WHICH SILENTLY SKIPPED MOST OF THE CODEBASE.
// It was written to stay off `rtl:ml-2` and `--left-x`, and it did — but rejecting ANY
// preceding `:` also rejects every responsive and state variant: `sm:ml-0`, `md:left-auto`,
// `hover:pr-4`. Those are the majority of physical utilities in a Figma port, so the codemod
// reported success while leaving `sm:ml-0` (15 sites), `sm:left-auto` (5) and
// `sm:right-[var(--content-px)]` (8) untouched.
//
// Now: reject a preceding word char or hyphen (so `--left-x` and `overflow-left` stay safe),
// and reject the direction variants BY NAME, which is the thing that actually needed
// excluding. Everything else — including every breakpoint — is fair game.
// String.raw, not a plain quoted string: `'(?<![\w-])'` collapses \w to a literal `w`,
// which silently turned the lookbehind into `(?<![w-])` and the lookahead into `(?=[w[])`.
// The effect was that only arbitrary values (`ml-[12px]`) ever matched — every `ml-0`,
// `pr-4` and `sm:ml-0` in the codebase was skipped while the script reported success.
const V = '(?<![0-9A-Za-z_-])(?<!rtl:)(?<!ltr:)'
const MAP = [
  [new RegExp(`${V}ml-(?=[0-9A-Za-z_[])`, 'g'), 'ms-'],
  [new RegExp(`${V}mr-(?=[0-9A-Za-z_[])`, 'g'), 'me-'],
  [new RegExp(`${V}pl-(?=[0-9A-Za-z_[])`, 'g'), 'ps-'],
  [new RegExp(`${V}pr-(?=[0-9A-Za-z_[])`, 'g'), 'pe-'],
  [new RegExp(`${V}-ml-(?=[0-9A-Za-z_[])`, 'g'), '-ms-'],
  [new RegExp(`${V}-mr-(?=[0-9A-Za-z_[])`, 'g'), '-me-'],
  [new RegExp(`${V}text-left(?![0-9A-Za-z_-])`, 'g'), 'text-start'],
  [new RegExp(`${V}text-right(?![0-9A-Za-z_-])`, 'g'), 'text-end'],
  [new RegExp(`${V}rounded-l-(?=[0-9A-Za-z_[])`, 'g'), 'rounded-s-'],
  [new RegExp(`${V}rounded-r-(?=[0-9A-Za-z_[])`, 'g'), 'rounded-e-'],
  [new RegExp(`${V}border-l-(?=[0-9A-Za-z_[])`, 'g'), 'border-s-'],
  [new RegExp(`${V}border-r-(?=[0-9A-Za-z_[])`, 'g'), 'border-e-'],
  [new RegExp(`${V}left-(?!1\/2)(?=[0-9A-Za-z_[])`, 'g'), 'start-'],
  [new RegExp(`${V}right-(?!1\/2)(?=[0-9A-Za-z_[])`, 'g'), 'end-'],
]

/**
 * Does this class string centre something horizontally?
 *
 * `left-<anything> … -translate-x-1/2` (in either order) is the centring idiom: the offset
 * puts the element's edge at the midpoint and the translate pulls it back by half its own
 * width. It is direction-INDEPENDENT — the same visual result is wanted in both languages —
 * so the physical property is correct and must be left alone.
 */
function isCentringOffset(classString) {
  // Built with `new RegExp(V + ...)`, never as a regex LITERAL containing `${V}` — a literal
  // does not interpolate, so `/${V}…/` matches the four characters `$`, `{`, `V`, `}` and
  // therefore never fires. That is precisely what happened: the guard silently returned false
  // for everything and the codemod re-broke the same four centring sites a second time.
  const translate = new RegExp(V + '-translate-x-(1/2|50%|\[50%\])')
  const offset = new RegExp(V + '(left|right|start|end)-')
  return translate.test(classString) && offset.test(classString)
}

const NEEDS_AUDIT = new RegExp(`${V}(-?translate-x-|inset-(?!y-)|left-1\/2|right-1\/2)`, 'g')

let files = 0, edits = 0
const skipped = []  // centring class strings deliberately left physical
const audit = []

for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const src = fs.readFileSync(file, 'utf8')

  // Rewrite only inside className="..." / className={`...`} / className={cond ? '...' : '...'}
  // by operating on the quoted string literals that a className expression is built from.
  let count = 0
    // `\w*[cC]lassName` rather than `className`: this codebase also passes classes through
  // `floaterClassName`, `wrapperClassName` and friends, and the narrower pattern left every
  // one of them physical.
  const out = src.replace(/\w*[cC]lassName\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g, (whole) => {
    // Leave a centring class string completely alone. Checked on the WHOLE className, because
    // the offset and its companion translate are separate tokens and neither is recognisable
    // on its own — which is exactly how the previous token-level guard let four sites through.
    if (isCentringOffset(whole)) { skipped.push(whole.slice(0, 90)); return whole }
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
