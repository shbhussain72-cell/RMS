/**
 * check-overlap.mjs — nothing sits under the sticky footer, and nothing renders twice.
 *
 *   npm run check:overlap
 *
 * ── WHY A SEPARATE PROBE FROM check-layout ───────────────────────────────────────────
 *
 * `check-layout` sweeps for occlusion generically and logs a large, mostly-intentional
 * backlog: every fixed/sticky overlay legitimately covers something. That makes it the wrong
 * instrument for a specific contract. This one asserts three things that are never acceptable,
 * on the five canonical widths rather than four:
 *
 *   STICKY     No text intersects the sticky footer block once the page is scrolled to the
 *              bottom. The footer's own copy is exempt; everything else is content it hides.
 *              Checked on every route that HAS a sticky footer, not a hand-listed set —
 *              a list is a promise to remember, and the next screen to grow a footer will
 *              not be on it.
 *
 *   REACHABLE  The footer's buttons must be fully inside the viewport. `/preferred-city`
 *              pushed them off the bottom edge, which is worse than covering content: the
 *              content is merely hidden, the button cannot be pressed at all.
 *
 *   ONCE       The five `Important Notice` rows must appear at most once in the DOM. They were
 *              rendered twice on the detail page — once as the notice list, once inside the
 *              Documents card's clipped preview.
 *
 * The sticky rect used is the whole `.sticky-cta` block, not its inner card. The block's
 * gradient is opaque for most of its height and is what fades content out; measuring only the
 * card would pass a screen whose last line is visibly greyed into the background.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIQAAT_ID = 'ashara-1448'
const WIDTHS = [390, 768, 1024, 1150, 1440]
const LANGS = ['en', 'lsd']

let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }

const routes = [...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8')
  .matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p !== '*' && p !== '/')
  .map((p) => p.replace(/:id/g, MIQAAT_ID))
  .sort()

// The five rows, read from the seed so a reworded notice cannot quietly stop being checked.
const NOTICES = [...readFileSync(resolve(ROOT, 'src/data/seed.ts'), 'utf8')
  .matchAll(/^const NOTICES = \[([\s\S]*?)^\]/gm)]
  .flatMap((m) => [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'")))

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

const PORT = await new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) })
})
const dev = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('preview server did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1200) } }
  dev.stdout.on('data', w); dev.stderr.on('data', w)
  dev.on('exit', (c) => { clearTimeout(t); fail(new Error(`preview server exited (${c})`)) })
})

/** Everything wrong on one page, measured after scrolling every scroller to its end. */

const PAGE_FN = (notices) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()

  // Drive every scroller to the bottom — the window's, and any inner overflow-y:auto panel,
  // which is what the desktop layout scrolls instead of the document.
  window.scrollTo(0, document.documentElement.scrollHeight)
  for (const el of document.querySelectorAll('*')) {
    const st = getComputedStyle(el)
    if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
      el.scrollTop = el.scrollHeight
    }
  }

  const out = { sticky: null, covered: [], offscreen: [], dupes: [], appbar: null }

  // EVERY visible footer, not the first one. Screens that ship separate mobile and desktop
  // markup render two `.sticky-cta` blocks and hide one with `sm:hidden`; the hidden one comes
  // first in the DOM and measures 0x0, so `querySelector` handed this probe an empty rect that
  // nothing could possibly intersect. It reported a clean sweep while /city at 1440 had its last
  // city row 56px under the real footer.
  const ctas = [...document.querySelectorAll('.sticky-cta')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 })
  for (const cta of ctas) {
    const f = cta.getBoundingClientRect()
    out.sticky = { top: Math.round(f.top), bottom: Math.round(f.bottom), h: Math.round(f.height) }

    // Text nodes outside the footer whose box lands inside it.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = norm(n.nodeValue)
      if (!text || !/\S/.test(text)) continue
      const el = n.parentElement
      if (!el || cta.contains(el)) continue
      // Ignore anything in a fixed/sticky layer of its own (dev dock, tour overlay, FAB):
      // those are intentional overlays and are not what the footer is hiding. The footer's own
      // sticky wrapper is excluded above by `cta.contains`, so this cannot swallow the subject.
      // `fixed` only, NOT `sticky`. Skipping every sticky ancestor was too broad and is how this
      // probe first reported a clean sweep: the desktop two-pane layouts put page content inside
      // sticky panels, so the content the footer covers was filtered out as "an overlay of its
      // own". The footer's own wrapper is already excluded by `cta.contains` above.
      let fixed = false
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).position === 'fixed') { fixed = true; break }
      }
      if (fixed) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      if (r.bottom <= f.top || r.top >= f.bottom) continue
      if (r.right <= f.left || r.left >= f.right) continue
      const key = `${el.tagName}.${Math.round(r.top)}.${text.slice(0, 30)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.covered.push({ text: text.slice(0, 60), top: Math.round(r.top), bottom: Math.round(r.bottom) })
    }

    // Footer controls must be pressable, i.e. inside the viewport.
    for (const b of cta.querySelectorAll('button')) {
      const r = b.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      if (r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1) {
        out.offscreen.push({ text: norm(b.textContent).slice(0, 30), top: Math.round(r.top), bottom: Math.round(r.bottom) })
      }
    }
  }

  // Duplicate instruction rows. Compared on a prefix, because the notice list and the document
  // preview word the first row slightly differently while saying the same thing.
  const body = norm(document.body.innerText)
  for (const notice of notices) {
    const probe = norm(notice).slice(0, 60)
    if (!probe) continue
    let count = 0
    let i = body.indexOf(probe)
    while (i !== -1) { count++; i = body.indexOf(probe, i + 1) }
    if (count > 1) out.dupes.push({ probe: probe.slice(0, 45), count })
  }

  // AppBar identity: clipped, or colliding with whatever sits beside it.
  const bar = document.querySelector('header, [data-appbar]')
  if (bar) {
    const name = [...bar.querySelectorAll('p,span,div')]
      .find((e) => e.children.length === 0 && norm(e.textContent).length > 8)
    if (name) {
      const r = name.getBoundingClientRect()
      out.appbar = {
        text: norm(name.textContent).slice(0, 40),
        overflowing: name.scrollWidth > name.clientWidth + 1,
        title: name.getAttribute('title') || name.closest('[title]')?.getAttribute('title') || null,
        outOfBar: r.right > bar.getBoundingClientRect().right + 1,
      }
    }
  }

  return out
}

const browser = await chromium.launch()
const summary = { covered: [], offscreen: [], dupes: [], appbar: [] }
try {
  for (const width of WIDTHS) {
    for (const lang of LANGS) {
      const ctx = await browser.newContext({
        viewport: { width, height: 833 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
      })
      await ctx.addInitScript(seed(lang))
      const page = await ctx.newPage()
      for (const route of routes) {
        try {
          await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 20_000 })
        } catch { continue }
        await page.waitForTimeout(160)
        const r = await page.evaluate(PAGE_FN, NOTICES)
        const at = `${route} [${lang}@${width}]`
        for (const c of r.covered) summary.covered.push({ at, ...c })
        for (const o of r.offscreen) summary.offscreen.push({ at, ...o })
        for (const d of r.dupes) summary.dupes.push({ at, ...d })
        if (r.appbar && (r.appbar.overflowing || r.appbar.outOfBar || !r.appbar.title)) summary.appbar.push({ at, ...r.appbar })
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  dev.kill()
}

/** Collapse per-(width,lang) repeats of the same finding into one line. */
const group = (list, keyOf) => {
  const m = new Map()
  for (const x of list) {
    const k = keyOf(x)
    if (!m.has(k)) m.set(k, { ...x, wheres: [] })
    m.get(k).wheres.push(x.at)
  }
  return [...m.values()]
}

const coveredG = group(summary.covered, (x) => `${x.at.split(' ')[0]}|${x.text}`)
const offscreenG = group(summary.offscreen, (x) => `${x.at.split(' ')[0]}|${x.text}`)
const dupesG = group(summary.dupes, (x) => x.probe)

console.log(`\nSTICKY — content under the footer (${coveredG.length} distinct)`)
for (const c of coveredG.slice(0, 40)) console.log(`    ${c.at.split(' ')[0]}  ${JSON.stringify(c.text)}  (${c.wheres.length} of ${WIDTHS.length * LANGS.length})`)
say(coveredG.length === 0, `no content sits under a sticky footer on any of ${routes.length} routes x ${WIDTHS.length} widths x 2 languages`)

console.log(`\nREACHABLE — footer controls off-screen (${offscreenG.length} distinct)`)
for (const o of offscreenG) console.log(`    ${o.at.split(' ')[0]}  ${JSON.stringify(o.text)}  top ${o.top} bottom ${o.bottom}  (${o.wheres.join(', ')})`)
say(offscreenG.length === 0, 'every sticky-footer control is inside the viewport')

console.log(`\nONCE — instruction rows rendered more than once (${dupesG.length} distinct)`)
for (const d of dupesG) console.log(`    x${d.count}  ${JSON.stringify(d.probe)}  (${d.wheres.length} views)`)
say(dupesG.length === 0, `the ${NOTICES.length} Important Notice rows appear at most once in the DOM`)

const appbarG = group(summary.appbar, (x) => `${x.text}|${x.overflowing}|${x.outOfBar}|${!x.title}`)
console.log(`\nAPPBAR — identity clipped, escaping the bar, or missing a title (${appbarG.length} distinct)`)
for (const a of appbarG) console.log(`    ${JSON.stringify(a.text)}  overflowing=${a.overflowing} outOfBar=${a.outOfBar} title=${a.title ? 'yes' : 'MISSING'}  (${a.wheres.length} views)`)
say(appbarG.length === 0, 'the AppBar identity truncates cleanly, stays inside the bar, and carries a full-name title')

console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
