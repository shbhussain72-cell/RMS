/**
 * The staleness comparison, and the four suites that have to use it.
 *
 * `staleReason` is the whole precondition in one pure function, and a freshness check that errs
 * in the LENIENT direction reinstates the exact defect it was written for — silently, and
 * looking greener than before. So both directions are asserted, including the one where it must
 * say nothing.
 *
 * The second block is a wiring assertion. `check-chrome` passed for four days against a bundle
 * built before the change that broke it; the module below cannot prevent that in a suite which
 * does not call it, and "we wrote a helper" is not a property of the repo. That the helper is
 * IMPORTED by every suite reading dist/ is.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { staleReason } from './lib/dist-precondition.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const T = { old: Date.parse('2026-08-07T10:00:00Z'), new: Date.parse('2026-08-11T10:00:00Z') }
const base = { dist: T.new, src: T.old, hasTools: false, wantTools: null }

describe('staleReason', () => {
  it('says nothing when the bundle is newer than its sources', () => {
    expect(staleReason(base)).toBeNull()
  })

  it('catches the case check-chrome was in: sources edited after the build', () => {
    // 5af517d changed a string this suite matched on; dist/ was four days old and still green.
    expect(staleReason({ ...base, dist: T.old, src: T.new })).toMatch(/predates its sources/)
  })

  it('treats an equal timestamp as fresh, not stale', () => {
    // `vite build` writes its chunks in the same second it reads the last source on a fast
    // machine. Failing on equality would make every build look stale to the suite that follows
    // it in `npm run build`, and a precondition that cries wolf gets deleted.
    expect(staleReason({ ...base, dist: T.new, src: T.new })).toBeNull()
  })

  it('catches an empty dist/ separately from a stale one', () => {
    // A different message because it is a different mistake, and "nothing has been built" is
    // the one a reader can act on immediately.
    expect(staleReason({ ...base, dist: null })).toMatch(/nothing has been built/)
  })

  it('refuses a flag-off bundle to a suite that tests the review tooling', () => {
    // check-review-tools crashed on exactly this, as a preview-start TimeoutError that named
    // nothing. It is a sentence now.
    expect(staleReason({ ...base, hasTools: false, wantTools: true }))
      .toMatch(/without VITE_REVIEW_TOOLS/)
  })

  it('refuses a flag-ON bundle to a suite asserting the tooling is absent', () => {
    // The direction that matters more: check-dev-only asserting "absent" against a flag-on
    // build would report real failures, but asserting "absent" against a bundle it has not
    // established the provenance of is how a gate stops meaning anything.
    expect(staleReason({ ...base, hasTools: true, wantTools: false }))
      .toMatch(/built WITH VITE_REVIEW_TOOLS/)
  })

  it('accepts either flag state when the suite does not care', () => {
    expect(staleReason({ ...base, hasTools: true, wantTools: null })).toBeNull()
    expect(staleReason({ ...base, hasTools: false, wantTools: null })).toBeNull()
  })

  it('reports staleness before the flag, because a rebuild settles both', () => {
    const why = staleReason({ dist: T.old, src: T.new, hasTools: false, wantTools: true })
    expect(why).toMatch(/predates its sources/)
  })
})

describe('every suite that reads dist/ declares the precondition', () => {
  /**
   * Found by reading the suites, not by a list someone maintains — a hard-coded list is a list
   * that goes out of date the next time a suite starts serving dist/.
   */
  const files = readdirSync(resolve(ROOT, 'scripts'))
    .filter((n) => /^check-.*\.mjs$/.test(n))
    .map((n) => ({ name: n, src: readFileSync(resolve(ROOT, 'scripts', n), 'utf8') }))

  /**
   * Two precise signatures, not a loose search for the word "dist".
   *
   * The first attempt matched any mention of `preview` or `dist/` and flagged three suites that
   * only talk about them in prose — `check-devdock`, `check-gate` and `check-remarks` all run
   * against `vite dev` and say so in a comment. A wiring assertion that fires on a comment
   * teaches you to add the import to silence it, which is how a real one stops being read.
   *
   * `check-gate` is the deliberate exception in the other direction: it BUILDS both ways itself,
   * before running anything, so it is the one suite that cannot be stale. It spawns no preview.
   */
  const SERVES_DIST = /spawn\(\s*'npx',\s*\[\s*'vite',\s*'preview'/
  const READS_DIST = /resolve\(\s*ROOT\s*,\s*'dist'\s*\)/
  /**
   * A THIRD signature, because the first two only saw suites that spawn the server INLINE.
   *
   * `check-cold-load` and `check-notes` both serve dist/ through `lib/preview-server.mjs`, so
   * neither contains the literal spawn this file was matching on — and the detector could not
   * see either of them. It happened to matter for neither, since both import the precondition
   * anyway; it would have mattered the moment one of them stopped.
   *
   * The pattern that goes stale is the one written against how the code looked once. Extracting
   * a helper is the normal thing to do to a suite, and a wiring check that a refactor makes
   * blind is a wiring check that reports "all clear" for the suites most recently worked on.
   */
  const USES_PREVIEW_LIB = /lib\/preview-server\.mjs/
  const readsDist = files.filter(({ src }) =>
    SERVES_DIST.test(src) || READS_DIST.test(src) || USES_PREVIEW_LIB.test(src))

  it('finds the suites — without this the assertion is vacuous', () => {
    // Eleven on 11 Aug: eight spawn a preview server inline, two go through the shared helper,
    // and check-dev-only greps the directory. The floor is deliberately below that — this must
    // not become a count nobody can change — but it must be high enough that a broken pattern
    // reads as broken rather than as "all clear".
    expect(readsDist.length).toBeGreaterThanOrEqual(8)
  })

  for (const { name, src } of readsDist) {
    it(`${name} imports the precondition`, () => {
      expect(src, `${name} serves or reads dist/ and never asks how old it is`)
        .toMatch(/dist-precondition\.mjs/)
    })
  }
})
