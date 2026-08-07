/**
 * The centring census, enforced rather than observed.
 *
 * WHY THIS IS AN ASSERTION AND NOT A REPORT
 *
 * The census was run by hand, twice, and gave 17 then 18. The real number is 23. A count that
 * is only ever observed is a snapshot: it is accurate on the day it is taken and silently
 * wrong afterwards, and site 24 arrives unannounced — which is precisely how the four broken
 * sites got in.
 *
 * More to the point, the census caught a blind spot the codemod's own guard did not: the
 * `left-[calc(50%+0.62px)]` form the Figma export writes for optical centring. A check that
 * has already found something the other checks missed is worth wiring in permanently.
 *
 * WHAT FAILS
 *
 *   · a CENTRING site whose signature is not in scripts/centring-exceptions.json
 *   · an exception entry with no corresponding site (stale — clean it up)
 *   · any MIXED site: a logical inset together with a physical inset or translate-x
 *
 * Entries are keyed on file + positioning tokens, so unrelated edits above a site do not
 * churn the list, but changing a site's actual positioning does — sending it back through
 * review, which is the point.
 *
 * TO UPDATE after deliberately converting or adding a site:
 *
 *   node scripts/centring-census.cjs --write-exceptions
 *
 * Review that diff. Every removed line should be a site converted to a direction-neutral
 * mechanism; every added line needs a reason.
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(import.meta.url)

// The CLI and this test share one implementation on purpose. A reimplementation here would
// drift from the reporter, and then the number you are shown and the number enforced diverge.
const { census } = require_('./centring-census.cjs')
const allowed = JSON.parse(readFileSync(resolve(HERE, 'centring-exceptions.json'), 'utf8')).exceptions

describe('physical horizontal positioning', () => {
  const rows = census()

  it('has no site combining a logical inset with a physical inset or translate-x', () => {
    /**
     * `start-0` next to `right-1/2` resolves BOTH to the right edge under RTL
     * (inset-inline-start === right), leaving `left` unset — so the element computes to zero
     * width and vanishes. `start-` next to `-translate-x-1/2` is the same disagreement in the
     * other direction: the inset flips, the translate does not, and the element lands
     * off-centre by its own width.
     *
     * A logical-properties codemod produced four of these. The fix was reverted, the codemod
     * re-broke the same four, and only an assertion caught the second occurrence.
     */
    expect(rows.filter((r) => r.kind === 'MIXED').map((r) => `${r.f}:${r.line}  ${r.cls.slice(0, 80)}`)).toEqual([])
  })

  it('has every CENTRING site on the documented exception list', () => {
    const found = rows.filter((r) => r.kind === 'CENTRING').map((r) => r.sig).sort()
    const unlisted = found.filter((s) => !allowed.includes(s))
    expect(unlisted, 'new physical centring site — convert it, or add it with a reason via --write-exceptions').toEqual([])
  })

  it('has no stale exception entries', () => {
    const found = rows.filter((r) => r.kind === 'CENTRING').map((r) => r.sig)
    const stale = allowed.filter((s) => !found.includes(s))
    expect(stale, 'exception listed but no such site — regenerate with --write-exceptions').toEqual([])
  })

  it('keeps the exception list and the census exactly in step', () => {
    // Multiset equality, so a site added in a file that already has an identical signature
    // cannot hide behind the existing entry.
    expect(rows.filter((r) => r.kind === 'CENTRING').map((r) => r.sig).sort()).toEqual([...allowed].sort())
  })
})
