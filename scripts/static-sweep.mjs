/**
 * static-sweep.mjs — find user-facing English literals in JSX that never reach t()/tx().
 *
 *   node scripts/static-sweep.mjs           # grouped summary
 *   node scripts/static-sweep.mjs --json    # machine-readable worklist
 *   node scripts/static-sweep.mjs --class A # only strings the dictionary can already answer
 *
 * ── WHY THIS EXISTS ALONGSIDE THE DOM SCANNER ────────────────────────────────────
 *
 * The DOM scanner is the honest measure of what a user SEES, but it can only see what a
 * headless walk actually painted. Anything behind a state the walk never entered — a
 * validation error, an empty list, a "Full" capacity pill, a modal, a toast — is invisible
 * to it. Declaring "class-A zero" from the scanner alone would therefore be a statement
 * about the routes we happened to visit, not about the app.
 *
 * This sweep has the opposite bias: it sees every literal in the source regardless of
 * reachability, but cannot know whether a given literal is ever rendered, or whether it is
 * user-facing at all. Neither tool is sufficient; the pair is. The gap between the two lists
 * is itself informative — it is roughly the set of strings behind states the walk missed.
 *
 * Uses the TypeScript compiler API rather than regex. JSX text spans lines, contains
 * apostrophes and entities, and nests inside expressions; a regex over it produces confident
 * nonsense (an earlier gate in this repo mis-parsed an escaped apostrophe and under-reported
 * by 39%).
 */
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(ROOT, p).split(sep).join('/')
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const ONLY_CLASS = argv.includes('--class') ? argv[argv.indexOf('--class') + 1] : null

const dict = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/lsd.json'), 'utf8'))
const POLICY = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/loanword-policy.json'), 'utf8'))
const normKey = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const BIDI = /[‎‏؜⁦-⁩‪-‮]/g

/** Same A/B/C vocabulary the DOM scanner uses, so the two lists compare directly. */
function classify(text) {
  const key = normKey(text)
  const entry = dict[key]
  if (!entry) return 'C'
  if (entry.sentinel) return 'B'
  const value = String(entry.lsd ?? '').replace(BIDI, '').trim()
  if (!value) return 'B'
  if (value.toLowerCase() === key.toLowerCase()) {
    return POLICY.identityByPolicy.entries[key] ? 'B2' : 'B'
  }
  return 'A'
}

/** Translation helpers. A literal inside one of these calls is already routed. */
const ROUTED = new Set(['t', 'tx', 'td', 'tdText', 'tdAuthored', 'isRemoved', 'lookupLsd', 'sentinelFor'])

/** Components whose string props are DATA handed to a formatter, not copy. */
const FORMATTERS = /^(?:TimeLine|DateLine|HijriDate|Ltr|Iso)$/

/**
 * Attributes whose string value is machinery, not copy. `value` is deliberately NOT here:
 * it is machinery on a formatter but may be copy on a select option, so those surface for a
 * human to judge rather than being silently dropped.
 */
const NON_COPY_ATTRS = new Set([
  'className', 'style', 'key', 'id', 'htmlFor', 'type', 'name', 'href', 'src', 'to', 'path',
  'viewBox', 'd', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'xmlns',
  'role', 'rel', 'target', 'ref', 'as', 'variant', 'tone', 'size', 'icon', 'colour', 'color',
  'data-name', 'data-tour', 'data-icon', 'data-testid', 'accept', 'autoComplete', 'inputMode',
  'lang', 'dir', 'method', 'action', 'encType', 'width', 'height', 'fontFamily', 'transform',
])

/** Looks like code, CSS or an asset path rather than something a user reads. */
function isMachinery(text) {
  const s = text.trim()
  if (s.length < 2) return true
  if (!/[A-Za-z]{2,}/.test(s)) return true
  if (/^[/#.]/.test(s)) return true
  if (/^[a-z]+([A-Z][a-z]*)+$/.test(s)) return true
  if (/^[a-z0-9-]+$/.test(s) && !s.includes(' ')) return true
  if (/[[\]{}]|px\]|rgba?\(/i.test(s)) return true
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return true
  if (/^(?:https?:)?\/\//.test(s)) return true
  return false
}

/**
 * Where does this string literal actually live?
 *
 * The distinction that matters is RENDERED vs DATA, and it is not the same as "is it a JSX
 * text node". `{host ? 'Host City' : 'Relay City'}` is a plain StringLiteral by AST kind, yet
 * it is painted on screen; `REGION_TO_COUNTRY = { Gujarat: 'India' }` is the same AST kind and
 * is not. Lumping them together produced a worklist where two thirds of the entries were
 * config values, which is worse than no worklist — it invites a codemod to "fix" a lookup
 * table and break the lookups.
 *
 * So: walk up to the nearest JSX boundary. Anything inside a JSX expression container is
 * rendered. Anything that reaches a function/module boundary first is data — still possibly
 * user-facing, but only via a render site somewhere else, which is where it must be wrapped.
 */
function positionKind(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxExpression(p)) return 'jsx-expr'
    if (ts.isJsxAttribute(p)) return 'attr'
    if (ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) break
  }
  return 'data'
}

function collect(file) {
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []

  /** Is this node lexically inside a translation call or a formatter prop? */
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

  const push = (text, node, kind) => {
    const clean = normKey(text)
    if (!clean || isMachinery(clean) || routed(node)) return
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
    found.push({ text: clean, file: rel(file), line: line + 1, kind, cls: classify(clean) })
  }

  const visit = (node) => {
    if (ts.isJsxText(node)) push(node.text, node, 'jsx-text')
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const p = node.parent
      if (!ts.isImportDeclaration(p) && !ts.isExportDeclaration(p)) {
        const attrName = ts.isJsxAttribute(p) && ts.isIdentifier(p.name) ? p.name.text : null
        const propName = ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) ? p.name.text : null
        if (!(attrName && NON_COPY_ATTRS.has(attrName)) && !(propName && NON_COPY_ATTRS.has(propName))) {
          push(node.text, node, attrName ? `attr:${attrName}` : positionKind(node))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

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

const all = files.flatMap(collect)
const byText = new Map()
for (const hit of all) {
  const prev = byText.get(hit.text)
  if (prev) { prev.count++; prev.sites.push(`${hit.file}:${hit.line}`) }
  else byText.set(hit.text, { ...hit, count: 1, sites: [`${hit.file}:${hit.line}`] })
}
let hits = [...byText.values()]
if (ONLY_CLASS) hits = hits.filter((h) => h.cls === ONLY_CLASS)
const rank = { A: 0, B: 1, B2: 2, C: 3 }
hits.sort((a, b) => rank[a.cls] - rank[b.cls] || b.count - a.count || (a.text < b.text ? -1 : 1))

if (JSON_OUT) {
  console.log(JSON.stringify({ files: files.length, distinct: hits.length, hits }, null, 2))
} else {
  const n = (c) => hits.filter((h) => h.cls === c).length
  console.log(`files scanned            : ${files.length}`)
  console.log(`distinct unrouted strings: ${hits.length}`)
  console.log(`  A  translated, not wired   : ${n('A')}`)
  console.log(`  B  key exists, unusable    : ${n('B')}`)
  console.log(`  B2 identity by policy      : ${n('B2')}`)
  console.log(`  C  no dictionary key       : ${n('C')}`)
  console.log('')
  for (const h of hits.slice(0, 60)) {
    console.log(`  ${h.cls.padEnd(2)} [${String(h.count).padStart(2)}x] ${JSON.stringify(h.text).slice(0, 70).padEnd(72)} ${h.sites[0]}`)
  }
  if (hits.length > 60) console.log(`  …and ${hits.length - 60} more (use --json)`)
}
