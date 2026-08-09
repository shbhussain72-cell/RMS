/**
 * GET /api/cron/sync-wordlist   the scheduled run
 *
 * Vercel's scheduler invokes cron paths with GET and sends `Authorization: Bearer $CRON_SECRET`.
 * That is why this exists as its own path rather than as a branch inside
 * `/api/sync-wordlist`: a GET that commits to a repository when it recognises its caller is a
 * GET that commits on a link preview, a prefetch or an uptime check the day the recognition
 * is wrong. The mutating verb stays on POST, and the one GET that mutates is this one, which
 * refuses to run without the secret.
 *
 * `CRON_SECRET` must be set. If it is not, this returns 500 rather than running unauthenticated —
 * an unset secret is a configuration mistake, and treating it as "no check required" would turn
 * that mistake into a publicly callable commit endpoint.
 *
 * The schedule is in `vercel.json`. The work is in `api/_lib/runSync.ts`; read its header first.
 */
import { fail, handler, json, route } from '../_lib/http.js'
import { runSync } from '../_lib/runSync.js'

export const GET = handler(async (request) => {
  const secret = process.env.CRON_SECRET
  if (!secret) return fail(500, 'CRON_SECRET is not set — the scheduled sync will not run without it')
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return fail(401, 'not found')

  // Never forced. A run nobody is watching must not be the one that rewrites a fifth of the
  // wordlist; crossing that line is a decision for a person who can see the diff.
  const { status, httpStatus } = await runSync({ trigger: 'cron', force: false })
  return json({ status }, httpStatus)
})

/** Both shapes, one source of truth — see `route` in `_lib/http.ts`. */
export default route({ GET })
