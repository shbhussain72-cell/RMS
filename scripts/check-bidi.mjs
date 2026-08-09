/**
 * check-bidi.mjs — assert that no unisolated Latin/numeric run sits in RTL text.
 *
 *   node scripts/check-bidi.mjs               # walk every route in LSD, print violations
 *   node scripts/check-bidi.mjs --json        # machine-readable
 *   MSYS_NO_PATHCONV=1 node scripts/check-bidi.mjs --route /miqaats
 *
 * (The env var matters only on Git Bash for Windows, which rewrites a leading-slash argument
 * into a Windows path — `/miqaats` arrives as `C:/Program Files/Git/miqaats` and matches
 * nothing. Without it the run silently reports "0 routes" instead of failing.)
 *
 * Exits non-zero when a violation is found, so it can gate a build.
 *
 * ── WHAT COUNTS AS A VIOLATION ───────────────────────────────────────────────────
 *
 * A rendered text node that
 *   (a) contains a Latin word (2+ letters) or an ASCII digit, AND
 *   (b) has a resolved direction of RTL, AND
 *   (c) has no isolating ancestor between it and the nearest block container.
 *
 * All three are required. (a) alone flags every legitimate Arabic paragraph that happens to
 * hold a loanword; (b) alone flags nothing in English mode; (c) is what distinguishes "this
 * run is at the mercy of the bidi algorithm" from "someone declared its boundaries".
 *
 * ── WHY THIS RUNS IN A BROWSER AND NOT OVER THE SOURCE ───────────────────────────
 *
 * Resolved direction is a COMPUTED value. It comes from the `dir` attribute, from a CSS
 * `direction` property, from `unicode-bidi`, and from inheritance through an arbitrary
 * ancestor chain — the interaction of which is exactly where the bugs live. A static scan of
 * JSX would have to reimplement the cascade to answer (b) at all, and would get it wrong in
 * the same places the app does. Asking the browser is the only honest measurement.
 *
 * Runs against the DEV server so it can share the screenshot harness's route enumeration and
 * localStorage seeding; nothing here depends on dev-only code.
 *
 * ── KNOWN GAP: THIS SUITE DOES NOT PROVE IT ARRIVED ─────────────────────────────────
 *
 * Measured, not suspected: pointed at a build where every route redirects to /login, this suite
 * PASSED. See "The arrival audit" in docs/assertion-discipline.md. Its assertions are negatives,
 * and a negative is most true of a page with nothing on it.
 *
 * The fix is `createArrival` from ./arrival.mjs, as used by check-numerals, check-lsd-clip,
 * check-overlap, check-layout and check-centred: derive `expected` from the matrix this suite
 * sweeps, call `arrival.visit(page, route, combo)` before measuring, and fold `arrival.verify()`
 * into the exit code. Deferred behind a user-facing defect, deliberately — this is a known hole,
 * not an unknown one.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'
import { NARROW_WIDTHS } from './widths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PORT = 4321
const MIQAAT_ID = 'ashara-1448'
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const ONLY = argv.filter((a, i) => argv[i - 1] === '--route')
const OUT = resolve(ROOT, 'artifacts/audit/bidi.json')

const routes = [
  ...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1])),
]
  .filter((p) => p !== '*' && p !== '/')
  .map((p) => p.replace(/:id/g, MIQAAT_ID))
  .sort()
const targets = ONLY.length ? routes.filter((r) => ONLY.some((o) => r.startsWith(o))) : routes

const WIDTHS = NARROW_WIDTHS

/**
 * Tour keys, read from src/tour/steps.ts.
 *
 * `rms-tour-seen` holds a JSON ARRAY of screen keys. Seeding the string '1' (as this harness
 * originally did) makes `JSON.parse` return the NUMBER 1, and TourProvider's
 * `getSeen().includes(...)` throws — which crashed the React tree on every route that has a
 * walkthrough. Eight routes rendered as blank cream pages in both languages, and because the
 * files were still written at full viewport size, a "200/200 screenshots, none missing" check
 * reported success on them.
 */
const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]

const seed = `
  try {
    localStorage.setItem('rms-lang', 'lsd');
    const prev = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...prev, state: { ...(prev.state || {}), loggedIn: true }, version: prev.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

/** Runs in the page. Kept self-contained — it is stringified across the boundary. */
const PROBE = () => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'PATH', 'TEXTAREA'])
  const RISKY = /[A-Za-z]{2,}|[0-9]/
  const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/
  const out = []

  // Per-element caches. Without them this walk is quadratic-ish and takes many minutes on the
  // larger screens: `getComputedStyle` and `offsetParent` each force style/layout, and a text
  // node's parent is shared by all its siblings, so the same element was being measured over
  // and over. Caching turns the whole run from minutes into seconds.
  const styleOf = new Map()
  const cs = (el) => {
    let v = styleOf.get(el)
    if (!v) { const s = getComputedStyle(el); v = { direction: s.direction, unicodeBidi: s.unicodeBidi, position: s.position }; styleOf.set(el, v) }
    return v
  }
  const textOf = new Map()
  const contentOf = (el) => {
    let v = textOf.get(el)
    if (v === undefined) { v = el.textContent || ''; textOf.set(el, v) }
    return v
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue || '').replace(/\s+/g, ' ').trim()
    if (!text || !RISKY.test(text)) continue

    const el = n.parentElement
    if (!el || !el.isConnected) continue
    let skip = false
    for (let a = el; a; a = a.parentElement) {
      // `.toUpperCase()` is load-bearing. `Element.tagName` is uppercased only for HTML elements;
      // foreign (SVG) elements preserve their original case, so an <svg>/<path>/<text> reports
      // 'svg'/'path'/'text'. The 'SVG' and 'PATH' entries above could therefore never match and
      // the intended skip was dead — an icon's <text> label (the "PDF" file badge) was reported
      // as an unisolated run even though SVG was meant to be excluded all along.
      if (SKIP.has(a.tagName?.toUpperCase()) || a.hasAttribute?.('data-lsd-scanner-ignore')) { skip = true; break }
    }
    if (skip) continue
    // Not rendered → cannot be visually wrong.
    if (el.offsetParent === null && cs(el).position !== 'fixed') continue

    // (b) resolved direction of the node's own formatting context.
    if (cs(el).direction !== 'rtl') continue

    const where = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''}`

    // (c) CASE 1 — a single text node holding BOTH scripts is always a violation. Isolation
    // needs an element boundary, and there is none inside a text node, so the Latin run in
    // `‏Registration نا روز 11:59 وگے` is by construction at the mercy of the algorithm.
    if (ARABIC.test(text)) {
      out.push({ text: text.slice(0, 120), kind: 'mixed-text-node', where })
      continue
    }

    // (c) CASE 2 — a Latin/numeric-only node needs an isolate that wraps IT.
    //
    // The subtlety that made the first version of this check useless: `dir="rtl"` on a
    // paragraph does set `unicode-bidi: isolate`, but that isolates the paragraph from its
    // SIBLINGS — it says nothing about the runs inside it. Since `tx()` puts `dir="rtl"` on
    // nearly every translated element, accepting any dir-carrying ancestor marked the whole
    // app as clean and the checker reported zero on a codebase with no <bdi> in it at all.
    //
    // So an isolate only counts when it contains no OTHER Arabic text: that is what
    // distinguishes a wrapper around this run from a wrapper around the whole sentence.
    let isolated = false
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const ub = cs(a).unicodeBidi
      const isolating =
        a.tagName === 'BDI' || ub === 'isolate' || ub === 'isolate-override' || ub === 'plaintext'
      if (!isolating) continue
      if (!ARABIC.test(contentOf(a).replace(text, ''))) { isolated = true; break }
    }
    if (isolated) continue

    // A bare Latin run only reorders if there is Arabic nearby to reorder against.
    const context = el.closest('p, li, h1, h2, h3, h4, div, span, td, button') || el
    if (!ARABIC.test(contentOf(context).replace(text, ''))) continue

    out.push({ text: text.slice(0, 120), kind: 'bare-run', where })
  }
  return out
}

/**
 * Free the port before binding it.
 *
 * `--strictPort` makes vite exit rather than silently move to another port, which is the
 * behaviour we want (a checker that quietly measured a stale server would be worse than one
 * that fails). But vite is spawned through a shell, so a killed run can leave the real node
 * process holding the socket — and every subsequent run would then die on startup. Clearing
 * the port first makes the script re-runnable without manual `taskkill`.
 */
function freePort() {
  try {
    // No `-p tcp`: that flag restricts output to IPv4, and vite binds `[::1]` — so the
    // filtered form finds nothing and the port looks free while the socket is very much held.
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${PORT}`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const pid of new Set([...out.matchAll(/\s(\d+)\s*$/gm)].map((m) => m[1]))) {
      if (pid !== '0') try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch {}
    }
  } catch {
    // findstr exits 1 when nothing matches — that is the good case.
  }
}

/**
 * Kill the vite process TREE, not the shell in front of it.
 *
 * ── WHY THIS SUITE NEVER FINISHED ────────────────────────────────────────────────────
 *
 * This has been "the slow suite" for several sessions. It is not slow. It completes its
 * measurement in about six minutes and then **never exits**, so anything running it under a
 * timeout kills it after the work is done and reports a timeout — and anything running it by
 * hand sits at a blank prompt until somebody gives up. A suite that does not terminate is a
 * suite nobody can put in a harness, which is why the bidi census below it has been gated shut
 * this whole time.
 *
 * Two things combine:
 *
 *   1. vite is spawned with `shell: true`, so `proc` is cmd.exe and the real node server is its
 *      CHILD. `proc.kill()` kills the shell and orphans the server, which keeps holding the
 *      port — the reason `freePort()` had to be written at all. Its own docblock records the
 *      symptom without naming this as the cause.
 *   2. The orphan's stdout is piped here and has a listener on it, so the event loop never
 *      empties, so node never exits on its own.
 *
 * The suite deliberately sets `process.exitCode` instead of calling `process.exit()`, because
 * the latter truncated the `--json` output mid-object. That decision is right and stays; it
 * just left nothing to close the loop. This kills the tree, and the tail of the file force
 * exits once stdout has actually drained.
 */
function stopServer(proc) {
  if (!proc?.pid) return
  if (process.platform === 'win32') {
    // /T takes the children with it — the point of the whole function. /F because vite in a
    // shell does not respond to a polite signal here.
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' }) } catch { /* already gone */ }
  }
  try { proc.kill() } catch { /* already gone */ }
  // Belt and braces: even a killed child leaves its pipe referenced until it is unref'd, and a
  // referenced pipe is enough on its own to keep node alive.
  proc.stdout?.destroy()
  proc.stderr?.destroy()
  proc.unref()
}

async function serve() {
  freePort()
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
    const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1500) } }
    proc.stdout.on('data', w); proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
  })
  return proc
}

const server = await serve()
const browser = await chromium.launch()
const byText = new Map()
const failed = []
let visits = 0

try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata',
    })
    await ctx.addInitScript(seed)
    const page = await ctx.newPage()

    for (const route of targets) {
      try {
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.evaluate(() => document.fonts?.ready)
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        for (const hit of await page.evaluate(PROBE)) {
          const prev = byText.get(hit.text)
          if (prev) { prev.count++; prev.routes.add(route) }
          else byText.set(hit.text, { ...hit, count: 1, routes: new Set([route]) })
        }
        visits++
      } catch (err) {
        failed.push(`${width}px ${route}: ${err.message.split('\n')[0]}`)
      }
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  stopServer(server)
}

const violations = [...byText.values()]
  .map((v) => ({ ...v, routes: [...v.routes].sort() }))
  .sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : 1))

// Always written, in both modes: a full run costs a couple of minutes, and piping stdout
// to a file loses it to buffering on exit. The report on disk is the artefact worth keeping.
mkdirSync(resolve(ROOT, 'artifacts/audit'), { recursive: true })
writeFileSync(OUT, `${JSON.stringify({ visits, distinct: violations.length, violations }, null, 2)}\n`)

if (JSON_OUT) {
  console.log(JSON.stringify({ visits, distinct: violations.length, violations }, null, 2))
} else {
  console.log(`route visits            : ${visits} (${targets.length} routes x ${WIDTHS.length} widths)`)
  console.log(`unisolated runs in RTL  : ${violations.length} distinct`)
  const mixed = violations.filter((v) => v.kind === 'mixed-text-node').length
  console.log(`  mixed text nodes      : ${mixed}   (Latin+Arabic in ONE node — cannot be isolated in place)`)
  console.log(`  bare runs             : ${violations.length - mixed}   (Latin/numeric node with no wrapping isolate)`)
  for (const v of violations.slice(0, 40)) {
    console.log(`  [${v.count}x] ${v.kind === 'mixed-text-node' ? 'MIX' : 'BARE'} ${v.where}  ${JSON.stringify(v.text)}`)
  }
  if (violations.length > 40) console.log(`  …and ${violations.length - 40} more`)
  console.log(`
full report: ${OUT.replace(ROOT, '.')}`)
  if (failed.length) {
    console.error(`\n${failed.length} visit(s) failed:`)
    failed.forEach((f) => console.error('  ' + f))
  }
}

// `process.exitCode`, never a bare `process.exit()`: the latter tears the process down before a
// piped stdout has flushed, which silently truncated the --json output mid-object.
process.exitCode = violations.length === 0 ? 0 : 1

// …but setting the code and hoping the loop empties is what made this suite hang for several
// sessions. `stopServer` should have emptied it; this makes termination the outcome rather than
// the expectation. The empty write's callback fires only after everything queued ahead of it has
// been handed to the OS, so the flush the comment above protects still happens — and then we
// leave, whatever else is still holding a handle open.
process.stdout.write('', () => process.exit(process.exitCode))
