/**
 * probe-dom.test.mjs — the paint predicate exists once, and every probe that needs it uses it.
 *
 * `pointVisible` was written for `check-layout`'s occlusion test, where its docblock names the
 * false-positive class it exists to remove. The OVERLAP test twenty lines below it did not use
 * it for months, and `check-overlap` never had it at all. A rect comparison that skips it
 * reports elements clipped out of a scroller as collisions — fourteen findings on /araz and
 * /people that were not defects, and three separate proposed causes for them.
 *
 * Same shape as the width literals: the danger is not one wrong line, it is two copies that
 * drift. So the predicate lives in `probe-dom.mjs`, and this test keeps it there.
 *
 * The rules are deliberately narrow. They are a source-pattern check — a *proxy* — and the
 * outcome they stand in for is asserted by the probes themselves. See
 * docs/assertion-discipline.md for when a proxy is the right subject and what it owes.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHARED = 'probe-dom.mjs'

const files = readdirSync(HERE)
  .filter((f) => /\.(mjs|cjs)$/.test(f) && f !== SHARED && !f.endsWith('.test.mjs'))
  .map((f) => ({ name: f, src: readFileSync(join(HERE, f), 'utf8') }))

/**
 * A hit test at a point derived from an element's OWN rect must be gated on that point being
 * unclipped. A hit test at a point CHOSEN independently — the centre of the viewport, the
 * middle of a dimmed backdrop — cannot be stale and needs no gate.
 *
 * The difference is not decidable from source, so the second case is opted out explicitly with
 * this marker rather than skipped silently. Writing it down is the point: it forces whoever
 * adds a hit test to say which kind it is.
 */
const EXEMPT = 'probe-dom: point is chosen, not derived from a rect'

describe('probe-dom', () => {
  it('is the only definition of the shared predicates', () => {
    const offenders = []
    for (const { name, src } of files) {
      for (const fn of ['pointVisible', 'isVisible', 'selfPainted']) {
        // A definition, not a call: `const pointVisible = (` or `function pointVisible(`.
        const def = new RegExp(`(?:const|let|var|function)\\s+${fn}\\s*[=(]`)
        const m = def.exec(src)
        if (m) offenders.push(`${name}:${src.slice(0, m.index).split(String.fromCharCode(10)).length} redefines ${fn}`)
      }
    }
    expect(offenders, `these must import it from ${SHARED} instead:\n${offenders.join(String.fromCharCode(10))}`).toEqual([])
  })

  it('is installed by every script that uses it', () => {
    const offenders = []
    for (const { name, src } of files) {
      if (!src.includes('window.__probe')) continue
      if (!src.includes(`from './${SHARED}'`)) offenders.push(`${name} reads window.__probe without importing installProbeDom`)
      if (!src.includes('addInitScript(installProbeDom)')) offenders.push(`${name} imports installProbeDom but never installs it`)
    }
    expect(offenders, offenders.join(String.fromCharCode(10))).toEqual([])
  })

  /**
   * `elementFromPoint` answers "what is on top HERE". It cannot answer "is this element drawn
   * here at all" — an element scrolled out of a clipper is not drawn anywhere, and asking the
   * renderer what is at its stale rect returns whatever legitimately occupies that space. Every
   * hit test therefore needs the paint gate in front of it, or it manufactures collisions.
   */
  it('gates every hit test on the paint check', () => {
    const offenders = []
    const NL = String.fromCharCode(10)
    for (const { name, src } of files) {
      const lines = src.split(NL)
      lines.forEach((line, i) => {
        if (!/elementFromPoint\s*\(/.test(line)) return
        const context = lines.slice(Math.max(0, i - 12), i + 1).join(NL)
        if (context.includes('pointVisible') || context.includes(EXEMPT)) return
        offenders.push(`${name}:${i + 1} hit-tests without the paint gate or the exemption note`)
      })
    }
    expect(offenders, offenders.join(NL)).toEqual([])
  })
})
