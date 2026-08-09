/**
 * GET /api/dictionary   the CURRENT value of every overridden key
 *
 * One record per key — the latest revision under that key's prefix. History is per-key and
 * lives at /api/dictionary/:key, because a reviewer wants the current wordlist here and the
 * story of one string there.
 */
import { handler, json, route } from '../_lib/http.js'
import { currentOverrides } from '../_lib/records.js'
import { storeFromEnv } from '../_lib/store.js'

export const GET = handler(async () => json({ overrides: await currentOverrides(storeFromEnv()) }))

/** Both shapes, one source of truth — see `route` in `_lib/http.ts`. */
export default route({ GET })
