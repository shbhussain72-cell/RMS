/**
 * note.ts — the sticky note's state, one record per route.
 *
 * ── WHY PER ROUTE ────────────────────────────────────────────────────────────────────
 *
 * The note is a list of what is still open ON THIS SCREEN, pinned where you can read it while
 * you work through it. Carried across a navigation it would be a list of things that are not on
 * the screen you are now looking at — worse than nothing, because it reads as if it belongs.
 *
 * So the record is keyed by route and the note simply is not there on a route without one.
 * Navigating away hides it; navigating back shows the same note with the same toggles.
 *
 * Keyed by PATHNAME, not route pattern, because that is what the panel's "This route" filter
 * compares against. The note is the panel's query with the route and the status fixed, and two
 * different keys for one query would be two queries.
 *
 * ── WHY A PUB-SUB AND NOT CONTEXT ────────────────────────────────────────────────────
 *
 * Two components read this: the button in the Remarks panel that creates the note, and the note
 * itself. They are in different corners of the tree and nothing else needs the state, so the
 * alternative was widening `RemarksContextValue` — which every remark render already depends on
 * — with four fields that only this feature uses.
 *
 * ── HIDDEN IS SEPARATE FROM ABSENT ───────────────────────────────────────────────────
 *
 * `on` is whether this route has a note at all. `hidden` is whether that note is collapsed to
 * its dot. They are different states and the dot is the difference: a hidden note leaves
 * something to click, an absent one leaves the screen clean. Collapsing the two would mean the
 * eye either deletes the note or leaves permanent chrome on every route you ever pressed it on.
 *
 * DEV ONLY. `rms-remark-note.v1` is on `check-dev-only.mjs`'s review-only list.
 */

/** Versioned: per-route records with per-note toggles, and that shape may grow. */
export const NOTE_KEY = 'rms-remark-note.v1'

export interface NoteState {
  /** Does this route have a note. */
  on: boolean
  /** Collapsed to its dot. Still a note; still recoverable with one click. */
  hidden: boolean
  /** Show remarks written in English. */
  en: boolean
  /** Show remarks written in Lisan al-Dawat. */
  lsd: boolean
}

/** A new note shows both languages: the reviewer asked for what is open here, not for a subset. */
export const NEW_NOTE: NoteState = { on: true, hidden: false, en: true, lsd: true }

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/**
 * Every stored record, with anything unrecognised dropped.
 *
 * A record that is not an object, or whose `on` is not a boolean, resets to absent rather than
 * to some half-state: an unreadable note is a note nobody can find the dot for.
 */
export function readNotes(): Record<string, NoteState> {
  try {
    const raw = localStorage.getItem(NOTE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, NoteState> = {}
    for (const [route, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!route.startsWith('/') || !v || typeof v !== 'object') continue
      const r = v as Partial<NoteState>
      if (r.on !== true) continue
      out[route] = {
        on: true,
        hidden: bool(r.hidden, false),
        // Both default to ON. A stored record missing them — an older shape, a hand-edited
        // value — must not produce a note that renders an empty list for no stated reason.
        en: bool(r.en, true),
        lsd: bool(r.lsd, true),
      }
    }
    return out
  } catch {
    return {}
  }
}

const listeners = new Set<() => void>()
let cache = ''
let snapshot: Record<string, NoteState> = {}

/**
 * A STABLE object identity per stored value.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is` and re-reads on every render; a
 * fresh `JSON.parse` each time is a new object each time, which is an infinite render loop
 * rather than a slow one. The raw string is the cache key, so any write — including one from
 * another tab — invalidates it.
 */
export function notesSnapshot(): Record<string, NoteState> {
  let raw = ''
  try { raw = localStorage.getItem(NOTE_KEY) ?? '' } catch { raw = '' }
  if (raw !== cache) { cache = raw; snapshot = readNotes() }
  return snapshot
}

export function subscribeNotes(fn: () => void): () => void {
  listeners.add(fn)
  window.addEventListener('storage', fn)
  return () => { listeners.delete(fn); window.removeEventListener('storage', fn) }
}

export function writeNote(route: string, patch: Partial<NoteState> | null): void {
  try {
    const all = readNotes()
    if (patch === null) delete all[route]
    else all[route] = { ...(all[route] ?? NEW_NOTE), ...patch, on: true }
    localStorage.setItem(NOTE_KEY, JSON.stringify(all))
  } catch { /* private mode, quota — a note that forgets itself is not worth throwing over */ }
  for (const fn of listeners) fn()
}
