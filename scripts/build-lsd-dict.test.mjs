/**
 * Generator tests — the sentinel rule, and the invariant it exists to protect.
 *
 * The bug these guard against was not a crash. `remove` reached `lsd.json` as a normal
 * value, so the dictionary claimed five strings were translated into the English word
 * "remove". Nothing failed; the data was simply wrong, and every downstream consumer would
 * have had to know the sentinel list to avoid printing it to a user.
 *
 * The last test is the important one: it asserts over the REAL generated dictionary, so it
 * fails if a sentinel ever leaks again regardless of which code path let it through.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SENTINELS, classifyValue } from './build-lsd-dict.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('classifyValue', () => {
  it('never returns a sentinel as a value', () => {
    for (const token of SENTINELS) {
      expect(classifyValue(token).value).toBe('')
      expect(classifyValue(token).sentinel).toBe(token)
    }
  })

  it('matches sentinels case-insensitively and after trimming', () => {
    for (const variant of ['remove', 'REMOVE', ' Remove ', 'ReMoVe']) {
      expect(classifyValue(variant)).toEqual({ value: '', sentinel: 'remove', kanz: [] })
    }
  })

  it('does not swallow a real translation that merely contains the word', () => {
    // "remove" as a substring is ordinary copy and must survive untouched.
    const phrase = 'Tap to remove'
    expect(classifyValue(phrase).sentinel).toBeNull()
    expect(classifyValue(phrase).value).toBe(phrase)
    expect(classifyValue('اْ فرد نے remove كرو').sentinel).toBeNull()
  })

  it('passes ordinary LSD values through, adding the RLM hint only to mixed script', () => {
    expect(classifyValue('اختيار الشہر').value).toBe('اختيار الشہر')
    expect(classifyValue('Continue').value).toBe('Continue')
    // Mixed Arabic + Latin gets a leading RLM so its base direction is unambiguous.
    expect(classifyValue('‏Registration بند').value.charCodeAt(0)).toBe(0x200f)
  })

  it('converts Kanz keyboard output on the way into the dictionary', () => {
    // The OUTCOME: the value the app will render. Asserted as codepoints because ہ/ھ/ه are
    // three characters this font draws alike — see docs/kanz-digraphs.md.
    const out = classifyValue('شظظر')
    expect(out.value).toBe('شہر')
    expect([...out.value].map((c) => c.codePointAt(0))).toEqual([0x0634, 0x06C1, 0x0631])
    expect(out.kanz).toEqual([{ doubled: 'ظظ', single: 'ہ', count: 1 }])
  })

  it('leaves a value with no Kanz input exactly as it was', () => {
    expect(classifyValue('شہر').value).toBe('شہر')
    expect(classifyValue('شہر').kanz).toEqual([])
  })

  it('treats an empty cell as empty, not as a sentinel', () => {
    expect(classifyValue('')).toEqual({ value: '', sentinel: null, kanz: [] })
    expect(classifyValue(undefined)).toEqual({ value: '', sentinel: null, kanz: [] })
  })
})

describe('the generated dictionary', () => {
  const dict = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/lsd.json'), 'utf8'))
  const entries = Object.entries(dict).filter(([k]) => k !== '//')

  it('contains no sentinel token as an LSD value', () => {
    const leaked = entries
      .filter(([, v]) => SENTINELS.has(String(v.lsd ?? '').trim().toLowerCase()))
      .map(([k]) => k)
    expect(leaked).toEqual([])
  })

  it('tags sentinel rows so the gap report can list them separately', () => {
    const tagged = entries.filter(([, v]) => v.sentinel)
    // Every tagged row must have an empty value — the tag and the emptiness go together.
    for (const [key, v] of tagged) {
      expect(v.lsd, `${key} is tagged ${v.sentinel} but still carries a value`).toBe('')
      expect(SENTINELS.has(v.sentinel)).toBe(true)
    }
  })
})
