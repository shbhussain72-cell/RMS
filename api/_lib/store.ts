/**
 * store.ts — the record store, one interface and two implementations.
 *
 * ── WHY VERCEL BLOB ──────────────────────────────────────────────────────────────────
 *
 * Vercel KV was sunset in December 2024 and existing stores were moved to Upstash Redis;
 * a key-value store on Vercel today means a Marketplace integration with a third-party
 * account behind it. Blob is first-party: one integration, one server-side env var.
 *
 * It also happens to match the two requirements that actually decide this:
 *
 *   PER-RECORD GRANULARITY IS A PATHNAME. `remarks/<id>.json`, `dictionary/<key>/<rev>.json`.
 *   No blob holds more than one record, so there is no read-modify-write anywhere and six
 *   concurrent reviewers cannot clobber each other. A single remarks.json would have made
 *   that loss both certain and silent.
 *
 *   APPEND-ONLY IS THE DEFAULT. Blob refuses a repeated pathname unless you pass
 *   `allowOverwrite`. A dictionary revision is a NEW object, so immutability is the
 *   storage's own behaviour rather than a rule this code has to remember to keep.
 *
 * The store is PRIVATE: reads need the token and go through a function, so no record is
 * readable by guessing a URL. Private reads pass `useCache: false`, which the docs describe
 * as skipping the CDN propagation delay entirely — without it an overwrite can take up to
 * 60s to become visible, and "your colleague's edit shows up in a minute" is indistinguishable
 * from a bug.
 *
 * ── THE IN-MEMORY IMPLEMENTATION IS NOT A MOCK ───────────────────────────────────────
 *
 * It is the same interface with a Map behind it, and it is what the handler tests run
 * against so the suite needs no network, no token and no `vercel dev`. It deliberately
 * reproduces the two Blob behaviours the handlers depend on: a repeated pathname throws
 * unless overwrite is allowed, and `ifMatch` against a stale etag throws. A test double
 * that accepted everything would let a handler pass here and fail in production on exactly
 * the concurrency this design exists to handle.
 */

export interface StoredRecord<T> {
  /** Full pathname, e.g. `remarks/abc.json`. */
  path: string
  body: T
  /** Opaque version token. Pass back as `ifMatch` to make a write conditional. */
  etag: string
}

export interface Store {
  get<T>(path: string): Promise<StoredRecord<T> | null>
  list(prefix: string): Promise<string[]>
  /**
   * `ifMatch` makes the write conditional on the record being unchanged. `create: true`
   * refuses to overwrite at all — the append-only path uses it, so a duplicate revision id
   * is an error rather than a silent replacement.
   */
  put<T>(path: string, body: T, opts?: { ifMatch?: string; create?: boolean }): Promise<StoredRecord<T>>
}

export class PreconditionFailed extends Error {
  constructor(public path: string) {
    super(`precondition failed for ${path}`)
    this.name = 'PreconditionFailed'
  }
}

export class AlreadyExists extends Error {
  constructor(public path: string) {
    super(`${path} already exists`)
    this.name = 'AlreadyExists'
  }
}

// ── in-memory ────────────────────────────────────────────────────────────────────────

export function memoryStore(): Store {
  const data = new Map<string, { body: unknown; etag: string }>()
  let seq = 0
  const nextEtag = () => `mem-${++seq}`

  return {
    async get(path) {
      const hit = data.get(path)
      return hit ? { path, body: hit.body as never, etag: hit.etag } : null
    },
    async list(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix)).sort()
    },
    async put(path, body, opts = {}) {
      const existing = data.get(path)
      if (opts.create && existing) throw new AlreadyExists(path)
      if (opts.ifMatch && (!existing || existing.etag !== opts.ifMatch)) throw new PreconditionFailed(path)
      const etag = nextEtag()
      data.set(path, { body, etag })
      return { path, body, etag }
    },
  }
}

// ── Vercel Blob ──────────────────────────────────────────────────────────────────────

/**
 * Imported lazily, inside the factory, so that importing this module for a test does not
 * require `@vercel/blob` to resolve a token. The handlers import the module at load time;
 * only `blobStore()` touches the SDK.
 */
export function blobStore(token: string): Store {
  const sdk = () => import('@vercel/blob')

  return {
    async get(path) {
      const { get } = await sdk()
      try {
        // `useCache: false` — read the latest write, not the CDN's copy of it. See the header.
        const res = await get(path, { token, access: 'private', useCache: false })
        if (!res || res.statusCode === 304 || !res.stream) return null
        const text = await new Response(res.stream as ReadableStream).text()
        // The etag rides on the metadata, not the response envelope. It is what `ifMatch`
        // compares against, so a missing one must not silently become "no precondition" —
        // `patchRemark` treats an empty etag as unconditional and would clobber.
        return { path, body: JSON.parse(text) as never, etag: res.blob?.etag ?? '' }
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    },

    async list(prefix) {
      const { list } = await sdk()
      const out: string[] = []
      let cursor: string | undefined
      do {
        const page = await list({ token, prefix, limit: 1000, cursor })
        for (const b of page.blobs) out.push(b.pathname)
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
      return out.sort()
    },

    async put(path, body, opts = {}) {
      const { put } = await sdk()
      try {
        const res = await put(path, JSON.stringify(body), {
          token,
          access: 'private',
          // Pathnames are our record ids and must be exact — a random suffix would make
          // `remarks/<id>.json` unfindable by id, which is the whole addressing scheme.
          addRandomSuffix: false,
          allowOverwrite: !opts.create,
          contentType: 'application/json',
          ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : {}),
        })
        return { path, body, etag: (res as { etag?: string }).etag ?? '' }
      } catch (err) {
        if (isPrecondition(err)) throw new PreconditionFailed(path)
        if (opts.create && isExists(err)) throw new AlreadyExists(path)
        throw err
      }
    },
  }
}

// The SDK's error classes are not worth importing eagerly just to `instanceof` them, and a
// name check survives a minor-version reshuffle of the class hierarchy.
const nameOf = (err: unknown) => (err as { name?: string })?.name ?? ''
const msgOf = (err: unknown) => String((err as { message?: string })?.message ?? '')
const isNotFound = (err: unknown) => /NotFound/i.test(nameOf(err)) || /not found|404/i.test(msgOf(err))
const isPrecondition = (err: unknown) => /PreconditionFailed/i.test(nameOf(err)) || /precondition/i.test(msgOf(err))
const isExists = (err: unknown) => /already exists|409/i.test(msgOf(err))

/**
 * The store the handlers use.
 *
 * No token means no Blob store, and that is an ERROR rather than a quiet fall back to
 * memory: an in-memory store on a serverless function looks like it works and loses every
 * record when the instance is recycled. Silently degrading to it would be the worst
 * available failure — reviewers writing into something that forgets.
 */
let injected: Store | null = null

/**
 * TEST SEAM. Lets the handler tests run the real handlers against `memoryStore()`.
 *
 * It lives in `api/`, which is never part of the client bundle, and it is the price of being
 * able to test validation, the 409 and the disabled-flag path without a token or a running
 * `vercel dev`. The alternative — testing only the pure functions in records.ts — would leave
 * every HTTP-shaped decision unasserted, and those are where this API's contract actually is.
 */
export function __setStoreForTests(store: Store | null): void {
  injected = store
}

export function storeFromEnv(): Store {
  if (injected) return injected
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not set — refusing to serve without a store')
  return blobStore(token)
}
