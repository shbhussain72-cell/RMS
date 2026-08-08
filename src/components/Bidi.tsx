/**
 * Bidirectional-text primitives.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────────
 *
 * In LSD the document is `dir="rtl"`, so every text node's BASE direction is RTL. The
 * Unicode bidi algorithm then reorders any Latin or numeric run inside that node relative
 * to the Arabic around it. For pure prose that is exactly right. For DATA it is a bug:
 *
 *     "٠٥:٠٠ AM IST"   renders as   "AM IST ٠٥:٠٠"
 *     "(٢٦ Jun 2026)"  loses its brackets to opposite ends
 *     "عربي."          puts the full stop at the visual START of the line
 *
 * All three are the same defect: a run whose internal order is left-to-right sitting in a
 * right-to-left paragraph with nothing telling the algorithm where the run begins and ends.
 *
 * ── THE FIX, AND THE ONE RULE ────────────────────────────────────────────────────
 *
 * ISOLATION ONLY. We never reorder a source string, never move punctuation, and never
 * splice U+200E/U+200F into text to nudge the algorithm. Those "fixes" work on the one
 * string you tested and break the next one, because they fight the algorithm instead of
 * telling it the truth. An isolate states a fact — "this span is a self-contained run with
 * its own direction" — and the algorithm does the rest, correctly, for every input.
 *
 * `<bdi>` (via `<Iso>`) is the general tool: it isolates a run AND resolves its direction
 * from its own content, which is what you want for a value you did not author (a person's
 * name, a city). `<Ltr>` is the specific tool: it isolates AND pins direction to LTR, for
 * data that is left-to-right no matter what script its digits are drawn in — clock times,
 * ITS ids, file sizes, version numbers.
 *
 * ── WHY COMPONENTS AND NOT A CSS CLASS ───────────────────────────────────────────
 *
 * The app already had a `[data-numeric]` CSS rule doing roughly this. It failed in practice
 * because it is opt-in at every call site and call sites forget: 11 elements carried the
 * attribute while dozens more rendered the same kind of data without it. Returning an
 * element from the formatter means the isolation ships WITH the value and cannot be
 * forgotten — you cannot render a time through `formatTime` and accidentally leave it bare.
 */
import type { ReactNode } from 'react'
import {
  HIJRI_SUFFIX_LSD,
  hijriMonthNameEn,
  hijriMonthNameLsd,
  hijriParts,
} from '../i18n/hijri'

export type Lang = 'en' | 'lsd'

// ─── primitives ───────────────────────────────────────────────────────────────

/**
 * Auto-isolating wrapper — `<bdi>`.
 *
 * Direction is resolved from the content, so this is the right choice for values whose
 * script you do not control: a mumineen name may be Arabic or Latin, and `<bdi>` gets both
 * right without the call site knowing which it has.
 *
 * `<bdi>` carries `unicode-bidi: isolate` in the UA stylesheet, but this app force-sets
 * font-family on `html[data-lang='lsd'] *` with `!important`, and a sufficiently blunt
 * author rule elsewhere could out-specify the UA default — so the property is restated
 * inline. Costs nothing and removes a class of very confusing regressions.
 */
export function Iso({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi className={className} style={{ unicodeBidi: 'isolate' }}>
      {children}
    </bdi>
  )
}

/**
 * Left-to-right isolate — for data that reads LTR regardless of the surrounding language.
 *
 * `unicode-bidi: isolate` rather than `embed`: isolation also hides the span's content from
 * the OUTER paragraph's bidi resolution, so a trailing bracket or full stop after the span
 * cannot be dragged inside it. `embed` would leave that hole open.
 */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={className} style={{ unicodeBidi: 'isolate' }}>
      {children}
    </span>
  )
}

// ─── digits ───────────────────────────────────────────────────────────────────

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

/**
 * Map ASCII digits to Arabic-Indic in place, leaving everything else untouched.
 *
 * Distinct from `formatNumber` on purpose: this operates on an already-formatted STRING and
 * so preserves zero-padding, colons and separators. `formatNumber(7)` yields `٧`, but a
 * countdown tile needs `٠٧` — the pad is layout, and Intl has no way to keep it.
 */
export const toArabicDigits = (s: string): string => s.replace(/[0-9]/g, (d) => ARABIC_INDIC[+d])

/**
 * Locale-correct number formatting.
 *
 * `ar-u-nu-arab` selects the Arabic-Indic numbering system explicitly rather than relying on
 * the default for a bare `ar` locale, which varies by region (Egypt uses Arabic-Indic, the
 * Maghreb uses ASCII) and would make output depend on the user's machine.
 */
export function formatNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'lsd' ? 'ar-u-nu-arab' : 'en', {
    useGrouping: false,
  }).format(n)
}

// ─── parsing the seed's string dates ──────────────────────────────────────────
//
// Dates and times live in src/data/seed.ts as display strings (`'Fri, 26 Jun 2026'`,
// `'05:00 AM IST'`) rather than Date objects or ISO stamps. The formatters therefore accept
// either a Date or the string form, so call sites can pass what they already have instead of
// every screen growing its own parser.

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface ParsedDate {
  date: Date
  /** The weekday abbreviation as authored (`Fri`), or '' when the string carried none. */
  weekday: string
}

/** Parse `'Fri, 26 Jun 2026'` / `'26 Jun 2026'`. Returns null when the shape is unrecognised. */
export function parseDateLabel(input: Date | string): ParsedDate | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : { date: input, weekday: '' }
  const m = /^(?:(\w{3}),\s*)?(\d{1,2})\s+(\w{3})\w*\s+(\d{4})$/.exec(input.trim())
  if (!m) return null
  const month = MONTHS_EN.indexOf(m[3].slice(0, 3))
  if (month < 0) return null
  // Midday, not midnight: the app pins the browser to Asia/Kolkata but a Date built at
  // 00:00 local is one UTC-offset away from tipping into the previous day, which would
  // silently shift every Hijri conversion by one.
  const date = new Date(+m[4], month, +m[2], 12)
  return Number.isNaN(date.getTime()) ? null : { date, weekday: m[1] ?? '' }
}

/** Parse `'05:00 AM IST'` / `'9:00 AM IST'`. Returns null when the shape is unrecognised. */
export function parseTimeLabel(input: string): { hh: string; mm: string; meridiem: string; zone: string } | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?\s*([A-Z]{2,4})?$/.exec(input.trim())
  if (!m) return null
  return { hh: m[1], mm: m[2], meridiem: m[3] ?? '', zone: m[4] ?? '' }
}

// ─── formatters ───────────────────────────────────────────────────────────────

/**
 * Gregorian date text — English month names and Latin digits in BOTH languages.
 *
 * This is a deliberate project policy, not an oversight. A Gregorian date is a civil
 * reference that mumineen cross-check against passports, visas and flight bookings, all of
 * which print `26 Jun 2026`. Rendering it as `٢٦ شهر جون ٢٠٢٦` makes that check harder, not
 * easier. The HIJRI date is the one that gets full LSD treatment (see `formatHijriText`),
 * because that is the religious date and it has no external document to agree with.
 *
 * Note this intentionally BYPASSES the wordlist, which holds hand-authored Arabic-script
 * Gregorian values for ~12 date strings. Those rows are now unused for their Gregorian half.
 */
export function formatGregorianText(input: Date | string): string {
  const parsed = parseDateLabel(input)
  if (!parsed) return typeof input === 'string' ? input : ''
  const { date } = parsed
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_EN[date.getMonth()]} ${date.getFullYear()}`
}

/** `formatGregorianText` wrapped in an LTR isolate — the form to render. */
export function formatGregorian(input: Date | string, _lang: Lang) {
  return <Ltr>{formatGregorianText(input)}</Ltr>
}

/**
 * Hijri date text — Arabic-script months and Arabic-Indic digits in LSD, transliteration in EN.
 *
 * `١٠ شهر محرم الحرام ١٤٤٨ھ` vs `10 Muharram 1448H`. See src/i18n/hijri.ts for why the
 * conversion uses islamic-civil and what evidence settles that.
 */
export function formatHijriText(input: Date | string, lang: Lang): string {
  const parsed = parseDateLabel(input)
  if (!parsed) return ''
  const { date } = parsed
  const { day, year } = hijriParts(date)
  // No `H` suffix in English: this reproduces EventJourney's previous output byte for byte,
  // and the brief requires the primitives to be a no-op in EN. (`Ashara Mubaraka 1448H` in a
  // miqaat TITLE is authored copy from seed.ts, not this formatter.)
  if (lang !== 'lsd') return `${String(day).padStart(2, '0')} ${hijriMonthNameEn(date)} ${year}`
  const d = toArabicDigits(String(day).padStart(2, '0'))
  const y = toArabicDigits(String(year))
  return `${d} ${hijriMonthNameLsd(date)} ${y}${HIJRI_SUFFIX_LSD}`
}

/**
 * `formatHijriText` in its own isolate.
 *
 * `<Iso>` and not `<Ltr>`: in LSD this run is genuinely right-to-left (Arabic month name,
 * Arabic-Indic digits) and must resolve as such, while in EN it is Latin. `<bdi>` reads the
 * content and gets both right — pinning a direction here would break one of the two.
 */
export function formatHijri(input: Date | string, lang: Lang) {
  return <Iso>{formatHijriText(input, lang)}</Iso>
}

/**
 * Clock time — ONE left-to-right unit, never split across elements.
 *
 * `05:00 AM IST` is a single indivisible token. Rendering the digits, the meridiem and the
 * zone as separate spans lets the RTL paragraph reorder them into `AM IST ٠٥:٠٠`, which is
 * the exact bug this exists to prevent — so the whole thing is one `<Ltr>` and callers are
 * given no way to take it apart.
 *
 * Digits become Arabic-Indic in LSD (the script follows the language) while the ORDER stays
 * left-to-right (the semantics follow the data). Those are separate questions and the app
 * previously conflated them.
 */
export function formatTimeText(input: Date | string, lang: Lang): string {
  let hh: string, mm: string, meridiem: string, zone: string
  if (input instanceof Date) {
    const h24 = input.getHours()
    hh = String(h24 % 12 === 0 ? 12 : h24 % 12).padStart(2, '0')
    mm = String(input.getMinutes()).padStart(2, '0')
    meridiem = h24 < 12 ? 'AM' : 'PM'
    zone = ''
  } else {
    const p = parseTimeLabel(input)
    if (!p) return input
    ;({ hh, mm, meridiem, zone } = p)
    hh = hh.padStart(2, '0')
  }
  const digits = lang === 'lsd' ? toArabicDigits(`${hh}:${mm}`) : `${hh}:${mm}`
  return [digits, meridiem, zone].filter(Boolean).join(' ')
}

/** `formatTimeText` as a single LTR isolate — the form to render. */
export function formatTime(input: Date | string, lang: Lang) {
  return <Ltr>{formatTimeText(input, lang)}</Ltr>
}

/**
 * A remaining-time span as text: `4d 6h`, `2h 15m`, `45m`.
 *
 * The one addition the typography session permitted, and it exists because durations were the
 * last thing still printing raw English through a template string — `${d}d ${h}h left` cannot
 * localise its unit letters and cannot put the number anywhere but first.
 *
 * UNITS ARE NOT TRANSLATED HERE. `d`/`h`/`m` are returned as written and left for the caller to
 * route through the dictionary if the wordlist ever gains rows for them; this function's job is
 * the NUMERALS and the shape. Authoring Lisan al-Dawat for a unit abbreviation is not this
 * layer's call to make.
 *
 * Zero-suppressing the leading unit is deliberate: `0d 6h` is noise, and `6h` is what a person
 * reading a countdown wants. The largest non-zero unit and the one below it, never three.
 */
export function formatDurationText(totalMinutes: number, lang: Lang): string {
  const mins = Math.max(0, Math.floor(totalMinutes))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const n = (v: number) => formatNumber(v, lang)
  if (d > 0) return h > 0 ? `${n(d)}d ${n(h)}h` : `${n(d)}d`
  if (h > 0) return m > 0 ? `${n(h)}h ${n(m)}m` : `${n(h)}h`
  return `${n(m)}m`
}

/** The same value as an isolated element, so it cannot reorder inside RTL prose. */
export function formatDuration(totalMinutes: number, lang: Lang) {
  return <Ltr>{formatDurationText(totalMinutes, lang)}</Ltr>
}

// ─── automatic run isolation ──────────────────────────────────────────────────

/**
 * Arabic-script LETTERS — deliberately excluding Arabic-Indic digits (U+0660–0669,
 * U+06F0–06F9) and the ornate brackets ﴾﴿ (U+FD3E/FD3F), which are punctuation.
 * Written as escapes because several of these ranges end at invisible characters.
 */
const ARABIC_LETTER =
  /[ؠ-يٮ-ۓەۥۦۮۯۺ-ۿݐ-ݿﭐ-ﴽﵐ-﷿ﹰ-ﻼ]/
/**
 * Arabic punctuation that DELIMITS Arabic content, and so terminates a foreign run.
 *
 * The ornate brackets ﴾﴿ are the load-bearing members here. Without them, a bracketed Hijri
 * date following a Gregorian one (`٢٦ Jun 2026 ﴿١٠ شهر محرم…`) has its opening bracket and
 * the digits after it swallowed into the Gregorian isolate — the run only stops at the next
 * Arabic LETTER, which is three characters too late, and the two date halves fuse.
 */
const ARABIC_PUNCT = /[،؛؟۔﴾﴿]/
/** A run is worth isolating only if it holds a Latin letter or an ASCII digit. */
const NEEDS_ISOLATION = /[A-Za-z0-9]/
/** Arabic-Indic digits — neutral, but they STICK to an adjacent foreign run (see below). */
const ARABIC_DIGIT = /[٠-٩۰-۹]/

/**
 * Split a mixed-script string into Arabic and foreign runs.
 *
 * ── WHY THIS IS DONE STRUCTURALLY ────────────────────────────────────────────────
 *
 * The wordlist holds 1080 values and 138 of them begin with a Latin token; many more embed
 * one mid-sentence (`‏Registration 5 June 2026 نا روز … 11:59 وگے بند تھاسے.`). Each of those
 * is ONE text node, so no amount of wrapping at the CALL SITE can isolate the Latin inside
 * it — the isolation has to happen when the string is turned into children.
 *
 * Doing it here fixes the entire class in one place, for every value, without hand-editing
 * a single dictionary row and without touching `lsd.json`. The alternative — annotating
 * hundreds of call sites — is what the existing `[data-numeric]` attribute tried, and it
 * reached 11 elements before people stopped remembering.
 *
 * ── THE GROUPING RULE, AND WHY IT IS NOT PER-TOKEN ───────────────────────────────
 *
 * A foreign run absorbs neighbouring digits and the neutral characters BETWEEN them, so
 * `٠٥:٠٠ AM IST` stays a single run. Isolating `AM IST` on its own would be worse than
 * doing nothing: the Arabic-Indic digits would remain in the RTL flow and the meridiem
 * would move to their left, reproducing `AM IST ٠٥:٠٠` — the exact bug — while looking as
 * though it had been handled.
 */
export function splitBidiRuns(text: string): Array<{ arabic: boolean; text: string }> {
  const chars = [...text]
  const isAnchor = (ch: string) => ARABIC_LETTER.test(ch) || ARABIC_PUNCT.test(ch)
  /** Characters a foreign run may begin or end on. Neutrals may only sit BETWEEN them. */
  const isCore = (ch: string) => NEEDS_ISOLATION.test(ch) || ARABIC_DIGIT.test(ch)

  // 1. Cut the string at Arabic anchors. Everything between two anchors is a candidate.
  const segments: Array<{ anchor: boolean; text: string }> = []
  for (const ch of chars) {
    const anchor = isAnchor(ch)
    const last = segments[segments.length - 1]
    if (last && last.anchor === anchor) last.text += ch
    else segments.push({ anchor, text: ch })
  }

  // 2. A candidate becomes a foreign run only if it holds a Latin letter or ASCII digit —
  //    a segment of bare Arabic-Indic digits is already correct in RTL and is left alone.
  //    Leading/trailing NEUTRALS are handed back to the Arabic side so a space, an RLM or a
  //    full stop never ends up inside the isolate; Arabic-Indic digits are NOT trimmed,
  //    which is what keeps `٠٥:٠٠` bound to the `AM IST` that follows it.
  const out: Array<{ arabic: boolean; text: string }> = []
  for (const seg of segments) {
    if (seg.anchor || !NEEDS_ISOLATION.test(seg.text)) {
      out.push({ arabic: true, text: seg.text })
      continue
    }
    const s = [...seg.text]
    let start = 0
    let end = s.length - 1
    while (start < s.length && !isCore(s[start])) start++
    while (end >= 0 && !isCore(s[end])) end--
    if (start > 0) out.push({ arabic: true, text: s.slice(0, start).join('') })
    out.push({ arabic: false, text: s.slice(start, end + 1).join('') })
    if (end < s.length - 1) out.push({ arabic: true, text: s.slice(end + 1).join('') })
  }

  // 3. Merge adjacent same-kind runs so the output has no redundant boundaries.
  return out.reduce<Array<{ arabic: boolean; text: string }>>((acc, run) => {
    if (!run.text) return acc
    const last = acc[acc.length - 1]
    if (last && last.arabic === run.arabic) last.text += run.text
    else acc.push({ ...run })
    return acc
  }, [])
}

/**
 * Render a translated string with every Latin/numeric run isolated.
 *
 * Returns a plain string when there is nothing to isolate, so the overwhelmingly common
 * case (pure Arabic, or pure Latin in English mode) adds no DOM nodes at all.
 *
 * `<bdi>` rather than a pinned `<Ltr>`: each run's direction is resolved from its own
 * content, which is correct for every case here — a Latin phrase resolves LTR, and a run of
 * bare digits with no strong character falls back to LTR, which is what a time or an ITS id
 * wants anyway.
 */
/**
 * Memoised, because this sits on the hot path.
 *
 * `isolateRuns` is called from `tx()` for EVERY translated string on EVERY render, and
 * `splitBidiRuns` walks the string character by character. Unmemoised, a screen with a few
 * hundred translated nodes re-splits all of them on each render; it was enough to slow route
 * transitions noticeably. The dictionary is fixed at runtime and the values are bounded, so a
 * plain unbounded Map is the right cache — there is no key explosion to guard against.
 */
const isolateCache = new Map<string, ReactNode>()

export function isolateRuns(text: string): ReactNode {
  const cached = isolateCache.get(text)
  if (cached !== undefined) return cached

  let result: ReactNode
  if (!NEEDS_ISOLATION.test(text)) {
    result = text
  } else {
    const runs = splitBidiRuns(text)
    // One run means nothing to isolate — return the bare string so the common case adds no
    // DOM node at all, which is what keeps English mode a true no-op.
    result =
      runs.length === 1
        ? text
        : runs.map((run, i) =>
            run.arabic ? (
              run.text
            ) : (
              <bdi key={`r${i}`} style={{ unicodeBidi: 'isolate' }}>
                {run.text}
              </bdi>
            ),
          )
  }
  isolateCache.set(text, result)
  return result
}

/**
 * A count rendered inline in prose or on a button — `Register(٣)`, `٣ members`.
 *
 * Digits adjacent to a bracket are the classic bidi trap: the bracket is a neutral character
 * and takes its side from whatever it sits between, so `Register(3)` in an RTL paragraph can
 * put the parentheses on the wrong ends. Isolating the whole bracketed group fixes it
 * without touching the string.
 */
export function Count({ value, lang }: { value: number; lang: Lang }) {
  return <Iso>{formatNumber(value, lang)}</Iso>
}
