/** Discovery: for each class-A row on a route, is English actually on screen? */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { waitForApp } from './arrival.mjs'

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_REVIEW_TOOLS: 'true' },
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('no start')), 60_000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1500) } }
  dev.stdout.on('data', w); dev.stderr.on('data', w)
  dev.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev exited ${c}`)) })
})

const TOUR = ['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const seed = `try{localStorage.setItem('rms-lang','lsd');const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
await ctx.addInitScript(seed)
const page = await ctx.newPage()

for (const route of ['/miqaats', '/miqaats/ashara-1448/review']) {
  await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)
  const r = await page.evaluate(async () => {
    const scan = await import('/src/i18n/domScan.ts')
    const inv = scan.inventoryDom()
    const LATIN = /[A-Za-z]{2,}/
    const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
    const A = inv.hits.filter((h) => h.detail === 'A')
    const rows = A.map((h) => ({
      english: h.english,
      rendered: h.rendered,
      translated: h.translated,
      via: h.via,
      renderedIsLatin: LATIN.test(h.rendered) && !ARABIC.test(h.rendered),
      renderedIsArabic: ARABIC.test(h.rendered),
    }))
    return {
      total: A.length,
      trulyEnglishOnScreen: rows.filter((x) => x.renderedIsLatin).length,
      arabicOnScreen: rows.filter((x) => x.renderedIsArabic).length,
      flaggedTranslated: rows.filter((x) => x.translated).length,
      sample: rows.slice(0, 14),
    }
  })
  console.log(`\n=== ${route} — ${r.total} class-A rows ===`)
  console.log(`  rendering LATIN (a real wiring defect) : ${r.trulyEnglishOnScreen}`)
  console.log(`  rendering ARABIC (already translated)  : ${r.arabicOnScreen}`)
  console.log(`  hit.translated === true                : ${r.flaggedTranslated}`)
  console.log('  sample:')
  for (const s of r.sample) {
    console.log(`    ${s.renderedIsLatin ? 'EN ' : 'LSD'} via=${s.via.padEnd(14)} ${JSON.stringify(s.english).slice(0, 40)} -> ${JSON.stringify(s.rendered).slice(0, 40)}`)
  }
}

await browser.close()
dev.kill()
