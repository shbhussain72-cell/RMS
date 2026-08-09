/**
 * GET  /api/sync-wordlist   what the last run did — read-only
 * POST /api/sync-wordlist   run the sync now
 *
 * The work, the rails and the reasons all live in `api/_lib/runSync.ts`. Read its header
 * before changing anything here, and especially before reaching for `XLSX.writeFile`.
 *
 * ── WHY GET DOES NOT RUN ANYTHING ────────────────────────────────────────────────────
 *
 * Vercel's scheduler invokes cron paths with GET, which makes it tempting to have one GET
 * that syncs when it recognises the scheduler and reports when it does not. That endpoint
 * would commit to a repository from a browser prefetch, a link preview, or an uptime check.
 * The cron gets its own path — `api/cron/sync-wordlist.ts` — and this GET stays a read.
 *
 * The perimeter is Vercel Deployment Protection, the same as every other endpoint here. This
 * is not an auth system and is not presented as one.
 */
import { handler, json, readJson, route } from './_lib/http.js'
import { lastStatus, runSync } from './_lib/runSync.js'

export const GET = handler(async () => json({ status: await lastStatus() }))

export const POST = handler(async (request) => {
  const body = await readJson(request).catch(() => ({}) as Record<string, unknown>)
  const { status, httpStatus } = await runSync({ trigger: 'manual', force: body.force === true })
  return json({ status, changed: status.updated.length + status.appended.length }, httpStatus)
})

/** Both shapes, one source of truth — see `route` in `_lib/http.ts`. */
export default route({ GET, POST })
