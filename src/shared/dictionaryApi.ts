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
import { applySharedOverrides, baselineValue } from '../i18n'
import { enqueue } from './outbox'
import { apiFetch, ConflictError } from './transport'
import { getAuthor } from './identity'
import { bakedValue } from '../i18n/wordlistNorm.mjs'

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

/**
 * Has this override already been baked into the committed wordlist?
 *
 * The sync writes overrides into the xlsx, the xlsx is committed, and the next build
 * regenerates `lsd.json`. From that point the override's value is identical to the baseline
 * and applying it is a no-op — but it is still in the store, and if it is never retired the
 * pending list grows forever and stops meaning anything.
 *
 * The comparison MUST go through `bakedValue`. The build prefixes mixed-script values with
 * RLM, so the store's `register كرو` is `‏register كرو` in `lsd.json`. Comparing raw to baked
 * never matches, nothing ever retires, and the count climbs while every edit is already in
 * the wordlist — silent, and indistinguishable from the feature working.
 */
export const isMerged = (rev: Revision): boolean => {
  const base = baselineValue(rev.key)
  if (base === undefined) return false          // no row yet — cannot have been merged
  // A BLANK new-row is a request for the row to EXIST, not for it to hold anything. It is
  // fulfilled the moment the wordlist has the key, whatever the owner put in the cell.
  if (rev.kind === 'new-row' && !rev.value) return true
  // A new-row that CARRIES a value retires exactly like an edit: the sync appends the row, the
  // build bakes it, and the override is a no-op from then on. This function used to return
  // false for every 'new-row' before it looked at anything, which was right while that kind
  // implied an empty value, and wrong the moment it stopped: the class-C edits the Page tab
  // exists to collect would have counted as pending forever, in a number whose whole job is
  // to go down.
  return bakedValue(rev.value) === bakedValue(base)
}

/** Overrides whose value is not yet in the committed wordlist. This is the count the UI shows. */
export const pendingOverrides = (): Revision[] => current.filter((r) => !isMerged(r))
export const mergedOverrides = (): Revision[] => current.filter((r) => isMerged(r))

const notify = () => {
  // i18n first, then the panel: the other order renders the editor's new state against the
  // app's old text for a frame, which reads as the edit not having worked.
  //
  // Merged overrides are NOT applied. Their value already is the baseline, so applying them
  // changes nothing visible — but it would keep them marked `staged: true` in the dictionary,
  // which is what the editor draws its "edited" badge from. A row that has been in the
  // wordlist for a month would go on claiming to be an unsaved edit.
  applySharedOverrides(Object.fromEntries(
    current.filter((r) => r.value && !isMerged(r)).map((r) => [r.key, r.value]),
  ))
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
