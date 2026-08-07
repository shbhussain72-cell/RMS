/**
 * shoot.mjs — screenshot every route in both languages at four widths.
 *
 *   npm run shoot                      # all routes, both languages, 4 widths
 *   npm run shoot -- --lang lsd        # one language
 *   npm run shoot -- --width 390       # one width
 *   npm run shoot -- --route /miqaats  # one route (repeatable)
 *
 * Output: artifacts/audit/<lang>/<route-slug>@<width>.png
 *
 * Re-runnable and stable, so a later session can diff its output against this one and see
 * only real changes. Three things make that true:
 *   · fixed viewport widths and `fullPage`, so height follows content deterministically
 *   · animations disabled and fonts awaited before every capture
 *   · state seeded identically on each run (see SEED below)
 *
 * Routes are read from src/App.tsx rather than hard-coded, so a route added to the router
 * cannot silently escape the audit.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT_ROOT = resolve(ROOT, 'artifacts/audit')

const argv = process.argv.slice(2)
const flag = (name) => {
  const out = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === `--${name}`) out.push(argv[i + 1])
  return out
}
const WIDTHS = flag('width').length ? flag('width').map(Number) : [390, 768, 1024, 1440]
const LANGS = flag('lang').length ? flag('lang') : ['en', 'lsd']
const ONLY = flag('route')
const PORT = Number(flag('port')[0] || 4319)
const BASE = `http://localhost:${PORT}`

/**
 * A concrete miqaat id for every `:id` route. `ashara-1448` is the fullest fixture in
 * src/data/seed.ts — it has a timeline, a raza letter and demo stage overrides — so it
 * exercises more of each screen than a sparser event would.
 */
const MIQAAT_ID = 'ashara-1448'

// ─── routes, read from the router ─────────────────────────────────────────────
const appSrc = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
const routes = [...new Set([...appSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p !== '*' && p !== '/')          // catch-all and the redirect render nothing of their own
  .map((p) => p.replace(/:id/g, MIQAAT_ID))
  .sort()
const targets = ONLY.length ? routes.filter((r) => ONLY.some((o) => r.startsWith(o.replace(/:id/g, MIQAAT_ID)))) : routes

const slug = (route) => route.replace(/^\//, '').replace(/\//g, '_') || 'root'

// ─── preview server ───────────────────────────────────────────────────────────
// Shot against the production build, not the dev server: HMR and the dev overlay both
// inject DOM that would show up in the diff. The CoveragePanel is dev-only and therefore
// absent here, which is what we want — it must not appear in an audit screenshot.
async function serve() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`preview server did not start on ${PORT}`)), 30_000)
    const watch = (buf) => { if (String(buf).includes(String(PORT))) { clearTimeout(timer); ok() } }
    proc.stdout.on('data', watch)
    proc.stderr.on('data', watch)
    proc.on('exit', (c) => { clearTimeout(timer); fail(new Error(`preview exited early (${c})`)) })
  })
  return proc
}

/**
 * Seed localStorage before the app boots.
 *
 * Language uses the SAME key the app's own switcher writes (`rms-lang`, read by
 * readStoredLang() in src/i18n/index.tsx), so the capture goes through the real code path
 * rather than a test-only hook — including applyRootLang()'s pre-paint `dir` write, which
 * is what stops a first frame of LTR.
 *
 * `miqaat-flow` is zustand's persist key; without `loggedIn` every route bounces to /login
 * through RequireAuth and 25 of 27 screenshots would be the same page.
 */
/**
 * Tour keys, read from src/tour/steps.ts.
 *
 * `rms-tour-seen` holds a JSON ARRAY of screen keys. Seeding the string '1' (as this harness
 * originally did) makes `JSON.parse` return the NUMBER 1, and TourProvider's
 * `getSeen().includes(...)` throws — which crashed the React tree on every route that has a
 * walkthrough. Eight routes rendered as blank cream pages in both languages, and because the
 * files were still written at full viewport size, a "200/200 screenshots, none missing" check
 * reported success on them.
 */
const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]

const seedScript = (lang) => `
  try {
    localStorage.setItem('rms-lang', ${JSON.stringify(lang)});
    const prev = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...prev,
      state: { ...(prev.state || {}), loggedIn: true },
      version: prev.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true })
  const server = await serve()
  const browser = await chromium.launch()
  let shots = 0
  const failures = []

  try {
    for (const lang of LANGS) {
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
          // Fixed locale/timezone: the app renders dates, and a machine in another zone
          // would otherwise produce a different image for identical code.
          locale: 'en-GB',
          timezoneId: 'Asia/Kolkata',
        })
        await ctx.addInitScript(seedScript(lang))
        const page = await ctx.newPage()
        // Kill transitions outright — a screenshot taken mid-animation is not reproducible.
        await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}` }).catch(() => {})

        for (const route of targets) {
          const dir = resolve(OUT_ROOT, lang)
          mkdirSync(dir, { recursive: true })
          const file = resolve(dir, `${slug(route)}@${width}.png`)
          try {
            await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20_000 })
            // Fonts first: Kanz al-Lulu is a 500KB face and a shot taken before it loads
            // shows fallback glyphs at different metrics.
            await page.evaluate(() => document.fonts?.ready)
            // Then let layout settle (two frames) before capturing.
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

            const actualDir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
            const expectDir = lang === 'lsd' ? 'rtl' : 'ltr'
            if (actualDir !== expectDir) {
              failures.push(`${lang} ${route} @${width}: <html dir> was "${actualDir}", expected "${expectDir}"`)
            }
            await page.screenshot({ path: file, fullPage: true })
            shots++
          } catch (err) {
            failures.push(`${lang} ${route} @${width}: ${err.message.split('\n')[0]}`)
          }
        }
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
    server.kill()
  }

  const expected = LANGS.length * WIDTHS.length * targets.length
  console.log(`\n${shots}/${expected} screenshots → artifacts/audit/<lang>/<route>@<width>.png`)
  console.log(`  languages: ${LANGS.join(', ')}   widths: ${WIDTHS.join(', ')}   routes: ${targets.length}`)
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`)
    for (const f of failures.slice(0, 30)) console.error(`  ${f}`)
    if (failures.length > 30) console.error(`  …and ${failures.length - 30} more`)
    process.exit(1)
  }
  console.log('  no missing routes')
}

main().catch((err) => { console.error(err); process.exit(1) })
