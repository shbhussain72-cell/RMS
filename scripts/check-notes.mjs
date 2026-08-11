/**
 * check-notes.mjs — the page-level notes board, in a real browser, in both languages.
 *
 *   npm run check:notes
 *
 * Runs against `vite dev` with `VITE_REVIEW_TOOLS=true`, because the board does not exist
 * without the flag and a suite that forgets to set it fails as a locator timeout on
 * `[data-notes="chip"]` — which reads as a flaky selector rather than "the feature was never
 * mounted". `check-remarks` lost two days to exactly that; the flag is set in `serve()` below
 * and the mount is asserted before anything else is attempted.
 *
 * ── WHAT IS WORTH ASSERTING HERE RATHER THAN IN VITEST ───────────────────────────────
 *
 * The pure parts — filtering, the export shapes, the import merge — are unit-tested in
 * `scripts/notes.test.mjs`, where a failure names the function. What needs a browser is
 * everything that involves the ROUTER and localStorage together: that a note follows its route
 * PATTERN across two different miqaat ids, that it survives a reload, that a corrupt stored
 * value resets rather than taking the board down. None of those can be observed without a real
 * navigation and a real page load.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'
import { createArrival } from './arrival.mjs'
import { waitForApp } from './arrival.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The real walkthrough keys, read from the source.
 *
 * The tour is a `z-[1000]` modal on a first visit and it correctly intercepts every click —
 * that is the tour working. A made-up sentinel does not mark it seen, and the consequence
 * arrives 30 seconds later as a click timeout on whichever control the suite reached first,
 * which names the control and not the cause.
 */
const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]

/** Two ids, ONE pattern. The whole point of keying on the pattern. */
const CITY_A = '/miqaats/ashara-1448/city'
const CITY_B = '/miqaats/miss-zone/city'
const CITY_PATTERN = '/miqaats/:id/city'
/** A different pattern entirely, for the "each page shows only its own" half. */
const LIST = '/miqaats'

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function freePort() {
  return new Promise((ok) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
  })
}

async function serve(port) {
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_REVIEW_TOOLS: 'true' },
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('dev server did not start')), 90_000)
    const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1200) } }
    proc.stdout.on('data', w)
    proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
  })
  return proc
}

/**
 * The author is seeded, and that is a precondition rather than a convenience: unseeded, the
 * board opens with IdentityPrompt at the top and that prompt autofocuses its name field, so the
 * first thing typed lands in the name instead of the note.
 */
const seed = (lang) => `
  try {
    localStorage.setItem('rms-remark-author', 'harness');
    localStorage.setItem('rms-lang', ${JSON.stringify(lang)});
    const prev = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...prev, state: { ...(prev.state || {}), loggedIn: true }, version: prev.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

const NOTES_KEY = 'rms-notes.v1'

async function openBoard(page) {
  if (!(await page.locator('[data-notes="board"]').count())) {
    await page.locator('[data-notes="chip"]').click()
  }
  await page.locator('[data-notes="board"]').waitFor({ state: 'visible' })
}

/** Write a note through the UI, the way a reviewer does. */
async function addNote(page, text) {
  await openBoard(page)
  await page.locator('[data-notes="input"]').fill(text)
  await page.locator('[data-notes="add"]').click()
  await page.locator(`[data-notes="row"]:has-text(${JSON.stringify(text)})`).waitFor({ timeout: 5000 })
}

const storedNotes = (page) => page.evaluate((k) => {
  try { return JSON.parse(localStorage.getItem(k) || '{}').notes || [] } catch { return null }
}, NOTES_KEY)

async function runLang(browser, lang, port) {
  const BASE = `http://localhost:${port}`
  console.log(`\n─── ${lang} (${lang === 'lsd' ? 'RTL' : 'LTR'}) ───`)

  // Two widths x three routes visited below; derived rather than typed, so a route added to the
  // walk cannot leave the floor behind.
  const ROUTES = [CITY_A, CITY_B, LIST]
  const arrival = createArrival({ expected: ROUTES.length * NARROW_WIDTHS.length })

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
  })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()

  await page.goto(BASE + CITY_A, { waitUntil: 'domcontentloaded' })
  await page.evaluate((k) => localStorage.removeItem(k), NOTES_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  // Before anything else: is the tool here at all? Every assertion below is about the board, so
  // with the flag off they would not fail — they would time out one locator at a time.
  const mounted = await page.locator('[data-notes="chip"]').count()
  check(`${lang}: the notes board is mounted (VITE_REVIEW_TOOLS)`, mounted > 0,
    mounted ? '' : 'no [data-notes="chip"] — the dev server was started without the flag')
  if (!mounted) { await ctx.close(); return }

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
  check(`${lang}: document dir is ${lang === 'lsd' ? 'rtl' : 'ltr'}`,
    dir === (lang === 'lsd' ? 'rtl' : 'ltr'), `got ${dir}`)

  // ── 1. a note is written, and it is still there after a reload ─────────────────────
  const A = `note on the city screen (${lang})`
  await addNote(page, A)
  let stored = await storedNotes(page)
  check(`${lang}: the note reaches storage`, stored?.length === 1 && stored[0].text === A,
    `${stored?.length ?? 'null'} stored`)
  check(`${lang}: it is filed against the route PATTERN, not the pathname`,
    stored?.[0]?.route === CITY_PATTERN, `filed against ${stored?.[0]?.route}`)
  check(`${lang}: the language is recorded from the app, not asked for`,
    stored?.[0]?.lang === lang, `recorded ${stored?.[0]?.lang}`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  await openBoard(page)
  check(`${lang}: the note survives a reload`,
    (await page.locator(`[data-notes="row"]:has-text(${JSON.stringify(A)})`).count()) === 1)

  // ── 2. the same pattern, a different miqaat id ─────────────────────────────────────
  //
  // This is the claim the whole route-pattern design exists for: a finding about the city
  // screen is about that screen for every miqaat. Keying on the pathname would hide it from
  // the next person who opened a different one.
  await page.goto(BASE + CITY_B, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  await openBoard(page)
  check(`${lang}: a note written on one miqaat's city screen shows on another's`,
    (await page.locator(`[data-notes="row"]:has-text(${JSON.stringify(A)})`).count()) === 1,
    `${CITY_A} -> ${CITY_B}`)

  // ── 3. a different pattern shows only its own ──────────────────────────────────────
  const B = `note on the miqaat list (${lang})`
  await page.goto(BASE + LIST, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  await openBoard(page)
  check(`${lang}: the city note does NOT show on the list screen`,
    (await page.locator(`[data-notes="row"]:has-text(${JSON.stringify(A)})`).count()) === 0)
  await addNote(page, B)
  const rowsHere = await page.locator('[data-notes="row"]').count()
  check(`${lang}: the list screen shows only its own note`, rowsHere === 1, `${rowsHere} rows`)

  stored = await storedNotes(page)
  check(`${lang}: both notes are in one store, on two routes`,
    stored?.length === 2 && new Set(stored.map((n) => n.route)).size === 2,
    `${stored?.length} notes on ${new Set(stored?.map((n) => n.route)).size} routes`)

  // ── 4. resolve HIDES behind a filter; it does not delete ───────────────────────────
  await page.locator('[data-notes="resolve"]').first().click()
  await page.locator('[data-notes="empty"]').waitFor({ timeout: 5000 })
  check(`${lang}: a resolved note leaves the default (open) view`,
    (await page.locator('[data-notes="row"]').count()) === 0)
  stored = await storedNotes(page)
  check(`${lang}: resolving did not delete it`,
    stored?.length === 2 && stored.some((n) => n.status === 'resolved'),
    `${stored?.length} still stored`)
  await page.locator('[data-notes="filter-status-resolved"]').click()
  check(`${lang}: the resolved filter finds it again`,
    (await page.locator('[data-notes="row"]').count()) === 1)
  await page.locator('[data-notes="filter-status-open"]').click()

  // ── 5. a corrupt stored value resets rather than throwing ──────────────────────────
  //
  // Asserted as the OUTCOME a reviewer sees — the board still opens and still takes a note —
  // not as "readBoard returned EMPTY", which is the mechanism and is unit-tested elsewhere.
  await page.evaluate((k) => localStorage.setItem(k, '{"v":1,"notes":"not an array"'), NOTES_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  const survived = await page.locator('[data-notes="chip"]').count()
  check(`${lang}: a corrupt stored value does not take the board down`, survived === 1,
    survived ? '' : 'the chip is gone — something threw on read')
  await openBoard(page)
  const C = `written after the reset (${lang})`
  await addNote(page, C)
  check(`${lang}: the board is usable again after the reset`,
    (await page.locator(`[data-notes="row"]:has-text(${JSON.stringify(C)})`).count()) === 1)

  // ── 6. it does not block the page underneath ───────────────────────────────────────
  const intercepts = await page.evaluate(() => {
    // probe-dom: point is chosen, not derived from a rect — the centre of the viewport.
    const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2))
    return !!el?.closest('[data-notes],[data-devdock]')
  })
  check(`${lang}: the board does not intercept clicks over the app`, !intercepts)

  // ── 7. arrival, at both widths, across all three routes ────────────────────────────
  for (const width of NARROW_WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
      await waitForApp(page)
      if (!(await arrival.visit(page, route, `${lang}@${width}`))) continue
      await openBoard(page)
      const box = await page.locator('[data-notes="board"]').boundingBox()
      check(`${lang}@${width}: the board fits inside the viewport on ${route}`,
        box && box.x >= 0 && box.x + box.width <= width + 1,
        box ? `x ${Math.round(box.x)} w ${Math.round(box.width)}` : 'no board')
    }
  }
  const problems = arrival.verify()
  check(`${lang}: every route the board was measured on actually rendered`,
    problems.length === 0, problems.slice(0, 2).join(' | '))

  await ctx.close()
}

const port = await freePort()
const server = await serve(port)
const browser = await chromium.launch()
try {
  await runLang(browser, 'en', port)
  await runLang(browser, 'lsd', port)
} finally {
  await browser.close()
  server.kill()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('\nFAILURES:')
  failed.forEach((f) => console.log(`  ${f.name}  — ${f.detail}`))
}
process.exit(failed.length ? 1 : 0)
