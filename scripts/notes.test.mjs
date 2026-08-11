/**
 * Notes — the pure parts, where a failure names the function.
 *
 * The browser half is `scripts/check-notes.mjs`: anything involving the router, a real
 * navigation or a page reload is asserted there, because it cannot be observed here without
 * simulating the thing rather than testing it.
 *
 * What IS testable here is the part most likely to rot silently — the tolerant read. Every
 * branch of it is a decision about somebody's typed note, and the failure mode of getting one
 * wrong is a board that comes back empty with no error anywhere.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_FILTER, filterNotes } from '../src/notes/filter.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SEED = JSON.parse(readFileSync(resolve(ROOT, 'docs/sticky-notes-seed.json'), 'utf8'))

const note = (over = {}) => ({
  id: 'n1',
  text: 'Align to left',
  route: '/miqaats/:id/city',
  lang: 'en',
  status: 'open',
  createdAt: '2026-08-10T09:00:00.000Z',
  author: 'shabbir',
  ...over,
})

describe('the seed file is fit to be a seed', () => {
  /**
   * `createdAt` IS THE IMPORT MERGE KEY, so a collision inside the seed would mean one of the
   * two notes is silently dropped on every import, forever, and nothing would report it. This
   * is the assertion that lets the merge use the field at all.
   */
  it('has a distinct createdAt for every note', () => {
    const seen = new Map()
    for (const n of SEED) {
      expect(seen.has(n.createdAt), `two notes share ${n.createdAt}: "${seen.get(n.createdAt)}" and "${n.text}"`).toBe(false)
      seen.set(n.createdAt, n.text)
    }
    expect(seen.size).toBe(SEED.length)
  })

  it('carries 48 notes across 10 route patterns', () => {
    // Stated as the two numbers the brief states, so a truncated or re-generated seed file is a
    // failure here rather than a quietly smaller board.
    expect(SEED).toHaveLength(48)
    expect(new Set(SEED.map((n) => n.route)).size).toBe(10)
  })

  it('is entirely route PATTERNS, never pathnames', () => {
    // A concrete id in the seed would file that note against a route no router ever produces,
    // so it would be invisible on every screen — including the one it is about.
    const concrete = SEED.filter((n) => /\/miqaats\/(?!:id)[a-z0-9-]+/.test(n.route))
    expect(concrete.map((n) => n.route)).toEqual([])
  })

  it('has text and a route on every note', () => {
    const broken = SEED.filter((n) => !String(n.text || '').trim() || !String(n.route || '').startsWith('/'))
    expect(broken).toEqual([])
  })
})

describe('filterNotes', () => {
  const HERE = '/miqaats/:id/city'
  const list = [
    note({ id: 'a', route: HERE, status: 'open', lang: 'en', createdAt: '2026-08-10T01:00:00.000Z' }),
    note({ id: 'b', route: HERE, status: 'resolved', lang: 'lsd', createdAt: '2026-08-10T02:00:00.000Z' }),
    note({ id: 'c', route: '/login', status: 'open', lang: 'en', createdAt: '2026-08-10T03:00:00.000Z' }),
    note({ id: 'd', route: HERE, status: 'open', lang: null, createdAt: '2026-08-10T04:00:00.000Z' }),
  ]

  it('defaults to this page, still open', () => {
    expect(filterNotes(list, DEFAULT_FILTER, HERE).map((n) => n.id)).toEqual(['d', 'a'])
  })

  it('orders newest first', () => {
    const ids = filterNotes(list, { scope: 'all', status: 'all', lang: 'all' }, HERE).map((n) => n.id)
    expect(ids).toEqual(['d', 'c', 'b', 'a'])
  })

  it('scope=all crosses routes; scope=route does not', () => {
    const all = filterNotes(list, { scope: 'all', status: 'open', lang: 'all' }, HERE)
    expect(all.map((n) => n.id)).toContain('c')
    const here = filterNotes(list, { scope: 'route', status: 'open', lang: 'all' }, HERE)
    expect(here.map((n) => n.id)).not.toContain('c')
  })

  it('never admits an unknown-language note to a language filter', () => {
    // 3 of the 48 recovered notes have no recorded language. Handing them to `en` would be
    // inventing a fact about somebody else's finding, and they would then be exported under a
    // header that says EN.
    const en = filterNotes(list, { scope: 'route', status: 'all', lang: 'en' }, HERE)
    expect(en.map((n) => n.id)).toEqual(['a'])
    const lsd = filterNotes(list, { scope: 'route', status: 'all', lang: 'lsd' }, HERE)
    expect(lsd.map((n) => n.id)).toEqual(['b'])
    // …and `all` still shows it, so it is reachable rather than lost.
    const any = filterNotes(list, { scope: 'route', status: 'all', lang: 'all' }, HERE)
    expect(any.map((n) => n.id)).toContain('d')
  })

  it('resolved notes are filtered, not deleted', () => {
    expect(filterNotes(list, { scope: 'route', status: 'resolved', lang: 'all' }, HERE).map((n) => n.id))
      .toEqual(['b'])
  })

  it('is not vacuous — the filters actually exclude', () => {
    // Every assertion above is an equality against a subset, and a filter that returned nothing
    // would satisfy several of them. This is the guard that says the input was non-trivial.
    expect(list.length).toBe(4)
    expect(filterNotes(list, { scope: 'all', status: 'all', lang: 'all' }, HERE)).toHaveLength(4)
    expect(filterNotes(list, DEFAULT_FILTER, HERE).length).toBeLessThan(list.length)
  })
})
