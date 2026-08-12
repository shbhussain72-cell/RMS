/**
 * check-notes.mjs — the page-level notes board, in a real browser, in both languages.
 *
 *   npm run check:notes
 *
 * ── IT SERVES THE PRODUCTION BUNDLE, NOT `vite dev` ──────────────────────────────────
 *
 * It ran against the dev server until 11 Aug, and the report that changed it was: on the
 * deployed site the board only appears on /login. Every assertion here was green, and every
 * one of them was about a bundle nobody ships.
 *
 * A dev server transforms modules on demand, keeps React's development build, and never runs
 * Rollup — so minification, the tree-shaking of the `REVIEW_TOOLS` branch, chunk splitting and
 * the production React runtime were all outside anything this suite could see. That is the same
 * class of gap as the stale `dist/` `check-chrome` sat on for four days: a true verdict about
 * the wrong artefact. The bundle a reviewer opens is the one worth asserting on.
 *
 * `ensureDist({ reviewTools: true })` therefore builds or refuses before anything starts.
 * Flag-ON because the board does not exist without it, and a suite that forgets fails as a
 * locator timeout on `[data-notes="chip"]` — which reads as a flaky selector rather than "the
 * feature was never mounted"; `check-remarks` lost two days to exactly that. The flag now lives
 * in the BUILD rather than in the server's environment, and it has to: `vite preview` serves
 * bytes, and no environment variable can put a compile-time constant into bytes already written.
 *
 * ── WHAT MOVING OFF THE DEV SERVER GIVES UP, STATED ──────────────────────────────────
 *
 * StrictMode double-invokes effects in React's development build and NOT in its production one,
 * so the seeding effect runs once here where it used to run twice. What that protected — the
 * effect reading through `readBoard()` rather than through a hook snapshot taken before its own
 * write — is asserted in `scripts/notes.test.mjs` against `planSeed`, which answers "would a
 * second call add anything" without needing a browser to invoke it twice. That is its right
 * home: idempotence is a property of the function, not of the render that calls it.
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
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'
import { createArrival } from './arrival.mjs'
import { waitForApp } from './arrival.mjs'
import { ensureDist } from './lib/dist-precondition.mjs'
import { freePort, startPreview, finish } from './lib/preview-server.mjs'

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
 * How many of the 48 recovered notes point at something that is still there.
 *
 * The brief asked for the number, and it is not a number this suite can hold: it depends on the
 * app's current copy, which changes. So it is REPORTED, and what is ASSERTED is the invariant that
 * makes the number trustworthy — every note the board showed is accounted for as exactly one of
 * marked, page-level, or pointing at something no longer here. A resolver that quietly dropped
 * notes would still print a plausible total; it could not keep that sum.
 *
 * English only, and deliberately. The seeded labels are mostly English strings captured from an
 * English session, so the LSD figure measures how much of the app is translated rather than how
 * well the resolver works — and ten more full-page captures is 25 seconds for a number that means
 * something else.
 */
async function runSeedResolution(browser, port) {
  const BASE = `http://localhost:${port}`
  console.log('\n─── en: how much of the recovered seed still points at something ───')

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce', acceptDownloads: true,
  })
  await ctx.addInitScript(seed('en'))
  const page = await ctx.newPage()

  const openBySeed = {}
  for (const n of SEED) if (n.status !== 'resolved') openBySeed[n.route] = (openBySeed[n.route] ?? 0) + 1

  const num = (text, re) => Number(re.exec(text)?.[1] ?? 0)
  const totals = { marked: 0, missing: 0, pageLevel: 0, ambiguous: 0, shown: 0 }
  const perRoute = []

  for (const pattern of Object.keys(openBySeed)) {
    const url = pattern.replace(':id', 'ashara-1448')
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
    await waitForApp(page, { minChars: 120 })
    await page.locator('[data-notes="chip"]').waitFor({ timeout: 10_000 })
    await openBoard(page)

    const rows = await page.locator('[data-notes="row"]').count()
    await page.locator('[data-notes="export-png"]').click()
    await page.locator('[data-notes="png-note"]').waitFor({ timeout: 30_000 })
    const said = (await page.locator('[data-notes="png-note"]').textContent()) ?? ''

    const marked = num(said, /(\d+) marked on the page/)
    const pageLevel = num(said, /(\d+) about the whole screen/)
    const missing = num(said, /(\d+) pointed at something no longer here/)
    const ambiguous = num(said, /(\d+) matched more than one thing/)
    totals.marked += marked
    totals.pageLevel += pageLevel
    totals.missing += missing
    totals.ambiguous += ambiguous
    totals.shown += rows
    perRoute.push(`${pattern} ${marked}/${rows}`)

    check(`en: ${pattern} accounts for every note it showed`,
      marked + pageLevel + missing === rows,
      `${marked} marked + ${pageLevel} page-level + ${missing} gone = ${marked + pageLevel + missing}, board showed ${rows}`)
  }

  const openTotal = Object.values(openBySeed).reduce((a, b) => a + b, 0)
  check('en: every open seeded note was reached on some screen', totals.shown === openTotal,
    `${totals.shown} shown across ${perRoute.length} screens, ${openTotal} open in the file`)
  console.log(`    marked per route: ${perRoute.join(', ')}`)
  console.log(`    OF THE ${SEED.length} RECOVERED NOTES: ${totals.marked} resolve to a marker, `
    + `${totals.pageLevel} are about the screen as a whole, ${totals.missing} point at text that has gone, `
    + `${totals.ambiguous} matched more than one element (${SEED.length - openTotal} are resolved and were not shown)`)

  await ctx.close()
}

/**
 * Markers — a note points at something, and the PNG shows where.
 *
 * ── WHAT IS ASSERTED ON PIXELS, AND WHAT CANNOT BE ───────────────────────────────────
 *
 * The badge POSITIONS are read off the image: the expected centre is computed from the element's
 * own rect, and the image is sampled there for the badge's ring-and-face pattern. That is the
 * claim worth making — "a PNG was produced" says nothing about whether the numbers point at the
 * right controls, and a marker two hundred pixels off is worse than no marker.
 *
 * What is NOT asserted on pixels is the strip's PROSE. Reading a rasterised sentence back needs
 * OCR, which is a dependency and a new class of flake. The disclosures are asserted instead on
 * the line the board renders after an export, which `capturePage` builds from the very same plan
 * that drew the strip — one plan, two renderings, so they cannot drift apart — and the plan's own
 * numbering and caveats are unit-tested in notes.test.mjs where a failure names the function.
 */
async function runMarkers(browser, lang, port, width) {
  const BASE = `http://localhost:${port}`
  console.log(`\n─── ${lang} @ ${width}px: pointing and markers ───`)

  const ctx = await browser.newContext({
    viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce', acceptDownloads: true,
  })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()
  await page.goto(BASE + LIST, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  /**
   * The targets are CHOSEN FROM THE PAGE, not typed into this suite.
   *
   * Hard-coding "Register now" would make this a test of the app's copy: the day somebody renames
   * a button, a suite about marker geometry fails and names the wrong thing. The survey asks the
   * live page for one element with a unique label, one label carried by several elements, and one
   * unique label below the fold — which is also what keeps it honest when the screen changes.
   */
  const survey = () => page.evaluate(() => {
    const CH = '[data-devdock], [data-notes]'
    const label = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()
    const body = document.body.getBoundingClientRect()
    const els = [...document.body.querySelectorAll('*')].filter((el) => {
      if (el.closest(CH)) return false
      const r = el.getBoundingClientRect()
      return r.width > 24 && r.height > 12
    })
    const counts = new Map()
    for (const el of els) { const l = label(el); if (l) counts.set(l, (counts.get(l) || 0) + 1) }
    const info = (el) => {
      const r = el.getBoundingClientRect()
      return {
        label: label(el), tag: el.tagName.toLowerCase(), count: counts.get(label(el)),
        left: r.left - body.left, right: r.right - body.left, top: r.top - body.top,
        width: r.width, height: r.height,
      }
    }
    const usable = (l) => l.length > 3 && l.length < 40
    const inView = (el) => {
      const r = el.getBoundingClientRect()
      return r.top > 60 && r.bottom < innerHeight - 40
    }
    const unique = els.find((el) => usable(label(el)) && counts.get(label(el)) === 1 && inView(el))
    // THE AMBIGUOUS PAIR MUST SHARE A TAG. A label carried by a <div> and by the <h3> inside it
    // is not ambiguous to the resolver — the stored tag decides between them, which is the whole
    // job of the tag. Picking such a pair here asserted that the disclosure fires when it should
    // not, and it did not fire, correctly, at 1440px where the first repeated label was of that
    // shape. Two elements, same text, same tag is the case the reviewer needs telling about.
    const byTag = new Map()
    for (const el of els) {
      const l = label(el)
      if (l) byTag.set(l + '\u0000' + el.tagName.toLowerCase(), (byTag.get(l + '\u0000' + el.tagName.toLowerCase()) || 0) + 1)
    }
    const dupEntry = [...byTag.entries()].find(([k, c]) => c > 1 && usable(k.split('\u0000')[0]))
    const dup = dupEntry
      ? els.find((el) => label(el) + '\u0000' + el.tagName.toLowerCase() === dupEntry[0])
      : null
    const below = els.find((el) => usable(label(el)) && counts.get(label(el)) === 1
      && el.getBoundingClientRect().top > innerHeight + 60)
    return {
      unique: unique ? info(unique) : null,
      dup: dup ? { ...info(dup), count: dupEntry[1] } : null,
      below: below ? info(below) : null,
      viewportH: innerHeight,
      clientW: document.documentElement.clientWidth,
      scrollH: document.documentElement.scrollHeight,
      rtl: document.documentElement.getAttribute('dir') === 'rtl',
    }
  })

  const found = await survey()
  const have = ['unique', 'dup', 'below'].filter((k) => found[k])
  check(`${lang} @${width}: the screen offers a unique label, a repeated one and one below the fold`,
    have.length === 3, `found: ${have.join(', ') || 'none'}`)
  if (have.length !== 3) { await ctx.close(); return }

  const MISSING = 'ZZ this text is not anywhere on this screen ZZ'
  const fixture = [
    { text: 'pointed at a unique thing', target: { label: found.unique.label, tag: found.unique.tag } },
    { text: 'pointed at a repeated thing', target: { label: found.dup.label, tag: found.dup.tag } },
    { text: 'pointed at something below the fold', target: { label: found.below.label, tag: found.below.tag } },
    { text: 'pointed at something that has gone', target: { label: MISSING } },
    { text: 'about the whole screen' },
  ].map((n, i) => ({
    id: `m${i}`, route: LIST, lang, status: 'open', author: 'harness',
    createdAt: `2026-08-12T0${i}:00:00.000Z`, ...n,
  }))
  // A RESOLVED note that also points at something, to prove the image obeys the filter: the board
  // defaults to open-only, so this one must not be counted, marked, or listed.
  fixture.push({
    id: 'mR', route: LIST, lang, status: 'resolved', author: 'harness',
    createdAt: '2026-08-12T08:00:00.000Z',
    text: 'resolved, and pointing at the same unique thing',
    target: { label: found.unique.label, tag: found.unique.tag },
  })

  await page.evaluate(([key, board]) => localStorage.setItem(key, JSON.stringify(board)),
    [NOTES_KEY, { v: 1, seeded: true, notes: fixture }])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  // Rects again AFTER the reload. The fixture was chosen from the previous load, and a rect from
  // before a reload describes a layout that no longer exists — the badge is compared against where
  // the element is NOW, which is what the capture saw.
  const now = await survey()

  await openBoard(page)
  const rows = await page.locator('[data-notes="row"]').count()
  check(`${lang} @${width}: the board shows the five open notes, not the resolved one`,
    rows === 5, `${rows} rows`)

  // ── the page must come back exactly as it was ──────────────────────────────────────
  //
  // THE PAGE, WITH THE DEV CHROME TAKEN OUT — the same subject the capture has. Counting the
  // whole body made this fail for a true reason that was not the one being asked about: the
  // board legitimately grows a status line after an export, so the tool changed and the page did
  // not. An assertion that cannot tell those apart reports the feature working as a leak.
  const pageDom = () => page.evaluate(() => {
    const clone = document.body.cloneNode(true)
    clone.querySelectorAll('[data-devdock], [data-notes]').forEach((el) => el.remove())
    return {
      elements: clone.querySelectorAll('*').length,
      html: clone.innerHTML.length,
      strays: document.querySelectorAll('[data-notes-badge]').length,
    }
  })
  const domBefore = await pageDom()

  const png = await captureDownload(page, 'export-png', { binary: true })
  const summary = (await page.locator('[data-notes="png-note"]').textContent()) ?? ''
  check(`${lang} @${width}: the board reports what the image drew, filter and all`,
    /3 marked on the page/.test(summary) && /1 about the whole screen/.test(summary)
    && /1 matched more than one thing/.test(summary) && /1 pointed at something no longer here/.test(summary),
    summary)

  const domAfter = await pageDom()
  check(`${lang} @${width}: the page is unchanged by the capture — nothing was inserted for it`,
    domAfter.elements === domBefore.elements && domAfter.html === domBefore.html && domAfter.strays === 0,
    `${domBefore.elements}->${domAfter.elements} elements, ${domBefore.html}->${domAfter.html} chars`)

  /**
   * Badge detection: a ring of dark pixels around a light face.
   *
   * Two samples rather than one. A single centre pixel would be satisfied by any pale patch of the
   * page — and the face IS pale by design — so the ring is what makes it a badge rather than the
   * gap between two cards.
   */
  const shot = await page.evaluate(async ([dataUrl, probes, clientW]) => {
    const img = await createImageBitmap(await (await fetch(dataUrl)).blob())
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const cx = c.getContext('2d')
    cx.drawImage(img, 0, 0)
    const px = (x, y) => {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null
      const d = cx.getImageData(Math.round(x), Math.round(y), 1, 1).data
      return { r: d[0], g: d[1], b: d[2] }
    }
    const dark = (p) => !!p && p.r < 90 && p.g < 90 && p.b < 90
    const light = (p) => !!p && p.r > 200 && p.g > 200 && p.b > 200
    const at = (x, y, r) => {
      let ring = 0
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        if (dark(px(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92))) ring++
      }
      let face = 0
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        if (light(px(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55))) face++
      }
      return { ring, face }
    }
    const scale = img.width / clientW
    const out = {}
    for (const [name, p] of Object.entries(probes)) {
      out[name] = {
        ...at(p.x * scale, p.y * scale, 15 * scale),
        x: Math.round(p.x * scale), y: Math.round(p.y * scale),
      }
    }
    return { w: img.width, h: img.height, scale, probes: out }
  }, [png.dataUrl, badgeProbes(now, now.rtl), now.clientW])

  const isBadge = (p) => p.ring >= 8 && p.face >= 3
  const p = shot.probes
  check(`${lang} @${width}: the badge is drawn beside the element it points at`,
    isBadge(p.unique), `ring ${p.unique.ring}/12, face ${p.unique.face}/8 at ${p.unique.x},${p.unique.y}`)
  check(`${lang} @${width}: the badge is beside the element on the reading-start side, not over it`,
    !isBadge(p.centre), `the element's own centre reads ring ${p.centre.ring}/12, face ${p.centre.face}/8`)
  check(`${lang} @${width}: a target below the fold is marked where it sits in the DOCUMENT`,
    isBadge(p.below) && p.below.y > now.viewportH * shot.scale,
    `ring ${p.below.ring}/12 at y=${p.below.y}, fold at ${Math.round(now.viewportH * shot.scale)}`)
  check(`${lang} @${width}: the first of several identical labels is the one marked`,
    isBadge(p.dup), `ring ${p.dup.ring}/12, ${now.dup.count} elements read "${now.dup.label}"`)

  // ── a capture that throws must leave nothing behind either ────────────────────────
  //
  // The badges are drawn on the output canvas rather than inserted into the page, so this holds by
  // construction — which is exactly why it is worth asserting rather than assuming. A future
  // change that reaches for DOM insertion will pass every check above and fail this one.
  await page.evaluate(() => {
    const real = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function broken() { throw new Error('capture exploded') }
    window.__restoreToBlob = () => { HTMLCanvasElement.prototype.toBlob = real }
  })
  await openBoard(page)
  await page.locator('[data-notes="export-png"]').click()
  await page.locator('[data-notes="png-note"]').waitFor({ timeout: 15_000 })
  const failNote = await page.locator('[data-notes="png-note"]').textContent()
  const domFailed = await pageDom()
  await page.evaluate(() => window.__restoreToBlob?.())
  check(`${lang} @${width}: a capture that throws says so instead of failing silently`,
    /exploded/.test(failNote ?? ''), failNote ?? 'nothing said')
  check(`${lang} @${width}: a capture that throws leaves the page exactly as it was`,
    domFailed.elements === domBefore.elements && domFailed.strays === 0,
    `${domBefore.elements}->${domFailed.elements} elements, ${domFailed.strays} strays`)

  await ctx.close()
}

/**
 * Where each badge must be, computed from the element rects exactly as png.ts computes them.
 *
 * DELIBERATELY A SECOND IMPLEMENTATION of four lines of arithmetic. Importing the real one would
 * make the assertion "the code agrees with itself", which is true of any code; writing the offset
 * out again means an edit to either side has to be made twice, on purpose. The RTL case is where
 * it earns its keep — the two directions differ only in which edge they start from, and that is
 * the whole of the direction requirement.
 */
function badgeProbes(now, rtl) {
  const R = 15
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  // The clamp is not decoration. At 390px an element can span the full width, which puts the
  // reading-start side off the image entirely — so the badge is pulled to the edge and ends up
  // just inside the element instead of just outside it. Leaving it out of this copy is what made
  // lsd @390 fail while the badge was drawn exactly where it should have been.
  const beside = (el) => ({
    x: clamp(rtl ? el.right + R + 6 : el.left - R - 6, R + 2, now.clientW - R - 2),
    y: clamp(el.top + Math.min(el.height / 2, 20), R + 2, now.scrollH - R - 2),
  })
  return {
    unique: beside(now.unique),
    dup: beside(now.dup),
    below: beside(now.below),
    // The middle of the element itself: whatever is there, it must not be a badge.
    centre: { x: now.unique.left + now.unique.width / 2, y: now.unique.top + now.unique.height / 2 },
  }
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

  // ── PER ROUTE, COUNTED ON THE SCREEN — NOT IN THE STORE ────────────────────────────
  //
  // THIS CHECK USED TO TALLY `stored`, AND IT WAS WORTHLESS. A tally of the localStorage array
  // is the same ten numbers whether the board renders on ten screens or on one, so it agreed
  // with the file — and printed a per-route line that READ like "16 notes appear on /miqaats"
  // while only ever having established "16 notes carrying route=/miqaats were written". The
  // deployed app was reported showing notes on /login and nowhere else while this was green.
  // That is the whole failure: it measured the mechanism the feature uses instead of the
  // outcome the feature is for. See docs/assertion-discipline.md.
  //
  // So it now VISITS every route the file places a note on and counts the ROWS on each. The
  // stored total above is kept, because "48 written" and "48 shown, across ten screens" are two
  // different claims and both are worth making — but the per-route claim is made against the DOM.
  //
  // Three numbers per screen, because they fail in different directions:
  //   rows   — under the "all" status filter, so resolved notes count, matching the file's total
  //   routes — every row's own `data-notes-route`, so a screen showing ANOTHER screen's notes
  //            fails rather than passing on a count that happens to match
  //   chip   — the open count on the closed pill, which is the only number visible to somebody
  //            who has not opened the board, and the one that says "there is something here"
  const expected = {}
  const expectedOpen = {}
  for (const n of SEED) {
    expected[n.route] = (expected[n.route] ?? 0) + 1
    if (n.status !== 'resolved') expectedOpen[n.route] = (expectedOpen[n.route] ?? 0) + 1
  }

  const rendered = {}
  const wrongRoutes = []
  for (const pattern of Object.keys(expected)) {
    const url = pattern.replace(':id', 'ashara-1448')
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
    // 120 rather than the 300 default, and MEASURED rather than guessed: of the twenty screens
    // this loop visits, the shortest is the login screen at 177 characters in English and 142
    // in LSD — the default is a floor meant for content screens and times out on both. The
    // chip is then waited for explicitly, and it is the stronger signal: a character count is a
    // proxy for "the app rendered", whereas the chip is the very thing about to be counted.
    await waitForApp(page, { minChars: 120 })
    await page.locator('[data-notes="chip"]').waitFor({ timeout: 10_000 }).catch(() => {})

    // A missing board is a FINDING, not a crash. "the board only mounts on /login" is one of
    // the shapes this check exists to catch, and it should come out as a named screen in the
    // failure line rather than as a locator timeout thirty seconds later.
    if (!(await page.locator('[data-notes="chip"]').count())) {
      wrongRoutes.push(`${pattern}: the board is not mounted on this screen at all`)
      continue
    }

    // ARRIVAL BEFORE COUNTING. A route that redirected would otherwise have its notes counted on
    // whatever screen it landed on, and a per-route count that does not check the route is a
    // per-somewhere count. This is the rule arrival.mjs exists to enforce, applied inline
    // because the loop navigates on its own.
    const landed = new URL(page.url()).pathname
    if (landed !== url) { wrongRoutes.push(`${pattern}: asked ${url}, landed ${landed}`); continue }

    const chip = Number(await page.locator('[data-notes="chip-count"]').textContent())
    await openBoard(page)
    await page.locator('[data-notes="filter-status-all"]').click()
    await page.waitForTimeout(200)   // sleep: the filter re-renders off a store subscription with no completion event
    rendered[pattern] = await page.locator('[data-notes="row"]').count()
    const stray = [...new Set(await page.locator('[data-notes="row"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-notes-route'))))].filter((r) => r !== pattern)

    if (rendered[pattern] !== expected[pattern]) {
      wrongRoutes.push(`${pattern}: file ${expected[pattern]}, rendered ${rendered[pattern]}`)
    }
    if (stray.length) wrongRoutes.push(`${pattern}: also rendered ${stray.join(', ')}`)
    if (chip !== (expectedOpen[pattern] ?? 0)) {
      wrongRoutes.push(`${pattern}: pill says ${chip}, file says ${expectedOpen[pattern] ?? 0} open`)
    }
  }
  check(`${lang}: every seeded note is RENDERED on the screen the file gives it`,
    wrongRoutes.length === 0,
    wrongRoutes.join(' | ') || `${Object.keys(expected).length} screens, each showing exactly its own`)
  console.log(`    per-route rendered/file: ${Object.entries(expected).sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `${r} ${rendered[r] ?? 0}/${c}`).join(', ')}`)

  // Back to the list screen, which the rest of this section works from.
  await page.goto(BASE + LIST, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  await openBoard(page)
  await page.locator('[data-notes="filter-status-all"]').click()
  await page.waitForTimeout(200)   // sleep: the filter re-renders off a store subscription with no completion event
  const shownHere = await page.locator('[data-notes="row"]').count()

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

// BEFORE THE BROWSER AND BEFORE THE PORT. A rebuild takes tens of seconds and a stale bundle
// invalidates every assertion below it, so the one thing that can make the whole run meaningless
// is settled first — and it either builds or stops, never carries on with a warning.
if (!ensureDist({ reviewTools: true, suite: 'check-notes' })) process.exit(2)

const port = await freePort()
const server = await startPreview(port, { cwd: ROOT })
const browser = await chromium.launch()
try {
  await runLang(browser, 'en', port)
  await runSeedAndImport(browser, 'en', port)
  await runLang(browser, 'lsd', port)
  await runSeedAndImport(browser, 'lsd', port)
  // Both directions and both widths. The side a badge sits on is the only part of this feature
  // that depends on the writing direction, so a single-language run would assert half of it.
  await runMarkers(browser, 'en', port, 1440)
  await runMarkers(browser, 'lsd', port, 1440)
  await runMarkers(browser, 'en', port, 390)
  await runMarkers(browser, 'lsd', port, 390)
  await runSeedResolution(browser, port)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('\nFAILURES:')
  failed.forEach((f) => console.log(`  ${f.name}  — ${f.detail}`))
}
// `finish` and not `server.kill()`: vite runs behind a shell, so kill() takes the shell and
// orphans the server, whose piped stdout then holds the event loop open with no work left to do.
// check-bidi and check-cold-load were each recorded as a timeout AFTER finishing their work for
// that exact reason — see scripts/lib/preview-server.mjs.
finish(server, failed.length ? 1 : 0)
