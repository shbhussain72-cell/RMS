/**
 * coverage-floor.mjs — a suite must report how many assertions RAN, not only how many failed.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────
 *
 * `check-anchor` drives the AppBar account dropdown and notification bell. Neither exists at
 * 390px — they are desktop chrome — so a missing trigger is logged and stepped over:
 *
 *     skip  account dropdown: trigger not found at 390
 *
 * That is the right call. Counting a legitimately absent element as a failure would make the
 * suite permanently red at half its widths, and a permanently red suite is one everybody
 * learns to ignore.
 *
 * The consequence is not right. A `skip` line adds nothing to the failure count, so a run in
 * which EVERY assertion skipped prints `0 failing assertion(s)` and exits 0. A count of
 * failures is only meaningful beside a count of attempts.
 *
 * The comment above that skip already claimed the fix — "coverage is asserted at the end
 * instead, so 'skipped everywhere' cannot masquerade as 'passed'". The counter it referred to
 * was incremented and never read. The floor described in prose did not exist, which is its own
 * entry in docs/assertion-discipline.md.
 *
 * ── WHAT IT ASSERTS ──────────────────────────────────────────────────────────────────
 *
 * Not "there were no skips" — skips are legitimate. It asserts the SHAPE of the skipping:
 * every case must run the number of times the matrix says it should, and the combinations
 * where it is expected to be absent are written down. So an unexpected absence fails, and the
 * day the bell stops rendering at 1440 the suite goes red instead of quietly halving its
 * coverage and still printing zero failures.
 *
 * Derive `expected` from the width/language lists rather than typing a number. A literal is a
 * number somebody can lower until the suite is quiet; a derived one moves with the matrix.
 *
 *     const cov = createCoverage({
 *       'account dropdown': NARROW_WIDTHS.filter((w) => w >= DESKTOP_MIN).length * LANGS.length,
 *     })
 *     ...
 *     if (opened !== 'clicked') { cov.skip(name, `${opened} at ${width}`); continue }
 *     cov.ran(name)
 *     ...
 *     cov.verify(say)
 */

/**
 * @param {Record<string, number>} expected  case name → how many runs the matrix should produce
 */
export function createCoverage(expected) {
  /** @type {Record<string, number>} */
  const ran = {}
  /** @type {string[]} */
  const skipped = []

  return {
    /** Record that a case actually executed its assertions. */
    ran(name) {
      if (!(name in expected)) throw new Error(`coverage: "${name}" ran but was never declared in expected{}`)
      ran[name] = (ran[name] ?? 0) + 1
    },

    /** Record — and print — a case that declined to run, with the reason. */
    skip(name, why) {
      if (!(name in expected)) throw new Error(`coverage: "${name}" skipped but was never declared in expected{}`)
      skipped.push(`${name}: ${why}`)
      console.log(`  skip  ${name}: ${why}`)
    },

    /**
     * Assert the floor through the suite's own `say`, so a shortfall is counted and printed
     * exactly like any other failing assertion rather than as a separate kind of thing.
     */
    verify(say) {
      const names = Object.keys(expected).sort()
      if (names.length === 0) throw new Error('coverage: nothing declared — the floor would be vacuous')
      console.log(`\n  coverage floor`)
      for (const name of names) {
        const want = expected[name]
        const got = ran[name] ?? 0
        say(got >= want, want === got
          ? `${name}: all ${want} matrix combination(s) ran`
          : `${name}: only ${got} of ${want} matrix combination(s) ran — ${want - got} skipped, so that much of this case is untested`)
      }
      if (skipped.length) {
        console.log(`  ${skipped.length} skip(s), all of them expected:`)
        for (const s of skipped) console.log(`    ${s}`)
      }
    },
  }
}
