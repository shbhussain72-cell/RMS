/**
 * records.ts — what a remark and a dictionary revision ARE, and every operation on them.
 *
 * The handlers are HTTP glue; the behaviour lives here, taking a `Store`. That is what lets
 * the whole surface be tested against `memoryStore()` with no network, no token and no
 * `vercel dev` — see api/_lib/records.test.mjs.
 *
 * ── TWO RULES THIS FILE EXISTS TO ENFORCE ────────────────────────────────────────────
 *
 * NOTHING IS EVER DESTROYED. Remarks soft-delete by status; dictionary edits append. There
 * is no code path here that removes a record, because with no auth and six reviewers, an
 * irreversible action one misclick away is not acceptable.
 *
 * A STALE WRITE IS NEVER SILENTLY THE WINNER. Remarks carry an etag. Dictionary revisions
 * carry the revision they were based on, and a write from a stale base still APPENDS — the
 * conflict is reported to the human with both values and both authors, and nothing is
 * merged or discarded on their behalf.
 */
import { AlreadyExists, PreconditionFailed, type Store } from './store'

// ── remarks ──────────────────────────────────────────────────────────────────────────

export type RemarkStatus = 'open' | 'resolved'

export interface SharedRemark {
  id: string
  remark: string
  author: string
  status: RemarkStatus
  route: string
  routePattern: string
  lang: string
  dir: string
  viewportWidth: number
  identifiers: Record<string, unknown>
  capturedStrategy: string
  createdAt: string
  updatedAt: string
  /** Set when the record came from a reviewer's pre-shared localStorage. Never overwritten. */
  importedFrom?: string
}

const remarkPath = (id: string) => `remarks/${id}.json`

export async function listRemarks(store: Store): Promise<{ remarks: SharedRemark[] }> {
  const paths = await store.list('remarks/')
  const records = await Promise.all(paths.map((p) => store.get<SharedRemark>(p)))
  const remarks = records
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ ...r.body, etag: r.etag }))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  return { remarks: remarks as SharedRemark[] }
}

export async function createRemark(store: Store, rec: SharedRemark): Promise<SharedRemark & { etag: string }> {
  try {
    // `create` — a repeated id is a bug or a replayed request, and must not overwrite the
    // record already at that path. The import path relies on this to be idempotent-safe.
    const saved = await store.put(remarkPath(rec.id), rec, { create: true })
    return { ...rec, etag: saved.etag }
  } catch (err) {
    if (err instanceof AlreadyExists) {
      const existing = await store.get<SharedRemark>(remarkPath(rec.id))
      if (existing) return { ...existing.body, etag: existing.etag }
    }
    throw err
  }
}

export class Conflict extends Error {
  constructor(public detail: Record<string, unknown>) { super('conflict'); this.name = 'Conflict' }
}

export class NotFound extends Error {
  constructor(what: string) { super(`${what} not found`); this.name = 'NotFound' }
}

/**
 * Update text and/or status. `ifMatch` is the etag the client last read.
 *
 * Two people editing the same remark is the only race remarks have — every other write goes
 * to its own path. A mismatched etag returns the current record rather than overwriting, so
 * the loser of the race sees what they would have replaced.
 */
export async function patchRemark(
  store: Store,
  id: string,
  patch: { remark?: string; status?: RemarkStatus; author: string },
  ifMatch?: string,
): Promise<SharedRemark & { etag: string }> {
  const current = await store.get<SharedRemark>(remarkPath(id))
  if (!current) throw new NotFound('remark')
  if (ifMatch && current.etag !== ifMatch) {
    throw new Conflict({ current: { ...current.body, etag: current.etag } })
  }
  const next: SharedRemark = {
    ...current.body,
    ...(patch.remark !== undefined ? { remark: patch.remark } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    updatedAt: new Date().toISOString(),
  }
  try {
    const saved = await store.put(remarkPath(id), next, { ifMatch: current.etag })
    return { ...next, etag: saved.etag }
  } catch (err) {
    if (err instanceof PreconditionFailed) {
      const now = await store.get<SharedRemark>(remarkPath(id))
      throw new Conflict({ current: now ? { ...now.body, etag: now.etag } : null })
    }
    throw err
  }
}

// ── dictionary ───────────────────────────────────────────────────────────────────────

export type RevisionKind = 'edit' | 'revert' | 'new-row'

export interface Revision {
  revisionId: string
  key: string
  /** The proposed Lisan al-Dawat value. Empty ONLY for `new-row`, which requests a blank row. */
  value: string
  author: string
  createdAt: string
  note?: string
  kind: RevisionKind
  /** The revision this edit was made against. Absent on the first revision for a key. */
  baseRevisionId?: string
  /** For `revert`: which revision's value was restored. Recorded so history reads as prose. */
  revertOf?: string
}

/**
 * A dictionary key is an arbitrary English string — spaces, punctuation, apostrophes,
 * sometimes a slash. It cannot go into a pathname as-is, and hashing it would make the key
 * unrecoverable from the store. base64url is reversible, pathname-safe and stable, so the
 * store stays readable with nothing but the blob browser.
 */
export function encodeKey(key: string): string {
  const norm = key.replace(/\s+/g, ' ').trim()
  return Buffer.from(norm, 'utf8').toString('base64url')
}
export function decodeKey(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

/**
 * Revisions sort chronologically BY PATHNAME, because Blob lists lexicographically and never
 * by creation date. The ISO timestamp leads for that reason; the revision id breaks ties
 * within the same millisecond.
 */
const revisionPath = (key: string, createdAt: string, revisionId: string) =>
  `dictionary/${encodeKey(key)}/${createdAt.replace(/[:.]/g, '-')}__${revisionId}.json`

export async function history(store: Store, key: string): Promise<Revision[]> {
  const paths = await store.list(`dictionary/${encodeKey(key)}/`)
  const recs = await Promise.all(paths.map((p) => store.get<Revision>(p)))
  return recs
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => r.body)
    .sort((a, b) => (a.createdAt === b.createdAt
      ? (a.revisionId < b.revisionId ? -1 : 1)
      : (a.createdAt < b.createdAt ? -1 : 1)))
}

/** The current value of every overridden key: the latest revision under each prefix. */
export async function currentOverrides(store: Store): Promise<Revision[]> {
  const paths = await store.list('dictionary/')
  const byKey = new Map<string, string[]>()
  for (const p of paths) {
    const enc = p.split('/')[1]
    if (!enc) continue
    if (!byKey.has(enc)) byKey.set(enc, [])
    byKey.get(enc)!.push(p)
  }
  const latest = await Promise.all([...byKey.values()].map(async (list) => {
    // Lexicographic max IS the newest, by the pathname scheme above.
    const newest = list.sort().at(-1)!
    return store.get<Revision>(newest)
  }))
  return latest
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => r.body)
    .sort((a, b) => (a.key < b.key ? -1 : 1))
}

/**
 * Append a revision. ALWAYS appends — that is the point.
 *
 * If `baseRevisionId` is not the current head, the revision is still written and a Conflict
 * is thrown carrying BOTH revisions. Nothing is lost and nothing is merged: the panel shows
 * two values and two authors, and a human picks by appending again. Merge logic is
 * deliberately absent and should stay absent.
 */
export async function appendRevision(
  store: Store,
  rev: Omit<Revision, 'createdAt'> & { createdAt?: string },
): Promise<{ revision: Revision; conflictWith?: Revision }> {
  const createdAt = rev.createdAt ?? new Date().toISOString()
  const full: Revision = { ...rev, createdAt }
  const prior = await history(store, full.key)
  const head = prior.at(-1)

  await store.put(revisionPath(full.key, createdAt, full.revisionId), full, { create: true })

  const stale = head && full.baseRevisionId !== head.revisionId
  // A first edit against an empty history is not a conflict; a first edit against an
  // existing head without naming it is.
  if (stale) return { revision: full, conflictWith: head }
  return { revision: full }
}
