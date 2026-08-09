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
import { REVIEW_TOOLS } from '../reviewTools'
import { baselineValue } from '../i18n'
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

  it('keeps an override whose value differs', () => {
    expect(isMerged(rev(KEY, `${committed} CHANGED`))).toBe(false)
  })

  it('never retires a new-row request, which has no baseline by definition', () => {
    expect(isMerged(rev('A string with no wordlist row at all', '', 'new-row'))).toBe(false)
  })

  it('does not retire an override for a key that has no row yet', () => {
    expect(isMerged(rev('A string with no wordlist row at all', 'anything'))).toBe(false)
  })
})
