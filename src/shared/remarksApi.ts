/**
 * remarksApi.ts — the shared remark store, client side.
 *
 * Implements the same `RemarksAdapter` shape the local build already used, so the provider
 * did not have to be rewritten around a new data source: local became the queue, remote
 * became the destination.
 *
 * ── SOFT DELETE, ALWAYS ──────────────────────────────────────────────────────────────
 *
 * `remove()` resolves. It does not delete, there is no endpoint that deletes, and the list
 * from the server includes resolved remarks so the "show resolved" filter has something to
 * show. With no auth and six reviewers, an irreversible action one misclick away is not
 * acceptable — and a reviewer who tidies up someone else's finding should be undoable.
 */
import { enqueue } from './outbox'
import { apiFetch } from './transport'
import { getAuthor } from './identity'
import type { Remark, RemarksAdapter } from '../remarks/types'

/** What the server stores. The local `Remark` plus an etag for conditional updates. */
type SharedRemark = Remark & { etag?: string }

let cache: SharedRemark[] = []
const listeners = new Set<() => void>()
export const subscribeShared = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
const notify = () => listeners.forEach((fn) => fn())

export const cached = (): SharedRemark[] => cache

export async function pull(): Promise<SharedRemark[]> {
  const { data } = await apiFetch<{ remarks: SharedRemark[] }>('/api/remarks')
  cache = data.remarks ?? []
  notify()
  return cache
}

/** Changes when any remark is added or edited. Cheaper to compare than the list. */
export async function fingerprint(): Promise<string> {
  const list = await pull()
  return list.map((r) => `${r.id}:${r.updatedAt}:${r.status}`).join('|')
}

const toBody = (r: Remark) => ({
  id: r.id,
  remark: r.remark,
  author: r.author || getAuthor(),
  route: r.route,
  routePattern: r.routePattern,
  lang: r.lang,
  dir: r.dir,
  viewportWidth: r.viewportWidth,
  identifiers: r.identifiers,
  capturedStrategy: r.capturedStrategy,
  createdAt: r.createdAt,
})

/**
 * The adapter the provider uses.
 *
 * Writes go to the network first and to the outbox only when the network is the thing that
 * failed. A 400 must reach the reviewer as an error; queueing it would turn a permanent
 * rejection into a spinner that never resolves.
 */
export const sharedAdapter: RemarksAdapter = {
  async list() {
    try {
      return await pull()
    } catch {
      // Show what we last saw rather than an empty panel — an empty panel reads as "nobody
      // has filed anything", which is a different and much more misleading statement than
      // "the connection is down". The caller surfaces the error separately.
      return cache
    }
  },

  async load(id) {
    return cache.find((r) => r.id === id) ?? null
  },

  async save(remark) {
    const existing = cache.find((r) => r.id === remark.id)
    const body = toBody(remark)
    if (!existing) {
      try {
        await apiFetch('/api/remarks', { method: 'POST', body: JSON.stringify(body) })
        await pull()
      } catch (err) {
        if ((err as { status?: number }).status && (err as { status: number }).status < 500) throw err
        // Same id on every retry — the API treats a repeated id as the record that already
        // exists, so a flaky connection cannot turn one remark into four.
        await enqueue({ id: remark.id, kind: 'remark-create', path: '/api/remarks', method: 'POST', body })
        cache = [...cache, remark]
        notify()
      }
      return
    }

    const patch = { author: getAuthor() || remark.author, remark: remark.remark, status: remark.status }
    const path = `/api/remarks/${remark.id}`
    const headers = existing.etag ? { 'if-match': existing.etag } : undefined
    try {
      await apiFetch(path, { method: 'PATCH', body: JSON.stringify(patch), headers })
      await pull()
    } catch (err) {
      if ((err as { status?: number }).status && (err as { status: number }).status < 500) throw err
      await enqueue({ id: `patch-${remark.id}`, kind: 'remark-patch', path, method: 'PATCH', body: patch, headers })
      cache = cache.map((r) => (r.id === remark.id ? { ...r, ...patch } : r))
      notify()
    }
  },

  /** Resolves. Never deletes — see the header. */
  async remove(id) {
    const existing = cache.find((r) => r.id === id)
    if (!existing) return
    await sharedAdapter.save({ ...existing, status: 'resolved' })
  },
}

/**
 * One-time push of remarks written before the store was shared.
 *
 * ── THE LOCAL COPY IS NEVER DELETED ──────────────────────────────────────────────────
 *
 * Not on success, not after confirmation, not ever from here. `rms-remarks` is left exactly
 * as it was, and the ids that are confirmed present in the shared store are recorded
 * SEPARATELY under `rms-remarks-pushed`. So pressing the button twice is a no-op, the button
 * can say "12 of 14 pushed" honestly, and the one irreversible operation available — deleting
 * a reviewer's own notes — is not something this code can do by accident.
 *
 * Confirmation is a READ-BACK, not a 201. A write that returned 201 and then failed to appear
 * would otherwise be marked pushed, which is the state that loses work: the local copy looks
 * redundant and the shared copy does not exist.
 */
export const PUSHED_KEY = 'rms-remarks-pushed'

export function pushedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PUSHED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : [])
  } catch {
    return new Set()
  }
}

function markPushed(ids: string[]): void {
  const next = pushedIds()
  ids.forEach((id) => next.add(id))
  try {
    localStorage.setItem(PUSHED_KEY, JSON.stringify([...next]))
  } catch { /* private mode — the button simply offers the push again next time */ }
}

/** Local remarks that are not yet confirmed present in the shared store. */
export function unpushedLocal(local: Remark[]): Remark[] {
  const done = pushedIds()
  return local.filter((r) => !done.has(r.id))
}

export async function pushLocalRemarks(local: Remark[]): Promise<{ pushed: number; failed: number; total: number }> {
  const todo = unpushedLocal(local)
  const author = getAuthor()

  for (const r of todo) {
    try {
      await apiFetch('/api/remarks', {
        method: 'POST',
        body: JSON.stringify({ ...toBody(r), importedFrom: author || 'local' }),
      })
    } catch {
      // Counted by the read-back below, not here. A 201 is not evidence the record is there.
    }
  }

  // Read back and confirm. Only ids that are actually IN the shared store are marked pushed.
  const shared = await pull()
  const present = new Set(shared.map((r) => r.id))
  const confirmed = todo.filter((r) => present.has(r.id)).map((r) => r.id)
  markPushed(confirmed)

  return { pushed: confirmed.length, failed: todo.length - confirmed.length, total: todo.length }
}

/** Remarks in this browser's pre-shared localStorage. Read-only — nothing here writes it. */
export function readLocalRemarks(): Remark[] {
  try {
    const raw = localStorage.getItem('rms-remarks')
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Remark[]).filter((r) => r && typeof r.id === 'string') : []
  } catch {
    return []
  }
}
