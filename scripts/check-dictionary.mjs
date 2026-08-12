/**
 * check-dictionary.mjs — the dictionary editor's guarantees, end to end.
 *
 * Everything here is about ONE property: a staged edit must be visible immediately, must be
 * impossible to ship, and must never touch either authoritative file. The assertions are less
 * about the UI than about what this machinery is incapable of doing.
 *
 * SCOPE, since the editor moved: the panel now writes REVISIONS to the shared store, not to
 * `wordlist-overrides.json`. What is covered below is the dev-server staging file, the Excel
 * patch it produces, and the build gate that refuses to ship while it is non-empty — all still
 * live, all still the last line of defence against a translation the .xlsx has never heard of.
 * The shared write path is covered by `api/_lib/api.test.ts` and, for the two-client behaviour
 * a local harness cannot honestly claim, by `docs/preview-verification.md`.
 *
 *   npm run check:dictionary
 *
 * Runs against `vite dev`, because the endpoint the editor talks to exists only there. The
 * build-gate case shells out to a real `vite build` — the plugin's whole job is to fail that
 * command, and asserting it any other way would be asserting a copy of the logic instead of
 * the logic.
 *
 * A staging file left behind by a failed run would fail every later build, so the file is
 * captured and restored in a `finally`.
 */
import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import { waitForApp } from './arrival.mjs'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startDev } from './lib/dev-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OVERRIDES = resolve(ROOT, 'wordlist-overrides.json')
const LSD_JSON = resolve(ROOT, 'src/i18n/lsd.json')
const XLSX = resolve(ROOT, 'RMS_Mumineen_LSD_wordlist_v4.xlsx')

let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }
const sha = (p) => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12) : 'absent')

/** Whatever was staged before this run — restored at the end, whatever happens. */
const savedOverrides = existsSync(OVERRIDES) ? readFileSync(OVERRIDES, 'utf8') : null
if (savedOverrides) unlinkSync(OVERRIDES)

const beforeLsd = sha(LSD_JSON)
const beforeXlsx = sha(XLSX)

const PORT = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
// reviewTools: true because the panels are gated on the flag. Without it the toolbar renders
// nothing and assertion 1 fails for a reason that has nothing to do with the dictionary — which
// is why startDev refuses to spawn without being told; see scripts/lib/dev-server.mjs.
const dev = await startDev(PORT, { cwd: ROOT, reviewTools: true })

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(`try{localStorage.setItem('rms-lang','lsd');localStorage.setItem('rms-remark-author','check-dictionary');const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}))}catch{}`)
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${PORT}/miqaats`, { waitUntil: 'domcontentloaded' })

  // ── 1. the editor is there, and it is inside a dock ──
  // WAIT for it rather than sampling once at a fixed delay. The panel now pulls in the shared
  // dictionary client, which is more modules for a cold dev server to transform on first paint;
  // a 1200ms sample caught the page before React had rendered the docks and reported the editor
  // missing. A timeout still fails — this waits for the outcome instead of guessing at it.
  const present = await page.waitForSelector('[data-devdock]', { timeout: 20_000 }).then(() => true, () => false)
  say(present, 'dictionary editor mounts on the dev server')

  // ── 2. mojibake is refused at entry, not stored ──
  // Exercised through the module rather than the keyboard: the point under test is the
  // decision, and driving it through the DOM would mostly be testing the input element.
  const moji = await page.evaluate(async () => {
    const m = await import('/src/dev/mojibake.mjs')
    const cases = ['Ø§Ù„Ø´Ù‡Ø±', 'zone � name', 'Ã‰tage']
    const clean = ['‏اختيار الشهر', 'zone', '‏form بند تهيو چھے.']
    return {
      refused: cases.map((c) => m.detectByteDamage(c).length > 0),
      accepted: clean.map((c) => m.detectByteDamage(c).length === 0),
    }
  })
  say(moji.refused.every(Boolean), `mojibake refused: UTF-8-as-latin1, U+FFFD, Ã-family (${moji.refused.filter(Boolean).length}/3)`)
  say(moji.accepted.every(Boolean), `legitimate LSD accepted — RLM, ornate brackets, Latin loanwords (${moji.accepted.filter(Boolean).length}/3)`)

  // ── 2b. Kanz keyboard input is CONVERTED, not refused — and the editor says so ──
  //
  // The two classes must not share a verdict. Class A has lost bytes and blocks; class B is
  // a faithful record in the wrong encoding and converts. Asserted on the RENDERED text and
  // the RENDERED notice, because the failure this guards against is a conversion that happens
  // silently or one that happens to the wrong character — ہ, ھ and ه are three codepoints
  // this font draws alike, so "it looks right" proves nothing.
  //
  // Retried once: the FIRST import of a module the dev server has not transformed yet can make
  // Vite re-optimise and reload the page, which destroys the execution context mid-evaluate.
  // That is a property of the harness, not of the thing under test, and failing on it would be
  // reporting the wrong subject — so warm the module, then measure.
  const evalKanz = () => page.evaluate(async () => {
    const k = await import('/src/i18n/kanzNorm.mjs')
    const m = await import('/src/dev/mojibake.mjs')
    const out = k.normaliseKanz('مظظمان نسس اذن اْثثو')
    return {
      text: out.value,
      codepoints: [...out.value].map((c) => c.codePointAt(0)),
      notice: k.describeKanzChanges(out.changes),
      blockedAsDamage: m.detectByteDamage('شظظر مظظمان').length > 0,
      classAStillBlocks: m.detectByteDamage('Ø§Ù„Ø´Ù‡Ø±').length > 0,
      damageNotConverted: k.normaliseKanz('Ø§Ù„Ø´Ù‡Ø±').value === 'Ø§Ù„Ø´Ù‡Ø±',
    }
  })
  const kanz = await evalKanz().catch(async () => {
    await page.waitForLoadState('domcontentloaded')
    // Vite's dep re-optimisation reloads the page a SECOND time, and when domcontentloaded
    // resolves that reload has not been requested yet, so there is nothing later to await.
    // Only ever reached on the retry path, after the first evaluate lost its context.
    // sleep: Vite's second, re-optimisation reload, which announces itself with no event
    await page.waitForTimeout(1500)
    return evalKanz()
  })
  say(kanz.text === 'مہمان نے اذن اْپو', `Kanz input converts to Unicode (got ${JSON.stringify(kanz.text)})`)
  say(kanz.codepoints.includes(0x06C1) && !kanz.codepoints.includes(0x0647),
    'and lands on ہ U+06C1, not the ه U+0647 this font draws almost identically')
  say(kanz.notice.includes('ظظ→ہ') && kanz.notice.includes('سس→ے'),
    `the conversion is reported for the author to see ("${kanz.notice}")`)
  say(!kanz.blockedAsDamage, 'Kanz input is NOT refused as byte damage — class B normalises')
  say(kanz.classAStillBlocks, 'class A byte damage is still blocked')
  say(kanz.damageNotConverted, 'and normalising damaged text does not silently half-repair it')

  // ── 3. staging an edit reaches the file AND the running app ──
  const KEY = 'Registration status'
  const VALUE = '‏تجربة'
  const applied = await page.evaluate(async ({ KEY, VALUE }) => {
    const o = await import('/src/dev/overrides.ts')
    await o.setOverride(KEY, VALUE)
    await new Promise((r) => setTimeout(r, 300))
    const i18n = await import('/src/i18n/index.tsx')
    return { resolved: i18n.resolve(KEY, 'lsd').text, staged: i18n.inspectKey(KEY).staged }
  }, { KEY, VALUE })
  // NOTE WHAT THIS ASSERTS, AND WHAT IT DOES NOT.
  //
  // `resolve()` is the dictionary module answering what it WOULD return. It is not the page.
  // This assertion passed on a build where every route redirected to /login and there was no
  // app on screen at all — see docs/assertion-discipline.md, example 7. It is kept because the
  // module's answer is worth knowing, and immediately followed by the outcome version below.
  say(applied.resolved === VALUE, `the dictionary module resolves a staged edit (got ${JSON.stringify(applied.resolved)})`)
  say(applied.staged === true, 'the entry reports itself as staged, not as a wordlist value')

  // ── 3b. THE RENDERED PAGE, live and after a reload ──
  //
  // The defect this exists for: an edit changed the running page and vanished on reload, which
  // is exactly the action somebody takes to confirm it landed. Two stores had the same hole for
  // two different reasons — `loadOverrides()` had no caller at all, and `refresh()` was called
  // only when the panel was open. An assertion of the form "the loader runs at boot" would have
  // passed on the second one throughout. So this asserts the DOM, on a route with app on it.
  const LIVE_ROUTE = '/miqaats/ashara-1448'
  // No RLM in the marker: it is arbitrary test text, and an invisible character in a
  // string literal is a thing future editors delete by accident. The wordlist's own values
  // carry one; nothing here needs to.
  const MARKER = 'زززز تجربة زززز'
  await page.goto(`http://localhost:${PORT}${LIVE_ROUTE}`, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  // Self-selecting: a hard-coded key that stopped rendering would make this pass by absence,
  // which is the failure mode under investigation.
  const target = await page.evaluate(async () => {
    const i18n = await import('/src/i18n/index.tsx')
    const text = document.body.innerText.replace(/\s+/g, ' ')
    for (const e of i18n.allEntries()) {
      const v = (e.lsd || '').trim()
      if (v.length < 6 || e.sentinel) continue
      if (text.includes(v)) return { english: e.english, lsd: v }
    }
    return null
  })
  say(!!target, target
    ? `found a translated string rendered on ${LIVE_ROUTE} to edit: ${JSON.stringify(target.english)}`
    : `no translated string is rendered on ${LIVE_ROUTE} — the live-edit assertions below cannot run`)

  if (target) {
    await page.evaluate(async ({ english, value }) => {
      const o = await import('/src/dev/overrides.ts')
      await o.setOverride(english, value)
    }, { english: target.english, value: MARKER })
    // WAIT FOR THE OUTCOME, not a delay. This assertion first shipped with a fixed 1200ms
    // sleep and failed under load while the edit had in fact applied — the third time a fixed
    // delay has produced a false finding in this repo, inside the very assertion added to stop
    // the previous one. `waitForFunction` resolving IS the outcome; the timeout is the failure.
    const liveShown = await page
      .waitForFunction((m) => document.body.innerText.replace(/\s+/g, ' ').includes(m), MARKER, { timeout: 15_000 })
      .then(() => true, () => false)
    const live = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    say(liveShown, `the RENDERED page shows the edit with no reload${liveShown ? '' : ` (page still reads ${JSON.stringify(live.slice(0, 120))})`}`)
    say(!live.includes(target.lsd), 'and the old value is gone from the page, not merely joined by the new one')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    const survived = await page
      .waitForFunction((m) => document.body.innerText.replace(/\s+/g, ' ').includes(m), MARKER, { timeout: 15_000 })
      .then(() => true, () => false)
    say(survived, 'the edit SURVIVES a reload — the stored overrides are re-applied at boot')

    await page.evaluate(async ({ english }) => {
      const o = await import('/src/dev/overrides.ts')
      await o.clearOverride(english)
    }, { english: target.english })
    await page.waitForTimeout(400)   // sleep: clearOverride POSTs to the dev middleware; the file lands out-of-band
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    const cleared = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    // The control. Without it, an assertion that the marker is present would also pass if the
    // marker had somehow been baked into the wordlist rather than applied as an override.
    say(!cleared.includes(MARKER) && cleared.includes(target.lsd),
      'clearing the edit restores the wordlist value on reload')
  }

  await page.goto(`http://localhost:${PORT}/miqaats`, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  // ── 3c. THE PAGE TAB LISTS WHAT IS ON THE PAGE ──
  //
  // The Page tab used to read `scanDom().hits`, which rejects any node containing Arabic — so in
  // LSD it listed only the strings that were still English, and the better the wordlist got the
  // emptier it became. Measured before the fix: /miqaats showed 3 rows for 142 visible strings.
  //
  // The reconciliation is deliberately NOT "inventory count equals scan count" — those two
  // already agreed, on the wrong quantity. It is "nothing rendered is missing from the list",
  // checked by an independent walk that knows nothing about the dictionary. A hit covers a text
  // node when its `rendered` IS that text or contains it: `isolateRuns` splits one translated
  // value across several nodes, and three fragments of one string are one row, not three.
  //
  // ── WHY COVERAGE ALONE IS NOT ENOUGH, AND WHY THIS CHECK WAS GREEN ON A DEAD TAB ────
  //
  // `c.includes(t)` cannot fail for a row that holds the whole page. In LSD the scan resolved
  // every unmarked node's owner to <html> — which carries `lang="gu-Arab"` because the PAGE is
  // in LSD — and adopted `documentElement.textContent` as one row's key: 87 of 128 nodes in a
  // single 172,923-character row, the dev server's injected <script> source inside it, and
  // nothing editable. Coverage was 0 unaccounted. It was 0 BECAUSE of the defect: the more
  // the merge over-collapses, the more certainly every string is "contained" somewhere.
  //
  // An assertion whose satisfaction grows with the fault is not a weak assertion, it is an
  // inverted one. So coverage is now bounded from the other side: a row may only be as long
  // as the longest thing the dictionary actually holds. Both numbers are measured from
  // `lsd.json` at run time rather than written down, so they follow the wordlist.
  const BOUNDS = await page.evaluate(async () => {
    const { allEntries } = await import('/src/i18n/index.tsx')
    let key = 0, value = 0
    for (const e of allEntries()) {
      key = Math.max(key, (e.english || '').length)
      value = Math.max(value, (e.lsd || '').length)
    }
    return { key, value }
  })
  say(BOUNDS.key > 0 && BOUNDS.value > 0,
    `the dictionary reports its own bounds (longest key ${BOUNDS.key}, longest value ${BOUNDS.value})`)
  const RECON_ROUTES = ['/miqaats', '/miqaats/ashara-1448', '/miqaats/ashara-1448/people']
  for (const route of RECON_ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    const r = await page.evaluate(async (bounds) => {
      const scan = await import('/src/i18n/domScan.ts')
      const inv = scan.inventoryDom()
      const gaps = scan.scanDom()
      const covered = inv.hits.map((h) => h.rendered)
      const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA'])
      const unaccounted = []
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim()
        if (!t) continue
        const el = n.parentElement
        if (!el || !el.isConnected) continue
        // The same NAMED exclusions the inventory uses, restated here rather than imported:
        // if this walk shared the scanner's filter it would agree with it by construction.
        if (el.closest('[data-lsd-scanner-ignore]')) continue
        if (el.closest('[data-lsd-not-language]')) continue
        let skipTag = false
        for (let a = el; a; a = a.parentElement) if (SKIP.has(a.tagName)) { skipTag = true; break }
        if (skipTag) continue
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue
        // Containment only counts from a row that is a plausible SIZE for a row. Without the
        // bound this loop credits a row holding the entire page with covering all of it.
        if (!covered.some((c) => c === t || (c.length <= bounds.value && c.includes(t)))) {
          unaccounted.push(t.slice(0, 70))
        }
      }
      const longest = inv.hits.reduce((a, h) => (h.english.length > a.english.length ? h : a),
        { english: '', rendered: '', count: 0, via: '' })
      return {
        inventory: inv.hits.length,
        gapScan: gaps.hits.length,
        visible: inv.visibleTextNodes,
        excluded: inv.excluded,
        unaccounted: unaccounted.length,
        examples: unaccounted.slice(0, 5),
        byVia: inv.hits.reduce((acc, h) => { acc[h.via] = (acc[h.via] ?? 0) + 1; return acc }, {}),
        longestKey: longest.english.length,
        longestKeySample: longest.english.slice(0, 60),
        longestKeyCount: longest.count,
      }
    }, BOUNDS)
    say(r.unaccounted === 0,
      `${route}: every rendered string is in the Page list (${r.inventory} rows for ${r.visible} visible nodes`
      + `, gap scan alone found ${r.gapScan})${r.unaccounted ? ` — ${r.unaccounted} unaccounted: ${JSON.stringify(r.examples)}` : ''}`)
    // The contrast that shows the fix did something. In LSD the gap scan sees single digits on
    // these routes; if the inventory ever collapses to that number again, it has regressed to
    // being a gap list under a different name.
    say(r.inventory > r.gapScan,
      `${route}: the inventory lists more than the gap scan (${r.inventory} vs ${r.gapScan}) — attribution ${JSON.stringify(r.byVia)}`)
    // ONE DICTIONARY KEY PER ROW. A key longer than the longest key in the wordlist is not a
    // key — it is several strings merged, and the editor has nothing to write it back to.
    say(r.longestKey <= BOUNDS.key,
      `${route}: no row is bigger than a dictionary key (longest ${r.longestKey} <= ${BOUNDS.key})`
      + (r.longestKey > BOUNDS.key
        ? ` — ${r.longestKeyCount} node(s) merged under ${JSON.stringify(r.longestKeySample)}…`
        : ''))
  }


  // ── 3d. EVERY ROW ON THE PAGE TAB CAN BE TYPED INTO, PREFILLED ──
  //
  // The tab listing a string is not the same as the tab letting you correct it, and for two
  // whole categories it did not. A class-C row has no wordlist row, so the box was prefilled
  // from `inspectKey().value` and opened EMPTY — on a string the reviewer is looking at. A
  // sentinel row had no control at all. Both were rows you could read and could not touch.
  //
  // Driven through the panel rather than through `prefill()`, and deliberately: a unit test of
  // the rule would have passed on the old build too, because the old rule was also a correct
  // implementation of itself. What was wrong was the OUTCOME — the box the reviewer sees. So
  // this clicks every row's control the way a reviewer does and reads what the box holds.
  //
  // The comparison is against a text-node walk of the page that knows nothing about the
  // dictionary, the inventory or the panel. Asking `inventoryDom` what it rendered and then
  // checking that the panel agrees would be two readings of one number.
  const TAB_ROUTES = ['/miqaats', '/miqaats/ashara-1448/people']
  for (const route of TAB_ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await page.click('[data-dict-open]')
    const opened = await page.waitForSelector('[data-dict-row]', { timeout: 20_000 }).then(() => true, () => false)
    say(opened, `${route}: the Page tab renders rows when opened`)
    if (!opened) continue

    // Retried once, and a persistent failure is REPORTED rather than thrown. The walk runs for
    // several seconds against a live app; a navigation underneath it destroys the execution
    // context, and an uncaught throw there took the twelve assertions after this one with it —
    // which reads in the log as those assertions not existing rather than as this one failing.
    const walk = async () => await page.evaluate(async () => {
      const nap = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const norm = (s) => (s || '').replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim()

      // What the PAGE is showing, walked independently. The panel is excluded by the same
      // attribute that keeps the scanner out of it, so the editor cannot satisfy this with
      // its own text.
      const onScreen = new Set()
      const sweep = () => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const el = n.parentElement
          if (!el || !el.isConnected || el.closest('[data-lsd-scanner-ignore]')) continue
          const s = norm(n.nodeValue)
          if (s) onScreen.add(s)
        }
      }
      sweep()

      // By KEY, never by index, and the box is closed again before moving on. Both matter for
      // the same reason: the tab re-scans the live DOM every 1.2s and re-sorts, so an index
      // taken before a click can address a different row after it. The first run of this walk
      // did exactly that and reported "no edit control" for three rows that have one — it had
      // landed back on the row it just opened, whose control is replaced by the box.
      const rowFor = (k) => [...document.querySelectorAll('[data-dict-row]')]
        .find((e) => e.getAttribute('data-dict-row') === k)
      const keys = [...document.querySelectorAll('[data-dict-row]')].map((e) => e.getAttribute('data-dict-row'))
      const out = []
      const gone = []
      for (const key of keys) {
        const row = rowFor(key)
        // A row that vanished mid-walk is a string that CHANGED — a countdown, a clock. That is
        // not a row without a control, and reporting it as one would be a finding about the walk.
        if (!row) { gone.push(key); continue }
        const cls = row.getAttribute('data-dict-cls')
        const btn = row.querySelector('[data-dict-edit]')
        if (!btn || btn.disabled) { out.push({ key, cls, control: false }); continue }
        btn.click()
        await nap()
        const same = rowFor(key)
        // Changed BETWEEN the click and the read — the same event as one that changed before it,
        // and it has to be filed the same way. Counting it as "the control did not open a box"
        // is a finding about a clock, and it is the finding this walk produced on its first run.
        if (!same) { gone.push(key); continue }
        const input = same.querySelector('[data-dict-input]')
        out.push({ key, cls, control: true, opened: !!input, draft: input ? input.value : null })
        if (input) { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nap() }
      }

      // Swept AGAIN, and unioned. Some of these strings tick — a countdown, a clock — so the
      // text the tab captured on its last scan can be a second out of date by the time the walk
      // reaches that row, and the row would be reported as prefilled with something the page
      // never showed. It did show it. Unioning the two sweeps admits the value it had when the
      // tab read it AND the value it has now, and still admits nothing that was never rendered,
      // which is the property under test.
      sweep()

      const i18n = await import('/src/i18n/index.tsx')
      return {
        rows: out.length,
        gone,
        byCls: out.reduce((a, r) => { a[r.cls] = (a[r.cls] ?? 0) + 1; return a }, {}),
        noControl: out.filter((r) => !r.control).map((r) => `${r.cls} ${r.key}`),
        didNotOpen: out.filter((r) => r.control && !r.opened).map((r) => `${r.cls} ${r.key}`),
        // A box that opened empty. Legitimate ONLY for a parameterised key: `Close in {time}`
        // renders as `Close in 00:42:11`, and prefilling that would write one instant's text
        // into the wordlist and lose the placeholder. Stated as a property of the KEY, rather
        // than by asking the panel which rows it decided to leave blank.
        emptyBox: out.filter((r) => r.opened && !r.draft).map((r) => `${r.cls} ${r.key}`),
        emptyBoxWithoutPlaceholder: out
          .filter((r) => r.opened && !r.draft && !/\{[^}]+\}/.test(r.key))
          .map((r) => `${r.cls} ${r.key}`),
        // THE ASSERTION THIS SECTION EXISTS FOR. Where the wordlist holds nothing, the box has
        // to open with text the page is actually displaying — matched EXACTLY against a node
        // the walk above found, never by containment. A containment test here would be the
        // inverted kind: the longer the prefill, the more certainly it "covers" something.
        fromNothing: out.filter((r) => r.opened && !i18n.inspectKey(r.key).value).length,
        notOnScreen: out
          .filter((r) => r.opened && !i18n.inspectKey(r.key).value && r.draft && !onScreen.has(norm(r.draft)))
          .map((r) => `${r.cls} ${JSON.stringify(String(r.draft).slice(0, 50))}`),
        screenNodes: onScreen.size,
      }
    })

    let t = null
    let walkErr = ''
    for (let attempt = 0; attempt < 2 && !t; attempt++) {
      if (attempt) {
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded' })
        await waitForApp(page)
        await page.click('[data-dict-open]')
        await page.waitForSelector('[data-dict-row]', { timeout: 20_000 }).catch(() => {})
      }
      try { t = await walk() } catch (err) { walkErr = err instanceof Error ? err.message : String(err) }
    }
    say(!!t, t ? `${route}: the row walk completed` : `${route}: the row walk could not run — ${walkErr}`)
    if (!t) continue

    say(t.rows > 0 && t.screenNodes > 0,
      `${route}: ${t.rows} rows against ${t.screenNodes} rendered text nodes — ${JSON.stringify(t.byCls)}`
      + (t.gone.length ? ` (${t.gone.length} changed mid-walk: ${JSON.stringify(t.gone.slice(0, 3))})` : ''))
    // The skip above is a hole, so it is bounded rather than trusted. A walk that lost most of
    // the tab would satisfy every assertion below by having nothing left to look at.
    say(t.gone.length * 4 < t.rows,
      `${route}: the walk covered the tab — ${t.rows} of ${t.rows + t.gone.length} rows visited`)
    say(t.noControl.length === 0,
      `${route}: every row has an enabled edit control`
      + (t.noControl.length ? ` — ${t.noControl.length} without one: ${JSON.stringify(t.noControl.slice(0, 5))}` : ''))
    say(t.didNotOpen.length === 0,
      `${route}: every control opens an edit box`
      + (t.didNotOpen.length ? ` — ${t.didNotOpen.length} did not: ${JSON.stringify(t.didNotOpen.slice(0, 5))}` : ''))
    say(t.emptyBoxWithoutPlaceholder.length === 0,
      `${route}: no box opens empty except on a parameterised key (${t.emptyBox.length} empty, all with placeholders)`
      + (t.emptyBoxWithoutPlaceholder.length
        ? ` — ${t.emptyBoxWithoutPlaceholder.length} unexplained: ${JSON.stringify(t.emptyBoxWithoutPlaceholder.slice(0, 5))}` : ''))
    // NON-VACUITY. Every assertion above is satisfied by a tab with no rows the wordlist cannot
    // answer for — which is precisely the state this change is about. If these routes ever stop
    // producing them, those assertions stop meaning anything and this one says so.
    say(t.fromNothing > 0,
      `${route}: ${t.fromNothing} row(s) have nothing in the wordlist — the case that used to open blank`)
    say(t.notOnScreen.length === 0,
      `${route}: every one of those opens with text the page is actually showing`
      + (t.notOnScreen.length ? ` — ${t.notOnScreen.length} not found on screen: ${JSON.stringify(t.notOnScreen.slice(0, 5))}` : ''))

    await page.click('[data-dict-open]')
  }


  // ── 3e. A SENTINEL ROW IS TYPEABLE, AND SAYS WHAT WILL HAPPEN TO THE EDIT ──
  //
  // The one row class that had no edit control at all. It is not a defect in the wordlist: the
  // owner has written an instruction into the cell (`remove`), the string falls back to English
  // on purpose, and `syncPlan` refuses to overwrite a sentinel with a translation. But an absent
  // button explains none of that. It reads as "this tool is broken here", and the reviewer's
  // only way to find out otherwise is to go and read the sync.
  //
  // So the control is there and the constraint is written on the row instead. This asserts both
  // halves, because either alone is worse than what it replaced: a button with no warning is a
  // trap, and a warning with no button is the old behaviour with more words.
  //
  // Reached through the Master tab because sentinels are rare — none of them rendered on the
  // two routes above, and an assertion that only runs when one happens to be on screen is an
  // assertion that mostly does not run.
  const sentinelKey = await page.evaluate(async () => {
    const i18n = await import('/src/i18n/index.tsx')
    const hit = i18n.allEntries().find((e) => e.sentinel)
    return hit ? hit.english : null
  })
  say(!!sentinelKey, sentinelKey
    ? `the wordlist has a sentinel row to test with: ${JSON.stringify(sentinelKey.slice(0, 48))}…`
    : 'the wordlist has NO sentinel rows — the assertions below cannot run')

  if (sentinelKey) {
    await page.click('[data-dict-open]')
    await page.waitForSelector('[data-dict-row]', { timeout: 20_000 })
    await page.click('[data-dict-tab="master"]')
    await page.fill('[data-dict-filter]', sentinelKey.slice(0, 40))
    const shown = await page
      .waitForSelector(`[data-dict-cls="sentinel"]`, { timeout: 10_000 })
      .then(() => true, () => false)
    say(shown, 'the sentinel row is listed')

    if (shown) {
      const sen = await page.evaluate(async () => {
        const nap = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        const row = document.querySelector('[data-dict-cls="sentinel"]')
        const note = row.querySelector('[data-dict-sentinel-note]')
        const btn = row.querySelector('[data-dict-edit]')
        if (!btn || btn.disabled) return { control: false, note: note ? note.textContent : null }
        btn.click()
        await nap()
        const again = [...document.querySelectorAll('[data-dict-row]')]
          .find((e) => e.getAttribute('data-dict-row') === row.getAttribute('data-dict-row'))
        const input = again && again.querySelector('[data-dict-input]')
        if (input) { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nap() }
        return { control: true, typeable: !!input, note: note ? note.textContent.replace(/\s+/g, ' ').trim() : null }
      })
      say(sen.control && sen.typeable, 'a sentinel row opens an edit box like any other row')
      // The wording is not asserted; what the reviewer must be told is. `syncPlan` declines the
      // write, so the row has to say the sync will not take it — silence here is the trap.
      say(!!sen.note && /sync will not/i.test(sen.note),
        `and it says the sync will not overwrite the sentinel (${JSON.stringify((sen.note || '').slice(0, 60))}…)`)
    }

    await page.click('[data-dict-tab="page"]')
    await page.fill('[data-dict-filter]', '')
    await page.click('[data-dict-open]')
  }

  await page.goto(`http://localhost:${PORT}/miqaats`, { waitUntil: 'domcontentloaded' })
  await waitForApp(page)

  await page.waitForTimeout(400)   // sleep: the override write lands on disk out-of-band from the browser call
  const onDisk = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {}
  say(onDisk[KEY]?.lsd === VALUE, 'the edit is written to wordlist-overrides.json')

  // ── 4. the Excel patch carries it, in the wordlist's own shape ──
  const patch = await page.evaluate(async () => {
    const res = await fetch('/__lsd/patch.xlsx')
    const buf = await res.arrayBuffer()
    return { ok: res.ok, bytes: buf.byteLength, type: res.headers.get('content-type') || '' }
  })
  say(patch.ok && patch.bytes > 1000, `patch endpoint returns a real workbook (${patch.bytes} bytes)`)
  say(patch.type.includes('spreadsheetml'), 'patch is served as .xlsx, not as a CSV in disguise')

  // ── 5. neither authoritative file was touched ──
  say(sha(LSD_JSON) === beforeLsd, `src/i18n/lsd.json unchanged (${beforeLsd})`)
  say(sha(XLSX) === beforeXlsx, `the .xlsx unchanged (${beforeXlsx})`)

  // ── 6. a staged edit fails the build ──
  const build = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, shell: true, encoding: 'utf8' })
  const said = `${build.stdout ?? ''}${build.stderr ?? ''}`
  say(build.status !== 0, `vite build refuses to run with an edit staged (exit ${build.status})`)
  say(said.includes('wordlist-overrides.json'), 'and the failure names the staging file and the way out')

  // ── 7. clearing removes the file, so a done queue cannot look pending ──
  await page.evaluate(async () => {
    const o = await import('/src/dev/overrides.ts')
    await o.clearAllOverrides()
  })
  await page.waitForTimeout(400)   // sleep: clearAllOverrides deletes the file out-of-band; the check below reads the disk
  say(!existsSync(OVERRIDES), 'clearing the queue deletes the file rather than leaving {}')

  await ctx.close()
} finally {
  await browser.close()
  dev.kill()
  if (savedOverrides) writeFileSync(OVERRIDES, savedOverrides, 'utf8')
  else if (existsSync(OVERRIDES)) unlinkSync(OVERRIDES)
}

console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
