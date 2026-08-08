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
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('no start')), 60000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 800) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w) })

const TOUR = ['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const seed = (lang) => `try{localStorage.setItem('rms-lang',${JSON.stringify(lang)});const prev=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...prev,state:{...(prev.state||{}),loggedIn:true},version:prev.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const browser = await chromium.launch()
let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }

for (const width of [390, 1440]) {
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
  await page.waitForTimeout(150)

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
  await page.waitForTimeout(200)

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
  await page.waitForTimeout(150)
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

await browser.close(); proc.kill()
console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
