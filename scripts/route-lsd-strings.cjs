/**
 * One-shot codemod: route hardcoded user-facing strings through the i18n layer.
 *
 * Parses each .tsx with the TypeScript compiler API rather than matching regexes, because
 * the transforms below are only safe when the AST shape is known exactly. A regex cannot
 * tell `<p>Register now</p>` (safe to convert) from `<p>Hello {name}</p>` (must not be).
 *
 * Two transforms, both deliberately narrow:
 *
 *   1. <p className="x">Register now</p>  →  <p className="x" {...tx('Register now')} />
 *      ONLY when the element's children are exactly one non-empty JsxText and nothing
 *      else. Any expression child, nested element, or sibling text and it is skipped.
 *      Elements that already carry a spread ({...tx(…)}) or a `dir` are left alone.
 *
 *   2. placeholder="Search"  →  placeholder={t('Search')}
 *      ONLY for the attribute names listed in ATTRS, and only string literals.
 *
 * Everything it declines to touch is printed at the end, so the remainder is visible
 * rather than silently dropped. Run `node scripts/check-lsd-coverage.mjs --all` after.
 *
 * Usage: node scripts/route-lsd-strings.cjs [--dry] [file ...]
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'))

// Attributes whose string value is rendered to the user.
const ATTRS = new Set([
  'placeholder', 'aria-label', 'title', 'label', 'alt',
])
// `alt` is only translated when non-empty; empty alt is a meaningful a11y signal.

// Same conservative "is this prose?" test the gate uses — kept in sync deliberately.
const NOISE = [
  /^[MmLlHhVvCcSsQqTtAaZz][\s\d.,-]/, /^[\d\s.,%#:/-]+$/,
  /serif|sans-serif|system-ui|Segoe UI|Amiri|Marcellus|Mulish|Kanz/i,
  /^(https?:)?\//, /^#[0-9a-fA-F]{3,8}$/,
  /rgba?\(|linear-gradient|url\(|data:|calc\(|var\(/i,
  /^[a-z-]+:\s/,
  /(^|\s)(flex|grid|absolute|relative|rounded|border|bg-|text-\[|size-\[|mt-\[|px-\[|py-\[|w-\[|h-\[)/,
  /^\p{Lu}?[a-z]+([A-Z][a-z]+)+$/u, /^\d{1,2}:\d{2}/, /^[A-Z]{1,3}$/,
]
const FRAGMENT = /\s(a|an|the|in|on|to|of|and|or|for|with|is|are|at|by|your|their)$/i

/**
 * JSX source text carries HTML entities (`Estimated wait &lt; 2 minutes`) but the browser
 * renders the decoded form, so the decoded form is what the wordlist is keyed on. Decode
 * before emitting, or the key can never match — and `&lt;` inside a JS string literal is
 * also just wrong.
 */
const decodeEntities = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/**
 * A single-quoted JS string literal. `JSON.stringify` then swapping quotes is NOT
 * equivalent: it leaves inner apostrophes bare, so "We're moving" emits `'We're moving'`,
 * which is a syntax error. Escape backslashes first, then apostrophes.
 */
const jsStr = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const isCopy = (s) =>
  s.length >= 3 && s.length <= 160 && /[A-Za-z]{2}/.test(s) && /^[A-Z]/.test(s) &&
  (s.match(/[A-Za-z]/g) || []).length / s.length > 0.5 &&
  !NOISE.some((re) => re.test(s)) && !FRAGMENT.test(s)

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p, out) }
    else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

const files = ONLY.length ? ONLY.map((f) => path.resolve(ROOT, f)) : walk(path.join(ROOT, 'src'))
const skipped = []
let totalText = 0, totalAttr = 0, changedFiles = 0

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const src = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

  /** [start, end, replacement] — collected then applied back-to-front so offsets hold. */
  const edits = []
  let usesTx = false, usesT = false

  const attrsOf = (node) => node.attributes.properties
  const hasSpreadOrDir = (open) => attrsOf(open).some((a) =>
    ts.isJsxSpreadAttribute(a) || (a.name && ['dir', 'children'].includes(a.name.getText(sf))))

  const visit = (node) => {
    // ── 1. element whose only child is text ──
    if (ts.isJsxElement(node)) {
      const kids = node.children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ''))
      const onlyText = kids.length === 1 && ts.isJsxText(kids[0])
      if (onlyText && !hasSpreadOrDir(node.openingElement)) {
        const text = decodeEntities(kids[0].text.replace(/\s+/g, ' ').trim())
        if (isCopy(text)) {
          const open = node.openingElement
          // `<p className="x">` → `<p className="x" {...tx('…')} />`, dropping the closing tag.
          const openSrc = src.slice(open.getStart(sf), open.getEnd())
          const withSpread = `${openSrc.slice(0, -1).trimEnd()} {...tx(${jsStr(text)})} />`
          edits.push([node.getStart(sf), node.getEnd(), withSpread])
          usesTx = true
          totalText++
          return // don't descend into a node we just replaced wholesale
        }
        if (text) skipped.push(`${rel}:${sf.getLineAndCharacterOfPosition(kids[0].getStart(sf)).line + 1}  text  "${text}"`)
      }
    }
    // ── 2. translatable string attributes ──
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf)
      const value = node.initializer.text.trim()
      if (ATTRS.has(name) && value && isCopy(value)) {
        edits.push([
          node.initializer.getStart(sf), node.initializer.getEnd(),
          `{t(${jsStr(decodeEntities(value))})}`,
        ])
        usesT = true
        totalAttr++
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  if (!edits.length) continue

  let out = src
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + text + out.slice(end)
  }

  console.log(`${rel}: ${edits.length} edit(s)`)
  changedFiles++
  if (!DRY) fs.writeFileSync(file, out)
  // Note which helpers the file now needs; wiring the hook/import is done separately
  // because it depends on component structure the codemod does not model.
  if (usesTx || usesT) {
    const needs = [usesTx && 'tx', usesT && 't'].filter(Boolean).join(', ')
    fs.appendFileSync(path.join(ROOT, 'scripts/.lsd-needs-hook.txt'), `${rel}\t${needs}\n`)
  }
}

console.log(`\n${totalText} text node(s), ${totalAttr} attribute(s) across ${changedFiles} file(s)`)
if (skipped.length) {
  console.log(`\n${skipped.length} left for manual review (mixed children, already routed, or not prose):`)
  for (const s of skipped.slice(0, 60)) console.log('  ' + s)
  if (skipped.length > 60) console.log(`  …and ${skipped.length - 60} more`)
}
