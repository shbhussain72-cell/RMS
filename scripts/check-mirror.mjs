/**
 * check-mirror.mjs — the three assertions P8 could not make.
 *
 *   npm run check:mirror
 *
 * Each of these replaced a probe that had stopped meaning anything. They are grouped because
 * they share a failure mode: a test that passes BY CONSTRUCTION is worse than no test, because
 * it reads as evidence. All three were in that state at the end of P8.
 *
 *   1. WEEKDAY ORDER   The calendar's Su…Sa headers must run start→end in reading order, so
 *                      the column under `Mo` is the same column in both languages. The old
 *                      probe matched LEAF text nodes; wiring the labels through `tx()` appends
 *                      a gap-marker <sup> for an untranslated key, the span stopped being a
 *                      leaf, and the probe silently found nothing to check. This one matches
 *                      the CONTAINER and reads `textContent`, so markup inside a header cannot
 *                      hide it again.
 *
 *   2. BREADCRUMB FLIP The chevrons mirror by rendering a different <path>, not by
 *                      `-scale-x-100`: a transform gives each 16px box its own stacking
 *                      context, which is the documented `/success` mechanism for changing
 *                      paint and hit-test order while leaving every box pixel-identical. The
 *                      old probe asserted `transform !== 'none'`, so after that (correct)
 *                      change it reported 0 mirrored elements forever. This one asks which
 *                      path is actually being painted.
 *
 *   3. BIDI CENSUS     `check-bidi` reports N unisolated runs, and the claim attached to them
 *                      WAS "they are all an untranslated key beside a converted numeral, so
 *                      they clear when rows land". Checked for the first time on 2026-08-10 —
 *                      `check-bidi` had never terminated, so this section had never run — and
 *                      the claim is false. Of 26 findings, 24 are that shape. Two are not:
 *
 *                        "Ready for Registration"     -> `‏registration واسطسس تيار`
 *                        "People in your reservation" -> `‏اْثث نا reservation نا ممبرو`
 *
 *                      The LSD VALUE itself carries a Latin word, so there is no row to land
 *                      that clears them — they need the translation edited. So the population
 *                      splits, and the assertion says so: findings whose Latin run is an
 *                      untranslated KEY clear on their own; a finding mixing Latin with an
 *                      Arabic LETTER is a real unisolated run in shipped copy and fails.
 *
 * ── KNOWN GAP: SKIPS HAVE NO FLOOR ──────────────────────────────────────────────────
 *
 * This suite can legitimately skip an assertion when the element is genuinely absent at a width,
 * and that decision is right — see docs/assertion-discipline.md, example 8. What is missing is
 * the floor: a run in which EVERY assertion skipped prints `0 failing assertion(s)` and exits 0.
 *
 * `scripts/coverage-floor.mjs` exists for this. Declare the runs each case should produce,
 * DERIVED from the width and language lists rather than typed, call `cov.ran(name)` where the
 * case executes and `cov.skip(name, why)` where it does not, and `cov.verify(say)` at the end.
 * Deferred behind a user-facing defect; recorded here so it is found by whoever next edits a
 * skip rather than by whoever next reads the docs.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIQAAT_ID = 'ashara-1448'

let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }
const skip = (msg) => console.log(`  --    ${msg}`)

/**
 * The mtime of the most recently touched file under `src/`.
 *
 * Used to decide whether the bidi census artefact describes the code that is here now. Cached,
 * because the census asks for it twice and walking src/ twice to print one message would be
 * silly.
 */
let newestSrc = null
function newestSourceMtime() {
  if (newestSrc !== null) return newestSrc
  const SRC = resolve(ROOT, 'src')
  newestSrc = 0
  for (const rel of readdirSync(SRC, { recursive: true })) {
    const s = statSync(resolve(SRC, rel))
    if (s.isFile() && s.mtimeMs > newestSrc) newestSrc = s.mtimeMs
  }
  return newestSrc
}

const TOUR_KEYS = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/tour/steps.ts'), 'utf8').matchAll(/key: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]),
)]
const seed = `
  try {
    localStorage.setItem('rms-lang', 'lsd');
    const p = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...p, state: { ...(p.state || {}), loggedIn: true }, version: p.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify(${JSON.stringify(TOUR_KEYS)}));
  } catch {}
`

const PORT = await new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) })
})
const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1500) } }
  dev.stdout.on('data', w); dev.stderr.on('data', w)
  dev.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
})

const browser = await chromium.launch()
try {
  for (const width of NARROW_WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata' })
    await ctx.addInitScript(seed)
    const page = await ctx.newPage()

    // ── 1. weekday headers ────────────────────────────────────────────────
    await page.goto(`http://localhost:${PORT}/miqaats/${MIQAAT_ID}/timeline`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)   // sleep: calendar lays out after fonts resolve; networkidle does not cover layout
    const rows = await page.evaluate(() => {
      // Selector-driven, not shape-guessed: the calendar's header row is the first
      // `grid-cols-7` whose children are all spans. `textContent` rather than a leaf-node
      // match, so a gap-marker <sup> inside a header cannot hide the row — which is exactly
      // how the previous probe went silent.
      const out = []
      for (const grid of document.querySelectorAll('[class*="grid-cols-7"]')) {
        const kids = [...grid.children]
        if (kids.length !== 7) continue
        if (!kids.every((k) => k.tagName === 'SPAN')) continue
        const labels = kids.map((k) => (k.textContent || '').replace(/\s+/g, ' ').trim())
        const rects = kids.map((k) => k.getBoundingClientRect())
        if (rects.some((r) => r.width === 0)) continue
        out.push({
          labels,
          rtl: getComputedStyle(grid).direction === 'rtl',
          // True when the row runs start→end for the grid's own direction.
          startToEnd: getComputedStyle(grid).direction === 'rtl'
            ? rects[0].left > rects[6].left
            : rects[0].left < rects[6].left,
        })
      }
      return out
    })
    if (!rows.length) {
      say(false, `${width}px: no 7-column weekday row found — the probe cannot see what it is meant to check`)
    } else {
      say(rows.every((r) => r.startToEnd),
        `${width}px: ${rows.length} weekday row(s) run start→end in reading order (${rows[0].labels.join(' ')})`)
      // The array order is calendar order and is deliberately NOT reversed for RTL — a week
      // still begins on Sunday. What must mirror is the visual order, asserted above.
      say(rows.every((r) => r.labels.length === 7 && new Set(r.labels).size === 7),
        `${width}px: seven distinct weekday labels, none blank`)
    }

    // ── 2. breadcrumb chevrons ────────────────────────────────────────────
    // Scoped to the breadcrumb's own markup (`[data-name="chevron-right"]` and the back
    // arrow), and asserted by COMPARING the two directions rather than by counting shapes.
    // "Some path points start-ward" would pass on any page with an arrow on it; "the visible
    // path is a different one in RTL than in LTR, and it is the mirrored twin" is the actual
    // contract, and it cannot hold by construction.
    const visibleChevrons = () => page.evaluate(() => {
      const out = { sep: [], back: [] }
      for (const box of document.querySelectorAll('[data-name="chevron-right"]')) {
        for (const path of box.querySelectorAll('path')) {
          if (getComputedStyle(path).display !== 'none') out.sep.push(path.getAttribute('d'))
        }
      }
      for (const svg of document.querySelectorAll('button svg')) {
        const paths = [...svg.querySelectorAll('path')]
        if (paths.length !== 2) continue
        if (!paths.some((x) => (x.getAttribute('d') || '').startsWith('M15 6'))) continue
        for (const path of paths) {
          if (getComputedStyle(path).display !== 'none') out.back.push(path.getAttribute('d'))
        }
      }
      return out
    })

    await page.goto(`http://localhost:${PORT}/miqaats/${MIQAAT_ID}/araz`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)   // sleep: breadcrumb chevrons animate in after navigation
    const rtlChev = await visibleChevrons()

    const enCtx = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata' })
    await enCtx.addInitScript(seed.replace("'lsd'", "'en'"))
    const enPage = await enCtx.newPage()
    await enPage.goto(`http://localhost:${PORT}/miqaats/${MIQAAT_ID}/araz`, { waitUntil: 'networkidle' })
    await enPage.waitForTimeout(400)   // sleep: the same transition on the English page, kept symmetric with the LSD one
    const ltrChev = await enPage.evaluate(() => {
      const out = { sep: [], back: [] }
      for (const box of document.querySelectorAll('[data-name="chevron-right"]')) {
        for (const path of box.querySelectorAll('path')) {
          if (getComputedStyle(path).display !== 'none') out.sep.push(path.getAttribute('d'))
        }
      }
      for (const svg of document.querySelectorAll('button svg')) {
        const paths = [...svg.querySelectorAll('path')]
        if (paths.length !== 2) continue
        if (!paths.some((x) => (x.getAttribute('d') || '').startsWith('M15 6'))) continue
        for (const path of paths) {
          if (getComputedStyle(path).display !== 'none') out.back.push(path.getAttribute('d'))
        }
      }
      return out
    })
    await enCtx.close()

    // Exactly one of the two twins may be painted at a time — both visible would double-draw.
    const oneEach = (list, n) => list.length === n
    say(rtlChev.sep.length > 0 && ltrChev.sep.length === rtlChev.sep.length,
      `${width}px: ${rtlChev.sep.length} breadcrumb separator(s), same count in both languages`)
    say(oneEach(rtlChev.sep, ltrChev.sep.length) && rtlChev.sep.every((d, i) => d !== ltrChev.sep[i]),
      `${width}px: every separator paints a DIFFERENT path in RTL (${JSON.stringify(ltrChev.sep[0])} → ${JSON.stringify(rtlChev.sep[0])})`)
    say(rtlChev.sep.every((d) => d === 'M4.5 0.5L0.5 4.5L4.5 8.5') && ltrChev.sep.every((d) => d === 'M0.5 0.5L4.5 4.5L0.5 8.5'),
      `${width}px: and it is the mirrored twin, not some third shape`)

    if (!rtlChev.back.length) skip(`${width}px: no back arrow on this route`)
    else {
      say(rtlChev.back.every((d) => d === 'M9 6l6 6-6 6') && ltrChev.back.every((d) => d === 'M15 6l-6 6 6 6'),
        `${width}px: the back arrow points start-ward in both (${JSON.stringify(ltrChev.back[0])} → ${JSON.stringify(rtlChev.back[0])})`)
    }

    await ctx.close()
  }

  // ── 3. the bidi census ──────────────────────────────────────────────────
  const REPORT = resolve(ROOT, 'artifacts/audit/bidi.json')
  //
  // ── WHY THIS IS A FAILURE AND NOT A SKIP ───────────────────────────────────────────
  //
  // This section is a whole census, not one assertion, and its input is another suite's
  // artefact. It used to `skip` when the file was missing, which meant `check-mirror` printed
  // `0 failing assertion(s)` and exited 0 having tested none of it. Worse, `artifacts/` is
  // gitignored, so on any fresh clone the file is ALWAYS absent and the census has never once
  // run there. A census whose input is missing is a suite that did not run, not one that passed.
  //
  // Staleness is the same defect one step along, and it is example 1 of
  // docs/assertion-discipline.md exactly: a report generated before the current source
  // describes code that no longer exists, and asserts against it with full confidence.
  //
  // ── WHY mtime AND NOT A CONTENT HASH ───────────────────────────────────────────────
  //
  // A hash looks more rigorous and answers a different question. The question here is not
  // "is the source identical to what was measured" — it is "was this measured AFTER the thing
  // it measures", and an ordering question is answered by an ordering comparison. mtime is not
  // an approximation of the hash; it is the direct form of the property.
  //
  // A hash would also be strictly worse in both directions. It cannot tell you which of two
  // differing trees came first, so it cannot distinguish a stale report from a report made
  // against a tree that has since been reverted — and reverting to a previously measured state
  // is exactly when you would want the census re-run, since it never ran against the tree in
  // between. And it costs a full walk plus a read of every file to answer a question two stat
  // calls already answer.
  //
  // The failure mode of mtime is a clock going backwards or a checkout that rewrites
  // timestamps, both of which make the census re-run — noisy in the safe direction. The
  // failure mode of "no check at all" is what shipped: a census asserting against 2026-08-09.
  //
  if (!existsSync(REPORT)) {
    say(false, 'artifacts/audit/bidi.json is absent, so the bidi census below did not run — `npm run check:bidi` writes it')
  } else if (newestSourceMtime() > statSync(REPORT).mtimeMs) {
    say(false, `artifacts/audit/bidi.json predates src/ (report ${new Date(statSync(REPORT).mtimeMs).toISOString()}, newest source ${new Date(newestSourceMtime()).toISOString()}) — it describes code that has since changed; re-run \`npm run check:bidi\``)
  } else {
    const v = JSON.parse(readFileSync(REPORT, 'utf8')).violations ?? []
    const ARABIC_LETTER = /[ؠ-يٮ-ۓۺ-ۿ]/
    const real = v.filter((x) => ARABIC_LETTER.test(x.text))
    console.log(`\n  bidi census: ${v.length} finding(s)`)
    for (const x of v) {
      const kind = ARABIC_LETTER.test(x.text) ? 'LATIN+ARABIC-LETTER' : 'latin+arabic-digit'
      console.log(`    ${kind}  ${x.kind}  ${JSON.stringify(x.text)}  ${x.where}`)
    }
    // Two populations, stated separately, because they need different repairs and lumping them
    // under one sentence is how the false claim survived. The count that clears on its own is
    // reported as progress; the count that needs a wordlist edit is what fails.
    say(real.length === 0,
      `${v.length - real.length}/${v.length} findings are an untranslated key beside a converted ` +
      `numeral and clear when those rows land; ${real.length} carry Latin INSIDE the LSD value ` +
      `and need the translation edited — no row landing will reach them`)
  }
} finally {
  await browser.close()
  dev.kill()
}

console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
