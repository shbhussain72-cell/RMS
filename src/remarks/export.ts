/**
 * Export — JSON for round-tripping, Markdown for handoff.
 *
 * Grouped by route PATTERN, not pathname. Grouping by pathname would produce a section per
 * miqaat id, so five reviewers looking at five different miqaats would file the same screen
 * five times. The concrete pathname is kept on each entry, since "only reproduces on this
 * miqaat" is a real and useful observation.
 */
import type { Remark, Resolution } from './types'

export function toJson(remarks: Remark[]): string {
  return `${JSON.stringify(remarks, null, 2)}\n`
}

/** `|` breaks Markdown tables; remarks are prose and will contain them. */
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

function statusMark(r: Remark, res?: Resolution): string {
  if (res?.orphaned) return '**ORPHANED**'
  if (res?.degraded) return 'degraded anchor'
  return r.status === 'resolved' ? 'resolved' : 'open'
}

export function toMarkdown(remarks: Remark[], resolutions?: Map<string, Resolution>): string {
  const groups = new Map<string, Remark[]>()
  for (const r of remarks) {
    if (!groups.has(r.routePattern)) groups.set(r.routePattern, [])
    groups.get(r.routePattern)!.push(r)
  }

  const out: string[] = [
    '# Review remarks',
    '',
    `${remarks.length} remark${remarks.length === 1 ? '' : 's'} across ${groups.size} route${groups.size === 1 ? '' : 's'}.`,
    `Exported ${new Date().toISOString()}.`,
    '',
    'Each remark records the language, text direction and viewport width it was made at,',
    'because most findings in this app are specific to one of the three.',
    '',
  ]

  for (const [pattern, list] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    out.push(`## \`${pattern}\``, '')
    const open = list.filter((r) => r.status === 'open').length
    const orphaned = list.filter((r) => resolutions?.get(r.id)?.orphaned).length
    out.push(`${list.length} remark${list.length === 1 ? '' : 's'} — ${open} open${orphaned ? `, ${orphaned} orphaned` : ''}.`, '')

    for (const r of list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
      const res = resolutions?.get(r.id)
      out.push(`### ${statusMark(r, res)} — ${esc(r.remark.slice(0, 70))}${r.remark.length > 70 ? '…' : ''}`, '')
      out.push(`> ${esc(r.remark)}`, '')
      out.push('| | |', '|---|---|')
      out.push(`| Path | \`${esc(r.route)}\` |`)
      out.push(`| Element | \`${esc(r.identifiers.tag)}\`${r.identifiers.text ? ` — "${esc(r.identifiers.text)}"` : ''} |`)
      out.push(`| Anchor | \`${esc(r.capturedStrategy)}\`${res?.resolvedBy && res.resolvedBy !== r.capturedStrategy ? ` → now resolving by \`${res.resolvedBy}\`` : ''} |`)
      out.push(`| Context | ${r.lang} · ${r.dir} · ${r.viewportWidth}px |`)
      out.push(`| Author | ${esc(r.author)} |`)
      out.push(`| Created | ${r.createdAt} |`)
      if (res?.orphaned) {
        out.push(`| Last seen | ${r.lastSeenAt ?? 'never since capture'} |`)
        out.push(`| Selector | \`${esc(r.identifiers.structural)}\` |`)
      }
      out.push('')
    }
  }
  return out.join('\n')
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
