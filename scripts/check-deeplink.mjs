/**
 * check-deeplink.mjs — assert no flow route can cold-load blank.
 *
 *   node scripts/check-deeplink.mjs
 *
 * For every flow route, in both languages, loads the URL in a FRESH context with no prior SPA
 * state and asserts the page rendered something. Runs each route twice: once with a valid
 * miqaat id and once with an unknown one.
 *
 * ── WHY A COLD CONTEXT PER VISIT ─────────────────────────────────────────────────
 *
 * The reported symptom — "no page loads after city selection" — is a deep-link/cold-load class
 * of bug, and it is invisible if you navigate to the route from inside the running app: by then
 * the store is populated and every read succeeds. Reusing a browser context across routes
 * carries localStorage forward and reproduces that same false pass. Each visit therefore gets
 * its own context, which is what "opened this link in a new tab" actually means.
 *
 * ── WHAT COUNTS AS BLANK ─────────────────────────────────────────────────────────
 *
 * `#root` present but empty, or a body with no rendered text, is the failure. That is precisely
 * what an unguarded throw leaves behind once React unmounts the tree.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PORT = 4326
const VALID = 'ashara-1448'
const UNKNOWN = 'no-such-miqaat-xyz'

/** The flow the brief names, plus the routes it hands off to. */
const FLOW = ['/miqaats/:id/city', '/miqaats/:id/zone', '/miqaats/:id/city-allocation', '/miqaats/:id/zone-allocation']

const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]

/** Logged-in, but with NO flow state — the cold-load case. */
const seedFor = (lang) => `
  try {
    localStorage.setItem('rms-lang', ${JSON.stringify(lang)});
    localStorage.setItem('miqaat-flow', JSON.stringify({ state: { loggedIn: true }, version: 0 }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

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
const rows = []

try {
  for (const lang of ['en', 'lsd']) {
    for (const tmpl of FLOW) {
      for (const [kind, id] of [['valid', VALID], ['unknown', UNKNOWN]]) {
        const route = tmpl.replace(':id', id)
        const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata' })
        await ctx.addInitScript(seedFor(lang))
        const page = await ctx.newPage()
        const errors = []
        page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]))
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.evaluate(() => new Promise((r) => setTimeout(r, 700)))
        const state = await page.evaluate(() => ({
          path: location.pathname,
          text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
          rootChildren: document.getElementById('root')?.childElementCount ?? 0,
        }))
        rows.push({ lang, route, kind, ...state, errors })
        await ctx.close()
      }
    }
  }
} finally {
  await browser.close()
  server.kill()
}

let fails = 0
for (const r of rows) {
  const blank = r.rootChildren === 0 || r.text < 10
  const redirected = r.path === '/miqaats'
  // A valid id must render its own route; an unknown id must land on /miqaats. Neither may blank.
  const ok = !blank && (r.kind === 'valid' ? !redirected : redirected)
  if (!ok) fails++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${r.lang}  ${r.kind.padEnd(7)} ${r.route.padEnd(42)} -> ${r.path.padEnd(38)} text=${String(r.text).padStart(5)} root=${r.rootChildren}${r.errors.length ? '  ERRORS: ' + r.errors.join(' | ') : ''}`,
  )
}
console.log(`\n${rows.length - fails}/${rows.length} passed`)
process.exit(fails ? 1 : 0)
