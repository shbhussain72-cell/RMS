/**
 * import.ts — load a JSON export back, without duplicating what is already here.
 *
 * ── MERGE, NEVER REPLACE ─────────────────────────────────────────────────────────────
 *
 * Replacing would make import a destructive operation that looks like a restorative one. The
 * person pressing it has notes on this browser and a file from another; they want both, and if
 * they wanted only the file they can clear the board first — which is a decision they can make
 * and unmake, unlike an import that silently ate their morning's work.
 *
 * ── MATCHED ON createdAt, NOT ON id ──────────────────────────────────────────────────
 *
 * `id` is assigned where a note is created, so the same note exported from one browser and
 * imported into another arrives with an id that browser has never seen — matching on it would
 * duplicate every note on every import. `createdAt` is a property of the NOTE rather than of the
 * store it is sitting in, so it survives the trip.
 *
 * That only works if the values are distinct, which is a real assumption about real data:
 * `notes.test.mjs` asserts all 48 seeded notes have distinct timestamps, and a collision there
 * would silently drop one of the two on every import forever.
 *
 * ── IT REPORTS WHAT IT DID ───────────────────────────────────────────────────────────
 *
 * Added and already-present, as two numbers. "Imported" alone cannot distinguish a working
 * import of a file you already had from a broken one that added nothing, and those need
 * different reactions from the person reading the line.
 */
import type { Note } from './types'
import { newNoteId, readTarget } from './store'

export interface ImportResult {
  added: Note[]
  /** Notes in the file that were already on the board, matched by `createdAt`. */
  alreadyPresent: number
  /** Entries that were not usable as notes at all. Reported rather than silently dropped. */
  skipped: number
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * One entry from a file into a Note, or null.
 *
 * Deliberately as tolerant as the store's own reader — a hand-edited export, or one from an
 * older shape, should give up only the entries it has to. `text` and `route` are the two a note
 * cannot be without.
 */
function fromFile(v: unknown): Note | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const text = str(r.text)?.trim()
  const route = str(r.route)
  if (!text || !route || !route.startsWith('/')) return null
  return {
    id: newNoteId(),
    text,
    route,
    element: str(r.element),
    target: readTarget(r.target),
    lang: r.lang === 'en' || r.lang === 'lsd' ? r.lang : null,
    status: r.status === 'resolved' ? 'resolved' : 'open',
    createdAt: str(r.createdAt) ?? new Date().toISOString(),
    updatedAt: str(r.updatedAt),
    author: str(r.author) ?? 'unknown',
    duplicates: typeof r.duplicates === 'number' && r.duplicates > 1 ? r.duplicates : undefined,
    source: 'imported',
  }
}

/**
 * PURE. Takes the notes already on the board and the parsed file; returns what to add.
 *
 * Pure so it can be tested without a browser or a file picker, which matters because "did this
 * duplicate anything" is the question the whole function exists to answer and it should not need
 * a DOM to ask.
 *
 * @throws if the file is not a JSON array — that is a wrong file, not a partial one, and it is
 *   the one case where saying nothing would leave somebody staring at "0 added".
 */
export function planImport(existing: Note[], parsed: unknown): ImportResult {
  if (!Array.isArray(parsed)) {
    throw new Error('That file is not a notes export — expected a JSON array of notes.')
  }
  const have = new Set(existing.map((n) => n.createdAt))
  const added: Note[] = []
  let alreadyPresent = 0
  let skipped = 0

  for (const entry of parsed) {
    const note = fromFile(entry)
    if (!note) { skipped++; continue }
    // Checked against `have` rather than against `existing`, and `have` grows as we go — a file
    // containing the same note twice must not add it twice either.
    if (have.has(note.createdAt)) { alreadyPresent++; continue }
    have.add(note.createdAt)
    added.push(note)
  }

  return { added, alreadyPresent, skipped }
}

/** The sentence shown after an import. Says all three numbers, and only the ones that happened. */
export function describeImport(r: ImportResult): string {
  const parts = [`${r.added.length} added`]
  if (r.alreadyPresent) parts.push(`${r.alreadyPresent} already here`)
  if (r.skipped) parts.push(`${r.skipped} unreadable`)
  return parts.join(', ')
}
