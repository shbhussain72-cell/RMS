/**
 * check-layout.mjs — geometry assertions, in both languages, at every audited width.
 *
 *   node scripts/check-layout.mjs                 # all routes, both languages, 4 widths
 *   node scripts/check-layout.mjs --lang lsd      # one language
 *   node scripts/check-layout.mjs --width 390     # one width
 *   node scripts/check-layout.mjs --route /miqaats/ashara-1448/manage
 *   node scripts/check-layout.mjs --json
 *
 * Exits non-zero when any assertion fails, so it can gate a build.
 *
 * ── WHAT IT ASSERTS, AND WHY EACH ONE ────────────────────────────────────────────
 *
 * CLIPPED      an element whose content is wider than its box while `overflow-x` is
 *              `hidden`. That is text the user can never reach — not a scroll, a truncation.
 *              The distinction matters: `overflow-x: auto` with the same numbers is fine.
 *
 * PAGE-OVERFLOW  `documentElement.scrollWidth > innerWidth`. A horizontal scrollbar on the
 *              PAGE is never intentional here; a table may scroll, the document may not.
 *
 * OVERLAP      two interactive elements whose boxes intersect, BOTH in normal flow. One of
 *              them is unclickable, and which one depends on paint order, so this is a bug
 *              even when it looks fine in a screenshot. Cheap, and catches a class occlusion
 *              misses: two controls can overlap while a THIRD element is painted over both.
 *
 * OVERLAP-     the same measurement, but one of the two lives in a fixed/sticky layer. A
 * OVERLAY      sticky footer's CTA passing over the buttons in the page beneath it is that
 *              footer working, and it is the same situation OVERLAY already exempts for text.
 *              Applying the exemption to one measurement and not the other was an
 *              inconsistency in this instrument, not a finding about the app: it accounted for
 *              33 of the 58 failures at the four-width baseline. Reported; does NOT gate.
 *
 * OCCLUDED     a text element that is not the topmost thing at its own centre, where the
 *              occluder is in normal flow. Nothing in flow should ever be painted over
 *              text. This is a real defect and fails the run.
 *
 * OVERLAY      the same measurement, but the occluder lives in a fixed/sticky layer — a
 *              modal, a toast, a sticky footer. Covering the page is what those are for.
 *              Reported for the record; does NOT fail the run.
 *
 * TALL-ROW     a members-table row past a height threshold. This is how a missing
 *              `min-width` shows up numerically: the name column collapses, every word wraps
 *              onto its own line, and the row grows to several hundred pixels.
 *
 * RTL-SCROLL   a horizontally scrollable box in RTL must start at its INLINE start — the
 *              right edge. Browsers normalise `scrollLeft` differently (0, negative, or
 *              positive-max), so this checks the rendered position rather than the raw
 *              number: at rest, the first column must be visible.
 *
 * Overlap is deliberately restricted to elements that are both interactive AND visible.
 * Decorative overlap (a gradient over a card) is normal; two buttons on top of each other
 * is not.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { CANONICAL_WIDTHS } from './widths.mjs'
import { installProbeDom } from './probe-dom.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const MIQAAT_ID = 'ashara-1448'
const OUT = resolve(ROOT, 'artifacts/audit/layout.json')

const argv = process.argv.slice(2)
const flag = (name) => argv.filter((a, i) => argv[i - 1] === `--${name}`)
const JSON_OUT = argv.includes('--json')
const WIDTHS = flag('width').length ? flag('width').map(Number) : CANONICAL_WIDTHS
const LANGS = flag('lang').length ? flag('lang') : ['en', 'lsd']
const ONLY = flag('route')

const routes = [
  ...new Set([...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1])),
]
  .filter((p) => p !== '*' && p !== '/')
  .map((p) => p.replace(/:id/g, MIQAAT_ID))
  .sort()
const targets = ONLY.length ? routes.filter((r) => ONLY.some((o) => r.startsWith(o))) : routes

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

/**
 * Runs in the page. Self-contained — stringified across the boundary.
 *
 * `isVisible` and `pointVisible` come from `scripts/probe-dom.mjs` via `addInitScript`, so
 * that every probe in this repo shares ONE definition of "rendered" and ONE definition of
 * "painted here". They used to be copied per file; see that module for what the copy cost.
 */
const PROBE = () => {
  const out = []
  const { isVisible, pointVisible, paintedRect } = window.__probe
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : ''
    const name = el.getAttribute('data-name') || el.getAttribute('data-tour') || ''
    return `${el.tagName.toLowerCase()}${name ? `[${name}]` : ''}${cls ? `.${cls}` : ''}`
  }

  // ── page-level horizontal overflow ────────────────────────────────────────
  const de = document.documentElement
  if (de.scrollWidth > window.innerWidth + 1) {
    out.push({ kind: 'PAGE-OVERFLOW', where: 'html', detail: `scrollWidth ${de.scrollWidth} > innerWidth ${window.innerWidth}` })
  }

  const all = [...document.querySelectorAll('*')]

  // ── clipped content ───────────────────────────────────────────────────────
  for (const el of all) {
    if (!isVisible(el)) continue
    const s = getComputedStyle(el)
    const clipsX = s.overflowX === 'hidden' || s.overflowX === 'clip'
    if (!clipsX) continue
    // Tailwind's `truncate` is overflow-hidden + text-overflow: ellipsis + nowrap. That is a
    // DELIBERATE single-line truncation with a visible affordance, not lost text, and it is
    // by far the most common overflow-hidden in this codebase. Counting it drowned the real
    // findings 4:1 on the first run.
    if (s.textOverflow === 'ellipsis') continue
    // 2px tolerance: sub-pixel rounding routinely produces a 1px difference that is
    // invisible and unfixable, and flagging it would bury the real cases.
    if (el.scrollWidth <= el.clientWidth + 2) continue
    // The objective is "no clipped or sheared TEXT". Decorative overflow is routine and
    // deliberate — Success.tsx clips a 3474px masked ornament down to a 358px header on
    // purpose, and reporting that sends you editing artwork instead of copy. So confirm a
    // text-bearing descendant actually escapes the content box before calling it a bug.
    const box = el.getBoundingClientRect()
    const overflowing = [...el.querySelectorAll('*')].find((d) => {
      if (d.children.length) return false                 // leaf elements only
      const t = (d.textContent || '').trim()
      if (t.length < 2) return false
      const r = d.getBoundingClientRect()
      if (r.width < 1) return false
      return r.right > box.right + 2 || r.left < box.left - 2
    })
    if (!overflowing) continue
    out.push({
      kind: 'CLIPPED', where: describe(el),
      detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} with overflow-x:${s.overflowX}`,
      text: (overflowing.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    })
  }

  /**
   * Nearest fixed/sticky ancestor of `el`, itself included, or null.
   *
   * DECLARED intent only, and kept solely as the fallback for when the measured test below
   * cannot run (nothing on the page is scrollable, so nothing can be observed to stay put).
   * On its own it was wrong in both directions:
   *
   *   - a footer declaring `position: sticky` inside a wrapper of its own height has zero
   *     travel and behaves as static, and was still granted the exemption;
   *   - four desktop panels mount a footer that IS pinned — it is the last `shrink-0` child of
   *     a full-height flex column — and were refused the exemption `/roster` gets for the
   *     identical arrangement, which sent a whole session after a fix that did not exist.
   */
  const layerOf = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const pos = getComputedStyle(p).position
      if (pos === 'fixed' || pos === 'sticky') return p
    }
    return null
  }

  /**
   * Does `el` stay put when the thing it lives in scrolls?
   *
   * This is the OUTCOME form of "is it an intentional overlay": an overlay is a thing that
   * stays where it is while the page moves under it. Measured, not read off a CSS property —
   * see docs/assertion-discipline.md.
   *
   * Scoped to elements already implicated in a finding, and grouped by scroller, so a page
   * costs a handful of scroll operations rather than one per candidate. `scrollingElement`
   * covers the window; the desktop layouts pin page height and scroll an inner panel instead,
   * and a footer that is a SIBLING of that panel is anchored precisely because scrolling the
   * panel does not move it.
   */
  const anchoredCache = new Map()
  const scrollerFor = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const st = getComputedStyle(p)
      if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p
    }
    const de = document.scrollingElement || document.documentElement
    return de.scrollHeight > de.clientHeight + 4 ? de : null
  }
  const isAnchored = (el) => {
    if (anchoredCache.has(el)) return anchoredCache.get(el)
    const sc = scrollerFor(el)
    let verdict
    if (!sc) {
      // Nothing to scroll — the measurement is unavailable, so fall back to the declaration
      // rather than guessing. `detail` records which of the two answered.
      verdict = { anchored: !!layerOf(el), measured: false }
    } else {
      const before = el.getBoundingClientRect()
      const y = sc.scrollTop
      const delta = Math.min(120, sc.scrollHeight - sc.clientHeight - y) || -Math.min(120, y)
      sc.scrollTop = y + delta
      const after = el.getBoundingClientRect()
      sc.scrollTop = y
      verdict = { anchored: Math.abs(after.top - before.top) <= 2, measured: true }
    }
    anchoredCache.set(el, verdict)
    return verdict
  }
  const overlayVerdict = (...els) => {
    const vs = els.map(isAnchored)
    const win = vs.find((v) => v.anchored)
    return { anchored: !!win, measured: vs.every((v) => v.measured) }
  }

  // ── overlapping interactive elements ──────────────────────────────────────
  const interactive = all.filter(
    (el) => /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.getAttribute('role') === 'button',
  ).filter(isVisible)
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i], b = interactive[j]
      if (a.contains(b) || b.contains(a)) continue // nesting is not collision
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (ox > 4 && oy > 4) {
        // Both controls must actually be PAINTED where they overlap.
        //
        // `getBoundingClientRect` reports geometry, not paint: a table row scrolled past the
        // bottom of an `overflow-y: auto` panel still reports an on-screen rect while nothing
        // of it is drawn there. The occlusion test has honoured that since `pointVisible` was
        // written — its docblock records it as the single largest false-positive class in this
        // file — and this test never got the same treatment.
        //
        // It cost a session. Every OVERLAP on /araz and /people was a member-table row clipped
        // below its scroller, whose rect happens to land in the footer's band; `elementFromPoint`
        // at the overlap centre returns the footer because the row is not painted at all. Three
        // separate causes were proposed and measured for a defect that did not exist.
        //
        // This does NOT suppress the case the test is for: two controls both painted, one
        // covering the other, still overlap and still fail.
        const cx = (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2
        const cy = (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2
        if (!pointVisible(a, cx, cy) || !pointVisible(b, cx, cy)) continue

        // Same exemption as the occlusion test, same helper: if EITHER element stays put when
        // its container scrolls, one is deliberately passing over the other and this is a
        // record rather than a defect.
        const v = overlayVerdict(a, b)
        out.push({
          kind: v.anchored ? 'OVERLAP-OVERLAY' : 'OVERLAP',
          where: `${describe(a)} ∩ ${describe(b)}`,
          detail: `${Math.round(ox)}x${Math.round(oy)}px overlap` +
            (v.anchored ? `, one side stays put while its container scrolls` : '') +
            (v.measured ? '' : ' [declared, not measured — nothing scrollable here]'),
        })
      }
    }
  }

  // ── occlusion: is each text element the thing painted at its own centre? ──
  //
  // This replaces a bounding-box intersection test. Two boxes intersecting is not evidence
  // that anything is hidden: the app is full of absolutely-positioned wrappers, gradient
  // scrims and full-bleed containers whose boxes legitimately cross a label without ever
  // covering it. That test produced 22 raw hits, nearly all of them noise, which is the
  // worst failure mode a probe can have — it makes the one real finding indistinguishable.
  //
  // `elementFromPoint` asks the renderer the question we actually mean: at this pixel, what
  // is on top? If the answer is not this element (nor a descendant, nor an ancestor standing
  // in for it) then something genuinely covers it.
  //
  // Partitioned by the OCCLUDER's computed position, because the two cases need opposite
  // treatment:
  //   OVERLAY   the occluder sits in a fixed/sticky layer — a modal, a sticky footer, a
  //             toast. Covering the page is its JOB. Logged, never failed.
  //   OCCLUDED  the occluder is in normal flow. Nothing in flow should ever land on top of
  //             text; this is a real layout defect. Failed.
  //
  // KNOWN LIMIT: `pointer-events: none` elements are invisible to hit-testing, so a
  // decorative tooltip that visually covers text will not be reported. That is the correct
  // trade for a probe whose failures must be actionable — it is the interaction question,
  // and it is the one that has a right answer.
  const textEls = all.filter((el) => {
    if (!isVisible(el)) return false
    if (el.children.length) return false // leaf text only, or every ancestor reports too
    const t = (el.textContent || '').trim()
    return t.length > 2
  })
  for (const te of textEls) {
    // First client rect, not the bounding box: a wrapped line's bounding box spans the full
    // column and its centre can fall in the gap between lines, where nothing is painted.
    const r0 = te.getClientRects()[0]
    if (!r0 || r0.width < 4 || r0.height < 4) continue
    // Sample the middle of the part that is actually PAINTED, not of the whole box. A heading
    // half-clipped by the bottom of a scroll panel has its geometric centre exactly on the
    // panel's edge, where the renderer paints whatever comes next — which is how the footer on
    // /people at 1024 was reported as covering a heading whose visible half is uncovered.
    const r = paintedRect(te, r0)
    if (!r) continue
    const x = Math.round(r.left + r.width / 2)
    const y = Math.round(r.top + r.height / 2)
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue
    if (!pointVisible(te, x, y)) continue
    const hit = document.elementFromPoint(x, y)
    if (!hit) continue
    // Descendant: normal. Ancestor: also normal — happens when the leaf itself is
    // pointer-events:none and its parent answers for it.
    if (hit === te || te.contains(hit) || hit.contains(te)) continue

    const v = overlayVerdict(hit)
    out.push({
      kind: v.anchored ? 'OVERLAY' : 'OCCLUDED',
      where: `${describe(hit)} over ${describe(te)}`,
      detail: (v.anchored
        ? `occluder stays put while its container scrolls`
        : `occluder scrolls with the page at (${x},${y})`) +
        (v.measured ? '' : ' [declared, not measured — nothing scrollable here]'),
      text: (te.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    })
  }

  // ── over-tall table rows ──────────────────────────────────────────────────
  // Real table rows only. A `[class*="row"]` match also caught the miqaat cards on /miqaats,
  // which are legitimately 562px tall and are not rows in any meaningful sense.
  for (const row of document.querySelectorAll('tr, [data-row]')) {
    if (!isVisible(row)) continue
    const h = row.getBoundingClientRect().height
    if (h > 120) {
      out.push({
        kind: 'TALL-ROW', where: describe(row), detail: `${Math.round(h)}px tall`,
        text: (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      })
    }
  }

  // ── RTL scroll origin ─────────────────────────────────────────────────────
  if (document.documentElement.dir === 'rtl') {
    for (const el of all) {
      if (!isVisible(el)) continue
      const s = getComputedStyle(el)
      if (s.overflowX !== 'auto' && s.overflowX !== 'scroll') continue
      if (el.scrollWidth <= el.clientWidth + 2) continue
      // At rest in RTL the box must be showing its INLINE-START edge, i.e. the far right of
      // the content. Whatever sign convention the browser uses for scrollLeft, that means
      // the first child's right edge should be at or near the container's right edge.
      const first = el.firstElementChild
      if (!first) continue
      // Subtract the container's OWN inline-start padding: a box with `ps-[16px]` correctly
      // holds its first child 16px in, and flagging that reports the padding as a scroll bug.
      const pad = parseFloat(s.paddingRight) || 0   // inline-start === right in RTL
      const dx = el.getBoundingClientRect().right - first.getBoundingClientRect().right - pad
      if (Math.abs(dx) > 8) {
        out.push({
          kind: 'RTL-SCROLL', where: describe(el),
          detail: `starts ${Math.round(dx)}px from the inline-start edge (scrollLeft ${Math.round(el.scrollLeft)})`,
        })
      }
    }
  }

  return out
}

/**
 * Ask the OS for a port nobody is using.
 *
 * A fixed `--strictPort` was costing more time than the assertions were: an orphaned preview
 * from a previous run — or one still shutting down, or a socket in TIME_WAIT — makes the next
 * run die with `preview exited (1)`, which reads like a build failure and is not one.
 * Binding port 0 lets the kernel hand back something free, so concurrent and back-to-back
 * runs stop colliding.
 */
async function freePort() {
  const { createServer } = await import('node:net')
  return new Promise((ok, fail) => {
    const s = createServer()
    s.on('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
}

async function serve(port) {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('preview did not start')), 60_000)
    const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 800) } }
    proc.stdout.on('data', w); proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`preview exited (${c})`)) })
  })
  return proc
}

const PREVIEW_PORT = await freePort()
const server = await serve(PREVIEW_PORT)
const browser = await chromium.launch()
const findings = []
const failed = []
let visits = 0

try {
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
      })
      await ctx.addInitScript(installProbeDom)
      await ctx.addInitScript(seed(lang))
      const page = await ctx.newPage()
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' }).catch(() => {})

      for (const route of targets) {
        try {
          await page.goto(`http://localhost:${PREVIEW_PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
          await page.evaluate(() => document.fonts?.ready)
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const hits = await page.evaluate(PROBE)
          for (const h of hits) findings.push({ ...h, route, lang, width })
          visits++
        } catch (err) {
          failed.push(`${lang} ${width}px ${route}: ${err.message.split('\n')[0]}`)
        }
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  server.kill()
}

// Kinds that are recorded but must not gate a build. An overlay covering the page is the
// overlay working; failing on it would train everyone to ignore the exit code.
const LOG_ONLY = new Set(['OVERLAY', 'OVERLAP-OVERLAY'])
const failures = findings.filter((f) => !LOG_ONLY.has(f.kind))

const byKind = {}
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify({ visits, findings }, null, 2)}\n`)

if (JSON_OUT) {
  console.log(JSON.stringify({ visits, byKind, findings }, null, 2))
} else {
  console.log(`route visits : ${visits} (${targets.length} routes x ${LANGS.length} langs x ${WIDTHS.length} widths)`)
  console.log(`findings     : ${findings.length} (${failures.length} failing, ${findings.length - failures.length} log-only)`)
  for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${String(n).padStart(4)}${LOG_ONLY.has(k) ? '   (log-only)' : ''}`)
  }

  // Grouped by kind then route so the output reads as a worklist, not a log.
  for (const kind of Object.keys(byKind)) {
    const rows = findings.filter((f) => f.kind === kind)
    const seen = new Map()
    for (const r of rows) {
      const key = `${r.route}|${r.where}`
      if (!seen.has(key)) seen.set(key, { ...r, langs: new Set(), widths: new Set() })
      seen.get(key).langs.add(r.lang)
      seen.get(key).widths.add(r.width)
    }
    console.log(`\n${kind} (${seen.size} distinct):`)
    for (const r of [...seen.values()].slice(0, 25)) {
      console.log(`  ${r.route}  [${[...r.langs].join('/')} @${[...r.widths].join(',')}]`)
      console.log(`      ${r.where} — ${r.detail}${r.text ? `  "${r.text}"` : ''}`)
    }
    if (seen.size > 25) console.log(`  …and ${seen.size - 25} more`)
  }
  if (failed.length) {
    console.error(`\n${failed.length} visit(s) failed:`)
    failed.slice(0, 10).forEach((f) => console.error(`  ${f}`))
  }
  console.log(`\nwrote ${OUT.replace(ROOT, '.')}`)
}

process.exit(failures.length === 0 ? 0 : 1)
