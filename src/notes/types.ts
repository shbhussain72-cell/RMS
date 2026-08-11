/**
 * A page-level review note.
 *
 * ── WHY THIS IS NOT A REMARK ─────────────────────────────────────────────────────────
 *
 * `src/remarks` pins each note to a DOM ELEMENT. That is where its structural selectors,
 * capture strategies, degradation levels, orphan states and recovery fixture all come from —
 * roughly two thirds of that subsystem exists to answer "is the thing I was pointing at still
 * on the page", and every edit to the app could make the answer no.
 *
 * The notes people actually wrote did not need the answer. "add a popup", "change alignment",
 * "remove this box", "D - Align to left?" — they are about the SCREEN. Anchoring them to a span
 * bought a whole class of failure in exchange for precision nobody was using.
 *
 * So a note belongs to a route. There is no selector here, nothing resolves, and nothing can
 * orphan.
 *
 * ── `route` IS A PATTERN, NOT A PATHNAME ─────────────────────────────────────────────
 *
 * `/miqaats/:id/city`, never `/miqaats/ashara-1448/city`. A note about the city-selection screen
 * is about that screen for every miqaat; keying on the pathname would file the same finding once
 * per id anybody happened to be looking at, and hide it from the next person who opened a
 * different one. `patternFor()` in `src/remarks/routes.ts` is the existing map and is reused
 * rather than copied — it is already asserted against `App.tsx` by `scripts/remarks.test.mjs`,
 * and a second copy would be a second thing to drift.
 */

export type NoteStatus = 'open' | 'resolved'

/**
 * The language the note was WRITTEN in, taken from the app at the moment of writing.
 *
 * `null` is a real value, not a missing one: 3 of the 48 recovered notes have no recorded
 * language because the old tool did not capture one on that path. Filtering must treat them as
 * "unknown" rather than quietly assigning them to English, which would be a claim.
 */
export type NoteLang = 'en' | 'lsd' | null

/** Where a note came from. Kept so the board can be honest about what it is showing. */
export type NoteSource = 'typed' | 'seed' | 'exported' | 'queued' | 'imported'

export interface Note {
  /** Stable across edits, for React keys and for the edit/resolve/delete controls. */
  id: string
  text: string
  /** ROUTE PATTERN. See the header. */
  route: string
  /**
   * What the note was originally pinned to, for the notes recovered from remarks.
   *
   * CONTEXT ONLY. Nothing resolves it, nothing highlights it, and it is never used to decide
   * where a note belongs — it is a sentence like ``` `p` — "ITS ID" ``` that helps a reader
   * remember which of four inputs was meant. Undefined for notes typed here, and for the 4
   * recovered ones that never had it.
   */
  element?: string
  lang: NoteLang
  status: NoteStatus
  /**
   * ISO timestamp, and THE MERGE KEY for import.
   *
   * Import matches on this rather than on `id`, so a file exported from one browser and
   * imported into another does not arrive as 48 duplicates with different ids. All 48 seeded
   * notes have distinct values, which is what makes it usable as a key at all — asserted in
   * `notes.test.mjs` rather than assumed, because a collision would silently drop a note on
   * every subsequent import.
   */
  createdAt: string
  updatedAt?: string
  author: string
  /**
   * How many identical notes were collapsed into this one when the old store was recovered.
   *
   * Shown, not hidden: "3 people said this" is information, and dropping it would make the
   * recovered board look like it lost notes.
   */
  duplicates?: number
  source?: NoteSource
}
