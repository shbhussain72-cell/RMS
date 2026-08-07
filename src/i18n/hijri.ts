/**
 * Hijri (Islamic) calendar conversion — the single source of truth for the whole app.
 *
 * Lifted verbatim out of EventJourney.tsx, which was the only place that knew how to do
 * this. Nothing about the arithmetic changed; it moved so that the calendar choice is made
 * ONCE and every screen agrees, rather than each growing its own copy.
 *
 * ── WHICH CALENDAR, AND HOW WE KNOW ──────────────────────────────────────────────
 *
 * `islamic-civil` is ICU's tabular/arithmetic Hijri calendar: deterministic across browsers
 * and ICU versions, unlike `islamic` (Umm al-Qura), which is sighting-based and can shift
 * when the ICU data is updated.
 *
 * This is NOT an arbitrary pick, and it is NOT the Fatimid/Misri calendar. It is the
 * calendar the WORDLIST WAS AUTHORED AGAINST — which is the only evidence that actually
 * settles the question, because a human translator wrote those dates by hand:
 *
 *     "Fri, 26 Jun 2026"  →  ‏… ﴿١٠ شهر محرم الحرام ١٤٤٨ھ﴾     islamic-civil: 10 Muharram 1448  ✓
 *     "Wed, 29 Jul 2026"  →  ‏… ﴿١٣ شهر صفر المظفر ١٤٤٨ھ﴾      islamic-civil: 13 Safar 1448     ✓
 *     "Sat, 26 Sep 2026"  →  ‏… ﴿١٣ شهر ربيع الاخر ١٤٤٨ھ﴾      islamic-civil: 13 Rabi II 1448   ✓
 *
 * For contrast, the Fatimid/Misri tabular calendar (30-year cycle, leap years
 * 2·5·8·10·13·16·19·21·24·27·29) puts 1 Muharram 1448 at 15 Jun 2026, roughly two days
 * from islamic-civil. If the project ever decides Misri is correct, this is the ONLY file
 * that has to change — but doing so would put every rendered date two days away from the
 * hand-authored wordlist values above, so it is a wordlist decision as much as a code one.
 */

const HIJRI_FMT = new Intl.DateTimeFormat('en-u-ca-islamic-civil', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
})

/** English/transliterated Hijri month names — what EN mode shows. */
const HIJRI_MONTH_FMT = new Intl.DateTimeFormat('en-u-ca-islamic-civil', { month: 'long' })

export interface HijriParts {
  day: number
  /** 1-based, so it indexes MONTHS_* directly after subtracting one. */
  month: number
  year: number
}

export function hijriParts(date: Date): HijriParts {
  const parts = HIJRI_FMT.formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { day: get('day'), month: get('month'), year: get('year') }
}

/**
 * Hijri month names in Lisan al-Dawat, in calendar order.
 *
 * Copied from the wordlist rather than invented — these are the exact values the translator
 * authored for the `calendar`/`permanent` rows (`Muharram` → `شهر محرم الحرام`), so a Hijri
 * date composed here is indistinguishable from one that came through the dictionary.
 *
 * Held here as a literal, not looked up at render time, because the lookup key would be the
 * ICU English name (`Dhuʻl-Hijjah`, with U+02BB) while the wordlist is keyed on the plain
 * ASCII spelling (`Dhu al-Hijjah`) — a mismatch that would silently fall back to English.
 */
export const HIJRI_MONTHS_LSD = [
  'شهر محرم الحرام',
  'شهر صفر المظفر',
  'شهر ربيع الاول',
  'شهر ربيع الاخر',
  'شهر جمادى الاولى',
  'شهر جمادى الاخرى',
  'شهر رجب الاصب',
  'شهر شعبان الكريم',
  'شهر رمضان المعظم',
  'شهر شوال المكرم',
  'شهر ذي القعدة الحرام',
  'شهر ذي الحجة الحرام',
] as const

/**
 * English/transliterated Hijri month names, in calendar order.
 *
 * Held as a literal alongside the LSD list rather than read from `HIJRI_MONTH_FMT`, so the
 * two languages are indexed the same way and a caller cannot accidentally pair an LSD name
 * with an English one. The spellings match ICU's `islamic-civil` output.
 */
export const HIJRI_MONTHS_EN = [
  'Muharram',
  'Safar',
  'Rabiʻ I',
  'Rabiʻ II',
  'Jumada I',
  'Jumada II',
  'Rajab',
  'Shaʻban',
  'Ramadan',
  'Shawwal',
  'Dhuʻl-Qiʻdah',
  'Dhuʻl-Hijjah',
] as const

/** The Hijri year suffix — ھ in LSD (as authored in the wordlist), `H` in English. */
export const HIJRI_SUFFIX_LSD = 'ھ'

/** English Hijri month name for `date`, e.g. `Dhuʻl-Hijjah`. */
export const hijriMonthNameEn = (date: Date): string => HIJRI_MONTH_FMT.format(date)

/** LSD Hijri month name for `date`, e.g. `شهر محرم الحرام`. */
export const hijriMonthNameLsd = (date: Date): string =>
  HIJRI_MONTHS_LSD[hijriParts(date).month - 1] ?? ''

/**
 * The Hijri month/year covering most days of a given Gregorian month.
 *
 * Used only for a calendar header label: a Gregorian month always straddles two Hijri
 * months, and the header has to name one of them.
 */
export function dominantHijriMonth(year: number, month: number): { monthIndex: number; year: number } {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const counts = new Map<string, { count: number; monthIndex: number; year: number }>()
  for (let d = 1; d <= daysInMonth; d++) {
    const { month: hm, year: hy } = hijriParts(new Date(year, month, d))
    const key = `${hy}-${hm}`
    const entry = counts.get(key) ?? { count: 0, monthIndex: hm - 1, year: hy }
    entry.count++
    counts.set(key, entry)
  }
  let best = { count: -1, monthIndex: 0, year: 0 }
  counts.forEach((v) => {
    if (v.count > best.count) best = v
  })
  return { monthIndex: best.monthIndex, year: best.year }
}
