/**
 * wire-pass-a.mjs — route rendered class-A literals through t().
 *
 *   node scripts/wire-pass-a.mjs --dry     # report what would change
 *   node scripts/wire-pass-a.mjs           # apply
 *
 * Class A means the dictionary ALREADY holds a correct translation and the string simply
 * never asks for it. Those are pure wiring — no new copy, no wordlist decisions — which is
 * what makes them safe to do mechanically.
 *
 * ── SCOPE, AND WHAT IS DELIBERATELY LEFT ALONE ───────────────────────────────────
 *
 * Only literals that are RENDERED: JSX text, a string inside a JSX expression container, and
 * copy-bearing JSX attributes. Module-level data — lookup tables like
 * `REGION_TO_COUNTRY = { Gujarat: 'India' }` — is excluded even when it is class A, because
 * wrapping it would translate a MAP KEY LOOKUP and silently break the lookup. Those strings
 * are user-facing too, but only through some render site, and that render site is where the
 * wrapping belongs. A codemod cannot tell which is which; it can only stay out of the way.
 *
 * ── WHY EDITS ARE APPLIED BY OFFSET, NOT BY PRINTING THE AST ─────────────────────
 *
 * `ts.createPrinter()` would reformat every file it touches — quote style, JSX wrapping,
 * blank lines — burying two dozen real changes in thousands of cosmetic ones and making the
 * diff unreviewable. Edits are therefore collected as (start, end, text) and applied in
 * DESCENDING offset order so earlier offsets stay valid as later ones are replaced.
 */
import ts from 'typescript'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(ROOT, p).split(sep).join('/')
const DRY = process.argv.includes('--dry')

const dict = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/lsd.json'), 'utf8'))
const POLICY = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/loanword-policy.json'), 'utf8'))
const normKey = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const BIDI = /[‎‏؜⁦-⁩‪-‮]/g

/** True only for strings the dictionary can already answer correctly. */
function isClassA(text) {
  const key = normKey(text)
  const entry = dict[key]
  if (!entry || entry.sentinel) return false
  const value = String(entry.lsd ?? '').replace(BIDI, '').trim()
  if (!value) return false
  if (value.toLowerCase() === key.toLowerCase()) return false // identity: B1 or B2, not A
  return !POLICY.identityByPolicy.entries[key]
}

const ROUTED = new Set(['t', 'tx', 'td', 'tdText', 'tdAuthored', 'isRemoved', 'lookupLsd', 'sentinelFor'])
const FORMATTERS = /^(?:TimeLine|DateLine|HijriDate|Ltr|Iso)$/
const NON_COPY_ATTRS = new Set([
  'className', 'style', 'key', 'id', 'htmlFor', 'type', 'name', 'href', 'src', 'to', 'path',
  'viewBox', 'd', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'xmlns',
  'role', 'rel', 'target', 'ref', 'as', 'variant', 'tone', 'size', 'icon', 'colour', 'color',
  'data-name', 'data-tour', 'data-icon', 'data-testid', 'accept', 'autoComplete', 'inputMode',
  'lang', 'dir', 'method', 'action', 'encType', 'width', 'height', 'fontFamily', 'transform',
])

/** JS single-quoted string literal — the repo's prevailing style. */
const jsStr = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(p) && !/\.test\./.test(p)) out.push(p)
  }
  return out
}

const files = [
  ...walk(resolve(ROOT, 'src/screens')),
  ...walk(resolve(ROOT, 'src/components')),
  ...walk(resolve(ROOT, 'src/chat')),
].filter((p) => !/CoveragePanel/.test(p) && !/Bidi\.tsx$|DateLine\.tsx$/.test(p))

let totalEdits = 0
let totalHooks = 0
const changedFiles = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  /** Function-ish nodes that gained a t() call and therefore need `t` in scope. */
  const needsHook = new Set()

  const routed = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p)) {
        const fn = p.expression
        const name = ts.isIdentifier(fn) ? fn.text : ts.isPropertyAccessExpression(fn) ? fn.name.text : ''
        if (ROUTED.has(name)) return true
      }
      if (ts.isJsxAttribute(p)) {
        const owner = p.parent.parent
        const tag = ts.isJsxSelfClosingElement(owner) ? owner.tagName
          : ts.isJsxOpeningElement(owner) ? owner.tagName : null
        if (tag && ts.isIdentifier(tag) && FORMATTERS.test(tag.text)) return true
      }
    }
    return false
  }

  /** Nearest enclosing function body — where the useT() destructure has to live. */
  const enclosingFn = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
        if (p.body && ts.isBlock(p.body)) return p
      }
    }
    return null
  }

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = normKey(node.text)
      if (text && isClassA(text) && !routed(node)) {
        // Preserve the surrounding whitespace exactly — it is significant in JSX and
        // collapsing it would reflow the rendered line.
        const raw = node.text
        const lead = raw.slice(0, raw.length - raw.trimStart().length)
        const trail = raw.slice(raw.trimEnd().length)
        edits.push({ start: node.getStart(), end: node.getEnd(), text: `${lead}{t(${jsStr(text)})}${trail}` })
        const fn = enclosingFn(node)
        if (fn) needsHook.add(fn)
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const p = node.parent
      const text = normKey(node.text)
      const attrName = ts.isJsxAttribute(p) && ts.isIdentifier(p.name) ? p.name.text : null
      const inJsxExpr = (() => {
        for (let q = node.parent; q; q = q.parent) {
          if (ts.isJsxExpression(q)) return true
          if (ts.isJsxAttribute(q)) return false
          if (ts.isFunctionDeclaration(q) || ts.isMethodDeclaration(q)) return false
        }
        return false
      })()

      if (text && isClassA(text) && !routed(node) && !ts.isImportDeclaration(p)) {
        if (attrName && !NON_COPY_ATTRS.has(attrName)) {
          // label="Foo"  →  label={t('Foo')}
          edits.push({ start: node.getStart(), end: node.getEnd(), text: `{t(${jsStr(text)})}` })
          const fn = enclosingFn(node)
          if (fn) needsHook.add(fn)
        } else if (inJsxExpr) {
          edits.push({ start: node.getStart(), end: node.getEnd(), text: `t(${jsStr(text)})` })
          const fn = enclosingFn(node)
          if (fn) needsHook.add(fn)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (!edits.length) continue

  // ── ensure `t` is in scope in every function we touched ──────────────────────
  for (const fn of needsHook) {
    const body = fn.body
    const stmts = body.statements
    const existing = stmts.find(
      (st) => ts.isVariableStatement(st) &&
        st.declarationList.declarations.some(
          (d) => d.initializer && ts.isCallExpression(d.initializer) &&
            ts.isIdentifier(d.initializer.expression) && d.initializer.expression.text === 'useT',
        ),
    )
    if (existing) {
      const decl = existing.declarationList.declarations.find(
        (d) => d.initializer && ts.isCallExpression(d.initializer) &&
          ts.isIdentifier(d.initializer.expression) && d.initializer.expression.text === 'useT',
      )
      if (ts.isObjectBindingPattern(decl.name)) {
        const names = decl.name.elements.map((e) => e.name.getText())
        if (!names.includes('t')) {
          // Extend the existing destructure rather than adding a second useT() call.
          const first = decl.name.elements[0]
          edits.push({ start: first.getStart(), end: first.getStart(), text: 't, ' })
          totalHooks++
        }
      }
      continue
    }
    // No useT() at all — insert one as the first statement of the body.
    const indentSource = stmts.length ? stmts[0] : null
    const pos = indentSource ? indentSource.getStart() : body.getStart() + 1
    const { character } = sf.getLineAndCharacterOfPosition(pos)
    const pad = ' '.repeat(character)
    edits.push({ start: pos, end: pos, text: `const { t } = useT()\n${pad}` })
    totalHooks++
  }

  // Descending so earlier offsets remain valid.
  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let out = src
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)

  // Make sure useT is imported.
  if (/\buseT\b/.test(out) && !/import\s*\{[^}]*\buseT\b[^}]*\}\s*from\s*['"][^'"]*i18n/.test(out)) {
    const m = out.match(/^import .*$/m)
    const depth = rel(file).startsWith('src/screens/') || rel(file).startsWith('src/chat/') ? '../i18n' : '../../i18n'
    const importLine = `import { useT } from '${rel(file).startsWith('src/components/figma/') ? '../../i18n' : depth}'`
    out = m ? out.replace(m[0], `${m[0]}\n${importLine}`) : `${importLine}\n${out}`
  }

  totalEdits += edits.length
  changedFiles.push(`${rel(file)}  (${edits.length} edit${edits.length === 1 ? '' : 's'})`)
  if (!DRY) writeFileSync(file, out, 'utf8')
}

console.log(`${DRY ? '[dry run] ' : ''}${totalEdits} edit(s) across ${changedFiles.length} file(s); ${totalHooks} hook insertion(s)`)
for (const f of changedFiles) console.log(`  ${f}`)
