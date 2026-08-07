/**
 * Composed date and time lines — the shared renderer for every `dateLabel` / `timeLabel`.
 *
 * Separate from Bidi.tsx to keep the import graph acyclic: this needs `useT`, and
 * `src/i18n/index.tsx` imports `isolateRuns` from Bidi.tsx. Bidi.tsx therefore stays free of
 * any i18n dependency, and the composition that needs both lives here.
 *
 * ── WHAT CHANGED, AND WHY IT BYPASSES THE WORDLIST ───────────────────────────────
 *
 * `seed.ts` stores dates as display strings (`'Fri, 26 Jun 2026'`) and the wordlist holds a
 * hand-authored LSD translation of each one:
 *
 *     "Fri, 26 Jun 2026" → ‏يوم الجمعة، ٢٦ شهر جون ٢٠٢٦ ﴿١٠ شهر محرم الحرام ١٤٤٨ھ﴾
 *
 * That value renders the GREGORIAN half in Arabic script with Arabic-Indic digits, which
 * inverts the project's date policy: Gregorian is a civil reference that has to match the
 * passports, visas and flight bookings people are cross-checking against, so it stays
 * `26 Jun 2026` in both languages. The Hijri half is the one that gets full LSD treatment.
 *
 * So in LSD the line is COMPOSED here rather than looked up, from three independently
 * isolated parts. The weekday still comes from the wordlist — a weekday name is language,
 * not a numeral, and `Fri → ‏يوم الجمعة` is exactly the kind of thing the dictionary is for.
 *
 * In ENGLISH this component renders the raw string and nothing else, byte for byte as
 * before. The primitives must be a no-op there, and this is where that is guaranteed.
 */
import { useT } from '../i18n/index'
import { Ltr, formatGregorian, formatHijri, formatTime, parseDateLabel } from './Bidi'

/**
 * `Fri, 26 Jun 2026` → `يوم الجمعة، 26 Jun 2026 ﴿١٠ شهر محرم الحرام ١٤٤٨ھ﴾`
 *
 * The ornate brackets sit OUTSIDE both isolates, in the RTL flow. That is what keeps them on
 * the correct ends: a bracket is a neutral character, so if it were inside the Gregorian
 * isolate it would take that run's LTR direction and mirror to the wrong side.
 */
export function DateLine({ value, hijri = true }: { value: string; hijri?: boolean }) {
  const { isLsd, t, lang } = useT()
  if (!isLsd) return <>{value}</>

  const parsed = parseDateLabel(value)
  // An unrecognised shape falls back to the dictionary rather than rendering a broken date.
  if (!parsed) return <>{t(value)}</>

  return (
    <>
      {parsed.weekday ? <>{t(parsed.weekday)}، </> : null}
      {formatGregorian(parsed.date, lang)}
      {hijri ? (
        <>
          {' ﴿'}
          {formatHijri(parsed.date, lang)}
          {'﴾'}
        </>
      ) : null}
    </>
  )
}

/**
 * `05:00 AM IST` as a single LTR isolate in both languages.
 *
 * English is untouched. LSD gets Arabic-Indic digits but keeps left-to-right order — script
 * follows the language, order follows the data, and conflating the two is what produced
 * `AM IST ٠٥:٠٠`.
 */
export function TimeLine({ value }: { value: string }) {
  const { isLsd, lang } = useT()
  if (!isLsd) return <>{value}</>
  return formatTime(value, lang)
}

/**
 * A Hijri date from a real `Date` — the calendar screens already hold Date objects.
 *
 * LSD gets Arabic-script month names and Arabic-Indic digits (`١٠ شهر محرم الحرام ١٤٤٨ھ`);
 * English keeps the transliteration (`10 Muharram 1448H`). EventJourney previously rendered
 * the transliteration in BOTH languages, which is the Gregorian policy applied to the wrong
 * calendar — the exact inverse of the bug on the miqaat list.
 */
export function HijriDate({ date }: { date: Date }) {
  const { lang } = useT()
  return formatHijri(date, lang)
}

/**
 * A deadline sentence such as
 * `Registration closes in Thu, 25 Jun 2026 - 11:59 PM IST`.
 *
 * These DO stay in the wordlist: unlike a bare date they are prose, with an authored verb
 * and word order that no formatter could reconstruct. `tx()` already isolates the Latin and
 * numeric runs inside the translated value, so the only thing needed here is the element to
 * hang it on — which the caller owns. Exported as a named no-op so call sites read
 * consistently and nobody "helpfully" re-composes one of these from parts.
 */
export function LtrData({ children }: { children: React.ReactNode }) {
  const { isLsd } = useT()
  if (!isLsd) return <>{children}</>
  return <Ltr>{children}</Ltr>
}
