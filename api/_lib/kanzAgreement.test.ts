/**
 * kanzAgreement.test.ts — the three entry points must land on the same string.
 *
 * Kanz keyboard output can reach the wordlist three ways, and they are written by different
 * people in different languages against different runtimes:
 *
 *   1. the GENERATOR   `classifyValue` in scripts/build-lsd-dict.mjs   (node, .mjs)
 *   2. the EDITOR      the paste/commit path in src/dev/DictionaryPanel (browser, .tsx)
 *   3. the SYNC        `planSync` in api/_lib/syncPlan.ts              (serverless, .ts)
 *
 * They share `src/i18n/kanzNorm.mjs`, the same way all three already share `normKey` and
 * `bakedValue`. This file exists because sharing a module is not the same as agreeing: any of
 * the three could apply it at the wrong point, to the wrong value, or not at all, and every
 * one of those failures is silent — the value lands, the commit is clean, the build is green,
 * and one path writes `اْثثنا` while the others write `اْپنا`.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────────────
 *
 * The STRING each path produces, compared against the other two. Not that each calls
 * `normaliseKanz` — that is the mechanism, and it is exactly what would still pass if someone
 * called it and threw the result away. `docs/assertion-discipline.md`, the rule stated for
 * reuse: if the mechanism were replaced tomorrow with a different one producing the same
 * result, this test still passes; if the mechanism stayed but stopped working, it fails.
 *
 * The editor is the one path that cannot be driven from node — it is a React component whose
 * conversion happens in a paste handler. Its outcome is asserted in a real browser by
 * `scripts/check-dictionary.mjs` ("a Kanz paste is converted and says so"), and what is
 * checked here is the transformation the component applies, at the point it applies it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyValue } from '../../scripts/build-lsd-dict.mjs'
import { normaliseKanz } from '../../src/i18n/kanzNorm.mjs'
import { bakedValue } from '../../src/i18n/wordlistNorm.mjs'
import { planSync } from './syncPlan.js'
import { readWordlist } from './wordlistXlsx.js'
import type { Revision } from './records.js'

const ROOT = resolve(__dirname, '../..')
const BOOK = new Uint8Array(readFileSync(resolve(ROOT, 'RMS_Mumineen_LSD_wordlist_v4.xlsx')))

/** Real values, and the Unicode each must become. */
const CASES: Array<[label: string, input: string]> = [
  ['a city name', 'شظظر'],
  ['with the article', 'الشظظر'],
  ['the possessive family', 'اْثثنا تعيين'],
  ['a whole sentence', 'مظظمان نسس اذن اْثثو'],
  ['an odd run', 'جاسسس'],
  ['every pair at once', 'ظظ ثث سس كك حح ضض طط'],
  ['nothing to convert', 'شہر چنو'],
  ['a mixed-script value', 'اْثثنا Registration بند'],
]

/** What the EDITOR's commit path does, in the order it does it. Mirrors DictionaryPanel. */
const throughEditor = (raw: string): string => {
  const trimmed = raw.trim()
  const nfc = trimmed.normalize('NFC') === trimmed ? trimmed : trimmed.normalize('NFC')
  return normaliseKanz(nfc).value
}

/** What the SYNC does to a value on its way to a cell — driven through the real planner. */
const throughSync = (raw: string): string => {
  const wl = readWordlist(BOOK)
  // Any real key will do; the assertion is on the value the planner decides to write.
  const key = [...wl.byKey.keys()].find((k) => k === 'Choose city') ?? [...wl.byKey.keys()][0]
  const rev: Revision = {
    key,
    value: raw,
    author: 'agreement-test',
    kind: 'edit',
    createdAt: '2026-08-10T00:00:00.000Z',
    revisionId: 'r1',
  } as Revision
  const plan = planSync(wl, [rev], { force: true })
  // Either it plans an edit (value differs from the sheet) or it reports the value already
  // there — in which case the sheet's own normalised value IS what the sync would write.
  if (plan.edits.length) return plan.edits[0].value
  return normaliseKanz(String(wl.byKey.get(key)?.value ?? '')).value
}

/** What the GENERATOR puts in lsd.json, minus the RLM hint, which is not this file's subject. */
const throughGenerator = (raw: string): string => {
  const out = classifyValue(raw) as { value: string }
  return out.value.replace(/^‏/, '')
}

describe('generator, editor and sync produce the same string', () => {
  it.each(CASES)('%s', (_label, input) => {
    const g = throughGenerator(input)
    const e = throughEditor(input)
    const s = throughSync(input)
    expect({ generator: g, editor: e }).toEqual({ generator: g, editor: g })
    expect({ generator: g, sync: s }).toEqual({ generator: g, sync: g })
    expect(e).toBe(s)
  })

  it('and none of them leaves a Kanz pair behind', () => {
    const anyPair = /ظظ|ثث|سس|كك|حح|ضض|طط/
    for (const [, input] of CASES) {
      expect(anyPair.test(throughGenerator(input)), `generator: ${input}`).toBe(false)
      expect(anyPair.test(throughEditor(input)), `editor: ${input}`).toBe(false)
      expect(anyPair.test(throughSync(input)), `sync: ${input}`).toBe(false)
    }
  })

  it('the generator additionally applies the RLM hint, and only to mixed script', () => {
    // Stated so the `.replace` above is a documented difference rather than a hidden one.
    expect(classifyValue('اْثثنا Registration بند').value).toBe(bakedValue('اْپنا Registration بند'))
    expect(classifyValue('شظظر').value).toBe('شہر')
  })
})

describe('all three still refuse byte damage', () => {
  const DAMAGED = 'Ø§Ù„ broken'

  it('the sync aborts rather than writing it', () => {
    const wl = readWordlist(BOOK)
    const key = [...wl.byKey.keys()][0]
    const plan = planSync(wl, [{
      key, value: DAMAGED, author: 'a', kind: 'edit',
      createdAt: '2026-08-10T00:00:00.000Z', revisionId: 'r1',
    } as Revision], { force: true })
    expect(plan.edits).toEqual([])
    expect(plan.aborts.join(' ')).toContain('utf8-as-latin1')
  })

  it('normalising damaged text does not repair it, so nothing can mistake it for fixed', () => {
    expect(normaliseKanz(DAMAGED).value).toBe(DAMAGED)
  })
})
