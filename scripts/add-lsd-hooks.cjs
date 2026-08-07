/**
 * Companion to route-lsd-strings.cjs: give every component that now CALLS `tx`/`t` a
 * `useT()` hook and the import to go with it.
 *
 * The codemod that inserted the calls does not model component structure, so this pass
 * does it properly with the TypeScript AST:
 *
 *   · find each function/arrow that both looks like a component (returns JSX) and
 *     references `tx`/`t`/`td`/`tdAuthored` without declaring or receiving it
 *   · insert `const { … } = useT()` as the first statement of its body
 *   · add the `useT` import with a path computed from the file's depth
 *
 * Hook placement matters: it goes FIRST in the body, ahead of any early `return`, since a
 * hook after a conditional return breaks the rules of hooks at runtime rather than at
 * compile time.
 *
 * Usage: node scripts/add-lsd-hooks.cjs [--dry]
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')
const HELPERS = ['tx', 't', 'td', 'tdText', 'tdAuthored', 'dirProps', 'isLsd', 'rtlLayout']

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p, out) }
    else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

let touched = 0, hooksAdded = 0
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  let src = fs.readFileSync(file, 'utf8')
  if (!/\b(tx|td|tdAuthored|tdText)\s*\(|[^.\w]t\s*\(/.test(src)) continue

  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const inserts = []

  /** Every identifier used inside `node` that is one of our helpers. */
  const usedIn = (node) => {
    const used = new Set()
    const seek = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && HELPERS.includes(n.expression.text)) {
        used.add(n.expression.text)
      }
      // `{...dirProps}` / `{...rtlLayout}` / bare `isLsd` references
      if (ts.isIdentifier(n) && ['dirProps', 'rtlLayout', 'isLsd'].includes(n.text)) used.add(n.text)
      ts.forEachChild(n, seek)
    }
    ts.forEachChild(node, seek)
    return used
  }

  /** The existing `const { … } = useT()` statement in this body, if any. */
  const findUseT = (body) => (body.statements ?? []).find((s) =>
    ts.isVariableStatement(s) && /useT\s*\(\s*\)/.test(s.getText(sf)))

  const isComponentLike = (node) => {
    const name = node.name?.text ?? ''
    return /^[A-Z]/.test(name) || /=>\s*\(/.test(node.getText(sf).slice(0, 200))
  }

  const visit = (node) => {
    const isFn = ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)
    if (isFn && node.body && ts.isBlock(node.body) && isComponentLike(node)) {
      const used = usedIn(node)
      // Helpers already supplied as parameters are not ours to redeclare.
      const params = new Set(node.parameters?.flatMap((p) => p.name.getText(sf).replace(/[{}\s]/g, '').split(',')) ?? [])
      const needed = [...used].filter((h) => !params.has(h))
      const existing = findUseT(node.body)

      if (existing) {
        // A component may ALREADY destructure some helpers (`const { tdAuthored } = useT()`)
        // and the codemod has just added calls to others. Extending that pattern is the fix;
        // skipping the component — as an earlier version did — leaves `tx` undefined.
        const decl = existing.declarationList.declarations[0]
        if (decl && ts.isObjectBindingPattern(decl.name)) {
          const have = decl.name.elements.map((e) => e.name.getText(sf))
          const missing = needed.filter((h) => !have.includes(h))
          if (missing.length) {
            const merged = HELPERS.filter((h) => have.includes(h) || missing.includes(h))
            inserts.push([decl.name.getStart(sf), decl.name.getEnd(), `{ ${merged.join(', ')} }`, true])
            hooksAdded++
          }
        }
      } else if (needed.length) {
        const order = HELPERS.filter((h) => needed.includes(h))
        const indent = ' '.repeat(sf.getLineAndCharacterOfPosition(node.body.getStart(sf)).character + 2)
        inserts.push([node.body.getStart(sf) + 1, `\n${indent}const { ${order.join(', ')} } = useT()`])
        hooksAdded++
      }
      return // an inner component's helpers belong to it, not the outer one
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  if (!inserts.length) continue

  // Two edit shapes: a pure insertion at `pos`, or a replacement spanning [pos, end).
  // Applied back-to-front so earlier offsets stay valid.
  for (const [pos, a, b, isReplace] of inserts.sort((x, y) => y[0] - x[0])) {
    src = isReplace ? src.slice(0, pos) + b + src.slice(a) : src.slice(0, pos) + a + src.slice(pos)
  }

  if (!/from '[^']*i18n'/.test(src)) {
    const depth = rel.split('/').length - 2   // src/<...>/File.tsx
    const spec = `${'../'.repeat(depth) || './'}i18n`
    const lastImport = [...src.matchAll(/^import .*$/gm)].pop()
    // A file with NO imports (a few pure-presentational components) must get a trailing
    // newline instead of a leading one, or the import runs straight into the first
    // declaration: `import { useT } from '…'const FONT = …`.
    src = lastImport
      ? `${src.slice(0, lastImport.index + lastImport[0].length)}\nimport { useT } from '${spec}'${src.slice(lastImport.index + lastImport[0].length)}`
      : `import { useT } from '${spec}'\n${src}`
  }

  console.log(`${rel}: +${inserts.length} hook(s)`)
  touched++
  if (!DRY) fs.writeFileSync(file, src)
}
console.log(`\n${hooksAdded} hook(s) inserted across ${touched} file(s)`)
