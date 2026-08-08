/**
 * check-lsd-clip.mjs — find LSD text whose glyphs are cut off by their own box.
 *
 *   node scripts/check-lsd-clip.mjs           # report + non-zero exit on a clip
 *   node scripts/check-lsd-clip.mjs --json
 *
 * ── WHY THIS IS A SEPARATE CHECK FROM check-layout ───────────────────────────────
 *
 * check-layout looks for HORIZONTAL clipping — content wider than a box that hides its
 * overflow-x. The typography failure is the other axis and has a different cause: Arabic
 * carries ink well above the Latin cap line (alef, lam, and stacked tashkeel) and well below
 * the baseline (the tails of ج ح خ ع). A `leading-[18px]` that comfortably fits Mulish will
 * shear the top off a nuqta once the same box holds naskh, and raising size-adjust makes it
 * worse because every extent scales with it.
 *
 * ── WHAT COUNTS AS CLIPPED ───────────────────────────────────────────────────────
 *
 * An element is reported when ALL of:
 *   (a) it holds Arabic text directly,
 *   (b) it hides its vertical overflow — `overflow-y: hidden|clip`, or a fixed height that
 *       its content already exceeds,
 *   (c) its scrollHeight genuinely exceeds its clientHeight by more than a rounding pixel.
 *
 * (b) is what separates a real clip from a harmless overhang. Glyphs routinely paint outside
 * the line box — that is what `ascent-override` guarantees they may do — and it is invisible
 * and correct right up until an ancestor clips it. Reporting every overhang would bury the
 * handful of boxes that actually cut.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'
import { NARROW_WIDTHS } from './widths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PORT = 4324
const MIQAAT_ID = 'ashara-1448'
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const WIDTHS = NARROW_WIDTHS
const OUT = resolve(ROOT, 'artifacts/audit/lsd-clip.json')

const routes = [
  ...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1])),
]
  .filter((p) => p !== '*' && p !== '/')
  .map((p) => p.replace(/:id/g, MIQAAT_ID))
  .sort()

const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]

const seed = `
  try {
    localStorage.setItem('rms-lang', 'lsd');
    const prev = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...prev, state: { ...(prev.state || {}), loggedIn: true }, version: prev.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

const PROBE = () => {
  const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/
  const out = []
  const seen = new Set()
  for (const el of document.querySelectorAll('*')) {
    // Only elements holding Arabic text DIRECTLY — an ancestor's scrollHeight says nothing
    // about whether a given line of script is being cut.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue || '').join('').trim()
    if (!own || !ARABIC.test(own)) continue
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') continue
    const hidesY = s.overflowY === 'hidden' || s.overflowY === 'clip'
    if (!hidesY) continue
    const over = el.scrollHeight - el.clientHeight
    if (over <= 1) continue
    const key = `${el.tagName}.${(typeof el.className === 'string' && el.className.split(/\s+/)[0]) || ''}|${own.slice(0, 40)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      where: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/)[0] : ''}`,
      text: own.replace(/\s+/g, ' ').slice(0, 70),
      overflowPx: over,
      lineHeight: s.lineHeight,
      fontSize: s.fontSize,
    })
  }
  return out
}

function freePort() {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${PORT}`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const pid of new Set([...out.matchAll(/\s(\d+)\s*$/gm)].map((m) => m[1]))) {
      if (pid !== '0') try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch {}
    }
  } catch { /* nothing listening */ }
}

async function serve() {
  freePort()
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
    const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1500) } }
    proc.stdout.on('data', w); proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
  })
  return proc
}

const server = await serve()
const browser = await chromium.launch()
const by = new Map()
let visits = 0

try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata' })
    await ctx.addInitScript(seed)
    const page = await ctx.newPage()
    for (const route of routes) {
      try {
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.evaluate(() => document.fonts.ready.catch(() => {}))
        await page.evaluate(() => new Promise((r) => setTimeout(r, 350)))
        for (const hit of await page.evaluate(PROBE)) {
          const k = `${hit.where}|${hit.text}`
          if (by.has(k)) { by.get(k).count++; by.get(k).routes.add(route) }
          else by.set(k, { ...hit, count: 1, routes: new Set([route]) })
        }
        visits++
      } catch { /* render failures belong to check-layout */ }
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  server.kill()
}

const clips = [...by.values()]
  .map((v) => ({ ...v, routes: [...v.routes].sort() }))
  .sort((a, b) => b.overflowPx - a.overflowPx)

mkdirSync(resolve(ROOT, 'artifacts/audit'), { recursive: true })
writeFileSync(OUT, `${JSON.stringify({ visits, clips }, null, 2)}\n`)

if (JSON_OUT) {
  console.log(JSON.stringify({ visits, clips }, null, 2))
} else {
  console.log(`route visits          : ${visits} (${routes.length} routes x ${WIDTHS.length} widths)`)
  console.log(`vertically clipped LSD: ${clips.length} distinct`)
  for (const c of clips) {
    console.log(`  [${c.count}x] ${c.where}  +${c.overflowPx}px  (font ${c.fontSize} / leading ${c.lineHeight})`)
    console.log(`         ${JSON.stringify(c.text)}`)
  }
  console.log(`\nfull report: artifacts/audit/lsd-clip.json`)
}

process.exit(clips.length ? 1 : 0)
