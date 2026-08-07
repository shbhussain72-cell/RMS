/**
 * Remarks — pure-logic assertions.
 *
 * DOM behaviour (anchoring, orphan recovery, mirroring) is NOT tested here. The vitest
 * environment is `node` with no jsdom, and adding jsdom to assert on a tool whose entire
 * behaviour is "does this selector still find the element the browser laid out" would be
 * testing a simulation of the thing rather than the thing. That half lives in
 * `scripts/check-remarks.mjs`, which drives the real fixture in a real browser in both
 * languages, using the Playwright dependency the repo already has.
 *
 * What IS testable without a DOM is the part most likely to rot silently: the duplicated
 * route list, and the export format that a handoff document depends on.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROUTE_PATTERNS, patternFor } from '../src/remarks/routes.ts'
import { toJson, toMarkdown } from '../src/remarks/export.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('route patterns mirror App.tsx', () => {
  /**
   * `src/remarks/routes.ts` duplicates the route table because this app uses a `<Routes>`
   * element tree rather than a data router, so there is no runtime way to ask React Router
   * which PATTERN matched — only which pathname did. Duplication is the price; drifting
   * silently is not, because a missing pattern degrades remark grouping in a way nobody
   * would notice until the export came out wrong.
   */
  it('matches every path= in App.tsx exactly', () => {
    const app = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
    const inApp = [...new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
      .filter((p) => p !== '*')
      .sort()
    expect([...ROUTE_PATTERNS].sort()).toEqual(inApp)
  })

  it('prefers the longest matching pattern', () => {
    // `/miqaats/:id/manage/host` must not be swallowed by `/miqaats/:id`.
    expect(patternFor('/miqaats/ashara-1448/manage/host')).toBe('/miqaats/:id/manage/host')
    expect(patternFor('/miqaats/ashara-1448/manage')).toBe('/miqaats/:id/manage')
    expect(patternFor('/miqaats/ashara-1448')).toBe('/miqaats/:id')
  })

  it('collapses different ids onto one pattern', () => {
    // The whole reason routePattern exists: without it, one screen's remarks split across
    // every miqaat id anyone happened to be looking at.
    expect(patternFor('/miqaats/a/city')).toBe(patternFor('/miqaats/b/city'))
  })

  it('falls back to the pathname for an unknown route', () => {
    expect(patternFor('/not-a-route')).toBe('/not-a-route')
  })
})

const remark = (over = {}) => ({
  id: 'r1',
  route: '/miqaats/ashara-1448/city',
  routePattern: '/miqaats/:id/city',
  identifiers: { structural: 'body > div:nth-child(1)', tag: 'p', text: 'Host City', textLang: 'en' },
  capturedStrategy: 'structural',
  remark: 'Label is clipped at 390px',
  author: 'reviewer',
  status: 'open',
  lang: 'en',
  dir: 'ltr',
  viewportWidth: 390,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('export', () => {
  it('produces parseable JSON that round-trips', () => {
    const list = [remark(), remark({ id: 'r2', lang: 'lsd', dir: 'rtl' })]
    expect(JSON.parse(toJson(list))).toEqual(list)
  })

  it('groups Markdown by route PATTERN, not pathname', () => {
    const md = toMarkdown([
      remark({ id: 'a', route: '/miqaats/one/city' }),
      remark({ id: 'b', route: '/miqaats/two/city' }),
    ])
    // One section, not two — different ids, same screen.
    expect(md.match(/^## /gm)).toHaveLength(1)
    expect(md).toContain('`/miqaats/:id/city`')
    // The concrete pathnames survive on the entries, since "only on this miqaat" is a real
    // observation a reviewer may be making.
    expect(md).toContain('/miqaats/one/city')
    expect(md).toContain('/miqaats/two/city')
  })

  it('escapes pipes so a remark cannot break the table', () => {
    const md = toMarkdown([remark({ remark: 'a | b | c' })])
    expect(md).toContain('a \\| b \\| c')
  })

  it('records the language, direction and width on every entry', () => {
    // The context capture is the whole point of the tool on a bilingual, responsive app.
    expect(toMarkdown([remark({ lang: 'lsd', dir: 'rtl', viewportWidth: 1440 })]))
      .toContain('lsd · rtl · 1440px')
  })

  it('marks orphans and shows the recovery context', () => {
    const r = remark({ lastSeenAt: '2026-02-02T00:00:00.000Z' })
    const res = new Map([['r1', { el: null, resolvedBy: null, degraded: false, orphaned: true }]])
    const md = toMarkdown([r], res)
    expect(md).toContain('**ORPHANED**')
    // An orphan keeps its text AND its selector, so a human can find what it pointed at.
    expect(md).toContain('2026-02-02')
    expect(md).toContain('body > div:nth-child(1)')
    expect(md).toContain('Label is clipped at 390px')
  })

  it('reports a degraded anchor distinctly from an orphan', () => {
    const res = new Map([['r1', { el: {}, resolvedBy: 'text', degraded: true, orphaned: false }]])
    const md = toMarkdown([remark({ capturedStrategy: 'id' })], res)
    expect(md).toContain('degraded anchor')
    expect(md).toContain('now resolving by `text`')
    expect(md).not.toContain('ORPHANED')
  })
})
