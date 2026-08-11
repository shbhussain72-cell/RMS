/**
 * Export — JSON for round-tripping, Markdown for handoff.
 *
 * ── THEY ARE NOT TWO FORMATS OF THE SAME THING ───────────────────────────────────────
 *
 * JSON is THE RECORD: every anchor, every identifier, the capture strategy, the timestamps,
 * the viewport. It round-trips back into the tool and nothing may be dropped from it.
 *
 * Markdown is FOR READING, and specifically for pasting into a message. It had a heading per
 * remark, a blockquote repeating the same text, and a six-row metadata table under each — so
 * two remarks came to about sixty lines, and pasted into a chat window that does not render
 * Markdown it was unreadable. Every one of those rows is in the JSON. The reviewer wanted a
 * list.
 *
 * So: one numbered line per remark, its text and nothing else. The route, the language and the
 * filter state are stated ONCE in the header, because they are properties of the export rather
 * than of each remark — that is what makes the per-remark line short enough to read.
 *
 * ── GROUPED BY ROUTE PATTERN, NOT PATHNAME ───────────────────────────────────────────
 *
 * Grouping by pathname would produce a section per miqaat id, so five reviewers looking at five
 * different miqaats would file the same screen five times.
 */
import type { Remark, Resolution } from './types'
import type { RemarkFilter } from './filter'

export function toJson(remarks: Remark[]): string {
  return `${JSON.stringify(remarks, null, 2)}\n`
}

/** `10 Aug 2026`. Written out rather than localised: the export is read by developers. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const stamp = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

/**
 * The header's filter summary — `/login · EN · open`.
 *
 * Only ACTIVE filters appear. "all · any · all" is not information, and a header that lists
 * every axis whether or not it is doing anything trains the reader to skip the line that
 * exists to tell them what they are looking at.
 *
 * The route is named only when the scope is pinned to one; otherwise the `## /route` sections
 * below carry it, and repeating it in the header would be wrong the moment there are two.
 */
export function describeFilter(filter?: RemarkFilter, route?: string): string {
  if (!filter) return ''
  const parts: string[] = []
  if (filter.scope === 'route' && route) parts.push(route)
  if (filter.lang !== 'all') parts.push(filter.lang === 'lsd' ? 'LSD' : 'EN')
  if (filter.status !== 'all') parts.push(filter.status === 'resolved' ? 'done' : 'open')
  if (filter.orphanOnly) parts.push('orphaned')
  return parts.join(' · ')
}

/** Markdown's own list/heading markers, neutralised. A remark is prose and will contain them. */
const oneLine = (s: string) => s.replace(/\r?\n+/g, ' ').trim()

export interface MarkdownMeta {
  filter?: RemarkFilter
  route?: string
  /** Injected so a test can assert the header without freezing a clock. */
  now?: Date
}

export function toMarkdown(
  remarks: Remark[],
  resolutions?: Map<string, Resolution>,
  meta: MarkdownMeta = {},
): string {
  const summary = describeFilter(meta.filter, meta.route)
  const out: string[] = [
    `# Review remarks${summary ? ` — ${summary}` : ''}`,
    stamp(meta.now ?? new Date()),
    '',
  ]

  /**
   * Orphans are pulled out FIRST and listed last.
   *
   * An orphan's anchor no longer resolves, so filing it under the route it was captured on
   * points the reader at a screen where the thing is not. It is still a real remark with real
   * text — it just cannot say where any more, and a section that says so is more honest than a
   * route heading that is quietly wrong.
   */
  const orphaned = remarks.filter((r) => resolutions?.get(r.id)?.orphaned)
  const anchored = remarks.filter((r) => !resolutions?.get(r.id)?.orphaned)

  const byRoute = new Map<string, Remark[]>()
  for (const r of anchored) {
    if (!byRoute.has(r.routePattern)) byRoute.set(r.routePattern, [])
    byRoute.get(r.routePattern)!.push(r)
  }

  const sortedRoutes = [...byRoute.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const oldestFirst = (a: Remark, b: Remark) => (a.createdAt < b.createdAt ? -1 : 1)
  const list = (rs: Remark[]) => rs.slice().sort(oldestFirst).map((r, i) => `${i + 1}. ${oneLine(r.remark)}`)

  // ONE route needs no heading — the header already named it, or there is nothing to
  // disambiguate. A `## /route` above a single list is a line of noise in a message.
  if (sortedRoutes.length === 1) {
    out.push(...list(sortedRoutes[0][1]))
  } else {
    for (const [pattern, rs] of sortedRoutes) {
      out.push(`## ${pattern}`, '')
      out.push(...list(rs))
      out.push('')
    }
  }

  if (orphaned.length) {
    if (out[out.length - 1] !== '') out.push('')
    out.push('## Orphaned', '')
    out.push(...list(orphaned))
  }

  // A trailing newline, and never a run of blank lines: this gets pasted.
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

/** Trigger a download. Mirrors CoveragePanel's `downloadTotals`. */
export function download(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
