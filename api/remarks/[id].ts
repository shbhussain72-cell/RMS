/**
 * PATCH /api/remarks/:id   edit the text, or resolve / reopen
 *
 * There is no DELETE, and there will not be one. Status is the only way a remark leaves the
 * list, and a filter brings it back — with no auth and six reviewers, an irreversible action
 * one misclick away is not acceptable.
 *
 * `If-Match` carries the etag the client last read. A mismatch returns 409 with the current
 * record so the loser of the race sees what they would have overwritten, rather than
 * overwriting it.
 */
import { fail, handler, json, oneOf, optStr, readJson, route, safeId, segmentAfter, str } from '../_lib/http.js'
import { Conflict, NotFound, patchRemark } from '../_lib/records.js'
import { storeFromEnv } from '../_lib/store.js'

export const PATCH = handler(async (request) => {
  const raw = segmentAfter(request, 'remarks')
  if (!raw) return fail(400, 'missing id')
  const id = safeId(raw, 'id')
  const body = await readJson(request)
  const patch = {
    author: str(body, 'author', 80),
    ...(body.remark !== undefined ? { remark: str(body, 'remark', 4000) } : {}),
    ...(body.status !== undefined ? { status: oneOf(body, 'status', ['open', 'resolved'] as const) } : {}),
  }
  try {
    const etag = request.headers.get('if-match') ?? optStr(body, 'etag', 200)
    return json({ remark: await patchRemark(storeFromEnv(), id, patch, etag ?? undefined) })
  } catch (err) {
    if (err instanceof NotFound) return fail(404, 'remark not found')
    if (err instanceof Conflict) return fail(409, 'conflict', err.detail)
    throw err
  }
})

/** Both shapes, one source of truth — see `route` in `_lib/http.ts`. */
export default route({ PATCH })
