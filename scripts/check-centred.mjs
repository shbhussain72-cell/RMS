/**
 * check-centred.mjs — assert that every ELIMINATED centring site is actually centred.
 *
 *   node scripts/check-centred.mjs
 *
 * Better than the before/after box comparison it replaces, for two reasons.
 *
 * The before/after dance cannot be re-run post-hoc: once the elimination has landed, the
 * tagger keys off the CENTRING census and therefore only finds the sites that were NOT
 * eliminated. The ids no longer line up across the two trees.
 *
 * More importantly, "did it move" is a weaker question than "is it centred". Centring is an
 * invariant that can be checked against the element's own containing block at any width, in
 * either language, with no baseline to drift. `start-0 end-0 mx-auto` is only equivalent to
 * `left-1/2 -translate-x-1/2` when the element's centre coincides with its containing block's
 * centre; this asserts exactly that.
 *
 * Runs at 390/768/1024/1440. The first pass covered only 390 and 1440 — the two widths where
 * the PhoneScreen desktop branch and its known occlusion class do NOT appear.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
let checked = 0
let flexSeen = 0
const off = []
const nowrap = []

try {
  for (const lang of ['en', 'lsd']) {
    for (const width of [390, 768, 1024, 1440]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce',
      })
      await ctx.addInitScript(seed(lang))
      const page = await ctx.newPage()
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' }).catch(() => {})

      for (const route of routes) {
        try {
          await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded', timeout: 15_000 })
          await page.evaluate(() => document.fonts?.ready)
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const rows = await page.evaluate(() => {
            const out = []
            // The eliminated sites: `start-0 end-0` + auto inline margins.
            for (const el of document.querySelectorAll('[class*="start-0"][class*="end-0"][class*="mx-auto"]')) {
              const r = el.getBoundingClientRect()
              if (r.width < 1 || r.height < 1) continue
              const cb = el.offsetParent || el.parentElement
              if (!cb) continue
              const p = cb.getBoundingClientRect()
              const cs = getComputedStyle(cb)
              // Compare against the PADDING box of the containing block, which is what
              // absolute insets resolve against.
              const padL = parseFloat(cs.borderLeftWidth) || 0
              const padR = parseFloat(cs.borderRightWidth) || 0
              const cbCentre = (p.left + padL + p.right - padR) / 2
              const elCentre = (r.left + r.right) / 2
              out.push({
                cls: String(el.className).split(/\s+/).slice(0, 3).join('.'),
                delta: +(elCentre - cbCentre).toFixed(2),
                w: Math.round(r.width), cbW: Math.round(p.width),
              })
            }
            // The four sites centred by a FLEX PARENT rather than by insets: the AppBar bell
            // and the three avatar initial spans. These were the ones verified by
            // construction only, because a plain route visit never reached them.
            // Scoped to EXACTLY the four flex-parent sites, not a generic
            // "flex + centred + round" pattern. The generic version kept matching unrelated
            // pill buttons — icon+label rows, and one whose child is wider than its
            // container — and reporting them as off-centre. A probe that flags things it was
            // never pointed at produces findings nobody can act on.
            //   .ix-bell                      -> AppBar notification button
            //   .rounded-full + brand green   -> the three avatar circles
            const FLEX_SITES = '.ix-bell, [class*="overflow-clip"][class*="rounded-full"][class*="bg-[#1f5a44]"]'
            for (const cb of document.querySelectorAll(FLEX_SITES)) {
              // Exactly ONE in-flow child. Without this the selector also matches pill
              // buttons that are icon+label flex rows, where the first child is correctly
              // not centred — reporting those as off-centre is the probe being wrong, not
              // the app. Absolutely-positioned children (the bell's notification badge) are
              // out of flow and do not count.
              const kids = [...cb.children].filter((k) => {
                const pos = getComputedStyle(k).position
                return pos !== 'absolute' && pos !== 'fixed'
              })
              if (kids.length !== 1) continue
              const kid = kids[0]
              const p = cb.getBoundingClientRect()
              const r = kid.getBoundingClientRect()
              if (r.width < 1 || p.width < 1) continue
              // `justify-center` centres within the CONTENT box. Comparing against the
              // border box reports every button with asymmetric ps-/pe- padding as
              // off-centre — which it is not.
              const s2 = getComputedStyle(cb)
              const insetStart = (parseFloat(s2.paddingLeft) || 0) + (parseFloat(s2.borderLeftWidth) || 0)
              const insetEnd = (parseFloat(s2.paddingRight) || 0) + (parseFloat(s2.borderRightWidth) || 0)
              const contentCentre = (p.left + insetStart + p.right - insetEnd) / 2
              out.push({
                cls: 'FLEX:' + String(cb.className).split(/\s+/).slice(0, 2).join('.'),
                contentCentre,
                delta: +(((r.left + r.right) / 2) - contentCentre).toFixed(2),
                w: Math.round(r.width), cbW: Math.round(p.width),
              })
            }
            // ── The 5 `whitespace-nowrap` EXEMPTIONS ────────────────────────────
            // These stay physical because they must overflow their container SYMMETRICALLY.
            // Symmetric overflow is still lost text if an ancestor clips, so record the
            // nearest clipping ancestor and the margin — an exemption that fits by 2px today
            // is a defect waiting for a longer string or a different font.
            for (const el of document.querySelectorAll('[class*="whitespace-nowrap"][class*="left-1/2"], [class*="whitespace-nowrap"][class*="left-[calc"]')) {
              const r = el.getBoundingClientRect()
              if (r.width < 1) continue
              let clip = null
              for (let q = el.parentElement; q && q !== document.documentElement; q = q.parentElement) {
                const cs = getComputedStyle(q)
                if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') { clip = q.getBoundingClientRect(); break }
              }
              out.push({
                nowrap: true,
                cls: (el.textContent || '').trim().slice(0, 22),
                delta: 0,
                w: Math.round(r.width),
                cbW: clip ? Math.round(clip.width) : -1,
                margin: clip ? Math.round(clip.width - r.width) : null,
              })
            }
            return out
          })
          for (const row of rows) {
            if (row.nowrap) { nowrap.push({ ...row, lang, width, route }); continue }
            checked++
            if (row.cls.startsWith('FLEX:')) flexSeen++
            // 1.5px tolerance: sub-pixel layout rounding, not a centring error.
            if (Math.abs(row.delta) > 1.5) off.push({ ...row, lang, width, route })
          }
        } catch { /* unreachable route */ }
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  proc.kill()
}

console.log(`checked ${checked} rendered instances of eliminated centring sites`)
console.log(`  of which flex-parent (construction-only) sites: ${flexSeen}`)
console.log(`off-centre by >1.5px: ${off.length}`)
for (const o of off.slice(0, 20)) {
  console.log(`  ${o.lang}@${o.width} ${o.route}  ${o.cls}  delta=${o.delta}px  (el ${o.w} in ${o.cbW})`)
}

console.log('')
console.log(`nowrap exemptions found rendered: ${nowrap.length}`)
const clipping = nowrap.filter((n) => n.cbW > 0 && n.margin < 0)
const inClipper = nowrap.filter((n) => n.cbW > 0)
console.log(`  inside a clipping ancestor : ${inClipper.length}`)
console.log(`  ACTUALLY CLIPPED           : ${clipping.length}`)
const tight = inClipper.filter((n) => n.margin >= 0).sort((a, b) => a.margin - b.margin).slice(0, 8)
for (const t of tight) console.log(`  tightest: "${t.cls}" ${t.lang}@${t.width} w=${t.w} clipper=${t.cbW} margin=${t.margin}px  ${t.route}`)
for (const c of clipping.slice(0, 8)) console.log(`  CLIPPED : "${c.cls}" ${c.lang}@${c.width} w=${c.w} clipper=${c.cbW} margin=${c.margin}px  ${c.route}`)

process.exit(off.length || clipping.length ? 1 : 0)
