/**
 * Bidi formatter tests.
 *
 * Rendered with `renderToStaticMarkup` rather than a DOM harness: every property under test
 * is observable in the emitted markup (`dir`, `unicode-bidi`, element boundaries), so a
 * jsdom + testing-library stack would add two dependencies and buy nothing.
 *
 * The assertions that matter most are the ORDER and BOUNDARY ones. Checking that
 * `formatTimeText` returns the right characters is necessary but weak — the historical bug
 * produced exactly the right characters in the wrong visual order. What actually prevents a
 * regression is asserting the time is ONE isolate, because a single LTR isolate cannot be
 * reordered by the paragraph around it no matter what that paragraph contains.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  Count,
  Iso,
  Ltr,
  formatGregorian,
  formatGregorianText,
  formatHijri,
  formatHijriText,
  formatNumber,
  formatTime,
  formatTimeText,
  isolateRuns,
  parseDateLabel,
  splitBidiRuns,
  toArabicDigits,
} from './Bidi'
import lsdDict from '../i18n/lsd.json'

const html = (node: React.ReactElement) => renderToStaticMarkup(node)

/** The seed's flagship fixture: Ashara Mubaraka 1448H. */
const ASHARA = 'Fri, 26 Jun 2026'

describe('formatNumber', () => {
  it('uses Latin digits in English', () => {
    expect(formatNumber(3, 'en')).toBe('3')
    expect(formatNumber(1448, 'en')).toBe('1448')
  })

  it('uses Arabic-Indic digits in LSD', () => {
    expect(formatNumber(3, 'lsd')).toBe('٣')
    expect(formatNumber(1448, 'lsd')).toBe('١٤٤٨')
  })

  it('never groups — a year must not become ١٬٤٤٨', () => {
    expect(formatNumber(1448, 'lsd')).not.toContain('٬')
    expect(formatNumber(2026, 'en')).toBe('2026')
  })

  it('maps digits in place without losing zero-padding', () => {
    // formatNumber(7) is ٧; a countdown tile needs ٠٧, which is why toArabicDigits exists.
    expect(toArabicDigits('07')).toBe('٠٧')
    expect(toArabicDigits('05:00')).toBe('٠٥:٠٠')
  })
})

describe('formatGregorian', () => {
  it('is identical in both languages — English months, Latin digits', () => {
    expect(formatGregorianText(ASHARA)).toBe('26 Jun 2026')
    // The policy is that the two languages agree, so assert they literally do.
    expect(html(formatGregorian(ASHARA, 'en'))).toBe(html(formatGregorian(ASHARA, 'lsd')))
  })

  it('renders inside an LTR isolate', () => {
    const out = html(formatGregorian(ASHARA, 'lsd'))
    expect(out).toContain('dir="ltr"')
    expect(out).toContain('unicode-bidi:isolate')
  })

  it('accepts a Date as well as the seed string form', () => {
    expect(formatGregorianText(new Date(2026, 5, 26, 12))).toBe('26 Jun 2026')
  })

  it('passes an unparseable string through rather than rendering an empty date', () => {
    expect(formatGregorianText('sometime next year')).toBe('sometime next year')
  })

  it('parses the weekday out separately so it can stay translatable', () => {
    expect(parseDateLabel(ASHARA)?.weekday).toBe('Fri')
    expect(parseDateLabel('26 Jun 2026')?.weekday).toBe('')
  })
})

describe('formatHijri', () => {
  it('renders Arabic-script months and Arabic-Indic digits in LSD', () => {
    // Matches the hand-authored wordlist value for this date exactly — see src/i18n/hijri.ts.
    expect(formatHijriText(ASHARA, 'lsd')).toBe('١٠ شهر محرم الحرام ١٤٤٨ھ')
  })

  it('renders a Latin transliteration in English', () => {
    // Byte-identical to EventJourney's previous output: the primitives must not change EN.
    expect(formatHijriText(ASHARA, 'en')).toBe('10 Muharram 1448')
  })

  it('is the mirror of the Gregorian policy — the two must differ by language', () => {
    expect(formatHijriText(ASHARA, 'en')).not.toBe(formatHijriText(ASHARA, 'lsd'))
    expect(formatGregorianText(ASHARA)).toBe(formatGregorianText(ASHARA))
  })

  it('agrees with the wordlist on a second, independently authored date', () => {
    // "Wed, 29 Jul 2026" → ﴿١٣ شهر صفر المظفر ١٤٤٨ھ﴾
    expect(formatHijriText('Wed, 29 Jul 2026', 'lsd')).toBe('١٣ شهر صفر المظفر ١٤٤٨ھ')
  })

  it('uses an auto isolate, so direction follows the script of the value', () => {
    expect(html(formatHijri(ASHARA, 'lsd'))).toContain('<bdi')
    expect(html(formatHijri(ASHARA, 'en'))).toContain('<bdi')
  })
})

describe('formatTime', () => {
  it('keeps Latin digits in English', () => {
    expect(formatTimeText('05:00 AM IST', 'en')).toBe('05:00 AM IST')
  })

  it('uses Arabic-Indic digits in LSD but keeps left-to-right order', () => {
    expect(formatTimeText('05:00 AM IST', 'lsd')).toBe('٠٥:٠٠ AM IST')
  })

  it('never emits the reversed form the bug produced', () => {
    expect(formatTimeText('05:00 AM IST', 'lsd')).not.toBe('AM IST ٠٥:٠٠')
    expect(formatTimeText('05:00 AM IST', 'lsd').indexOf('٠٥:٠٠')).toBeLessThan(
      formatTimeText('05:00 AM IST', 'lsd').indexOf('AM'),
    )
  })

  it('is ONE isolate — the time is never split across elements', () => {
    const out = html(formatTime('05:00 AM IST', 'lsd'))
    // Exactly one wrapper: two spans would let the paragraph reorder the halves, which is
    // precisely how "٠٥:٠٠ AM IST" became "AM IST ٠٥:٠٠".
    expect(out.match(/<span/g)).toHaveLength(1)
    expect(out).toBe('<span dir="ltr" style="unicode-bidi:isolate">٠٥:٠٠ AM IST</span>')
  })

  it('pads a single-digit hour so tiles do not jitter', () => {
    expect(formatTimeText('9:00 AM IST', 'lsd')).toBe('٠٩:٠٠ AM IST')
  })

  it('accepts a Date', () => {
    expect(formatTimeText(new Date(2026, 5, 26, 17, 5), 'en')).toBe('05:05 PM')
  })
})

describe('primitives', () => {
  it('Ltr pins direction and isolates', () => {
    expect(html(<Ltr>ITS 30412345</Ltr>)).toBe(
      '<span dir="ltr" style="unicode-bidi:isolate">ITS 30412345</span>',
    )
  })

  it('Iso isolates without pinning direction', () => {
    const out = html(<Iso>Colombo</Iso>)
    expect(out).toContain('<bdi')
    expect(out).not.toContain('dir=')
  })

  it('Count isolates a bracketed number', () => {
    expect(html(<Count value={3} lang="lsd" />)).toContain('٣')
    expect(html(<Count value={3} lang="lsd" />)).toContain('<bdi')
  })
})

describe('mixed-script sentence', () => {
  /**
   * The integration case the whole module exists for: LSD prose containing an untranslated
   * Latin token, a bracketed Gregorian/Hijri date pair, and a trailing full stop.
   *
   * Each of the four risky runs must be independently isolated. If any one of them is bare,
   * the bidi algorithm is free to drag the brackets or the full stop to the wrong end.
   */
  const sentence = (
    <p dir="rtl" lang="gu-Arab">
      <Iso>Registration</Iso>
      {' نا روز '}
      {formatGregorian(ASHARA, 'lsd')}
      {' ﴿'}
      {formatHijri(ASHARA, 'lsd')}
      {'﴾ '}
      {formatTime('05:00 AM IST', 'lsd')}
      {' وگے بند تھاسے.'}
    </p>
  )

  it('isolates every Latin, numeric and bracketed run', () => {
    const out = html(sentence)
    // One bdi for the Latin token, one for the Hijri half; one Ltr span each for the
    // Gregorian date and the time.
    expect(out.match(/<bdi/g)).toHaveLength(2)
    expect(out.match(/<span dir="ltr"/g)).toHaveLength(2)
  })

  it('keeps both date halves in their own isolate so the brackets stay attached', () => {
    const out = html(sentence)
    // The ornate brackets sit OUTSIDE the isolates, in the RTL text, which is what keeps
    // them on the correct ends. Inside would make them part of the LTR run.
    expect(out).toContain('﴿<bdi')
    expect(out).toContain('</bdi>﴾')
  })

  it('leaves the full stop in the RTL run, not glued to a Latin isolate', () => {
    expect(html(sentence)).toMatch(/تھاسے\.<\/p>$/)
  })

  it('carries an explicit base direction, without which nothing above is guaranteed', () => {
    expect(html(sentence)).toContain('dir="rtl"')
  })
})

describe('splitBidiRuns / isolateRuns', () => {
  it('leaves a pure-Arabic string untouched', () => {
    expect(isolateRuns('اختيار الشہر')).toBe('اختيار الشہر')
  })

  it('leaves a pure-Latin string untouched (English mode adds no DOM)', () => {
    expect(isolateRuns('City selection')).toBe('City selection')
  })

  it('isolates a Latin token embedded in Arabic prose', () => {
    const runs = splitBidiRuns('‏Registration بند تھئي گئي چھے.')
    expect(runs.filter((r) => !r.arabic).map((r) => r.text)).toEqual(['Registration'])
  })

  it('keeps a clock time as ONE run — digits and meridiem together', () => {
    // Splitting these would put "AM IST" to the left of the digits: the original bug.
    const runs = splitBidiRuns('٠٥:٠٠ AM IST')
    expect(runs.filter((r) => !r.arabic).map((r) => r.text)).toEqual(['٠٥:٠٠ AM IST'])
  })

  it('isolates each foreign run of a real wordlist sentence', () => {
    const runs = splitBidiRuns('‏Registration 5 June 2026 نا روز رات نا 11:59 وگے بند تھاسے.')
    expect(runs.filter((r) => !r.arabic).map((r) => r.text)).toEqual([
      'Registration 5 June 2026',
      '11:59',
    ])
  })

  it('leaves the trailing full stop in the Arabic run', () => {
    const runs = splitBidiRuns('‏Registration بند تھئي چھے.')
    expect(runs[runs.length - 1].arabic).toBe(true)
    expect(runs[runs.length - 1].text.endsWith('.')).toBe(true)
  })

  it('keeps ornate brackets outside the isolate so they stay on the right ends', () => {
    const runs = splitBidiRuns('يوم الجمعة، ٢٦ Jun 2026 ﴿١٠ شهر محرم الحرام ١٤٤٨ھ﴾')
    const foreign = runs.filter((r) => !r.arabic).map((r) => r.text)
    expect(foreign).toEqual(['٢٦ Jun 2026'])
    expect(runs[runs.length - 1].text).toContain('﴾')
  })

  it('round-trips — isolation never changes the characters, only their grouping', () => {
    for (const s of [
      '‏Registration 5 June 2026 نا روز رات نا 11:59 وگے بند تھاسے.',
      '٠٥:٠٠ AM IST',
      'يوم الجمعة، ٢٦ Jun 2026 ﴿١٠ شهر محرم الحرام ١٤٤٨ھ﴾',
      '‏اْثثنو مرحلو 1 نو وقت 19 Jun 09:00 AM سي 20 Jun 09:00 AM IST لگي چالو چھے.',
    ]) {
      expect(splitBidiRuns(s).map((r) => r.text).join('')).toBe(s)
    }
  })
})

describe('splitBidiRuns against the real wordlist', () => {
  /**
   * The unit cases above are hand-picked and therefore prove little on their own. This runs
   * the splitter over every value the app will actually render, asserting the one property
   * that must hold universally: isolation REGROUPS characters, it never changes them.
   *
   * A splitter that silently dropped an RLM, a combining mark or a bracket would pass every
   * hand-written case above and corrupt the app.
   */
  const values = Object.values(lsdDict as Record<string, { lsd?: string }>).map((v) => String(v.lsd ?? ''))

  it('round-trips every dictionary value without altering a single character', () => {
    const broken = values.filter((v) => splitBidiRuns(v).map((r) => r.text).join('') !== v)
    expect(broken).toEqual([])
  })

  it('never leaves a foreign run starting or ending on whitespace', () => {
    const bad = values.flatMap((v) =>
      splitBidiRuns(v)
        .filter((r) => !r.arabic && r.text !== r.text.trim())
        .map((r) => `${v} → [${r.text}]`),
    )
    expect(bad).toEqual([])
  })

  it('actually has work to do — a no-op splitter would pass the tests above', () => {
    const needing = values.filter((v) => splitBidiRuns(v).some((r) => !r.arabic))
    // Guards against the splitter regressing into "return the whole string as one run".
    expect(needing.length).toBeGreaterThan(100)
  })
})
