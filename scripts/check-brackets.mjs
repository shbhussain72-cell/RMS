/**
 * check-brackets.mjs — ornate parentheses stay on their date, and on their ends.
 *
 * The composed LSD date is `يوم الجمعة، 26 Jun 2026 ﴿١٠ شهر محرم الحرام ١٤٤٨ھ﴾`: an RTL
 * weekday, an LTR Gregorian isolate, and a bracketed Hijri half. The brackets are the fragile
 * part, because U+FD3E/U+FD3F are NEUTRAL characters — they have no direction of their own and
 * take their side from whatever resolves around them. Two ways that has already gone wrong:
 *
 *   1. An ancestor forcing `direction: ltr` (the old `[data-numeric]` attribute) flipped the
 *      base direction of the whole composed line, so the brackets rendered inside-out and the
 *      Arabic weekday led from the left. Seven call sites carried it; three composed a date.
 *   2. Left loose in the paragraph, the brackets are their own line-break opportunities, so a
 *      card narrow enough to wrap the date broke the closing bracket onto a line of its own.
 *
 * Neither shows up as a layout finding — the boxes are all where they should be — and neither
 * is visible in English, where DateLine returns the raw string and none of this runs. So it is
 * asserted here, against the real DOM, in LSD, at both widths, on every route.
 *
 * WHAT "CORRECT" MEANS. Source order is FD3F then text then FD3E. Read right-to-left that is
 * open-then-close, so the correct PAINTED order is FD3E on the left of FD3F. Asserting the
 * painted x positions rather than the string is the whole point: the string was never wrong.
 *
 * The coverage assertion at the end is not decoration. This check found nothing at all while
 * pointed at a route that renders no dates, and reported success.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIQAAT = 'ashara-1448'

const routes = [...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p !== '*' && p !== '/').map((p) => p.replace(/:id/g, MIQAAT)).sort()

const TOUR = [...new Set([...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]))]
const seed = `try{localStorage.setItem('rms-lang','lsd');const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('no start')), 90000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 900) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w) })

/**
 * Collect every ornate bracket on the page with the position it is actually PAINTED at.
 *
 * Walks text nodes, not elements, so it sees the brackets whether they live in one text node
 * (bound into the isolate, as now) or in three (loose in the paragraph, as before). An
 * element-level check would have had nothing to measure in the broken form and would have
 * passed it.
 */
const EVAL = `(() => {
  const OPEN = '\\uFD3E', CLOSE = '\\uFD3F'
  const marks = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = walker.nextNode())) {
    const v = n.nodeValue || ''
    if (!v.includes(OPEN) && !v.includes(CLOSE)) continue
    if (!n.parentElement || !n.parentElement.getClientRects().length) continue
    for (let i = 0; i < v.length; i++) {
      if (v[i] !== OPEN && v[i] !== CLOSE) continue
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1)
      const b = r.getBoundingClientRect()
      if (!b.width && !b.height) continue
      marks.push({ ch: v[i] === OPEN ? 'open' : 'close', x: Math.round(b.left), y: Math.round(b.top),
                   host: (n.parentElement.closest('span,p,div') || n.parentElement).textContent.trim().slice(0, 40) })
    }
  }
  const pairs = []
  for (let i = 0; i + 1 < marks.length; i += 2) pairs.push([marks[i], marks[i + 1]])
  return pairs.map(([a, b]) => ({
    host: a.host,
    order: a.ch + '->' + b.ch,
    okOrder: a.ch === 'close' && b.ch === 'open' && b.x < a.x,
    sameLine: a.y === b.y,
    ax: a.x, bx: b.x,
  }))
})()`

const browser = await chromium.launch()
let fails = 0, seen = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }

for (const width of NARROW_WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(seed)
  const page = await ctx.newPage()
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' }).catch(() => {})
  for (const route of routes) {
    try {
      await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.evaluate(() => document.fonts?.ready)
      await page.waitForTimeout(320)
    } catch { continue }
    for (const r of await page.evaluate(EVAL)) {
      seen++
      if (!r.okOrder) {
        say(false, `${route} @${width}: brackets on the wrong ends (${r.order}, painted at x=${r.ax} and ${r.bx}) — "${r.host}"`)
      } else {
        say(r.sameLine, `${route} @${width}: bracket sits on a different line from its date — "${r.host}"`)
      }
    }
  }
  await ctx.close()
}
await browser.close(); proc.kill()

// Coverage. A run that measured nothing is not a pass.
say(seen > 0, `bracketed dates exercised: ${seen} across ${routes.length} routes x ${NARROW_WIDTHS.length} widths`)

console.log(`\n${seen} bracketed date(s) checked, ${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
