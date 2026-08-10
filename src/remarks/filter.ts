/**
 * The one definition of "which remarks are we talking about".
 *
 * ── WHY THIS IS NOT INLINE IN THE PANEL ──────────────────────────────────────────────
 *
 * It was, and the export read a different variable. The panel rendered `filtered` and the
 * export button handed `remarks` — the whole store — to the exporter. On "This route · Open ·
 * EN" the list showed 2 rows, the button read (8), and the downloaded file held 28 remarks
 * across 3 routes. Both were one word apart in the same function and both looked right.
 *
 * An export is a file you open somewhere else, so nothing about the disagreement was visible
 * at the moment it happened. Passing the correct variable fixes that instance; having ONE
 * function that answers the question is what stops the next caller getting it wrong, and there
 * is now a third caller — the sticky note — that is the same query with route and status
 * pinned.
 */
import type { Remark, Resolution } from './types'

export type Scope = 'route' | 'all'
export type StatusFilter = 'all' | 'open' | 'resolved'
export type LangFilter = 'all' | 'en' | 'lsd'

export interface RemarkFilter {
  scope: Scope
  status: StatusFilter
  lang: LangFilter
  orphanOnly: boolean
}

export const DEFAULT_FILTER: RemarkFilter = { scope: 'all', status: 'all', lang: 'all', orphanOnly: false }

/**
 * `route` is the CURRENT pathname, used only by `scope: 'route'`. Passed in rather than read
 * from a hook so this stays pure and testable without a router.
 *
 * `resolutions` is live per-load state and the only reason this cannot be a plain predicate on
 * the remark alone — orphanhood is a property of the current DOM, not of the record.
 */
export function filterRemarks(
  remarks: Remark[],
  resolutions: Map<string, Resolution> | undefined,
  f: RemarkFilter,
  route: string,
): Remark[] {
  return remarks.filter((r) => {
    if (f.scope === 'route' && r.route !== route) return false
    if (f.status !== 'all' && r.status !== f.status) return false
    if (f.lang !== 'all' && r.lang !== f.lang) return false
    if (f.orphanOnly && !resolutions?.get(r.id)?.orphaned) return false
    return true
  })
}
