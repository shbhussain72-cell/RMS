/**
 * check-review-tools.mjs — the review build, end to end, against a real preview server.
 *
 *   npm run check:review          (requires a dist/ built with VITE_REVIEW_TOOLS=true)
 *
 * `check-dev-only` proves the tool STRINGS are in the bundle. That is a grep, and a grep
 * cannot tell you the pill renders, the panel opens, an export contains anything, or that
 * mounting a fixed full-viewport remark layer over the app left the app usable. Those are the
 * things that actually have to be true for a reviewer, so they are asserted here, on the
 * built artefact, in a browser.
 *
 * The last group matters most and is the easiest to forget: the tooling mounts a layer over
 * every screen. If it swallowed clicks, the review build would be worse than useless — it
 * would look fine and quietly block the app it exists to review.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Mark the walkthrough seen, the same way every other probe here does.
 *
 * Not a workaround: the tour is a real z-[1000] modal on a first visit and it correctly
 * intercepted every click when this script first ran, which is the tour working. Seeding it
 * puts the browser in the state a returning reviewer is in. That the tour still fires on a
 * review build is itself part of "the app is unaffected", and the anchor count is asserted
 * at the end.
 */
const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]
let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok    ${name}`)
  else { console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
}

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('preview did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 800) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w)
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(`try{localStorage.setItem('rms-lang','en');localStorage.setItem('miqaat-flow',JSON.stringify({state:{loggedIn:true},version:0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR_KEYS)}))}catch{}`)
const page = await ctx.newPage()
const url = `http://localhost:${port}`

try {
  await page.goto(`${url}/miqaats`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  // ── 1. the tools are actually mounted, not merely present as strings ────────────────
  const chip = page.locator('[data-rmk="chip"]')
  check('remarks pill renders', await chip.count() === 1)
  await chip.click()
  check('panel opens', await page.locator('[data-rmk="panel"]').count() === 1)
  check('coverage panel is mounted too', await page.locator('[data-devdock]').count() >= 1)

  // ── 2. create a remark through the UI, the way a reviewer would ─────────────────────
  const TEXT = 'check-review-tools: the countdown unit labels wrap at this width'
  await page.locator('[data-rmk="chip"]').click()                    // close the panel
  await page.keyboard.press('Control+Shift+KeyM')                    // enter remark mode
  // A heading in the middle of the page, not the first one: the composer anchors near what you
  // clicked, and anchoring near the very top puts it off-screen above the viewport.
  await page.locator('h2, h3').nth(1).click({ force: true })
  const input = page.locator('[data-rmk="composer-input"]')
  await input.waitFor({ timeout: 5000 })
  await input.fill(TEXT)
  // Ctrl+Enter rather than clicking Save. The composer is absolutely positioned against the
  // element it annotates, so its Save button can legitimately sit outside the viewport — the
  // keyboard path is the one a reviewer uses there anyway.
  await input.press('Control+Enter')
  await page.waitForTimeout(300)   // sleep: the composer persists to localStorage asynchronously after Ctrl+Enter
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rms-remarks') || '[]'))
  check('a remark created through the UI persists', stored.length === 1 && stored[0].remark === TEXT,
    `${stored.length} stored`)

  // ── 3. the unexported badge counts it ──────────────────────────────────────────────
  await page.keyboard.press('Control+Shift+KeyM')                    // leave remark mode
  await page.locator('[data-rmk="chip"]').click()
  const badge = page.locator('[data-rmk="unexported"]')
  check('pill shows an unexported count', (await badge.count()) === 1 && (await badge.innerText()).includes('1'),
    `badge count ${await badge.count()}`)

  // The "this browser only" notice is deployed-build only. `vite preview` of a flag-on build
  // is exactly that case — DEV is false — so it must be showing here. On a dev server the
  // reviewer IS the developer and the line would be noise.
  const notice = await page.locator('[data-rmk="panel"] p', { hasText: 'this browser only' }).count()
  check('the deployed build explains that remarks go nowhere until exported', notice === 1,
    `${notice} notices found`)

  // ── 4. both exports, and what is IN them ───────────────────────────────────────────
  const grab = async (sel) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(sel).click()])
    const s = await dl.createReadStream()
    let out = ''
    for await (const c of s) out += c
    return out
  }
  const md = await grab('[data-rmk="export-md"]')
  check('Markdown export is readable as-is', md.includes('# Review remarks') && md.includes('## `/miqaats`') && md.includes(TEXT),
    'missing heading, route group or the remark text')
  const json = await grab('[data-rmk="export-json"]')
  let parsed = null
  try { parsed = JSON.parse(json) } catch { /* reported below */ }
  check('JSON export parses', Array.isArray(parsed) && parsed.length === 1)

  // Exporting clears the badge — otherwise the count means nothing.
  await page.waitForTimeout(200)   // sleep: export clears the badge through that same asynchronous write
  check('badge clears once exported', (await page.locator('[data-rmk="unexported"]').count()) === 0)

  // ── 5. the JSON re-imports: wipe, write it back, reload, the remark is there ────────
  await page.evaluate((raw) => {
    localStorage.removeItem('rms-remarks')
    localStorage.removeItem('rms-remarks-exported')
    localStorage.setItem('rms-remarks', raw)
  }, json)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-rmk="chip"]').click()
  const rows = page.locator('[data-rmk="row"]')
  check('exported JSON re-imports and re-anchors', (await rows.count()) === 1
    && (await rows.first().getAttribute('data-rmk-orphaned')) === '0',
    `${await rows.count()} rows, orphaned=${await rows.first().getAttribute('data-rmk-orphaned').catch(() => '?')}`)

  // ── 6. the app still works underneath ──────────────────────────────────────────────
  await page.locator('[data-rmk="chip"]').click()                    // close the panel
  const hit = await page.evaluate(() => {
    // With remark mode OFF, the topmost element at the middle of the page must belong to the
    // app, not to the tool layer.
    //
    // probe-dom: point is chosen, not derived from a rect — the centre of the viewport.
    const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2))
    return { tool: !!el?.closest('[data-remark-chrome],[data-rmk]'), tag: el?.tagName ?? 'null' }
  })
  check('the remark layer does not intercept pointer events when off', !hit.tool, `topmost was ${hit.tag}`)

  const before = page.url()
  await page.locator('a[href], [role="button"]').first().click({ trial: true }).then(() => true).catch(() => false)
  await page.locator('.ix-card-lg').first().click()
  await page.waitForTimeout(500)   // sleep: card click navigates, and the route transition has no awaitable end
  check('an app control still navigates', page.url() !== before, `still at ${page.url()}`)

  const focus = await page.evaluate(() => {
    // Enabled and on-screen. A disabled button legitimately refuses focus, and picking one
    // made this assertion fail while nothing was wrong — the first run reported activeElement
    // as BODY for exactly that reason.
    const b = [...document.querySelectorAll('button')].find((e) => {
      if (e.disabled || e.closest('[data-remark-chrome],[data-rmk],[data-devdock]')) return false
      const r = e.getBoundingClientRect()
      return r.width > 4 && r.height > 4 && r.top >= 0 && r.bottom <= innerHeight
    })
    if (!b) return { ok: false, why: 'no enabled on-screen app button found' }
    b.focus()
    return { ok: document.activeElement === b, why: `${document.activeElement?.tagName} "${(b.textContent || '').trim().slice(0, 20)}"` }
  })
  check('focus still lands on app controls', focus.ok, focus.why)

  const tour = await page.evaluate(() => document.querySelectorAll('[data-tour]').length)
  check('tour anchors are untouched', tour > 0, `${tour} anchors`)
} finally {
  await browser.close()
  proc.kill()
}

console.log(`\n${failures} failing assertion(s)`)
process.exit(failures === 0 ? 0 : 1)
