/**
 * check-devdock.mjs — the dev panels are draggable, remembered, and never stranded.
 *
 * Runs against the DEV server, not `dist/`: these panels exist only behind `import.meta.env.DEV`,
 * and `check-dev-only.mjs` asserts the opposite fact about the production bundle.
 *
 * The case worth the probe is the third one. A position is stored as physical `left`/`top`
 * because that is what a drag produces, but the default corners are LOGICAL (`start-`, `end-`),
 * so the Remarks panel is on the right in English and on the left in LSD. Restoring physical
 * coordinates over a logical class is exactly where the two can end up pinning opposite edges of
 * the same element, and the failure is a panel stretched across the viewport rather than a panel
 * in the wrong place — which is why the width is asserted and not just the offset.
 *
 * ── THIS SUITE COULD NOT PASS UNTIL 12 Aug 2026, AND ONE ASSERTION STILL DOES NOT ───
 *
 * It spawned the dev server without `VITE_REVIEW_TOOLS`, so every widget rendered null and it
 * reported "no dev dock rendered on the dev server" — the third suite in this repo to lose time
 * to that exact omission. The spawn now goes through `lib/dev-server.mjs`, which will not start
 * a dev server without being told which way the flag goes.
 *
 * With the flag, 11 of the 12 assertions pass. THE TWELFTH IS A REAL FAILURE AND IS LEFT
 * FAILING. Whoever picks it up should start from the measurements, not from the symptom:
 *
 * WHAT WAS MEASURED
 *
 *   - RTL, 390px viewport: the dock lands at x=308 and measures 79 wide, so its far edge is at
 *     387 with the viewport at 390 — a 3px gap where 8 is asserted. LTR at the same width
 *     passes (296..382).
 *   - 308 is exactly `390 - 74 - 8`. That is the clamp arithmetic run against a width of 74,
 *     while the dock finally measures 79. So the position is not wrong for the width it was
 *     computed from; the width changed afterwards.
 *   - Not caused by the notes or pointing work: with the previous commit's `src/` and this
 *     suite, the failure is identical, to the pixel.
 *
 * WHAT WAS NOT MEASURED — the hypotheses, untested, in the order worth testing
 *
 *   1. The suite is looking too early. It waits 200ms after `setViewportSize`, and that wait was
 *      never shown to be enough for a reflow plus a ResizeObserver round-trip. If this is it,
 *      the fix is HERE and not in `DevDock` — wait for the dock's own size to be stable across
 *      two frames rather than for a fixed number of milliseconds.
 *   2. The observer did not fire for the 74→79 change. `DevDock` observes the dock with a
 *      `ResizeObserver` for exactly this, but RO reports the CONTENT box: a change confined to
 *      border or padding does not fire it, and `clamp()` measures `offsetWidth`, which includes
 *      both. Those two boxes disagreeing is a way for the observer to be correct and the clamp
 *      to be stale at the same time.
 *   3. The width settles late for a reason specific to RTL — LSD text metrics after the font
 *      loads is the obvious candidate, and it would explain why only the RTL pass fails.
 *
 * Fixing it by adjusting the clamp without deciding between those three is how a 3px cosmetic
 * gap in dev chrome becomes a repositioning bug in every dev widget.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startDev } from './lib/dev-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
/**
 * VITE_REVIEW_TOOLS, without which this suite cannot pass and never could.
 *
 * The dock is dev-only. Spawned without the flag, every widget renders null and the suite
 * reports "no dev dock rendered on the dev server" — which reads as a regression in the dock and
 * is actually a missing word in this line. It is the third suite in this repo to lose time to
 * exactly this; check-notes' header names the other two.
 */
const proc = await startDev(PORT, { cwd: ROOT, reviewTools: true })

const seed = (lang) => `try{localStorage.setItem('rms-lang',${JSON.stringify(lang)});const prev=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...prev,state:{...(prev.state||{}),loggedIn:true},version:prev.version??0}))}catch{}`
const ROUTE = '/miqaats'
const DOCK = '[data-devdock]'

let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }
const box = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
}, sel)

const browser = await chromium.launch()
for (const lang of ['en', 'lsd']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()
  console.log(`\n${lang}`)
  await page.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(DOCK, { timeout: 15_000 }).catch(() => {})

  const start = await box(page, DOCK)
  if (!start) { say(false, 'no dev dock rendered on the dev server'); await ctx.close(); continue }

  // 1. The default corner still follows the reading direction — nothing is pinned physically
  //    until it has been dragged.
  const near = lang === 'lsd' ? start.x < 720 : start.x > 720
  say(near, `undragged dock sits on the ${lang === 'lsd' ? 'start (left in RTL)' : 'end (right in LTR)'} side (x=${start.x})`)

  // 2. Drag it BY THE GRIP. Grabbing the dock's own top-left corner does not work and should
  //    not: the wrapper is `pointer-events: none` so the app underneath stays clickable, and
  //    collapsed the only real element is the toggle button, which is on the drag exclusion list.
  const grip = await box(page, '[data-devdock-grip]')
  if (!grip) { say(false, 'no drag grip rendered'); await ctx.close(); continue }
  const gx = grip.x + Math.round(grip.w / 2)
  const gy = grip.y + Math.round(grip.h / 2)
  // Toward the middle, whichever side it starts on. Dragging a fixed direction pushes the LSD
  // dock — which starts at the left edge — straight into the clamp, and then the assertion is
  // measuring the clamp rather than the drag.
  const dx = start.x < 720 ? 300 : -300
  await page.mouse.move(gx, gy)
  await page.mouse.down()
  await page.mouse.move(gx + dx, gy + 220, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(120)   // sleep: drag release; the dock animates to its snapped position
  const moved = await box(page, DOCK)
  say(Math.abs(moved.x - (start.x + dx)) <= 6 && Math.abs(moved.y - (start.y + 220)) <= 6,
    `drag moved it to (${moved.x},${moved.y}); expected about (${start.x + dx},${start.y + 220})`)
  // +/-2: the undragged dock is placed by a logical inset and lands on a fractional offset, so
  // its rounded border-box width can differ by a pixel from the same box at an integer `left`.
  say(Math.abs(moved.w - start.w) <= 2, `width unchanged after the switch to physical insets (${start.w} -> ${moved.w})`)

  // 3. It survives a reload.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector(DOCK, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(150)   // sleep: mount is awaited above; this covers the entrance transition only
  const restored = await box(page, DOCK)
  say(restored && Math.abs(restored.x - moved.x) <= 2 && Math.abs(restored.y - moved.y) <= 2,
    `position restored after reload (${restored?.x},${restored?.y})`)
  say(restored && Math.abs(restored.w - start.w) <= 2, `width still about ${start.w} after restore (got ${restored?.w})`)

  // 4. A position saved wide must not strand the panel off a narrow viewport.
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(200)   // sleep: viewport resize reflow, which fires no event of its own
  const narrow = await box(page, DOCK)
  // The 8px edge gap is asserted, not just "on screen": clamping with a stale size lands the
  // dock flush against the edge it was supposed to be held away from, which still passes a
  // bounds check and is exactly the bug the dock's own ResizeObserver exists to prevent.
  const EDGE = 8
  say(narrow && narrow.x >= EDGE - 1 && narrow.x + narrow.w <= 390 - EDGE + 1 && narrow.y >= EDGE - 1 && narrow.y + narrow.h <= 800 - EDGE + 1,
    `clamped into a 390px viewport keeping its ${EDGE}px edge gap (${narrow?.x}..${narrow?.x + narrow?.w})`)
  await ctx.close()
}
await browser.close(); proc.kill()
console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
