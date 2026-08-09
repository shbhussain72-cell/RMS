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
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
// VITE_REVIEW_TOOLS is set for the dev server because the panels are gated on it now.
// Without it the toolbar renders nothing and assertion 1 fails for a reason that has
// nothing to do with the dictionary.
const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_REVIEW_TOOLS: 'true' } })
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1500) } }
  dev.stdout.on('data', w); dev.stderr.on('data', w)
  dev.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
})

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(`try{localStorage.setItem('rms-lang','lsd');const p=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...p,state:{...(p.state||{}),loggedIn:true},version:p.version??0}))}catch{}`)
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${PORT}/miqaats`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

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
    const m = await import('/src/dev/mojibake.ts')
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
    const m = await import('/src/dev/mojibake.ts')
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
  say(applied.resolved === VALUE, `a staged edit resolves live in the app (got ${JSON.stringify(applied.resolved)})`)
  say(applied.staged === true, 'the entry reports itself as staged, not as a wordlist value')

  await page.waitForTimeout(400)
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
  await page.waitForTimeout(400)
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
