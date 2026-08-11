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
import { exportName, toJson, toMarkdown } from '../src/notes/export.ts'
import { describeImport, planImport } from '../src/notes/import.ts'
import { planSeed, SEED_COUNT, seedCountsByRoute } from '../src/notes/seed.ts'

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

describe('export — JSON is the backup', () => {
  it('round-trips every field, including the ones the board never shows', () => {
    const list = [
      note({ id: 'a', element: '`p` — "ITS ID"', duplicates: 3, source: 'seed', updatedAt: '2026-08-11T00:00:00.000Z' }),
      note({ id: 'b', lang: null }),
    ]
    expect(JSON.parse(toJson(list))).toEqual(list)
  })

  it('keeps element, duplicates and source, which Markdown drops', () => {
    // Named individually rather than compared to a snapshot: a snapshot updated to match a
    // regression is still green, and each of these is something the import needs back.
    const [got] = JSON.parse(toJson([note({ element: '`input`', duplicates: 2, source: 'seed' })]))
    for (const key of ['id', 'text', 'route', 'element', 'lang', 'status', 'createdAt', 'author', 'duplicates', 'source']) {
      expect(got, `JSON dropped ${key}`).toHaveProperty(key)
    }
  })
})

describe('export — Markdown is for pasting', () => {
  const FIXED = new Date('2026-08-11T09:00:00.000Z')
  const md = (list, meta = {}) => toMarkdown(list, { now: FIXED, ...meta })
  const HERE = '/miqaats/:id/city'

  it('is the shape the brief asked for', () => {
    const out = md([
      note({ id: 'a', text: 'Request should be allowed for only one member', createdAt: '2026-08-10T01:00:00.000Z' }),
      note({ id: 'b', text: 'not necessary - full box', createdAt: '2026-08-10T02:00:00.000Z' }),
    ], { filter: { scope: 'route', status: 'all', lang: 'all' }, route: HERE })
    const lines = out.split('\n')
    expect(lines[0]).toBe('# Review notes — /miqaats/:id/city')
    expect(lines[1]).toBe('11 August 2026')
    expect(out).toContain('1. Request should be allowed for only one member')
    expect(out).toContain('2. not necessary - full box')
    expect(out).toContain('## Screens covered: 1   Notes: 2')
  })

  it('states the route and date ONCE, not per note', () => {
    const out = md([note({ id: 'a' }), note({ id: 'b' })],
      { filter: { scope: 'route', status: 'all', lang: 'all' }, route: HERE })
    expect(out.match(/\/miqaats\/:id\/city/g)).toHaveLength(1)
    expect(out.match(/11 August 2026/g)).toHaveLength(1)
  })

  it('names only the axes that are actually filtering', () => {
    const out = md([note()], { filter: { scope: 'all', status: 'all', lang: 'all' }, route: HERE })
    expect(out.split('\n')[0]).toBe('# Review notes')
  })

  it('carries no metadata block per note', () => {
    // The fixture note HAS an author, a date, an element and a language, so each of these would
    // find something if a block were being emitted. Without that, these pass on an empty string.
    const out = md([note({ element: '`p` — "ITS ID"', author: 'shabbir' })])
    expect(out).toContain('Align to left')
    for (const gone of ['|---|', '### ', 'shabbir', 'ITS ID', '2026-08-10T09']) {
      expect(out, `Markdown still carries ${gone}`).not.toContain(gone)
    }
  })

  it('groups under route headings only when there is more than one route', () => {
    const one = md([note({ id: 'a' }), note({ id: 'b' })])
    expect(one.match(/^## \//gm)).toBeNull()

    const two = md([note({ id: 'a' }), note({ id: 'b', route: '/login' })])
    expect(two.match(/^## \//gm)).toHaveLength(2)
    expect(two).toContain('## /login')
    // Numbering restarts inside each section: they are separate lists to read.
    expect(two.match(/^1\. /gm)).toHaveLength(2)
    expect(two).toContain('## Screens covered: 2   Notes: 2')
  })

  it('flattens a multi-line note onto its one line', () => {
    // A newline mid-note would end the list item and orphan the rest of the sentence.
    const out = md([note({ text: 'first line\nsecond line' })])
    expect(out).toContain('1. first line second line')
    expect(out.match(/^\d+\. /gm)).toHaveLength(1)
  })

  it('never emits a run of blank lines and ends with exactly one newline', () => {
    const out = md([note({ id: 'a' }), note({ id: 'b', route: '/login' }), note({ id: 'c' })])
    expect(out).not.toMatch(/\n\n\n/)
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})

describe('exportName', () => {
  const WHEN = new Date('2026-08-11T09:00:00.000Z')

  it('flattens a route into something a filesystem accepts', () => {
    // A colon is illegal in a Windows filename and a slash is illegal everywhere; a download
    // that silently fails to save is worse than an ugly name.
    const name = exportName('md', '/miqaats/:id/city', WHEN)
    expect(name).toBe('review-notes_miqaats-id-city_2026-08-11.md')
    expect(name).not.toMatch(/[:/\\]/)
  })

  it('says "all" when the export is not pinned to one route', () => {
    // An all-screens file named after whichever page you happened to be on is a file that lies
    // in the one place people read without opening it.
    expect(exportName('json', undefined, WHEN)).toBe('review-notes_all_2026-08-11.json')
  })
})

describe('import merges on createdAt', () => {
  const existing = [
    note({ id: 'local-1', createdAt: '2026-08-10T01:00:00.000Z', text: 'already here' }),
    note({ id: 'local-2', createdAt: '2026-08-10T02:00:00.000Z', text: 'also already here' }),
  ]

  it('adds what is new and counts what was already present', () => {
    const file = [
      { text: 'already here', route: '/miqaats/:id/city', createdAt: '2026-08-10T01:00:00.000Z' },
      { text: 'brand new', route: '/login', createdAt: '2026-08-10T09:00:00.000Z' },
    ]
    const r = planImport(existing, file)
    expect(r.added.map((n) => n.text)).toEqual(['brand new'])
    expect(r.alreadyPresent).toBe(1)
    expect(r.skipped).toBe(0)
  })

  it('importing the same file twice adds nothing the second time', () => {
    // The property the whole function exists for, asserted end to end rather than by inspecting
    // the matching rule.
    const file = [
      { text: 'one', route: '/login', createdAt: '2026-08-10T09:00:00.000Z' },
      { text: 'two', route: '/login', createdAt: '2026-08-10T09:01:00.000Z' },
    ]
    const first = planImport([], file)
    expect(first.added).toHaveLength(2)
    const second = planImport(first.added, file)
    expect(second.added).toHaveLength(0)
    expect(second.alreadyPresent).toBe(2)
  })

  it('matches on createdAt and NOT on id', () => {
    // A file from another browser carries ids this board has never seen. Matching on them would
    // duplicate every note on every import.
    const file = [{ id: 'a-completely-different-id', text: 'already here', route: '/miqaats/:id/city', createdAt: '2026-08-10T01:00:00.000Z' }]
    expect(planImport(existing, file).added).toHaveLength(0)
  })

  it('does not duplicate a note the FILE contains twice', () => {
    const twice = [
      { text: 'dup', route: '/login', createdAt: '2026-08-10T09:00:00.000Z' },
      { text: 'dup', route: '/login', createdAt: '2026-08-10T09:00:00.000Z' },
    ]
    const r = planImport([], twice)
    expect(r.added).toHaveLength(1)
    expect(r.alreadyPresent).toBe(1)
  })

  it('skips unusable entries instead of taking the file down', () => {
    const messy = [
      { text: 'good', route: '/login', createdAt: '2026-08-10T09:00:00.000Z' },
      { text: '   ', route: '/login', createdAt: '2026-08-10T09:01:00.000Z' },
      { text: 'no route', createdAt: '2026-08-10T09:02:00.000Z' },
      null,
      'not an object',
    ]
    const r = planImport([], messy)
    expect(r.added.map((n) => n.text)).toEqual(['good'])
    expect(r.skipped).toBe(4)
  })

  it('throws on a file that is not a notes export', () => {
    // The one case where saying nothing would leave somebody reading "0 added" and concluding
    // their file was empty.
    expect(() => planImport([], { notes: [] })).toThrow(/not a notes export/)
    expect(() => planImport([], 'hello')).toThrow(/not a notes export/)
  })

  it('reports all three numbers, and only the ones that happened', () => {
    expect(describeImport({ added: [1, 2], alreadyPresent: 0, skipped: 0 })).toBe('2 added')
    expect(describeImport({ added: [1], alreadyPresent: 3, skipped: 2 })).toBe('1 added, 3 already here, 2 unreadable')
  })
})

describe('seeding', () => {
  const EMPTY = { v: 1, seeded: false, notes: [] }

  it('places every seeded note on a fresh board', () => {
    const next = planSeed(EMPTY)
    expect(next.notes).toHaveLength(SEED_COUNT)
    expect(next.notes).toHaveLength(48)
    expect(next.seeded).toBe(true)
  })

  it('puts them on the routes the file says', () => {
    // Against the FILE, not against a list of numbers typed here — a hard-coded table is a table
    // that goes out of date the next time the seed is regenerated.
    const next = planSeed(EMPTY)
    const got = {}
    for (const n of next.notes) got[n.route] = (got[n.route] ?? 0) + 1
    expect(got).toEqual(seedCountsByRoute())
    expect(Object.keys(got)).toHaveLength(10)
  })

  it('does nothing once the board has been seeded', () => {
    // The behaviour that makes the board trustworthy: a note somebody deleted must stay deleted.
    const seeded = planSeed(EMPTY)
    expect(planSeed(seeded)).toBeNull()
    const afterDeleting = { ...seeded, notes: seeded.notes.slice(0, 5) }
    expect(planSeed(afterDeleting)).toBeNull()
  })

  it('keeps notes written before the seed existed, and does not duplicate them', () => {
    const prior = { v: 1, seeded: false, notes: [note({ id: 'mine', text: 'written earlier', createdAt: '2026-01-01T00:00:00.000Z' })] }
    const next = planSeed(prior)
    expect(next.notes.filter((n) => n.text === 'written earlier')).toHaveLength(1)
    expect(next.notes).toHaveLength(SEED_COUNT + 1)
  })

  it('marks them so a later import of the same notes adds nothing', () => {
    // Seed and import agree by using the SAME key, not by both being careful.
    const seeded = planSeed(EMPTY)
    const asFile = JSON.parse(JSON.stringify(seeded.notes))
    const r = planImport(seeded.notes, asFile)
    expect(r.added).toHaveLength(0)
    expect(r.alreadyPresent).toBe(SEED_COUNT)
  })

  it('carries the recovered element as context, and the collapsed-duplicate counts', () => {
    const next = planSeed(EMPTY)
    // 44 of the 48 recovered notes recorded what they were pinned to; 4 never had it.
    expect(next.notes.filter((n) => n.element)).toHaveLength(44)
    expect(next.notes.filter((n) => n.source === 'seed')).toHaveLength(48)
    // The collapsed copies are kept rather than thrown away.
    expect(next.notes.reduce((t, n) => t + (n.duplicates ?? 1), 0)).toBe(52)
  })
})
