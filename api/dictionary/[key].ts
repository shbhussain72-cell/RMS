/**
 * GET  /api/dictionary/:key    every revision for one key, oldest first
 * POST /api/dictionary/:key    append a revision
 *
 * `:key` is the base64url of the English string, not the string itself. Dictionary keys are
 * arbitrary English text — spaces, apostrophes, sometimes a slash — and a percent-encoded
 * slash in a pathname is decoded inconsistently across proxies. Encoding it removes the
 * question entirely, and stays reversible so the store is readable in the blob browser.
 *
 * ── APPEND, ALWAYS ───────────────────────────────────────────────────────────────────
 *
 * The revision is written BEFORE the conflict is reported, and it is written whether or not
 * the base was stale. A 409 here does not mean "your edit was rejected" — it means "your
 * edit is saved AND someone else's is too, go look". Anyone can edit translations now,
 * including into the wrong register; overwrite-in-place would leave a wrong value and no
 * trace of the right one.
 *
 * ── MOJIBAKE IS REFUSED HERE, NOT ONLY IN THE UI ─────────────────────────────────────
 *
 * The client guard is the good error message. This is the one that actually protects the
 * corpus, because it is the only one a bad request cannot skip. Same detector as the editor
 * imports — one definition, not a copy that drifts.
 */
import { BadRequest, fail, handler, json, newId, oneOf, optStr, readJson, route, safeId, segmentAfter, str } from '../_lib/http.js'
import { appendRevision, decodeKey, history, type Revision } from '../_lib/records.js'
import { storeFromEnv } from '../_lib/store.js'
import { detectByteDamage } from '../../src/dev/mojibake.mjs'

function keyOf(request: Request): string {
  const raw = segmentAfter(request, 'dictionary')
  if (!raw) throw new BadRequest('missing key')
  let key: string
  try {
    key = decodeKey(raw)
  } catch {
    throw new BadRequest('key must be base64url of the English string')
  }
  if (!key.trim()) throw new BadRequest('key must not be empty')
  if (key.length > 500) throw new BadRequest('key must be at most 500 characters')
  return key
}

export const GET = handler(async (request) =>
  json({ key: keyOf(request), revisions: await history(storeFromEnv(), keyOf(request)) }))

export const POST = handler(async (request) => {
  const key = keyOf(request)
  const body = await readJson(request)
  const kind = body.kind === undefined ? 'edit' : oneOf(body, 'kind', ['edit', 'revert', 'new-row'] as const)

  // `new-row` says "this key has no row in the sheet yet". It does NOT say "and no value was
  // typed" — the two used to be conflated here, and the value was thrown away unconditionally.
  // The editor sends this kind for every class-C string, so a reviewer typing a translation for
  // a string with no wordlist row got a 201, a revision, and an empty cell: the one write path
  // the Page tab needs most, silently discarding its payload.
  //
  // The value stays OPTIONAL, because the blank form is a real request with its own meaning —
  // `scripts/emit-blank-rows.mjs` asks for a row to be created so a gap is visible in the
  // spreadsheet. Omitting `value` still stores `''`, and `syncPlan` still declines to write a
  // blank cell, which would be indistinguishable from an untranslated row.
  const value = kind === 'new-row' ? (optStr(body, 'value', 2000) ?? '') : str(body, 'value', 2000)

  const findings = detectByteDamage(value)
  if (findings.length) {
    return fail(422, 'the value looks like mis-decoded text and was not saved', {
      findings: findings.map((f) => ({ kind: f.kind, sample: f.sample, detail: f.detail })),
    })
  }

  const rev: Omit<Revision, 'createdAt'> = {
    revisionId: safeId(optStr(body, 'revisionId', 64) ?? newId(), 'revisionId'),
    key,
    value,
    author: str(body, 'author', 80),
    kind,
    ...(optStr(body, 'note', 500) ? { note: optStr(body, 'note', 500) } : {}),
    ...(optStr(body, 'baseRevisionId', 64) ? { baseRevisionId: safeId(optStr(body, 'baseRevisionId', 64)!, 'baseRevisionId') } : {}),
    ...(optStr(body, 'revertOf', 64) ? { revertOf: safeId(optStr(body, 'revertOf', 64)!, 'revertOf') } : {}),
  }

  const { revision, conflictWith } = await appendRevision(storeFromEnv(), rev)
  if (conflictWith) {
    return json({ revision, conflictWith, error: 'conflict' }, 409)
  }
  return json({ revision }, 201)
})

/** Both shapes, one source of truth — see `route` in `_lib/http.ts`. */
export default route({ GET, POST })
