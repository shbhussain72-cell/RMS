/**
 * check-chrome.mjs — assertions about the app shell, driven through the real UI.
 *
 * 1. NO FAKE PHONE CHROME. The Figma export drew a hard-coded `9:41` status bar and an iPhone
 *    home indicator inside the page. On a real device they sat under the OS's own. The component
 *    files are deleted; this is the assertion that stops them coming back through a re-export.
 *
 * 2. A BOTTOM SHEET'S BACKDROP MUST BE REACHABLE ABOVE THE SHEET. The sheet is a portal with a
 *    full-bleed backdrop button and, over it, a positioning wrapper holding the sheet surface.
 *    The wrapper had no cross-axis alignment, so it inherited `align-items: stretch` and spanned
 *    the whole viewport — invisible, but on top of the backdrop everywhere. Tapping the dimmed
 *    area above the sheet therefore hit the wrapper and did nothing, on every sheet in the app.
 *    Asserted by hit-testing rather than by clicking, so a failure names the element in the way.
 *
 * 3. THE STICKY FOOTER MUST RESERVE ITS HEIGHT. `check-layout` reports ~75 OVERLAY findings
 *    where PhoneScreen's footer covers text, and the obvious reading is that the scroll
 *    container needs padding equal to the footer's height. It does not, and this is the
 *    assertion that says why: `position: sticky` participates in normal flow, so the column
 *    already reserves those pixels and nothing the footer covers is ever unreachable. Measured
 *    across all 25 routes at four widths in both languages, 79 overlay findings at rest fall to
 *    0 from the footer once every scroll container is run to its end.
 *
 *    `.sticky-cta` fades from transparent to opaque over its first 28px, which only makes sense
 *    if content is meant to pass beneath it — the overlap is the design, not a defect.
 *
 *    So the check is on the property that makes all of that true, rather than on the finding
 *    count. Switch that wrapper to `position: fixed` and its height stops being reserved, the
 *    last screenful of every long page becomes unreachable, and this fails immediately — which
 *    is the point at which padding WOULD be the right fix.
 *
 * ── KNOWN GAP: SKIPS HAVE NO FLOOR ──────────────────────────────────────────────────
 *
 * This suite can legitimately skip an assertion when the element is genuinely absent at a width,
 * and that decision is right — see docs/assertion-discipline.md, example 8. What is missing is
 * the floor: a run in which EVERY assertion skipped prints `0 failing assertion(s)` and exits 0.
 *
 * `scripts/coverage-floor.mjs` exists for this. Declare the runs each case should produce,
 * DERIVED from the width and language lists rather than typed, call `cov.ran(name)` where the
 * case executes and `cov.skip(name, why)` where it does not, and `cov.verify(say)` at the end.
 * Deferred behind a user-facing defect; recorded here so it is found by whoever next edits a
 * skip rather than by whoever next reads the docs.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'
import { ensureDist } from './lib/dist-precondition.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The aria-label to look for, in both languages, READ FROM THE DICTIONARY.
 *
 * This suite used to carry the LSD spellings as literals:
 *
 *     { LOGOUT_SRC: 'logout|<the LSD string>', ACCOUNT_SRC: 'account menu|<the LSD string>' }
 *
 * Commit 5af517d changed the Logout translation. The suite went on printing ok for four days,
 * because it reads dist/ and nobody rebuilt; the moment one was built it failed twice with
 * "could not find the AppBar logout control" — a message that names the control and not the
 * cause, so it reads as an app regression.
 *
 * A test that hard-codes a translation breaks every time that translation is edited, and the
 * person editing it is the one least able to predict which suite they have broken. The value is
 * in lsd.json under a key this can read, so it reads it.
 *
 * A MISSING KEY IS A HARD FAILURE, not a fall back to English. Falling back would leave the
 * English alternative matching nothing in LSD, and the suite would fail with the same
 * control-not-found message it already fails with — a wrong diagnosis in the place this is
 * fixing one.
 */
const DICT = (() => {
  const raw = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/lsd.json'), 'utf8'))
  return raw.entries ?? raw
})()

const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function label(key, english) {
  const entry = DICT[key]
  // Bidi control marks are stored with the value and are not in the rendered aria-label.
  const lsd = String(entry?.lsd ?? '').replace(/[\u200e\u200f\u061c]/g, '').trim()
  if (!lsd) {
    console.error(`  FAIL  src/i18n/lsd.json has no LSD value for "${key}" — this suite matches`)
    console.error('        the AppBar control by its translated aria-label and cannot do so without one')
    process.exit(2)
  }
  return `${english}|${rx(lsd)}`
}

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
// The bundle under test must be the bundle this source produces. `check-chrome` printed ok for
// four days against a dist/ built before the commit that broke it — see the arrival audit's
// third column. Builds one when it is not, because a suite that stops with a message nobody
// reads is the same as a suite that guesses.
if (!ensureDist({ suite: 'check-chrome' })) process.exit(2)

const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('no start')), 60000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 800) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w) })

const TOUR = ['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const seed = (lang) => `try{localStorage.setItem('rms-lang',${JSON.stringify(lang)});const prev=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...prev,state:{...(prev.state||{}),loggedIn:true},version:prev.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const ROUTES = ['/miqaats', '/miqaats/ashara-1448', '/miqaats/ashara-1448/city', '/miqaats/ashara-1448/review']
let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }
/** Reported, not counted. A vacuous pass reads exactly like a real one, which is worse than a gap. */
const skip = (msg) => console.log(`  --    ${msg}`)

const browser = await chromium.launch()
for (const lang of ['en', 'lsd']) {
  for (const width of NARROW_WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
    await ctx.addInitScript(seed(lang))
    const page = await ctx.newPage()
    console.log(`\n${lang} @${width}`)

    // ── 1. no fake chrome, on every audited route ──
    let clocks = 0
    for (const route of ROUTES) {
      await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      clocks += await page.evaluate(() => [...document.querySelectorAll('*')]
        .filter((e) => !e.children.length && /^(9:41|٩:٤١)$/.test((e.textContent || '').trim())).length)
    }
    say(clocks === 0, `no hard-coded status-bar clock on ${ROUTES.length} routes (found ${clocks})`)

    // ── 2. the sheet backdrop is hit-testable above the sheet ──
    await page.goto(`http://localhost:${port}/miqaats/ashara-1448/city`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.fonts?.ready)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    // Mobile puts Logout straight on the AppBar; desktop hides it behind the account menu. Both
    // are driven here rather than skipping the wide case — the sheet is centred at >=640px, so
    // that width is the regression guard for the alignment that is being changed on mobile.
    // The aria-labels are translated, so both spellings are used rather than a loose match —
    // `account` alone also hits the LSD string for the menu, and a fuzzy match on the wrong
    // control fails silently as "no sheet opened". The LSD halves come from lsd.json rather
    // than from literals here; see `label()` for what that cost when they were literals.
    const opened = await page.evaluate(async ({ LOGOUT_SRC, ACCOUNT_SRC }) => {
      const LOGOUT = new RegExp(LOGOUT_SRC, 'i')
      const ACCOUNT = new RegExp(ACCOUNT_SRC, 'i')
      const visible = (x) => x.getBoundingClientRect().width > 4
      const byLabel = (re) => [...document.querySelectorAll('button[aria-label]')]
        .find((x) => re.test(x.getAttribute('aria-label') || '') && visible(x))
      let b = byLabel(LOGOUT)
      if (!b) {
        const menu = byLabel(ACCOUNT)
        if (!menu) return false
        menu.click()
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        b = byLabel(LOGOUT)
          || [...document.querySelectorAll('button')].find((x) => LOGOUT.test(x.textContent || '') && visible(x))
      }
      if (!b) return false
      b.click()
      return true
    }, { LOGOUT_SRC: label('Logout', 'logout'), ACCOUNT_SRC: label('Account menu', 'account menu') })
    if (!opened) { say(false, 'could not find the AppBar logout control to open a sheet'); await ctx.close(); continue }
    await page.waitForTimeout(200)   // sleep: bottom-sheet open transition, no completion event

    const hit = await page.evaluate(() => {
      const sheet = document.querySelector('[data-name="BottomSheet"]')
      if (!sheet) return { err: 'no sheet opened' }
      // Class-name lookup rather than a CSS selector: Tailwind's arbitrary-value classes contain
      // brackets, which `querySelector` rejects without escaping that varies by engine.
      const surface = [...sheet.querySelectorAll('div')]
        .find((d) => String(d.className).includes('rounded-tl-[16px]'))
      if (!surface) return { err: 'sheet surface not found' }
      const s = surface.getBoundingClientRect()
      // A point in the dimmed area above the sheet, well clear of both edges.
      const y = Math.round(Math.max(8, s.top / 2))
      const x = Math.round(window.innerWidth / 2)
      // probe-dom: point is chosen, not derived from a rect — the midpoint of the dimmed
      // gap above the sheet. Nothing about it can be stale, so no paint gate is needed.
      const el = document.elementFromPoint(x, y)
      const backdrop = sheet.querySelector('button[class*="inset-0"]')
      return {
        at: `${x},${y}`,
        sheetTop: Math.round(s.top),
        isBackdrop: el === backdrop,
        got: el ? `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 3).join('.')}` : 'null',
      }
    })
    if (hit.err) say(false, hit.err)
    else say(hit.isBackdrop, `sheet top ${hit.sheetTop}px; at (${hit.at}) the dimmed area hit-tests as ${hit.isBackdrop ? 'the backdrop' : hit.got}`)
    // ── 3. the sticky footer reserves its height ──
    // Measured by taking it out of flow and watching the column: an assertion on the mechanism
    // rather than on a pixel count, so it holds whatever the footer grows to.
    const flow = await page.evaluate(() => {
      const wrap = document.querySelector('.sticky.bottom-0')
      const col = document.querySelector('[data-name="AppScreen"]')
      if (!wrap || !col) return null
      const footH = Math.round(wrap.getBoundingClientRect().height)
      const before = col.getBoundingClientRect().height
      const prev = wrap.style.position
      wrap.style.position = 'fixed'
      void col.offsetHeight
      const after = col.getBoundingClientRect().height
      wrap.style.position = prev
      return { footH, reserved: Math.round(before - after) }
    })
    if (!flow) say(false, 'no sticky footer wrapper on /city to measure')
    // The footer is `sm:hidden` on this screen, so at >=640px there is nothing rendered to
    // reserve anything. Counting 0 === 0 as a pass would report the desktop widths as covered
    // when they are not tested at all.
    else if (flow.footH < 4) skip(`no sticky footer rendered at ${width}px on /city — nothing to reserve`)
    else say(Math.abs(flow.reserved - flow.footH) <= 2,
      `sticky footer reserves its ${flow.footH}px in flow (column shrank ${flow.reserved}px when taken out of it)`)

    await ctx.close()
  }
}
await browser.close(); proc.kill()
console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
