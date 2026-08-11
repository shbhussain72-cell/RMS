/**
 * export.ts — JSON to keep, Markdown to paste.
 *
 * ── THEY ARE NOT TWO FORMATS OF THE SAME THING ───────────────────────────────────────
 *
 * JSON is THE BACKUP. Every field, and it imports back — so nothing may be dropped from it,
 * including the fields the board never shows.
 *
 * Markdown is FOR READING, and specifically for pasting into a message that does not render
 * Markdown. One numbered line per note, its text and nothing else. The route and the date are
 * stated ONCE in the header because they are properties of the export rather than of each note,
 * and that is what keeps the per-note line short enough to read.
 *
 * The remarks export gave every note a heading, a blockquote repeating the same text and a
 * six-row table — about sixty lines for two notes, unreadable exactly where it was going. All of
 * that is in the JSON.
 *
 * ── EVERY EXPORT TAKES THE FILTERED LIST ─────────────────────────────────────────────
 *
 * These functions take the notes they are given and never reach for a store. The caller passes
 * the same array it rendered, which is the only arrangement in which the count on the button,
 * the rows on screen and the contents of the file cannot disagree. The remarks export shipped
 * for weeks showing 2 and exporting 28 because that function read the whole store while the
 * list beside it read a filtered one.
 */
import type { Note } from './types'
import type { NoteFilter } from './filter'

export function toJson(notes: Note[]): string {
  return `${JSON.stringify(notes, null, 2)}\n`
}

/** `11 August 2026`. Written out rather than localised: this is read by developers. */
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
export const longDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

/**
 * The header's filter summary — `/miqaats/:id/city · EN · open`.
 *
 * Only ACTIVE axes appear. "all · any · all" is not information, and a header that lists every
 * axis whether or not it is doing anything trains the reader to skip the line that exists to
 * tell them what they are looking at.
 *
 * The route is named only when the scope is pinned to one. Otherwise the `## /route` sections
 * carry it, and repeating it up here would be wrong the moment there are two.
 */
export function describeFilter(filter?: NoteFilter, route?: string): string {
  if (!filter) return ''
  const parts: string[] = []
  if (filter.scope === 'route' && route) parts.push(route)
  if (filter.lang !== 'all') parts.push(filter.lang === 'lsd' ? 'LSD' : 'EN')
  if (filter.status !== 'all') parts.push(filter.status === 'resolved' ? 'done' : 'open')
  return parts.join(' · ')
}

/** Markdown's own list and heading markers, neutralised — a note is prose and will contain them. */
const oneLine = (s: string) => s.replace(/\r?\n+/g, ' ').trim()

export interface MarkdownMeta {
  filter?: NoteFilter
  route?: string
  /** Injected so a test can assert the header without freezing a clock. */
  now?: Date
}

export function toMarkdown(notes: Note[], meta: MarkdownMeta = {}): string {
  const summary = describeFilter(meta.filter, meta.route)
  const out: string[] = [
    `# Review notes${summary ? ` — ${summary}` : ''}`,
    longDate(meta.now ?? new Date()),
    '',
  ]

  const byRoute = new Map<string, Note[]>()
  for (const n of notes) {
    if (!byRoute.has(n.route)) byRoute.set(n.route, [])
    byRoute.get(n.route)!.push(n)
  }

  const sorted = [...byRoute.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  // Oldest first WITHIN a list, which is the opposite of the board. The board is a working
  // queue and the newest thing is the thing being discussed; a document is read top to bottom
  // and the order things were found in is the order they make sense in.
  const oldestFirst = (a: Note, b: Note) => (a.createdAt < b.createdAt ? -1 : 1)
  const list = (ns: Note[]) => ns.slice().sort(oldestFirst).map((n, i) => `${i + 1}. ${oneLine(n.text)}`)

  // ONE route needs no heading: the header already named it, or there is nothing to
  // disambiguate. A `## /route` above a single list is a line of noise in a message.
  if (sorted.length === 1) {
    out.push(...list(sorted[0][1]))
  } else {
    for (const [route, ns] of sorted) {
      out.push(`## ${route}`, '')
      out.push(...list(ns))
      out.push('')
    }
  }

  // The two numbers somebody checks the export against. Screens, not notes, is the one that
  // catches a filter nobody meant to leave on — 48 notes across 1 screen is a different
  // document from 48 across 10, and the note count alone cannot tell them apart.
  out.push('', `## Screens covered: ${byRoute.size}   Notes: ${notes.length}`)

  // A trailing newline, and never a run of blank lines: this gets pasted.
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

/**
 * A filename that says what is in it without being opened.
 *
 * `review-notes_miqaats-id-city_2026-08-11.md`. The route with its slashes and colons flattened,
 * because a colon is not legal in a filename on Windows and a slash is not legal anywhere — and
 * a download that silently fails to save is worse than an ugly name.
 */
export function exportName(ext: string, route?: string, now = new Date()): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const where = route ? route.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') : 'all'
  return `review-notes_${where}_${iso}.${ext}`
}

/** Trigger a download. */
export function download(filename: string, contents: string | Blob, type?: string): void {
  const blob = typeof contents === 'string' ? new Blob([contents], { type }) : contents
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
