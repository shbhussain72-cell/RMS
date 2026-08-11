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

/** The seed as the app will read it — the source the per-route counts are checked against. */
const SEED = JSON.parse(readFileSync(resolve(ROOT, 'docs/sticky-notes-seed.json'), 'utf8'))

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

/**
 * Click a download control and return WHAT WAS DOWNLOADED.
 *
 * The blob handed to `URL.createObjectURL` is captured rather than the saved file, because
 * `export.ts` revokes the object URL on the line after `a.click()` and a download racing that
 * revoke is the flakiest thing a suite like this can contain. The blob IS the file's bytes — the
 * browser has nothing else to write.
 *
 * The download EVENT is awaited alongside, because "produced the right bytes" and "actually
 * downloaded, under the right name" are two claims and the blob alone only makes the first.
 *
 * `binary` returns a data URL instead of text, so the PNG can be decoded back into pixels.
 */
async function captureDownload(page, which, { binary = false } = {}) {
  await page.evaluate(() => {
    if (window.__grabPatched) return
    window.__grabPatched = true
    const real = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      window.__grab = blob.type === 'image/png' || blob.type === ''
        ? new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob) })
        : blob.text()
      return real(blob)
    }
  })
  const dl = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null)
  await page.locator(`[data-notes="${which}"]`).click()
  const downloaded = await dl
  const payload = await page.evaluate(() => window.__grab)
  await page.evaluate(() => { window.__grab = null })
  return {
    [binary ? 'dataUrl' : 'text']: payload,
    filename: downloaded ? downloaded.suggestedFilename() : null,
  }
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
    viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce', acceptDownloads: true,
  })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()

  await page.goto(BASE + CITY_A, { waitUntil: 'domcontentloaded' })
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, seeded: true, notes: [] })), NOTES_KEY)
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

  // ── 8. EXPORT RESPECTS THE FILTERS ─────────────────────────────────────────────────
  //
  // Under a NON-DEFAULT combination on every axis, because the unfiltered case is the one that
  // agrees by accident. The remarks export shipped for weeks exporting 28 while showing 2, and
  // an unfiltered test would have passed throughout.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(BASE + CITY_A, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, seeded: true, notes: [] })), NOTES_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  // A store that spans two routes, two statuses and both languages, so every axis has something
  // to exclude.
  await page.evaluate(([k, lg]) => {
    const other = lg === 'lsd' ? 'en' : 'lsd'
    const at = (n) => new Date(Date.UTC(2026, 7, 10, 1, n)).toISOString()
    localStorage.setItem(k, JSON.stringify({ v: 1, seeded: true, notes: [
      { id: 'k1', text: 'keep me one', route: '/miqaats/:id/city', lang: lg, status: 'open', createdAt: at(1), author: 'harness' },
      { id: 'k2', text: 'keep me two', route: '/miqaats/:id/city', lang: lg, status: 'open', createdAt: at(2), author: 'harness' },
      { id: 'x1', text: 'wrong status', route: '/miqaats/:id/city', lang: lg, status: 'resolved', createdAt: at(3), author: 'harness' },
      { id: 'x2', text: 'wrong language', route: '/miqaats/:id/city', lang: other, status: 'open', createdAt: at(4), author: 'harness' },
      { id: 'x3', text: 'wrong route', route: '/login', lang: lg, status: 'open', createdAt: at(5), author: 'harness' },
      { id: 'x4', text: 'wrong route and status', route: '/login', lang: lg, status: 'resolved', createdAt: at(6), author: 'harness' },
    ] }))
  }, [NOTES_KEY, lang])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  await openBoard(page)
  await page.locator(`[data-notes="filter-lang-${lang}"]`).click()
  await page.waitForTimeout(150)   // sleep: the filter re-renders off a store subscription with no completion event

  const total = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).notes.length, NOTES_KEY)
  const rows = await page.locator('[data-notes="row"]').count()
  check(`${lang}: the filter actually excludes something (else the rest is vacuous)`,
    rows > 0 && rows < total, `${rows} rendered of ${total} stored`)

  for (const kind of ['md', 'png', 'json']) {
    const n = Number(((await page.locator(`[data-notes="count-${kind}"]`).textContent()) || '').replace(/[^0-9]/g, ''))
    check(`${lang}: the ${kind} button's count is the rendered row count`, n === rows, `button ${n}, rows ${rows}`)
  }

  const json = await captureDownload(page, 'export-json')
  const records = JSON.parse(json.text)
  check(`${lang}: the JSON file holds exactly the rendered rows`,
    Array.isArray(records) && records.length === rows, `${records.length} exported, ${rows} rows`)
  const wrong = records.filter((r) => r.route !== CITY_PATTERN || r.status !== 'open' || r.lang !== lang)
  check(`${lang}: every exported record satisfies the filter`, wrong.length === 0,
    `${wrong.length} records do not: ${wrong.map((r) => r.id).join(',')}`)
  check(`${lang}: the JSON filename names the route and the date`,
    /^review-notes_miqaats-id-city_\d{4}-\d{2}-\d{2}\.json$/.test(json.filename), json.filename)

  const md = await captureDownload(page, 'export-md')
  const numbered = (md.text.match(/^\d+\. /gm) || []).length
  check(`${lang}: the Markdown file holds exactly the rendered rows`, numbered === rows,
    `${numbered} numbered lines, ${rows} rows`)
  check(`${lang}: the Markdown header states the filter the board is showing`,
    md.text.split('\n')[0].includes(CITY_PATTERN) && md.text.split('\n')[0].includes(lang === 'lsd' ? 'LSD' : 'EN')
    && md.text.split('\n')[0].includes('open'), JSON.stringify(md.text.split('\n')[0]))
  check(`${lang}: the Markdown summary counts the same notes`,
    md.text.includes(`## Screens covered: 1   Notes: ${rows}`),
    (md.text.match(/## Screens covered.*/) || ['(no summary line)'])[0])
  const excluded = ['wrong status', 'wrong language', 'wrong route']
    .filter((t) => md.text.includes(t))
  check(`${lang}: nothing the filter excluded is in the Markdown`, excluded.length === 0,
    `still present: ${excluded.join(', ')}`)

  // ── 9. THE PNG IS THE PAGE, NOT THE BOARD ──────────────────────────────────────────
  //
  // Measured on the pixels. "It produced a PNG" is not the claim — the claim is that somebody
  // can forward it and see the screen, so the image has to be page-width, taller than the page
  // (the note strip is added below it), carry the AppBar's colour near the top, and carry the
  // strip's colour at the bottom. A board-only capture is ~360px wide and fails the first.
  const png = await captureDownload(page, 'export-png', { binary: true })
  const shot = await page.evaluate(async (dataUrl) => {
    const img = await createImageBitmap(await (await fetch(dataUrl)).blob())
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const cx = c.getContext('2d')
    cx.drawImage(img, 0, 0)
    const at = (x, y) => {
      const d = cx.getImageData(Math.round(x), Math.round(y), 1, 1).data
      return { r: d[0], g: d[1], b: d[2] }
    }
    return {
      w: img.width, h: img.height,
      top: at(img.width / 2, img.height * 0.02),
      strip: at(img.width / 2, img.height - 12),
      viewport: { w: innerWidth, h: document.documentElement.scrollHeight },
    }
  }, png.dataUrl)

  check(`${lang}: the PNG is as wide as the page, not as wide as the board`,
    shot.w >= shot.viewport.w * 0.9, `image ${shot.w}px, viewport ${shot.viewport.w}px`)
  check(`${lang}: the PNG is taller than the page it captured — the notes are appended below it`,
    shot.h > shot.w * 0.2 && shot.h > 200, `${shot.w}x${shot.h}`)
  // The AppBar is a dark green gradient; white here would mean an empty capture.
  const dark = shot.top.r < 200 && shot.top.g < 200 && shot.top.b < 200
  check(`${lang}: the top of the PNG is the app, not blank`, dark,
    `rgb(${shot.top.r},${shot.top.g},${shot.top.b}) at 2% height`)
  // #fff8cf, the note strip.
  const isStrip = Math.abs(shot.strip.r - 255) < 12 && Math.abs(shot.strip.g - 248) < 14 && Math.abs(shot.strip.b - 207) < 20
  check(`${lang}: the bottom of the PNG is the note strip`, isStrip,
    `rgb(${shot.strip.r},${shot.strip.g},${shot.strip.b}) at the last row`)
  check(`${lang}: the PNG filename names the route and the date`,
    /^review-notes_miqaats-id-city_\d{4}-\d{2}-\d{2}\.png$/.test(png.filename), png.filename)

  // The board comes back after the capture. It is closed to get out of the shot, and a tool that
  // disappears when you use it is a tool people stop using.
  check(`${lang}: the board reopens after the capture`,
    (await page.locator('[data-notes="board"]').count()) === 1)

  await ctx.close()
}

/**
 * Seeding and import, in a browser that has never seen this tool.
 *
 * A SEPARATE CONTEXT, not a cleared key in the one above. The seed runs when the stored board is
 * absent, and every earlier section deliberately starts from `{seeded: true, notes: []}` so that
 * 48 notes do not land in the middle of a fixture about two. Sharing a context would mean either
 * this section or those cannot test what they are for.
 */
async function runSeedAndImport(browser, lang, port) {
  const BASE = `http://localhost:${port}`
  console.log(`\n─── ${lang}: seeding and import (fresh browser) ───`)

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce', acceptDownloads: true,
  })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()

  // Nothing is written to NOTES_KEY here. That absence IS the precondition.
  await page.goto(BASE + LIST, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  const stored = await storedNotes(page)
  check(`${lang}: a fresh browser is seeded with all ${SEED.length} recovered notes`,
    stored?.length === SEED.length, `${stored?.length ?? 'null'} placed`)

  // PER ROUTE, against the file — not against a table of numbers typed into this suite, which
  // would go out of date the next time the seed is regenerated and would then be asserting the
  // old file.
  const expected = {}
  for (const n of SEED) expected[n.route] = (expected[n.route] ?? 0) + 1
  const got = {}
  for (const n of stored ?? []) got[n.route] = (got[n.route] ?? 0) + 1
  const wrongRoutes = Object.keys(expected).filter((r) => expected[r] !== got[r])
  check(`${lang}: every seeded note is on the route the file gives it`, wrongRoutes.length === 0,
    wrongRoutes.map((r) => `${r}: file ${expected[r]}, board ${got[r] ?? 0}`).join(' | ')
    || `${Object.keys(expected).length} routes match`)
  console.log(`    per-route: ${Object.entries(expected).sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `${r} ${got[r] ?? 0}/${c}`).join(', ')}`)

  // And they are actually ON the page, not merely in storage. `/miqaats` carries the most.
  await openBoard(page)
  await page.locator('[data-notes="filter-status-all"]').click()
  await page.waitForTimeout(200)   // sleep: the filter re-renders off a store subscription with no completion event
  const shownHere = await page.locator('[data-notes="row"]').count()
  check(`${lang}: the seeded notes for this screen are rendered on it`,
    shownHere === expected[LIST], `${shownHere} rows, file says ${expected[LIST]}`)

  // The recovered context line, where the file had one.
  const withElement = await page.locator('[data-notes="element"]').count()
  check(`${lang}: recovered notes show what they were pinned to`, withElement > 0,
    `${withElement} of ${shownHere} rows carry a "was on" line`)

  // ── the seed does not come back ────────────────────────────────────────────────────
  //
  // The behaviour that makes the board trustworthy. A delete that does not stay deleted means
  // nothing on the board can be relied on.
  const before = (await storedNotes(page)).length
  await page.locator('[data-notes="delete"]').first().click()
  await page.waitForTimeout(200)   // sleep: the delete writes through the store subscription, which has no completion event
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  const after = (await storedNotes(page)).length
  check(`${lang}: a deleted note stays deleted across a reload — the seed does not re-run`,
    after === before - 1, `${before} -> ${after}`)

  // ── import: the same file twice adds nothing the second time ───────────────────────
  await openBoard(page)
  await page.locator('[data-notes="filter-scope-all"]').click()
  await page.locator('[data-notes="filter-status-all"]').click()
  await page.waitForTimeout(200)   // sleep: two filter writes settle through the same subscription
  const exported = await captureDownload(page, 'export-json')
  const file = JSON.parse(exported.text)
  check(`${lang}: the JSON export holds the whole board to import back`,
    file.length === after, `${file.length} exported, ${after} on the board`)

  // The file is handed to the real <input type=file>, so the assertion covers the reader and the
  // handler rather than the pure planner the unit tests already cover.
  const setFile = async (contents) => {
    await page.locator('[data-notes="import-input"]').setInputFiles({
      name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contents)),
    })
    await page.locator('[data-notes="import-note"]').waitFor({ timeout: 10_000 })
    return page.locator('[data-notes="import-note"]').textContent()
  }

  const again = await setFile(file)
  check(`${lang}: re-importing the same file adds nothing and says so`,
    /0 added/.test(again) && new RegExp(`${file.length} already here`).test(again), again)
  check(`${lang}: re-importing the same file did not change the board`,
    (await storedNotes(page)).length === after, `${(await storedNotes(page)).length} notes`)

  // One genuinely new note in an otherwise-identical file.
  const mixed = [...file, {
    text: `imported from elsewhere (${lang})`, route: LIST, lang, status: 'open',
    createdAt: '2026-01-02T03:04:05.678Z', author: 'someone else',
  }]
  const mixedNote = await setFile(mixed)
  check(`${lang}: a file with one new note adds exactly one`,
    /1 added/.test(mixedNote) && new RegExp(`${file.length} already here`).test(mixedNote), mixedNote)
  check(`${lang}: the imported note is on the board`,
    (await page.locator(`[data-notes="row"]:has-text(${JSON.stringify(`imported from elsewhere (${lang})`)})`).count()) === 1)
  check(`${lang}: import merged rather than replaced`,
    (await storedNotes(page)).length === after + 1, `${(await storedNotes(page)).length} notes, expected ${after + 1}`)

  // A file that is not a notes export must SAY so. "0 added" would read as "your file was empty".
  const wrongFile = await setFile({ notes: [] })
  check(`${lang}: a file that is not a notes export is reported, not silently ignored`,
    /not a notes export/i.test(wrongFile), wrongFile)

  await ctx.close()
}

const port = await freePort()
const server = await serve(port)
const browser = await chromium.launch()
try {
  await runLang(browser, 'en', port)
  await runSeedAndImport(browser, 'en', port)
  await runLang(browser, 'lsd', port)
  await runSeedAndImport(browser, 'lsd', port)
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
