/**
 * check-numerals.mjs — assert the LSD numeral rule across every route.
 *
 *   node scripts/check-numerals.mjs           # report + non-zero exit on a violation
 *   node scripts/check-numerals.mjs --json    # machine-readable
 *   node scripts/check-numerals.mjs --all     # also list every ASCII-digit run for review
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────────
 *
 * In LSD: Arabic-Indic digits for dates, times and counts that sit inside prose; Latin
 * digits for ITS ids and technical identifiers. Both appear on the same SCREEN by design —
 * an ITS id next to a countdown is correct — so "this page contains both" is not the test.
 *
 * THE VIOLATION IS PER TEXT NODE. One string holding both systems (`٠٥:٠٠ on 15 Jun 2026`)
 * is the failure: it has no consistent reading order, no consistent script, and nothing in
 * the bidi algorithm can rescue it. Two adjacent nodes, each internally consistent and each
 * in its own isolate, are exactly what the Bidi helpers are built to produce and are fine.
 *
 * That distinction is why this walks the rendered DOM rather than grepping source: whether
 * two numbers share a text node is a fact about what React emitted, not about how the JSX
 * reads.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PORT = 4323
const MIQAAT_ID = 'ashara-1448'
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const ALL = argv.includes('--all')
const OUT = resolve(ROOT, 'artifacts/audit/numerals.json')

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
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'PATH', 'TEXTAREA'])
  const ARABIC_INDIC = /[٠-٩۰-۹]/
  const ASCII_DIGIT = /[0-9]/
  const mixed = []
  const ascii = []

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue || '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const el = n.parentElement
    if (!el || !el.isConnected) continue
    let skip = false
    for (let a = el; a; a = a.parentElement) {
      if (SKIP.has(a.tagName?.toUpperCase()) || a.hasAttribute?.('data-lsd-scanner-ignore')) { skip = true; break }
    }
    if (skip) continue
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue

    const where = `${el.tagName.toLowerCase()}${
      el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''
    }`

    // THE violation: one string, both numbering systems.
    if (ARABIC_INDIC.test(text) && ASCII_DIGIT.test(text)) {
      mixed.push({ text: text.slice(0, 120), where })
      continue
    }
    // Everything else with ASCII digits is reported only under --all, for classification:
    // an ITS id is correct here, a bare count is not, and no regex can tell them apart.
    if (ASCII_DIGIT.test(text)) ascii.push({ text: text.slice(0, 80), where })
  }
  return { mixed, ascii }
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
const mixedBy = new Map()
const asciiBy = new Map()
let visits = 0

try {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata' })
  await ctx.addInitScript(seed)
  const page = await ctx.newPage()
  for (const route of routes) {
    try {
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.evaluate(() => new Promise((r) => setTimeout(r, 400)))
      const { mixed, ascii } = await page.evaluate(PROBE)
      for (const m of mixed) {
        const k = `${m.text}|${m.where}`
        if (mixedBy.has(k)) { mixedBy.get(k).count++; mixedBy.get(k).routes.add(route) }
        else mixedBy.set(k, { ...m, count: 1, routes: new Set([route]) })
      }
      for (const a of ascii) {
        const k = `${a.text}|${a.where}`
        if (asciiBy.has(k)) { asciiBy.get(k).count++; asciiBy.get(k).routes.add(route) }
        else asciiBy.set(k, { ...a, count: 1, routes: new Set([route]) })
      }
      visits++
    } catch { /* a route that fails to render is check-layout's problem, not this one */ }
  }
} finally {
  await browser.close()
  server.kill()
}

const fin = (m) => [...m.values()].map((v) => ({ ...v, routes: [...v.routes].sort() })).sort((a, b) => b.count - a.count)
const mixed = fin(mixedBy)
const ascii = fin(asciiBy)

mkdirSync(resolve(ROOT, 'artifacts/audit'), { recursive: true })
writeFileSync(OUT, `${JSON.stringify({ visits, mixed, ascii }, null, 2)}\n`)

if (JSON_OUT) {
  console.log(JSON.stringify({ visits, mixed, ascii }, null, 2))
} else {
  console.log(`routes visited              : ${visits}`)
  console.log(`nodes mixing BOTH systems   : ${mixed.length}`)
  for (const m of mixed) console.log(`  [${m.count}x] ${m.where}  ${JSON.stringify(m.text)}\n         ${m.routes.join(', ')}`)
  console.log(`nodes with ASCII digits     : ${ascii.length} distinct (ITS ids and identifiers are CORRECT here)`)
  if (ALL) for (const a of ascii) console.log(`  [${a.count}x] ${a.where}  ${JSON.stringify(a.text)}`)
  console.log(`\nfull report: artifacts/audit/numerals.json`)
}

process.exit(mixed.length ? 1 : 0)
