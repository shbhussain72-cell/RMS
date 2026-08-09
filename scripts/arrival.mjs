/**
 * arrival.mjs — a sweeping suite must prove it reached the routes it reports on.
 *
 * ── WHY THIS IS SHARED AND NOT WRITTEN FOUR TIMES ────────────────────────────────────
 *
 * Every findings-list suite in this repo ends the same way:
 *
 *     process.exit(findings.length === 0 ? 0 : 1)
 *
 * which is green when the sweep found nothing — and a sweep that never arrived anywhere finds
 * nothing. Measured, not assumed: an app built with the auth gate forced shut, so every route
 * redirects to /login, was fed to all seventeen browser suites. `check-centred`, `check-layout`,
 * `check-lsd-clip` and `check-numerals` all passed, on 250-odd visits to a page none of them
 * were about. See docs/assertion-discipline.md, example 7.
 *
 * `check-numerals` even had a comment handing the problem off — "a route that fails to render is
 * check-layout's problem, not this one" — to a suite that turned out to have the same hole. That
 * is what four private copies of a precondition buy you. So there is one, here, and the next
 * sweeping suite gets it by importing it rather than by remembering the argument.
 *
 * ── WHAT IT ASSERTS ──────────────────────────────────────────────────────────────────
 *
 * Three things, because each catches a case the others miss:
 *
 *   the URL is the route that was asked for   `<Navigate to="/login" replace>` changes the URL,
 *                                             so a redirect shows up here — but a fallback
 *                                             rendered IN PLACE keeps the URL, hence the rest.
 *   the body clears a floor                   catches a blank mount, and only that. See
 *                                             MIN_CHARS — the first version of this floor was
 *                                             400, reasoned off the login page, and it failed 48
 *                                             correct pages: five real routes here render under
 *                                             400 characters.
 *   the routes differ from one another        catches every remaining "these are not the pages
 *                                             they claim to be" case, whatever the cause, and
 *                                             needs no per-route marker string — which matters
 *                                             because every visible string here is translated,
 *                                             so a marker assertion would either have to be
 *                                             authored in Lisan al-Dawat or run in English only,
 *                                             and English is the half where the bugs aren't.
 *
 * Plus the coverage floor: a suite says how many visits its matrix should produce, and falls
 * below it. A count of findings is only meaningful beside a count of visits that happened.
 *
 * ── USE ──────────────────────────────────────────────────────────────────────────────
 *
 *     const arrival = createArrival({ expected: routes.length * WIDTHS.length * LANGS.length })
 *     ...
 *     if (!await arrival.visit(page, route, `${lang}@${width}`)) continue   // do not measure it
 *     ...
 *     const problems = arrival.verify()
 *     problems.forEach((p) => console.error(`  FAIL  ${p}`))
 *     process.exit(problems.length || findings.length ? 1 : 0)
 *
 * `visit` returns false when the page is not the one asked for, so a suite that ignores the
 * return value still fails at `verify`, and one that honours it does not pollute its findings
 * with measurements of the wrong page.
 */

/**
 * The floor for "something mounted here", and it is deliberately LOW.
 *
 * ── THE NUMBER THIS WAS, AND WHY IT WAS WRONG ────────────────────────────────────────
 *
 * It was 400, reasoned from the login page being 137 characters: above the thing to reject,
 * below "a real route". That reasoning is example 2 of docs/assertion-discipline.md exactly —
 * a round number picked because it makes the case in front of you pass, rather than a number
 * measured off the subject. Run against a real build it failed 48 of 250 visits, and every one
 * of them was a correct page:
 *
 *     /raza-letter      87-96 chars      /success   271-286
 *     /login           131-137          /manage    307-379
 *     /invite             393
 *
 * Five genuine routes render under 400 characters. A probe that fails on correct pages is one
 * everybody learns to ignore — the same argument that makes a legitimate skip the right call in
 * check-anchor — and this one also SKIPPED those routes, so it silently cost the coverage it
 * was added to protect. `check-centred` lost both /login centring sites that way.
 *
 * ── WHAT THE NUMBER IS NOW ───────────────────────────────────────────────────────────
 *
 * Measured off the two things it has to separate: the smallest real route in this app renders
 * 87 characters (/raza-letter, LSD at 390), and a shell that mounted nothing renders 0. 40 sits
 * between them with room on both sides and no opinion about how rich a page ought to be.
 *
 * This floor is NOT what catches a wrong page. The URL check and the cross-route distinctness
 * check do that, and both fired on the run that started all this. This one catches a blank
 * mount and nothing else, which is all a character count can honestly claim to know.
 */
export const MIN_CHARS = 40

/**
 * Wait for the app to be READY, rather than sleeping for a guessed number of milliseconds.
 *
 * ── WHY THIS IS HERE AND NOT IN EACH PROBE ───────────────────────────────────────────
 *
 * Three probes have now had the same bug and fixed it three times. `check-dictionary` sampled
 * at a fixed 1200ms and reported the dictionary editor missing, because the panel pulls in the
 * shared dictionary client and a cold dev server had not transformed it yet. Then two live-edit
 * probes sampled at 2500ms and reported "no candidate — no dictionary value is rendered on this
 * route", which is indistinguishable from the real finding they were looking for.
 *
 * A fixed delay fails in the green direction on a fast machine and in the confusing direction
 * on a slow one, and it fails WORSE the more dev tooling is switched on — so it bites hardest
 * in exactly the runs that exercise the most code. Fixing it per-probe means the next probe
 * starts from the same default. It lives here so it is inherited.
 *
 * `devdock` defaults to true because every probe that needs a wait also needs review tools; set
 * it false for a suite that runs with `VITE_REVIEW_TOOLS` unset, or the wait can only time out.
 *
 * @param {import('playwright').Page} page
 * @param {{ minChars?: number, devdock?: boolean, timeout?: number }} [opts]
 */
export async function waitForApp(page, { minChars = 300, devdock = true, timeout = 30_000 } = {}) {
  if (devdock) await page.waitForSelector('[data-devdock]', { timeout })
  await page.waitForFunction(
    (n) => document.body.innerText.replace(/\s+/g, ' ').trim().length > n,
    minChars,
    { timeout },
  )
  await page.evaluate(() => document.fonts?.ready)
  // Two frames: one for React to commit, one for the browser to lay the commit out.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

/**
 * @param {{ expected: number, minChars?: number }} opts
 *   expected — visits the matrix should produce. DERIVE it (routes x widths x langs); a typed
 *   literal is a number somebody lowers until the suite goes quiet.
 */
export function createArrival({ expected, minChars = MIN_CHARS }) {
  if (!Number.isInteger(expected) || expected < 1) {
    throw new Error(`arrival: expected must be a positive integer, got ${expected}`)
  }
  const problems = []
  /** combo ("lsd@390") → route → body text, for the cross-route distinctness check. */
  const byCombo = new Map()
  let arrived = 0

  return {
    /**
     * Record a visit. Returns true when this page may be measured.
     * @param {import('playwright').Page} page
     * @param {string} route  the pathname that was asked for
     * @param {string} combo  a label for this matrix cell, e.g. `${lang}@${width}`
     */
    async visit(page, route, combo) {
      const seen = await page.evaluate(() => ({
        path: location.pathname,
        text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
      }))
      const where = `${combo} ${route}`

      if (seen.path !== route) {
        problems.push(`${where} — the page is ${seen.path}, not the route asked for; nothing measured here describes ${route}`)
        return false
      }
      if (seen.text.length < minChars) {
        problems.push(`${where} — rendered ${seen.text.length} chars, under ${minChars}; a sweep of a page this empty finds nothing for reasons that have nothing to do with what it tests`)
        return false
      }
      if (!byCombo.has(combo)) byCombo.set(combo, new Map())
      byCombo.get(combo).set(route, seen.text)
      arrived++
      return true
    },

    /** Visits that arrived — for a suite that wants to print its own coverage line. */
    get arrived() { return arrived },

    /**
     * Arrival problems, plus the coverage shortfall, plus per-combo distinctness.
     * @returns {string[]} empty when the sweep genuinely covered its matrix
     */
    verify() {
      const out = [...problems]

      for (const [combo, routes] of byCombo) {
        // Two routes are not evidence of anything; three is the smallest set where "they all
        // rendered the same thing" is a claim rather than a coincidence.
        if (routes.size < 3) continue
        const distinct = new Set(routes.values())
        if (distinct.size === 1) {
          out.push(`${combo} — all ${routes.size} routes rendered identical text; they are not the pages they claim to be`)
        }
      }

      if (arrived < expected) {
        out.push(`only ${arrived} of ${expected} matrix visits arrived — ${expected - arrived} route(s) were never measured, so "no findings" covers ${Math.round((1 - arrived / expected) * 100)}% less than it appears to`)
      }
      return out
    },
  }
}
