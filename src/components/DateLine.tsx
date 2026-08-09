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
import { Iso, Ltr, formatGregorian, formatGregorianText, formatHijri, formatHijriText, formatTime, parseDateLabel } from './Bidi'
import { notLanguage } from './NotLanguage'

/**
 * `Fri, 26 Jun 2026` → `يوم الجمعة، 26 Jun 2026 ﴿١٠ شهر محرم الحرام ١٤٤٨ھ﴾`
 *
 * The brackets must stay OUT of the GREGORIAN isolate: a bracket is a neutral character, so
 * inside that run it would take its LTR direction and mirror to the wrong side.
 *
 * They must equally not be left loose in the paragraph, which is what they were. Bare text
 * nodes are line-break opportunities, so on any card narrow enough to wrap the date the
 * closing bracket broke onto a line of its own — measured on /miqaats at 390 and 1440 in LSD,
 * five cards, each rendering `... يوم الاحد` and then a solitary bracket below it.
 *
 * So the bracketed Hijri half becomes ONE unit: its own isolate, holding both brackets and
 * the inner Hijri isolate, and non-wrapping. The isolate resolves RTL from its own Arabic
 * content, which is what puts each bracket on its correct end; `nowrap` is what keeps them
 * attached to the date. The line can still break BEFORE the group — this pins ~130px, not
 * the whole line, which is the distinction that made `whitespace-nowrap` wrong on the row
 * itself (see DateTimeRow in MiqaatList).
 *
 * `formatHijriText`, NOT `formatHijri`. The element form returns its own <bdi>, and a nested
 * isolate is opaque to the parent's direction resolution — it counts as a neutral object, so
 * an outer <bdi> holding `bracket + isolate + bracket` sees NO strong character at all and
 * falls back to LTR. Measured: that rendered the group as `﴿date﴾`, the brackets inside-out,
 * the exact defect being fixed. Passing the Arabic as text keeps the strong characters visible
 * to the isolate, it resolves RTL, and the brackets land on their correct ends. One isolate,
 * one direction, no nesting.
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
          {' '}
          <Iso className="whitespace-nowrap">{'﴿' + formatHijriText(parsed.date, lang) + '﴾'}</Iso>
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

/**
 * A deadline label — `Fri, 19 Jun 2026 · 09:00 AM IST` — composed from its three parts.
 *
 * The miqaat list builds these by slicing `deadlineLabel` with a regex and handing the result
 * straight to the DOM, which is the last place in the app where a date reached the screen
 * without passing a formatter. In LSD it read as one Latin blob in an RTL paragraph: the
 * weekday untranslated, the clock in ASCII digits, and the whole run unisolated.
 *
 * `compact` drops the year, which is what the narrow card did with a second regex.
 *
 * An unrecognised shape falls back to the raw string rather than rendering a broken date. That
 * is deliberate: these come from authored fixture text, and a parser that guesses is worse than
 * one that declines.
 */
export function DeadlineLine({ value, compact = false }: { value: string; compact?: boolean }) {
  const { isLsd, t, lang } = useT()
  const m = /^(?:(\w{3}),\s*)?(\d{1,2}\s+\w{3}\s+\d{4})(?:\s*·\s*(.+))?$/.exec(value.trim())
  if (!isLsd || !m) return <>{compact ? value.replace(/\s\d{4}/, '').replace(' IST', '') : value.replace(' IST', '')}</>
  const [, weekday, datePart, timePart] = m
  const parsed = parseDateLabel(datePart)
  if (!parsed) return <>{value}</>
  return (
    <>
      {weekday ? <>{t(weekday)}، </> : null}
      {compact
        // Same Gregorian policy as the full form, so the same `notLanguage` marker: this is
        // `26 Jun` with the year dropped for a narrow card, not a string anyone can translate.
        // Written out rather than reusing `formatGregorian` because the year has to come off
        // the TEXT, and the marker has to travel with it.
        ? <span dir="ltr" style={{ unicodeBidi: 'isolate' }} {...notLanguage}>{formatGregorianText(parsed.date).replace(/\s\d{4}$/, '')}</span>
        : formatGregorian(parsed.date, lang)}
      {timePart ? <> · {formatTime(timePart.replace(' IST', ''), lang)}</> : null}
    </>
  )
}
