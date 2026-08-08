/**
 * repro-anchor.mjs — TEMPORARY. Reproduces the anchored-popover defects before they are fixed.
 *
 * Every dropdown in this app captures `e.currentTarget.getBoundingClientRect()` at click time,
 * stores that DOMRect in state, and renders a `position: fixed` panel at those coordinates.
 * This proves what that costs, rather than asserting it from reading the source.
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

for (const lang of ['en', 'lsd']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${port}/miqaats/ashara-1448/araz`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts?.ready)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  console.log(`\n${lang} — /araz relay dropdown @390`)

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
    return { panel: { top: p.top, left: p.left, right: p.right }, trig: { top: tr.top, left: tr.left, right: tr.right }, dir: getComputedStyle(document.documentElement).direction }
  })
  if (!before) { say(false, 'dropdown panel did not open'); continue }

  // DEFECT 1 — the captured rect never updates. Scroll the page and re-measure.
  await page.evaluate(() => { const sc = document.scrollingElement; sc.scrollTop += 150 })
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

  // DEFECT 2 — physical `left` anchoring. In RTL the panel should align to the trigger's
  // INLINE-START edge, which is its right edge, not its left one.
  if (before.dir === 'rtl') {
    const startGap = Math.round(before.trig.right - before.panel.right)
    say(Math.abs(startGap) <= 2,
      `RTL: panel's inline-start (right) edge is ${startGap}px from the trigger's — it is anchored by physical left instead`)
  }
}

await browser.close(); proc.kill()
console.log(`\n${fails} defect(s) reproduced`)
process.exit(0)
