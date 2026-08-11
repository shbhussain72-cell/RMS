/**
 * RETIRED 11 Aug 2026. This suite is not run, and it is not deleted.
 *
 * It drives the Remarks tool, which `src/main.tsx` no longer mounts — see the block comment
 * there for why page-level notes replaced element-anchored ones. Left where it was, every run
 * would fail on a missing [data-rmk="chip"] and read as an app regression; made to pass
 * trivially, it would be a green tick for a tool nobody can reach, which is the exact failure
 * `docs/assertion-discipline.md` is about.
 *
 * SO IT IS OUT OF THE RUNNER, NOT OUT OF THE REPO. `scripts/retired/` is below the directory
 * walks in `suite-completion.mjs`, `source-hygiene.test.mjs` and `dist-precondition.test.mjs`,
 * and `check:remarks` is gone from package.json. The 140 assertions below are the thing that
 * would make remounting remarks safe, and they took four separate bugs to get running at all
 * (see the VITE_REVIEW_TOOLS block below, and commit 684febd). Deleting them would mean paying
 * that again.
 *
 * To bring it back: mount the remarks tree in main.tsx, move this file up one directory, and
 * restore the npm script.
 */
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
    // The tool under test is gated on VITE_REVIEW_TOOLS, and this spawned its dev server
    // WITHOUT it — inheriting whatever the developer happened to have exported. With the flag
    // unset the whole panel returns null, and the suite's first interaction fails as
    // `Timeout 30000ms exceeded waiting for locator('[data-rmk="chip"]')`, which reads as a
    // flaky selector rather than "the feature was never mounted". `class-a-census.mjs` sets it
    // explicitly for the same reason; this did not.
    env: { ...process.env, VITE_REVIEW_TOOLS: 'true' },
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

/**
 * The identity is seeded, and that is not a convenience.
 *
 * Without an author the panel opens with `IdentityPrompt` at the top, and that prompt
 * AUTOFOCUSES its name field. The Ctrl/Cmd+Shift+M handler exits when the event target is an
 * INPUT — correctly, so the shortcut cannot fire while someone is typing — so remark mode never
 * turned on, the click on a fixture target went to the page instead of the composer, and the
 * suite died on `waiting for locator('[data-rmk="composer"]')`.
 *
 * That failure arrived with the identity prompt and reads as a broken selector rather than as
 * an unseeded precondition. Every remark also has to carry an author, so seeding it is what the
 * tool actually requires rather than a way around the gate.
 */
const seed = (lang) => `
  try {
    // The suite runs against vite dev, which answers /api/* with index.html — so every shared
    // write throws NotJson and the remark is lost before it reaches state. This selects the
    // localStorage adapter, which is what the capture assertions below read.
    localStorage.setItem('rms-remarks-adapter', 'local');
    localStorage.setItem('rms-remark-author', 'harness');
    localStorage.setItem('rms-lang', ${JSON.stringify(lang)});
    const prev = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...prev, state: { ...(prev.state || {}), loggedIn: true }, version: prev.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

/** Wait for the resolution pass (settle 500ms + 1s interval) to have run at least once. */
const settle = (page) => page.waitForTimeout(1400)   // sleep: the resolution pass is interval-driven (500ms settle + 1s tick) with no completion event

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

/**
 * Click an export button and return WHAT WAS DOWNLOADED.
 *
 * The blob handed to URL.createObjectURL is captured rather than the saved file, because
 * export.ts revokes the object URL on the line after a.click() and a download racing that
 * revoke is the flakiest thing in this suite. The blob IS the file's bytes — the browser has
 * nothing else to write — so this reads the artefact, not a re-implementation of it.
 *
 * The download EVENT is awaited alongside, because "produced the right bytes" and "actually
 * downloaded" are two claims and the blob alone only makes the first.
 */
async function captureExport(page, which) {
  await page.evaluate(() => {
    if (window.__rmkGrabPatched) return
    window.__rmkGrabPatched = true
    const real = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => { window.__rmkGrab = blob.text(); return real(blob) }
  })
  const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
  await page.locator('[data-rmk="' + which + '"]').click()
  const downloaded = await dl
  const text = await page.evaluate(() => window.__rmkGrab)
  await page.evaluate(() => { window.__rmkGrab = null })
  return { text, filename: downloaded ? downloaded.suggestedFilename() : null }
}

/**
 * How many remark records a Markdown export contains.
 *
 * One function, so the FORMAT can change without the equality assertion changing with it: the
 * claim under test is "as many records as rows", never "the records look like this".
 */
const mdRecordCount = (md) => (md.match(/^\d+\. /gm) || []).length

/**
 * Wait until the sticky note is SHOWING `n` items.
 *
 * The note re-renders off a store subscription with no completion event, so every assertion
 * about it used to be preceded by a guessed delay. This waits for the rendered count marker,
 * which is the same number the assertion then checks — so a slow machine makes the suite slower
 * rather than red, and a genuinely wrong count still fails.
 */
const noteShows = (page, n) => page.waitForFunction(
  (want) => document.querySelector('[data-rmk-note="count"]')?.textContent === '(' + want + ')',
  n, { timeout: 8000 },
).catch(() => {})   // swallowed on purpose: the assertion that follows is the one that reports

/**
 * Put remark mode into a known state, by INSPECTION rather than by counting keystrokes.
 *
 * Every remark this suite creates used to begin with a bare `keyboard.press('Control+Shift+M')`
 * and no check that anything happened. When the shortcut did not land — the identity prompt
 * autofocuses an input, and the handler correctly refuses to fire from inside one — the next
 * line clicked a fixture target with the mode still off, and the failure surfaced 30 seconds
 * later as `waiting for locator('[data-rmk="composer"]')`. The suite reported a missing
 * composer; the actual fact was that it had never entered the mode that creates one.
 *
 * The button carries the state, so this reads it and clicks only if it disagrees. Idempotent,
 * and it cannot drift out of step the way a toggle-counting helper does.
 */
async function setRemarkMode(page, on) {
  await openPanel(page)
  const btn = page.locator('[data-rmk="mode-toggle"]')
  if (((await btn.getAttribute('data-rmk-on')) === '1') !== on) await btn.click()
  await page.locator(`[data-rmk="mode-toggle"][data-rmk-on="${on ? '1' : '0'}"]`).waitFor()
}

/** Create a remark on a fixture target by its visible text. */
async function addRemarkOn(page, targetText, body) {
  await setRemarkMode(page, true)
  await page.locator('[data-rmk="targets"]').getByText(targetText, { exact: true }).click()
  await page.locator('[data-rmk="composer"]').waitFor({ state: 'visible' })
  await page.locator('[data-rmk="composer-input"]').fill(body)
  await page.locator('[data-rmk="composer-save"]').click()
  await setRemarkMode(page, false)
  await settle(page)
}

async function runLang(browser, lang, port) {
  const BASE = `http://localhost:${port}`
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

  // Before anything else: is the tool even here? Every assertion below is about the remarks
  // chrome, so with the flag off they do not fail — they time out one locator at a time, and a
  // timeout reads as flakiness. Said once, plainly, at the top.
  const mounted = await page.locator('[data-rmk="chip"]').count()
  check(`${lang}: the review tooling is mounted (VITE_REVIEW_TOOLS)`, mounted > 0,
    mounted ? '' : 'no [data-rmk="chip"] — the dev server was started without the flag')
  if (!mounted) { await ctx.close(); return }

  // The other precondition, asserted rather than assumed. An unseeded identity puts an
  // autofocused input at the top of the panel, which swallows the keyboard shortcut that is the
  // only way into remark mode — and every failure downstream then looks like a bad selector.
  await openPanel(page)
  const prompting = await page.locator('[data-rmk="identity-prompt"]').count()
  check(`${lang}: identity is seeded, so the panel is not asking for a name`, prompting === 0,
    prompting ? 'IdentityPrompt is open and its input has focus' : '')

  /**
   * The keyboard shortcut, asserted ONCE and on its own.
   *
   * It is described in the source as "the only way in", and it was the implicit mechanism
   * behind every remark this suite creates — so when it silently stopped working, six
   * assertions failed as timeouts on unrelated selectors and none of them named it. Everything
   * below drives the mode through its button instead; this is the one place the shortcut itself
   * is the claim.
   */
  const modeBtn = page.locator('[data-rmk="mode-toggle"]')
  const wasOn = (await modeBtn.getAttribute('data-rmk-on')) === '1'
  await page.locator('[data-rmk="panel"]').click({ position: { x: 5, y: 5 } })  // focus off any input
  await page.keyboard.press('Control+Shift+M')
  await settle(page)
  const nowOn = (await modeBtn.getAttribute('data-rmk-on')) === '1'
  check(`${lang}: Ctrl/Cmd+Shift+M toggles remark mode`, nowOn !== wasOn, `${wasOn} -> ${nowOn}`)
  await setRemarkMode(page, false)

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
  check(`${lang}: document dir is ${lang === 'lsd' ? 'rtl' : 'ltr'}`, dir === (lang === 'lsd' ? 'rtl' : 'ltr'), `got ${dir}`)

  // ── mode OFF must not intercept ────────────────────────────────────────────────
  // Assert on the real mechanism rather than a proxy: at a point over ordinary app content,
  // the topmost element must not belong to the remarks layer.
  const intercepts = await page.evaluate(() => {
    // probe-dom: point is chosen, not derived from a rect — the centre of the viewport.
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

  // ── EXPORT RESPECTS THE FILTERS ────────────────────────────────────────────────
  //
  // The bug: the panel rendered the filtered list and the export handed the whole store to the
  // exporter. On "This route · Open · EN" the list showed 2, the button read (8), and the
  // downloaded file held 28 remarks across 3 routes.
  //
  // A test on the DEFAULT filter would have passed throughout — with nothing filtered out,
  // `remarks` and `filtered` are the same array. So the filter has to actually EXCLUDE
  // something, and that exclusion is asserted BEFORE the equality is, or this reduces to the
  // vacuous check it replaces.
  await openPanel(page)

  // One resolved (excluded by status) and one on another route (excluded by scope).
  await page.locator('[data-rmk="row"]').first().getByText('Resolve', { exact: true }).click()
  await settle(page)

  await page.goto(BASE + OTHER_ROUTE, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await ensureFixture(page)
  await settle(page)
  await addRemarkOn(page, 'Target with id', 'off-route remark (' + lang + ')')
  await page.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await ensureFixture(page)
  await settle(page)
  await openPanel(page)

  // Non-default on every axis the panel has: scope, status and language.
  await page.locator('[data-rmk="filter-scope-route"]').click()
  await page.locator('[data-rmk="filter-status-open"]').click()
  await page.locator('[data-rmk="filter-lang-' + lang + '"]').click()
  await settle(page)

  const total = await page.evaluate(() => JSON.parse(localStorage.getItem('rms-remarks') || '[]').length)
  const rows = await page.locator('[data-rmk="row"]').count()
  const buttonCount = Number(((await page.locator('[data-rmk="export-count"]').textContent()) || '').replace(/[^0-9]/g, ''))

  check(lang + ': the filter actually excludes something (else the rest is vacuous)',
    rows > 0 && rows < total, rows + ' rendered of ' + total + ' stored')
  check(lang + ": the export button's count is the rendered row count",
    buttonCount === rows, 'button ' + buttonCount + ', rows ' + rows)

  const json = await captureExport(page, 'export-json')
  const records = JSON.parse(json.text)
  check(lang + ': JSON export holds exactly the rendered rows',
    Array.isArray(records) && records.length === rows, 'exported ' + records.length + ', rows ' + rows)
  check(lang + ': JSON export really downloads', json.filename === 'remarks.json', 'got ' + json.filename)

  // Every exported record must be one the filter admits — a count can match by coincidence.
  const wrongRoute = records.filter((r) => r.route !== ROUTE)
  const wrongStatus = records.filter((r) => r.status !== 'open')
  const wrongLang = records.filter((r) => r.lang !== lang)
  check(lang + ': every exported record satisfies the filter',
    !wrongRoute.length && !wrongStatus.length && !wrongLang.length,
    'route ' + wrongRoute.length + ', status ' + wrongStatus.length + ', lang ' + wrongLang.length)

  // JSON is the RECORD. Markdown gets simplified; this must not cost JSON a field.
  const FIELDS = ['id', 'route', 'routePattern', 'identifiers', 'capturedStrategy', 'remark',
    'author', 'status', 'lang', 'dir', 'viewportWidth', 'createdAt', 'updatedAt']
  const missing = FIELDS.filter((f) => records.some((r) => r[f] === undefined))
  check(lang + ': JSON export keeps every field', missing.length === 0, 'missing ' + missing.join(', '))

  const md = await captureExport(page, 'export-md')
  check(lang + ': Markdown export holds exactly the rendered rows',
    mdRecordCount(md.text) === rows, mdRecordCount(md.text) + ' records, ' + rows + ' rows')
  check(lang + ': Markdown export really downloads', md.filename === 'remarks.md', 'got ' + md.filename)

  /**
   * THE MARKDOWN IS A LIST YOU CAN PASTE.
   *
   * Asserted on the real export rather than in the unit test alone, because the unit test calls
   * `toMarkdown` directly and cannot see whether the PANEL hands it the filter. It did not: the
   * header would have read `# Review remarks` with no context on a heavily filtered export, and
   * every unit test would still have passed.
   */
  const mdLines = md.text.split('\n')
  check(lang + ': the Markdown header states the filter the panel is showing',
    mdLines[0].includes(ROUTE) && mdLines[0].includes(lang === 'lsd' ? 'LSD' : 'EN') && mdLines[0].includes('open'),
    JSON.stringify(mdLines[0]))
  check(lang + ': the header states it ONCE, not per remark',
    md.text.split(ROUTE).length - 1 === 1, (md.text.split(ROUTE).length - 1) + ' occurrences')

  // Each of these was in the old output. The remark bodies are still there — checked next — so
  // this cannot pass by exporting nothing.
  // Row labels from the old six-row table, plus its heading and blockquote. Every one of
  // these was in the previous output and none of them can occur in a remark somebody wrote.
  const noise = ['|---|', '### ', '| Anchor', '| Context', '| Author', '| Created', '> ']
    .filter((n) => md.text.includes(n))
  check(lang + ': no tables, headings per remark, selectors or timestamps', noise.length === 0,
    'still carries ' + noise.join(', '))

  const texts = records.map((r) => r.remark)
  const dropped = texts.filter((tx) => !md.text.includes(tx))
  check(lang + ': every exported remark text is in the Markdown', dropped.length === 0,
    dropped.length + ' of ' + texts.length + ' missing')
  const numbered = (md.text.match(/^\d+\. /gm) || []).length
  check(lang + ': every line of the list is numbered text', numbered === rows,
    numbered + ' numbered lines, ' + rows + ' rows')


  // ── HIDE CONTROLS — ONE PER WIDGET ─────────────────────────────────────────────
  //
  // The claim is INDEPENDENCE, so every assertion here reads all three docks and not just the
  // one being acted on. A single shared flag would pass any test that only looked at its own
  // widget, and would be discovered by a reviewer who hid the coverage badge and lost the
  // remarks pill they were about to write into.
  await openPanel(page)
  const eyes = ['coverage', 'dictionary', 'remarks']
  const hiddenState = async () => {
    const out = {}
    for (const w of eyes) {
      out[w] = await page.locator(`[data-devdock-eye="${w}"]`).evaluate(
        (el) => el.closest('[data-devdock]')?.querySelector('[data-devdock-body]')?.getAttribute('data-devdock-hidden') === '1',
      )
    }
    return out
  }

  const eyePresent = []
  for (const w of eyes) eyePresent.push(await page.locator(`[data-devdock-eye="${w}"]`).count())
  check(lang + ': all three dev widgets carry their own hide control',
    eyePresent.every((n) => n === 1), 'counts ' + eyePresent.join(','))

  const hiddenBefore = await hiddenState()
  check(lang + ': nothing is hidden to begin with (else the next check is vacuous)',
    !hiddenBefore.coverage && !hiddenBefore.dictionary && !hiddenBefore.remarks, JSON.stringify(hiddenBefore))

  await page.locator('[data-devdock-eye="remarks"]').click()
  await page.locator('[data-devdock-eye="remarks"][data-devdock-eye-on="1"]').waitFor()
  const afterOne = await hiddenState()
  check(lang + ': hiding one widget hides that widget',
    afterOne.remarks === true, JSON.stringify(afterOne))
  check(lang + ': hiding one widget leaves the other two alone',
    afterOne.coverage === false && afterOne.dictionary === false, JSON.stringify(afterOne))

  // NOT UNMOUNTED. The chip is still in the tree with its live count on it — the panel's data,
  // the resolution pass and the dictionary's queued edits all live inside these subtrees, and
  // rendering null to hide would throw them away and silently re-run on unhide.
  const chipStillThere = await page.locator('[data-rmk="chip"]').count()
  const chipVisible = await page.locator('[data-rmk="chip"]').isVisible()
  check(lang + ': a hidden widget is still mounted, only not shown',
    chipStillThere === 1 && chipVisible === false, 'in DOM ' + chipStillThere + ', visible ' + chipVisible)

  const stubVisible = await page.locator('[data-devdock-eye="remarks"]').isVisible()
  check(lang + ': a hidden widget leaves a visible control to bring it back',
    stubVisible === true, 'eye visible ' + stubVisible)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  const hideSurvived = await hiddenState()
  check(lang + ': the hidden state survives a reload',
    hideSurvived.remarks === true && hideSurvived.coverage === false, JSON.stringify(hideSurvived))

  await page.locator('[data-devdock-eye="remarks"]').click()
  await page.locator('[data-devdock-eye="remarks"][data-devdock-eye-on="0"]').waitFor()
  const hideRestored = await hiddenState()
  check(lang + ': clicking the stub brings the widget back',
    hideRestored.remarks === false, JSON.stringify(hideRestored))
  const hiddenKey = await page.evaluate(() => localStorage.getItem('devtools.hidden.v1'))
  check(lang + ': unhiding clears the stored entry rather than storing false',
    !JSON.parse(hiddenKey || '{}').remarks, String(hiddenKey))

  // ── STICKY NOTE ────────────────────────────────────────────────────────────────
  await openPanel(page)
  check(lang + ': no sticky note until one is asked for',
    (await page.locator('[data-rmk-note="note"]').count()) === 0)

  const openHere = await page.evaluate((r) => JSON.parse(localStorage.getItem('rms-remarks') || '[]')
    .filter((x) => x.route === r && x.status === 'open').length, ROUTE)
  await page.locator('[data-rmk="note-toggle"]').click()
  await page.locator('[data-rmk-note="note"]').waitFor({ state: 'visible' })
  const noteCount = async () => page.locator('[data-rmk-note-item]').count()
  check(lang + ': the note lists the open remarks on this route',
    openHere > 0 && (await noteCount()) === openHere, (await noteCount()) + ' items, ' + openHere + ' open here')

  // TEXT AND NOTHING ELSE. The fixture's remarks carry a route, a language, a width and an
  // author, so each of these would appear if the note were rendering the panel's row.
  const noteText = await page.locator('[data-rmk-note="note"]').innerText()
  // The panel row prints "${route} · ${lang}/${dir} · ${width}px · ${author}" under every
  // remark, and two action buttons beside it. If the note were rendering that row rather than
  // the text, each of these would be here — and none of them is anything a reviewer types.
  const noteCarries = [ROUTE, lang + (lang === 'lsd' ? '/rtl' : '/ltr'), '· harness', 'Resolve', 'Delete']
    .filter((n) => noteText.includes(n))
  check(lang + ': the note carries remark text and no metadata', noteCarries.length === 0,
    'carries ' + noteCarries.join(', '))
  const someRemark = await page.evaluate((r) => (JSON.parse(localStorage.getItem('rms-remarks') || '[]')
    .find((x) => x.route === r && x.status === 'open') || {}).remark, ROUTE)
  check(lang + ': the note really contains the remark text', noteText.includes(someRemark), someRemark)

  // Reading-start corner, by MEASUREMENT — the note uses logical insets, so this is the one
  // claim a class name cannot make on its own.
  const noteBox = await page.locator('[data-rmk-note="note"]').boundingBox()
  const startSide = lang === 'lsd'
    ? noteBox.x + noteBox.width > 1440 / 2
    : noteBox.x < 1440 / 2
  check(lang + ': the note is pinned to the reading-start corner', startSide,
    'x ' + Math.round(noteBox.x) + ' w ' + Math.round(noteBox.width))

  // It must not cover the identity block: a screenshot of a bar with no name on it cannot be
  // attributed to a session, which is the one thing that block is for.
  const chipBox = await page.locator('.ix-chip').first().boundingBox()
  const noteOverlapsChip = chipBox && !(noteBox.x + noteBox.width <= chipBox.x || chipBox.x + chipBox.width <= noteBox.x
    || noteBox.y + noteBox.height <= chipBox.y || chipBox.y + chipBox.height <= noteBox.y)
  check(lang + ': the note does not cover the AppBar identity block', chipBox && !noteOverlapsChip,
    chipBox ? 'note y ' + Math.round(noteBox.y) + ', chip y ' + Math.round(chipBox.y) : 'no .ix-chip found')

  // Resolved remarks are excluded, and the count is what proves it.
  const firstId = await page.evaluate((r) => (JSON.parse(localStorage.getItem('rms-remarks') || '[]')
    .find((x) => x.route === r && x.status === 'open') || {}).id, ROUTE)
  await page.locator(`[data-rmk="row"][data-rmk-id="${firstId}"] >> text=Resolve`).click()
  await noteShows(page, openHere - 1)
  check(lang + ': resolving a remark takes it off the note',
    (await noteCount()) === openHere - 1, (await noteCount()) + ' items, expected ' + (openHere - 1))

  // The toggles filter by the language the remark was MADE in. Every remark in this run was
  // made in `lang`, so turning that toggle off must empty the note and the other one must not
  // refill it — and the two empty states say different things.
  const otherLang = lang === 'lsd' ? 'en' : 'lsd'
  await page.locator(`[data-rmk-note-lang="${lang}"]`).click()
  await page.locator('[data-rmk-note="empty"]').waitFor()
  check(lang + ': turning off the capture language empties the note',
    (await noteCount()) === 0 && (await page.locator('[data-rmk-note="empty"]').count()) === 1)
  await page.locator(`[data-rmk-note-lang="${otherLang}"]`).click()
  await page.locator('[data-rmk-note="no-lang"]').waitFor()
  check(lang + ': with both languages off the note says so rather than showing an empty list',
    (await page.locator('[data-rmk-note="no-lang"]').count()) === 1)
  await page.locator(`[data-rmk-note-lang="${lang}"]`).click()
  await page.locator(`[data-rmk-note-lang="${otherLang}"]`).click()
  await noteShows(page, openHere - 1)
  check(lang + ': turning the languages back on restores the list',
    (await noteCount()) === openHere - 1, (await noteCount()) + ' items')

  // Refresh re-reads the store. Written straight into it, the way another reviewer's remark
  // arrives — the note derives its list, so nothing else has to be told.
  const noteItems = await noteCount()
  await page.evaluate(([r, l]) => {
    const all = JSON.parse(localStorage.getItem('rms-remarks') || '[]')
    all.push({ ...all[0], id: 'injected-' + l, route: r, status: 'open', lang: l,
      remark: 'arrived from somewhere else', createdAt: new Date().toISOString() })
    localStorage.setItem('rms-remarks', JSON.stringify(all))
  }, [ROUTE, lang])
  await page.locator('[data-rmk-note="refresh"]').click()
  await noteShows(page, noteItems + 1)
  check(lang + ': refresh picks up a remark that arrived after the note was made',
    (await noteCount()) === noteItems + 1 && (await page.locator('[data-rmk-note="note"]').innerText()).includes('arrived from somewhere else'),
    (await noteCount()) + ' items, was ' + noteItems)

  // Per route. Navigating away hides it; navigating back shows the same note.
  await page.goto(BASE + OTHER_ROUTE, { waitUntil: 'domcontentloaded' })
  await settle(page)
  check(lang + ': the note is not carried onto another route',
    (await page.locator('[data-rmk-note="note"]').count()) === 0)
  await page.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' })
  await settle(page)
  check(lang + ': the note comes back on the route it belongs to, with its list',
    (await page.locator('[data-rmk-note="note"]').count()) === 1 && (await noteCount()) === noteItems + 1,
    (await noteCount()) + ' items')

  // Hidden is not deleted: the eye leaves a dot, and the dot brings it back.
  await page.locator('[data-rmk-note="hide"]').click()
  await page.locator('[data-rmk-note="stub"]').waitFor({ state: 'visible' })
  check(lang + ': the eye hides the note and leaves a visible dot',
    (await page.locator('[data-rmk-note="note"]').count()) === 0
    && (await page.locator('[data-rmk-note="stub"]').isVisible()) === true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  check(lang + ': hidden survives a reload as hidden, not as gone',
    (await page.locator('[data-rmk-note="stub"]').count()) === 1)
  await page.locator('[data-rmk-note="stub"]').click()
  await page.locator('[data-rmk-note="note"]').waitFor({ state: 'visible' })
  check(lang + ': the dot brings the note back with its list intact',
    (await page.locator('[data-rmk-note="note"]').count()) === 1 && (await noteCount()) === noteItems + 1,
    (await noteCount()) + ' items')

  // 390px: the note must stay inside the viewport and off the AppBar, which is the width every
  // finding in this app gets re-checked at.
  await page.setViewportSize({ width: NARROW_WIDTHS[0], height: 844 })
  await page.waitForTimeout(400)   // sleep: viewport resize reflow plus the dock's ResizeObserver pass, neither of which fires an event this side can await
  const narrowBox = await page.locator('[data-rmk-note="note"]').boundingBox()
  check(lang + ': the note fits inside a ' + NARROW_WIDTHS[0] + 'px viewport',
    narrowBox.x >= 0 && narrowBox.x + narrowBox.width <= NARROW_WIDTHS[0],
    'x ' + Math.round(narrowBox.x) + ' w ' + Math.round(narrowBox.width))
  const barBox = await page.locator('[data-name="AppBar"]').first().boundingBox()
  check(lang + ': at ' + NARROW_WIDTHS[0] + 'px the note still clears the AppBar',
    barBox && narrowBox.y >= barBox.y + barBox.height,
    barBox ? 'note y ' + Math.round(narrowBox.y) + ', bar ends ' + Math.round(barBox.y + barBox.height) : 'no AppBar')
  await page.setViewportSize({ width: 1440, height: 900 })

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
