/**
 * api.test.ts — the whole server surface, against `memoryStore()`.
 *
 * `vercel dev` is assumed unavailable, so this drives the REAL handlers with real `Request`
 * objects and asserts the responses. That covers validation, status codes, the 409 and the
 * disabled-flag path — everything except the network and Blob itself.
 *
 * What it deliberately does NOT claim: that two browsers see each other's writes. That needs
 * two clients against a deployment, and it is written down as a numbered checklist in
 * docs/preview-verification.md rather than asserted here. A local harness reporting "shared
 * remarks work" would be the same class of mistake as asserting a mechanism instead of an
 * outcome — see docs/assertion-discipline.md.
 *
 * This file sits in `api/_lib/`, and Vercel ignores `_`-prefixed paths, so it is not deployed.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { __setStoreForTests, memoryStore } from './store.js'
import { appendRevision, currentOverrides, decodeKey, encodeKey, history } from './records.js'

const ORIGIN = 'https://review.example'
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const REMARK = {
  remark: 'The countdown labels wrap at 768.',
  author: 'Zainab',
  route: '/miqaats',
  routePattern: '/miqaats',
  lang: 'en',
  dir: 'ltr',
  viewportWidth: 768,
  identifiers: { structural: 'main>div:nth-child(2)', tag: 'h2' },
  capturedStrategy: 'structural',
}

let store: ReturnType<typeof memoryStore>

beforeEach(() => {
  store = memoryStore()
  __setStoreForTests(store)
  process.env.REVIEW_API = 'true'
})

// Imported after the seam exists so the handlers pick up the injected store on every call.
const remarksApi = () => import('../remarks/index.js')
const remarkApi = () => import('../remarks/[id].js')
const dictApi = () => import('../dictionary/index.js')
const dictKeyApi = () => import('../dictionary/[key].js')

describe('the flag', () => {
  it('makes every endpoint a 404 when it is off', async () => {
    process.env.REVIEW_API = ''
    const { GET, POST } = await remarksApi()
    expect((await GET(req('GET', '/api/remarks'))).status).toBe(404)
    expect((await POST(req('POST', '/api/remarks', REMARK))).status).toBe(404)
    const { GET: dictGet } = await dictApi()
    expect((await dictGet(req('GET', '/api/dictionary'))).status).toBe(404)
  })

  it('is not a VITE_ variable, so it cannot reach the client bundle', () => {
    // The name itself is the assertion. Vite only inlines VITE_-prefixed variables; anything
    // else is unreachable from client code by construction rather than by discipline.
    expect('REVIEW_API'.startsWith('VITE_')).toBe(false)
    expect('BLOB_READ_WRITE_TOKEN'.startsWith('VITE_')).toBe(false)
  })
})

describe('remarks', () => {
  it('creates, lists and keeps resolved ones in the list', async () => {
    const { GET, POST } = await remarksApi()
    const created = await (await POST(req('POST', '/api/remarks', REMARK))).json()
    expect(created.remark.id).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(created.remark.status).toBe('open')

    const { PATCH } = await remarkApi()
    const res = await PATCH(req('PATCH', `/api/remarks/${created.remark.id}`, { author: 'Ali', status: 'resolved' }))
    expect(res.status).toBe(200)

    // Soft delete: still in the store, still returned. The client filters; the server never
    // drops. If this list shrank, "show resolved" would have nothing to show.
    const listed = await (await GET(req('GET', '/api/remarks'))).json()
    expect(listed.remarks).toHaveLength(1)
    expect(listed.remarks[0].status).toBe('resolved')
  })

  it('never exposes a way to delete one', async () => {
    const mod = await remarkApi()
    expect((mod as Record<string, unknown>).DELETE).toBeUndefined()
    expect((await remarksApi() as Record<string, unknown>).DELETE).toBeUndefined()
  })

  it('reuses a client-supplied id instead of duplicating on retry', async () => {
    // The offline outbox retries the same record. Without this, one flaky connection turns
    // one remark into four.
    const { GET, POST } = await remarksApi()
    const body = { ...REMARK, id: 'outbox-1' }
    await POST(req('POST', '/api/remarks', body))
    const second = await POST(req('POST', '/api/remarks', body))
    expect(second.status).toBe(201)
    const listed = await (await GET(req('GET', '/api/remarks'))).json()
    expect(listed.remarks).toHaveLength(1)
  })

  it('409s a stale edit instead of overwriting, and hands back the current record', async () => {
    const { POST } = await remarksApi()
    const created = await (await POST(req('POST', '/api/remarks', REMARK))).json()
    const id = created.remark.id
    const staleEtag = created.remark.etag

    const { PATCH } = await remarkApi()
    await PATCH(req('PATCH', `/api/remarks/${id}`, { author: 'Ali', remark: 'first winner' }, { 'if-match': staleEtag }))
    const loser = await PATCH(req('PATCH', `/api/remarks/${id}`, { author: 'Fatema', remark: 'second' }, { 'if-match': staleEtag }))

    expect(loser.status).toBe(409)
    const detail = await loser.json()
    expect(detail.current.remark).toBe('first winner')
  })

  it('refuses malformed and oversized payloads', async () => {
    const { POST } = await remarksApi()
    expect((await POST(req('POST', '/api/remarks', { ...REMARK, remark: '' }))).status).toBe(400)
    expect((await POST(req('POST', '/api/remarks', { ...REMARK, lang: 'fr' }))).status).toBe(400)
    expect((await POST(req('POST', '/api/remarks', { ...REMARK, remark: 'x'.repeat(4001) }))).status).toBe(400)
    expect((await POST(req('POST', '/api/remarks', { ...REMARK, id: '../escape' }))).status).toBe(400)
  })

  it('always answers with JSON, never HTML', async () => {
    // The client throws on a non-JSON response. Anything this API returns must therefore be
    // JSON, including its errors — an HTML error page would be indistinguishable, to the
    // client, from the SPA rewrite swallowing /api.
    const { GET, POST } = await remarksApi()
    for (const res of [await GET(req('GET', '/api/remarks')), await POST(req('POST', '/api/remarks', {}))]) {
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      await expect(res.json()).resolves.toBeTypeOf('object')
    }
  })
})

describe('dictionary keys', () => {
  it('round-trip through the pathname encoding, including slashes and Arabic', () => {
    for (const key of ['Register now', "Guardian's name", 'City / Zone', 'اهم هدايات', 'a'.repeat(200)]) {
      expect(decodeKey(encodeKey(key))).toBe(key)
    }
  })

  it('normalise whitespace so two spellings of one string are one key', () => {
    expect(encodeKey('Register  now ')).toBe(encodeKey('Register now'))
  })
})

describe('dictionary revisions', () => {
  it('appends rather than overwrites, newest last', async () => {
    await appendRevision(store, { revisionId: 'r1', key: 'Register now', value: 'ونو', author: 'A', kind: 'edit' })
    await appendRevision(store, { revisionId: 'r2', key: 'Register now', value: 'دو', author: 'B', kind: 'edit', baseRevisionId: 'r1' })
    const revs = await history(store, 'Register now')
    expect(revs.map((r) => r.revisionId)).toEqual(['r1', 'r2'])
    expect(revs.map((r) => r.author)).toEqual(['A', 'B'])
  })

  it('reports the current value per key', async () => {
    await appendRevision(store, { revisionId: 'r1', key: 'One', value: 'x', author: 'A', kind: 'edit' })
    await appendRevision(store, { revisionId: 'r2', key: 'One', value: 'y', author: 'B', kind: 'edit', baseRevisionId: 'r1' })
    await appendRevision(store, { revisionId: 'r3', key: 'Two', value: 'z', author: 'C', kind: 'edit' })
    const cur = await currentOverrides(store)
    expect(cur.map((r) => [r.key, r.value])).toEqual([['One', 'y'], ['Two', 'z']])
  })

  it('keeps BOTH edits when two clients write from the same base', async () => {
    // The load-bearing case. Neither edit may be lost, and neither may be merged.
    const { POST } = await dictKeyApi()
    const key = encodeKey('Register now')
    const first = await POST(req('POST', `/api/dictionary/${key}`, { value: 'first', author: 'Zainab', revisionId: 'a1' }))
    expect(first.status).toBe(201)

    const conflicting = await POST(req('POST', `/api/dictionary/${key}`, { value: 'second', author: 'Ali', revisionId: 'a2' }))
    expect(conflicting.status).toBe(409)
    const detail = await conflicting.json()
    expect(detail.revision.value).toBe('second')
    expect(detail.conflictWith.value).toBe('first')
    expect(detail.conflictWith.author).toBe('Zainab')

    // Both are on disk. A 409 means "yours is saved AND so is theirs", not "yours was refused".
    const revs = await history(store, 'Register now')
    expect(revs.map((r) => r.value)).toEqual(['first', 'second'])
  })

  it('accepts an edit that names the current head', async () => {
    const { POST } = await dictKeyApi()
    const key = encodeKey('Register now')
    await POST(req('POST', `/api/dictionary/${key}`, { value: 'first', author: 'Z', revisionId: 'b1' }))
    const ok = await POST(req('POST', `/api/dictionary/${key}`, { value: 'second', author: 'A', revisionId: 'b2', baseRevisionId: 'b1' }))
    expect(ok.status).toBe(201)
  })

  it('reverts by appending, never by deleting', async () => {
    const { POST, GET } = await dictKeyApi()
    const key = encodeKey('Register now')
    await POST(req('POST', `/api/dictionary/${key}`, { value: 'original', author: 'Z', revisionId: 'c1' }))
    await POST(req('POST', `/api/dictionary/${key}`, { value: 'wrong register', author: 'A', revisionId: 'c2', baseRevisionId: 'c1' }))
    await POST(req('POST', `/api/dictionary/${key}`, { value: 'original', author: 'Z', revisionId: 'c3', baseRevisionId: 'c2', kind: 'revert', revertOf: 'c1' }))

    const body = await (await GET(req('GET', `/api/dictionary/${key}`))).json()
    expect(body.revisions).toHaveLength(3)
    expect(body.revisions.at(-1).value).toBe('original')
    expect(body.revisions.at(-1).kind).toBe('revert')
    // The wrong value is still there. That is the point: history records what happened.
    expect(body.revisions[1].value).toBe('wrong register')
  })

  it('stores no value for a new-row request that sends none', async () => {
    const { POST } = await dictKeyApi()
    const res = await POST(req('POST', `/api/dictionary/${encodeKey('Untranslated thing')}`, { author: 'Z', kind: 'new-row' }))
    expect(res.status).toBe(201)
    expect((await res.json()).revision.value).toBe('')
  })

  // The Page tab's class-C write path, at the only layer that can lose it silently. The editor
  // sends `new-row` for any string with no wordlist row, and the reviewer's translation rides
  // on that request; the handler used to overwrite `value` with `''` on the kind alone, answer
  // 201, and store a revision of nothing. Nothing errored, the row appeared in the panel with
  // the author's name on it, and the value was gone.
  it('stores the value on a new-row request that carries one', async () => {
    const { POST, GET } = await dictKeyApi()
    const key = encodeKey('A string with no wordlist row at all')
    const res = await POST(req('POST', `/api/dictionary/${key}`, {
      value: 'كرو', author: 'Z', kind: 'new-row', revisionId: 'n1',
    }))
    expect(res.status).toBe(201)
    // Read it back rather than trusting the response body: the store is what the sync reads.
    const body = await (await GET(req('GET', `/api/dictionary/${key}`))).json()
    expect(body.revisions).toHaveLength(1)
    expect(body.revisions[0].value).toBe('كرو')
    expect(body.revisions[0].kind).toBe('new-row')
  })
})

describe('mojibake', () => {
  it('is refused by the SERVER, so a bad client cannot corrupt the corpus', async () => {
    const { POST } = await dictKeyApi()
    // UTF-8 Arabic read as latin-1 — the classic broken-export shape.
    const res = await POST(req('POST', `/api/dictionary/${encodeKey('Register now')}`, {
      value: 'Ø§Ù„Ø±Ø¶Ø§', author: 'Z',
    }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.findings[0].kind).toBe('utf8-as-latin1')
    // Nothing reached the store.
    expect(await history(store, 'Register now')).toHaveLength(0)
  })

  it('refuses replacement characters too', async () => {
    const { POST } = await dictKeyApi()
    const res = await POST(req('POST', `/api/dictionary/${encodeKey('Register now')}`, { value: 'ال�ضا', author: 'Z' }))
    expect(res.status).toBe(422)
    expect(await history(store, 'Register now')).toHaveLength(0)
  })

  it('accepts legitimate Lisan al-Dawat with bidi marks and Latin loanwords', async () => {
    const { POST } = await dictKeyApi()
    const res = await POST(req('POST', `/api/dictionary/${encodeKey('Register now')}`, {
      value: '‏میقات ITS نمبر', author: 'Z',
    }))
    expect(res.status).toBe(201)
  })
})
