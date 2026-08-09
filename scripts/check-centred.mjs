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
import { readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_WIDTHS } from './widths.mjs'
import { createArrival } from './arrival.mjs'

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
const failedVisits = []
const NL = '\n'

// `checked` counts INSTANCES — the same element once per visit — so it looked like coverage
// while every visit sat on the login page and matched the one centred box there. Distinct sites
// are what coverage means, and they are tracked separately below.
const LANGS = ['en', 'lsd']
const arrival = createArrival({ expected: routes.length * CANONICAL_WIDTHS.length * LANGS.length })

/**
 * ── THE DISTINCT-SITE FLOOR ──────────────────────────────────────────────────────────
 *
 * What the SOURCE declares, so the sweep can be asked whether it reached all of it.
 *
 * This suite used to report "checked N rendered instances", which counts the same element once
 * per visit — 100 of them while every visit sat on the login page matching the one centred box
 * there. Instances are not coverage. A site is a distinct class string; reaching it once is
 * coverage of that site, and never reaching it is a gap that has to be named rather than
 * absorbed into a large-looking total.
 *
 * Parsed from className VALUES, not lines, for the reason centring-census.cjs gives: a comment
 * naming the idiom is not a site. Class strings are normalised the same way the probe
 * normalises rendered ones — split, filter, sort — so the two sides are comparable. Dynamic
 * classNames (template literals with conditionals) will not match; a site the sweep reaches but
 * the source scan did not declare is fine and is not reported. The floor only runs one way.
 */
const norm = (v) => v.split(/\s+/).filter(Boolean).sort().join(' ')

function declaredSites() {
  const out = new Map()
  const SRC = resolve(ROOT, 'src')
  for (const rel of readdirSync(SRC, { recursive: true })) {
    if (!/\.tsx$/.test(String(rel))) continue
    const file = `src/${String(rel).split('\\').join('/')}`
    const text = readFileSync(resolve(SRC, String(rel)), 'utf8')
    for (const m of text.matchAll(/className="([^"]*)"/g)) {
      const v = m[1]
      const isInset = v.includes('start-0') && v.includes('end-0') && v.includes('mx-auto')
      const isFlex = v.includes('ix-bell')
        || (v.includes('overflow-clip') && v.includes('rounded-full') && v.includes('bg-[#1f5a44]'))
      if (!isInset && !isFlex) continue
      const key = (isFlex ? 'FLEX:' : '') + norm(v)
      if (!out.has(key)) out.set(key, [])
      out.get(key).push(file)
    }
  }
  return out
}

/**
 * Sites a plain route visit cannot reach, each with the reason and what would change it.
 *
 * An entry here is a DECLARATION that the site is untested, not a dismissal of it. The point of
 * the floor is that "never rendered" and "correct" stop being indistinguishable — so an
 * unreached site is either listed here with a reason somebody can argue with, or it fails.
 */
const UNREACHABLE = new Map([
  ['fixed bottom-[16px] start-0 end-0 mx-auto w-fit rounded-full bg-[#1f5a44] px-[14px] py-[6px] text-[12px] font-bold text-white shadow-[0_10px_30px_-8px_rgba(21,64,47,0.5)]',
    'RemarksLayer — only rendered in remark mode (Ctrl+Shift+M), which no route visit enters'],
  ['fixed bottom-[40px] start-0 end-0 z-[80] mx-auto flex w-fit items-center gap-[8px] rounded-full bg-[#1f5a44] px-[18px] py-[11px] shadow-[0_10px_30px_-8px_rgba(21,64,47,0.5)]',
    'the toast in Notifications/NotificationPanel — transient, shown in response to an action'],
  ['FLEX:relative flex shrink-0 items-center justify-center overflow-clip rounded-full bg-[#1f5a44]',
    'the Avatar in InvitedMembers and InvitePopups. InvitedMembersCards/Table DO render on '
    + '/review and /invite, but only with a non-empty invite list, which this suite does not '
    + 'seed; the InvitePopups copy is a popup and needs an interaction. Both are duplicates of '
    + 'the same component and collapsing them is the real fix — one component is one site.'],
])

/** Full normalised class string -> the matrix cells that rendered it. One key per SITE. */
const insetSites = new Map()
const flexSites = new Map()
/** Sites the selector matched but the probe could not measure. Reported, never silent. */
const unmeasurable = []
const note = (map, key, at) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(at) }
const off = []
const nowrap = []

try {
  for (const lang of LANGS) {
    for (const width of CANONICAL_WIDTHS) {
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
          // "0 off-centre" is true of a page with nothing on it. See scripts/arrival.mjs.
          if (!await arrival.visit(page, route, `${lang}@${width}`)) continue
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
                // The full class string, order-normalised: a stable identity for the SITE, as
                // opposed to `cls`, which truncates to three classes and collides.
                site: String(el.className).split(/\s+/).filter(Boolean).sort().join(' '),
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
              // An out-of-flow child is still a centred child. The filter below exists to
              // reject icon+label pill rows, where the FIRST of several children is correctly
              // not centred — it was never meant to reject a container whose single child
              // happens to be positioned. The Review screen's avatar is exactly that: one
              // absolutely-positioned span centred by `left-1/2 -translate-x-1/2`, the physical
              // idiom, which is the case most worth measuring and the one that was being
              // dropped. Whatever centres it, the assertion is the same: is the child's centre
              // the container's centre.
              const kids = cb.children.length === 1
                ? [cb.children[0]]
                : [...cb.children].filter((k) => {
                  const pos = getComputedStyle(k).position
                  return pos !== 'absolute' && pos !== 'fixed'
                })
              // A MATCH THAT CANNOT BE MEASURED IS REPORTED, NEVER SKIPPED.
              //
              // This used to `continue`, and a site vanished through it in silence: the Review
              // screen's avatar has exactly one child and that child is `position: absolute`, so
              // the filter emptied the list and the site disappeared from a suite that was
              // counting it as covered. It is also the only avatar centred by the physical
              // `left-1/2 -translate-x-1/2` idiom, which is precisely the thing most worth
              // measuring. Skipping is how the selector's own targets stop being its subjects.
              if (kids.length !== 1) {
                out.push({
                  unmeasurable: true,
                  cls: 'FLEX:' + String(cb.className).split(/\s+/).slice(0, 2).join('.'),
                  site: 'FLEX:' + String(cb.className).split(/\s+/).filter(Boolean).sort().join(' '),
                  why: `${kids.length} in-flow child(ren) of ${cb.children.length} — this probe measures a single centred child`,
                  delta: 0, w: 0, cbW: 0,
                })
                continue
              }
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
                site: 'FLEX:' + String(cb.className).split(/\s+/).filter(Boolean).sort().join(' '),
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
            if (row.unmeasurable) {
              note(flexSites, row.site, `${lang}@${width}`)
              unmeasurable.push({ ...row, lang, width, route })
              continue
            }
            checked++
            if (row.cls.startsWith('FLEX:')) { flexSeen++; note(flexSites, row.site, `${lang}@${width}`) }
            else note(insetSites, row.site, `${lang}@${width}`)
            // 1.5px tolerance: sub-pixel layout rounding, not a centring error.
            if (Math.abs(row.delta) > 1.5) off.push({ ...row, lang, width, route })
          }
        } catch (err) {
          failedVisits.push(`${lang}@${width} ${route}: ${err.message.split(NL)[0]}`)
        }
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  proc.kill()
}

// INSTANCES first, because that is the number this suite used to report on its own — and it
// read as coverage while every visit was on the login page matching the one centred box there.
console.log(`checked ${checked} rendered instances of eliminated centring sites`)
console.log(`  of which flex-parent (construction-only) sites: ${flexSeen}`)
const cells = routes.length && CANONICAL_WIDTHS.length * LANGS.length
console.log(`DISTINCT inset sites reached : ${insetSites.size}`)
for (const [site, at] of [...insetSites].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`   ${String(at.size).padStart(2)}/${cells} cells  ${site.slice(0, 96)}`)
}
console.log(`DISTINCT flex sites reached  : ${flexSites.size}`)
for (const [site, at] of [...flexSites].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`   ${String(at.size).padStart(2)}/${cells} cells  ${site.slice(0, 96)}`)
}
// Sites the selector claimed and the probe could not measure. Grouped, because the same site
// reappears in every matrix cell and a per-visit list would bury the count.
const unmeasurableSites = new Map()
for (const u of unmeasurable) {
  if (!unmeasurableSites.has(u.site)) unmeasurableSites.set(u.site, { why: u.why, at: new Set(), routes: new Set() })
  unmeasurableSites.get(u.site).at.add(`${u.lang}@${u.width}`)
  unmeasurableSites.get(u.site).routes.add(u.route)
}
console.log(`UNMEASURABLE flex matches   : ${unmeasurableSites.size}`)
for (const [site, u] of unmeasurableSites) {
  console.log(`   ${u.at.size}/${cells} cells, ${u.routes.size} route(s)  ${u.why}`)
  console.log(`      ${site.slice(0, 96)}`)
}
// The floor: every site the source declares was either reached, or is declared unreachable.
const declared = declaredSites()
const reached = new Set([...insetSites.keys(), ...flexSites.keys()])
const siteProblems = []
console.log(`
source declares ${declared.size} distinct centring site(s)`)
for (const [site, files] of declared) {
  if (reached.has(site)) { console.log(`  ok    reached  ${files[0]}`); continue }
  const bare = site.replace(/^FLEX:/, '')
  const why = UNREACHABLE.get(site) ?? [...UNREACHABLE].find(([k]) => norm(k.replace(/^FLEX:/, '')) === bare)?.[1]
  if (why) console.log(`  --    declared unreachable: ${why}`)
  else siteProblems.push(`${files.join(', ')} declares a centring site the sweep never reached, and it is not declared unreachable: ${site.slice(0, 90)}`)
}
for (const p of siteProblems) console.error(`  FAIL  ${p}`)
for (const f of failedVisits) console.error(`  FAIL  visit threw — ${f}`)
const arrivalProblems = arrival.verify()
for (const p of arrivalProblems) console.error(`  FAIL  ${p}`)
console.log(`arrived at ${arrival.arrived}/${routes.length * CANONICAL_WIDTHS.length * LANGS.length} matrix visits`)
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

process.exit(off.length || clipping.length || arrivalProblems.length || failedVisits.length || siteProblems.length ? 1 : 0)
