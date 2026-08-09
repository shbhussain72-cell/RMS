/**
 * shoot-targets.mjs — screenshots of just the routes a session is touching.
 *
 *   node scripts/shoot-targets.mjs artifacts/shots/before
 *
 * `shoot.mjs` captures all 25 routes at 5 widths in both languages, which is the right tool
 * for a baseline and the wrong one for a before/after on three screens. This takes the same
 * settings — fonts awaited, animations killed, fullPage — for a named subset.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, process.argv[2] || 'artifacts/shots/run')
const MIQAAT = 'ashara-1448'
const ROUTES = ['/login', '/miqaats', `/miqaats/${MIQAAT}/success`]
const WIDTHS = NARROW_WIDTHS

const TOUR = [...new Set([...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]))]
const seed = (lang) => `try{localStorage.setItem('rms-lang',${JSON.stringify(lang)});const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('no start')), 90000); const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 900) } }; proc.stdout.on('data', w); proc.stderr.on('data', w) })

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
let n = 0
for (const lang of ['en', 'lsd']) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
    await ctx.addInitScript(seed(lang))
    const page = await ctx.newPage()
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }).catch(() => {})
    // Walk in order first so /success has the flow state it needs.
    for (const r of ROUTES) {
      try {
        await page.goto(`http://localhost:${port}${r}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.evaluate(() => document.fonts?.ready)
        await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))))
        const slug = r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'
        await page.screenshot({ path: `${OUT}/${lang}_${slug}@${width}.png`, fullPage: true })
        n++
      } catch (e) { console.log(`  skip ${lang} ${r} @${width}: ${e.message.split('\n')[0]}`) }
    }
    await ctx.close()
  }
}
await browser.close(); proc.kill()
console.log(`${n} screenshots -> ${OUT.replace(ROOT, '.')}`)
