/**
 * seed.ts — the 48 recovered notes, placed on their screens on first run.
 *
 * ── WHERE THEY CAME FROM ─────────────────────────────────────────────────────────────
 *
 * They were written in the remarks tool, which pinned each to a DOM element. 26 came out of an
 * export and 22 out of the write queue that never reached the shared store — the 44 the panel
 * was reporting as "queued in this browser, not yet sent" when its API started returning 500.
 * Identical notes were collapsed, and the count of collapsed copies is kept on `duplicates`
 * rather than thrown away, because "three people said this" is information.
 *
 * The element each was pinned to is kept as `element`, as CONTEXT ONLY. Nothing resolves it.
 *
 * ── ONCE, AND ONLY WHEN THE BOARD HAS NEVER BEEN USED ────────────────────────────────
 *
 * `seeded` lives in the same stored record as the notes, so it cannot outlive them: a flag in
 * its own key would survive a cleared board and turn a reset into a permanently empty one.
 *
 * Re-seeding after somebody has started editing would resurrect notes they deleted, which is the
 * one behaviour that would make the board untrustworthy — a delete that does not stay deleted
 * means nothing on the board can be relied on. So the seed runs when `seeded` is false, sets it
 * true, and never looks again.
 *
 * A note the seed adds also carries `source: 'seed'` and its original `createdAt`, so importing
 * the same notes from an export afterwards matches them and adds nothing. The two paths agree by
 * using the same key rather than by being careful.
 *
 * ── THE FILE IS IMPORTED, NOT FETCHED ────────────────────────────────────────────────
 *
 * `docs/sticky-notes-seed.json` is bundled at build time. A fetch would need the file served
 * from `public/`, which would put 48 review notes on a public URL of the deployed app — and it
 * would fail silently offline, on the first run, which is the only run that matters here.
 * Bundling it inside the `REVIEW_TOOLS` branch means Rollup drops it from a production build,
 * and `check-dev-only` asserts that.
 */
import rawSeed from '../../docs/sticky-notes-seed.json'
import type { Note } from './types'
import { newNoteId } from './store'
import type { Board } from './store'

interface SeedEntry {
  text: string
  route: string
  element?: string
  lang?: string | null
  status?: string
  createdAt: string
  author?: string
  duplicates?: number
  source?: string
}

export const SEED_COUNT = (rawSeed as SeedEntry[]).length

function toNote(e: SeedEntry): Note {
  return {
    id: newNoteId(),
    text: e.text,
    route: e.route,
    element: e.element || undefined,
    lang: e.lang === 'en' || e.lang === 'lsd' ? e.lang : null,
    status: e.status === 'resolved' ? 'resolved' : 'open',
    createdAt: e.createdAt,
    author: e.author || 'unknown',
    duplicates: typeof e.duplicates === 'number' && e.duplicates > 1 ? e.duplicates : undefined,
    // 'seed' regardless of whether the recovery found it in an export or in the queue. That
    // distinction is about how it was rescued, which is history rather than something the board
    // should be filtering on; `source` says where a note on THIS board came from.
    source: 'seed',
  }
}

/**
 * The board to store, or null when there is nothing to do.
 *
 * PURE — it takes the current board and returns the next one, so the decision can be tested
 * without a browser. Returning null rather than an unchanged board makes "we did not seed" a
 * distinguishable outcome at the call site instead of an equality check.
 */
export function planSeed(board: Board): Board | null {
  if (board.seeded) return null
  // A board with notes but no `seeded` flag is somebody who was already using this before the
  // seed existed. Their notes are kept and the seeded ones are added around them, matched on
  // createdAt exactly as an import would be — the same key, so the two paths cannot disagree.
  const have = new Set(board.notes.map((n) => n.createdAt))
  const fresh = (rawSeed as SeedEntry[]).filter((e) => !have.has(e.createdAt)).map(toNote)
  return { v: 1, seeded: true, notes: [...board.notes, ...fresh] }
}

/** Per-route counts, for the harness to check against the file rather than against a number. */
export function seedCountsByRoute(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of rawSeed as SeedEntry[]) out[e.route] = (out[e.route] ?? 0) + 1
  return out
}
