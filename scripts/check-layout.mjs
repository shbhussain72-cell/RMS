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
 * OVERLAP      two interactive elements whose boxes intersect. One of them is unclickable,
 *              and which one depends on paint order, so this is always a bug even when it
 *              looks fine in a screenshot.
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

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PORT = 4322
const MIQAAT_ID = 'ashara-1448'
const OUT = resolve(ROOT, 'artifacts/audit/layout.json')

const argv = process.argv.slice(2)
const flag = (name) => argv.filter((a, i) => argv[i - 1] === `--${name}`)
const JSON_OUT = argv.includes('--json')
const WIDTHS = flag('width').length ? flag('width').map(Number) : [390, 768, 1024, 1440]
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

/** Runs in the page. Self-contained — stringified across the boundary. */
const PROBE = () => {
  const out = []
  const isVisible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }
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
        out.push({
          kind: 'OVERLAP', where: `${describe(a)} ∩ ${describe(b)}`,
          detail: `${Math.round(ox)}x${Math.round(oy)}px overlap`,
        })
      }
    }
  }

  // ── an interactive element covering readable text ─────────────────────────
  // Distinct from the button-on-button check above: a button sitting on top of a LABEL hides
  // information rather than a control, so neither element is interactive-on-interactive and
  // the earlier pass cannot see it. This is the "Request all covers Host city / Colombo" case.
  const textEls = all.filter((el) => {
    if (!isVisible(el)) return false
    if (el.children.length) return false // leaf text only, or every ancestor reports too
    const t = (el.textContent || '').trim()
    return t.length > 2 && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
  })
  for (const btn of interactive) {
    const rb = btn.getBoundingClientRect()
    for (const te of textEls) {
      if (btn.contains(te) || te.contains(btn)) continue
      const rt = te.getBoundingClientRect()
      const ox = Math.min(rb.right, rt.right) - Math.max(rb.left, rt.left)
      const oy = Math.min(rb.bottom, rt.bottom) - Math.max(rb.top, rt.top)
      // Require a substantial overlap of the TEXT box: a 2px kiss is antialiasing, but half
      // the label covered means the user cannot read it.
      if (ox > 6 && oy > 6 && ox * oy > rt.width * rt.height * 0.4) {
        out.push({
          kind: 'COVERS-TEXT', where: `${describe(btn)} over ${describe(te)}`,
          detail: `${Math.round(ox)}x${Math.round(oy)}px`,
          text: (te.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        })
      }
    }
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

async function serve() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('preview did not start')), 60_000)
    const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 800) } }
    proc.stdout.on('data', w); proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`preview exited (${c})`)) })
  })
  return proc
}

const server = await serve()
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
      await ctx.addInitScript(seed(lang))
      const page = await ctx.newPage()
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' }).catch(() => {})

      for (const route of targets) {
        try {
          await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
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

const byKind = {}
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify({ visits, findings }, null, 2)}\n`)

if (JSON_OUT) {
  console.log(JSON.stringify({ visits, byKind, findings }, null, 2))
} else {
  console.log(`route visits : ${visits} (${targets.length} routes x ${LANGS.length} langs x ${WIDTHS.length} widths)`)
  console.log(`findings     : ${findings.length}`)
  for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${n}`)

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

process.exit(findings.length === 0 ? 0 : 1)
