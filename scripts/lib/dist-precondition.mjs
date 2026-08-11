/**
 * dist-precondition.mjs — a suite that reads `dist/` must know what `dist/` is.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────────────
 *
 * `check-chrome` printed `ok` twice on 11 Aug and `FAIL` twice an hour later. Nothing in the
 * suite changed and nothing in the app it tests changed. `dist/` was rebuilt in between.
 *
 * It had been broken since `5af517d`, which changed the LSD `Logout` string that suite matches
 * on. For four days it went on passing, because it runs `vite preview` against a directory
 * nobody had rewritten. Its verdict was true — of a bundle that no longer described the code.
 *
 * That is a THIRD property, distinct from the two the arrival audit already tracks:
 *
 *   assertion shape   would it pass on a page it never reached
 *   completes         does the process reach a verdict at all
 *   fresh             is the verdict about the code as it is now
 *
 * A stale green is the worst of the three. A suite that cannot run gets noticed eventually;
 * a suite that passes against last week's bundle is indistinguishable from a suite that works,
 * and the more reliable it looks the longer it lasts.
 *
 * ── WHY mtime AND NOT A CONTENT HASH ─────────────────────────────────────────────────
 *
 * Taken from `check-mirror`, which already applies this reasoning to the bidi census, for the
 * same reason and with the same trade-off:
 *
 * A hash looks more rigorous and answers a different question. The question is not "is the
 * source identical to what was built" — it is "was this built AFTER the thing it is built
 * from", and an ordering question is answered by an ordering comparison. mtime is not an
 * approximation of the hash; it is the direct form of the property.
 *
 * A hash is also strictly worse in both directions here. It cannot tell you which of two
 * differing trees came first, so it cannot distinguish a stale bundle from one built against a
 * tree that has since been reverted — and a revert is exactly when you want a rebuild, because
 * nothing ever ran against the tree in between. And it costs a walk plus a read of every file
 * to answer what two stat calls already answer.
 *
 * The failure mode of mtime is a clock going backwards or a checkout that rewrites timestamps,
 * both of which cause a rebuild: noisy in the safe direction. The failure mode of no check at
 * all is what shipped.
 *
 * ── BUILD OR REFUSE, NEVER GUESS ─────────────────────────────────────────────────────
 *
 * Two ways to satisfy the precondition and the caller picks:
 *
 *   build: true    build one now. Right for a suite you run on its own — the reason
 *                  `check-review-tools` crashed is that it needed a flag-on `dist/`, said so
 *                  only in a comment, and left the reader to arrange it.
 *   build: false   assert and exit non-zero with the command to run. Right for
 *                  `check-dev-only`, which runs as the last step of `npm run build` and would
 *                  otherwise recurse into the build that invoked it.
 *
 * What is NOT on offer is carrying on against a stale bundle with a warning. A warning in the
 * middle of forty lines of `ok` is the same as no warning.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const DIST = resolve(ROOT, 'dist')

/**
 * Everything a rebuild would pick up.
 *
 * `src/` is the bulk of it. The four others are named individually because each one changes the
 * emitted bundle and none of them lives under src/: the HTML entry, the bundler config, and the
 * two CSS pipelines. `package.json` is deliberately NOT here — a version bump or a script edit
 * changes it constantly and would force a rebuild before every run, and a dependency change
 * that matters shows up as a changed lockfile *and* a changed import somewhere in src/.
 */
const SOURCES = ['src', 'index.html', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js']

/** The mtime of the most recently touched build input. Cached; the answer cannot change mid-run. */
let newestSrc = null
export function newestSourceMtime() {
  if (newestSrc !== null) return newestSrc
  newestSrc = 0
  for (const entry of SOURCES) {
    const p = resolve(ROOT, entry)
    if (!existsSync(p)) continue
    if (statSync(p).isFile()) { newestSrc = Math.max(newestSrc, statSync(p).mtimeMs); continue }
    for (const rel of readdirSync(p, { recursive: true })) {
      const s = statSync(join(p, String(rel)))
      if (s.isFile() && s.mtimeMs > newestSrc) newestSrc = s.mtimeMs
    }
  }
  return newestSrc
}

/**
 * The mtime of the OLDEST emitted bundle file, not the newest.
 *
 * A rebuild rewrites every chunk, so oldest and newest are the same moment for a clean build.
 * They diverge when a build was interrupted or when files were copied in over an existing
 * dist/, and in that case the oldest is the one that tells the truth about what is being
 * served. Taking the newest would let one freshly-written chunk vouch for a directory of stale
 * ones.
 */
export function distMtime() {
  const assets = resolve(DIST, 'assets')
  if (!existsSync(assets)) return null
  let oldest = Infinity
  for (const name of readdirSync(assets)) {
    const s = statSync(join(assets, name))
    if (s.isFile() && s.mtimeMs < oldest) oldest = s.mtimeMs
  }
  return oldest === Infinity ? null : oldest
}

/**
 * Was `dist/` built with VITE_REVIEW_TOOLS on? MEASURED, not recorded.
 *
 * A stamp file written at build time would be a claim about the bundle sitting next to the
 * bundle, and it would survive a hand-edit, a partial copy or a build that failed after writing
 * it. This is a string literal that ships exactly when the review tooling does, and it is on
 * `check-dev-only`'s review-only list — so the two agree by construction rather than by both
 * being maintained.
 *
 * ── THE MARKER MUST BELONG TO THE GATE, NOT TO A FEATURE ─────────────────────────────
 *
 * It was `data-remark-chrome`. Remarks was retired on 11 Aug and stopped being mounted, so that
 * literal vanished from a flag-ON build — and this function started reporting every review build
 * as flag-off. `check-gate` then failed its flag-on half with "dist/ was built without
 * VITE_REVIEW_TOOLS", which is a true sentence about a false premise and points at the build
 * rather than at the marker.
 *
 * `data-devdock` is the shell EVERY dev dock mounts into — coverage, dictionary, notes — so it
 * survives any one of them being replaced. A marker tied to one feature has the lifetime of that
 * feature, which is not the lifetime of the flag it is standing in for.
 */
const REVIEW_MARKER = 'data-devdock'

export function distHasReviewTools() {
  const assets = resolve(DIST, 'assets')
  if (!existsSync(assets)) return false
  return readdirSync(assets)
    .filter((n) => n.endsWith('.js'))
    .some((n) => readFileSync(join(assets, n), 'utf8').includes(REVIEW_MARKER))
}

const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)

/**
 * Why the current `dist/` does not satisfy the request, or null if it does.
 *
 * Pure over three inputs so it can be tested without building anything — which matters, because
 * a freshness check that is wrong in the lenient direction reinstates the exact bug it was
 * written for, and would do it silently.
 */
export function staleReason({ dist, src, hasTools, wantTools }) {
  if (dist === null) return 'dist/ has no assets — nothing has been built'
  if (src > dist) return `dist/ predates its sources (built ${iso(dist)}, newest source ${iso(src)})`
  if (wantTools !== null && hasTools !== wantTools) {
    return wantTools
      ? 'dist/ was built without VITE_REVIEW_TOOLS, and this suite tests the review tooling'
      : 'dist/ was built WITH VITE_REVIEW_TOOLS, and this suite asserts that tooling is absent'
  }
  return null
}

/**
 * Make `dist/` fit to test against, or say plainly why it is not and stop.
 *
 * @param {object}  opts
 * @param {boolean|null} opts.reviewTools  required flag state; null means either will do
 * @param {boolean} opts.build             build one when the precondition fails
 * @param {string}  opts.suite             name, for the message
 * @returns {boolean} true when the precondition holds
 */
export function ensureDist({ reviewTools = null, build = true, suite = 'this suite' } = {}) {
  const check = () => staleReason({
    dist: distMtime(), src: newestSourceMtime(), hasTools: distHasReviewTools(), wantTools: reviewTools,
  })

  let why = check()
  if (!why) return true

  if (!build) {
    console.error(`\n  ${suite} reads dist/, and ${why}.`)
    console.error(`  Run \`${reviewTools ? 'VITE_REVIEW_TOOLS=true ' : ''}npm run build\` first.\n`)
    return false
  }

  console.log(`  dist/ rebuilt: ${why}`)
  // `null` means the suite does not care, so the ambient environment is left exactly as it is.
  // Deleting the flag on `null` would make a caller that expressed no opinion quietly force one,
  // which is how a "don't care" turns into a silent requirement nobody wrote down.
  const env = { ...process.env }
  if (reviewTools === true) env.VITE_REVIEW_TOOLS = 'true'
  else if (reviewTools === false) delete env.VITE_REVIEW_TOOLS
  // `vite build` and not `npm run build`: the npm script ends by running check-dev-only, which
  // is itself one of the callers here, and a precondition that re-enters its own consumer is a
  // loop. `tsc -b` is skipped for the same reason it is skipped by every other suite that
  // builds — these check the emitted bundle, and a type error will have failed the real build.
  const r = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, shell: true, stdio: 'inherit', env })
  if (r.status !== 0) {
    console.error(`\n  ${suite}: vite build failed (${r.status}) — cannot test against dist/\n`)
    return false
  }

  // Re-measured, never assumed. "I ran the build" and "there is now a fresh bundle with the
  // right flag in it" are two statements, and this file exists because the second one is the
  // only one worth acting on.
  newestSrc = null
  why = check()
  if (why) {
    console.error(`\n  ${suite}: built dist/ and it still does not qualify — ${why}\n`)
    return false
  }
  return true
}
