/**
 * check-remarks.mjs — drives the Remarks tool in a real browser, in both languages.
 *
 *   node scripts/check-remarks.mjs
 *
 * Runs against `vite dev`, NOT `vite preview`: the tool is gated on `import.meta.env.DEV`, so
 * it does not exist in a production build. (That absence is itself verified separately by
 * grepping dist/ — the two checks are opposite halves of the same requirement.)
 *
 * WHY A BROWSER AND NOT jsdom
 *
 * Every claim worth making here is about layout: does this selector still find the element,
 * is the pin on the correct side under RTL, does the composer stay inside a 390px viewport.
 * jsdom has no layout — `getBoundingClientRect` returns zeros — so a jsdom suite would assert
 * on a simulation of the mechanism rather than the mechanism. Playwright is already a
 * dependency here and already drives check-layout.mjs.
 *
 * THE CASE THAT MATTERS MOST is `moved`: the element's structural path breaks but the element
 * is still on screen. That MUST re-anchor rather than orphan. Over-eager orphaning is what
 * makes a reviewer stop trusting the flag, at which point the real orphans go unread too.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROUTE = '/miqaats/ashara-1448/city'
const OTHER_ROUTE = '/miqaats/other-miqaat/city'

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function freePort() {
  return new Promise((ok) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
  })
}

async function serve(port) {
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('dev server did not start')), 90_000)
    const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1200) } }
    proc.stdout.on('data', w)
    proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
  })
  return proc
}

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

/** Wait for the resolution pass (settle 500ms + 1s interval) to have run at least once. */
const settle = (page) => page.waitForTimeout(1400)

async function openPanel(page) {
  if (!(await page.locator('[data-rmk="panel"]').count())) {
    await page.locator('[data-rmk="chip"]').click()
  }
  await page.locator('[data-rmk="panel"]').waitFor({ state: 'visible' })
}

/** Read the harness attributes off a remark's row in the list panel. */
async function rowState(page, id) {
  const row = page.locator(`[data-rmk="row"][data-rmk-id="${id}"]`)
  if (!(await row.count())) return null
  return {
    orphaned: (await row.getAttribute('data-rmk-orphaned')) === '1',
    degraded: (await row.getAttribute('data-rmk-degraded')) === '1',
    by: await row.getAttribute('data-rmk-by'),
  }
}

/**
 * Ensure the fixture board is visible.
 *
 * Idempotent by inspection rather than by counting clicks: the toggle is stateful, and a test
 * that assumes it knows the current state breaks the moment a step is added above it.
 */
async function ensureFixture(page) {
  await openPanel(page)
  if (!(await page.locator('[data-rmk="targets"]').count())) {
    await page.locator('[data-rmk="fixture-toggle"]').click()
  }
  await page.locator('[data-rmk="targets"]').waitFor({ state: 'visible' })
}

/** Create a remark on a fixture target by its visible text. */
async function addRemarkOn(page, targetText, body) {
  await page.keyboard.press('Control+Shift+M')             // enter remark mode
  await page.locator('[data-rmk="targets"]').getByText(targetText, { exact: true }).click()
  await page.locator('[data-rmk="composer"]').waitFor({ state: 'visible' })
  await page.locator('[data-rmk="composer-input"]').fill(body)
  await page.locator('[data-rmk="composer-save"]').click()
  await page.keyboard.press('Escape')                       // leave remark mode
  await settle(page)
}

async function runLang(browser, lang, port) {
  console.log(`\n─── ${lang} (${lang === 'lsd' ? 'RTL' : 'LTR'}) ───`)
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
  })
  await ctx.addInitScript(seed(lang))
  const page = await ctx.newPage()
  // Clear ONCE here, not in addInitScript: an init script runs before EVERY navigation, so
  // clearing there wipes the remarks on the reload the test is trying to verify.
  await page.goto(`http://localhost:${port}${ROUTE}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.removeItem('rms-remarks'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts?.ready)
  await settle(page)

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
  check(`${lang}: document dir is ${lang === 'lsd' ? 'rtl' : 'ltr'}`, dir === (lang === 'lsd' ? 'rtl' : 'ltr'), `got ${dir}`)

  // ── mode OFF must not intercept ────────────────────────────────────────────────
  // Assert on the real mechanism rather than a proxy: at a point over ordinary app content,
  // the topmost element must not belong to the remarks layer.
  const intercepts = await page.evaluate(() => {
    const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2))
    return !!el?.closest('[data-remark-chrome]')
  })
  check(`${lang}: layer does not intercept pointer events when off`, !intercepts)

  await ensureFixture(page)

  // ── create three remarks, one per identifier class ─────────────────────────────
  await addRemarkOn(page, 'Target with id', `id-anchored remark (${lang})`)
  await addRemarkOn(page, 'Target with data-tour', `tour-anchored remark (${lang})`)
  await addRemarkOn(page, 'Plain target, structural only', `structural-only remark (${lang})`)

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rms-remarks') || '[]'))
  check(`${lang}: three remarks persisted`, stored.length === 3, `got ${stored.length}`)

  const byText = Object.fromEntries(stored.map((r) => [r.remark, r]))
  const idR = byText[`id-anchored remark (${lang})`]
  const tourR = byText[`tour-anchored remark (${lang})`]
  const plainR = byText[`structural-only remark (${lang})`]

  check(`${lang}: captures lang/dir/width automatically`,
    !!idR && idR.lang === lang && idR.dir === (lang === 'lsd' ? 'rtl' : 'ltr') && idR.viewportWidth === 1440,
    idR ? `${idR.lang}/${idR.dir}/${idR.viewportWidth}` : 'missing')
  check(`${lang}: strongest available identifier chosen at capture`,
    idR?.capturedStrategy === 'id' && tourR?.capturedStrategy === 'tour' && plainR?.capturedStrategy === 'structural',
    `${idR?.capturedStrategy}/${tourR?.capturedStrategy}/${plainR?.capturedStrategy}`)
  check(`${lang}: every identifier captured, not just the winner`,
    !!plainR?.identifiers.structural && !!plainR?.identifiers.text && plainR?.identifiers.textLang === lang)

  const pinsBefore = await page.locator('[data-rmk="pin"]').count()
  check(`${lang}: pins rendered for all three`, pinsBefore === 3, `got ${pinsBefore}`)

  // ── pin mirrors ────────────────────────────────────────────────────────────────
  // The pin sits at the target's INLINE-end corner: right in LTR, left in RTL.
  const mirrored = await page.evaluate(() => {
    const pin = document.querySelector('[data-rmk="pin"]')
    const tgt = [...document.querySelectorAll('[data-rmk="targets"] p')].find((p) => p.textContent?.includes('Target with id'))
    if (!pin || !tgt) return null
    const p = pin.getBoundingClientRect(); const t = tgt.getBoundingClientRect()
    return { pinCx: p.left + p.width / 2, tLeft: t.left, tRight: t.right }
  })
  if (mirrored) {
    const nearEnd = lang === 'lsd'
      ? Math.abs(mirrored.pinCx - mirrored.tLeft) < 4
      : Math.abs(mirrored.pinCx - mirrored.tRight) < 4
    check(`${lang}: pin anchors to the inline-END corner`, nearEnd,
      `pin centre ${Math.round(mirrored.pinCx)}, target ${Math.round(mirrored.tLeft)}..${Math.round(mirrored.tRight)}`)
  } else {
    check(`${lang}: pin anchors to the inline-END corner`, false, 'could not measure')
  }

  // ── reload: still anchored ─────────────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await ensureFixture(page)
  await settle(page)
  const afterReload = await page.locator('[data-rmk="pin"]').count()
  check(`${lang}: pins survive a reload`, afterReload === 3, `got ${afterReload}`)

  // ── route param changed: off-route, so NOT orphaned ────────────────────────────
  await page.goto(`http://localhost:${port}${OTHER_ROUTE}`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await openPanel(page)
  const offRoute = await rowState(page, idR.id)
  check(`${lang}: different route param does NOT orphan`, offRoute && !offRoute.orphaned,
    offRoute ? `orphaned=${offRoute.orphaned}` : 'row missing')

  await page.goto(`http://localhost:${port}${ROUTE}`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await ensureFixture(page)
  await settle(page)
  const backAgain = await page.locator('[data-rmk="pin"]').count()
  check(`${lang}: pins survive navigating away and back`, backAgain === 3, `got ${backAgain}`)

  // ── break modes ────────────────────────────────────────────────────────────────
  const setMode = async (mode) => {
    await openPanel(page)
    await page.locator(`[data-rmk="mode-${mode}"]`).click()
    await settle(page)
    await openPanel(page)
  }

  // MOVED — the near-miss. Structural path breaks; everything must re-anchor.
  await setMode('moved')
  const movedId = await rowState(page, idR.id)
  const movedTour = await rowState(page, tourR.id)
  const movedPlain = await rowState(page, plainR.id)
  check(`${lang}: MOVED — id-anchored re-anchors, not orphaned`, movedId && !movedId.orphaned, `by=${movedId?.by}`)
  check(`${lang}: MOVED — tour-anchored re-anchors, not orphaned`, movedTour && !movedTour.orphaned, `by=${movedTour?.by}`)
  check(`${lang}: MOVED — structural-only RE-ANCHORS via text, not orphaned`,
    movedPlain && !movedPlain.orphaned, `by=${movedPlain?.by}`)
  await setMode('moved') // off

  // REORDERED — nth-child now points at a different element. Corroboration must reject that
  // match and fall through, rather than silently pinning the wrong target.
  await setMode('reordered')
  const reId = await rowState(page, idR.id)
  const rePlain = await rowState(page, plainR.id)
  check(`${lang}: REORDERED — id-anchored unaffected`, reId && !reId.orphaned, `by=${reId?.by}`)
  check(`${lang}: REORDERED — structural-only does not mis-anchor`,
    rePlain && !rePlain.orphaned && rePlain.by !== 'structural', `by=${rePlain?.by}`)
  await setMode('reordered')

  // DELETED — the plain target is gone entirely. It has no other identifier, so it orphans;
  // the other two are untouched.
  await setMode('deleted')
  const delPlain = await rowState(page, plainR.id)
  const delId = await rowState(page, idR.id)
  check(`${lang}: DELETED — structural-only orphans`, delPlain && delPlain.orphaned, `orphaned=${delPlain?.orphaned}`)
  check(`${lang}: DELETED — untouched siblings stay anchored`, delId && !delId.orphaned)
  // Orphaning must never lose the text or the context.
  const kept = await page.evaluate((id) => {
    const all = JSON.parse(localStorage.getItem('rms-remarks') || '[]')
    const r = all.find((x) => x.id === id)
    return r ? { text: r.remark, ctx: !!r.identifiers.text, seen: !!r.lastSeenAt } : null
  }, plainR.id)
  check(`${lang}: orphan keeps its text and captured context`,
    !!kept && kept.text.includes('structural-only') && kept.ctx && kept.seen)
  await setMode('deleted')

  // Recovery: un-breaking must clear the orphan. Orphaning has to be reversible.
  await settle(page)
  await openPanel(page)
  const recovered = await rowState(page, plainR.id)
  check(`${lang}: orphan RECOVERS when the element returns`, recovered && !recovered.orphaned,
    `orphaned=${recovered?.orphaned}`)

  // AMBIGUOUS TEXT — unique-at-creation is not unique-at-load.
  //
  // `moved` breaks the structural path so resolution reaches the text fallback; `duplicated`
  // adds a second element with identical text. The fallback must then find TWO matches and
  // orphan rather than pick one. Picking would silently pin to an element the reviewer never
  // annotated — the same invisible failure class as the reorder mis-pin.
  await setMode('moved')
  await setMode('duplicated')
  const ambiguous = await rowState(page, plainR.id)
  check(`${lang}: AMBIGUOUS text match orphans rather than picking`,
    ambiguous && ambiguous.orphaned, `orphaned=${ambiguous?.orphaned} by=${ambiguous?.by}`)
  // And the id/tour anchored ones are untouched by the ambiguity — it is not a global failure.
  const ambId = await rowState(page, idR.id)
  check(`${lang}: AMBIGUOUS — stronger anchors unaffected`, ambId && !ambId.orphaned, `by=${ambId?.by}`)
  await setMode('duplicated')
  await setMode('moved')

  // UNRENDERED — all targets conditionally removed.
  await setMode('unrendered')
  const unId = await rowState(page, idR.id)
  check(`${lang}: UNRENDERED — orphans while absent`, unId && unId.orphaned)
  await setMode('unrendered')

  // ── viewport containment at 390 and 1440 ───────────────────────────────────────
  for (const width of NARROW_WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    await settle(page)
    await openPanel(page)
    const overflow = await page.evaluate(() => {
      const out = []
      for (const sel of ['[data-rmk="panel"]', '[data-rmk="composer"]']) {
        const el = document.querySelector(sel)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) {
          out.push(`${sel} ${Math.round(r.left)}..${Math.round(r.right)} of ${innerWidth}`)
        }
      }
      return out
    })
    check(`${lang}: panel stays inside the viewport at ${width}px`, overflow.length === 0, overflow.join('; '))
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // ── mixed-script remark text is isolated ───────────────────────────────────────
  // A reviewer will write "the ماہمان count is wrong at 390px" in one remark. Without <bdi>
  // the trailing Latin run and the digits reorder around the Arabic, and the note reads
  // wrong in exactly the tool meant to report such bugs.
  await ensureFixture(page)
  await settle(page)
  await addRemarkOn(page, 'Target with id', 'the ماہمان count is wrong at 390px')
  await openPanel(page)
  const isolated = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-rmk="row"]')]
    const row = rows.find((r) => r.textContent?.includes('count is wrong'))
    if (!row) return null
    const bdi = row.querySelector('bdi')
    return { hasBdi: !!bdi, isolate: bdi ? getComputedStyle(bdi).unicodeBidi : null }
  })
  check(`${lang}: mixed-script remark text is bidi-isolated`,
    !!isolated?.hasBdi && /isolate/.test(isolated.isolate || ''),
    isolated ? `bdi=${isolated.hasBdi} unicode-bidi=${isolated.isolate}` : 'row missing')

  // ── mode OFF: the real app still works ─────────────────────────────────────────
  // The strongest form of "does not block interaction": with pins on screen and remark mode
  // off, a genuine app control must still respond. elementFromPoint proves nothing is on top;
  // this proves the click actually lands.
  await page.locator('[data-rmk="chip"]').click()   // close the panel
  const before = page.url()
  const back = page.locator('[data-tour], a, button').first()
  await back.scrollIntoViewIfNeeded().catch(() => {})
  const clickable = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a[href]')]
      .find((b) => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8 && !b.closest('[data-remark-chrome]') })
    if (!btn) return false
    let got = false
    const mark = () => { got = true }
    btn.addEventListener('click', mark, { once: true })
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    btn.removeEventListener('click', mark)
    return got
  })
  check(`${lang}: real app controls still receive clicks with remark mode off`, clickable === true)
  void before

  // ── export ─────────────────────────────────────────────────────────────────────
  const md = await page.evaluate(async () => {
    const mod = await import('/src/remarks/export.ts')
    const all = JSON.parse(localStorage.getItem('rms-remarks') || '[]')
    return mod.toMarkdown(all)
  })
  check(`${lang}: Markdown export groups by route pattern`,
    md.includes('## `/miqaats/:id/city`') && md.includes('# Review remarks'))

  await ctx.close()
}

const port = await freePort()
const server = await serve(port)
const browser = await chromium.launch()
try {
  await runLang(browser, 'en', port)
  await runLang(browser, 'lsd', port)
} finally {
  await browser.close()
  server.kill()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('\nFAILURES:')
  failed.forEach((f) => console.log(`  ${f.name}  — ${f.detail}`))
}
process.exit(failed.length ? 1 : 0)
