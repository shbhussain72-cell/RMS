/**
 * outbox.ts — the local queue that stands between a reviewer's edit and a dropped request.
 *
 * The existing adapter split becomes: LOCAL is the queue, REMOTE is the destination. A write
 * is committed to the queue first and sent second, so an unreachable API — offline, cold
 * start, protection redirect — costs a delay and never an edit.
 *
 * ── EVERY WRITE IS IDEMPOTENT BY ID ──────────────────────────────────────────────────
 *
 * Each queued operation carries the id or revisionId it will create, generated on the client.
 * A retry therefore re-sends the SAME record, and the API treats a repeated id as the record
 * that already exists rather than as a new one. Without that, one flaky connection turns one
 * remark into four, and the reviewer is the one who has to clean it up.
 *
 * ── A PERMANENT FAILURE LEAVES THE QUEUE ─────────────────────────────────────────────
 *
 * Retrying a 400 forever would hide a bug behind a spinner. Only network failures and 5xx are
 * retried; anything else is marked `failed`, kept in the queue with its error, and shown.
 * Nothing is discarded on the reviewer's behalf either way.
 */
import { apiFetch, isRetryable } from './transport'

export type OutboxKind = 'remark-create' | 'remark-patch' | 'dictionary-revision'

export interface OutboxItem {
  /** Stable across retries — it is the record's own id, not a queue sequence number. */
  id: string
  kind: OutboxKind
  path: string
  method: 'POST' | 'PATCH'
  body: Record<string, unknown>
  headers?: Record<string, string>
  queuedAt: string
  attempts: number
  /** Set when the send failed permanently. The item stays queued and visible. */
  failed?: string
}

const KEY = 'rms-outbox'
const listeners = new Set<() => void>()
let items: OutboxItem[] = read()

function read(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as OutboxItem[]).filter((i) => i && typeof i.id === 'string') : []
  } catch {
    return []
  }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch (err) {
    // The reviewer just typed something and it is not persisted. Say so — the whole point of
    // this module is that no write disappears quietly.
    console.error('[outbox] could not persist the queue — this edit is only in memory.', err)
  }
  listeners.forEach((fn) => fn())
}

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const pending = (): OutboxItem[] => items.filter((i) => !i.failed)
export const failed = (): OutboxItem[] => items.filter((i) => i.failed)
export const outboxCount = (): number => items.length

/** Queue a write and try it immediately. Resolves once the attempt settles, not once it lands. */
export async function enqueue(item: Omit<OutboxItem, 'queuedAt' | 'attempts'>): Promise<void> {
  items = [...items.filter((i) => i.id !== item.id), { ...item, queuedAt: new Date().toISOString(), attempts: 0 }]
  write()
  await flush()
}

let flushing = false

/** Send everything queued, oldest first. Safe to call from a timer, an event and the UI. */
export async function flush(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    for (const item of [...items]) {
      if (item.failed) continue
      try {
        await apiFetch(item.path, {
          method: item.method,
          body: JSON.stringify(item.body),
          headers: item.headers,
        })
        items = items.filter((i) => i.id !== item.id)
        write()
      } catch (err) {
        item.attempts += 1
        if (!isRetryable(err)) {
          // Includes NotJson: if /api is serving the SPA shell, retrying cannot fix it and a
          // silent retry loop would be the outage hiding itself.
          item.failed = (err as Error).message
        }
        write()
        // Stop on the first failure. The rest will fail the same way, and hammering a cold
        // function makes it slower for everyone.
        break
      }
    }
  } finally {
    flushing = false
  }
}

/** Drop one permanently-failed item. Only reachable from an explicit UI action. */
export function discardFailed(id: string): void {
  items = items.filter((i) => i.id !== id)
  write()
}

/** Retry one permanently-failed item — e.g. after the deployment is fixed. */
export function retryFailed(id: string): Promise<void> {
  items = items.map((i) => (i.id === id ? { ...i, failed: undefined } : i))
  write()
  return flush()
}

let started = false

/**
 * Retry on reconnect and on a slow timer. Not a poller — this only pushes what is already
 * queued, and does nothing at all when the queue is empty.
 */
export function startOutbox(): () => void {
  if (started) return () => {}
  started = true
  const onOnline = () => { void flush() }
  window.addEventListener('online', onOnline)
  const timer = window.setInterval(() => { if (pending().length) void flush() }, 20_000)
  void flush()
  return () => {
    started = false
    window.removeEventListener('online', onOnline)
    window.clearInterval(timer)
  }
}
