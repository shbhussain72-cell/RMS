/**
 * class-a-census.mjs — the Page tab's own class-A list, per route, as data.
 *
 * Class A is the wiring defect: the wordlist HAS a translation for this exact string and the
 * page renders English anyway, because the string never went through `t()`/`tx()`. There is
 * nothing for a translator to do with it and nothing to type — it is a code change every time.
 *
 * This reads `inventoryDom()`, the same function the panel reads, so the list here and the
 * badge there cannot disagree. Working from examples instead would fix the examples: the same
 * literal usually appears on several routes, and the ones nobody quoted stay broken.
 *
 * Output is JSON on stdout (`--json`) or a readable census, keyed by english string with the
 * routes it appears on and the `where` chain to find the JSX.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { waitForApp } from './arrival.mjs'

const JSON_OUT = process.argv.includes('--json')
const log = (...a) => { if (!JSON_OUT) console.log(...a) }

const ROUTES = [
  '/miqaats',
  '/miqaats/ashara-1448',
  '/miqaats/ashara-1448/questionnaire',
  '/miqaats/ashara-1448/people',
  '/miqaats/ashara-1448/invite',
  '/miqaats/ashara-1448/review',
  '/miqaats/ashara-1448/success',
  '/miqaats/ashara-1448/preferred-city',
  '/miqaats/ashara-1448/arrange',
  '/miqaats/ashara-1448/city',
  '/miqaats/ashara-1448/araz',
  '/miqaats/ashara-1448/zone',
  '/miqaats/ashara-1448/manage',
  '/miqaats/ashara-1448/manage/host',
  '/miqaats/ashara-1448/manage/relay',
  '/miqaats/ashara-1448/city-allocation',
  '/miqaats/ashara-1448/zone-allocation',
  '/miqaats/ashara-1448/roster',
  '/miqaats/ashara-1448/raza',
  '/miqaats/ashara-1448/raza-letter',
  '/miqaats/ashara-1448/timeline',
  '/notifications',
  '/join-group',
  '/login',
]

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
// The dev server, and with the review flag ON: `inventoryDom` and the dictionary it consults
// are both compiled out otherwise, and the census would report zero of everything.
const dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_REVIEW_TOOLS: 'true' },
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1500) } }
  dev.stdout.on('data', w); dev.stderr.on('data', w)
  dev.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
})

const TOUR = ['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const seed = `try{localStorage.setItem('rms-lang','lsd');const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
await ctx.addInitScript(seed)
const page = await ctx.newPage()

const perRoute = {}
const byString = new Map()

for (const route of ROUTES) {
  try {
    await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    await waitForApp(page)
  } catch (err) {
    perRoute[route] = { error: String(err).split('\n')[0], A: 0, hits: [] }
    continue
  }
  const r = await page.evaluate(async () => {
    const scan = await import('/src/i18n/domScan.ts')
    const inv = scan.inventoryDom()
    const counts = { A: 0, B1: 0, B2: 0, C: 0, sentinel: 0 }
    for (const h of inv.hits) counts[h.detail]++
    return {
      counts,
      total: inv.hits.length,
      // A row is only the WIRING defect the legend describes when English is what got painted.
      // `detail` alone cannot say that: it is computed from the wordlist row, not from the DOM.
      A: inv.hits.filter((h) => h.detail === 'A')
        .map((h) => ({ english: h.english, where: h.where, count: h.count, via: h.via, dictValue: h.dictValue,
          rendered: h.rendered, translated: h.translated,
          renderedIsLatin: /[A-Za-z]{2,}/.test(h.rendered) && !/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(h.rendered) })),
    }
  })
  perRoute[route] = { A: r.A.length, counts: r.counts, total: r.total, hits: r.A }
  for (const h of r.A) {
    const prev = byString.get(h.english)
    if (prev) prev.routes.push(route)
    else byString.set(h.english, { english: h.english, where: h.where, via: h.via, dictValue: h.dictValue, routes: [route] })
  }
  log(`${String(perRoute[route].A).padStart(3)}  A   ${route}   (${r.total} strings: ${JSON.stringify(r.counts)})`)
}

const distinct = [...byString.values()].sort((a, b) => b.routes.length - a.routes.length || (a.english < b.english ? -1 : 1))

if (JSON_OUT) {
  console.log(JSON.stringify({ perRoute, distinct }, null, 2))
} else {
  log(`\n${distinct.length} DISTINCT class-A strings across ${ROUTES.length} routes`)
  log(`total class-A row instances: ${Object.values(perRoute).reduce((n, r) => n + r.A, 0)}\n`)
  for (const d of distinct) {
    log(`${String(d.routes.length).padStart(2)}x  ${JSON.stringify(d.english)}`)
    log(`      where: ${d.where}`)
    log(`      dict : ${JSON.stringify(d.dictValue)}`)
    log(`      on   : ${d.routes.join(' ')}`)
  }
}

await browser.close()
dev.kill()
