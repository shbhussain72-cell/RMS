/**
 * check-font-fallback.mjs — prove the LSD stack degrades to an Arabic-capable face.
 *
 *   node scripts/check-font-fallback.mjs
 *
 * Loads a translated screen twice: once normally, once with every request under /fonts/
 * aborted, so the self-hosted face cannot arrive. In BOTH states it reports the fonts the
 * browser actually used to paint an Arabic node, and writes a screenshot of the blocked
 * state to artifacts/audit/font-fallback/.
 *
 * ── WHY CDP AND NOT A SCREENSHOT ─────────────────────────────────────────────────
 *
 * "Does the fallback work" is a question about which physical font file painted the glyphs,
 * and CSS gives you no way to ask. `font-family` reports the declared LIST, not the resolved
 * face, and it reads identically whether the first entry loaded or the browser silently fell
 * through to the fourth. Eyeballing a screenshot is no better: a reviewer who does not read
 * Arabic cannot tell a correct naskh fallback from a wrong-but-plausible one, and tofu at
 * small sizes is easy to miss.
 *
 * `CSS.getPlatformFontsForNode` answers it directly — it returns the real family names and
 * how many glyphs each one painted.
 *
 * The failure this guards against is specific. The stack used to end at Mulish, which has NO
 * Arabic coverage, so a blocked webfont meant every Arabic glyph rendered as tofu — boxes,
 * not smaller text. The assertion below is therefore not "some font was used" but "the face
 * that painted the Arabic is not a Latin-only one".
 *
 * ── KNOWN GAP: THIS SUITE DOES NOT PROVE IT ARRIVED ─────────────────────────────────
 *
 * Measured, not suspected: pointed at a build where every route redirects to /login, this suite
 * PASSED. See "The arrival audit" in docs/assertion-discipline.md. Its assertions are negatives,
 * and a negative is most true of a page with nothing on it.
 *
 * The fix is `createArrival` from ./arrival.mjs, as used by check-numerals, check-lsd-clip,
 * check-overlap, check-layout and check-centred: derive `expected` from the matrix this suite
 * sweeps, call `arrival.visit(page, route, combo)` before measuring, and fold `arrival.verify()`
 * into the exit code. Deferred behind a user-facing defect, deliberately — this is a known hole,
 * not an unknown one.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PORT = 4325
const MIQAAT_ID = 'ashara-1448'
const ROUTE = `/miqaats/${MIQAAT_ID}`
const OUT_DIR = resolve(ROOT, 'artifacts/audit/font-fallback')

/** Faces with no Arabic coverage. If one of these paints the Arabic node, the stack is broken. */
const LATIN_ONLY = [/^mulish/i, /^marcellus/i]

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

/** Tag the first element holding real Arabic text so CDP has a stable selector to resolve. */
const TAG_ARABIC = () => {
  const ARABIC = /[ؠ-يٱ-ۓ]/
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.nodeValue || '').trim()
    if (!t || !ARABIC.test(t)) continue
    const el = n.parentElement
    if (!el || el.offsetParent === null) continue
    el.setAttribute('data-font-probe', '1')
    return t.slice(0, 40)
  }
  return null
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

async function run(browser, { block }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata' })
  await ctx.addInitScript(seed)
  const page = await ctx.newPage()
  let blocked = 0
  if (block) {
    await page.route('**/fonts/**', (r) => { blocked++; return r.abort() })
  }
  await page.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.catch(() => {}))
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)))

  const sample = await page.evaluate(TAG_ARABIC)
  const client = await ctx.newCDPSession(page)
  await client.send('DOM.enable')
  await client.send('CSS.enable')
  const { root } = await client.send('DOM.getDocument')
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-font-probe]' })
  let fonts = []
  if (nodeId) {
    const res = await client.send('CSS.getPlatformFontsForNode', { nodeId })
    fonts = res.fonts.map((f) => ({ family: f.familyName, glyphs: f.glyphCount }))
  }

  if (block) {
    mkdirSync(OUT_DIR, { recursive: true })
    await page.screenshot({ path: resolve(OUT_DIR, 'lsd-fonts-blocked@390.png'), fullPage: false })
  }
  await ctx.close()
  return { sample, fonts, blocked }
}

const server = await serve()
const browser = await chromium.launch()
let normal, degraded
try {
  normal = await run(browser, { block: false })
  degraded = await run(browser, { block: true })
} finally {
  await browser.close()
  server.kill()
}

const show = (label, r) => {
  console.log(`\n  ${label}`)
  console.log(`    Arabic sample : ${JSON.stringify(r.sample)}`)
  if (!r.fonts.length) console.log('    platform fonts: (none reported)')
  for (const f of r.fonts) console.log(`    platform font : ${f.family}  (${f.glyphs} glyphs)`)
}

show('LOADED — webfont reachable', normal)
show(`BLOCKED — ${degraded.blocked} /fonts/ request(s) aborted`, degraded)

const painter = degraded.fonts.slice().sort((a, b) => b.glyphs - a.glyphs)[0]
const bad = painter && LATIN_ONLY.some((re) => re.test(painter.family))
const none = !painter

console.log('')
if (none) {
  console.log('  RESULT: FAIL — no font reported for the Arabic node in the blocked state.')
} else if (bad) {
  console.log(`  RESULT: FAIL — Arabic painted by ${painter.family}, which has no Arabic coverage (tofu).`)
} else {
  console.log(`  RESULT: PASS — Arabic falls back to ${painter.family}, an Arabic-capable face.`)
}
console.log(`  screenshot: artifacts/audit/font-fallback/lsd-fonts-blocked@390.png\n`)

process.exit(none || bad ? 1 : 0)
