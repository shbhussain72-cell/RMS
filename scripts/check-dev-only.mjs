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
 * ── THE FLAG HAS TWO STATES AND THIS CHECKS BOTH ────────────────────────────────────
 *
 * The review tooling is gated on VITE_REVIEW_TOOLS (see src/reviewTools.ts), not on DEV, so
 * that it can be mounted on the deployed Vercel build. A gate that only ever tests one state
 * is not a gate: asserting "absent" while the flag happens to be off would pass identically
 * on a build where the flag no longer does anything at all. So this script reads the same
 * flag the bundle was built with and flips the assertion with it — absent when off, PRESENT
 * when on. `npm run check:gate` builds both ways and runs it against each.
 *
 * Three assertions:
 *
 *   1. FORBIDDEN STRINGS — no dev-only identifier appears in dist/.
 *      With a CONTROL: a string that MUST be present. Without it, a grep that silently
 *      stopped working (wrong path, renamed output, empty dist) would report a clean pass,
 *      which is the worst possible failure for a check like this.
 *
 *   1b. REVIEW-TOOL STRINGS — absent with the flag off, present with it on. The second half
 *      is what proves the flag is still wired to anything.
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
  // Server-only secrets and flags. `BLOB_READ_WRITE_TOKEN` is the storage credential and must
  // never be within reach of a browser; `REVIEW_API` is the server-side gate. Neither carries
  // the `VITE_` prefix, so Vite cannot inline them — this asserts the outcome of that rather
  // than trusting the naming convention, because the convention is one careless rename away.
  'BLOB_READ_WRITE_TOKEN',
  'REVIEW_API',
  'blob.vercel-storage.com',
  // `xlsx` moved to dependencies so the export FUNCTION can import it. It is imported only
  // under /api and must not follow the dependency move into the client bundle — it is ~400kB
  // and has no business shipping to a phone. `sheet_to_json` is one of its exported names.
  'sheet_to_json',
  'SheetJS',
  // The file-based override path: a dev-server endpoint that does not exist on Vercel. The
  // editor no longer uses it — it writes revisions to the shared store — so these must be
  // absent from EVERY built artefact, review flag or not.
  //
  // `/__lsd/overrides` rather than `wordlist-overrides`: the latter appears in client source
  // only inside COMMENTS, which the build strips, so that grep could never have failed. It
  // was three releases of a green tick for a search with no possible subject. The endpoint
  // path is a real string literal in `src/dev/overrides.ts`, so its absence means the module
  // did not ship.
  '/__lsd/overrides',
  '__lsdOverrides',
  '__lsd/patch',
  // The wordlist sync's server-side configuration. None of these carries a `VITE_` prefix, so
  // Vite cannot inline them — this asserts the outcome of that convention rather than trusting
  // it, because a convention is one careless rename away. `WORDLIST_SYNC_TOKEN` is a
  // fine-grained GitHub PAT with `contents:write` on one repository: it can rewrite the source
  // of truth for every translation in the app, and it must never be within reach of a browser.
  'WORDLIST_SYNC_TOKEN',
  'WORDLIST_REPO',
  'WORDLIST_BRANCH',
  'WORDLIST_PATH',
  'CRON_SECRET',
  // The GitHub host, as a literal in `api/_lib/github.ts`. If that module ever followed an
  // import into the client bundle, the token-shaped code would come with it.
  'api.github.com',
]

/**
 * Strings that belong to the review tooling: absent when VITE_REVIEW_TOOLS is off, PRESENT
 * when it is on.
 *
 * `remark` is deliberately the bare word: it is the strongest form of the check, and if a
 * legitimate product feature ever uses that word in shipped copy this line should be narrowed
 * CONSCIOUSLY rather than silently weakened. `devtools.pos.v1` and `data-devdock` are here
 * because DevDock is the shared toolbar both panels mount into — it ships exactly when they do.
 *
 * ── EVERY ENTRY MUST BE A STRING LITERAL OR A PROPERTY NAME ──────────────────────────
 *
 * Never a function or variable name. The build minifies identifiers, so `detectMojibake` —
 * which sat on the FORBIDDEN list above for three releases — was absent from every bundle
 * whether the code shipped or not. Moving the editor onto the review flag was supposed to make
 * that line fail until it was reclassified; it passed, because the grep was reading the
 * mangler rather than the bundle. Same shape as `PINNED` reading `position: sticky`:
 * an assertion that cannot fail in the situation it exists for.
 *
 * `lone-surrogate` and `utf8-as-latin1` replace it. They are `ByteDamageFinding.kind` values —
 * string literals, so the minifier has to keep them, and they cannot appear from anywhere else.
 * Verified by building both ways and grepping: absent with the flag off, present with it on.
 *
 * Why each of the strings this rule was written for survives minification:
 *
 *   /__lsd/overrides         a fetch() URL. Argument to a call; nothing may rewrite it.
 *   __lsdOverrides           a PROPERTY name on `window`. Minifiers cannot rename properties
 *                            without whole-program knowledge of every access, so they do not.
 *   __lsd/patch              an `href` attribute value — JSX text, emitted verbatim.
 *   not yet in the wordlist  rendered copy. It has to reach the DOM, so it reaches the bundle.
 *   lone-surrogate           a discriminant value in an object literal, compared with `===`.
 *   utf8-as-latin1           the same.
 *   /api/dictionary          a fetch() URL in `shared/dictionaryApi.ts`. Argument to a call.
 *   [dictionary] a stored…   a module constant in `dev/bootOverrides.ts`, passed to a warn.
 *                            Held as a named constant rather than written inline precisely so
 *                            it is a value in an argument position and cannot be minified.
 *
 * The rule that generates that list: an entry is a value the program CARRIES, never a name the
 * program uses. If you can rename it in the editor without changing behaviour, the minifier can
 * rename it too, and the grep is asserting nothing.
 */
const REVIEW_ONLY = [
  'remark',
  'rms-remarks',
  // The harness's store selector. A `localStorage.getItem` argument, so the minifier cannot
  // touch it — and it must not exist in a production bundle, because a key that selects a
  // browser-local store for remarks is a way to strand a reviewer's notes silently.
  'rms-remarks-adapter',
  'data-remark-chrome',
  'data-rmk',
  'Orphan fixture',
  'capturedStrategy',
  '__lsdScan',
  'devtools.pos.v1',
  'data-devdock',
  // Dictionary editor, now on the review flag: its chrome, and the mojibake detector it calls.
  'not yet in the wordlist',
  'lone-surrogate',
  'utf8-as-latin1',
  // The boot-time override apply, and the shared store it loads.
  //
  // `src/main.tsx` reaches `dev/bootOverrides.ts` through a DYNAMIC import inside
  // `if (REVIEW_TOOLS)`, which is what lets Rollup drop the branch and everything it reaches.
  // A static import at the top of main.tsx would look tidier, would pass tsc, would pass every
  // test, and would ship the dictionary client to every visitor — the same shape as the default
  // parameter that shipped Remarks. Hoisting it is the obvious tidy-up, so it is asserted here
  // rather than left to a comment: with the flag off these must be absent, with it on present.
  '/api/dictionary',
  '[dictionary] a stored override source was unavailable at boot',
]

/** The flag the bundle under test was built with. */
const TOOLS_ON = process.env.VITE_REVIEW_TOOLS === 'true'
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

const present = (needle) => contents.filter(({ text }) => text.includes(needle))

for (const needle of FORBIDDEN) {
  const hits = present(needle)
  if (hits.length) {
    fail(`dev-only string "${needle}" shipped, in: ${hits.map((h) => h.f.replace(ROOT, '.')).join(', ')}`)
    console.error('        Likely cause: a reference evaluated OUTSIDE the `import.meta.env.DEV`')
    console.error('        guard — a default parameter, a module-level const, or a re-export.')
    console.error('        Move it behind the early return so the bundler can drop the module.')
  } else {
    pass(`"${needle}" absent from dist/`)
  }
}

console.log(`
  VITE_REVIEW_TOOLS=${process.env.VITE_REVIEW_TOOLS ?? '(unset)'} — review tooling must be ${TOOLS_ON ? 'PRESENT' : 'ABSENT'}`)
for (const needle of REVIEW_ONLY) {
  const hits = present(needle)
  if (TOOLS_ON && !hits.length) {
    fail(`review-tool string "${needle}" is MISSING from dist/ with the flag on — the flag is `
      + 'no longer wired to this code, or the tool was removed. Absent-when-off proves nothing '
      + 'on its own; this is the half that proves the gate still gates something.')
  } else if (!TOOLS_ON && hits.length) {
    fail(`review-tool string "${needle}" shipped with the flag off, in: ${hits.map((h) => h.f.replace(ROOT, '.')).join(', ')}`)
    console.error('        Likely cause: a reference evaluated OUTSIDE the `REVIEW_TOOLS` guard —')
    console.error('        a default parameter, a module-level const, or a re-export.')
  } else {
    pass(`"${needle}" ${TOOLS_ON ? 'present' : 'absent'} as expected`)
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
