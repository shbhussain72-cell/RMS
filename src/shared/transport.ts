/**
 * transport.ts — every call to /api goes through here, and every failure is loud.
 *
 * ── A NON-JSON RESPONSE THROWS ───────────────────────────────────────────────────────
 *
 * `vercel.json` rewrites `/(.*)` to `/index.html`. Vercel checks the filesystem — functions
 * included — before rewrites, so `/api/*` should win. If it ever stops winning, every call
 * returns `200 text/html` with the SPA shell in the body, and a client that shrugs at that
 * turns a total outage into a UI that quietly saves nothing.
 *
 * Deployment Protection produces the same shape: an unauthenticated request is answered with
 * an HTML challenge page, 200, not a 401.
 *
 * So `NotJson` is thrown, surfaced to the reviewer verbatim, and never swallowed. Detecting
 * it and "handling it gracefully" would recreate exactly the silent no-op it exists to
 * prevent. The rule: this module has no code path that returns normally after a failure.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
  }
}

/** The response was not JSON. Almost always the SPA rewrite or a protection challenge. */
export class NotJson extends ApiError {
  constructor(status: number, public contentType: string, public sample: string) {
    super(status, `The API returned ${contentType || 'no content type'} instead of JSON. `
      + 'This usually means /api is being served the app shell — the request never reached a '
      + 'function, so nothing was saved.')
    this.name = 'NotJson'
  }
}

/** The request never got an answer: offline, DNS, cold-start timeout. Retryable. */
export class Unreachable extends ApiError {
  constructor(cause: string) {
    super(0, `The API could not be reached (${cause}). Your edit is queued and will be sent when the connection returns.`)
    this.name = 'Unreachable'
  }
}

/** A 409 from the dictionary or a remark. Carries both sides so the UI can show the choice. */
export class ConflictError extends ApiError {
  constructor(body: Record<string, unknown>) {
    super(409, 'Someone else edited this at the same time.', body)
    this.name = 'ConflictError'
  }
}

export interface ApiResult<T> { data: T; etag: string | null }

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      // Never let a cached answer stand in for a colleague's new remark.
      cache: 'no-store',
    })
  } catch (err) {
    throw new Unreachable((err as Error)?.message || 'network error')
  }

  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()

  if (!/application\/json/i.test(ct)) {
    throw new NotJson(res.status, ct, text.slice(0, 120))
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    // JSON content-type with an unparseable body is the same failure wearing a better hat.
    throw new NotJson(res.status, ct, text.slice(0, 120))
  }

  if (res.status === 409) throw new ConflictError(body)
  if (!res.ok) throw new ApiError(res.status, String(body.error ?? `request failed (${res.status})`), body)

  return { data: body as T, etag: res.headers.get('etag') }
}

/** Retryable = worth queueing. A 400 will fail identically forever and must be shown instead. */
export const isRetryable = (err: unknown): boolean =>
  err instanceof Unreachable || (err instanceof ApiError && err.status >= 500)
