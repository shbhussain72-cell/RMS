/**
 * Route DATA VALUES through the i18n layer.
 *
 * Person names, city names, zone names, relations, and the miqaat date/time labels never
 * appear as literals in JSX — they arrive from the store — so the earlier string codemod
 * could not see them. They now have wordlist entries, so the render sites need wiring.
 *
 *   <p className="x">{member.name}</p>  →  <p className="x" {...td(member.name)} />
 *
 * Only rewrites when the element's single child is an expression reading one of the
 * PROPS below. Anything with siblings, nested elements, or a call expression is skipped —
 * and props passed to components (`<Avatar name={member.name} />`) are never touched,
 * because the receiving component decides how to render them (Avatar derives initials).
 *
 * Usage: node scripts/route-data-values.cjs [--dry]
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')

/** Property names whose value is user-visible data with a wordlist entry. */
const PROPS = new Set([
  'name', 'dateLabel', 'timeLabel', 'region', 'relation',
  'cityName', 'zoneName', 'hostCity', 'monthLabel',
])

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p, out) }
    else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

let files = 0, edits = 0
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const src = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const patches = []

  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const kids = node.children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ''))
      const open = node.openingElement
      const hasSpread = open.attributes.properties.some(
        (a) => ts.isJsxSpreadAttribute(a) || (a.name && ['dir', 'children'].includes(a.name.getText(sf))),
      )
      if (kids.length === 1 && ts.isJsxExpression(kids[0]) && !hasSpread) {
        const expr = kids[0].expression
        // Exactly `<something>.<prop>` — not a call, not a ternary, not a template.
        if (expr && ts.isPropertyAccessExpression(expr) && PROPS.has(expr.name.text)) {
          const openSrc = src.slice(open.getStart(sf), open.getEnd())
          patches.push([
            node.getStart(sf), node.getEnd(),
            `${openSrc.slice(0, -1).trimEnd()} {...td(${expr.getText(sf)})} />`,
          ])
          edits++
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  if (!patches.length) continue
  let out = src
  for (const [s, e, text] of patches.sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + text + out.slice(e)
  console.log(`${rel}: ${patches.length}`)
  files++
  if (!DRY) fs.writeFileSync(file, out)
}
console.log(`\n${edits} data-value render(s) routed across ${files} file(s)`)
