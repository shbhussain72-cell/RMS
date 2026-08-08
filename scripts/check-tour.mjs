/**
 * check-tour.mjs — drive every walkthrough to its end, in both languages, and compare.
 *
 *   npm run check:tour
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────────
 *
 * The tour is the one feature in this app whose failure mode is invisible to every other
 * assertion. It renders nothing of its own into the page: it finds a `data-tour` anchor that
 * some screen put there, and if the anchor is missing it simply shows no tip. No error, no
 * console warning, no layout change, nothing in a screenshot — because a screenshot of a page
 * with no tour on it looks exactly like a page whose tour has not started yet.
 *
 * P8 found that `MiqaatDetail` set `data-tour="register-button"` behind
 * `actionLabel === t('Register Now')`. `actionLabel` holds the English key, so in LSD that
 * comparison was false, the attribute was never written, and the walkthrough lost its opening
 * anchor on the detail page — in one language only. Every suite in the repo passed.
 *
 * That bug is fixed. This exists because it was found by reading, not by testing, and because
 * one anchor lost silently means the others can be too.
 *
 * ── WHAT IT ASSERTS ──────────────────────────────────────────────────────────────────
 *
 *   PARITY     Every step's anchor must be present in LSD exactly when it is present in EN.
 *              This is the assertion that would have caught the bug above. It is a comparison
 *              rather than a presence check on purpose: an anchor that is legitimately absent
 *              in both languages (Invite Mehmaan on an event with no guests) is not a defect,
 *              and a probe that failed on it would be turned off within a week.
 *
 *   OPENS      The walkthrough that opens in EN must open in LSD, with the same step count.
 *
 *   SPOTLIGHT  Each step's highlight must actually sit on its anchor — the overlay positions
 *              itself from a rect it measures, so a wrong or stale rect spotlights empty page.
 *
 *   ON SCREEN  The tooltip must be inside the viewport. It is rendered at -9999 until it has
 *              been measured; a step that never measures leaves it there, visible to nobody.
 *
 *   COVERAGE   The overlay's own copy, scanned with the same classifier the route walk uses.
 *              Class A — dictionary has a translation, English rendered anyway — must be 0.
 *              No route walk can reach this markup: the tour is suppressed by `rms-tour-seen`
 *              in every other harness here, precisely so the rest of the page can be measured.
 *
 * Both widths, because the app ships separate markup per breakpoint and an anchor can exist in
 * one and not the other.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIDTHS = NARROW_WIDTHS

/**
 * Miqaat fixtures to try, in order, until a screen's anchors appear.
 *
 * One id is not enough and the reason is not a bug. `ashara-1448` is the demo event and it sets
 * `preferredCityFormOnly`, so its /preferred-city route deliberately renders the questionnaire
 * and no city ranking at all — the walkthrough for that screen cannot exist there, in either
 * language. `eg-registered` and the rest are the seed's other states, and between them they put
 * every anchor on screen.
 *
 * Read from src/data/seed.ts rather than listed here, so an added fixture is tried automatically.
 */
const MIQAAT_IDS = [...new Set([...readFileSync(resolve(ROOT, 'src/data/seed.ts'), 'utf8')
  .matchAll(/^\s{4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1]))]
const MIQAAT_ID = MIQAAT_IDS[0] ?? 'ashara-1448'

let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }
const note = (msg) => console.log(`  --    ${msg}`)

// `:id` is left in place — it is filled per attempt from MIQAAT_IDS below.
const routes = [...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
  .matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p !== '*' && p !== '/')
  .sort()
const fill = (route, id) => route.replace(/:id/g, id)

// `rms-tour-seen` is seeded EMPTY here — the opposite of every other harness in this repo, which
// fills it so the overlay stays out of the way of what they are measuring.
const seed = (lang) => `
  try {
    localStorage.setItem('rms-lang', ${JSON.stringify(lang)});
    const prev = JSON.parse(localStorage.getItem('miqaat-flow') || '{}');
    localStorage.setItem('miqaat-flow', JSON.stringify({
      ...prev, state: { ...(prev.state || {}), loggedIn: true }, version: prev.version ?? 0,
    }));
    localStorage.setItem('rms-tour-seen', JSON.stringify([]));
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

/**
 * Walk one screen's walkthrough to the end and report what happened at every step.
 *
 * Runs inside the page so it can use the app's own module. The screen list is imported from
 * `src/tour/steps.ts` rather than parsed out of it: a regex over the source would drift from
 * the definitions the moment a step moved, and this probe's whole value is that it checks the
 * real thing.
 */
async function runScreen(page, screenKey) {
  return page.evaluate(async (key) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const { TOUR_SCREENS } = await import('/src/tour/steps.ts')
    const screen = TOUR_SCREENS.find((s) => s.key === key)
    if (!screen) return { error: `no screen '${key}'` }

    const anchorRect = (a) => {
      const els = [...document.querySelectorAll(`[data-tour="${a}"]`)]
      const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 })
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, left: r.left, width: r.width, height: r.height }
    }

    // Wait for the overlay to arm. TourProvider delays 350ms then polls every 250ms for an
    // anchor, so a fixed wait would race the screens whose anchor appears late.
    let tip = null
    for (let i = 0; i < 40 && !tip; i++) {
      tip = document.querySelector('.tour-tip')
      if (!tip) await sleep(100)
    }

    // Anchors are read AFTER that wait, not before it. Read early, `manage` reported zero anchors
    // at 1440 while its `modify-options` grid was simply still mounting — a probe finding nothing
    // because it looked too soon reads exactly like a screen with nothing on it.
    const anchors = screen.steps.map((s) => ({ anchor: s.anchor, rect: anchorRect(s.anchor) }))
    if (!tip) return { anchors, opened: false, steps: [] }

    const steps = []
    for (let guard = 0; guard < 12; guard++) {
      tip = document.querySelector('.tour-tip')
      if (!tip) break

      // The spotlight is the only absolutely-positioned sibling of the tip carrying a box-shadow.
      const dialog = tip.closest('[role="dialog"]')
      const spotOf = () => [...(dialog?.children ?? [])].find((el) => getComputedStyle(el).boxShadow.includes('9999px'))

      // WAIT FOR IT TO STOP MOVING — and do not trust the first stillness.
      //
      // `top`/`left`/`width`/`height` are transitioned over 0.4s, and the opening step of a long
      // page is a 3600px journey; at any fixed delay the rendered rect is somewhere in the middle
      // of it. Measured mid-flight, the list page reported its highlight 3607px from its anchor.
      //
      // Polling until two reads agree is not enough either, and failed in the more embarrassing
      // direction: at the moment a step begins, React has not yet committed the new box, so the
      // spotlight is sitting perfectly still at the PREVIOUS step's position. Two agreeing reads,
      // exit immediately, and the probe measures a stale rect while believing it waited. So the
      // wait has a floor as well as a condition — three consecutive agreeing reads, and never
      // before 900ms.
      const FLOOR_MS = 900
      const rectsAgree = (a, b) => a && b &&
        Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 &&
        Math.abs(a.height - b.height) < 1 && Math.abs(a.width - b.width) < 1
      let sr = spotOf()?.getBoundingClientRect()
      let still = 0
      for (let k = 0; k < 40; k++) {
        await sleep(100)
        const now = spotOf()?.getBoundingClientRect()
        still = rectsAgree(sr, now) ? still + 1 : 0
        sr = now
        if (still >= 3 && (k + 1) * 100 >= FLOOR_MS) break
      }
      const tr = tip.getBoundingClientRect()
      const title = tip.querySelector('h3')?.textContent?.trim() ?? ''

      // Which anchor is this step on? Match the spotlight back to an anchor rect rather than
      // trusting the step index — the provider filters steps whose anchor is absent, so index
      // N in `screen.steps` is not index N in what the user sees.
      //
      // Re-measured HERE, not reused from the pass above. The overlay scrolls each anchor into
      // view, so viewport rects captured at load are stale by the second step — with the stale
      // set, every step on a scrolling screen matched whichever anchor happened to be at the top
      // of the page, and one step reported "no anchor" for an anchor that was plainly spotlit.
      let on = null
      let best = 0
      for (const a of anchors) {
        const els = [...document.querySelectorAll(`[data-tour="${a.anchor}"]`)]
        for (const el of els) {
          const r = el.getBoundingClientRect()
          if (r.width <= 1 || r.height <= 1 || !sr) continue
          // Overlap area, not centre-in-box: an anchor taller than the viewport has its centre
          // off-screen, and the spotlight is clipped to what is visible.
          const ov = Math.max(0, Math.min(r.right, sr.right) - Math.max(r.left, sr.left)) *
                     Math.max(0, Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top))
          const share = ov / Math.max(1, Math.min(r.width * r.height, sr.width * sr.height))
          if (share > best) { best = share; on = a.anchor }
        }
      }
      if (best < 0.5) on = null

      steps.push({
        title,
        anchor: on,
        // Kept for the failure message. An assertion that says "the highlight is on nothing"
        // without saying what it measured sends the next reader back to guessing.
        spot: sr ? { top: Math.round(sr.top), left: Math.round(sr.left), w: Math.round(sr.width), h: Math.round(sr.height) } : null,
        share: Math.round(best * 100) / 100,
        rects: anchors.map((a) => {
          const el = [...document.querySelectorAll(`[data-tour="${a.anchor}"]`)]
            .find((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 })
          if (!el) return { anchor: a.anchor, rect: null }
          const r = el.getBoundingClientRect()
          return { anchor: a.anchor, rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }
        }),
        spotlit: !!sr && sr.width > 2 && sr.height > 2,
        onScreen: tr.top >= 0 && tr.left >= 0 && tr.bottom <= innerHeight && tr.right <= innerWidth,
        tipText: (tip.textContent || '').replace(/\s+/g, ' ').trim(),
      })

      const buttons = [...tip.querySelectorAll('button')]
      const nextBtn = buttons[buttons.length - 1]
      if (!nextBtn) break
      nextBtn.click()
      await sleep(320)
      if (!document.querySelector('.tour-tip')) break
    }

    return { anchors, opened: true, steps }
  }, screenKey)
}

/** The coverage classifier, run over the overlay only. */
async function scanOverlay(page) {
  return page.evaluate(async () => {
    const { scanDom } = await import('/src/i18n/domScan.ts')
    const root = document.querySelector('[role="dialog"][aria-modal="true"]')
    if (!root) return null
    const res = scanDom(root)
    const out = { A: [], B1: [], B2: [], C: [], sentinel: [] }
    for (const h of res.hits ?? []) (out[h.detail] ??= []).push(h.text)
    return out
  })
}

try {
  // The screen list, and a route that reaches each one.
  const probe = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await probe.addInitScript(seed('en'))
  const probePage = await probe.newPage()
  await probePage.goto(`http://localhost:${PORT}/miqaats`, { waitUntil: 'networkidle' })
  const screens = await probePage.evaluate(async ({ rs, id }) => {
    const { TOUR_SCREENS } = await import('/src/tour/steps.ts')
    // Matched against a filled-in route: `s.test` is written against real pathnames, so a
    // literal ':id' would fail every `/miqaats/[^/]+/…` pattern.
    return TOUR_SCREENS.map((s) => ({
      key: s.key,
      route: rs.find((r) => s.test.test(r.replace(/:id/g, id))) ?? null,
      anchors: s.steps.map((st) => st.anchor),
    }))
  }, { rs: routes, id: MIQAAT_ID })
  await probe.close()

  const unrouted = screens.filter((s) => !s.route)
  say(unrouted.length === 0, `every walkthrough has a route that reaches it${unrouted.length ? ` (${unrouted.map((s) => s.key).join(', ')} do not)` : ''}`)

  const overlayCoverage = { A: new Set(), B1: new Set(), B2: new Set(), C: new Set(), sentinel: new Set() }

  for (const width of WIDTHS) {
    console.log(`\n── ${width}px ─────────────────────────────────────────────`)
    for (const sc of screens) {
      if (!sc.route) continue

      /** One (lang, miqaat) run. */
      const load = async (lang, id, extraPage) => {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
        })
        await ctx.addInitScript(seed(lang))
        const page = await ctx.newPage()
        await page.goto(`http://localhost:${PORT}${fill(sc.route, id)}`, { waitUntil: 'networkidle' })
        const run = await runScreen(page, sc.key)
        if (extraPage && run.opened) await extraPage(ctx, fill(sc.route, id))
        await ctx.close()
        return run
      }

      // Find a fixture that puts this screen on screen. Different seed events sit at different
      // points in the journey and no single one shows every anchor: the status tracker needs a
      // submitted registration, the city walkthrough needs city selection open, and the demo
      // event hides the preferred-city ranking outright. Trying them in turn is what makes
      // "unchecked" mean unreachable rather than "we only looked at one event".
      let usedId = null
      let en = null
      for (const id of MIQAAT_IDS) {
        const run = await load('en', id)
        if (run.anchors?.some((a) => a.rect)) { usedId = id; en = run; break }
        if (!en) en = run
      }
      if (!usedId) {
        say(false, `${sc.key}: no anchor present on ${sc.route} for ANY of the ${MIQAAT_IDS.length} seed events — this screen went UNCHECKED`)
        continue
      }
      note(`${sc.key}: via ${fill(sc.route, usedId)}`)

      const lsd = await load('lsd', usedId, async (ctx, url) => {
        // Re-open on a fresh load: the walk above finished the tour, which unmounts it.
        const p2 = await ctx.newPage()
        await p2.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'networkidle' })
        await p2.waitForTimeout(1400)
        const cov = await scanOverlay(p2)
        if (cov) for (const k of Object.keys(overlayCoverage)) for (const s of cov[k] ?? []) overlayCoverage[k].add(s)
        await p2.close()
      })

      if (en.error || lsd.error) { say(false, `${sc.key}: ${en.error || lsd.error}`); continue }

      // PARITY — the assertion the MiqaatDetail bug needed.
      const mismatched = en.anchors
        .map((a, i) => ({ anchor: a.anchor, en: !!a.rect, lsd: !!lsd.anchors[i]?.rect }))
        .filter((a) => a.en !== a.lsd)
      say(mismatched.length === 0,
        `${sc.key}: anchor parity — ${mismatched.length ? mismatched.map((m) => `${m.anchor} en=${m.en} lsd=${m.lsd}`).join(', ') : `${en.anchors.filter((a) => a.rect).length}/${en.anchors.length} present in both`}`)

      say(en.opened === lsd.opened, `${sc.key}: opens in both (en=${en.opened} lsd=${lsd.opened})`)
      say(en.steps.length === lsd.steps.length, `${sc.key}: ${lsd.steps.length} step(s) in LSD, ${en.steps.length} in EN`)

      for (const [i, st] of lsd.steps.entries()) {
        say(st.spotlit && !!st.anchor,
          `${sc.key}[${i}]: spotlight sits on ${st.anchor ?? `NO ANCHOR — best overlap ${st.share}, spotlight ${JSON.stringify(st.spot)} vs ${JSON.stringify(st.rects)}`}`)
        say(st.onScreen, `${sc.key}[${i}]: tooltip inside the viewport`)
      }
    }
  }

  // ── the overlay's own copy ────────────────────────────────────────────────────────
  console.log('\n── overlay coverage (LSD) ────────────────────────────────')
  for (const k of ['A', 'B1', 'B2', 'C', 'sentinel']) {
    const list = [...overlayCoverage[k]]
    if (list.length) console.log(`  ${k.padEnd(9)} ${list.length}  ${list.map((s) => JSON.stringify(s)).join('  ')}`)
  }
  say(overlayCoverage.A.size === 0,
    `class A on the overlay is ${overlayCoverage.A.size} — the dictionary has these and English rendered anyway`)
} finally {
  await browser.close()
  dev.kill()
}

console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
