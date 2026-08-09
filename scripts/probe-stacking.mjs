/**
 * probe-stacking.mjs — confirm the stacking-context mechanism, and settle items 3 and 6.
 *
 *   node scripts/probe-stacking.mjs
 *
 * Visits routes in the SAME sorted order as check-layout.mjs, in one context, because several
 * screens (notably /success) only render their real content once earlier routes have put the
 * persisted flow store into the right state. A direct `goto('/success')` redirects, which is
 * how an earlier isolation attempt produced a misleading "0 findings".
 *
 * Reports three things:
 *
 *   A. STACKING — computed `transform` and `z-index` for every element still carrying a
 *      centring translate, plus what `elementFromPoint` returns at the Success heading. A
 *      transform other than `none` creates a stacking context (CSS Transforms §3); removing
 *      it removes the context and can change paint and hit-test order while leaving geometry
 *      identical. That is the hypothesis for the 8 OVERLAY findings.
 *
 *   C. NOWRAP EXEMPTIONS — for each `whitespace-nowrap` centring exemption, whether any
 *      ancestor clips on the inline axis. Symmetric overflow is still lost text if something
 *      above it has `overflow: hidden`.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'
import { installProbeDom } from './probe-dom.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIQAAT = 'ashara-1448'

const routes = [...new Set(
  [...readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1]),
)].filter((p) => p !== '*' && p !== '/').map((p) => p.replace(/:id/g, MIQAAT)).sort()

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

const freePort = () => new Promise((ok) => {
  const s = createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
})

const port = await freePort()
const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('preview did not start')), 90_000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1000) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w)
  proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`preview exited (${c})`)) })
})

const browser = await chromium.launch()

for (const lang of ['en', 'lsd']) {
  for (const width of NARROW_WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
    })
    await ctx.addInitScript(installProbeDom)
    await ctx.addInitScript(seed(lang))
    const page = await ctx.newPage()

    // Walk every route in order so the persisted store reaches the state /success needs.
    for (const r of routes) {
      try {
        await page.goto(`http://localhost:${port}${r}`, { waitUntil: 'domcontentloaded', timeout: 15_000 })
        await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))))
      } catch { /* keep walking */ }
    }

    // ── A. Success stacking ───────────────────────────────────────────────────
    await page.goto(`http://localhost:${port}/miqaats/${MIQAAT}/success`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))))
    const stacking = await page.evaluate(() => {
      const out = { onSuccess: location.pathname.includes('success'), items: [], heading: null }
      for (const el of document.querySelectorAll('[class*="translate-x-1/2"], [class*="left-1/2"], [class*="start-0"]')) {
        const cs = getComputedStyle(el)
        if (cs.transform === 'none' && !/left-1\/2/.test(el.className)) continue
        out.items.push({
          cls: String(el.className).slice(0, 60),
          transform: cs.transform === 'none' ? 'none' : 'SET',
          zIndex: cs.zIndex, position: cs.position,
        })
      }
      // The reported victim: a leaf with leading-[32px] (en) or a <bdi> (lsd).
      const victim = [...document.querySelectorAll('span,bdi')]
        .find((e) => !e.children.length && (e.textContent || '').trim().length > 3
          && /leading-\[32px\]/.test(String(e.className)))
        || [...document.querySelectorAll('bdi')].find((e) => (e.textContent || '').trim().length > 3)
      if (victim) {
        const r = victim.getClientRects()[0]
        if (r) {
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          // The point comes from the victim's OWN rect, so it may be a stale one: an element
          // clipped out of a scroller still reports a box, and hit-testing it returns whatever
          // legitimately occupies that space. Without this gate the probe reports a stacking
          // fault for text that is simply not on screen.
          const painted = window.__probe.pointVisible(victim, x, y)
          const hit = painted ? document.elementFromPoint(x, y) : null
          out.heading = {
            text: (victim.textContent || '').trim().slice(0, 28),
            painted,
            hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(/\s+/).slice(0, 2).join('.')}` : (painted ? 'null' : 'not painted at its own rect'),
            isSelfOrKin: !painted || (!!hit && (hit === victim || victim.contains(hit) || hit.contains(victim))),
          }
        }
      }
      return out
    })

    console.log(`\n═══ ${lang} @${width} ═══`)
    console.log('  SUCCESS reached:', stacking.onSuccess, ' heading:', JSON.stringify(stacking.heading))
    const noTransform = stacking.items.filter((i) => i.transform === 'none')
    console.log(`  centring-ish elements: ${stacking.items.length}, of which transform:none = ${noTransform.length}`)

    // ── C. nowrap exemptions: any clipping ancestor? ──────────────────────────
    const clipped = await page.evaluate(() => {
      const out = []
      // Count what was FOUND as well as what clipped. "0 clipped" out of 0 found is a
      // vacuous pass — the same failure the dist/ grep's control string exists to prevent.
      const found = document.querySelectorAll('[class*="whitespace-nowrap"][class*="left-1/2"], [class*="whitespace-nowrap"][class*="left-[calc"]')
      out.found = found.length
      for (const el of found) {
        const r = el.getBoundingClientRect()
        let clipper = null
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p)
          if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') {
            const pr = p.getBoundingClientRect()
            if (r.left < pr.left - 1 || r.right > pr.right + 1) {
              clipper = `${p.tagName.toLowerCase()}.${String(p.className).split(/\s+/).slice(0, 2).join('.')} (${Math.round(pr.left)}..${Math.round(pr.right)})`
            }
            break
          }
        }
        // Record the MARGIN even when not clipping: an exemption that fits by 2px today is
        // a defect waiting for a longer string or a different font, and "does not clip" would
        // hide that.
        const near = nearestClip(el)
        out.push({
          text: (el.textContent || '').trim().slice(0, 26),
          w: Math.round(r.width),
          clipperW: near ? Math.round(near.w) : null,
          margin: near ? Math.round(near.w - r.width) : null,
          clipping: !!clipper,
        })
      }
      function nearestClip(el) {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p)
          if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') {
            const pr = p.getBoundingClientRect()
            return { w: pr.width }
          }
        }
        return null
      }
      return out
    })
    console.log(`  nowrap exemptions found: ${clipped.found}, clipping now: ${clipped.filter((c) => c.clipping).length}`)
    clipped.forEach((c) => console.log(`     "${c.text}" w=${c.w} clipper=${c.clipperW ?? 'none'} margin=${c.margin ?? '-'}${c.clipping ? '  CLIPPING' : ''}`))

    await ctx.close()
  }
}

await browser.close()
proc.kill()
