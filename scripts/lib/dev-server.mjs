/**
 * dev-server.mjs — start a `vite dev` for a suite, and make the review flag impossible to forget.
 *
 * ── THE DEFECT THIS EXISTS FOR, THREE TIMES ──────────────────────────────────────────
 *
 * `VITE_REVIEW_TOOLS` gates every dev widget. A suite that spawns the dev server without it gets
 * an app where each of those widgets renders `null` — and then fails on a locator timeout, or on
 * a count of zero, naming the widget. The cause is a missing word in the spawn line; the symptom
 * is a regression report about the feature.
 *
 *   06a8704   check-remarks    the panel rendered null for two days; four assertions of 76 ran
 *   11 Aug    check-notes      written flag-first, precisely because of the above
 *   12 Aug    check-devdock    "no dev dock rendered on the dev server", found by the sweep —
 *                              and it had been unable to pass for as long as it had existed
 *
 * Three times is not carelessness, it is a missing seam. The env is in the SPAWN, which is the
 * one part of a suite nobody re-reads: it is boilerplate, it is identical in nine files, and it
 * sits a hundred lines above the assertion that fails because of it.
 *
 * ── WHY THE FLAG IS REQUIRED AND NOT DEFAULTED ───────────────────────────────────────
 *
 * `startDev` throws unless the caller states `reviewTools: true` or `false`. Defaulting it either
 * way would be wrong in seven of the nine suites one way or the other:
 *
 *   true   check-devdock, check-dictionary — they test the tooling; without it there is nothing
 *   false  check-bidi, check-deeplink, check-font-fallback, check-lsd-clip, check-mirror,
 *          check-numerals, check-tour — they measure the APP, and three fixed-position docks over
 *          every screen would put dev chrome into a bidi census, a clipping scan and a tour
 *          overlay's click targets
 *
 * So the mistake worth preventing is not "chose wrong", it is "did not choose". A required
 * argument makes the decision visible at the call site, which is where the next reader is, and
 * turns a forgotten env var into a thrown error at the first line of the run rather than a
 * timeout thirty seconds in. `ensureDist({ reviewTools })` has the same shape for the same reason.
 *
 * `false` DELETES the variable rather than leaving the ambient one alone: a suite that measures
 * the app must measure the same app whether or not the person running it happens to have the flag
 * exported. Inheriting it is how a green local run and a red CI run differ for reasons neither
 * output mentions.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────────────
 *
 * It does not own teardown. The nine callers still kill their own server, and `preview-server.mjs`
 * documents why that is a hazard on Windows — a shell-spawned vite orphans its child, and the
 * piped stdout then holds the event loop open with no work left. All nine currently reach their
 * own summary and exit, so this is a known risk that is not currently biting, and migrating nine
 * teardowns is a change with its own verification rather than a line in this one.
 */
import { spawn } from 'node:child_process'
import { clearPort } from './preview-server.mjs'

/**
 * The environment for a dev server, or a throw.
 *
 * Separated from the spawn so the decision itself is testable — `dev-server.test.mjs` asserts that
 * omitting the flag throws, which is the whole mechanism, and it should not need a browser or a
 * port to assert it.
 */
export function devEnv(reviewTools, base = process.env) {
  if (reviewTools !== true && reviewTools !== false) {
    throw new Error(
      'startDev needs reviewTools: true or false. It is required, not defaulted, because three '
      + 'suites have now spawned a dev server without VITE_REVIEW_TOOLS and read the resulting '
      + 'null render as a regression — see scripts/lib/dev-server.mjs.',
    )
  }
  const env = { ...base }
  if (reviewTools) env.VITE_REVIEW_TOOLS = 'true'
  else delete env.VITE_REVIEW_TOOLS
  return env
}

/**
 * Start `vite dev` on `port` and resolve once it is answering.
 *
 * The readiness wait is the same one all nine suites had written out: watch both streams for the
 * port, then a settle. It is here rather than there so that the next suite gets it, and so that
 * `--strictPort` keeps meaning "fail rather than move quietly" without each file re-deciding it.
 *
 * @param {number} port
 * @param {{ cwd: string, reviewTools: boolean, settleMs?: number, timeoutMs?: number }} opts
 */
export async function startDev(port, { cwd, reviewTools, settleMs = 1500, timeoutMs = 60_000 } = {}) {
  const env = devEnv(reviewTools)
  clearPort(port)
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env,
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('dev server did not start')), timeoutMs)
    const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, settleMs) } }
    proc.stdout.on('data', w)
    proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
  })
  return proc
}
