/**
 * check-review-tools.mjs — the review build, end to end, against a real preview server.
 *
 *   npm run check:review          (requires a dist/ built with VITE_REVIEW_TOOLS=true)
 *
 * `check-dev-only` proves the tool STRINGS are in the bundle. That is a grep, and a grep
 * cannot tell you the chip renders, the board opens, a note survives being written, or that
 * mounting dev chrome over every screen left the app usable. Those are the things that actually
 * have to be true for a reviewer, so they are asserted here, on the built artefact, in a browser.
 *
 * The last group matters most and is the easiest to forget: the tooling floats over every
 * screen. If it swallowed clicks, the review build would be worse than useless — it would look
 * fine and quietly block the app it exists to review.
 *
 * RETARGETED 11 Aug 2026 from Remarks to the notes board. Remarks is retired and unmounted (see
 * src/main.tsx); this suite was not retired with it, because what it asserts is "the review
 * BUILD works end to end", and that claim outlived the tool it was originally made about. One
 * assertion was added rather than removed: the retired pill must now be absent.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDist } from './lib/dist-precondition.mjs'

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
// The bundle under test must be the bundle this source produces. `check-chrome` printed ok for
// four days against a dist/ built before the commit that broke it — see the arrival audit's
// third column. Builds one when it is not, because a suite that stops with a message nobody
// reads is the same as a suite that guesses.
if (!ensureDist({ reviewTools: true, suite: 'check-review-tools' })) process.exit(2)

const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('preview did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 800) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w)
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
/**
 * THE AUTHOR IS SEEDED, AND THAT IS A PRECONDITION RATHER THAN A CONVENIENCE.
 *
 * Unseeded, the board opens with IdentityPrompt at the top and that prompt autofocuses its name
 * field, so the first thing typed goes into the name rather than into the note. The remarks
 * suite lost six assertions to the same thing before it was found; every note also has to carry
 * an author, so seeding one is what the tool requires, not a way around it.
 *
 * NO ADAPTER, NO STORE SELECTOR, NOTHING ABOUT AN API. Notes are local by construction. This
 * suite used to seed `rms-remarks-adapter` because the review build defaulted to a shared store
 * that `vite preview` cannot serve — a whole precondition that exists only because there was a
 * backend. There is not one now.
 */
await ctx.addInitScript(`try{localStorage.setItem('rms-lang','en');localStorage.setItem('rms-remark-author','harness');localStorage.setItem('miqaat-flow',JSON.stringify({state:{loggedIn:true},version:0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR_KEYS)}))}catch{}`)
const page = await ctx.newPage()
const url = `http://localhost:${port}`

try {
  await page.goto(`${url}/miqaats`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  // ── 1. the tools are actually mounted, not merely present as strings ────────────────
  //
  // This is the half check-dev-only cannot do. That is a grep, and a grep cannot tell you the
  // chip renders, the board opens, or that mounting dev chrome over the app left the app usable.
  const chip = page.locator('[data-notes="chip"]')
  check('notes chip renders', await chip.count() === 1)
  await chip.click()
  check('board opens', await page.locator('[data-notes="board"]').count() === 1)
  check('coverage panel is mounted too', await page.locator('[data-devdock]').count() >= 2)

  // The retired tool must be ABSENT, not merely unused. Its code is still in the tree behind the
  // same flag, so "we stopped rendering it" is a claim about a component this can check rather
  // than take on trust — a stray import would put the pill back on every screen.
  check('the retired remarks pill is not mounted', await page.locator('[data-rmk="chip"]').count() === 0,
    'a [data-rmk="chip"] is on the page; remarks is retired and should render nothing')

  // ── 2. write a note through the UI, the way a reviewer would ───────────────────────
  const TEXT = 'check-review-tools: the countdown unit labels wrap at this width'
  await page.locator('[data-notes="input"]').fill(TEXT)
  await page.locator('[data-notes="add"]').click()
  await page.locator(`[data-notes="row"]`).first().waitFor({ timeout: 5000 })
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rms-notes.v1') || '{}'))
  check('a note written through the UI persists', (stored.notes || []).length === 1 && stored.notes[0].text === TEXT,
    `${(stored.notes || []).length} stored`)

  // It belongs to the route PATTERN, not the pathname it was written on.
  check('the note is filed against the route pattern', stored.notes?.[0]?.route === '/miqaats',
    `filed against ${stored.notes?.[0]?.route}`)

  // The language is recorded from the app, never asked for.
  check('the note records the language it was written in', stored.notes?.[0]?.lang === 'en',
    `lang ${stored.notes?.[0]?.lang}`)

  // ── 3. it says, on the board, that nobody else can see it ──────────────────────────
  //
  // The one thing a reviewer cannot discover for themselves: they write twenty notes and assume
  // somebody received them. It has to be on the board, not in a doc.
  const notice = await page.locator('[data-notes="local-notice"]').count()
  check('the board states that notes are local to this browser', notice === 1, `${notice} notices found`)

  // ── 4. the app still works underneath ──────────────────────────────────────────────
  await page.locator('[data-notes="chip"]').click()                   // close the board
  const hit = await page.evaluate(() => {
    // The topmost element at the middle of the page must belong to the app, not to the dev
    // chrome floating over it.
    //
    // probe-dom: point is chosen, not derived from a rect — the centre of the viewport.
    const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2))
    return { tool: !!el?.closest('[data-notes],[data-devdock]'), tag: el?.tagName ?? 'null' }
  })
  check('the dev chrome does not intercept pointer events over the app', !hit.tool, `topmost was ${hit.tag}`)

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
      if (e.disabled || e.closest('[data-notes],[data-devdock]')) return false
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
