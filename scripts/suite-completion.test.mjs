/**
 * The completion classifier, against the real output shapes of this repo's suites.
 *
 * It exists because the FIRST classifier was wrong on its first run. It tried to recognise each
 * suite's own output — `/(PASS|FAIL|ok|✓|×)\b/` — and filed `check:lsd` as crashed, because that
 * gate exits 0 printing `✓ no new untranslated strings` and `\b` cannot match after `✓`.
 *
 * The output of this classifier becomes a column in `docs/assertion-discipline.md`, so a wrong
 * verdict here writes a false claim into the document whose entire subject is checks that report
 * the wrong thing. The samples below are copied from actual runs.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(resolve(ROOT, 'scripts/suite-completion.mjs'), 'utf8')
const line = src.split('\n').find((l) => l.startsWith('const crashed ='))

/** Evaluated from the source so the test cannot drift from the script it certifies. */
// eslint-disable-next-line no-eval
const crashed = eval(`(${line.replace('const crashed = ', '')})`)

const RAN = {
  'the LSD gate, clean, exit 0': 'LSD translation gate\n  wordlist entries : 1183\n\n\u2713 no new untranslated strings',
  'a browser suite, all green': '  PASS  en: pins survive a reload  \u2014 got 3\n\n76/76 checks passed',
  'a browser suite reporting FAILURES, exit 1':
    '  FAIL  en: three remarks persisted  \u2014 got 0\n\n70/76 checks passed\n\nFAILURES:\n  en: three remarks persisted  \u2014 got 0',
  'vitest': ' \u2713 scripts/lib/patch-merge.test.mjs (14 tests)\n Test Files  1 passed (1)\n      Tests  14 passed (14)',
  'a gate listing violations': '\u2717 11 NEW untranslated user-visible string(s):\n  [NO_ROW] src/screens/Araz.tsx:770  "Update your preferences"',
}

const DIED = {
  'a Playwright locator timeout':
    "locator.waitFor: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('[data-rmk=\"composer\"]')\n\n    at addRemarkOn (C:\\Users\\Dell\\x\\scripts\\check-remarks.mjs:170:47)",
  'a TypeError with an async frame':
    "TypeError: Cannot read properties of undefined (reading 'id')\n    at runLang (file:///C:/x/scripts/check-remarks.mjs:318:45)\n    at async file:///C:/x/scripts/check-remarks.mjs:542:3",
  'a node internal trace': 'node:internal/modules/run_main:107\n    triggerUncaughtException(\n    ^',
  'an unhandled rejection': 'UnhandledPromiseRejection: This error originated either by throwing...',
}

describe('the completion classifier', () => {
  for (const [name, out] of Object.entries(RAN)) {
    it(`counts as COMPLETED: ${name}`, () => {
      // Reporting failures is a suite working. Only a crash means it never got to decide.
      expect(crashed(out)).toBe(false)
    })
  }

  for (const [name, out] of Object.entries(DIED)) {
    it(`counts as CRASHED: ${name}`, () => {
      expect(crashed(out)).toBe(true)
    })
  }

  it('is not vacuous in either direction', () => {
    // Both branches must be reachable, or the classifier is a constant with extra steps —
    // which is what the first one effectively was for every suite whose output starts with ✓.
    expect(Object.values(RAN).some((o) => crashed(o) === false)).toBe(true)
    expect(Object.values(DIED).some((o) => crashed(o) === true)).toBe(true)
  })
})
