/**
 * scan-baseline.mjs — walk every route in LSD and capture the DOM scanner's A/B/C totals.
 *
 *   node scripts/scan-baseline.mjs            # print the summary
 *   node scripts/scan-baseline.mjs --write    # also patch the baseline into docs/lsd-gaps.md
 *
 * Runs against the DEV server, not the preview build: the scanner and CoveragePanel are
 * both `import.meta.env.DEV`-gated and are stripped from production, which is exactly the
 * behaviour we want at runtime — so the measurement has to happen where they exist.
 *
 * This is the automated equivalent of opening the panel, walking the app and pressing
 * Export JSON. Doing it in a script is what makes the baseline reproducible: the same
 * routes, in the same order, every time.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { NARROW_WIDTHS } from './widths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DOC = resolve(ROOT, 'docs/lsd-gaps.md')
const OUT = resolve(ROOT, 'artifacts/audit/dom-scan.json')
const WRITE = process.argv.includes('--write')
const PORT = 4320
const MIQAAT_ID = 'ashara-1448'

const routes = [...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
  .matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p !== '*' && p !== '/')
  .map((p) => p.replace(/:id/g, MIQAAT_ID))
  .sort()

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

async function serve() {
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

/**
 * Union the per-width cumulative sets on the normalised string, keeping the BEST-known
 * class for each (A beats B beats C — a later pass may classify more precisely).
 */
function mergeTotals(list) {
  const rank = { A: 0, B: 1, C: 2 }
  const byText = new Map()
  for (const t of list) {
    for (const h of t.hits) {
      const prev = byText.get(h.text)
      if (!prev) byText.set(h.text, { ...h, routes: [...h.routes] })
      else {
        prev.count += h.count
        prev.routes = [...new Set([...prev.routes, ...h.routes])].sort()
        if (rank[h.cls] < rank[prev.cls]) { prev.cls = h.cls; prev.dictValue = h.dictValue }
      }
    }
  }
  const hits = [...byText.values()].sort((a, b) => rank[a.cls] - rank[b.cls] || b.count - a.count || (a.text < b.text ? -1 : 1))
  return {
    distinctStrings: hits.length,
    routesVisited: new Set(hits.flatMap((h) => h.routes)).size,
    A: hits.filter((h) => h.cls === 'A').length,
    B: hits.filter((h) => h.cls === 'B').length,
    C: hits.filter((h) => h.cls === 'C').length,
    hits,
  }
}

const server = await serve()
const browser = await chromium.launch()

/**
 * Scanned at BOTH a mobile and a desktop width, and unioned.
 *
 * This app ships separate markup per breakpoint — 87 blocks are gated behind `sm:hidden`
 * or `hidden sm:flex`. At 1440 the mobile blocks are `display:none`, so the scanner (which
 * correctly ignores non-rendered nodes) never sees them, and a desktop-only pass silently
 * misses roughly half the UI. Two widths is the minimum honest sample.
 */
const WIDTHS = NARROW_WIDTHS

let visited = 0
const allTotals = []
const failed = []

try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata',
    })
    await ctx.addInitScript(seed)
    const page = await ctx.newPage()

    for (const route of routes) {
      try {
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.evaluate(() => document.fonts?.ready)
        // Drive the scanner directly rather than waiting on the panel's 400ms debounce,
        // so the baseline does not depend on the panel being open.
        await page.waitForFunction(() => !!window.__lsdScan, null, { timeout: 15_000 })
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        await page.evaluate(() => window.__lsdScan.scan())
        visited++
      } catch (err) {
        failed.push(`${width}px ${route}: ${err.message.split('\n')[0]}`)
      }
    }

    // The cumulative set lives in the page, so read it before the context closes.
    allTotals.push(await page.evaluate(() => window.__lsdScan.totals()))
    await ctx.close()
  }

  const totals = mergeTotals(allTotals)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(totals, null, 2)}\n`)

  console.log(`route visits : ${visited} (${routes.length} routes x ${WIDTHS.length} widths)`)
  console.log(`distinct English strings on screen in LSD : ${totals.distinctStrings}`)
  console.log(`  A (translated, not wired) : ${totals.A}`)
  console.log(`  B (key exists, unusable)  : ${totals.B}`)
  console.log(`  C (no key)                : ${totals.C}`)
  for (const t of allTotals) console.log(`    per-width: ${t.distinctStrings} distinct`)
  if (failed.length) {
    console.error(`\n${failed.length} visit(s) failed:`)
    failed.forEach((f) => console.error('  ' + f))
  }
  console.log(`\nwrote ${OUT.replace(ROOT, '.')}`)

  if (WRITE) {
    const md = readFileSync(DOC, 'utf8')
    const block = [
      '<!-- SCANNER_BASELINE_START -->',
      '',
      `Captured by \`node scripts/scan-baseline.mjs --write\` over **${routes.length} routes** at **${WIDTHS.join('px and ')}px**`,
      `(${visited} route visits). Both breakpoints are required: ~87 blocks in this app are`,
      'gated behind `sm:hidden` / `hidden sm:flex`, so a desktop-only pass cannot see the',
      'mobile markup at all — it is `display:none`, and the scanner correctly ignores nodes',
      'that are not rendered.',
      '',
      '| Class | Meaning | Count |',
      '|---|---|---:|',
      `| **A** | translated, not wired | ${totals.A} |`,
      `| **B** | key exists, value empty or identity | ${totals.B} |`,
      `| **C** | no dictionary key | ${totals.C} |`,
      `| | **Distinct English strings on screen** | **${totals.distinctStrings}** |`,
      '',
      '**Known blind spots** — this number is a floor, not a ceiling:',
      '',
      '- Interaction-gated UI (modals, bottom sheets, dropdowns, toasts, the tour overlay)',
      '  is never mounted by a plain navigation, so its copy is not counted.',
      '- Only two of the four audited widths are scanned.',
      '- Only one miqaat fixture (`ashara-1448`) and one auth state are exercised.',
      '',
      'Full per-string detail incl. routes: `artifacts/audit/dom-scan.json` (regenerated, not committed).',
      '',
      '<!-- SCANNER_BASELINE_END -->',
    ].join('\n')
    writeFileSync(DOC, md.replace(/<!-- SCANNER_BASELINE_START -->[\s\S]*?<!-- SCANNER_BASELINE_END -->/, block))
    console.log('patched docs/lsd-gaps.md')
  }
} finally {
  await browser.close()
  server.kill()
}
