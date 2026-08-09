/**
 * dictionaryApi.ts — the shared wordlist overrides, client side.
 *
 * Holds the current value per key, pushes every change into the running i18n layer so the UI
 * updates for whoever is looking at it, and sends edits through the outbox so an unreachable
 * API costs a delay rather than an edit.
 *
 * ── WHAT THIS NEVER DOES ─────────────────────────────────────────────────────────────
 *
 * Author, suggest, complete or repair a Lisan al-Dawat value. It stores exactly the
 * characters a human typed, or refuses them. `lsd.json` is generated and the .xlsx is the
 * source of truth; an override is a proposal held in front of the sheet until a person moves
 * it in. That is unchanged by the store now being shared — it is the whole reason the export
 * still exists.
 */
import { applySharedOverrides } from '../i18n'
import { enqueue } from './outbox'
import { apiFetch, ConflictError } from './transport'
import { getAuthor } from './identity'

export type RevisionKind = 'edit' | 'revert' | 'new-row'

export interface Revision {
  revisionId: string
  key: string
  value: string
  author: string
  createdAt: string
  note?: string
  kind: RevisionKind
  baseRevisionId?: string
  revertOf?: string
}

/** Two revisions of one key, made from the same base. The human picks; nothing is merged. */
export interface Conflict {
  key: string
  mine: Revision
  theirs: Revision
}

const listeners = new Set<() => void>()
let current: Revision[] = []
let conflicts: Conflict[] = []

const notify = () => {
  // i18n first, then the panel: the other order renders the editor's new state against the
  // app's old text for a frame, which reads as the edit not having worked.
  applySharedOverrides(Object.fromEntries(current.filter((r) => r.value).map((r) => [r.key, r.value])))
  listeners.forEach((fn) => fn())
}

export const subscribeDictionary = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const overrides = (): Revision[] => current
export const openConflicts = (): Conflict[] => conflicts
export const headFor = (key: string): Revision | undefined => current.find((r) => r.key === key)

/** base64url — the API takes the encoded key in the path, never the raw English. */
export const encodeKey = (key: string): string => {
  const norm = key.replace(/\s+/g, ' ').trim()
  const bytes = new TextEncoder().encode(norm)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function refresh(): Promise<void> {
  const { data } = await apiFetch<{ overrides: Revision[] }>('/api/dictionary')
  current = data.overrides ?? []
  notify()
}

/** A cheap value that changes when anything changes — the poller compares this, not the list. */
export async function fingerprint(): Promise<string> {
  const { data } = await apiFetch<{ overrides: Revision[] }>('/api/dictionary')
  current = data.overrides ?? []
  return current.map((r) => `${r.key}:${r.revisionId}`).join('|')
}

export async function historyFor(key: string): Promise<Revision[]> {
  const { data } = await apiFetch<{ revisions: Revision[] }>(`/api/dictionary/${encodeKey(key)}`)
  return data.revisions ?? []
}

function newRevisionId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '')
  } catch { /* fall through */ }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Append a revision.
 *
 * Sent directly first so a 409 or a 422 reaches the reviewer as an answer rather than as a
 * queued item that fails later. Only an unreachable API falls through to the outbox — that is
 * the case where retrying is the right answer and blocking the reviewer is not.
 */
export async function submit(key: string, value: string, opts: { kind?: RevisionKind; note?: string; revertOf?: string } = {}): Promise<void> {
  const author = getAuthor()
  const revisionId = newRevisionId()
  const base = headFor(key)?.revisionId
  const body = {
    revisionId,
    value,
    author,
    kind: opts.kind ?? 'edit',
    ...(opts.note ? { note: opts.note } : {}),
    ...(base ? { baseRevisionId: base } : {}),
    ...(opts.revertOf ? { revertOf: opts.revertOf } : {}),
  }
  const path = `/api/dictionary/${encodeKey(key)}`
  try {
    await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
    await refresh()
  } catch (err) {
    if (err instanceof ConflictError) {
      // BOTH revisions exist in the store. This is a choice to present, not a failure to
      // report — and explicitly not something to resolve automatically.
      const detail = err.body as { revision?: Revision; conflictWith?: Revision }
      if (detail.revision && detail.conflictWith) {
        conflicts = [...conflicts.filter((c) => c.key !== key), { key, mine: detail.revision, theirs: detail.conflictWith }]
      }
      await refresh()
      return
    }
    // 4xx other than 409 — malformed, or mojibake refused at 422. The caller shows it; there
    // is nothing to retry, and queueing it would hide a rejection behind a spinner.
    if ((err as { status?: number }).status && (err as { status: number }).status < 500) throw err
    await enqueue({ id: revisionId, kind: 'dictionary-revision', path, method: 'POST', body })
  }
}

/** Resolve a conflict by appending the chosen value again, on top of both. */
export async function chooseConflict(key: string, winner: Revision): Promise<void> {
  conflicts = conflicts.filter((c) => c.key !== key)
  await submit(key, winner.value, { note: `chose ${winner.author}'s value`, kind: 'edit' })
}

export const dismissConflict = (key: string): void => {
  conflicts = conflicts.filter((c) => c.key !== key)
  listeners.forEach((fn) => fn())
}
