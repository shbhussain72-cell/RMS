/**
 * filter.ts — the single definition of "which notes are we talking about".
 *
 * The board renders this. Every export takes this. The count on every button is the length of
 * this. There is deliberately no second path.
 *
 * That is not tidiness. The remarks panel rendered a filtered list beside an export button that
 * read the whole store: with the panel showing 2 rows the button said 8 and the file held 28
 * across 3 routes. Both variables were one word apart in the same function and both looked
 * right, and because an export is a file you open somewhere else, the disagreement only ever
 * surfaced in the tracker — it shipped for weeks.
 */
import type { Note } from './types'

export type Scope = 'route' | 'all'
export type StatusFilter = 'all' | 'open' | 'resolved'
export type LangFilter = 'all' | 'en' | 'lsd'

export interface NoteFilter {
  scope: Scope
  status: StatusFilter
  lang: LangFilter
}

/**
 * This page, still open, any language.
 *
 * Not "everything": a board that opens on all 48 notes from 10 screens is a report, and the
 * thing being asked for is what is outstanding HERE. Both other axes are one click away.
 */
export const DEFAULT_FILTER: NoteFilter = { scope: 'route', status: 'open', lang: 'all' }

/**
 * @param notes  every note in the board
 * @param f      the active filter
 * @param route  the CURRENT route pattern, e.g. `/miqaats/:id/city`
 */
export function filterNotes(notes: Note[], f: NoteFilter, route: string): Note[] {
  return notes
    .filter((n) => {
      if (f.scope === 'route' && n.route !== route) return false
      if (f.status !== 'all' && n.status !== f.status) return false
      // A note with no recorded language is never admitted by a language filter. It is unknown,
      // not English — 3 of the 48 recovered notes are in this state and assigning them would be
      // inventing a fact about somebody else's finding.
      if (f.lang !== 'all' && n.lang !== f.lang) return false
      return true
    })
    // Newest first. The board is a working list and the thing just written is the thing being
    // talked about; the Markdown export re-sorts oldest-first, where reading order is what
    // matters.
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
