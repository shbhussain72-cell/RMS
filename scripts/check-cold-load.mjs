/**
 * check-cold-load.mjs — a session saved by an older build must not crash the current one.
 *
 *   npm run check:coldload      (against dist/ — build first)
 *
 * ── WHAT IT REPRODUCES ───────────────────────────────────────────────────────────────
 *
 * `/miqaats/:id/people` rendered the error boundary with
 * `TypeError: Cannot read properties of undefined (reading 'needsAccommodation')`. The cause
 * was not the roster: zustand's default `merge` is a shallow spread, so a persisted `flow`
 * replaces the whole object and any field added since that browser last saved is absent.
 * `validateQuestionnaire` dereferences `flow.questionnaire` on its first line.
 *
 * It only ever reproduced on a COLD load, because a session that built its own state always
 * had every field. So this seeds localStorage BEFORE the app boots, exactly as a returning
 * user's browser would, and walks the routes.
 *
 * ── THE CONTROL, AND WHY THE FIRST ONE WAS USELESS ───────────────────────────────────
 *
 * "No error boundary" is also true of a page that never rendered. The first version of this
 * suite asserted only that the body held more than 40 characters, and it passed 24 times out
 * of 24 while every single visit was sitting on the LOGIN page: a version bump had made
 * zustand discard the saved state, the app booted logged out, and the login page is 137
 * characters of perfectly boundary-free content. The tell was in the output the whole time —
 * three different routes all reporting exactly 137 chars — and a threshold cannot see that.
 *
 * So the control is now three things a login page fails:
 *   the URL is still the route that was asked for, not /login
 *   the page carries real content (the login page is 137 chars; a real route is 1800+)
 *   the three routes render DIFFERENT text from one another
 *
 * The last one is the one that would have caught it, and it needs no per-route copy — which
 * matters, because every marker string on these pages is translated in LSD.
 *
 * ── THE SAVED STATES ─────────────────────────────────────────────────────────────────
 *
 * Two shapes, because they break differently:
 *   pre-questionnaire   a flow with fields the current build reads and older builds never wrote
 *   stale roster        a party naming member ids that are not in `family` any more
 */
import { chromium } from 'playwright'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NARROW_WIDTHS } from './widths.mjs'
import { ensureDist } from './lib/dist-precondition.mjs'
import { freePort, startPreview, finish } from './lib/preview-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The login page is 137 characters. Anything at or below that is not a route rendering. */
const MIN_CHARS = 400

const ROUTES = [
  { path: '/miqaats', shows: 'Registered' },
  { path: '/miqaats/ashara-1448', shows: null },
  { path: '/miqaats/ashara-1448/people', shows: null },
]

/** A flow as an older build would have written it: no questionnaire, no araz, no arrangement. */
const PRE_QUESTIONNAIRE = `{
  "selectedMemberIds": ["m1","m4"], "guardians": {}, "caregivers": {}, "invites": [],
  "cities": [], "submitted": false, "referenceNumber": null,
  "confirmedCity": null, "cityConfirmedAt": null, "confirmedZone": null, "zoneConfirmedAt": null,
  "razaIssued": false, "miqaatId": "ashara-1448", "groupCities": {}, "groupZones": {},
  "joinedGroupInvite": false, "invitationReceived": false, "invitationBannerPending": false,
  "changeRequests": []
}`

/** A party naming ids the roster no longer has, plus a guardian mapping to a missing member. */
const STALE_ROSTER = `{
  "selectedMemberIds": ["m1","GHOST-1","m3"], "guardians": {"m3":"GHOST-2"}, "caregivers": {},
  "invites": [], "cities": [], "submitted": false, "referenceNumber": null,
  "confirmedCity": null, "cityConfirmedAt": null, "confirmedZone": null, "zoneConfirmedAt": null,
  "razaIssued": false, "miqaatId": "ashara-1448", "groupCities": {}, "groupZones": {},
  "joinedGroupInvite": false, "invitationReceived": false, "invitationBannerPending": false,
  "changeRequests": []
}`

const SAVES = [
  { name: 'pre-questionnaire save', flow: PRE_QUESTIONNAIRE },
  { name: 'stale roster save', flow: STALE_ROSTER },
]

const seed = (lang, flow) => `try{
  localStorage.setItem('rms-lang', ${JSON.stringify(lang)});
  localStorage.setItem('rms-tour-seen','1');
  localStorage.setItem('miqaat-flow', JSON.stringify({
    version: 0,
    state: { loggedIn: true, flow: ${flow}, registrations: { "ashara-1448": ${flow} } }
  }));
}catch(e){}`

const PORT = await freePort()
// The bundle under test must be the bundle this source produces. `check-chrome` printed ok for
// four days against a dist/ built before the commit that broke it — see the arrival audit's
// third column. Builds one when it is not, because a suite that stops with a message nobody
// reads is the same as a suite that guesses.
if (!ensureDist({ suite: 'check-cold-load' })) process.exit(2)

const server = await startPreview(PORT, { cwd: ROOT })

let failures = 0
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++ }
const pass = (msg) => console.log(`  ok    ${msg}`)

const browser = await chromium.launch()
console.log('\nCold load — a session saved by an older build\n')

for (const save of SAVES) {
  for (const lang of ['en', 'lsd']) {
    // NARROW_WIDTHS, not a literal pair: the subject here is the mobile/desktop branch, and
    // `widths.test.mjs` exists to stop a script keeping its own copy of the list.
    for (const width of NARROW_WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 860 } })
      await ctx.addInitScript(seed(lang, save.flow))
      const page = await ctx.newPage()
      const rendered = new Map()
      const thrown = []
      page.on('pageerror', (e) => thrown.push(e.message))
      page.on('console', (m) => { if (m.type() === 'error' && /route-error|TypeError/.test(m.text())) thrown.push(m.text().slice(0, 200)) })

      for (const route of ROUTES) {
        thrown.length = 0
        await page.goto(`http://localhost:${PORT}${route.path}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1400)   // sleep: whether the route renders at all IS the subject, so waiting for content would beg the question

        const seen = await page.evaluate(() => ({
          boundary: document.body.innerText.includes('Something went wrong on this page'),
          text: document.body.innerText.replace(/\s+/g, ' ').trim(),
          path: location.pathname,
        }))
        const where = `${save.name} · ${lang} · ${width} · ${route.path}`
        rendered.set(route.path, seen.text)

        if (seen.boundary) fail(`${where} — error boundary. ${thrown[0] ?? '(no message captured)'}`)
        else if (seen.path !== route.path) fail(`${where} — redirected to ${seen.path}; the saved session was not loaded, so nothing here was tested`)
        else if (seen.text.length < MIN_CHARS) fail(`${where} — rendered ${seen.text.length} chars, under ${MIN_CHARS}; "no boundary" means nothing on a page this empty`)
        else if (thrown.length) fail(`${where} — no boundary, but something threw: ${thrown[0]}`)
        else pass(`${where} (${seen.text.length} chars)`)
      }
      // Three routes that render identical text are three routes that did not render. This is
      // the assertion that would have caught the login page, and it needs no per-route copy.
      const distinct = new Set(rendered.values())
      if (rendered.size === ROUTES.length && distinct.size < ROUTES.length) {
        fail(`${save.name} · ${lang} · ${width} — all ${ROUTES.length} routes rendered the same text; they are not the pages they claim to be`)
      } else if (rendered.size === ROUTES.length) {
        pass(`${save.name} · ${lang} · ${width} — the ${ROUTES.length} routes are genuinely different pages`)
      }
      await ctx.close()
    }
  }
}

await browser.close()

console.log('')
if (failures) console.error(`${failures} failing assertion(s)\n`)
else console.log('every route survives a saved session from an older build\n')

/**
 * ── THIS SUITE PRINTED ITS VERDICT AND THEN HUNG FOR FIFTEEN MINUTES ─────────────────
 *
 * On the 11 Aug completion sweep it was killed at the 900-second cap, having already printed
 * its success line. The teardown was a bare server.kill().
 *
 * vite is spawned through a shell, so that killed the shell and orphaned the node server, whose
 * piped stdout kept the event loop alive with no work left to do. check-bidi had the identical
 * bug and was fixed in place; the fix now lives in lib/preview-server.mjs so it is one
 * implementation rather than one per suite.
 *
 * IT MATTERS MORE HERE THAN ANYWHERE ELSE. This suite is the CONTROL for the arrival audit in
 * docs/assertion-discipline.md — the one that had to go red with the auth gate shut for the
 * other sixteen verdicts to mean anything. A control that cannot be put in a harness, and that
 * reports as a timeout when it has in fact passed, undermines every row that rests on it.
 */
finish(server, failures ? 1 : 0)
