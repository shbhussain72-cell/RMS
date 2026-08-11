/**
 * suite-completion.mjs — does each assertion suite COMPLETE? A different question from whether
 * it passes, and a different one again from whether its assertions are shaped soundly.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────
 *
 * `docs/assertion-discipline.md`'s arrival audit classified seventeen suites by READING their
 * assertions — deliberately, and it says so: "you can classify a suite before running it."
 * That rule answers one question well: would this suite pass vacuously on a blank page?
 *
 * It cannot see a second question. `check-remarks` was placed in the sound column on 10 Aug,
 * having been broken by two commits on 9 Aug. Its assertions really are positives and really
 * would have failed on a blank page — the verdict was accurate about what it measured. The
 * suite simply died on a locator timeout thirty seconds in and never reached any of them, and
 * nobody noticed for two days, because the table said it was fine.
 *
 * A suite that cannot run produces no false greens. It produces nothing, which is worse: the
 * table records a property of its assertions and a reader takes it for coverage.
 *
 * ── WHAT IT RECORDS ──────────────────────────────────────────────────────────────────
 *
 *   completed  the process exited on its own AND printed its own assertion output
 *   crashed    exited on an uncaught exception, having printed some or none of its checks
 *   timeout    still running at the cap — for this purpose the same as not running
 *
 * PASS/FAIL is reported alongside but is NOT the point. A suite that runs and fails is
 * working; a suite that never finishes is not, whatever colour its last line was.
 *
 *   node scripts/suite-completion.mjs                # every scripts/check-*.mjs, npm script or not
 *   node scripts/suite-completion.mjs --only a,b     # a subset, by npm script or file name
 *   node scripts/suite-completion.mjs --cap 600      # per-suite seconds (default 900)
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined }
const CAP = Number(arg('--cap') ?? 900) * 1000
const ONLY = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean)

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const NPM = Object.keys(pkg.scripts).filter((k) => k.startsWith('check:'))

/**
 * EVERY suite, not every suite someone remembered to add to package.json.
 *
 * The first version of this listed `check:*` npm scripts and called that "every suite". There
 * are 25 `scripts/check-*.mjs` files and 19 npm scripts, so six suites — including
 * `check-layout`, which the arrival audit records other suites deferring to — were invisible to
 * a tool whose entire purpose is finding suites nobody runs. A roster built from the runner can
 * only ever report on what the runner already knows about.
 *
 * So the roster is the FILES, and an npm script is used when one exists because that is how the
 * suite is meant to be invoked (some carry flags).
 */
const byScript = new Map(NPM.map((k) => [pkg.scripts[k].trim().replace(/^node\s+/, '').split(/\s+/)[0], k]))
const FILES = readdirSync(resolve(ROOT, 'scripts'))
  .filter((n) => /^check-.*\.mjs$/.test(n) && !/\.test\.mjs$/.test(n))
  .map((n) => `scripts/${n}`)

const ALL = []
for (const f of FILES) ALL.push({ name: byScript.get(f) ?? f, file: f, npm: byScript.get(f) ?? null })
// npm scripts whose target is not a scripts/check-*.mjs file (check:api-target and friends run
// other files) are still suites and still have to be recorded.
for (const k of NPM) if (!ALL.some((s) => s.npm === k)) ALL.push({ name: k, file: null, npm: k })

const matches = (s, q) => s.name === q || s.name === `check:${q}` || s.file === q
  || s.file === `scripts/${q}` || s.file === `scripts/check-${q}.mjs`
const suites = ONLY ? ALL.filter((s) => ONLY.some((q) => matches(s, q))) : ALL

if (!suites.length) {
  console.error(`--only matched no suite. Available: ${ALL.map((s) => s.name).join(', ')}`)
  process.exit(2)
}

/**
 * Crashed = the process died on an uncaught throw, rather than deciding an outcome and exiting.
 *
 * Detected by the NODE stack signature, not by trying to recognise each suite's own output. The
 * first attempt did the latter — `/(PASS|FAIL|ok|✓|×)\b/` — and misclassified `check:lsd` on the
 * very first run: it exits 0 printing `✓ no new untranslated strings`, and `\b` after `✓` cannot
 * match, because a word boundary needs a word character on one side and `✓` is not one. A
 * classifier that has to know seventeen output formats will be wrong about one of them, and
 * being wrong here means writing a false column into the document that exists to stop exactly
 * that.
 *
 * Two states, and neither is about the assertions:
 *   exit code 0 or 1 with no stack   → the suite ran and decided. FAILURES ARE FINE.
 *   a Node stack trace               → it never got to decide.
 */
const crashed = (out) => /node:internal[/]|triggerUncaughtException|Unhandled(Promise)?Rejection|^[ \t]+at \S+ [(]|^[ \t]+at (async )?(file:|[/]|[A-Za-z]:)/m.test(out)

const run = ({ name, file, npm }) => new Promise((done) => {
  const started = Date.now()
  const [cmd, args] = npm ? ['npm', ['run', '--silent', npm]] : ['node', [file]]
  const proc = spawn(cmd, args, {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_REVIEW_TOOLS: process.env.VITE_REVIEW_TOOLS ?? 'true' },
  })
  let out = ''
  proc.stdout.on('data', (b) => { out += b })
  proc.stderr.on('data', (b) => { out += b })
  const timer = setTimeout(() => { proc.kill('SIGKILL'); settle('timeout', null) }, CAP)
  let finished = false
  function settle(outcome, code) {
    if (finished) return
    finished = true
    clearTimeout(timer)
    done({ name, npm: !!npm, outcome, code, seconds: Math.round((Date.now() - started) / 1000), out })
  }
  proc.on('exit', (code) => settle(crashed(out) ? 'crashed' : 'completed', code))
  proc.on('error', () => settle('crashed', null))
})

const rows = []
for (const suite of suites) {
  process.stdout.write(`  ${suite.name}${suite.npm ? '' : '  (no npm script)'} … `)
  const r = await run(suite)
  rows.push(r)
  console.log(`${r.outcome}  exit=${r.code}  ${r.seconds}s`)
}

mkdirSync(resolve(ROOT, 'artifacts'), { recursive: true })
writeFileSync(resolve(ROOT, 'artifacts/suite-completion.json'),
  `${JSON.stringify(rows.map(({ out, ...r }) => ({ ...r, tail: out.split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 400) })), null, 2)}\n`)

const byOutcome = (o) => rows.filter((r) => r.outcome === o)
console.log(`\ncompleted ${byOutcome('completed').length}   crashed ${byOutcome('crashed').length}   timeout ${byOutcome('timeout').length}   of ${rows.length}`)
for (const r of rows) {
  if (r.outcome === 'completed') continue
  console.log(`\n  ${r.name}  ${r.outcome} after ${r.seconds}s`)
  console.log(`    ${r.out.split('\n').filter(Boolean).slice(-3).join('\n    ').slice(0, 600)}`)
}
// The exit code is about COMPLETION, not about the assertions inside. A suite that runs and
// reports failures has done its job.
process.exit(rows.some((r) => r.outcome !== 'completed') ? 1 : 0)
