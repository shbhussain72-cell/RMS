/**
 * GET  /api/remarks   list every remark, open and resolved
 * POST /api/remarks   create one
 *
 * The list returns resolved remarks too. "Delete" here means resolve-and-hide, and hiding is
 * the CLIENT's filter — if the server dropped them, the filter that brings them back would
 * have nothing to bring back, and the soft delete would be a hard one with extra steps.
 */
import { handler, json, readJson, str, optStr, oneOf, safeId, newId } from '../_lib/http'
import { createRemark, listRemarks, type SharedRemark } from '../_lib/records'
import { storeFromEnv } from '../_lib/store'

export const GET = handler(async () => json(await listRemarks(storeFromEnv())))

export const POST = handler(async (request) => {
  const body = await readJson(request)
  const now = new Date().toISOString()
  const rec: SharedRemark = {
    // A client-supplied id is accepted so the offline outbox can retry the SAME record
    // without creating duplicates, and so a pre-shared local remark keeps its identity when
    // it is pushed up. It is validated as a pathname segment, not trusted as given.
    id: safeId(optStr(body, 'id', 64) ?? newId(), 'id'),
    remark: str(body, 'remark', 4000),
    author: str(body, 'author', 80),
    status: 'open',
    route: str(body, 'route', 300),
    routePattern: optStr(body, 'routePattern', 300) ?? str(body, 'route', 300),
    lang: oneOf(body, 'lang', ['en', 'lsd'] as const),
    dir: oneOf(body, 'dir', ['ltr', 'rtl'] as const),
    viewportWidth: Math.max(0, Math.min(10000, Number(body.viewportWidth) || 0)),
    identifiers: (body.identifiers && typeof body.identifiers === 'object' ? body.identifiers : {}) as Record<string, unknown>,
    capturedStrategy: optStr(body, 'capturedStrategy', 40) ?? 'structural',
    createdAt: optStr(body, 'createdAt', 40) ?? now,
    updatedAt: now,
    ...(optStr(body, 'importedFrom', 80) ? { importedFrom: optStr(body, 'importedFrom', 80) } : {}),
  }
  return json({ remark: await createRemark(storeFromEnv(), rec) }, 201)
})
