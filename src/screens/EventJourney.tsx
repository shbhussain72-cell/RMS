import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import { miqaats, type EventTimeline, type TimelineMilestone } from '../data/seed'
import { useT } from '../i18n'
import {
  HIJRI_MONTHS_EN,
  HIJRI_MONTHS_LSD,
  dominantHijriMonth,
  hijriParts,
} from '../i18n/hijri'
import { Iso, toArabicDigits } from '../components/Bidi'
import { HijriDate, TimeLine } from '../components/DateLine'

/**
 * Event Journey — full page reached from the Miqaat Detail "Event timeline" button
 * (desktop) / floating pill (mobile).
 *
 *   • Desktop → the standard allocation two-panel shell (matches City/Zone Selection):
 *     LEFT cream sidebar = fixed breadcrumb + title + description + "Event Journey"
 *     heading, with ONLY the timeline cards scrolling; RIGHT white section = June 2026
 *     calendar with a fixed "Go home" StickyFooter beneath it.
 *   • Mobile  → stacked: compact month calendar (coloured dots) then the timeline cards.
 *
 * Each milestone carries a relevant icon, shown the same way on the timeline cards and
 * inside the calendar (Registration calendar · City pin · Zone map · Raza document · Miqaat dome).
 */

const MUL = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

// Milestone palette — Registration green · City orange · Zone purple · Raza gold ·
// Seat teal · Pass rose · Miqaat dark-green.
const C = {
  green: '#3f9e5c',
  orange: '#e3691c',
  purple: '#9168d6',
  gold: '#c6a44a',
  teal: '#2e7d94',
  rose: '#c1466b',
  darkGreen: '#15402f',
}

// Milestone display colour, keyed by stage — Registration green · City orange ·
// Zone purple · Raza gold · Seat teal · Pass rose · Miqaat dark-green. Dates/titles
// come from the event seed.
const COLOR_BY_KEY: Record<TimelineMilestone['key'], string> = {
  reg: C.green,
  city: C.orange,
  zone: C.purple,
  raza: C.gold,
  seat: C.teal,
  pass: C.rose,
  miqaat: C.darkGreen,
}

/** A seed milestone enriched with its display colour (keyed off its stage). */
type Milestone = TimelineMilestone & { color: string }
const withColors = (ms: TimelineMilestone[]): Milestone[] => ms.map((m) => ({ ...m, color: COLOR_BY_KEY[m.key] }))

// ── Calendar grid — generated for the event's own month/year ───────────────────
// Cell day numbers + month/year header are the Hijri (Islamic) equivalent of the real Gregorian
// date each cell sits on; `gDate` (the real Gregorian date) is what milestone matching keys off,
// since Hijri day-of-month numbers repeat every ~29-30 days and can't be compared directly.
type Cell = { gDate: Date; hijriDay: number; muted: boolean }
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const pad2 = (n: number) => String(n).padStart(2, '0')
/** Same calendar day, comparing the Gregorian parts — milestone matching keys off the real
 *  date, since Hijri day-of-month numbers repeat every ~29-30 days. */
function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Calendar cell day number — Arabic-Indic in LSD, and always zero-padded so the grid
 *  columns keep a constant width regardless of script. */
const dayNum = (n: number, isLsd: boolean) => (isLsd ? toArabicDigits(pad2(n)) : pad2(n))

// ── Hijri (Islamic) calendar conversion ─────────────────────────────
// Moved to src/i18n/hijri.ts so the miqaat list and this screen cannot drift onto different
// calendars. See that file for which calendar and the evidence for it.

/** Build a 6-row × 7-col grid for the event's Gregorian month (same container as before the Hijri
 *  conversion) — every milestone is defined against this exact month, so anchoring the grid here
 *  (rather than a real Hijri month, which is only ~29-30 days and can land on either side of the
 *  journey) guarantees every milestone is visible together. Each cell just displays its Hijri-
 *  equivalent day number instead of the Gregorian one. */
function buildWeeks(year: number, month: number): Cell[][] {
  const monthStart = new Date(year, month, 1)
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - monthStart.getDay())
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + i)
    cells.push({ gDate: d, hijriDay: hijriParts(d).day, muted: d.getMonth() !== month || d.getFullYear() !== year })
  }
  const weeks: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** A milestone with its Gregorian day numbers resolved to real dates (a milestone can span
 *  several days, e.g. Registration open) plus its labelDay resolved the same way. */
type MilestoneWithDates = Milestone & { dates: Date[]; labelDate: Date }
const withDates = (ms: Milestone[], year: number, month: number): MilestoneWithDates[] =>
  ms.map((m) => ({ ...m, dates: m.days.map((d) => new Date(year, month, d)), labelDate: new Date(year, month, m.labelDay) }))

/** Milestone occupying a (non-muted) calendar day, if any — matched by real date, since Hijri
 *  day-of-month numbers repeat every ~29-30 days and can't be compared directly. */
function milestoneFor(cell: Cell, milestones: MilestoneWithDates[]): MilestoneWithDates | undefined {
  if (cell.muted) return undefined
  return milestones.find((m) => m.dates.some((d) => isSameDate(d, cell.gDate)))
}

// ── Small atoms ────────────────────────────────────────────────────────────────
function CalGlyph({ className = 'size-[15px] text-[#c9a45c]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={`shrink-0 ${className}`}>
      <rect x="2" y="3.5" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 7.5h14M6 1.5v4M12 1.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** A milestone icon — Registration calendar, City pin, Zone map, Raza document, Miqaat dome. */
function MilestoneIcon({ k, color, size = 18 }: { k: string; color: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'shrink-0',
  }
  switch (k) {
    case 'reg':
      // clipboard-with-check — registration/enrolment, distinct from the date-row calendar glyphs
      return (
        <svg {...common}>
          <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
          <path d="M9 4.5v-.7A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8v.7" />
          <path d="M8.5 12.5l2.2 2.2 4.3-4.3" />
        </svg>
      )
    case 'city':
      return (
        <svg {...common}>
          <path d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z" />
          <circle cx="12" cy="10.5" r="2.3" />
        </svg>
      )
    case 'zone':
      return (
        <svg {...common}>
          <path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.2 5.5-2.2V4L15 6.2 9 4Z" />
          <path d="M9 4v13.3M15 6.2v13.3" />
        </svg>
      )
    case 'raza':
      return (
        <svg {...common}>
          <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
          <path d="M13.5 3.5V8h4M9 12.5h6M9 16h4" />
        </svg>
      )
    case 'seat':
      // simple armchair — back + seat + legs
      return (
        <svg {...common}>
          <path d="M7 12V6.5A2.5 2.5 0 0 1 9.5 4h5A2.5 2.5 0 0 1 17 6.5V12" />
          <path d="M5.5 12h13a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 16v-2.5A1.5 1.5 0 0 1 5.5 12Z" />
          <path d="M6 17.5V20M18 17.5V20" />
        </svg>
      )
    case 'pass':
      // ticket/pass — perforated stub notch on each side + dashed tear line
      return (
        <svg {...common}>
          <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.75a1.75 1.75 0 0 0 0 3.5v1.75A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-1.75a1.75 1.75 0 0 0 0-3.5V8.5Z" />
          <path d="M14.5 7v10" strokeDasharray="2.2 2.2" />
        </svg>
      )
    case 'miqaat':
    default:
      return (
        <svg {...common}>
          <path d="M12 3c2.4 1.8 4 3.9 4 6.5 0 1.3-.7 2.4-2 3.2V21H10v-8.3c-1.3-.8-2-1.9-2-3.2C8 6.9 9.6 4.8 12 3Z" />
          <path d="M5 21v-7M19 21v-7M3.5 21h17" />
        </svg>
      )
  }
}

// Label + icon on their own row, value below (full card width) — Hijri month names run longer
// than the old Gregorian "DD Mon YYYY" strings, so cramming label+value on one inline row left the
// value too little width and forced an ugly mid-string wrap.
function DateRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="text-[13px] leading-[18px]" style={{ fontFamily: MUL }}>
      <div className="flex items-center gap-[8px] text-[#6a746e]">
        <CalGlyph />
        <span>{label} :</span>
      </div>
      <p className="mt-[2px] ps-[23px] font-semibold text-[#2b3a32]">{value}</p>
    </div>
  )
}

// ── Timeline card (left panel / mobile list) ──────────────────────────────────
function TimelineCard({ m }: { m: MilestoneWithDates }) {
  const { tx, t } = useT()
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[14px] border bg-white"
      style={{ borderColor: '#ece6d6', boxShadow: '0 2px 10px -7px rgba(21,64,47,0.18)' }}
    >
      {/* full-height colour accent — anchored to the card edge so it never looks detached */}
      <span className="absolute inset-y-0 start-0 w-[4px]" style={{ background: m.color }} />
      <div className="py-[14px] ps-[18px] pe-[16px]">
        {/* icon + title — icon sits in a tinted square, vertically centered with the title */}
        <div className="flex items-center gap-[10px]">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: `${m.color}1f` }}>
            <MilestoneIcon k={m.key} color={m.color} size={17} />
          </span>
          <p className="text-[16px] font-bold leading-[21px] text-[#1a2a23]" style={{ fontFamily: MUL }} {...tx(m.title)} />
        </div>
        <div className="mt-[11px] flex flex-col gap-[7px]">
          {m.range ? (
            <>
              <DateRow label={t('Opens')} value={<><HijriDate date={m.dates[0]} /> – <TimeLine value={m.range.startTime} /></>} />
              <DateRow label={t('Closes')} value={<><HijriDate date={m.dates[m.dates.length - 1]} /> – <TimeLine value={m.range.endTime} /></>} />
            </>
          ) : (
            <DateRow label={m.single!.label} value={<HijriDate date={m.labelDate} />} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Timeline rail — light dashed vertical line + per-milestone colour dot ───────
// The line runs behind the dots from the first milestone's centre to the last's;
// each dot uses its milestone colour and sits centred on its card. Wraps the existing
// TimelineCard untouched — only the left rail is added. `gap` matches the list's spacing
// so the dashed segments bridge the gaps into one continuous line.
function TimelineRail({ milestones, gap }: { milestones: MilestoneWithDates[]; gap: number }) {
  return (
    <div className="flex flex-col" style={{ gap }}>
      {milestones.map((mil, i) => {
        const isFirst = i === 0
        const isLast = i === milestones.length - 1
        return (
          <div key={mil.key} className="relative flex items-stretch gap-[14px]">
            {/* left rail: dashed connector (behind) + milestone dot */}
            <div className="relative flex w-[18px] shrink-0 items-center justify-center">
              <span
                aria-hidden className="pointer-events-none absolute start-0 end-0 mx-auto w-0 border-s-2 border-dashed border-[#d8d2c2]"
                style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : -gap }}
              />
              <span className="relative z-[1] size-[16px] shrink-0 rounded-full" style={{ background: mil.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <TimelineCard m={mil} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Calendar hover tooltip (desktop) ──────────────────────────────────────────
function CalendarTooltip({ m }: { m: MilestoneWithDates }) {
  const { t, tx } = useT()
  return (
    <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-[10px] w-[224px] -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      role="tooltip"
    >
      {/* arrow */}
      <span className="absolute start-0 end-0 top-[-5px] mx-auto size-[10px] rotate-45 border-l border-t border-[#ece6d6] bg-white" />
      <div className="relative rounded-[12px] border border-[#ece6d6] bg-white p-[13px] shadow-[0_16px_40px_-14px_rgba(21,64,47,0.4)]">
        <div className="flex items-center gap-[8px]">
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px]" style={{ background: `${m.color}1f` }}>
            <MilestoneIcon k={m.key} color={m.color} size={14} />
          </span>
          <p className="text-[14px] font-bold leading-[18px] text-[#1a2a23]" style={{ fontFamily: MUL }} {...tx(m.title)} />
        </div>
        <div className="mt-[10px] flex flex-col gap-[8px]" style={{ fontFamily: MUL }}>
          {m.range ? (
            <>
              <TipRow heading={t('Opens')} date={<HijriDate date={m.dates[0]} />} time={m.range.startTime} />
              <TipRow heading={t('Closes')} date={<HijriDate date={m.dates[m.dates.length - 1]} />} time={m.range.endTime} />
            </>
          ) : (
            <TipRow heading={m.single!.label} date={<HijriDate date={m.labelDate} />} />
          )}
        </div>
      </div>
    </div>
  )
}

function TipRow({ heading, date, time }: { heading: string; date: ReactNode; time?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#9aa39d]">{heading}</p>
      <p className="text-[13px] leading-[17px] text-[#2b3a32]">
        {date}
        {time ? <> • <TimeLine value={time} /></> : null}
      </p>
    </div>
  )
}

// ── Calendar shared bits ──────────────────────────────────────────────────────
/**
 * Calendar header — Hijri month name and year.
 *
 * Takes a month INDEX rather than a pre-rendered name so the name can be resolved in the
 * active language here. Previously the English transliteration was baked in upstream and
 * shown in both languages, which put `Dhuʻl-Hijjah 1447` on an otherwise fully Arabic
 * calendar — the Gregorian policy applied to the Hijri calendar, i.e. exactly backwards.
 */
function MonthTitle({ monthIndex, year, size = 'lg' }: { monthIndex: number; year: number; size?: 'lg' | 'sm' }) {
  const big = size === 'lg'
  const { isLsd } = useT()
  const name = isLsd ? HIJRI_MONTHS_LSD[monthIndex] : HIJRI_MONTHS_EN[monthIndex]
  return (
    <p className="flex items-baseline gap-[8px]" style={{ fontFamily: SERIF }}>
      <span className={`${big ? 'text-[26px]' : 'text-[19px]'} leading-none text-[#15402f]`}>{name}</span>
      <span className={`${big ? 'text-[14px]' : 'text-[12px]'} tracking-[1px] text-[#b48b39]`}>
        <Iso>{isLsd ? toArabicDigits(String(year)) : year}</Iso>
      </span>
    </p>
  )
}

// ── Desktop calendar (spanning blocks + badges + icons + hover tooltips) ──
function DesktopCalendar({ flat, milestones, monthIndex, year }: { flat: Cell[]; milestones: MilestoneWithDates[]; monthIndex: number; year: number }) {
  const { tx, isLsd } = useT()
  return (
    <div className="rounded-[18px] border border-[#ece6d6] bg-white p-[20px]">
      <MonthTitle monthIndex={monthIndex} year={year} />
      <div className="mt-[16px] grid grid-cols-7">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-[10px] text-center text-[13px] font-semibold text-[#8a938e]" style={{ fontFamily: MUL }}>
            {d}
          </span>
        ))}
      </div>
      {/* single 7-col grid → clean corner rounding; overflow-visible lets tooltips escape */}
      <div className="grid grid-cols-7 overflow-visible rounded-[14px] border-l border-t border-[#eef0ed]">
        {flat.map((cell, i) => {
          const m = milestoneFor(cell, milestones)
          const isLabel = m && isSameDate(m.labelDate, cell.gDate)
          const corner =
            i === 0 ? 'rounded-tl-[14px]' : i === 6 ? 'rounded-tr-[14px]' : i === 35 ? 'rounded-bl-[14px]' : i === 41 ? 'rounded-br-[14px]' : ''
          return (
            <div
              key={i}
              className={`group relative min-h-[92px] border-b border-r border-[#eef0ed] p-[9px] ${corner}`}
              style={m ? { background: m.color } : undefined}
            >
              {m ? (
                <>
                  {/* white day badge */}
                  <span className="flex size-[28px] items-center justify-center rounded-full bg-white shadow-[0_2px_6px_-3px_rgba(0,0,0,0.4)]">
                    <span className="text-[13px] font-bold leading-none" style={{ fontFamily: MUL, color: m.color }}>
                      {dayNum(cell.hijriDay, isLsd)}
                    </span>
                  </span>
                  {isLabel && (
                    <div className="mt-[7px] flex items-start gap-[5px]">
                      <span className="mt-[1px]">
                        <MilestoneIcon k={m.key} color="#ffffff" size={14} />
                      </span>
                      <p className="min-w-0 break-words text-[12px] font-semibold leading-[15px] text-white" style={{ fontFamily: MUL }} {...tx(m.title)} />
                    </div>
                  )}
                  <CalendarTooltip m={m} />
                </>
              ) : (
                <span
                  className="text-[14px] leading-none"
                  style={{ fontFamily: MUL, fontWeight: 700, color: cell.muted ? '#c7c7bd' : '#23302a' }}
                >
                  {dayNum(cell.hijriDay, isLsd)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Mobile calendar (compact, coloured dots) ──────────────────────────────────
function MobileCalendar({ flat, milestones, monthIndex, year }: { flat: Cell[]; milestones: MilestoneWithDates[]; monthIndex: number; year: number }) {
  const { tx, isLsd } = useT()
  return (
    <div className="rounded-[16px] border border-[#ece6d6] bg-white p-[14px]">
      <MonthTitle monthIndex={monthIndex} year={year} size="sm" />
      <div className="mt-[12px] grid grid-cols-7">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-[6px] text-center text-[12px] font-semibold text-[#8a938e]" style={{ fontFamily: MUL }}>
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-[4px]">
        {flat.map((cell, i) => {
          const m = milestoneFor(cell, milestones)
          return (
            <div key={i} className="flex h-[40px] items-center justify-center">
              {m ? (
                // event day → circled in the milestone colour
                <span className="flex size-[30px] items-center justify-center rounded-full" style={{ background: m.color }}>
                  <span className="text-[13px] font-bold leading-none text-white" style={{ fontFamily: MUL }}>
                    {dayNum(cell.hijriDay, isLsd)}
                  </span>
                </span>
              ) : (
                <span
                  className="text-[13px] leading-none"
                  style={{ fontFamily: MUL, fontWeight: 500, color: cell.muted ? '#c7c7bd' : '#23302a' }}
                >
                  {dayNum(cell.hijriDay, isLsd)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {/* legend */}
      <div className="mt-[12px] flex flex-wrap gap-x-[14px] gap-y-[8px] border-t border-[#f0ece0] pt-[12px]">
        {milestones.map((m) => (
          <span key={m.key} className="flex items-center gap-[6px]">
            <span className="size-[9px] rounded-full" style={{ background: m.color }} />
            <span className="text-[12px] text-[#5a6660]" style={{ fontFamily: MUL }} {...tx(m.title)} />
          </span>
        ))}
      </div>
    </div>
  )
}

// ── "Event Journey" heading block (shared, stays fixed above the scrolling list) ──
function TimelineHeader() {
  const { tx } = useT()
  return (
    <div className="shrink-0">
      <p className="text-[12px] font-bold uppercase tracking-[2px] text-[#b48b39]" style={{ fontFamily: MUL }} {...tx('Timeline')} />
      <h2 className="mt-[4px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Event Journey')} />
    </div>
  )
}

const DESCRIPTION = 'The complete journey at a glance — registration, city and zone selection, Raza, and the day of Miqaat.'

export default function EventJourney() {
  const { t, tx, tdAuthored } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const m = miqaats.find((x) => x.id === id) ?? miqaats[0]
  const tl: EventTimeline = m.timeline
  const milestones = withDates(withColors(tl.milestones), tl.year, tl.month)
  const hijri = dominantHijriMonth(tl.year, tl.month)
  const flat = buildWeeks(tl.year, tl.month).flat()
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll hint — once per session, nudge the desktop timeline list down + back
  // so users discover it scrolls. Heading/page info stay fixed; only the list moves.
  useEffect(() => {
    if (sessionStorage.getItem('ej-autoscroll')) return
    const el = listRef.current
    if (!el || el.scrollHeight <= el.clientHeight + 8) return
    sessionStorage.setItem('ej-autoscroll', '1')
    const t1 = setTimeout(() => el.scrollTo({ top: 72, behavior: 'smooth' }), 750)
    const t2 = setTimeout(() => el.scrollTo({ top: 0, behavior: 'smooth' }), 1750)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  return (
    <PhoneScreen statusTone="dark">
      <div className="w-full bg-white sm:bg-transparent">
        {/* AppBar */}
        <div>
          <AppBar notificationCount={3} onBellClick={() => {}} />
        </div>

        {/* Breadcrumb */}
        <div className="ms-[16px] mt-[12px] sm:ms-0">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/miqaats' },
              { label: t('Miqaat detail page'), to: `/miqaats/${m.id}` },
              { label: t('Event timeline') },
            ]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
        </div>

        {/* Page heading */}
        <div className="mt-[14px] px-[16px] sm:px-0">
          <h1 className="text-[28px] leading-[34px] text-[#15402f] sm:text-[40px] sm:leading-[46px]" style={{ fontFamily: SERIF }} {...tdAuthored(m.title)} />
          <p className="mt-[8px] max-w-[640px] text-[14px] leading-[22px] text-[#5a6660] sm:text-[15px]" style={{ fontFamily: MUL }}>
            {DESCRIPTION}
          </p>
        </div>

        {/* ── MOBILE: calendar then timeline ── */}
        <div className="mt-[18px] flex flex-col gap-[18px] px-[16px] pb-[16px] sm:hidden">
          <MobileCalendar flat={flat} milestones={milestones} monthIndex={hijri.monthIndex} year={hijri.year} />
          <div>
            <TimelineHeader />
            <div className="mt-[14px]">
              <TimelineRail milestones={milestones} gap={12} />
            </div>
          </div>
        </div>

        {/* ── DESKTOP: full-page two-column — left timeline, right calendar ── */}
        <div className="mt-[26px] hidden gap-[28px] pb-[40px] sm:flex">
          {/* left: timeline (fixed heading + scrollable card list) */}
          <div className="w-[420px] shrink-0">
            <div className="flex max-h-[560px] flex-col rounded-[20px] border border-[#ece6d6] bg-[#fcfbf6] p-[22px] shadow-[0_8px_28px_-18px_rgba(21,64,47,0.25)]">
              <TimelineHeader />
              <div ref={listRef} className="thin-scrollbar mt-[16px] min-h-0 flex-1 overflow-y-auto pe-[2px]">
                <TimelineRail milestones={milestones} gap={14} />
              </div>
            </div>
          </div>
          {/* right: calendar */}
          <div className="min-w-0 flex-1">
            <DesktopCalendar flat={flat} milestones={milestones} monthIndex={hijri.monthIndex} year={hijri.year} />
          </div>
        </div>
      </div>
    </PhoneScreen>
  )
}
