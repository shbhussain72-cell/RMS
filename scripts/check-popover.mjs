/**
 * check-popover.mjs — a popover's own interactive children must receive their click.
 *
 * ── THE DEFECT THIS WAS WRITTEN FOR ──────────────────────────────────────────────────
 *
 * Logout, in the account dropdown, did nothing. The menu closed as if you had clicked outside
 * it. Measured rather than guessed — the event sequence a real mouse produced was:
 *
 *     pointerdown  -> BUTTON (the Logout button)
 *     mousedown    -> BUTTON (the Logout button)
 *     mouseup      -> DIV    (page content, where the panel had been)
 *     click        -> never fired
 *
 * A `click` is only dispatched when mousedown and mouseup share a target. `AppBar` had a
 * `document` mousedown listener that closed the dropdown whenever the event target was outside
 * `dropdownRef` — and `Popover` portals its panel to `document.body`, so the panel is never
 * inside the trigger's subtree. Every click on the panel was an "outside click": the panel
 * unmounted between mousedown and mouseup, and the button never got a click at all.
 *
 * The hit-testing was fine, which is why this was invisible to every existing suite.
 * `elementFromPoint` at the Logout button returned the Logout button; `check-anchor` measured
 * the panel in exactly the right place. It was placed correctly and could not be used.
 *
 * ── WHY THE CLICK MUST COME FROM THE MOUSE ───────────────────────────────────────────
 *
 * `element.click()` dispatches a click directly on the element. It never produces a mousedown,
 * so nothing closes the panel, so the handler runs and the assertion passes — on the broken
 * build. Every assertion here goes through `page.mouse.click()` at the child's real coordinates
 * for that reason, and this is the whole reason the suite exists rather than a unit test.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────────────
 *
 * Per consumer: open the popover through its real trigger, mark the first enabled interactive
 * child, click it with the mouse, and require a `click` event whose path contains that child.
 * On failure the mousedown/mouseup targets are printed, because their disagreement is the
 * signature of the whole class of defect and it names the cause rather than the symptom.
 *
 * And then the other half, on every consumer: a click OUTSIDE the panel still closes it. The fix
 * for the defect above was to delete a close-on-outside-click handler, so an assertion that only
 * covered the inside would be satisfied by a panel that never closes at all — which is the same
 * bug with the sign flipped, and the reason both are here rather than only the one that was
 * reported.
 *
 * ── COVERAGE, AND THE TWO CONSUMERS THIS CANNOT REACH ────────────────────────────────
 *
 * The consumer list is read out of the SOURCE at run time — every `<Popover` in `src/` — and
 * compared against the table below. A new consumer therefore fails this check until somebody
 * either writes it a recipe or writes down why it has none. That is the point: a suite whose
 * subject list is typed by hand silently stops covering whatever was added after it.
 *
 * Two of the six are declared unreachable, with the reason on each. They are not skipped
 * quietly — the count is asserted, so deleting a recipe to quieten a failure shows up here.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { installProbeDom } from './probe-dom.mjs'
import { NARROW_WIDTHS } from './widths.mjs'
import { createCoverage } from './coverage-floor.mjs'

const LANGS = ['en', 'lsd']
/** Below this the AppBar renders its mobile cluster and the chip/bell do not exist. */
const DESKTOP_MIN = 640

let fails = 0
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`) }

// ── the consumer table ───────────────────────────────────────────────────────────────
//
// `open` is a selector for the chrome popovers, whose triggers are stable and which are the two
// under suspicion. The screen popovers use `discover`, which clicks visible buttons in DOM order
// until one opens a panel: their triggers are per-row controls with no stable hook, and matching
// them by label breaks in LSD where the label is Arabic.
const CONSUMERS = [
  {
    id: 'AppBar account dropdown',
    file: 'src/components/figma/AppBar.tsx',
    route: '/miqaats',
    open: '.ix-chip button:last-of-type',
    desktopOnly: true,
  },
  {
    id: 'AppBar notification bell',
    file: 'src/components/figma/NotificationPanel.tsx',
    route: '/miqaats',
    open: '.ix-bell',
    desktopOnly: true,
  },
  {
    id: 'ArrangeCities city picker',
    file: 'src/screens/ArrangeCities.tsx',
    route: '/miqaats/ashara-1448/arrange',
    discover: true,
  },
  {
    id: 'Araz relay city picker',
    file: 'src/screens/Araz.tsx',
    route: '/miqaats/ashara-1448/araz',
    discover: true,
  },
  {
    id: 'CitySelection zone-move dropdown',
    file: 'src/screens/CitySelection.tsx',
    unreachable:
      'the per-row zone picker lives in the allocation table, which renders only after a group '
      + 'has been registered AND allocated a city. Driven from a cold start, no miqaat in seed.ts '
      + 'reaches that state on any route — measured across 6 miqaats x 5 routes.',
  },
  {
    id: 'CitySelection relay-city dropdown',
    file: 'src/screens/CitySelection.tsx',
    unreachable: 'same table, same gate as the zone-move dropdown above.',
  },
]

// ── 1. the table must still describe the code ────────────────────────────────────────
const srcFiles = []
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tsx')) srcFiles.push(p.replace(/\\/g, '/'))
  }
}
walk('src')

const inSource = {}
for (const f of srcFiles) {
  if (f.endsWith('src/components/Popover.tsx')) continue        // the primitive itself
  const n = (readFileSync(f, 'utf8').match(/<Popover[\s>]/g) || []).length
  if (n) inSource[f] = n
}
const declared = {}
for (const c of CONSUMERS) declared[c.file] = (declared[c.file] ?? 0) + 1

console.log('\nconsumers')
const files = [...new Set([...Object.keys(inSource), ...Object.keys(declared)])].sort()
for (const f of files) {
  say((inSource[f] ?? 0) === (declared[f] ?? 0),
    `${f}: ${inSource[f] ?? 0} <Popover> in source, ${declared[f] ?? 0} declared here`)
}
const unreachable = CONSUMERS.filter((c) => c.unreachable)
say(unreachable.length === 2,
  `${unreachable.length} consumer(s) declared unreachable, 2 expected — a third means one was quietly dropped`)
for (const c of unreachable) console.log(`  note  ${c.id}: not driven — ${c.unreachable}`)

// ── the harness ──────────────────────────────────────────────────────────────────────
const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('preview did not start')), 60_000)
  const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 800) } }
  proc.stdout.on('data', w); proc.stderr.on('data', w)
})

const TOUR = ['list','city','zone','people','review','araz','manage','timeline','invite','success','detail','host','relay','questionnaire']
const seed = (lang) => `try{localStorage.setItem('rms-lang',${JSON.stringify(lang)});const prev=JSON.parse(localStorage.getItem('miqaat-flow')||'{}');localStorage.setItem('miqaat-flow',JSON.stringify({...prev,state:{...(prev.state||{}),loggedIn:true},version:prev.version??0}));localStorage.setItem('rms-tour-seen',JSON.stringify(${JSON.stringify(TOUR)}))}catch{}`

const reachable = CONSUMERS.filter((c) => !c.unreachable)
const cov = createCoverage(Object.fromEntries(reachable.map((c) => [
  c.id,
  (c.desktopOnly ? NARROW_WIDTHS.filter((w) => w >= DESKTOP_MIN) : NARROW_WIDTHS).length * LANGS.length,
])))

const browser = await chromium.launch()

for (const width of NARROW_WIDTHS) {
for (const lang of LANGS) {
  for (const c of reachable) {
    const label = `${c.id} @${width} ${lang}`
    if (c.desktopOnly && width < DESKTOP_MIN) { cov.skip(c.id, `desktop chrome, absent at ${width} (${lang})`); continue }

    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
    await ctx.addInitScript(installProbeDom)
    await ctx.addInitScript(seed(lang))
    const page = await ctx.newPage()
    await page.goto(`http://localhost:${port}${c.route}`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await page.waitForTimeout(500)   // sleep: route mount + the panel's own open transition, neither of which fires an event

    // Open it. `element.click()` is correct HERE — opening is not what is under test, and the
    // trigger is not inside the panel whose behaviour is.
    let via = ''
    if (c.open) {
      via = await page.evaluate((sel) => {
        const t = document.querySelector(sel)
        if (!t) return ''
        const r = t.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) return ''
        t.click()
        return sel
      }, c.open)
    } else {
      // Try visible buttons in DOM order, skipping the AppBar chrome (it has its own entries)
      // and anything already inside a panel.
      //
      // ONE CLICK PER STEP, from here rather than inside a single evaluate, because some of
      // those candidates NAVIGATE — "Go back" sits at index 12 on both these routes. A loop
      // that stays in one evaluate follows the first navigation off the route and then reports
      // that nothing on it opens a panel, which is what the first version of this check did:
      // four cases skipped, coverage floor red, and the reason nothing to do with popovers.
      const count = await page.evaluate(() => document.querySelectorAll('button').length)
      for (let i = 0; i < count && !via; i++) {
        const clicked = await page.evaluate((i) => {
          const b = [...document.querySelectorAll('button')][i]
          if (!b) return null
          const r = b.getBoundingClientRect()
          if (r.width < 5 || r.height < 5) return null
          if (b.closest('.ix-bell') || b.closest('.ix-chip') || b.closest('[data-popover]')) return null
          const cls = (typeof b.className === 'string' ? b.className : '').split(/\s+/).slice(0, 3).join('.')
          b.click()
          return `button.${cls}`
        }, i)
        if (!clicked) continue
        await page.waitForTimeout(170)   // sleep: the panel mounts, measures hidden, then places
        if (await page.evaluate(() => !!document.querySelector('[data-popover]'))) { via = clicked; break }
        // A candidate that opened something ELSE has to be undone before the next one, or the
        // popover eventually opens UNDERNEATH it. On /araz a bottom sheet — `fixed inset-0
        // z-[110]`, above the panel's z-100, with a full-bleed Close scrim — stayed open from an
        // earlier candidate, and every click on the panel hit the scrim. That reads exactly like
        // the defect this suite is for, and is not it: the panel was covered, not swallowed.
        const dirty = await page.evaluate((route) =>
          location.pathname !== route || !!document.querySelector('[data-name="BottomSheet"]'), c.route)
        if (dirty) {
          await page.goto(`http://localhost:${port}${c.route}`, { waitUntil: 'domcontentloaded' })
          await page.waitForTimeout(450)   // sleep: a full route remount after the reload, which has no single settled event
        }
      }
    }
    if (!via) { cov.skip(c.id, `no trigger opened a panel at ${width}/${lang}`); await ctx.close(); continue }
    await page.waitForTimeout(250)   // sleep: Popover measures hidden for one layout pass, then places

    // Mark the child to be clicked. A list row is preferred over the search input — it is the
    // control a user is actually reaching for, and the input would still focus under a defect
    // that swallows clicks.
    const target = await page.evaluate(() => {
      const panel = document.querySelector('[data-popover]')
      if (!panel) return null
      const kids = [...panel.querySelectorAll('button:not([disabled]), a[href], input')]
      const pick = kids.find((k) => k.tagName === 'BUTTON') || kids[0]
      if (!pick) return null
      pick.setAttribute('data-popover-child', '1')
      const r = pick.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      // GATED, because the point comes from the element's own rect. These list rows live in a
      // `max-h-[240px] overflow-y-auto` column: a row scrolled out of that clipper is painted
      // nowhere, and asking the renderer what is at its rect returns whatever legitimately
      // occupies that space — a covering report about an element that is not on screen.
      const painted = window.__probe.pointVisible(pick, cx, cy)
      const top = painted ? document.elementFromPoint(cx, cy) : null
      return {
        painted,
        n: kids.length,
        tag: pick.tagName,
        w: Math.round(r.width),
        h: Math.round(r.height),
        // Who would a click at this point actually reach? Asked BEFORE clicking, because
        // "something is on top of the panel" and "the panel's click is swallowed" are different
        // faults with the same symptom, and a click that never lands cannot tell them apart.
        onTop: !painted ? 'nothing — the point is clipped out of a scrolling ancestor'
          : top && top.closest('[data-popover-child]') ? 'the child'
          : top && top.closest('[data-popover]') ? 'the panel'
          : top ? `${top.tagName}${top.getAttribute('aria-label') ? `[${top.getAttribute('aria-label')}]` : ''} in ${top.closest('[data-name]')?.getAttribute('data-name') || 'the page'}`
          : 'nothing',
      }
    })
    if (!target || target.w < 4 || target.h < 4) {
      say(false, `${label}: the panel opened with no interactive child to click`)
      cov.ran(c.id); await ctx.close(); continue
    }

    say(target.onTop === 'the child',
      `${label}: nothing covers the panel's ${target.tag.toLowerCase()}`
      + (target.onTop === 'the child' ? '' : ` — a click at its centre would reach ${target.onTop}`))

    await page.evaluate(() => {
      window.__pc = { down: null, up: null, click: null, hitChild: false }
      const name = (e) => {
        const t = e.target
        return `${t.tagName}${t.closest && t.closest('[data-popover-child]') ? '[the child]' : t.closest && t.closest('[data-popover]') ? '[in panel]' : '[elsewhere]'}`
      }
      document.addEventListener('mousedown', (e) => { window.__pc.down = name(e) }, true)
      document.addEventListener('mouseup', (e) => { window.__pc.up = name(e) }, true)
      document.addEventListener('click', (e) => {
        window.__pc.click = name(e)
        if (e.target.closest && e.target.closest('[data-popover-child]')) window.__pc.hitChild = true
      }, true)
    })

    // THE CLICK. Real pointer input — see the header — but aimed through a locator rather than
    // at coordinates read a moment earlier.
    //
    // Coordinates were the first version and they produced a false finding on /araz: opening a
    // relay row expands that section on a CSS transition, the anchor moves, `Popover` re-places,
    // and the click landed on whatever had slid under the stale point. The signature said so —
    // `click=BUTTON[elsewhere]`, a click that DID fire, where a swallowed one never fires at all.
    // A locator waits for the box to stop moving before it dispatches, so what is measured is
    // the app's behaviour rather than the suite's timing.
    let clickErr = ''
    try { await page.locator('[data-popover-child]').click({ timeout: 5000 }) }
    catch (err) { clickErr = err instanceof Error ? err.message.split('\n')[0] : String(err) }
    await page.waitForTimeout(300)   // sleep: the assertion is that NO click arrived, so waiting for one would beg the question

    const r = await page.evaluate(() => window.__pc)
    cov.ran(c.id)
    say(r.hitChild,
      `${label}: the ${target.tag.toLowerCase()} in the panel receives its click`
      + ` (${target.n} interactive children, opened via ${via})`
      + (r.hitChild ? '' : ` — down=${r.down} up=${r.up} click=${r.click ?? 'NEVER FIRED'}${clickErr ? `; ${clickErr}` : ''}`))

    // ── and the panel still closes on a click outside it ──
    //
    // Reopened rather than reused: the click above may legitimately have closed the panel (a
    // city row selects and dismisses), so testing the outside click on whatever is left would
    // be testing nothing on half the consumers.
    await page.goto(`http://localhost:${port}${c.route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(450)   // sleep: route remount before the trigger search; no settled event to await
    let reopened = ''
    if (c.open) {
      reopened = await page.evaluate((sel) => {
        const t = document.querySelector(sel)
        if (!t) return ''
        const r = t.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) return ''
        t.click(); return sel
      }, c.open)
    } else {
      const count2 = await page.evaluate(() => document.querySelectorAll('button').length)
      for (let i = 0; i < count2 && !reopened; i++) {
        const clicked = await page.evaluate((i) => {
          const b = [...document.querySelectorAll('button')][i]
          if (!b) return null
          const r = b.getBoundingClientRect()
          if (r.width < 5 || r.height < 5) return null
          if (b.closest('.ix-bell') || b.closest('.ix-chip') || b.closest('[data-popover]')) return null
          b.click(); return 'ok'
        }, i)
        if (!clicked) continue
        await page.waitForTimeout(170)   // sleep: Popover mounts hidden, measures, then places — no event marks placed
        if (await page.evaluate(() => !!document.querySelector('[data-popover]'))) { reopened = 'ok'; break }
        const dirty = await page.evaluate((route) =>
          location.pathname !== route || !!document.querySelector('[data-name="BottomSheet"]'), c.route)
        if (dirty) {
          await page.goto(`http://localhost:${port}${c.route}`, { waitUntil: 'domcontentloaded' })
          await page.waitForTimeout(450)   // sleep: route remount after undoing a candidate that opened a sheet
        }
      }
    }
    if (!reopened) {
      say(false, `${label}: could not reopen the panel to test the outside click`)
    } else {
      await page.waitForTimeout(250)   // sleep: the reopened panel's place() pass, which fires no event
      // A corner of the viewport the panel cannot occupy: `Popover` clamps to a 12px margin and
      // these panels are anchored near their triggers, so the far bottom-left is outside every
      // one of them. Asserted rather than assumed, immediately below.
      const spot = await page.evaluate(() => {
        const p = document.querySelector('[data-popover]')
        if (!p) return null
        const r = p.getBoundingClientRect()
        const x = 4, y = window.innerHeight - 4
        return { x, y, outside: x < r.left || x > r.right || y < r.top || y > r.bottom }
      })
      say(!!spot && spot.outside, `${label}: the outside-click point is genuinely outside the panel`)
      if (spot && spot.outside) {
        await page.mouse.click(spot.x, spot.y)
        const closed = await page
          .waitForFunction(() => !document.querySelector('[data-popover]'), null, { timeout: 3000 })
          .then(() => true, () => false)
        say(closed, `${label}: a click outside still closes the panel`)
      }
    }

    await ctx.close()
  }
}
}

// ── the reported defect, as an outcome rather than as an event ───────────────────────
//
// The click landing is the property; the user's complaint was that logging out was impossible.
// Asserting only the event would pass a build where the click arrives and the handler is wrong.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' })
  await ctx.addInitScript(installProbeDom)
  await ctx.addInitScript(seed('en'))
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${port}/miqaats`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)   // sleep: route mount before the chip exists; waiting on the chip would skip a real absence
  const opened = await page.evaluate(() => {
    const t = document.querySelector('.ix-chip button:last-of-type')
    if (!t) return false
    t.click(); return true
  })
  say(opened, 'account dropdown opens at 1440')
  if (opened) {
    await page.waitForTimeout(300)   // sleep: the dropdown's own open pass — no event marks the panel placed
    const at = await page.evaluate(() => {
      const b = document.querySelector('[data-popover] button')
      if (!b) return null
      b.setAttribute('data-popover-child', '1')
      return true
    })
    if (at) {
      await page.locator('[data-popover-child]').click({ timeout: 5000 }).catch(() => {})
      const shown = await page
        .waitForFunction(() => /Log Out\?/i.test(document.body.innerText), null, { timeout: 5000 })
        .then(() => true, () => false)
      const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 120))
      say(shown, `clicking Logout opens the confirmation${shown ? '' : ` — the page still reads ${JSON.stringify(body)}`}`)
    } else {
      say(false, 'the account dropdown opened with no button in it')
    }
  }
  await ctx.close()
}

cov.verify(say)

await browser.close()
proc.kill()

console.log(`\n${fails} failing assertion(s)`)
process.exit(fails === 0 ? 0 : 1)
