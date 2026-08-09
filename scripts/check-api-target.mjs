/**
 * check-api-target.mjs — does api/ compile against the target VERCEL applies, not ours?
 *
 *   node scripts/check-api-target.mjs
 *   npm run check:api-target                     (also runs inside `npm run build`)
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ─────────────────────────────────────────────────
 *
 * `api/_lib/records.ts` used `Array.prototype.at(-1)` in two places. It type-checked locally
 * and it was a hard error on every deploy:
 *
 *     api/_lib/records.ts(178,32): TS2550: Property 'at' does not exist on type 'string[]'
 *     api/_lib/records.ts(202,22): TS2550: Property 'at' does not exist on type 'Revision[]'
 *
 * Both statements were true at once because they were about different configs. `.at()` is
 * ES2022; `tsconfig.api.json` sets lib ES2022, so a hand-typed `tsc -p tsconfig.api.json`
 * passed. Vercel's Node builder does not read `tsconfig.api.json`. It resolves the tsconfig
 * at the PROJECT ROOT, whose lib is ES2020, and compiles the function graph against that.
 *
 * The deployment still reported success. The functions did not build, so the routes answered
 * FUNCTION_INVOCATION_FAILED — which reads to a reviewer as the shared store being down,
 * exactly the symptom `check:api` was written for, arrived at by a different road.
 *
 * ── WHAT IT ASSERTS, AND WHY IT IS NOT A GREP ────────────────────────────────────────
 *
 * Scanning api/ for the string `.at(` would be asserting the mechanism. It would pass on
 * `Object.hasOwn`, on `findLast`, on `toSorted`, on error `cause`, on every ES2022+ API nobody
 * thought to add to the pattern, and on the next one TypeScript learns about. The subject is
 * whether the COMPILER accepts the code under the lib Vercel gives it. So this check compiles.
 *
 * It compiles `tsconfig.api.vercel.json`, which extends the root tsconfig — so it inherits
 * whatever target the root declares TODAY. Move the root to ES2022 and `.at()` becomes legal
 * here and on Vercel together, which is the correct coupling. Nothing here names a version.
 *
 * ── THE CONTROLS ─────────────────────────────────────────────────────────────────────
 *
 * A clean compile is worthless on its own — an empty program compiles clean, and so does one
 * quietly retargeted at ES2022. Three things are established before the compile is believed:
 *
 *   1. SUBJECT. Every non-test .ts under api/ is in the program. A narrowed `include` would
 *      otherwise pass by compiling nothing that ships.
 *   2. TARGET. The effective target and lib equal the ROOT tsconfig's, resolved by tsc itself
 *      rather than read out of the file. Pinning ES2022 in tsconfig.api.vercel.json is the one
 *      edit that would silently restore the original hole; it fails here instead.
 *   3. TEETH. A scratch file using an API above the root's lib is compiled with the same
 *      options and MUST be rejected. If it is accepted, this script cannot fail and says so.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT_CONFIG = 'tsconfig.json'
const API_CONFIG = 'tsconfig.api.vercel.json'

let failures = 0
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++ }
const pass = (msg) => console.log(`  ok    ${msg}`)
const note = (msg) => console.log(`        ${msg}`)

// The compiler is invoked through node on typescript's own entry point rather than through
// `npx tsc`, so there is no shell in the path and no PATH lookup to go wrong on Windows.
const TSC = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
const tsc = (args) => execFileSync(process.execPath, [TSC, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
})

/** tsc's own resolution of a config — extends chains, defaults and all. Never the raw file. */
const showConfig = (path) => JSON.parse(tsc(['--showConfig', '-p', path]))

/** Compile a config. Returns tsc's output on failure, null when it exits 0. */
const compile = (path) => {
  try {
    tsc(['-p', path])
    return null
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`.trim() || `tsc exited ${e.status}`
  }
}

const normalise = (p) => relative(process.cwd(), p).split(sep).join('/')

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)])

console.log(`\ncheck:api-target — compiling api/ as Vercel resolves it (${API_CONFIG})\n`)

// ── The two configs, as tsc resolves them ────────────────────────────────────────────
let root, api
try {
  root = showConfig(ROOT_CONFIG)
  api = showConfig(API_CONFIG)
} catch (e) {
  fail(`could not resolve the tsconfigs: ${`${e.stdout || ''}${e.stderr || e.message}`.trim()}`)
  process.exit(1)
}

// ── CONTROL 1: the program has the right subject ─────────────────────────────────────
const inProgram = new Set((api.files || []).map((f) => f.replace(/^\.\//, '')))
const expected = walk('api')
  .map(normalise)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
const missing = expected.filter((f) => !inProgram.has(f))

if (expected.length === 0) {
  fail('found no non-test .ts files under api/ — this check has no subject')
} else if (missing.length) {
  fail(`${missing.length} api file(s) are not in the compiled program: ${missing.join(', ')}`)
  note('a narrowed "include" makes this check pass by compiling nothing that ships')
} else {
  pass(`all ${expected.length} shipped api/ file(s) are in the program`)
}

// ── CONTROL 2: it is Vercel's target, not one of ours ────────────────────────────────
const rootTarget = root.compilerOptions?.target
const apiTarget = api.compilerOptions?.target
const rootLib = (root.compilerOptions?.lib || []).join(',')
const apiLib = (api.compilerOptions?.lib || []).join(',')

if (apiTarget !== rootTarget || apiLib !== rootLib) {
  fail(`${API_CONFIG} does not compile against the root target`)
  note(`root: target=${rootTarget} lib=[${rootLib}]`)
  note(`api : target=${apiTarget} lib=[${apiLib}]`)
  note(`Vercel applies ${ROOT_CONFIG}. A target pinned here checks a build that never happens.`)
} else {
  pass(`target=${apiTarget} lib=[${apiLib}] — inherited from ${ROOT_CONFIG}, as Vercel does`)
}

// ── CONTROL 3: teeth — can this check fail at all? ──────────────────────────────────
const libs = (api.compilerOptions?.lib || []).map((l) => l.toLowerCase())
const esLevel = Math.max(0, ...libs
  .map((l) => (l === 'esnext' ? 9999 : Number((l.match(/^es(\d{4})$/) || [])[1]) || 0)))
// An API from one lib level above whatever the root declares. tsc must reject it.
const PROBES = [
  { above: 2021, api: '[1].at(-1)' },                  // ES2022
  { above: 2022, api: '[1].toSorted()' },              // ES2023
  { above: 2023, api: 'Object.groupBy([1], String)' }, // ES2024
]
const probe = PROBES.find((p) => esLevel <= p.above)

/**
 * Type-check one expression under the same options, in memory.
 *
 * The probe is held in a virtual source file rather than a scratch directory: a temp dir would
 * mean a recursive delete on a path no static reader can resolve, and `deliverables.test.mjs`
 * is right to refuse those. Nothing here touches the disk.
 */
const probeDiagnostics = (expression) => {
  const NAME = 'api-target-probe.ts'
  const source = `export const x = ${expression}
`
  const { options } = ts.convertCompilerOptionsFromJson(
    { ...api.compilerOptions, noEmit: true, types: [] }, process.cwd(),
  )
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  host.getSourceFile = (name, ...rest) => (name === NAME
    ? ts.createSourceFile(NAME, source, options.target ?? ts.ScriptTarget.ES2020, true)
    : getSourceFile(name, ...rest))
  host.fileExists = (name) => name === NAME || fileExists(name)
  host.readFile = (name) => (name === NAME ? source : readFile(name))
  host.writeFile = () => {}
  const program = ts.createProgram([NAME], options, host)
  return ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === NAME)
}

if (!probe) {
  note(`root lib is es${esLevel} — nothing above it to probe with; teeth not proven`)
} else {
  const diags = probeDiagnostics(probe.api)
  const libError = diags.some((d) => [2550, 2339, 2551].includes(d.code))
  if (libError) {
    pass(`teeth: an above-target API (${probe.api}) is rejected under this lib`)
  } else if (diags.length) {
    fail('teeth probe failed for an unexpected reason — this check may be misconfigured')
    note(ts.flattenDiagnosticMessageText(diags[0].messageText, ' '))
  } else {
    fail('teeth: an above-target API type-checked clean — this check cannot catch its own class')
    note(`lib=[${apiLib}] should not accept: ${probe.api}`)
  }
}

// ── THE ASSERTION ────────────────────────────────────────────────────────────────────
const out = compile(API_CONFIG)
if (out) {
  fail('api/ does not compile against the target Vercel applies — these functions will not run')
  console.error('')
  for (const line of out.split('\n')) console.error(`        ${line}`)
  console.error('')
  note('Vercel reports these and marks the deployment successful anyway')
} else {
  pass('api/ compiles clean against the target Vercel applies')
}

console.log('')
if (failures) {
  console.error(`check:api-target — ${failures} failure(s)\n`)
  process.exit(1)
}
console.log('check:api-target — ok\n')
