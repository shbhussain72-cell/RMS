/**
 * hook-rules.test.mjs — no React hook may be called from inside a callback.
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ─────────────────────────────────────────────────
 *
 * Two routes crashed on the deployed site, both reported and neither reproduced for weeks:
 *
 *     [route-error] /miqaats/eg-cityopen/city        lang=lsd dir=rtl width=390
 *     [route-error] /miqaats/ashara-1448/people      lang=lsd dir=rtl width=390
 *     Minified React error #310 — rendered more hooks than during the previous render
 *
 * `useT()` was being called inside `.map()` callbacks — 30 of them, across 12 files. React
 * matches hooks positionally, so a hook inside a list callback makes the hook COUNT a function
 * of the list length. Render the same component instance with a different number of rows and
 * React throws during render, the route error boundary catches it, and the user gets
 * "Something went wrong on this page".
 *
 * That is why it looked intermittent and why it never reproduced by visiting the route. Both
 * crashes needed an ACTION that changed a list:
 *
 *   /people   opening the assign sheet renders `eligibleAdults.map` where nothing rendered
 *             before — the count jumps mid-session and the next render disagrees
 *   /city     confirming flips `view` to 'success', which swaps the browse tables for the
 *             confirmed summary — three nested maps, all with a hook inside
 *
 * `check-cold-load` walks both routes and reports no boundary, correctly: it visits, and a
 * visit never changes a list length. A probe that only arrives cannot see a defect that needs
 * a second render to exist.
 *
 * ── WHY A STATIC RULE AND NOT A BROWSER TEST ─────────────────────────────────────────
 *
 * A browser test would assert the two flows that are known to break. This asserts the property
 * they broke, everywhere, including the screens nobody has driven yet — and it costs
 * milliseconds. The two flows were reproduced against the deployed build before the fix and
 * again after it; that evidence is in the commit, not here, because re-driving a 40-click
 * allocation flow on every test run buys nothing this rule does not already guarantee.
 *
 * ── THE CONTROLS ─────────────────────────────────────────────────────────────────────
 *
 *   1. SUBJECT. The sweep must find the .tsx files it is supposed to read. Zero findings over
 *      zero files is the same green as zero findings over the whole app.
 *   2. TEETH. The detector is run over source that DOES break the rule and must report it. A
 *      rule that cannot fail is not a rule, and this one is a few AST predicates away from
 *      silently matching nothing.
 */
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const isHookName = (n) => /^use[A-Z]/.test(n)
/** The two places a hook may legally be called: a component, or another hook. */
const isHookHost = (name) => !!name && (/^[A-Z]/.test(name) || isHookName(name))

/**
 * Hook calls that are not directly in a component or custom hook.
 *
 * Works on source text so the teeth control can hand it a string, rather than needing a file
 * on disk that would then also have to be excluded from the real sweep.
 */
function findLooseHooks(source, fileName = 'probe.tsx') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX)
  const out = []

  const nameOf = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) return node.name?.getText()
    const p = node.parent
    if (p && ts.isVariableDeclaration(p)) return p.name.getText()
    if (p && ts.isPropertyAssignment(p)) return p.name.getText()
    if (ts.isFunctionExpression(node) && node.name) return node.name.getText()
    return null
  }

  const stack = []
  const visit = (node) => {
    const isFn = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
    if (isFn) stack.push({ name: nameOf(node) })

    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : null
      if (name && isHookName(name)) {
        const host = stack[stack.length - 1]
        if (host && !isHookHost(host.name)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
          const owner = [...stack].reverse().find((f) => isHookHost(f.name))
          out.push({
            line: line + 1,
            hook: name,
            inside: host.name ? `${host.name}()` : 'an anonymous callback',
            component: owner?.name ?? '(top level)',
          })
        }
      }
    }
    ts.forEachChild(node, visit)
    if (isFn) stack.pop()
  }
  visit(sf)
  return out
}

const FILES = walk(SRC)

describe('react hooks are called where react can count them', () => {
  it('finds the source files to sweep — without this the rule is vacuous', () => {
    // Control 1. The app is ~90 files; a collapse to a handful means the walk broke.
    expect(FILES.length).toBeGreaterThan(40)
    expect(FILES.filter((f) => f.endsWith('.tsx')).length).toBeGreaterThan(20)
  })

  it('detects a hook inside a callback when there is one', () => {
    // Control 2 — teeth. This is the exact shape that shipped, minus the app.
    const broken = `
      import { useT } from './i18n'
      export default function Screen({ rows }) {
        const { t } = useT()
        return <ul>{rows.map((r) => { const { t } = useT(); return <li>{t(r)}</li> })}</ul>
      }
    `
    const found = findLooseHooks(broken)
    expect(found.map((f) => f.hook)).toEqual(['useT'])
    expect(found[0].component).toBe('Screen')

    // And it must NOT flag the same call once it has been hoisted.
    const fixed = `
      import { useT } from './i18n'
      export default function Screen({ rows }) {
        const { t } = useT()
        return <ul>{rows.map((r) => <li>{t(r)}</li>)}</ul>
      }
    `
    expect(findLooseHooks(fixed)).toEqual([])
  })

  it('no hook is called from inside a callback', () => {
    const findings = []
    for (const file of FILES) {
      const rel = relative(ROOT, file).split(sep).join('/')
      for (const f of findLooseHooks(readFileSync(file, 'utf8'), file)) {
        findings.push(`${rel}:${f.line}  ${f.hook}() inside ${f.inside} (within ${f.component})`)
      }
    }
    expect(findings, `a hook here runs a variable number of times per render, which is React #310:\n${findings.join('\n')}`).toEqual([])
  })
})
