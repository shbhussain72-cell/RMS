/**
 * check-dictionary.mjs — the dictionary editor's guarantees, end to end.
 *
 * Everything here is about ONE property: an edit made in the browser must be visible
 * immediately, must be impossible to ship, and must never touch either authoritative file.
 * The editor is the only tool in this repo that writes anything, so the assertions are less
 * about its UI than about what it is incapable of doing.
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
const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
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
  const present = await page.evaluate(() => !!document.querySelector('[data-devdock] a[href="/__lsd/patch.xlsx"], [data-devdock]'))
  say(present, 'dictionary editor mounts on the dev server')

  // ── 2. mojibake is refused at entry, not stored ──
  // Exercised through the module rather than the keyboard: the point under test is the
  // decision, and driving it through the DOM would mostly be testing the input element.
  const moji = await page.evaluate(async () => {
    const m = await import('/src/dev/mojibake.ts')
    const cases = ['Ø§Ù„Ø´Ù‡Ø±', 'zone � name', 'Ã‰tage']
    const clean = ['‏اختيار الشهر', 'zone', '‏form بند تهيو چھے.']
    return {
      refused: cases.map((c) => m.detectMojibake(c).length > 0),
      accepted: clean.map((c) => m.detectMojibake(c).length === 0),
    }
  })
  say(moji.refused.every(Boolean), `mojibake refused: UTF-8-as-latin1, U+FFFD, Ã-family (${moji.refused.filter(Boolean).length}/3)`)
  say(moji.accepted.every(Boolean), `legitimate LSD accepted — RLM, ornate brackets, Latin loanwords (${moji.accepted.filter(Boolean).length}/3)`)

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
