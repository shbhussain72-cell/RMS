/**
 * kanzNorm.test.ts — what the conversion PRODUCES, never that it ran.
 *
 * Every assertion below is on the resulting codepoints. `expect(normaliseKanz(x).changed)` is
 * available and is deliberately not the subject of any test here: it observes that the
 * function decided to act, which is the mechanism. If the mapping table were replaced tomorrow
 * with a lookup that produced the same letters, these tests would still pass; if the table
 * stayed and quietly emitted the wrong letter, they would fail. That is the pairing
 * `docs/assertion-discipline.md` asks for.
 *
 * Codepoints rather than glyphs on purpose: ہ (U+06C1), ھ (U+06BE) and ه (U+0647) are three
 * different characters that this font draws similarly — see `docs/kanz-digraphs.md`. A test
 * written against the visible shape would pass on the wrong one.
 */
import { describe, expect, it } from 'vitest'
import { KANZ_PAIRS, describeKanzChanges, hasKanzDoubles, kanzNormalised, normaliseKanz, unmappedDoubles } from './kanzNorm.mjs'
import { detectByteDamage } from '../dev/mojibake.mjs'

/** Codepoints of a string, as `U+XXXX`, so a failure names the character it actually got. */
const cps = (s: string): string[] => [...s].map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`)

describe('the seven pairs each produce their own character', () => {
  const expected: Array<[string, string, string]> = [
    ['ظظ', 'ہ', 'U+06C1'],
    ['ثث', 'پ', 'U+067E'],
    ['سس', 'ے', 'U+06D2'],
    ['كك', 'گ', 'U+06AF'],
    ['حح', 'چ', 'U+0686'],
    ['ضض', 'ٹ', 'U+0679'],
    ['طط', 'ں', 'U+06BA'],
  ]

  it.each(expected)('%s becomes %s', (doubled, single, codepoint) => {
    expect(cps(kanzNormalised(doubled))).toEqual([codepoint])
    expect(kanzNormalised(doubled)).toBe(single)
  })

  it('the table in the module is exactly these seven, in this order', () => {
    expect(KANZ_PAIRS.map((p) => [p.doubled, p.single])).toEqual(expected.map(([d, s]) => [d, s]))
  })
})

describe('the odd-run rule', () => {
  // `سسس` is س + ے, not ے + س. Naive left-to-right replacement gets this backwards, and every
  // instance in the corpus is the former — see the module docblock.
  it('سسس resolves to سے, not ےس', () => {
    expect(cps(kanzNormalised('سسس'))).toEqual(['U+0633', 'U+06D2'])
  })

  it('an even run converts fully', () => {
    expect(cps(kanzNormalised('سسسس'))).toEqual(['U+06D2', 'U+06D2'])
  })

  it('a lone letter is left alone', () => {
    expect(kanzNormalised('س')).toBe('س')
    expect(kanzNormalised('سلام')).toBe('سلام')
  })

  it('the real corpus word جاسسس becomes جاسے', () => {
    expect(kanzNormalised('جاسسس')).toBe('جاسے')
  })
})

describe('he characters are never touched', () => {
  // The wordlist mixes ھ / ہ / ه across 293 rows and resolving that is the owner's call, not
  // this function's. ظظ→ہ legitimately ADDS a gol he; nothing may remove or alter one.
  const HE = 'هھہ'
  const heOf = (s: string) => [...s].filter((c) => HE.includes(c)).join('')

  it.each([
    'تھاوا',      // ھ U+06BE, an aspirate digraph
    'شهر',        // ه U+0647, arabic heh
    'شہر',        // ہ U+06C1, gol he
    'الله',
    'جگہ',
  ])('%s is returned unchanged', (word) => {
    expect(kanzNormalised(word)).toBe(word)
  })

  it('converting a Kanz word beside a he leaves the he alone', () => {
    const before = 'تهاسسس'                    // ه U+0647 followed by a سس run
    const after = kanzNormalised(before)
    expect(after).toBe('تهاسے')
    expect(heOf(after)).toBe(heOf(before))
    expect(cps(after)).toEqual(['U+062A', 'U+0647', 'U+0627', 'U+0633', 'U+06D2'])
  })

  it('ظظ adds a gol he and changes no other he', () => {
    const after = kanzNormalised('مظظمان')
    expect(after).toBe('مہمان')
    expect(cps(after)).toEqual(['U+0645', 'U+06C1', 'U+0645', 'U+0627', 'U+0646'])
  })
})

describe('real values out of the wordlist', () => {
  it.each([
    ['شظظر', 'شہر'],
    ['الشظظر', 'الشہر'],
    ['اْثثنا', 'اْپنا'],
    ['سككلا', 'سگلا'],
    ['ححنو', 'چنو'],
    ['هضضاوو', 'هٹاوو'],
    ['نهيطط', 'نهيں'],
    ['ككروثث', 'گروپ'],
    ['واسطسس', 'واسطے'],
  ])('%s → %s', (before, after) => {
    expect(kanzNormalised(before)).toBe(after)
  })

  it('a whole sentence converts every pair in it', () => {
    expect(kanzNormalised('مظظمان نسس اذن اْثثو'))
      .toBe('مہمان نے اذن اْپو')
  })
})

describe('class A and class B do not overlap', () => {
  it('Kanz input is NOT byte damage — it must not be blocked', () => {
    for (const { doubled } of KANZ_PAIRS) expect(detectByteDamage(`شظظر ${doubled}`)).toEqual([])
    expect(detectByteDamage('مظظمان نسس اذن اْثثو')).toEqual([])
  })

  it('byte damage is NOT Kanz input — normalising must not touch it', () => {
    const damaged = 'Ø§Ù„'                       // UTF-8 read as latin-1
    expect(kanzNormalised(damaged)).toBe(damaged)
    expect(detectByteDamage(damaged).map((f) => f.kind)).toContain('utf8-as-latin1')
  })

  it('a value carrying both is still blocked, and the block wins', () => {
    const both = 'شظظر Ã‰tage'
    expect(detectByteDamage(both).map((f) => f.kind)).toContain('utf8-as-latin1')
    // The conversion is still exact — but the caller must refuse on class A regardless.
    expect(kanzNormalised(both)).toBe('شہر Ã‰tage')
  })
})

describe('reporting', () => {
  it('counts each pair it converted', () => {
    expect(normaliseKanz('شظظر مظظمان نسس').changes).toEqual([
      { doubled: 'ظظ', single: 'ہ', count: 2 },
      { doubled: 'سس', single: 'ے', count: 1 },
    ])
  })

  it('describes a conversion in a line a person can read', () => {
    expect(describeKanzChanges(normaliseKanz('شظظر مظظمان نسس').changes)).toBe('ظظ→ہ ×2, سس→ے')
  })

  it('says nothing when nothing changed', () => {
    expect(describeKanzChanges(normaliseKanz('شہر').changes)).toBe('')
    expect(normaliseKanz('شہر').value).toBe('شہر')
  })

  it('hasKanzDoubles agrees with whether the value actually changes', () => {
    for (const s of ['شظظر', 'مظظمان', 'نسس', 'شہر', 'الله', '', 'Registration']) {
      expect(hasKanzDoubles(s)).toBe(kanzNormalised(s) !== s)
    }
  })
})

describe('صص is reported, never guessed at', () => {
  it('is not in the mapping', () => {
    expect(KANZ_PAIRS.map((p) => p.doubled)).not.toContain('صص')
  })

  it('is left exactly as it was', () => {
    expect(kanzNormalised('اصصل')).toBe('اصصل')
  })

  it('is surfaced so a caller can ask rather than invent a target', () => {
    expect(unmappedDoubles('اصصل')).toEqual(['صص'])
    expect(unmappedDoubles('شظظر')).toEqual([])
  })
})
