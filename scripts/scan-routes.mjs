/**
 * scan-routes.mjs — per-route A / B1 / B2 / C, before and after a wiring pass.
 *
 *   node scripts/scan-routes.mjs --out artifacts/audit/routes-before.json
 *   node scripts/scan-routes.mjs --out artifacts/audit/routes-after.json \
 *                               --diff artifacts/audit/routes-before.json
 *
 * ── WHY PER-ROUTE AND NOT ONE TOTAL ──────────────────────────────────────────────
 *
 * `scan-baseline.mjs` unions every route into a single set of distinct strings, which is the
 * right shape for "how much of the wordlist is unfinished" and the wrong shape for working.
 * A total says 18 outstanding; it does not say which screen to open. It also hides the case
 * this session exists to eliminate: a route whose A is nonzero — where the dictionary already
 * holds the translation and English renders anyway. That is a wiring defect, it belongs to
 * whoever wrote the screen, and a global count lets it sit inside a number that is going down.
 *
 * ── THE CLASSES ─────────────────────────────────────────────────────────────────────
 *
 *   A    dictionary HAS a translation; English rendered anyway  → developer. Must reach 0.
 *   B1   row exists, value blank                                → wordlist owner. The queue.
 *   B2   row exists, value is the English word by policy        → nobody. Correct as it is.
 *   C    no row at all                                          → wordlist owner (add a row).
 *   sen  the wordlist's `remove` sentinel                       → nobody. English on purpose.
 *
 * B2 and sentinel are reported but are NOT gaps. Counting them as outstanding is how a queue
 * comes to look permanently unfinished, and the two states that are genuinely fine get retried
 * every session.
 *
 * Scanned at 390 and 1440 and unioned per route, for the reason `scan-baseline.mjs` gives:
 * this app ships separate markup per breakpoint, so a one-width walk cannot see half the UI.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt)
const OUT = resolve(ROOT, arg('--out', 'artifacts/audit/routes-scan.json'))
const DIFF = argv.includes('--diff') ? resolve(ROOT, arg('--diff')) : null
const MIQAAT_ID = 'ashara-1448'
const WIDTHS = [390, 1440]
const CLASSES = ['A', 'B1', 'B2', 'C', 'sentinel']
const W = { A: 4, B1: 4, B2: 4, C: 4, sentinel: 9 }

const routes = [...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
  .matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p !== '*' && p !== '/')
  .map((p) => p.replace(/:id/g, MIQAAT_ID))
  .sort()

// Same seeding as scan-baseline: logged in, LSD, every tour marked seen. `rms-tour-seen` holds
// a JSON ARRAY — seeding a bare '1' makes JSON.parse return a number and TourProvider throws,
// which renders eight routes as blank pages that still measure as "scanned".
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

const PORT = await new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) })
})
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1500) } }
  server.stdout.on('data', w); server.stderr.on('data', w)
  server.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
})

/** route -> Map(text -> { detail, where, dictValue, widths[] }) */
const byRoute = new Map(routes.map((r) => [r, new Map()]))
const failed = []
const browser = await chromium.launch()
try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata' })
    await ctx.addInitScript(seed)
    const page = await ctx.newPage()
    for (const route of routes) {
      try {
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.evaluate(() => document.fonts?.ready)
        await page.waitForFunction(() => !!window.__lsdScan, null, { timeout: 15_000 })
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const res = await page.evaluate(() => window.__lsdScan.scan())
        const m = byRoute.get(route)
        for (const h of res.hits) {
          const prev = m.get(h.text)
          if (prev) prev.widths.push(width)
          else m.set(h.text, { detail: h.detail, where: h.where, dictValue: h.dictValue, widths: [width] })
        }
      } catch (err) {
        failed.push(`${width}px ${route}: ${String(err.message).split('\n')[0]}`)
      }
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  server.kill()
}

const zero = () => Object.fromEntries(CLASSES.map((c) => [c, 0]))
const report = {
  widths: WIDTHS,
  routes: routes.map((route) => {
    const m = byRoute.get(route)
    const counts = zero()
    for (const v of m.values()) counts[v.detail]++
    return {
      route,
      counts,
      total: m.size,
      strings: [...m.entries()]
        .map(([text, v]) => ({ text, ...v }))
        .sort((a, b) => CLASSES.indexOf(a.detail) - CLASSES.indexOf(b.detail) || (a.text < b.text ? -1 : 1)),
    }
  }),
}
// Distinct across the whole app: the same literal on six screens is ONE row to add, not six.
const distinct = new Map()
for (const r of report.routes) for (const s of r.strings) distinct.set(s.text, s.detail)
report.distinct = {
  total: distinct.size,
  counts: [...distinct.values()].reduce((a, d) => { a[d]++; return a }, zero()),
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`)

const pad = (s, n) => String(s).padEnd(n)
const num = (s, n) => String(s).padStart(n)
const row = (label, counts, total) => `${pad(label, 34)} ${CLASSES.map((c) => num(counts[c], W[c])).join(' ')}  ${total}`
console.log(`\n${pad('route', 34)} ${CLASSES.map((c) => num(c, W[c])).join(' ')}  total`)
console.log('-'.repeat(64))
for (const r of report.routes) console.log(row(r.route, r.counts, r.total))
console.log('-'.repeat(64))
console.log(row('DISTINCT across the app', report.distinct.counts, report.distinct.total))
console.log('\nA must be 0 (wiring). B1 + C are the wordlist queue. B2 and sentinel are correct as they stand.')

if (failed.length) {
  console.error(`\n${failed.length} visit(s) failed:`)
  failed.forEach((f) => console.error('  ' + f))
}

if (DIFF && existsSync(DIFF)) {
  const before = JSON.parse(readFileSync(DIFF, 'utf8'))
  const b = new Map(before.routes.map((r) => [r.route, r.counts]))
  console.log(`\nvs ${DIFF.replace(ROOT, '.')}:`)
  let moved = 0
  for (const r of report.routes) {
    const prev = b.get(r.route)
    if (!prev) continue
    const deltas = CLASSES.map((c) => [c, r.counts[c] - prev[c]]).filter(([, d]) => d !== 0)
    if (deltas.length) { moved++; console.log(`  ${pad(r.route, 34)} ${deltas.map(([c, d]) => `${c} ${d > 0 ? '+' : ''}${d}`).join('  ')}`) }
  }
  if (!moved) console.log('  no route changed class counts')
}
console.log(`\nwrote ${OUT.replace(ROOT, '.')}`)
