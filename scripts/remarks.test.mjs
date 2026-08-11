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

/**
 * ── THE TWO EXPORTS ANSWER DIFFERENT QUESTIONS ───────────────────────────────────────
 *
 * These tests are deliberately asymmetric, and the asymmetry IS the specification.
 *
 * JSON is asserted to keep EVERY field: it round-trips back into the tool, so a field silently
 * dropped there is a remark that loses its anchor and cannot be restored.
 *
 * Markdown is asserted to keep almost NOTHING: it gets pasted into a chat window that does not
 * render Markdown, and it previously emitted a heading, a blockquote repeating the same text and
 * a six-row table per remark — about sixty lines for two remarks, unreadable exactly where it
 * was going. Every dropped row is still in the JSON. So the not-contains assertions below are
 * not incidental tidiness; they are the requirement, and each one names a thing that was there.
 */
describe('export — JSON is the record', () => {
  it('produces parseable JSON that round-trips', () => {
    const list = [remark(), remark({ id: 'r2', lang: 'lsd', dir: 'rtl' })]
    expect(JSON.parse(toJson(list))).toEqual(list)
  })

  it('keeps every field the Markdown drops', () => {
    // Named individually rather than compared to a snapshot: a snapshot updated to match a
    // regression is still green. Each of these is something the tool needs back.
    const [got] = JSON.parse(toJson([remark({ lastSeenAt: '2026-02-02T00:00:00.000Z' })]))
    for (const key of [
      'id', 'route', 'routePattern', 'identifiers', 'capturedStrategy', 'remark', 'author',
      'status', 'lang', 'dir', 'viewportWidth', 'createdAt', 'updatedAt', 'lastSeenAt',
    ]) {
      expect(got, `JSON dropped ${key}`).toHaveProperty(key)
    }
    expect(got.identifiers.structural).toBe('body > div:nth-child(1)')
  })
})

describe('export — Markdown is for pasting', () => {
  const FIXED = new Date('2026-08-10T09:00:00.000Z')
  const md = (list, res, meta = {}) => toMarkdown(list, res, { now: FIXED, ...meta })

  it('is one numbered line per remark, its text and nothing else', () => {
    const out = md([
      remark({ id: 'a', remark: 'Rather than showing error to enter only 8 digits, make it fixed to 8 digits' }),
      remark({ id: 'b', remark: 'Add an eye feature to view password', createdAt: '2026-01-02T00:00:00.000Z' }),
    ])
    expect(out).toContain('1. Rather than showing error to enter only 8 digits, make it fixed to 8 digits')
    expect(out).toContain('2. Add an eye feature to view password')
    // The line is the text and the number. Nothing trails it.
    const line = out.split('\n').find((l) => l.startsWith('2. '))
    expect(line).toBe('2. Add an eye feature to view password')
  })

  it('carries none of the metadata that used to sit under each remark', () => {
    // The fixture's remark HAS a selector, a strategy, a timestamp, an id and an author, so
    // each of these would find something if the row were still being emitted. Without that,
    // every one of these assertions passes on an empty string.
    const out = md([remark({ lastSeenAt: '2026-02-02T00:00:00.000Z' })])
    expect(out).toContain('Label is clipped at 390px')
    for (const gone of [
      'body > div:nth-child(1)',  // the selector
      'structural',               // the capture strategy
      '2026-01-01',               // the created timestamp
      'en · ltr · 390px',         // the context row — NOT the bare '390px', which is in the
                                  // fixture's own remark text and would fail on a correct export
      'reviewer',                 // the author row
      '|---|',                    // the table
      '> ',                       // the blockquote
      '### ',                     // the per-remark heading
    ]) {
      expect(out, `Markdown still carries ${gone}`).not.toContain(gone)
    }
  })

  it('states the filter and the date once, in the header', () => {
    const out = md([remark(), remark({ id: 'r2' })], undefined, {
      filter: { scope: 'route', status: 'open', lang: 'en', orphanOnly: false },
      route: '/login',
    })
    expect(out.split('\n')[0]).toBe('# Review remarks — /login · EN · open')
    expect(out.split('\n')[1]).toBe('10 Aug 2026')
    // ONCE. Two remarks, one statement of context — that is what makes the lines short.
    expect(out.match(/\/login/g)).toHaveLength(1)
    expect(out.match(/10 Aug 2026/g)).toHaveLength(1)
  })

  it('names only the axes that are actually filtering', () => {
    // "all · any · all" is not information, and a header that lists every axis whether or not
    // it is doing anything trains the reader to skip the line that says what they are reading.
    const out = md([remark()], undefined, {
      filter: { scope: 'all', status: 'all', lang: 'all', orphanOnly: false },
      route: '/login',
    })
    expect(out.split('\n')[0]).toBe('# Review remarks')
    expect(out).not.toContain('/login')
  })

  it('groups under route headings only when there is more than one route', () => {
    const one = md([remark({ id: 'a' }), remark({ id: 'b' })])
    expect(one.match(/^## /gm)).toBeNull()

    const two = md([remark({ id: 'a' }), remark({ id: 'b', routePattern: '/login', route: '/login' })])
    expect(two.match(/^## /gm)).toHaveLength(2)
    expect(two).toContain('## /login')
    // Numbering restarts inside each section: they are separate lists to read.
    expect(two.match(/^1\. /gm)).toHaveLength(2)
  })

  it('groups by route PATTERN, not pathname', () => {
    // The whole reason routePattern exists: without it, five reviewers on five miqaat ids file
    // the same screen five times.
    const out = md([
      remark({ id: 'a', route: '/miqaats/one/city' }),
      remark({ id: 'b', route: '/miqaats/two/city' }),
    ])
    expect(out.match(/^## /gm)).toBeNull()  // one pattern → one list, no heading
    expect(out.match(/^\d+\. /gm)).toHaveLength(2)
  })

  it('puts orphans last, under their own heading', () => {
    // An orphan's anchor no longer resolves, so listing it under the route it was captured on
    // points the reader at a screen where the thing is not.
    const res = new Map([['orph', { el: null, resolvedBy: null, degraded: false, orphaned: true }]])
    const out = md([
      remark({ id: 'orph', remark: 'Lost one' }),
      remark({ id: 'ok', remark: 'Anchored one' }),
    ], res)
    expect(out).toContain('## Orphaned')
    expect(out.indexOf('Anchored one')).toBeLessThan(out.indexOf('## Orphaned'))
    expect(out.indexOf('## Orphaned')).toBeLessThan(out.indexOf('Lost one'))
    // Still numbered, still just text: an orphan is a real remark that cannot say where.
    expect(out).toContain('1. Lost one')
  })

  it('flattens a multi-line remark onto its one line', () => {
    // A newline mid-remark would end the list item and orphan the rest of the sentence.
    const out = md([remark({ remark: 'first line\nsecond line' })])
    expect(out).toContain('1. first line second line')
    expect(out.match(/^\d+\. /gm)).toHaveLength(1)
  })

  it('never emits a run of blank lines and ends with exactly one newline', () => {
    // It is pasted. Trailing whitespace and double gaps show up in the message.
    const res = new Map([['orph', { el: null, resolvedBy: null, degraded: false, orphaned: true }]])
    const out = md([
      remark({ id: 'orph' }),
      remark({ id: 'a', routePattern: '/login', route: '/login' }),
      remark({ id: 'b' }),
    ], res)
    expect(out).not.toMatch(/\n\n\n/)
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})
