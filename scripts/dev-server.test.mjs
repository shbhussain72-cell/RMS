/**
 * dev-server.test.mjs — the flag is required, and nothing spawns a dev server around it.
 *
 * Two halves, and the second is the one that matters. `devEnv` can be tested directly and is
 * three lines; what has actually gone wrong three times is a suite spawning `vite` with its own
 * hand-written options object, which no unit test of a helper can see. So the wiring assertion
 * reads every suite and fails BY NAME on any that does — the same shape, and the same reason, as
 * `dist-precondition.test.mjs`.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { devEnv } from './lib/dev-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('devEnv', () => {
  it('refuses to guess when the flag is not stated', () => {
    expect(() => devEnv(undefined)).toThrow(/reviewTools: true or false/)
    expect(() => devEnv(null)).toThrow(/reviewTools/)
    expect(() => devEnv('true')).toThrow(/reviewTools/)
  })

  it('sets the flag for a suite that tests the tooling', () => {
    expect(devEnv(true, {}).VITE_REVIEW_TOOLS).toBe('true')
  })

  it('DELETES it for a suite that tests the app, rather than inheriting it', () => {
    // The ambient value is the one that makes a local run and a CI run differ for reasons neither
    // output mentions. A suite that measures the app must measure the same app either way.
    expect(devEnv(false, { VITE_REVIEW_TOOLS: 'true' }).VITE_REVIEW_TOOLS).toBeUndefined()
  })

  it('leaves everything else in the environment alone', () => {
    expect(devEnv(true, { PATH: '/usr/bin', HOME: '/root' })).toMatchObject({ PATH: '/usr/bin', HOME: '/root' })
  })
})

describe('no suite spawns a dev server on its own', () => {
  const files = readdirSync(resolve(ROOT, 'scripts'))
    .filter((n) => /^check-.*\.mjs$/.test(n))
    .map((n) => ({ name: n, src: readFileSync(resolve(ROOT, 'scripts', n), 'utf8') }))

  /**
   * A DEV spawn specifically: `vite` with no subcommand.
   *
   * The negative lookahead is load-bearing in both directions. `vite preview` is a different
   * concern with a different owner (`lib/preview-server.mjs`) and takes no flag, because a preview
   * serves bytes that were built with one or without one. `vite build` is how `check-gate` and
   * `check-dictionary` produce those bytes, and neither is a server at all.
   *
   * THE OPENING QUOTE IS CONSUMED BEFORE THE LOOKAHEAD, and that is not style. Written as
   * `\s*(?!'preview')`, the `\s*` backtracks to zero width, the lookahead is then applied at the
   * space rather than at the quote, ` 'preview'` is not `'preview'`, and every preview suite
   * matches — which is what the first version of this did: eight suites named as spawning a dev
   * server, none of which does.
   */
  const DIRECT_DEV = /spawn\(\s*'npx',\s*\[\s*'vite',\s*'(?!preview|build)/

  const usesHelper = files.filter(({ src }) => src.includes("lib/dev-server.mjs"))

  it('finds the suites — without this the assertion is vacuous', () => {
    // Nine on 12 Aug. The floor sits below that deliberately, so it is not a count anybody has to
    // maintain, but high enough that a broken pattern reads as broken rather than as "all clear".
    expect(usesHelper.length).toBeGreaterThanOrEqual(7)
  })

  for (const { name, src } of files) {
    if (!DIRECT_DEV.test(src)) continue
    it(`${name} spawns a dev server directly`, () => {
      expect.fail(
        `${name} spawns \`vite\` itself instead of calling startDev from lib/dev-server.mjs. `
        + 'Three suites have now done that without VITE_REVIEW_TOOLS and reported the resulting '
        + 'null render as a regression in the widget. startDev makes the flag a required argument.',
      )
    })
  }
})
