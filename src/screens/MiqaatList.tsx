import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import BottomSheet from '../components/figma/BottomSheet'
import LogoutConfirmSheet from '../components/figma/LogoutConfirmSheet'
import { InvitationBanner } from '../components/figma/InvitationBanner'
import { InvitationPopup } from '../components/figma/InvitationPopup'
import { account, miqaats, liveCities, zonesByCityId, type Miqaat } from '../data/seed'
import { buildAllGroups } from '../lib/group'
import { useStore, journeyFor, type ReopenRequest } from '../store'
import TourHelpButton from '../tour/TourHelpButton'
import LanguageToggle from '../i18n/LanguageToggle'
import { useT } from '../i18n'
import { DateLine, TimeLine } from '../components/DateLine'
import { Ltr, formatDurationText, toArabicDigits } from '../components/Bidi'
import Toast from '../components/figma/Toast'
import { DemoProgressionControl } from '../components/figma/DemoProgressionControl'
import { RazaStatusCard } from '../components/figma/RazaStatusCard'
import { type DisplayMiqaat, deriveStatus, reopenStageFor, REGISTERED_STATES, getDisplayMiqaats, requestSummary } from '../lib/miqaatStatus'
import AskHelpDock from '../chat/AskHelpDock'
import { SparkleGlyph } from '../chat/icons'
import type { AskHelpInit } from '../chat/types'

const CARD_BG = '/figma/miqaat-card-bg.png'
const ASHARA_BG = '/figma/ashara-banner-bg.jpg'
const BELL_ICON = '/figma/bell-icon.svg'
const CREST = '/miqaat-logo.png'
const DATE_RANGE = '/figma/icon-date-range-gold.svg'
const SCHEDULE = '/figma/icon-schedule.svg'
const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, serif'

/** Each card uses its own event photo, falling back to the shared placeholder when unset. */
const cardImage = (m: Miqaat) => m.image ?? CARD_BG
const onImgError = (e: { target: EventTarget | null }) => {
  const img = e.target as HTMLImageElement
  if (img.src.indexOf(CARD_BG) === -1) img.src = CARD_BG
}

function useCountdown(initialSeconds: number) {
  const [secs, setSecs] = useState(initialSeconds)
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    days: pad(Math.floor(secs / 86400)),
    hours: pad(Math.floor((secs % 86400) / 3600)),
    min: pad(Math.floor((secs % 3600) / 60)),
    sec: pad(secs % 60),
  }
}

function useScrollHide() {
  const [hidden, setHidden] = useState(false)
  const prev = useRef(0)
  useEffect(() => {
    const fn = () => {
      const y = window.scrollY
      if (y > prev.current + 6) setHidden(true)
      else if (y < prev.current - 6) setHidden(false)
      prev.current = y
    }
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return hidden
}

function Countdown({ cells, tone, compact, ended }: { cells: { value: string; unit: string }[]; tone: 'ends' | 'opens' | 'ended'; compact?: boolean; ended?: boolean }) {
  // Compact (registered card) → fixed-width, left-aligned tiles; the DAYS tile carries the
  // red "urgency" emphasis, the rest are neutral cream (matches the design) — UNLESS the deadline
  // has fully passed, in which case every tile turns red (the window is closed, not just urgent).
  const compactBase = { tile: '#faf7ef', border: '#ece2cd', num: '#15402f', label: '#a29a88' }
  const compactFirst = { tile: '#FFF7F5', border: '#f4e0d3', num: '#c0392b', label: '#c0562f' }
  const full =
    tone === 'opens'
      ? { tile: '#e1eef1', border: '#cfe2e7', num: '#2e6a7d', label: '#4d93a9' }
      : tone === 'ended'
        ? { tile: '#f0f1f2', border: '#e3e5e7', num: '#9aa1a8', label: '#9aa1a8' }
        : { tile: '#FFF7F5', border: '#F7EAD9', num: '#bf4a26', label: '#c0562f' }
  return (
    <div className="flex gap-[8px]">
      {cells.map((cell, i) => {
        // The DAYS tile turns clay-red only once the deadline hits "00 days"; once truly ended,
        // every tile does.
        const c = compact ? (ended || (i === 0 && cell.value === '00') ? compactFirst : compactBase) : full
        return (
          <div
            key={cell.unit}
            className={`flex flex-col items-center justify-center rounded-[12px] border border-solid ${compact ? 'h-[56px] w-[54px] shrink-0' : 'h-[64px] flex-1'}`}
            style={{ background: c.tile, borderColor: c.border }}
          >
            <CountdownValue value={cell.value} compact={compact} color={c.num} />
            <CountdownUnit unit={cell.unit} compact={compact} color={c.label} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Countdown digits — Arabic-Indic in LSD, inside an LTR isolate.
 *
 * `toArabicDigits` rather than `formatNumber`: the value arrives pre-padded (`'07'`, `'00'`)
 * and the pad is what stops the tiles resizing as the clock ticks. `formatNumber(7)` would
 * return `٧` and the tile would jump a character narrower every time the hour rolled over.
 *
 * A two-digit number cannot itself be reordered, but it sits in a flex row of four tiles in
 * an RTL document; the isolate keeps each tile's content independent of its neighbours.
 */
function CountdownValue({ value, compact, color }: { value: string; compact?: boolean; color: string }) {
  const { isLsd } = useT()
  return (
    <p
      className={`font-bold ${compact ? 'text-[20px] leading-[24px]' : 'text-[24px] leading-[28px]'}`}
      style={{ fontFamily: FONT_SANS, color }}
    >
      <Ltr>{isLsd ? toArabicDigits(value) : value}</Ltr>
    </p>
  )
}

/** Countdown unit label (DAYS/HRS/MIN/SEC/HOURS) — split into its own component so it can call
 *  the translation hook, which `Countdown`'s cells.map callback cannot. */
function CountdownUnit({ unit, compact, color }: { unit: string; compact?: boolean; color: string }) {
  const { tx } = useT()
  return (
    <p
      className={`mt-[1px] font-bold uppercase tracking-[0.6px] ${compact ? 'text-[9px] leading-[12px]' : 'text-[10px] leading-[13px] tracking-[0.7px]'}`}
      style={{ fontFamily: FONT_SANS, color }}
      {...tx(unit)}
    />
  )
}

/** Calendar glyph — inline so it takes `currentColor` (the figma SVG assets are white-fill,
    which is invisible on the white cards). */
function CalendarGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4.75" width="18" height="15.5" rx="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9.25h18M8 2.75v3.5M16 2.75v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/** Clock glyph — inline, inherits `currentColor`. */
function ClockGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.6V12l3 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Shared date + time meta row used by both card variants. */
function DateTimeRow({ m, className = '' }: { m: Miqaat; className?: string }) {
  const { dirProps } = useT()
  // `data-numeric` is deliberately GONE from both spans. That attribute forced
  // `direction: ltr` on the whole element, which was the app's blunt attempt at this problem:
  // it kept a pure date readable but flipped the base direction of anything composed, so the
  // weekday and the Hijri parenthetical would have laid out left-to-right. Direction is now
  // declared per-run by the formatters, which is both narrower and correct.
  return (
    <div className={`flex flex-wrap items-center gap-x-[16px] gap-y-[4px] ${className}`}>
      <span className="flex min-w-0 items-center gap-[7px] text-[#5a6660]">
        <CalendarGlyph className="size-[15px] shrink-0" />
        {/* `whitespace-nowrap` REMOVED (it was flagged here for this layout session). The LSD
            line is much longer than the English one — weekday + Gregorian + bracketed Hijri —
            and held on one line it escaped the card's `overflow-clip`, so the Hijri date was
            cut off at 390 and 768. That form is the one mumineen read, so it is not shortened
            or abbreviated: it wraps, and the card grows. `min-w-0` on the flex parent is what
            makes wrapping possible at all — a flex item's default `min-width: auto` floors it
            at its content width, so without it the span would refuse to shrink and the text
            would overflow anyway. English is one short run and is unaffected. */}
        <span className="text-[13px] leading-[18px]" style={{ fontFamily: FONT_SANS, fontWeight: 500 }} {...dirProps}>
          <DateLine value={m.dateLabel} />
        </span>
      </span>
      <span className="flex items-center gap-[7px] text-[#5a6660]">
        <ClockGlyph className="size-[15px] shrink-0" />
        <span className="whitespace-nowrap text-[13px] leading-[18px]" style={{ fontFamily: FONT_SANS, fontWeight: 500 }} {...dirProps}>
          <TimeLine value={m.timeLabel} />
        </span>
      </span>
    </div>
  )
}

/** Miqaat logo — replaces the old ITS crest (`/figma/event-emblem.svg`) beside event names. */
const EVENT_EMBLEM = '/miqaat-logo.png'

/** Emblem shown beside every event card's title (user-supplied artwork). Native aspect ratio 36:56. */
/** True aspect ratio (w/h) of miqaat-logo.png — currently 1774×887, i.e. exactly 2:1.
 *  Must be updated whenever the artwork is replaced: the box is sized from this number, so a
 *  stale ratio letterboxes the logo inside a box the wrong shape rather than failing loudly.
 *  (Previous artwork was 270×191; the retired ITS crest before that was 36×56.) */
const EMBLEM_RATIO = 1774 / 887

function EventEmblem({ size = 22, className = '' }: { size?: number; className?: string }) {
  // Callers pass `size` as the old crest's nominal WIDTH, and its rendered height was
  // size × 56/36. That height is what set the vertical rhythm against the event title, so it
  // is preserved exactly and the width is re-derived from the real ratio. Matches the
  // height-driven `h-[46px] w-auto` sizing used for the same logo on MiqaatDetail's hero.
  const height = Math.round((size * 56) / 36)
  return (
    <img
      src={EVENT_EMBLEM}
      alt=""
      width={Math.round(height * EMBLEM_RATIO)}
      height={height}
      className={`shrink-0 object-contain ${className}`}
    />
  )
}

/** Event title block — emblem + English title, with the Lisan al-Dawat (Arabic script) name
 *  underneath. Shared by every event card so the treatment stays identical across the app. */
function CardTitleBlock({
  m,
  size = 21,
  arabicSize = 13,
  tone = 'dark',
  className = '',
}: {
  m: Miqaat
  /** English title font-size (px). */
  size?: number
  /** Arabic subtitle font-size (px). */
  arabicSize?: number
  /** `white` for dark hero backgrounds; `dark` (default) for cream/white cards. */
  tone?: 'dark' | 'white'
  className?: string
}) {
  const { tdAuthored, isLsd } = useT()
  const arabicColor = tone === 'white' ? 'rgba(255,255,255,0.75)' : '#a8843e'
  // LSD event names are gold and larger than the English ones — the gold that used to
  // carry the Arabic subtitle now carries the name itself, since the name IS the Arabic.
  // Two golds so it stays legible on both card backgrounds: light gold on the dark hero,
  // deep gold on cream/white cards. EN keeps its original ink/white and its original size.
  const LSD_TITLE_SCALE = 1.3
  const titleColor = isLsd
    ? (tone === 'white' ? '#e3cd96' : '#a8843e')
    : (tone === 'white' ? '#ffffff' : '#15402f')
  const titleSize = isLsd ? Math.round(size * LSD_TITLE_SCALE) : size
  return (
    // The whole title block reads right-to-left in LSD, so the logo leads from the right
    // and the name follows to its left. No `flex-row-reverse` anywhere below — the
    // container's `direction` already reverses the row, and doing both would cancel out.
    <div className={className}>
      <div className="flex items-center gap-[9px]">
        <EventEmblem size={Math.max(26, Math.round(size * 1.4))} />
        {/* Same heading slot in both languages — only the string, colour and size differ. */}
        <h3
          className="min-w-0"
          style={{ fontFamily: FONT_SERIF, fontSize: titleSize, lineHeight: `${Math.round(titleSize * 1.24)}px`, color: titleColor }}
          {...tdAuthored(m.title, m.titleArabic)}
        />
      </div>
      {/* In EN this is the Arabic subtitle under the English name. In LSD that name has
          already moved up into the heading, so keeping this line would print it twice —
          and showing the English here instead is exactly the bilingual pair we're told to
          drop. So the subtitle is EN-only. */}
      {!isLsd && (
        <p
          className="mt-[6px] text-start"
          style={{ fontFamily: 'Amiri, serif', fontSize: arabicSize, lineHeight: `${Math.round(arabicSize * 1.5)}px`, color: arabicColor }}
          dir="rtl"
        >
          {m.titleArabic}
        </p>
      )}
    </div>
  )
}

function PinBadge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[19px] shrink-0">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#1f5a44" />
      <circle cx="12" cy="9" r="2.6" fill="white" />
    </svg>
  )
}

/** `Colombo` / `Colombo · Zone A - Main Hall` — each name looked up separately. */
function AllocatedValue({ city, zone }: { city?: string; zone?: string }) {
  const { td } = useT()
  if (!city) return null
  return (
    <>
      <bdi {...td(city)} />
      {zone ? <> · <bdi {...td(zone)} /></> : null}
    </>
  )
}

function LocationRow({ label, city, zone, allocated }: { label: string; city?: string; zone?: string; allocated: boolean }) {
  const { tx } = useT()
  return (
    <div
      className="mt-[6px] flex h-[40px] items-center justify-between gap-[10px] rounded-[10px] px-[14px]"
      style={{ background: allocated ? '#e7f1ea' : '#f2f1ed' }}
    >
      <span className="flex min-w-0 items-center gap-[8px]">
        <PinBadge />
        <span className="text-[14px] text-[#3d3d3a]" style={{ fontFamily: FONT_SANS, fontWeight: 600 }} {...tx(label)} />
      </span>
      {/* City and zone names ARE in the wordlist — `Colombo` has a row, and so does every zone.
          They were held back on the theory that routing data through the dictionary floods the
          coverage report with false gaps; what it actually did was render `Colombo` in English on
          four screens while its authored LSD value sat unused in the spreadsheet. `td` is the data
          path and it resolves. The middot stays outside both halves — each is looked up alone, as
          `Colombo · Zone A - Main Hall` is a string the wordlist will never have a row for. */}
      <span
        className="truncate text-end text-[14px] leading-[18px]"
        style={{ fontFamily: FONT_SANS, fontWeight: allocated ? 800 : 600, color: allocated ? '#1f5a44' : '#8a938e' }}
      >
        {allocated ? <AllocatedValue city={city} zone={zone} /> : <span {...tx('Not allocated')} />}
      </span>
    </div>
  )
}

/** Shared per-card state: countdown, derived action + dual-footer flag (identical to the
    previous MiqaatCard logic so every card behaves exactly as before), plus the reopen-request
    bypass: once a missed deadline's reopen request is approved, the card behaves as if not ended. */
function useCard(m: DisplayMiqaat, confirmedCityName?: string, confirmedZoneName?: string, onAskHelp?: (init: AskHelpInit) => void) {
  const nav = useNavigate()
  const reopenRequests = useStore((s) => s.reopenRequests)
  // "Arrange My Cities" (the post-registration setup step) sits before Select City: until the user
  // saves a city arrangement for this event, the Select-City CTA points at the Arrange screen.
  // Same-day-flow events (e.g. "Milad Syedna Qutbuddin RA") skip it entirely — the whole point of
  // that flow is going straight into City Selection (a live queue), not a pre-planning layout step.
  const cityArranged = useStore((s) => !!journeyFor(s.flow, s.registrations, m.id).cityArrangement) || !!m.sameDayFlow
  const cd = useCountdown(m.countdownSeconds)
  const ended = cd.days === '00' && cd.hours === '00' && cd.min === '00' && cd.sec === '00'
  const s = m.effectiveStatus
  const razaIssued = s === 'raza_issued'
  const bypassApproved = !!reopenRequests[m.id]?.approved
  const hasCity = !!confirmedCityName
  const hasZone = !!confirmedZoneName
  const dateText = (m.deadlineLabel.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),.*/)?.[0] ?? m.deadlineLabel).replace(' - ', ' · ')
  const goDetail = () => nav(`/miqaats/${m.id}`)

  type Action = { label: string; onClick: () => void; outline?: boolean; askHelp?: boolean }
  let primary: Action = { label: 'View details', onClick: goDetail, outline: true }
  if (s === 'live') primary = { label: 'Register now', onClick: () => nav(`/miqaats/${m.id}/people`) }
  else if (s === 'city_open' || s === 'registered_select')
    primary = cityArranged
      ? { label: 'Select city', onClick: () => nav(`/miqaats/${m.id}/city`) }
      : { label: 'Manage City Layout', onClick: () => nav(`/miqaats/${m.id}/arrange`) }
  else if (s === 'zone_select' || s === 'host_allocated' || s === 'relay_allocated' || s === 'zone_open') primary = { label: 'Select zone', onClick: () => nav(`/miqaats/${m.id}/zone`) }
  // A deadline that's passed normally falls back to "View details" — unless it's a reopen-able stage
  // (register/city/zone) with no approved bypass yet, in which case Ask Help (a guided chat) replaces it.
  if (ended && !bypassApproved) {
    const rs = reopenStageFor(s)
    primary = rs
      ? { label: 'Ask Help', askHelp: true, onClick: () => onAskHelp?.({ category: rs.stage, miqaatId: m.id }) }
      : { label: 'View details', onClick: goDetail, outline: true }
  }
  if (razaIssued) primary = { label: 'View details', onClick: goDetail, outline: true }

  const dualFooter = ['registered_select', 'host_allocated', 'relay_allocated', 'zone_done', 'raza_issued'].includes(s)
  const cells = [
    { value: cd.days, unit: 'DAYS' },
    { value: cd.hours, unit: 'HRS' },
    { value: cd.min, unit: 'MIN' },
    { value: cd.sec, unit: 'SEC' },
  ]
  return { nav, cd, ended, s, razaIssued, bypassApproved, hasCity, hasZone, dateText, goDetail, primary, dualFooter, cells }
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { tx } = useT()
  return (
    <div className="mx-[16px] sm:mx-0">
      <h2 className="text-[24px] leading-[30px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx(title)} />
      <p className="mt-[4px] text-[14px] leading-[19px] text-[#7a827c]" style={{ fontFamily: FONT_SANS }} {...tx(subtitle)} />
    </div>
  )
}

const solidBtn = 'bg-[#1f5a44] text-white shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.18)]'
const outlineBtn = 'border border-solid border-[#1f5a44] bg-transparent text-[#1f5a44]'

/** Registered / in-progress miqaat — horizontal image-left card (image-top on mobile). */
function RegisteredCard({ m, confirmedCityName, confirmedZoneName, wide = false, onAskHelp }: { m: DisplayMiqaat; confirmedCityName?: string; confirmedZoneName?: string; wide?: boolean; onAskHelp?: (init: AskHelpInit) => void }) {
  const { nav, ended, razaIssued, bypassApproved, hasCity, hasZone, dateText, goDetail, primary, cells } = useCard(m, confirmedCityName, confirmedZoneName, onAskHelp)
  const { t, tx, isLsd } = useT()
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  // Resuming this reservation must make its journey active BEFORE navigating, so City/Zone/Manage
  // open on the right event (another event may currently be the active one being edited).
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); setActiveMiqaat(m.id); fn() }
  const tone: 'ends' | 'opens' | 'ended' = ended ? 'ended' : 'ends'
  // Once the deadline has actually passed, "CLOSES IN 00:00:00:00" reads as a contradiction — say
  // it closed instead (a reopen-request approval lets the user proceed anyway, but doesn't undo
  // the fact that the window itself closed).
  const selLabel = ended
    ? (hasCity ? 'ZONE SELECTION CLOSED' : 'CITY SELECTION CLOSED')
    : (hasCity ? 'ZONE SELECTION CLOSES IN' : 'CITY SELECTION CLOSES IN')
  const deadlineCompact = dateText.replace(/\s\d{4}/, '').replace(' IST', '')
  const btnBase = 'ix-btn flex h-[44px] w-full items-center justify-center whitespace-nowrap rounded-full text-[14px] tracking-[0.2px]'
  // Urgent = the deadline has reached its final day (00 days) → permanent gold border + accent bar.
  const urgent = cells[0].value === '00'
  // A deadline closed with no reopen bypass yet has nothing to modify — only the "Request …" CTA
  // shows, full width. (A pending, un-approved request moves the card to "Requested" entirely, so
  // this only ever applies right up until the user taps that CTA.)
  const showModify = !ended || bypassApproved

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goDetail}
      className={`ix-card-lg relative flex w-full cursor-pointer flex-col overflow-clip rounded-[18px] border border-solid bg-white shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)] sm:flex-row ${urgent ? 'ix-urgent border-[#d4af5a]' : 'border-[#ece4d2]'}`}
    >
      {urgent && <div className="ix-urgent-bar absolute inset-x-0 top-0 z-[3] h-[4px]" />}
      {/* Image with Raza-status pill */}
      <div className="relative h-[172px] w-full shrink-0 overflow-hidden sm:h-auto sm:w-[228px]">
        <img src={cardImage(m)} alt="" onError={onImgError} className="ix-zoom absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(13,40,28,0.30) 0%, rgba(13,40,28,0) 46%)' }} />
        {/* The status pill sits over the card photo, which is outside the RTL content
            column, so it needs its corner switched explicitly: leading edge in both
            languages — left in EN, right in LSD. */}
        <div className={`absolute top-[12px] rounded-[12px] bg-white px-[12px] py-[8px] shadow-[0px_4px_12px_-4px_rgba(0,0,0,0.25)] ${isLsd ? 'end-[12px]' : 'start-[12px]'}`}>
          <p className="text-[9px] font-bold uppercase leading-[12px] tracking-[0.7px] text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }} {...tx('Raza status')} />
          <span className="mt-[3px] flex items-center gap-[6px]">
            <span className="size-[7px] rounded-full" style={{ background: razaIssued ? '#1f7a4d' : '#c8911f' }} />
            <span className="text-[13px] leading-none" style={{ fontFamily: FONT_SANS, fontWeight: 800, color: razaIssued ? '#1f7a4d' : '#b8821e' }} {...tx(razaIssued ? 'Issued' : 'Pending')} />
          </span>
        </div>
      </div>

      {/* Content — `wide` (the sole registered reservation) lays out as a horizontal row on web with
          the info on the left and the action buttons stacked on the right; otherwise the info stacks
          above a 2-column button row (the side-by-side grid card). */}
      <div className={`flex min-w-0 flex-1 flex-col p-[18px] sm:p-[20px] ${wide ? 'sm:flex-row sm:items-center sm:justify-between sm:gap-[24px]' : ''}`}>
        <div className={`min-w-0 ${wide ? 'sm:max-w-[440px] sm:flex-1' : ''}`}>
          <CardTitleBlock m={m} />
          <DateTimeRow m={m} className="mt-[10px]" />

          <div className={`mt-[14px] flex items-center justify-between gap-[10px] ${wide ? 'sm:justify-start sm:gap-[16px]' : ''}`}>
            <p className="text-[11px] font-bold uppercase leading-[14px] tracking-[0.7px] text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }} {...tx(selLabel)} />
            <p className="whitespace-nowrap text-[13px] leading-[14px]" style={{ fontFamily: FONT_SANS, fontWeight: 700, color: '#c0392b' }} data-numeric>{deadlineCompact}</p>
          </div>

          <div className="mt-[8px]">
            <Countdown cells={cells} tone={tone} compact ended={ended} />
          </div>

          <LocationRow label={hasZone ? t('City & Zone') : t('City')} city={confirmedCityName} zone={hasZone ? confirmedZoneName : undefined} allocated={hasCity || hasZone} />
        </div>

        {/* Every card in the "Registered" section is an owned reservation → always Modify + primary.
            Non-wide: mt-auto pins the 2-col footer to the bottom so cards of differing content height
            stay aligned. Wide: the buttons become a fixed-width column on the right, primary on top
            (flex-col-reverse keeps the DOM order Modify→primary for the mobile grid). */}
        <div className={`mt-auto grid gap-[14px] pt-[16px] ${showModify ? 'grid-cols-2' : 'grid-cols-1'} ${wide ? 'sm:mt-0 sm:flex sm:w-[220px] sm:shrink-0 sm:flex-col-reverse sm:gap-[10px] sm:pt-0' : ''}`}>
          {showModify && (
            <button type="button" onClick={stop(() => nav(`/miqaats/${m.id}/manage`))} className={`${btnBase} ix-btn-outline ${outlineBtn}`} style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx('Modify Reservation')} />
          )}
          {primary.askHelp ? (
            // The city/zone selection window has closed on a reservation that's already registered —
            // there's nothing left to do on this card, so explain WHAT closed and WHY (deadline passed
            // before an allocation was made) instead of an "Ask Help" CTA.
            <div className="col-span-full flex items-start gap-[9px] rounded-[12px] border border-[#ecdcae] bg-[#fdf6e7] px-[13px] py-[11px]">
              <svg viewBox="0 0 20 20" fill="none" className="mt-[1px] size-[16px] shrink-0">
                <circle cx="10" cy="10" r="7.4" stroke="#c8911f" strokeWidth="1.4" />
                <path d="M10 9v4" stroke="#c8911f" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="10" cy="6.4" r="1" fill="#c8911f" />
              </svg>
              <p className="text-[12.5px] leading-[17px] text-[#8a6a1e]" style={{ fontFamily: FONT_SANS }}>
                <span className="font-bold" {...tx(hasCity ? 'Zone selection has closed.' : 'City selection has closed.')} />{' '}
                {hasCity
                  ? `This window closed on ${deadlineCompact} before a zone was allocated. Your city (${confirmedCityName}) stays confirmed — no further action is available here.`
                  : `This window closed on ${deadlineCompact} before a city was allocated to your group, so this reservation is left unallocated.`}
              </p>
            </div>
          ) : (
            <button type="button" onClick={stop(primary.onClick)} className={`${btnBase} ${primary.outline ? `ix-btn-outline ${outlineBtn}` : `ix-btn-green ${solidBtn}`}`} style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx(primary.label)} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Current / upcoming miqaat — compact horizontal card for the 2-col dashboard grid. */
function UpcomingRow({ m, onAskHelp }: { m: DisplayMiqaat; onAskHelp?: (init: AskHelpInit) => void }) {
  const { nav, cd, ended, s, goDetail, primary, dateText } = useCard(m, undefined, undefined, onAskHelp)
  const { t, tx, lang } = useT()
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn() }
  const isLive = s === 'live'
  // "Closes in 0d 0h left" reads as a contradiction once the deadline has actually passed — say it
  // closed instead (a reopen-request approval lets the user proceed anyway, but doesn't undo the
  // fact that the window itself closed).
  const leftLabel = isLive ? (ended ? 'Registration closed' : 'Registration closes in') : s === 'registered' ? 'City opens in' : 'Registration open in'
  // "Closed" is UI copy. The "3d 7h left" form used to be rendered raw on the grounds that a
  // per-second string can never match a wordlist row — true of the WHOLE string, and the reason
  // the duration is now a parameter rather than part of the key. `{duration} left` is stable, is
  // one row, and lets the translation decide which side the duration goes; `formatDuration`
  // supplies the numerals in the right script.
  const dLeft = isLive && ended
    ? t('Closed')
    : t('{duration} left', { duration: formatDurationText(parseInt(cd.days, 10) * 1440 + parseInt(cd.hours, 10) * 60, lang) })
  // Absolute deadline date/time (registration open/close, or city-open) shown under the countdown.
  const deadlineDateTime = dateText.replace(' IST', '')
  // "Closes in" reads urgent (red); "Open in" reads informational (teal); registered → green.
  const accent = isLive ? '#c0392b' : s === 'registered' ? '#2e7d5b' : '#2e6a7d'
  const isGold = primary.label === 'Register now'
  // "Current & Upcoming" only ever holds events the user has NOT registered for (registered events
  // move to the "Registered" section, rendered by RegisteredCard, which carries its own Modify
  // button). So these cards never show "Modify reservations" — there's nothing to modify yet.
  const primaryBtn = primary.outline ? (
    <button type="button" onClick={stop(primary.onClick)} className="ix-slide ix-btn inline-flex h-[38px] w-full items-center justify-center gap-[5px] whitespace-nowrap px-[6px] text-[14px] text-[#1f5a44] sm:justify-end" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>
      <span {...tx(primary.label)} />
      <svg viewBox="0 0 16 16" fill="none" className="ix-arrow size-[14px]"><path d="M3 8h9M9 5l3 3-3 3" stroke="#1f5a44" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  ) : (
    <button
      type="button"
      onClick={stop(primary.onClick)}
      className={`ix-btn inline-flex h-[38px] w-full items-center justify-center whitespace-nowrap rounded-full px-[20px] text-[13px] ${isGold ? 'ix-btn-gold bg-gradient-to-b from-[#E3CD96] to-[#C9A45C] text-[#15402f] shadow-[0px_8px_20px_-6px_rgba(0,0,0,0.30)]' : primary.askHelp ? `ix-btn-outline ${outlineBtn}` : `ix-btn-green ${solidBtn}`}`}
      style={{ fontFamily: FONT_SANS, fontWeight: 700 }}
    >
      {primary.askHelp && <SparkleGlyph className="me-[5px] inline-block size-[14px] align-[-2px]" />}
      <span {...tx(primary.label)} />
    </button>
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goDetail}
      className="ix-card-sm flex w-full cursor-pointer overflow-clip rounded-[16px] border border-solid border-[#ece4d2] bg-white shadow-[0px_5px_18px_-8px_rgba(21,64,47,0.18),0px_2px_6px_-4px_rgba(21,64,47,0.08)]"
    >
      {/* Left image panel — full card height */}
      <div className="relative w-[96px] shrink-0 overflow-hidden sm:w-[112px]">
        <img src={cardImage(m)} alt="" onError={onImgError} className="ix-zoom absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(13,40,28,0.22) 0%, rgba(13,40,28,0) 55%)' }} />
      </div>

      {/* Content — info left, actions right (vertically centred) on web; stacked on mobile.
          Two-column split fills the horizontal space so the CTAs sit next to the text
          instead of stranded on their own row with dead whitespace. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-[14px] p-[15px] sm:flex-row sm:items-center sm:gap-[18px] sm:py-[16px] sm:ps-[18px] sm:pe-[20px]">
        <div className="min-w-0 sm:flex-1">
          <CardTitleBlock m={m} size={16} arabicSize={12} />
          <DateTimeRow m={m} className="mt-[9px]" />
          <div className="mt-[11px]">
            <div className="flex flex-wrap items-center gap-[7px] text-[12.5px]" style={{ fontFamily: FONT_SANS }}>
              <span className="text-[#7a827c]" style={{ fontWeight: 500 }} {...tx(leftLabel)} />
              <span className="size-[7px] rounded-full" style={{ background: accent }} />
              <span className="whitespace-nowrap" style={{ fontWeight: 800, color: accent }} data-numeric>{dLeft}</span>
            </div>
            <p className="mt-[3px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT_SANS, fontWeight: 500 }} data-numeric>{deadlineDateTime}</p>
          </div>
        </div>
        <div className="flex flex-col gap-[10px] sm:w-auto sm:shrink-0 sm:gap-[8px]">
          {primary.askHelp ? (
            // Registration window has closed on an event the user never registered for → nothing to do
            // here, so explain it instead of an "Ask Help" CTA. Same amber info-box as the Registered
            // cards, kept compact (capped width, tight padding) so it fits the button slot without
            // growing the card — the card's height is driven by the taller left column.
            <div className="flex items-start gap-[8px] rounded-[12px] border border-[#ecdcae] bg-[#fdf6e7] px-[11px] py-[9px] sm:max-w-[220px]">
              <svg viewBox="0 0 20 20" fill="none" className="mt-[1px] size-[15px] shrink-0">
                <circle cx="10" cy="10" r="7.4" stroke="#c8911f" strokeWidth="1.4" />
                <path d="M10 9v4" stroke="#c8911f" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="10" cy="6.4" r="1" fill="#c8911f" />
              </svg>
              <p className="text-[11.5px] leading-[15px] text-[#8a6a1e]" style={{ fontFamily: FONT_SANS }}>
                <span className="font-bold" {...tx('Registration has closed.')} />{' '}
                <span {...tx('This Miqaat can no longer be registered for.')} />
              </p>
            </div>
          ) : (
            primaryBtn
          )}
        </div>
      </div>
    </div>
  )
}

/** A miqaat with a pending reopen request — same card shell as `RegisteredCard`, but there's nothing
 *  to report Raza status or a location on yet, so those are swapped for what was requested + when.
 *  No real admin backend exists, so tapping the card (or its one button) simulates approval and takes
 *  the user straight into the now-unlocked screen. */
function RequestedCard({ m, request, wide = false }: { m: DisplayMiqaat; request: ReopenRequest; wide?: boolean }) {
  const nav = useNavigate()
  const { tx, isLsd } = useT()
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const approveReopenRequest = useStore((s) => s.approveReopenRequest)
  const confirmCity = useStore((s) => s.confirmCity)
  const confirmZone = useStore((s) => s.confirmZone)
  const setGroupZones = useStore((s) => s.setGroupZones)
  const target = request.stage === 'register' ? 'people' : request.stage
  const btnBase = 'ix-btn flex h-[44px] w-full items-center justify-center whitespace-nowrap rounded-full text-[14px] tracking-[0.2px]'

  // Approval applies the city/zone the user chose in the chat (if any), so their picked destination is
  // honoured rather than asked for again — then lands them Home to see it allocated. A city/zone request
  // with no stored choice (or a register request) falls back to opening the relevant screen to pick.
  const approveAndContinue = () => {
    approveReopenRequest(m.id)
    setActiveMiqaat(m.id)

    if (request.stage === 'city' && request.chosenCityId) {
      const city = liveCities.find((c) => c.id === request.chosenCityId)
      if (city) {
        confirmCity(city)
        nav('/')
        return
      }
    }
    if (request.stage === 'zone' && request.chosenZones?.length) {
      // Apply the per-city zone picks: each group gets the zone chosen for its city. confirmedZone (the
      // card's primary label) is set from the first pick; confirmZone doesn't touch groupZones so order
      // is safe.
      const active = useStore.getState().flow
      const groups = buildAllGroups(active.selectedMemberIds, active.guardians, active.caregivers, active.invites)
      const groupZones: Record<string, { id: string; name: string; cityId: string; cityName: string }> = {}
      groups.forEach((g, gi) => {
        const gcity = active.groupCities?.[String(gi)]?.id ?? active.confirmedCity?.id
        const pick = request.chosenZones!.find((z) => z.cityId === gcity)
        if (pick) groupZones[gi] = { id: pick.zoneId, name: pick.zoneName, cityId: pick.cityId, cityName: pick.cityName }
      })
      const first = request.chosenZones[0]
      const zoneObj = (zonesByCityId[first.cityId] ?? []).find((z) => z.id === first.zoneId)
      if (zoneObj) confirmZone(zoneObj, first.cityId, first.cityName)
      if (Object.keys(groupZones).length) setGroupZones(groupZones)
      nav('/')
      return
    }
    nav(`/miqaats/${m.id}/${target}`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => nav(`/miqaats/${m.id}`)}
      className="ix-card-lg relative flex w-full cursor-pointer flex-col overflow-clip rounded-[18px] border border-solid border-[#ece4d2] bg-white shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)] sm:flex-row"
    >
      <div className="relative h-[172px] w-full shrink-0 overflow-hidden sm:h-auto sm:w-[228px]">
        <img src={cardImage(m)} alt="" onError={onImgError} className="ix-zoom absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(13,40,28,0.30) 0%, rgba(13,40,28,0) 46%)' }} />
        {/* The status pill sits over the card photo, which is outside the RTL content
            column, so it needs its corner switched explicitly: leading edge in both
            languages — left in EN, right in LSD. */}
        <div className={`absolute top-[12px] rounded-[12px] bg-white px-[12px] py-[8px] shadow-[0px_4px_12px_-4px_rgba(0,0,0,0.25)] ${isLsd ? 'end-[12px]' : 'start-[12px]'}`}>
          <p className="text-[9px] font-bold uppercase leading-[12px] tracking-[0.7px] text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }} {...tx('Status')} />
          <span className="mt-[3px] flex items-center gap-[6px]">
            <span className="size-[7px] rounded-full" style={{ background: '#c8911f' }} />
            <span className="text-[13px] leading-none" style={{ fontFamily: FONT_SANS, fontWeight: 800, color: '#b8821e' }} {...tx('Pending approval')} />
          </span>
        </div>
      </div>

      <div className={`flex min-w-0 flex-1 flex-col p-[18px] sm:p-[20px] ${wide ? 'sm:flex-row sm:items-center sm:justify-between sm:gap-[24px]' : ''}`}>
        <div className={`min-w-0 ${wide ? 'sm:max-w-[440px] sm:flex-1' : ''}`}>
          <CardTitleBlock m={m} />
          <DateTimeRow m={m} className="mt-[10px]" />
          <p className="mt-[14px] text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
            {requestSummary(request)} · Pending
          </p>
        </div>

        <div className={`mt-auto flex flex-col gap-[6px] pt-[16px] ${wide ? 'sm:mt-0 sm:w-[220px] sm:shrink-0 sm:pt-0' : ''}`}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); approveAndContinue() }}
            className={`${btnBase} ix-btn-green ${solidBtn}`}
            style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx('Simulate Approval')} />
          <p className="text-center text-[11px] leading-[14px] text-[#a29a88]" style={{ fontFamily: FONT_SANS }}>
            (Demo) Tap the card to view details, or Simulate Approval to continue.
          </p>
        </div>
      </div>
    </div>
  )
}

function IdentityHeader() {
                            const { t, td } = useT()
  const nav = useNavigate()
  const logout = useStore((s) => s.logout)
  const [showLogout, setShowLogout] = useState(false)

  return (
    <>
    <div
      className="h-[64px] w-full overflow-hidden rounded-bl-[20px] rounded-br-[20px]"
      style={{ background: 'linear-gradient(to bottom, #15402F 0%, #1F5A44 78%)', position: 'relative' }}
    >
      {/* Crest — vertically centred (header content center y=32) */}
      <div className="absolute start-[16px] top-[32px] h-[40px] w-[26px] -translate-y-1/2">
        <img
          src={CREST}
          alt=""
          className="pointer-events-none absolute inset-0 size-full max-w-none object-contain"
        />
      </div>
      <p
        className="absolute start-[48px] top-[23px] -translate-y-1/2 whitespace-nowrap text-[12px] leading-[16px] text-white"
        style={{ fontFamily: FONT_SANS, fontWeight: 500 }}
      >
        ITS ID {account.its}
      </p>
      <p
        className="absolute start-[48px] top-[41px] -translate-y-1/2 whitespace-nowrap text-[13px] leading-[18px] tracking-[0.2px] text-white"
        style={{ fontFamily: FONT_SANS, fontWeight: 600 }} {...td(account.name)} />
      {/* Bell + Logout */}
      <div className="absolute end-[17px] top-[32px] -translate-y-1/2 flex items-center gap-[2px]">
        <LanguageToggle className="me-[6px]" />
        <TourHelpButton />
        <button type="button" onClick={() => nav('/notifications')} className="relative h-[36px] w-[36px] rounded-[11px]" aria-label={t('Notifications')}>
          <img src={BELL_ICON} alt="" className="absolute inset-0 size-full" />
        </button>
        <button
          type="button"
          onClick={() => setShowLogout(true)}
          className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px]"
          aria-label={t('Logout')}
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-[22px] text-white">
            <path
              d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
    <LogoutConfirmSheet open={showLogout} onClose={() => setShowLogout(false)} onConfirm={() => { logout(); nav('/login') }} />
    </>
  )
}

function AsharaBanner({ m, confirmedCityName, confirmedZoneName }: { m: DisplayMiqaat; confirmedCityName?: string; confirmedZoneName?: string }) {
  const nav = useNavigate()
  const { tx, td, isLsd } = useT()
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  // Same rule as the cards: Arrange My Cities comes before Select City (see useCard).
  const cityArranged = useStore((s) => !!journeyFor(s.flow, s.registrations, m.id).cityArrangement)
  // Demo Progression Controls (ashara-1448 only): only before registration has ever opened is
  // there truly nothing to do — hide every CTA/action then. Once registration has been demo-closed
  // (reg_closed) the user IS registered and can still Modify Reservation while waiting for city
  // selection to open (see the `demoPhase === 'reg_closed'` branch in `primary` below).
  const demoPhase = useStore((s) => s.stageOverrides[m.id])
  const hideCta = demoPhase === 'reg_not_open'
  const cd = useCountdown(m.countdownSeconds)
  const cells = [
    { value: cd.days, unit: 'DAYS' },
    { value: cd.hours, unit: 'HOURS' },
    { value: cd.min, unit: 'MIN' },
    { value: cd.sec, unit: 'SEC' },
  ]

  const s = m.effectiveStatus
  const registered = ['registered', 'city_open', 'registered_select', 'host_allocated', 'relay_allocated', 'zone_done', 'raza_issued', 'city_done_waiting_zone'].includes(s)
  const razaIssued = s === 'raza_issued'
  const hasCity = !!confirmedCityName
  const hasZone = !!confirmedZoneName

  const dateText = (m.deadlineLabel.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),.*/)?.[0] ?? m.deadlineLabel).replace(' - ', ' · ')
  // A verb phrase and a date, kept APART. Interpolating the date into the sentence with a
  // template string compiles the word order into the literal, so the dictionary is consulted
  // after the decision it needed to make and the date can only ever land where English puts
  // it. A parameterised key leaves that choice to the translation; `tx` fills {date} after the
  // lookup and isolates the interpolated Latin run on its own.
  let ends: { key: string; date?: string } = { key: 'Registration closes in' }
  // Demo Progression Controls: before registration opens (or after it's been demo-closed and
  // city selection hasn't opened yet), nothing is actually "closing" — say what's next instead.
  // A confirmed city while the zone stage hasn't opened yet ('city_done_waiting_zone') is its own
  // case, checked before the generic `hasCity` fallback (which would otherwise say "Zone ends in").
  if (demoPhase === 'reg_not_open') ends = { key: 'Registration opens in' }
  else if (demoPhase === 'reg_open') ends = { key: 'Registration ends in {date}', date: dateText }
  else if (demoPhase === 'reg_closed') ends = { key: 'City opens in {date}', date: dateText }
  else if (s === 'registered') ends = { key: 'City opens in {date}', date: dateText }
  // Registered but no confirmed city yet. While City Selection is open → "City ends in"; once it has
  // demo-closed (e.g. after the registrant cancelled their own city) the city stage is over, so the
  // next thing is the zone stage → "Zone opens in".
  else if (s === 'city_open' || s === 'registered_select') ends = demoPhase === 'city_closed' ? { key: 'Zone opens in {date}', date: dateText } : { key: 'City ends in {date}', date: dateText }
  else if (s === 'city_done_waiting_zone') ends = demoPhase === 'city_closed' ? { key: 'Zone opens in {date}', date: dateText } : { key: 'City closes in {date}', date: dateText }
  // A confirmed zone while Raza hasn't been issued yet (Demo Progression Controls) is the zone-stage
  // twin of city_done_waiting_zone — checked before the generic `hasCity` fallback below.
  else if (s === 'zone_done') ends = demoPhase === 'zone_closed' ? { key: 'Raza issues on {date}', date: dateText } : { key: 'Zone closes in {date}', date: dateText }
  else if (hasCity) ends = { key: 'Zone ends in {date}', date: dateText }
  // Once Raza is issued there's nothing left to count down to.
  const hideCountdown = razaIssued

  // Demo Progression Controls: an arrangement can be saved (and re-saved) at any point before the
  // demo actually opens City Selection — the CTA should keep offering "Arrange My Cities" (so it
  // stays editable) until then, instead of jumping straight to the live City Selection screen.
  const cityStageActuallyOpen = !demoPhase || demoPhase === 'city_open'
  let primary = { label: 'Register Now', onClick: () => nav(`/miqaats/${m.id}/people`), outline: false }
  if (s === 'city_open' || s === 'registered_select')
    primary = demoPhase === 'city_closed'
      // City Selection has ended with no city chosen (e.g. the registrant cancelled their own city) —
      // there's no layout to manage anymore, so pair "Modify Reservation" (dual footer) with "View details".
      ? { label: 'View details', onClick: () => nav(`/miqaats/${m.id}`), outline: false }
      : cityArranged && cityStageActuallyOpen
        ? { label: 'Select city', onClick: () => nav(`/miqaats/${m.id}/city`), outline: false }
        : { label: 'Manage City Layout', onClick: () => nav(`/miqaats/${m.id}/arrange`), outline: false }
  else if (s === 'zone_select' || s === 'host_allocated' || s === 'relay_allocated') primary = { label: 'Select zone', onClick: () => nav(`/miqaats/${m.id}/zone`), outline: false }
  // City confirmed but zone stage isn't open yet (Demo Progression Controls) — nothing further to
  // do until zone selection opens, same "View details" treatment as zone_done.
  else if (s === 'city_done_waiting_zone') primary = { label: 'View details', onClick: () => nav(`/miqaats/${m.id}`), outline: false }
  else if (s === 'zone_done') primary = { label: 'View details', onClick: () => nav(`/miqaats/${m.id}`), outline: false }
  else if (razaIssued) primary = { label: 'View details', onClick: () => nav(`/miqaats/${m.id}`), outline: true }

  const dualFooter = ['registered_select', 'host_allocated', 'relay_allocated', 'zone_done', 'raza_issued', 'city_done_waiting_zone'].includes(s)
  const goldCls = 'ix-btn ix-btn-gold inline-flex h-[54px] items-center justify-center rounded-full bg-gradient-to-b from-[#E3CD96] to-[#C9A45C] shadow-[0px_8px_20px_-6px_rgba(0,0,0,0.35)]'
  const goldTextCls = 'text-[15px] font-bold text-[#15402f]'
  const goDetail = () => nav(`/miqaats/${m.id}`)
  // CTA actions resume this event's journey → make it active before navigating.
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); setActiveMiqaat(m.id); fn() }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goDetail}
      className="relative mx-[16px] cursor-pointer overflow-hidden rounded-[20px] sm:mx-0 sm:rounded-[24px]"
    >
      <img
        src={ASHARA_BG}
        alt=""
        className="absolute inset-0 size-full object-cover"
        onError={(e) => {
          ;(e.target as HTMLImageElement).src = CARD_BG
        }}
      />
      <div className="ashara-banner-gradient absolute inset-0" />

      <div className="relative z-10 flex flex-col px-[20px] pb-[24px] pt-[22px] sm:px-[28px] sm:pb-[30px] sm:pt-[28px]">
        {!registered && (
          <div className="mb-[14px] flex w-fit items-center gap-[7px] rounded-full bg-[#a8843e] px-[13px] py-[5px]">
            <div className="size-[6px] shrink-0 rounded-full bg-white" />
            <span className="whitespace-nowrap text-[11px] leading-none tracking-[0.8px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx('New Miqaat')} />
          </div>
        )}

        <CardTitleBlock m={m} size={32} arabicSize={16} tone="white" className="mb-[12px]" />

        <div className="mb-[12px] flex flex-wrap items-center gap-x-[20px] gap-y-[5px] sm:gap-x-[22px]">
          <div className="flex items-center gap-[8px]">
            <img src={DATE_RANGE} alt="" className="size-[15px] shrink-0" />
            <span className="whitespace-nowrap text-[13px] leading-[18px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 400 }} data-numeric><DateLine value={m.dateLabel} /></span>
          </div>
          <div className="flex items-center gap-[8px]">
            <img src={SCHEDULE} alt="" className="size-[15px] shrink-0" />
            <span className="whitespace-nowrap text-[13px] leading-[18px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 400 }} data-numeric {...td(m.timeLabel)} />
          </div>
        </div>

        {/* Raza + City status pills (after registration) */}
        {registered && (
          <div className="mb-[12px] flex flex-col gap-[8px] sm:max-w-[480px]">
            <RazaStatusCard issued={razaIssued} onView={() => { setActiveMiqaat(m.id); nav(`/miqaats/${m.id}/raza-letter`) }} />
            {/* Demo Progression Controls: nothing real to show here until city selection has
                actually opened (reg_open/reg_closed are both "not yet") — "Not allocated" that
                early reads as if the city stage already started. */}
            {(cityStageActuallyOpen || hasCity) && (
              <div className="flex h-[40px] items-center justify-between rounded-[12px] px-[14px]" style={{ background: hasCity || hasZone ? '#e7f1ea' : '#ffffff' }}>
                <span className="flex items-center gap-[8px]">
                  <PinBadge />
                  <span className="text-[14px] text-[#3d3d3a]" style={{ fontFamily: FONT_SANS, fontWeight: 600 }} {...tx(hasZone ? 'City & zone' : 'City')} />
                </span>
                <span className="whitespace-nowrap text-[14px]" style={{ fontFamily: FONT_SANS, fontWeight: hasCity || hasZone ? 800 : 600, color: hasCity || hasZone ? '#1f5a44' : '#8a938e' }} >
                  {hasCity || hasZone
                    ? <AllocatedValue city={confirmedCityName} zone={hasZone ? confirmedZoneName : undefined} />
                    : <span {...tx('Not allocated')} />}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Hidden once Raza is issued — nothing left to count down to. */}
        {!hideCountdown && (
          <>
            <div className="mb-[8px] flex items-center gap-[7px]">
              <span className="size-[7px] shrink-0 rounded-full bg-[#d9a441]" />
              <span className="text-[12px] leading-[16px] text-[rgba(255,255,255,0.85)]" style={{ fontFamily: FONT_SANS, fontWeight: 500 }} {...tx(ends.key, ends.date ? { date: ends.date } : undefined)} />
            </div>
            <div className="mb-[14px] flex gap-[8px] sm:max-w-[440px]">
              {cells.map((c) => (
                <div key={c.unit} className="flex flex-1 flex-col items-center justify-center rounded-[12px] border border-[rgba(201,161,74,0.4)] bg-[rgba(255,255,255,0.1)] py-[8px] backdrop-blur-[2px]">
                  {/* The digits stay left-to-right in both languages — a clock reads the same way
                      round whatever script it is written in. Same treatment as CountdownUnit's
                      sibling on the list cards, which this block had grown a raw copy of. */}
                  <p className="text-[22px] leading-[26px] text-white sm:text-[26px]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>
                    <Ltr>{isLsd ? toArabicDigits(c.value) : c.value}</Ltr>
                  </p>
                  <p className="mt-[2px] text-[9px] leading-none tracking-[0.6px] text-[#c8a84b] sm:text-[10px]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx(c.unit)} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        {!hideCta && (dualFooter ? (
          // grid-cols-2 → both buttons are exactly the same width; h-[50px] → same height.
          <div className="grid grid-cols-2 gap-[10px] sm:max-w-[480px]">
            <button
              type="button"
              onClick={stop(() => nav(`/miqaats/${m.id}/manage`))}
              className="ix-btn ix-btn-hero inline-flex h-[50px] w-full min-w-0 items-center justify-center gap-[4px] rounded-full border border-[rgba(255,255,255,0.7)] bg-[rgba(0,0,0,0.38)] px-[6px] backdrop-blur-[3px]"
            >
              <span className="shrink-0 text-[12px] leading-none text-white">✎</span>
              <span className="whitespace-nowrap text-[12px] font-bold text-white" style={{ fontFamily: FONT_SANS }} {...tx('Modify Reservation')} />
            </button>
            <button
              type="button"
              onClick={stop(primary.onClick)}
              className="ix-btn ix-btn-gold inline-flex h-[50px] w-full min-w-0 items-center justify-center rounded-full bg-gradient-to-b from-[#E3CD96] to-[#C9A45C] shadow-[0px_8px_20px_-6px_rgba(0,0,0,0.35)]"
            >
              <span className="truncate text-[14px] font-bold text-[#15402f]" style={{ fontFamily: FONT_SANS }} {...tx(primary.label)} />
            </button>
          </div>
        ) : primary.outline ? (
          <button
            type="button"
            onClick={stop(primary.onClick)}
            className="ix-btn ix-btn-hero inline-flex h-[54px] w-full items-center justify-center rounded-full border border-[rgba(255,255,255,0.6)] px-[40px] sm:w-auto sm:self-start sm:px-[56px]"
          >
            <span className="text-[15px] font-bold text-white" style={{ fontFamily: FONT_SANS }} {...tx(primary.label)} />
          </button>
        ) : (
          <button type="button" onClick={stop(primary.onClick)} className={goldCls + ' w-full px-[24px] sm:w-auto sm:self-start sm:px-[56px]'}>
            <span className={goldTextCls} style={{ fontFamily: FONT_SANS }} {...tx(primary.label)} />
          </button>
        ))}
        <DemoProgressionControl miqaatId={m.id} className="mt-[14px]" />
      </div>
    </div>
  )
}

function PageFooter() {
                        const { tx } = useT()
  return (
    <div
      className="relative mt-[40px] overflow-hidden sm-full-bleed"
      style={{ background: 'linear-gradient(215deg, #0E2D21 0%, #15402F 50%, #1F5A44 100%)' }}
    >

      {/* Main footer content */}
      <div className="relative z-10 flex flex-col items-center px-[24px] pb-[28px] pt-[48px]">
        {/* Crest */}
        <div className="mb-[20px] h-[68px] w-[44px]">
          <img
            src={CREST}
            alt=""
            className="size-full object-contain brightness-0 invert opacity-90"
          />
        </div>

        {/* Arabic ayah */}
        <p
          className="max-w-[340px] text-center text-[18px] leading-[1.7] text-white sm:max-w-[480px] sm:text-[22px]"
          style={{ fontFamily: 'serif', direction: 'rtl' }}
        >
          وَاعْتَصِمُوا بِحَبْلِ اللَّهِ جَمِيعًا وَلَا تَفَرَّقُوا
        </p>
      </div>

      {/* Copyright bar */}
      <div className="relative z-10 border-t border-[rgba(255,255,255,0.1)] px-[24px] py-[14px]">
        <p
          className="text-center text-[11px] leading-[16px] text-[rgba(255,255,255,0.45)] sm:text-[12px]"
          style={{ fontFamily: FONT_SANS }} {...tx('ITS Productions | © 2003 - 2026 IDARAT AL-TA\'REEF AL-SHAKHSI TRUST | All Rights Reserved | Terms & Conditions')} />
      </div>
    </div>
  )
}

export default function MiqaatList() {
  const headerHidden = useScrollHide()
  const { tx, t } = useT()
  const flow = useStore((s) => s.flow)
  // Archived journeys for every non-active event — merged in below so each registered event shows
  // its own card, not just whichever one the user last touched.
  const registrations = useStore((s) => s.registrations)
  const journey = (id: string) => journeyFor(flow, registrations, id)
  // Miqaats with a pending (un-approved) reopen request — pulled out of both "Registered" and
  // "Miqaats Current & Upcoming" into their own "Requested" section below.
  const reopenRequests = useStore((s) => s.reopenRequests)
  // Demo Progression Controls (ashara-1448 only) — see deriveStatus's `demoPhase` param.
  const stageOverrides = useStore((s) => s.stageOverrides)
  // Confirms a reopen request (or an Ask Help chat's change/reopen request) actually got raised —
  // the card just silently moves section, which is easy to miss without an explicit acknowledgement.
  // Dismissal is owned by the effect (keyed on the message), not an external timer ref, so there's
  // nothing to leak/re-clear.
  const [reopenToast, setReopenToast] = useState<string | null>(null)
  // The Ask Help chat, opened either from a specific card's CTA (set here) or the general floater.
  const [askHelp, setAskHelp] = useState<AskHelpInit | null>(null)
  const nav = useNavigate()
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  // A card's "Ask Help" opens the Ask Help chat (contextual to that event/stage). The chat greets the
  // user and hands off to the real screen (Add People / City / Zone Selection) via a Continue button —
  // so they land in the assistant first, not straight on a screen.
  const handleCardAskHelp = (init: AskHelpInit) => setAskHelp(init)
  useEffect(() => {
    if (!reopenToast) return
    const t = setTimeout(() => setReopenToast(null), 3000)
    return () => clearTimeout(t)
  }, [reopenToast])
  const invitationBannerPending = useStore((s) => s.flow.invitationBannerPending)
  const dismissInvitationBanner = useStore((s) => s.dismissInvitationBanner)
  const acceptGroupInvite = useStore((s) => s.acceptGroupInvite)
  const location = useLocation()

  // One-shot notice after RequireMiqaat bounced an unknown `:id` here (a stale bookmark, a shared
  // link to a removed event, a hand-typed URL). Shown as a toast rather than a popup: nothing was
  // lost and there is no decision to make, so it should not interrupt.
  useEffect(() => {
    if ((location.state as { unknownMiqaat?: boolean } | null)?.unknownMiqaat) {
      setReopenToast(t('That Miqaat is no longer available. Showing your Miqaats instead.'))
      window.history.replaceState({}, '') // consume so it doesn't reappear on refresh/back
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-shot "Reservation Cancelled" success popup — shown here on Home after the user cancels from
  // Modify Reservation (the success lives on Home, not on the cancel screen).
  const [cancelledOpen, setCancelledOpen] = useState(false)
  useEffect(() => {
    if ((location.state as { reservationCancelled?: boolean } | null)?.reservationCancelled) {
      setCancelledOpen(true)
      window.history.replaceState({}, '') // consume so it doesn't reopen on refresh/back
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-shot "Request Sent" success popup — shown here on Home after City/Zone Selection files a
  // reopen request (missed-deadline path). Mirrors the Reservation Cancelled popup above.
  const [requestSentText, setRequestSentText] = useState<string | null>(null)
  useEffect(() => {
    const text = (location.state as { requestSent?: string } | null)?.requestSent
    if (text) {
      setRequestSentText(text)
      window.history.replaceState({}, '') // consume so it doesn't reopen on refresh/back
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-shot "City arrangement saved" success popup — shown here on Home after saving/updating the
  // Arrange My Cities layout. Mirrors the Reservation Cancelled popup above (Save now navigates
  // straight here instead of showing the popup over the Arrange screen first).
  const [arrangementSavedOpen, setArrangementSavedOpen] = useState(false)
  useEffect(() => {
    if ((location.state as { cityArrangementSaved?: boolean } | null)?.cityArrangementSaved) {
      setArrangementSavedOpen(true)
      window.history.replaceState({}, '') // consume so it doesn't reopen on refresh/back
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // In-app invitation banner (shown once on landing here after registering for an invite event) +
  // the Invitation Received popup it opens.
  const [bannerOpen, setBannerOpen] = useState(false)
  const [invitePopup, setInvitePopup] = useState(false)
  // Right-side confirmation toast shown after acting on the invitation from Home.
  const [inviteToast, setInviteToast] = useState<string | null>(null)
  const inviteToastTimer = useRef<ReturnType<typeof setTimeout>>()
  const showInviteToast = (msg: string) => {
    setInviteToast(msg)
    if (inviteToastTimer.current) clearTimeout(inviteToastTimer.current)
    inviteToastTimer.current = setTimeout(() => setInviteToast(null), 3000)
  }
  useEffect(() => () => { if (inviteToastTimer.current) clearTimeout(inviteToastTimer.current) }, [])
  // Arm the banner when the store flag is set, then immediately consume the flag so it shows once.
  useEffect(() => {
    if (!invitationBannerPending) return
    setBannerOpen(true)
    dismissInvitationBanner()
  }, [invitationBannerPending, dismissInvitationBanner])
  // Auto-hide after a few seconds; a manual dismiss / view clears bannerOpen and cancels this.
  useEffect(() => {
    if (!bannerOpen) return
    const t = setTimeout(() => setBannerOpen(false), 6500)
    return () => clearTimeout(t)
  }, [bannerOpen])

  const asharaBase = miqaats.find((m) => m.id === 'ashara-1448')!
  const asharaMiqaat = { ...asharaBase, effectiveStatus: deriveStatus(asharaBase, journey(asharaBase.id), stageOverrides['ashara-1448']) }
  const STATUS_ORDER: Record<string, number> = {
    raza_issued: 0, host_allocated: 0, relay_allocated: 0, zone_done: 0, registered_select: 0,
    zone_select: 0, city_open: 1, zone_open: 1, live: 2, registered: 3, opens_soon: 4,
  }
  const displayMiqaats = getDisplayMiqaats(flow, registrations)
    .sort((a, b) => (STATUS_ORDER[a.effectiveStatus] ?? 9) - (STATUS_ORDER[b.effectiveStatus] ?? 9))

  // A pending (un-approved) reopen request pulls a miqaat out of its normal section entirely, into
  // "Requested" below — it moves back once the request is approved.
  const isRequested = (m: DisplayMiqaat) => !!reopenRequests[m.id] && !reopenRequests[m.id].approved
  const requestedMiqaats = displayMiqaats.filter(isRequested)
  const registeredMiqaats = displayMiqaats.filter((m) => !isRequested(m) && REGISTERED_STATES.includes(m.effectiveStatus))
  // Fixed display order for the "Current & Upcoming" list. Chehlum (opens_soon, "registration not
  // open yet") has no entry, so it trails the four open-for-registration events.
  const UPCOMING_ORDER: Record<string, number> = {
    'araz': -1,         // Urs Mubarak Syedna Mohammed Burhanuddin RA — leads the list
    'eg-registered': 0, // Milad Rasul (SAW)
    'eg-soon': 1,       // Urs Mubarak Syedna Taher Saifuddin RA
    'eg-cityopen': 2,   // Eid-e-Ghadeer 1447H
    'eg-live': 3,       // Milad Imam uz Zaman (AS)
  }
  const upcomingMiqaats = displayMiqaats
    .filter((m) => !isRequested(m) && !REGISTERED_STATES.includes(m.effectiveStatus))
    .sort((a, b) => (UPCOMING_ORDER[a.id] ?? 99) - (UPCOMING_ORDER[b.id] ?? 99))

  const cityName = (m: DisplayMiqaat) =>
    m.effectiveStatus === 'zone_open'
      ? m.reservedCity
      : ['host_allocated', 'relay_allocated', 'zone_done', 'raza_issued', 'city_done_waiting_zone'].includes(m.effectiveStatus)
        ? journey(m.id).confirmedCity?.name
        : undefined
  const zoneName = (m: DisplayMiqaat) =>
    ['zone_done', 'raza_issued'].includes(m.effectiveStatus) ? journey(m.id).confirmedZone?.name : undefined

  return (
    <PhoneScreen>
      <div className="w-full bg-white">
        {/* Mobile: sticky green identity header — hides on scroll-down, reveals on scroll-up */}
        <div
          className="sticky top-0 z-50 transition-transform duration-300 ease-in-out sm:hidden"
          style={{ transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)' }}
        >
          <IdentityHeader />
        </div>
        {/* Desktop: sticky AppBar — same scroll-hide behaviour */}
        <div
          className="sticky top-0 z-50 hidden transition-transform duration-300 ease-in-out sm:block"
          style={{ transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)' }}
        >
          <AppBar notificationCount={3} onBellClick={() => {}} />
        </div>

        {/* Ashara Mubaraka featured hero banner */}
        <div className="pt-[20px] sm:pt-[28px]">
          <AsharaBanner
            m={asharaMiqaat}
            confirmedCityName={cityName(asharaMiqaat)}
            confirmedZoneName={zoneName(asharaMiqaat)}
          />
        </div>

        {/* Registered — miqaats with an active reservation that need attention */}
        {registeredMiqaats.length > 0 && (
          <div className="mt-[30px]">
            <SectionHeader title={t('Registered')} subtitle="Your registered Miqaats that require your attention." />
            <div className="mt-[16px] px-[16px] sm:px-0">
              {/* A single registered reservation spans the full width on web as one horizontal row
                  (image · details+countdown · stacked action buttons on the right). Two or more keep
                  the side-by-side 2-column grid. */}
              <div className={`grid grid-cols-1 items-stretch gap-[16px] sm:gap-[20px] ${registeredMiqaats.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {registeredMiqaats.map((m) => (
                  <RegisteredCard key={m.id} m={m} wide={registeredMiqaats.length === 1} confirmedCityName={cityName(m)} confirmedZoneName={zoneName(m)} onAskHelp={handleCardAskHelp} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Requested — a missed registration/city/zone window the user has asked to reopen */}
        {requestedMiqaats.length > 0 && (
          <div className="mt-[30px]">
            <SectionHeader title={t('Requested')} subtitle={t('Miqaats where you\'ve asked to reopen a missed step — awaiting admin approval.')} />
            <div className="mt-[16px] px-[16px] sm:px-0">
              <div className={`grid grid-cols-1 items-stretch gap-[16px] sm:gap-[20px] ${requestedMiqaats.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {requestedMiqaats.map((m) => (
                  <RequestedCard key={m.id} m={m} request={reopenRequests[m.id]} wide={requestedMiqaats.length === 1} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Miqaats Current & Upcoming — compact rows */}
        {upcomingMiqaats.length > 0 && (
          <div className="mt-[34px]">
            <SectionHeader title={t('Miqaats Current & Upcoming')} subtitle={t('View all current and upcoming Miqaats in one place.')} />
            <div className="mt-[16px] px-[16px] pb-[8px] sm:px-0">
              <div data-tour="miqaat-cards" className="grid grid-cols-1 items-stretch gap-[16px] sm:grid-cols-2 sm:gap-[20px]">
                {upcomingMiqaats.map((m) => (
                  <UpcomingRow key={m.id} m={m} onAskHelp={handleCardAskHelp} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Page footer */}
        <PageFooter />
      </div>

      {/* In-app invitation banner — slides in below the header once after registering for an
          invite event; tapping it (or "View invitation") opens the Invitation Received popup. */}
      <InvitationBanner
        open={bannerOpen}
        onView={() => { setBannerOpen(false); setInvitePopup(true) }}
        onClose={() => setBannerOpen(false)}
      />
      {invitePopup && (
        <InvitationPopup
          onClose={() => setInvitePopup(false)}
          onAccept={() => { acceptGroupInvite(); setInvitePopup(false); showInviteToast('Invitation accepted') }}
          onDecline={() => { setInvitePopup(false); showInviteToast('Invitation declined') }}
        />
      )}
      <InviteToast message={inviteToast} onClose={() => setInviteToast(null)} />
      <Toast toast={reopenToast ? { text: reopenToast, tone: 'success' } : null} />

      {/* Ask Help: a specific card's CTA (askHelp state, set above) or the general floater — both
          drive this one dock/chat instance. Home-only, per product decision. */}
      <AskHelpDock askHelp={askHelp} onConsumeAskHelp={() => setAskHelp(null)} onToast={setReopenToast} />

      {/* Success popup after cancelling a reservation from Modify Reservation. The event is now
          registerable again, so this lands the user back on Home with a clear confirmation. */}
      {cancelledOpen && (
        <BottomSheet
          open
          onClose={() => setCancelledOpen(false)}
          footer={(
            <button type="button" onClick={() => setCancelledOpen(false)}
              className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] text-[16px] font-bold text-white shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.3)]"
              style={{ fontFamily: FONT_SANS }} {...tx('Done')} />
          )}
        >
          <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
            <span className="flex size-[74px] items-center justify-center rounded-full bg-[#e7f1ea]">
              <span className="flex size-[54px] items-center justify-center rounded-full bg-[#1f7a4d]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[27px]">
                  <path d="M5 12.5l4.4 4.4L19 7.4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
            <h2 className="mt-[18px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Reservation Cancelled')} />
            <p className="mt-[10px] max-w-[336px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }} {...tx('Your reservation has been cancelled. You can register for this event again anytime.')} />
          </div>
        </BottomSheet>
      )}

      {/* Success popup after filing a city/zone reopen request (missed-deadline path). Lands the
          user back on Home with a clear confirmation, same shell as Reservation Cancelled above. */}
      {requestSentText && (
        <BottomSheet
          open
          onClose={() => setRequestSentText(null)}
          footer={(
            <button type="button" onClick={() => setRequestSentText(null)}
              className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] text-[16px] font-bold text-white shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.3)]"
              style={{ fontFamily: FONT_SANS }} {...tx('Done')} />
          )}
        >
          <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
            <span className="flex size-[74px] items-center justify-center rounded-full bg-[#e7f1ea]">
              <span className="flex size-[54px] items-center justify-center rounded-full bg-[#1f7a4d]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[27px]">
                  <path d="M5 12.5l4.4 4.4L19 7.4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
            <h2 className="mt-[18px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Request Sent')} />
            <p className="mt-[10px] max-w-[336px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
              {requestSentText}
            </p>
          </div>
        </BottomSheet>
      )}

      {/* Success popup after saving/updating the Arrange My Cities layout — lands here on Home
          (same shell as Reservation Cancelled/Request Sent above) instead of on the Arrange screen. */}
      {arrangementSavedOpen && (
        <BottomSheet
          open
          onClose={() => setArrangementSavedOpen(false)}
          footer={(
            <button type="button" onClick={() => setArrangementSavedOpen(false)}
              className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] text-[16px] font-bold text-white shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.3)]"
              style={{ fontFamily: FONT_SANS }} {...tx('Done')} />
          )}
        >
          <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
            <span className="flex size-[74px] items-center justify-center rounded-full bg-[#e7f1ea]">
              <span className="flex size-[54px] items-center justify-center rounded-full bg-[#1f7a4d]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[27px]">
                  <path d="M5 12.5l4.4 4.4L19 7.4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
            <h2 className="mt-[18px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('City arrangement saved')} />
            <p className="mt-[10px] max-w-[336px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }} {...tx('Your preferred city layout has been updated successfully.')} />
          </div>
        </BottomSheet>
      )}
    </PhoneScreen>
  )
}

/** Small confirmation toast for invitation actions (accept/decline) taken from Home. Portalled to
 *  <body> so the sticky header's transform can't trap it. */
function InviteToast({ message, onClose }: { message: string | null; onClose: () => void }) {
                                                                                              const { t } = useT()
  const [mounted, setMounted] = useState(!!message)
  const [shown, setShown] = useState(false)
  const [text, setText] = useState(message)
  useEffect(() => {
    if (message) {
      setText(message)
      setMounted(true)
      const r = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 260)
    return () => clearTimeout(t)
  }, [message])
  if (!mounted) return null
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[40px] z-[95] flex justify-center px-[16px] sm:inset-x-auto sm:bottom-auto sm:end-[24px] sm:top-[84px] sm:px-0"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex items-center gap-[10px] rounded-full bg-[#1f5a44] px-[18px] py-[12px] shadow-[0_14px_36px_-10px_rgba(21,64,47,0.55)]"
        style={{
          fontFamily: FONT_SANS,
          transform: shown ? 'translateY(0)' : 'translateY(-10px)',
          opacity: shown ? 1 : 0,
          transition: 'transform 260ms cubic-bezier(0.22,1,0.36,1), opacity 240ms ease',
        }}
      >
        <span className="flex size-[20px] shrink-0 items-center justify-center rounded-full bg-white/15">
          <svg viewBox="0 0 20 20" fill="none" className="size-[13px]">
            <path d="M4 10.5l3.5 3.5L16 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="whitespace-nowrap text-[14px] font-bold text-white">{text}</span>
        <button type="button" onClick={onClose} aria-label={t('Dismiss')} className="ms-[2px] flex size-[20px] items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white">
          <svg viewBox="0 0 20 20" fill="none" className="size-[13px]"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}
