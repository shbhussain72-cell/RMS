/**
 * widths.mjs — the canonical viewport set, in one place.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────
 *
 * `05-runbook-phase2.md` fixes the canonical widths at 390 / 768 / 1024 / 1150 / 1440, both
 * languages, for "every assertion suite and the screenshot harness". Two of them then defaulted
 * to their own literal `[390, 768, 1024, 1440]`, independently, and **1150 was measured by
 * nothing in this repo for four sessions**.
 *
 * Nothing reported it, because each script tallies against its own list: `shoot.mjs` printed
 * `200/200 screenshots, no missing routes` and `check-layout.mjs` printed `200 route visits
 * (25 routes x 2 langs x 4 widths)`. Both statements were true. Neither answers "did you cover
 * the canonical set", and a reader checking that a harness ran completely gets a yes.
 *
 * Two arrays that must agree, maintained apart, will drift — so there is one array, and
 * `widths.test.mjs` fails any script that writes its own.
 *
 * ── THE TWO SETS ─────────────────────────────────────────────────────────────────────
 *
 * CANONICAL  the full five. Anything sweeping for layout or capturing evidence uses this.
 *
 * NARROW     390 and 1440 only — the extremes. Correct for probes whose subject is the
 *            mobile/desktop BRANCH rather than the layout at a size: mirroring, anchoring,
 *            bidi runs and the tour all behave identically across 768/1024/1150 by
 *            construction, and running them there costs minutes to re-confirm the same thing.
 *            It is a deliberate subset, not a shortcut, which is why it is named here rather
 *            than written out at each call site where it would be indistinguishable from one.
 */

/** The canonical set. Use this unless there is a stated reason not to. */
export const CANONICAL_WIDTHS = [390, 768, 1024, 1150, 1440]

/** The extremes only — for probes whose subject is the mobile/desktop branch. */
export const NARROW_WIDTHS = [390, 1440]
