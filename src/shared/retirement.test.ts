/**
 * retirement.test.ts — the rule that decides whether a live override is still pending.
 *
 * This is the part of the sync loop that rots silently if it is wrong, in both directions:
 * never retiring means the pending count climbs forever while every edit is already in the
 * wordlist, and retiring too eagerly means an edit stops being applied before it has been
 * committed. Neither produces an error; both look like the feature working.
 */
import { describe, expect, it } from 'vitest'
import { bakedValue, normKey } from '../i18n/wordlistNorm.mjs'
import { KANZ_PAIRS, kanzNormalised } from '../i18n/kanzNorm.mjs'
import { REVIEW_TOOLS } from '../reviewTools'
import { allEntries, baselineValue } from '../i18n'
import { isMerged } from './dictionaryApi'

const rev = (key: string, value: string, kind: 'edit' | 'new-row' = 'edit') => ({
  revisionId: 'r1', key, value, author: 'test', createdAt: '2026-08-09T00:00:00.000Z', kind,
})

describe('the test environment', () => {
  it('has the review tooling compiled IN, or everything below is vacuous', () => {
    // Without this the tooling folds to an empty stub and every assertion here passes while
    // testing nothing at all.
    expect(REVIEW_TOOLS).toBe(true)
  })
})

describe('bakedValue', () => {
  it('is what makes a raw store value differ from the committed one', () => {
    // The trap: this is why comparing a raw override against lsd.json never matches.
    expect(bakedValue('register كرو')).not.toBe('register كرو')
    expect(bakedValue('register كرو').codePointAt(0)).toBe(0x200f)
  })

  it('is idempotent — which is what makes the retirement comparison sound', () => {
    // Retirement compares bakedValue(store) against bakedValue(baseline), and the baseline
    // has ALREADY been baked by the generator. If baking twice differed from baking once,
    // nothing would ever retire.
    for (const v of ['register كرو', 'كرو', 'Register now', '‏already marked', '', '  padded  ']) {
      expect(bakedValue(bakedValue(v))).toBe(bakedValue(v))
    }
  })

  it('leaves pure-Latin and pure-Arabic values alone', () => {
    expect(bakedValue('Register now')).toBe('Register now')
    expect(bakedValue('كرو')).toBe('كرو')
  })
})

describe('normKey', () => {
  it('strips the ornaments that five English cells carry', () => {
    // A sync matching on raw cell text would miss these rows and append duplicates.
    expect(normKey('ITS ID۞')).toBe('ITS ID')
    expect(normKey('Enter your 8-digit ITS ID۞')).toBe('Enter your 8-digit ITS ID')
  })

  it('collapses whitespace but never changes case', () => {
    expect(normKey('  Register   now ')).toBe('Register now')
    expect(normKey('RAZA STATUS')).toBe('RAZA STATUS')
  })
})

describe('isMerged, against the real generated dictionary', () => {
  // A key that genuinely exists in the committed wordlist, with its committed value.
  const KEY = 'Register now'
  const committed = baselineValue(KEY)

  it('finds the baseline for a real key', () => {
    expect(typeof committed).toBe('string')
    expect(committed && committed.length).toBeGreaterThan(0)
  })

  it('retires an override whose value already IS the committed one', () => {
    expect(isMerged(rev(KEY, committed as string))).toBe(true)
  })

  it('retires it even when the store holds the UNBAKED form', () => {
    // The reviewer types the value without the direction mark the generator adds. This is the
    // normal case, and it is the one a raw comparison gets wrong.
    const unbaked = (committed as string).replace(/^[‎‏]/, '')
    expect(isMerged(rev(KEY, unbaked))).toBe(true)
  })

  // ── AND WHEN IT HOLDS THE UNCONVERTED FORM ──────────────────────────────────────────
  //
  // Same shape as the unbaked case above and the same consequence, one layer over: the
  // generator converts Kanz doubles on the way into lsd.json, so a revision still holding them
  // can never equal the baseline by raw comparison. It therefore never retires — and an
  // unretired override is an APPLIED override, so `applySharedOverrides` writes the doubled
  // value over the converted one on every reload, forever. The sync repaired the sheet each
  // night and the store put them straight back.
  //
  // syncPlan already compared this way when deciding "already merged". Retirement did not, and
  // the two disagreeing about the same question is what made it survive.
  it('retires an override whose value differs from the baseline only by Kanz doubles', () => {
    // A REAL key whose committed value contains a character the conversion produces, found by
    // searching the wordlist rather than assumed of `KEY` — 'Register now' contains none of the
    // seven, so writing this against it would have asserted nothing. Its doubled form is built
    // by running the pairs backwards, which is exactly the text a Kanz keyboard emits.
    const target = allEntries().find((e) => e.lsd && KANZ_PAIRS.some((p) => e.lsd.includes(p.single)))
    expect(target, 'no wordlist value contains a Kanz-produced character — this test is vacuous').toBeTruthy()
    const base = baselineValue(target!.english) as string
    // Built from the baked value WITH its direction mark left on. Stripping it first made this
    // test fail against a correct fix: `bakedValue` is a no-op on a value that already carries
    // the mark, but it does not ADD one to a pure-Arabic value, so a stripped baseline never
    // comes back. The store holds what the reviewer typed, doubles and all — not a de-marked
    // variant of it — so this is also the more faithful input.
    const doubled = KANZ_PAIRS.reduce((v, p) => v.split(p.single).join(p.doubled), base)
    expect(doubled).not.toBe(base)              // the input really is doubled
    expect(kanzNormalised(doubled)).toBe(base)  // and converts back exactly

    expect(isMerged(rev(target!.english, doubled))).toBe(true)
  })

  it('does not retire a value that merely LOOKS similar', () => {
    // The control. Retirement must not become "close enough" — it compares converted forms,
    // not shapes.
    expect(isMerged(rev(KEY, `${committed} extra`))).toBe(false)
  })

  it('keeps an override whose value differs', () => {
    expect(isMerged(rev(KEY, `${committed} CHANGED`))).toBe(false)
  })

  it('keeps a new-row for a key the wordlist still does not have', () => {
    expect(isMerged(rev('A string with no wordlist row at all', '', 'new-row'))).toBe(false)
  })


  // ── A new-row that CARRIES a value ──
  //
  // This is what the Page tab sends for every class-C string: the key has no wordlist row, so
  // the kind is `new-row`, and the reviewer has typed a translation into it. `isMerged` used to
  // answer `false` on the kind alone, before looking at the value or the baseline — correct only
  // while `new-row` meant "and no value", which it no longer does. Left as it was, every
  // class-C edit would sit in the pending count permanently, including after the sync had
  // appended the row and the build had baked it.

  it('retires a new-row whose typed value is now the committed one', () => {
    expect(isMerged(rev(KEY, committed as string, 'new-row'))).toBe(true)
  })

  it('keeps a new-row whose typed value is not in the wordlist yet', () => {
    expect(isMerged(rev(KEY, `${committed} CHANGED`, 'new-row'))).toBe(false)
  })

  it('retires a BLANK new-row once the key has a row at all', () => {
    // The blank form asks for the row to exist, nothing more — `scripts/emit-blank-rows.mjs`
    // is what sends it. Comparing its empty value against a filled cell would never match, so
    // a fulfilled request would report as outstanding for as long as the store kept it.
    expect(isMerged(rev(KEY, '', 'new-row'))).toBe(true)
  })

  it('does not retire an override for a key that has no row yet', () => {
    expect(isMerged(rev('A string with no wordlist row at all', 'anything'))).toBe(false)
  })
})
