/**
 * store.ts — the notes, in this browser and nowhere else.
 *
 * ── NO BACKEND, AND THAT IS THE POINT ────────────────────────────────────────────────
 *
 * The remarks store was shared: an API route, blob storage, an outbox for writes that could not
 * get through, a poll, a fingerprint, and a class of failure where the panel says "44 change(s)
 * queued in this browser — not yet sent" and nobody's notes are visible. Sharing bought
 * something real and cost a moving part that can be down.
 *
 * These are local. Nothing to be down, nothing to queue, nothing to reconcile. The price is that
 * a note is only ever seen by the person who wrote it until they export it, and the board says
 * so in as many words rather than letting somebody discover it.
 *
 * ── CORRUPTION RESETS, IT DOES NOT THROW ─────────────────────────────────────────────
 *
 * Every read is total: an unparseable value, a value of the wrong shape, one note with a missing
 * field — none of it escapes as an exception. A board that will not open because one entry is
 * malformed has lost 48 notes to save one, and the person it happens to has no way to tell that
 * from the tool being broken.
 *
 * A reset re-seeds. The alternative is an empty board with no explanation, and by the time the
 * stored value is unreadable the edits it held are gone either way — so the choice is between
 * the 48 recovered notes and nothing, and nothing helps no one.
 */
import { useSyncExternalStore } from 'react'
import type { Note } from './types'

/** Versioned: the shape will change, and a v1 reader must not choke on a v2 value. */
export const NOTES_KEY = 'rms-notes.v1'

export interface Board {
  v: 1
  /**
   * Has the seed been applied. Held in the SAME record as the notes, so it cannot survive a
   * reset of them — a `seeded: true` flag in its own key would outlive a cleared board and turn
   * a reset into a permanently empty one.
   */
  seeded: boolean
  notes: Note[]
}

export const EMPTY: Board = { v: 1, seeded: false, notes: [] }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * One stored note, or null if it cannot be understood.
 *
 * Per-note rather than all-or-nothing: one bad entry costs that entry, not the board. `text` and
 * `route` are the only fields a note cannot be without — everything else has a defensible
 * default, and defaulting is better than discarding something a person typed.
 */
function readNote(v: unknown, i: number): Note | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const text = str(r.text)?.trim()
  const route = str(r.route)
  if (!text || !route || !route.startsWith('/')) return null
  const lang = r.lang === 'en' || r.lang === 'lsd' ? r.lang : null
  const createdAt = str(r.createdAt) ?? new Date(0).toISOString()
  return {
    id: str(r.id) ?? `n${createdAt}-${i}`,
    text,
    route,
    element: str(r.element),
    lang,
    status: r.status === 'resolved' ? 'resolved' : 'open',
    createdAt,
    updatedAt: str(r.updatedAt),
    author: str(r.author) ?? 'unknown',
    duplicates: typeof r.duplicates === 'number' && r.duplicates > 1 ? r.duplicates : undefined,
    source: ['typed', 'seed', 'exported', 'queued', 'imported'].includes(String(r.source))
      ? (r.source as Note['source'])
      : undefined,
  }
}

/** The stored board, or EMPTY. Never throws. */
export function readBoard(): Board {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY
    const b = parsed as Record<string, unknown>
    if (!Array.isArray(b.notes)) return EMPTY
    const notes = b.notes.map(readNote).filter((n): n is Note => n !== null)
    return { v: 1, seeded: b.seeded === true, notes }
  } catch {
    return EMPTY
  }
}

const listeners = new Set<() => void>()
let cachedRaw: string | null = null
let cached: Board = EMPTY

/**
 * A STABLE object per stored value.
 *
 * `useSyncExternalStore` compares with `Object.is` on every render, so returning a fresh parse
 * each time is an infinite render loop rather than a slow one. The raw string is the cache key,
 * which means a write from another tab invalidates it too.
 */
export function boardSnapshot(): Board {
  let raw: string | null = null
  try { raw = localStorage.getItem(NOTES_KEY) } catch { raw = null }
  if (raw !== cachedRaw) { cachedRaw = raw; cached = readBoard() }
  return cached
}

export function subscribeBoard(fn: () => void): () => void {
  listeners.add(fn)
  window.addEventListener('storage', fn)
  return () => { listeners.delete(fn); window.removeEventListener('storage', fn) }
}

function commit(next: Board) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(next))
  } catch { /* private mode, quota — reported by the caller's next read, not thrown from here */ }
  cachedRaw = null
  for (const fn of listeners) fn()
}

/** Replace the whole board. Used by seeding and import, which both compute the next list. */
export function writeBoard(next: Board): void {
  commit({ v: 1, seeded: next.seeded, notes: next.notes })
}

export function addNote(note: Note): void {
  const b = readBoard()
  commit({ ...b, notes: [...b.notes, note] })
}

export function updateNote(id: string, patch: Partial<Pick<Note, 'text' | 'status'>>): void {
  const b = readBoard()
  commit({
    ...b,
    notes: b.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)),
  })
}

export function removeNote(id: string): void {
  const b = readBoard()
  commit({ ...b, notes: b.notes.filter((n) => n.id !== id) })
}

export function useBoard(): Board {
  return useSyncExternalStore(subscribeBoard, boardSnapshot, boardSnapshot)
}

export function newNoteId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `n${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    }
  } catch { /* fall through */ }
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
