/**
 * Codemod: migrate physical Tailwind utilities to logical ones, so the app mirrors
 * correctly under <html dir="rtl">.
 *
 *   RUN IT AS:  npm run sweep:logical        (or `npm run sweep:logical -- --dry`)
 *
 * ⚠ READ THIS BEFORE RUNNING — THIS SCRIPT HAS SHIPPED A BUG TWICE ⚠
 *
 * The dangerous case is the CENTRING IDIOM: a physical inset at ~50% paired with
 * `-translate-x-1/2`. That pair is direction-INDEPENDENT and correct as written. Rewriting
 * the inset to `start-` while leaving the translate physical yields `right: 50%` under RTL
 * with a translate that still moves LEFT, so the element lands off-centre by its own width.
 *
 * The guard against that (`isCentringOffset`) has failed twice, in different ways:
 *
 *   1. It matched the literal token `left-1/2`. This is a Figma port, and the export writes
 *      optical centring as `left-[calc(50%+0.62px)]`. Three sites walked straight past.
 *   2. A later edit turned its regex LITERALS into ones containing the text `${V}`, which
 *      matches nothing. The guard returned false for everything and the codemod re-broke the
 *      same four sites that had just been fixed.
 *
 * Neither failure was visible to `tsc`, to `vite build`, or to reading the diff. Both were
 * caught only by assertion. So: this script now RUNS THOSE ASSERTIONS ITSELF after writing,
 * and exits non-zero if they fail. You do not have to know they exist — see the bottom of
 * this file and `scripts/source-hygiene.test.mjs`.
 *
 * It is idempotent: a second run over swept source reports 0 rewrites.
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
console.log(`${skipped.length} centring class string(s) left physical on purpose`)
console.log(`\n${audit.length} site(s) need a manual RTL decision (translate-x / inset / optical centring):`)
for (const a of audit.slice(0, 40)) console.log('  ' + a)
if (audit.length > 40) console.log(`  …and ${audit.length - 40} more`)

// ── mandatory verification ───────────────────────────────────────────────────────────
//
// The whole point. This codemod's failures are invisible to tsc and to the build, and the
// person running it next is not required to know that the assertions exist — so it runs them
// rather than mentioning them. If the guard has regressed again, this is where you find out.
if (!DRY) {
  const { spawnSync } = require('child_process')
  console.log('\n─── verifying (scripts/source-hygiene.test.mjs + centring census) ───')
  const r = spawnSync('npx', ['vitest', 'run', 'scripts/source-hygiene.test.mjs', 'scripts/centring.test.mjs'], {
    cwd: ROOT, stdio: 'inherit', shell: true,
  })
  if (r.status !== 0) {
    console.error('\n✗ HYGIENE ASSERTIONS FAILED — the sweep broke something.')
    console.error('  The likeliest cause is isCentringOffset() no longer matching. Check that')
    console.error('  its regexes are built with `new RegExp(V + …)` and not as literals')
    console.error('  containing the text ${V}, which matches nothing. `git diff` then revert.')
    process.exit(1)
  }
  console.log('\n✓ assertions pass')
}
