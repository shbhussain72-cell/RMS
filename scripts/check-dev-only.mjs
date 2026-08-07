/**
 * check-dev-only.mjs — build-gating assertions for dev-only tooling.
 *
 *   node scripts/check-dev-only.mjs        (runs as the last step of `npm run build`)
 *
 * ── WHY THIS IS IN THE BUILD AND NOT THE TEST SUITE ──────────────────────────────────
 *
 * The Remarks tool shipped into the production bundle once. The cause was a DEFAULT
 * PARAMETER — `adapter = localStorageAdapter` — which is evaluated on every call, and the
 * component holding it is called in production because it renders the app's children. That
 * one reference kept the whole storage module alive through tree-shaking.
 *
 * Nothing about it looked wrong. `tsc` passed, the build passed, the dev gate was present and
 * correct, and reading the diff told you nothing. It was found by grepping `dist/`.
 *
 * That pattern can recur anywhere in dev-gated code — a default parameter, a module-level
 * constant, a re-export, an `export *` — and it will look equally fine every time. So the
 * grep is a build step rather than a test: a test can be skipped, and this one is only useful
 * if it runs on the artefact that is about to be deployed.
 *
 * Two assertions:
 *
 *   1. FORBIDDEN STRINGS — no dev-only identifier appears in dist/.
 *      With a CONTROL: a string that MUST be present. Without it, a grep that silently
 *      stopped working (wrong path, renamed output, empty dist) would report a clean pass,
 *      which is the worst possible failure for a check like this.
 *
 *   2. ROUTE TABLE DRIFT — src/remarks/routes.ts still matches src/App.tsx.
 *      Duplicating the route table is only safe if the guard cannot be skipped. It also
 *      exists in the vitest suite, where it gives a better failure message; here it is
 *      unskippable. A duplicated table that silently drifts degrades remark grouping in a
 *      way nobody notices until the handoff document comes out wrong.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')

let failures = 0
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++ }
const pass = (msg) => console.log(`  ok    ${msg}`)

// ── 1. dist/ must not contain dev-only tooling ───────────────────────────────────────
/**
 * Substrings that only exist in dev-only code. `remark` is deliberately the bare word: it is
 * the strongest form of the check, and if a legitimate product feature ever uses that word in
 * shipped copy this line should be narrowed CONSCIOUSLY rather than silently weakened.
 */
const FORBIDDEN = [
  'remark',
  'rms-remarks',
  'data-remark-chrome',
  'data-rmk',
  'Orphan fixture',
  'capturedStrategy',
  '__lsdScan',
]
/** Must be present. Proves the search is actually looking at the built app. */
const CONTROL = 'Ashara'

function bundleFiles() {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|css|html)$/.test(name)) out.push(p)
    }
  }
  walk(DIST)
  return out
}

try {
  statSync(DIST)
} catch {
  console.error('  FAIL  dist/ does not exist — run this after `vite build`.')
  process.exit(1)
}

const files = bundleFiles()
if (files.length === 0) fail('dist/ contains no js/css/html — the grep would pass vacuously')

const contents = files.map((f) => ({ f, text: readFileSync(f, 'utf8') }))

// The control first: if it fails, every "absent" result below is meaningless.
if (!contents.some(({ text }) => text.includes(CONTROL))) {
  fail(`control string "${CONTROL}" not found in dist/ — the search is not reliable, so the `
    + 'absence results below prove nothing. Fix the control before trusting this check.')
} else {
  pass(`control "${CONTROL}" present (search is reliable)`)
}

for (const needle of FORBIDDEN) {
  const hits = contents.filter(({ text }) => text.includes(needle))
  if (hits.length) {
    fail(`dev-only string "${needle}" shipped to production, in: ${hits.map((h) => h.f.replace(ROOT, '.')).join(', ')}`)
    console.error('        Likely cause: a reference evaluated OUTSIDE the `import.meta.env.DEV`')
    console.error('        guard — a default parameter, a module-level const, or a re-export.')
    console.error('        Move it behind the early return so the bundler can drop the module.')
  } else {
    pass(`"${needle}" absent from dist/`)
  }
}

// ── 2. the duplicated route table has not drifted ────────────────────────────────────
const app = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
const inApp = [...new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p !== '*')
  .sort()

const routesSrc = readFileSync(resolve(ROOT, 'src/remarks/routes.ts'), 'utf8')
const block = routesSrc.match(/ROUTE_PATTERNS\s*=\s*\[([\s\S]*?)\]\s*as const/)
if (!block) {
  fail('could not parse ROUTE_PATTERNS out of src/remarks/routes.ts')
} else {
  const inRoutes = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
  const missing = inApp.filter((p) => !inRoutes.includes(p))
  const extra = inRoutes.filter((p) => !inApp.includes(p))
  if (missing.length || extra.length) {
    fail('src/remarks/routes.ts has drifted from src/App.tsx')
    if (missing.length) console.error(`        missing (in App.tsx, not in routes.ts): ${missing.join(', ')}`)
    if (extra.length) console.error(`        stale   (in routes.ts, not in App.tsx): ${extra.join(', ')}`)
  } else {
    pass(`route table in step with App.tsx (${inApp.length} routes)`)
  }
}

if (failures) {
  console.error(`\n${failures} dev-only assertion(s) failed — the build output is not shippable.`)
  process.exit(1)
}
console.log(`\nall dev-only assertions passed (${files.length} bundle files scanned)`)
