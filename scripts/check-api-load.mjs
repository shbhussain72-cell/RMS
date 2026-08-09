/**
 * check-api-load.mjs — can each deployed Function actually LOAD its own imports?
 *
 *   node scripts/check-api-load.mjs
 *   npm run check:api-load                       (also runs inside `npm run build`)
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ─────────────────────────────────────────────────
 *
 * Every route on the live deployment answered FUNCTION_INVOCATION_FAILED. The runtime log
 * said the same thing for all of them:
 *
 *     ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_lib/…'
 *
 * The handlers deployed. Their imports did not resolve. `package.json` declares
 * `"type": "module"`, so everything Vercel emits under `/var/task` is ESM, and ESM demands a
 * FULLY SPECIFIED relative specifier — `'../_lib/http'` is not a path, `'../_lib/http.js'` is.
 * TypeScript accepted the extensionless form because `moduleResolution: "bundler"` is written
 * for bundlers, and Vercel does not bundle these: it transpiles each file in place and hands
 * the result to Node's ESM loader.
 *
 * Nothing in the repo disagreed, because nothing in the repo ever loaded a Function the way
 * Node loads it. `tsc` resolves modules; it does not import them. `check:api-target` compiles
 * and a compile is not a load. `routes.test.ts` DOES import every route and pass — through
 * vitest, whose resolver is Vite's, which fills in extensions exactly like the bundler the
 * tsconfig is named after. Three green checks, one dead deployment, no contradiction anywhere:
 * every one of them was answering a question about a world the functions do not run in.
 *
 * ── WHAT IT ASSERTS ──────────────────────────────────────────────────────────────────
 *
 * It builds the deployment's layout and imports the routes out of it with Node's own loader.
 * Not "do the specifiers look right" — that is the mechanism, and the mechanism is `.js`
 * suffixes, which is precisely what someone deleting one would also be editing. The subject is
 * whether `import()` returns a module with a callable `fetch`, which is the thing Vercel does.
 *
 * ── THE MODEL, AND THE ONE ASSUMPTION IN IT ──────────────────────────────────────────
 *
 *   api/**.ts   transpiled in place to .js      — proven: the runtime error names `/var/task/
 *                                                 api/_lib/…`, so the graph is walked at run
 *                                                 time, per file, unbundled.
 *   src/**      copied VERBATIM, never compiled — the conservative reading.
 *   package.json copied verbatim               — it is what makes the output ESM.
 *
 * That second line is the whole point. Whether Vercel's TypeScript handling reaches a .ts
 * OUTSIDE `api/` is not observable from this repo, and a check built on a guess about it would
 * be the same mistake one layer down. So the model assumes it does not, which is the only
 * assumption that cannot be wrong in the direction that matters: anything passing here loads
 * under either behaviour. The cost is a real rule — a Function may import from `src/` only what
 * runs as uploaded, meaning `.mjs` and `.json`, never `.ts`. `src/i18n/wordlistNorm.mjs` and
 * `src/dev/mojibake.mjs` are both that shape, and both say so in their headers.
 *
 * ── THE CONTROLS ─────────────────────────────────────────────────────────────────────
 *
 *   1. SUBJECT. The routes are derived from the filesystem, the list is non-empty, and every
 *      one of them was staged. An empty list imports nothing and reports success.
 *   2. FRESH. The staging directory is rebuilt every run. A stale one is example 1 in
 *      docs/assertion-discipline.md — measuring the previous change, confidently.
 *   3. TEETH. A planted module with a deliberately unresolvable import must fail to load. If
 *      it loads, the loader is not reporting what this check is built to observe.
 */

import ts from 'typescript'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

// A literal path, so `deliverables.test.mjs` can read where this deletes. It is under
// node_modules/.cache because that is already ignored and already disposable.
const STAGE = join(process.cwd(), 'node_modules', '.cache', 'api-load')
const API_DIR = resolve('api')
const SRC_DIR = resolve('src')

let failures = 0
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++ }
const pass = (msg) => console.log(`  ok    ${msg}`)
const note = (msg) => console.log(`        ${msg}`)

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const posix = (p) => p.split(sep).join('/')

/**
 * The files Vercel turns into Functions — everything under api/ except the _lib helpers and
 * the tests beside them. Derived the way `routes.test.ts` derives it, for the same reason:
 * a hand-written list passes forever on the day someone adds a route.
 */
const routeFiles = () => walk(API_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => posix(relative(API_DIR, f)))
  .filter((r) => !r.startsWith('_lib/'))

/** Every api file Vercel compiles, helpers included — they ship, they are just not routes. */
const apiSources = () => walk(API_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

console.log('\ncheck:api-load — building the deployment layout and importing the routes\n')

// ── CONTROL 2: nothing stale ─────────────────────────────────────────────────────────
rmSync(STAGE, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })

// ── STAGE: api/ transpiled in place, everything else verbatim ────────────────────────
/**
 * Transpiled by TypeScript, deliberately not by esbuild.
 *
 * esbuild would be the obvious choice and it is the wrong one twice over. The version here is
 * whatever Vite dragged in - 0.21.5, which SILENTLY DROPS `with { type: 'json' }` - so the
 * staged code would differ from the source in exactly the construct under test, and the check
 * would report a failure the deployment does not have. And it is a transitive dependency: its
 * version is not this repo's to pin, so the fidelity of the model would drift on someone
 * else's release schedule. `typescript` is a direct devDependency and is the compiler the rest
 * of the repo already answers to.
 *
 * The target comes from the root tsconfig for the same reason `check:api-target` reads it
 * there - that is the one Vercel applies. Only `module` is forced, to ESNext, because the
 * question is what Node's ESM loader does with the emitted specifiers.
 */
const rootConfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, process.cwd(),
)
const emitOptions = {
  ...rootConfig.options,
  module: ts.ModuleKind.ESNext,
  noEmit: false,
  declaration: false,
}

const sources = apiSources()
for (const file of sources) {
  const emitted = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: emitOptions,
    fileName: file,
  })
  const dest = join(STAGE, relative(process.cwd(), file)).replace(/[.]ts$/, '.js')
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, emitted.outputText)
}
cpSync(SRC_DIR, join(STAGE, 'src'), { recursive: true })
cpSync('package.json', join(STAGE, 'package.json'))

const routes = routeFiles()
const stagedFor = (rel) => join(STAGE, 'api', rel.replace(/\.ts$/, '.js'))

// ── CONTROL 1: there is something to load, and it is on disk ─────────────────────────
if (routes.length === 0) {
  fail('no routes found under api/ — this check would pass by importing nothing')
} else {
  const unstaged = routes.filter((r) => !existsSync(stagedFor(r)))
  if (unstaged.length) fail(`route(s) never reached the staging tree: ${unstaged.join(', ')}`)
  else pass(`${routes.length} route(s) staged from ${sources.length} compiled api file(s)`)
}

// ── CONTROL 3: teeth ─────────────────────────────────────────────────────────────────
const PROBE = join(STAGE, 'api', '__load-probe.js')
mkdirSync(dirname(PROBE), { recursive: true })
writeFileSync(PROBE, "import './__nothing-is-here.js'\nexport default {}\n")
try {
  await import(pathToFileURL(PROBE).href)
  fail('teeth: a module with an unresolvable import loaded anyway — this check cannot fail')
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND') pass('teeth: an unresolvable import is reported, not swallowed')
  else fail(`teeth: expected ERR_MODULE_NOT_FOUND, got ${e?.code || e?.name}`)
}

/**
 * Turn a loader error into the sentence that names the cause.
 *
 * The raw ERR_MODULE_NOT_FOUND is a long absolute path and it buries the two things worth
 * knowing: whether a specifier is missing its extension, and whether a Function has reached
 * for a .ts outside api/ that nothing will have compiled.
 */
function diagnose(err) {
  const msg = String(err?.message || err)
  const missing = /Cannot find module '([^']+)'/.exec(msg)?.[1]
  if (!missing) return null
  const rel = posix(relative(STAGE, missing))
  if (!/\.[a-z]+$/i.test(rel)) {
    return `'${rel}' has no extension. Node ESM does not guess — the specifier needs its .js suffix.`
  }
  const asTs = missing.replace(/\.m?js$/, '.ts')
  if (existsSync(asTs) && !asTs.startsWith(join(STAGE, 'api') + sep)) {
    return `'${rel}' exists only as TypeScript outside api/. Nothing compiles it for the Function — `
      + 'it must be plain .mjs, like src/i18n/wordlistNorm.mjs.'
  }
  if (existsSync(join(process.cwd(), rel))) {
    return `'${rel}' exists in the repo but not in the staged tree — this check's model does not `
      + 'cover that path yet, and the deployment may or may not carry it.'
  }
  return `'${rel}' is not in the deployment.`
}

// ── THE ASSERTION: every route loads and offers the fetch Vercel calls ───────────────
let loaded = 0
for (const rel of routes) {
  const url = pathToFileURL(stagedFor(rel)).href
  try {
    const mod = await import(url)
    if (typeof mod.default?.fetch !== 'function') {
      fail(`api/${rel} loaded but exports no default { fetch } — Vercel has nothing to call`)
      continue
    }
    loaded++
  } catch (e) {
    fail(`api/${rel} cannot load: ${e?.code || e?.name}`)
    const why = diagnose(e)
    if (why) note(why)
    else note(String(e?.message || e).split('\n')[0])
  }
}
if (loaded === routes.length && routes.length > 0) {
  pass(`all ${loaded} route(s) load under Node ESM and expose a callable fetch`)
}

console.log('')
if (failures) {
  console.error(`check:api-load — ${failures} failure(s)`)
  console.error('        Every one of these is a FUNCTION_INVOCATION_FAILED on the deployment,')
  console.error('        on a build Vercel will still report as successful.\n')
  process.exit(1)
}
console.log('check:api-load — ok\n')
