/**
 * elim-measure.mjs — record the viewport box of every `data-elim` marked element.
 *
 *   node scripts/elim-measure.mjs artifacts/elim-before.json
 *
 * The elimination pass swaps one direction-independent centring mechanism for another, so the
 * only thing that matters is that nothing MOVES. Class strings change as part of the edit, so
 * the comparison is keyed on the temporary `data-elim` marker instead.
 *
 * Runs against the dev server: several of these sites live behind a state the production
 * build reaches identically, but dev is what the edit loop uses and it avoids a full rebuild
 * between the before and after passes.
 *
 * Both languages and both extreme widths. A centring change that holds in LTR and breaks in
 * RTL is the entire failure mode being guarded against here.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, process.argv[2] || 'artifacts/elim.json')
const MIQAAT = 'ashara-1448'
/**
 * Widths from argv, defaulting to the extremes.
 *
 *   node scripts/elim-measure.mjs out.json 768 1024
 *
 * The first pass ran only 390 and 1440 — which, as it turned out, are exactly the widths
 * where the known desktop-branch occlusion class does NOT appear. 768 and 1024 are where the
 * PhoneScreen desktop branch kicks in and where the Request-all-over-Host-city overlap lives,
 * so a centring change verified only at the extremes is verified in the wrong places.
 */
const WIDTHS = process.argv.slice(3).length ? process.argv.slice(3).map(Number) : NARROW_WIDTHS
const LANGS = ['en', 'lsd']

const routes = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1]),
)].filter((p) => p !== '*' && p !== '/').map((p) => p.replace(/:id/g, MIQAAT)).sort()

const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]

const seed = (lang) => `
  try {
    localStorage.setItem('rms-lang', ${JSON.stringify(lang)});
    const prev = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...prev, state: { ...(prev.state || {}), loggedIn: true }, version: prev.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

const freePort = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})

const port = await freePort()
const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('dev server did not start')), 90_000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1200) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w)
  proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
})

const browser = await chromium.launch()
const boxes = {}

try {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
      })
      await ctx.addInitScript(seed(lang))
      const page = await ctx.newPage()
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' }).catch(() => {})

      for (const route of routes) {
        try {
          await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
          await page.evaluate(() => document.fonts?.ready)
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const found = await page.evaluate(() => {
            const out = {}
            for (const el of document.querySelectorAll('[data-elim]')) {
              const r = el.getBoundingClientRect()
              // Rounded to whole pixels: sub-pixel jitter between two dev-server runs is not a
              // regression, and reporting it would drown the real movement.
              out[el.getAttribute('data-elim')] = {
                x: Math.round(r.left), y: Math.round(r.top),
                w: Math.round(r.width), h: Math.round(r.height),
              }
            }
            return out
          })
          for (const [id, box] of Object.entries(found)) {
            boxes[`${id}|${lang}|${width}|${route}`] = box
          }
        } catch { /* route not reachable in this state — absent from both passes, so neutral */ }
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  proc.kill()
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(boxes, null, 2)}\n`)
const ids = new Set(Object.keys(boxes).map((k) => k.split('|')[0]))
console.log(`measured ${Object.keys(boxes).length} boxes across ${ids.size} distinct sites -> ${OUT.replace(ROOT, '.')}`)
console.log(`sites seen: ${[...ids].sort((a, b) => a - b).join(', ')}`)
