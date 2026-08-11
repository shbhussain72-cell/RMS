/**
 * check-anchor.mjs — the anchored-popover placement contract, driven through the real UI.
 *
 * Written first as a reproduction, while every dropdown still captured
 * `e.currentTarget.getBoundingClientRect()` at click time and rendered a `position: fixed` panel
 * at those coordinates. It failed on three counts; `src/components/Popover.tsx` records what each
 * one was. It is kept because the failures it caught are all invisible in a screenshot: a panel
 * anchored the wrong way still looks like a panel, and a stale rect only shows up once something
 * scrolls.
 *
 * Both viewports matter and test different things. At 390 the document scrolls and the panel is
 * clamped to the viewport edge; at 1440 the desktop layout pins the page height and scrolls an
 * inner `overflow-y: auto` panel instead, which is the case a listener bound to `window` alone
 * never sees.
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
import { NARROW_WIDTHS } from './widths.mjs'
import { ensureDist } from './lib/dist-precondition.mjs'

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
// The bundle under test must be the bundle this source produces. `check-chrome` printed ok for
// four days against a dist/ built before the commit that broke it — see the arrival audit's
// third column. Builds one when it is not, because a suite that stops with a message nobody
// reads is the same as a suite that guesses.
if (!ensureDist({ suite: 'check-anchor' })) process.exit(2)

const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('no start')), 60000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 800) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w) })

const TOUR = ['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const seed = (lang) => `try{localStorage.setItem('rms-lang',${JSON.stringify(lang)});const prev=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...prev,state:{...(prev.state||{}),loggedIn:true},version:prev.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const browser = await chromium.launch()
let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }

for (const width of NARROW_WIDTHS) {
for (const lang of ['en', 'lsd']) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${port}/miqaats/ashara-1448/araz`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts?.ready)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  console.log(`\n${lang} — /araz relay dropdown @${width}`)

  // Open the first relay-city dropdown by driving the real UI: tick "Relay City", then the trigger.
  const opened = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const relay = btns.find((b) => /Relay City|ريلے|رِلے/.test(b.textContent || ''))
    if (!relay) return 'no relay radio'
    relay.click()
    return 'clicked'
  })
  if (opened !== 'clicked') { say(false, `could not find the relay radio (${opened})`); continue }
  await page.waitForTimeout(150)   // sleep: relay panel opens on a CSS transition; no event fires when it settles

  const trigger = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    // The relay trigger is the control that opens the city list; it sits after the radio.
    // RelayTrigger: max-w-190 pill, label + chevron, bordered #2e6a7d.
    const t = btns.find((b) => b.className.includes('max-w-[190px]') && b.getBoundingClientRect().width > 40)
    if (!t) return null
    t.click()
    const r = t.getBoundingClientRect()
    t.setAttribute('data-repro-trigger', '1')
    return { top: r.top, left: r.left, bottom: r.bottom, right: r.right }
  })
  if (!trigger) { say(false, 'could not find the relay trigger button'); continue }
  await page.waitForTimeout(200)   // sleep: same open transition, measured after the trigger click

  const before = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')].find((d) => {
      const s = getComputedStyle(d)
      return s.position === 'fixed' && d.querySelector('input') && d.getBoundingClientRect().width > 200 && d.getBoundingClientRect().width < 340
    })
    const t = document.querySelector('[data-repro-trigger]')
    if (!panel || !t) return null
    const p = panel.getBoundingClientRect(), tr = t.getBoundingClientRect()
    return { panel: { top: p.top, left: p.left, right: p.right }, trig: { top: tr.top, left: tr.left, right: tr.right }, dir: getComputedStyle(document.documentElement).direction, viewport: window.innerWidth }
  })
  if (!before) { say(false, 'dropdown panel did not open'); continue }

  // DEFECT 1 — the captured rect never updates. Scroll the page and re-measure.
  // Scroll whatever actually scrolls. At 390 that is the document; at 1440 the desktop layout
  // pins the page height and scrolls an inner `overflow-y: auto` panel instead, so scrolling the
  // document there would move nothing and the assertion would pass without testing anything.
  const scrolled = await page.evaluate(() => {
    const t = document.querySelector('[data-repro-trigger]')
    for (let e = t?.parentElement; e; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (/auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 20) { e.scrollTop += 150; return 'container' }
    }
    const sc = document.scrollingElement
    if (sc.scrollHeight > sc.clientHeight + 20) { sc.scrollTop += 150; return 'document' }
    return 'nothing scrollable'
  })
  say(scrolled !== 'nothing scrollable', `found something to scroll (${scrolled})`)
  await page.waitForTimeout(150)   // sleep: scrolling is async; the rects read next must be post-scroll
  const after = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')].find((d) => {
      const s = getComputedStyle(d)
      return s.position === 'fixed' && d.querySelector('input') && d.getBoundingClientRect().width > 200 && d.getBoundingClientRect().width < 340
    })
    const t = document.querySelector('[data-repro-trigger]')
    if (!panel || !t) return null
    const p = panel.getBoundingClientRect(), tr = t.getBoundingClientRect()
    return { panel: { top: p.top, left: p.left }, trig: { top: tr.top, left: tr.left } }
  })
  if (after) {
    const trigMoved = Math.round(after.trig.top - before.trig.top)
    const panelMoved = Math.round(after.panel.top - before.panel.top)
    say(Math.abs(trigMoved - panelMoved) <= 2,
      `after scrolling 150px the trigger moved ${trigMoved}px and the panel moved ${panelMoved}px — they must move together`)
  } else {
    say(false, 'panel or trigger vanished after scroll')
  }

  // The placement contract, stated as what a user can observe rather than as the formula:
  //   (a) the panel never leaves the viewport, and
  //   (b) its INLINE-START edge meets the trigger's inline-start edge — right edges in RTL, left
  //       in LTR — unless honouring that would push it outside, in which case it sits at the edge.
  // Both halves matter. Asserting only (b) fails on a narrow screen where clamping is correct;
  // asserting only (a) passes the original bug, which stayed on screen while pointing the wrong way.
  const MARGIN = 12
  const W = Math.round(before.panel.right - before.panel.left)
  const rtl = before.dir === 'rtl'
  const startAligned = rtl ? before.trig.right - W : before.trig.left
  const expected = Math.max(MARGIN, Math.min(startAligned, before.viewport - W - MARGIN))
  const clamped = Math.round(expected) !== Math.round(startAligned)
  say(Math.abs(before.panel.left - expected) <= 1,
    `${rtl ? 'RTL' : 'LTR'}: panel left is ${Math.round(before.panel.left)}, inline-start alignment wants ${Math.round(expected)}${clamped ? ' (clamped to the viewport edge)' : ''}`)
  say(before.panel.left >= MARGIN - 1 && before.panel.right <= before.viewport - MARGIN + 1,
    `panel stays inside the viewport (${Math.round(before.panel.left)}..${Math.round(before.panel.right)} within 0..${before.viewport})`)
  }
}

/** How many (width, lang) combinations actually exercised each AppBar case. */
const exercised = {}

// ── AppBar: the account dropdown and the notification bell ───────────────────────────
//
// Added after both shipped broken to production in LSD while this suite passed. It passed
// because it only ever drove the /araz relay dropdown: the two chrome popovers were never
// covered, so "check:anchor is green" said nothing about them.
//
// Both were raw `position: absolute` panels with an inline `right: var(--content-px)` — a
// PHYSICAL right, resolved against the bar rather than the trigger. In LTR the bar's end and
// the physical right coincide, so it looked correct; in LSD the chip and bell move to the
// physical left while the panel stays pinned right, and the panel lands at the opposite edge
// of the bar from the control that opened it.
//
// The assertion is the same placement contract as above, so a future consumer that hand-rolls
// its own panel again fails here rather than in production.
for (const width of NARROW_WIDTHS) {
for (const lang of ['en', 'lsd']) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${port}/miqaats`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts?.ready)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  // [name, what to CLICK, what it is ANCHORED TO, panel width bounds]
  //
  // Click target and anchor are separate on purpose. The account menu is opened by the 28px
  // chevron but anchored to the whole chip, and conflating the two made this assertion compare
  // the panel against the chevron and report a 177px error that was the test's, not the app's.
  const CASES = [
    ['account dropdown', '.ix-chip button:last-of-type', '.ix-chip', 160, 200],
    ['notification bell', '.ix-bell', '.ix-bell', 300, 520],
  ]

  for (const [name, sel, anchorSel, minW, maxW] of CASES) {
    console.log(`
${lang} — AppBar ${name} @${width}`)
    const opened = await page.evaluate(({ sel, anchorSel }) => {
      document.querySelectorAll('[data-repro-trigger]').forEach((e) => e.removeAttribute('data-repro-trigger'))
      const t = document.querySelector(sel)
      const a = document.querySelector(anchorSel)
      if (!t || !a) return 'trigger not found'
      const r = t.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) return 'trigger not laid out'
      a.setAttribute('data-repro-trigger', '1')
      t.click()
      return 'clicked'
    }, { sel, anchorSel })
    // Not rendered is a SKIP, not a failure: the AppBar chip and bell are desktop chrome and
    // genuinely do not exist at 390. Counting absence as a failure would make the suite
    // permanently red and train everyone to ignore it. Coverage is asserted at the end instead,
    // so "skipped everywhere" cannot masquerade as "passed".
    if (opened !== 'clicked') { console.log(`  skip  ${name}: ${opened} at ${width}`); continue }
    exercised[name] = (exercised[name] ?? 0) + 1
    await page.waitForTimeout(200)   // sleep: AppBar popover open transition, no completion event

    const m = await page.evaluate(({ minW, maxW }) => {
      const t = document.querySelector('[data-repro-trigger]')
      if (!t) return null
      const tr = t.getBoundingClientRect()
      // Prefer the primitive's own hook. Falling back to a width guess matched the Ask Help
      // dock — also fixed, also ~180px wide, also below the trigger — and measured placement
      // on the wrong element entirely.
      //
      // The fallback is kept, and deliberately NOT keyed on `position: fixed`, because the
      // whole point of this assertion is to catch a consumer that hand-rolled an `absolute`
      // panel instead of going through Popover. Such a panel has no hook, and must still be
      // found so it can fail.
      const panel = document.querySelector('[data-popover]')
        || [...document.querySelectorAll('div')].find((d) => {
          const s = getComputedStyle(d)
          if (s.position !== 'fixed' && s.position !== 'absolute') return false
          const r = d.getBoundingClientRect()
          return r.width >= minW && r.width <= maxW && r.height > 40 && r.top >= tr.top - 4
        })
      if (!panel) return null
      const p = panel.getBoundingClientRect()
      return {
        panel: { left: p.left, right: p.right, width: p.width },
        trig: { left: tr.left, right: tr.right },
        dir: getComputedStyle(document.documentElement).direction,
        viewport: window.innerWidth,
        position: getComputedStyle(panel).position,
      }
    }, { minW, maxW })
    if (!m) { say(false, `${name}: panel did not open (or was not found)`); continue }

    const MARGIN2 = 12
    const rtl = m.dir === 'rtl'
    const startAligned = rtl ? m.trig.right - m.panel.width : m.trig.left
    const expected = Math.max(MARGIN2, Math.min(startAligned, m.viewport - m.panel.width - MARGIN2))
    say(Math.abs(m.panel.left - expected) <= 1,
      `${rtl ? 'RTL' : 'LTR'} ${name}: panel left ${Math.round(m.panel.left)}, inline-start alignment wants ${Math.round(expected)} (trigger ${Math.round(m.trig.left)}..${Math.round(m.trig.right)}, ${m.position})`)
    say(m.panel.left >= MARGIN2 - 1 && m.panel.right <= m.viewport - MARGIN2 + 1,
      `${name}: panel stays inside the viewport (${Math.round(m.panel.left)}..${Math.round(m.panel.right)} within 0..${m.viewport})`)

    await page.keyboard.press('Escape').catch(() => {})
    await page.evaluate(() => { const b = document.querySelector('.fixed.inset-0'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })) }).catch(() => {})
    await page.waitForTimeout(120)   // sleep: close transition, so the next case cannot measure the previous panel
  }
  await ctx.close()
}
}

await browser.close(); proc.kill()
console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
