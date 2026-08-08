import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { Iso, isolateRuns } from '../components/Bidi'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import BottomSheet from '../components/figma/BottomSheet'
import LeaveCityConfirmSheet from '../components/figma/LeaveCityConfirmSheet'
import StickyFooter from '../components/figma/StickyFooter'
import Popover from '../components/Popover'
import { liveCities, cityDirectory, family, genderByIts, allocationCloses, miqaats, zonesByCityId, type FamilyMember, type Zone } from '../data/seed'
import type { LiveCity } from '../data/seed'
import { bandLabel, buildAllGroups, type BadgeKind, type Group } from '../lib/group'
import RoleBadge from '../components/figma/RoleBadge'
import Checkbox from '../components/figma/Checkbox'
import StepIndicator from '../components/figma/StepIndicator'
import ConfirmedView, { UnallocatedNotice, OpensLaterNotice, notAllocatedLabel, type ConfirmStage, type OpensLaterInfo } from '../components/figma/ConfirmedView'
import Toast, { useToast } from '../components/figma/Toast'
import { useStore, journeyFor, DEMO_PHASE_ORDER, type RankedCity } from '../store'
import { plural, useT, tNow } from '../i18n'
import { DateLine, TimeLine } from '../components/DateLine'
import { memberTableMinWidth } from '../components/memberTable'
import { notLanguage } from '../components/NotLanguage'

// ── Types ──────────────────────────────────────────────────────────────────────

// 'success-zone': the same-day-flow event's combined city+zone confirmation (finishCity() routes
// here instead of navigating to the separate Zone Selection screen — see `isSameDayFlow`).
type ViewState = 'queue-waiting' | 'queue-active' | 'browse' | 'success' | 'success-zone'

/** How long the demo queue holds before it opens. Named so the countdown effect and the initial
 *  state cannot drift apart — they previously shared a bare `4`. */
const QUEUE_WAIT_SECONDS = 4

// ── Constants ──────────────────────────────────────────────────────────────────

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'
const ITS_CREST = '/miqaat-logo.png'
/** Seconds a host-city group stays on hold after "Reserve" before the user must confirm. */
const HOLD_SEC = 30
/** The deep-green loader backdrop (Self-Allocation / People-Ahead queue screens). Reused by the
 *  Choose City Type popup for visual consistency. */
const LOADER_BG = 'linear-gradient(160deg,#0a2318 0%,#15402f 55%,#1f5a44 100%)'

// ── Helpers ────────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

/** `LiveCity.region` is a mix of Indian states and direct country names — map states to "India" so
 *  the relay grid can be grouped by country (mirrors ArrangeCities.tsx's same helper). */
const REGION_TO_COUNTRY: Record<string, string> = {
  Maharashtra: 'India', 'Tamil Nadu': 'India', 'Madhya Pradesh': 'India', 'West Bengal': 'India',
  Telangana: 'India', Delhi: 'India', Gujarat: 'India', Kerala: 'India', Karnataka: 'India', 'Uttar Pradesh': 'India',
  Rajasthan: 'India',
  USA: 'United States', UK: 'United Kingdom', UAE: 'United Arab Emirates',
}
const countryOf = (c: LiveCity) => REGION_TO_COUNTRY[c.region] ?? c.region

function fmtHHMMSS(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function fmtClock(s: number) {
  const t = Math.max(0, s)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Host-city selection key. The SAME person can appear in two linked groups
 * (e.g. guardian of one dependent AND caregiver of another), so selection must be
 * tracked per (group, member) — keying by member id alone makes both rows share a
 * checkbox. Key = `${groupIndex}:${memberId}`.
 */
const memKey = (gi: number, memberId: string) => `${gi}:${memberId}`

function familyMeta(m: FamilyMember) {
  // Prefer the member's own gender (invited Mehmaan/Others carry it); genderByIts knows only family
  // members. Invited primaries have a blank relation, so omit the leading tag for them.
  const g = m.gender ?? genderByIts(m.its)
  const base = `${g ? `${g} · ` : ''}${tNow('Age')} ${String(m.age).padStart(2, '0')} · ${tNow('ITS')} ${m.its}`
  return isolateRuns(m.relation ? `${tNow(m.relation)} · ${base}` : base)
}

// ── Shared atoms ───────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="text-white font-bold" style={{ fontSize: size * 0.36, fontFamily: FONT, lineHeight: 1 }} {...notLanguage}>
        {initials(name)}
      </span>
    </div>
  )
}

function LinkGlyph({ color = '#2e6a7d' }: { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0">
      <path
        d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699"
        stroke={color} strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Queue: Waiting ─────────────────────────────────────────────────────────────

function QueueWaiting({ countdown }: { countdown: number }) {
  const { t, tx } = useT()
  return (
    <div className="min-h-[100dvh] w-full" style={{ background: LOADER_BG }}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col items-center justify-center px-[24px] py-[36px] sm:max-w-[520px]">
        <img src={ITS_CREST} alt="" className="mt-[16px] h-[80px] w-[54px] object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
        <h1 className="mt-[24px] text-center text-[26px] leading-[34px] text-white" style={{ fontFamily: SERIF }} {...tx('Self Allocation not open yet')} />
        <p className="mt-[14px] text-[11px] font-bold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] text-center" style={{ fontFamily: FONT }}>
          This queue will open on
        </p>
        <div className="mt-[12px] w-full max-w-[260px] rounded-[16px] px-[24px] py-[18px] text-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[rgba(255,255,255,0.4)]" style={{ fontFamily: FONT }}>There is</p>
          <p className="mt-[4px] text-[54px] font-bold leading-none text-white" style={{ fontFamily: FONT }}>
            {String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}
          </p>
          <p className="mt-[4px] text-[11px] font-bold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.4)]" style={{ fontFamily: FONT }} {...tx('Min · Sec Left')} />
        </div>
        <div className="mt-[22px] flex flex-col gap-[10px] text-[14px] leading-[22px] text-[rgba(255,255,255,0.72)] text-center" style={{ fontFamily: FONT }}>
          <p>{t('Coming early does')} <strong className="text-white">not</strong> give you an earlier position.</p>
          <p>At the exact start time everyone on this page is assigned a <strong className="text-white">random queue position</strong> — an <strong style={{ color: '#e3cd96' }}>equal chance</strong> for all.</p>
          <p {...tx('Stay on this page and wait for the queue to begin.')} />
        </div>
        <div className="mt-[18px] w-full rounded-[10px] px-[16px] py-[12px]" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <p className="text-[13px] leading-[20px] text-[rgba(255,255,255,0.7)]" style={{ fontFamily: FONT }}>
            <strong className="text-white" {...tx('Note:')} /> City Selection is only available for those with <strong className="text-white">valid travel documents</strong> and a completed registration.
          </p>
        </div>
        <p className="mt-[24px] text-[12px] italic text-[rgba(255,255,255,0.3)] text-center" style={{ fontFamily: FONT }} {...tx('Please keep this page open. Refreshing is not required.')} />
      </div>
    </div>
  )
}

// ── Queue: Active ──────────────────────────────────────────────────────────────

function QueueActive({ onContinue }: { onContinue: () => void }) {
  const { t, tx } = useT()
  useEffect(() => {
    const t = setTimeout(onContinue, 5_000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-[100dvh] w-full" style={{ background: LOADER_BG }}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col items-center justify-center px-[24px] py-[36px] sm:max-w-[520px]">
        <img src={ITS_CREST} alt="" className="mt-[16px] h-[80px] w-[54px] object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
        <h1 className="mt-[24px] text-[26px] leading-[34px] text-white text-center" style={{ fontFamily: SERIF }} {...tx('Queue started')} />
        <p className="mt-[10px] text-[13px] leading-[20px] text-[rgba(255,255,255,0.68)] text-center" style={{ fontFamily: FONT }} {...tx('Your position has been assigned. Remain on this page while we process entries.')} />
        <p className="mt-[24px] text-[68px] font-bold leading-none text-white" style={{ fontFamily: FONT }}>1,367</p>
        <p className="mt-[4px] text-[14px] text-[rgba(255,255,255,0.68)]" style={{ fontFamily: FONT }}>{t('people ahead of you')}</p>
        <div className="mt-[18px] h-[12px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <div className="h-full rounded-full" style={{ width: '88%', background: 'linear-gradient(90deg,#a8843e,#e3cd96)' }} />
        </div>
        <div className="mt-[10px] flex items-center gap-[6px] rounded-full px-[14px] py-[6px]" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <span className="size-[7px] shrink-0 rounded-full bg-[#e3cd96]" />
          <span className="text-[12px] font-bold text-white" style={{ fontFamily: FONT }} {...tx('Estimated wait < 2 minutes')} />
        </div>
        <p className="mt-[12px] text-[13px] text-[rgba(255,255,255,0.55)] text-center" style={{ fontFamily: FONT }} {...tx('We\'re moving participants through as capacity becomes available')} />
        <div className="mt-[18px] w-full rounded-[10px] px-[16px] py-[12px]" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <p className="text-[13px] leading-[20px] text-[rgba(255,255,255,0.7)]" style={{ fontFamily: FONT }}>
            <strong className="text-white" {...tx('Do not refresh or close this page.')} />{' '}Refreshing may cause you to lose your queue position.
          </p>
        </div>
        <p className="mt-[20px] text-[12px] italic text-[rgba(255,255,255,0.3)] text-center" style={{ fontFamily: FONT }} {...tx('Kindly keep this page open and wait for your turn')} />
      </div>
    </div>
  )
}

// ── CityHCard ──────────────────────────────────────────────────────────────────

function PeopleMini({ color = '#5a6660' }: { color?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[15px] shrink-0">
      <path d="M14 17v-1.5a3 3 0 00-3-3H5a3 3 0 00-3 3V17M8 9.5a3 3 0 100-6 3 3 0 000 6zM18 17v-1.5a3 3 0 00-2.25-2.9M13 3.6a3 3 0 010 5.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Relay city chip (mobile horizontal picker). Fixed height so every card stays
 *  aligned whether or not it shows a second line. "N added" appears only on cities
 *  that actually hold members (added > 0) — never "0 added" on every card. */
function CityHCard({ city, selected, added, unavailable, onClick }: { city: LiveCity; selected: boolean; added: number; unavailable: boolean; onClick: () => void }) {
  const { tx, t, td } = useT()
  const [showTip, setShowTip] = useState(false)
  const style: React.CSSProperties = {
    border: selected ? '2px solid #d9c98a' : '2px solid #e7dfc9',
    background: selected ? '#fffdf5' : unavailable ? '#f6f6f4' : 'white',
    opacity: unavailable ? 0.6 : 1,
    minWidth: 130,
    minHeight: 64,
  }
  const cls = 'relative shrink-0 flex flex-col justify-center rounded-[14px] px-[14px] py-[10px] text-left transition-colors'
  // Unavailable cards are non-interactive except the info icon → render as a div so the tap-tooltip works.
  if (unavailable) {
    return (
      <div className={cls} style={style}>
        <span className="text-[15px] font-bold leading-[20px] text-[#8a938e]" style={{ fontFamily: FONT }} {...td(city.name)} />
        <span className="relative mt-[3px] inline-flex w-fit items-center gap-[4px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>
          
          {t('Not available')}
          <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setShowTip((v) => !v) }} className="inline-flex cursor-pointer" aria-label={t('Why not available?')}><InfoIcon /></span>
          {showTip && (
            <span className="absolute bottom-[calc(100%+8px)] start-0 z-[60] w-[150px] rounded-[8px] bg-[#23302a] px-[10px] py-[7px] text-[12px] font-medium leading-[16px] text-white shadow-[0_8px_22px_-6px_rgba(0,0,0,0.4)]" style={{ fontFamily: FONT }} {...tx('Capacity is full.')} />
          )}
        </span>
      </div>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer`} style={style}>
      <span className="text-[15px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(city.name)} />
      {/* Reserved status line: "N added" on the active/member-holding city, else a green "Available". */}
      {(selected || added > 0) ? (
        <span className="mt-[4px] flex items-center gap-[5px] text-[13px] font-semibold text-[#5a6660]" style={{ fontFamily: FONT }}>
          <PeopleMini /> {added} added
        </span>
      ) : (
        <span className="mt-[4px] text-[13px] font-semibold text-[#1f7a4d]" style={{ fontFamily: FONT }} {...tx('Available')} />
      )}
    </button>
  )
}

// ── ViewAllSheet ───────────────────────────────────────────────────────────────

function ViewAllSheet({
  cities, selectedCity, addedOf, onSelect, onClose, search, onSearch,
}: {
  cities: LiveCity[]
  selectedCity: LiveCity | null
  addedOf: (cityId: string) => number
  onSelect: (c: LiveCity) => void
  onClose: () => void
  search: string
  onSearch: (v: string) => void
}) {
     const { tx, t, td } = useT()
  const filtered = search
    ? cities.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : cities

  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <div className="pe-[36px]">
            <span className="text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('All Relay Cities')} />
          </div>
          {/* Search */}
          <div className="mt-[14px] flex items-center gap-[10px] rounded-full border border-[#e7dfc9] bg-[#faf8f2] px-[14px] h-[44px]">
            <input
              placeholder={t('Search city names...')}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="flex-1 bg-transparent text-[14px] outline-none text-[#23302a] placeholder-[#b0b8b3]"
              style={{ fontFamily: FONT }}
            />
            <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    >
      {/* City list */}
      <div className="flex flex-col gap-[8px]">
        {filtered.map((c) => {
          const { t } = useT()
          const added = addedOf(c.id)
          const isFull = c.seatsLeft - added <= 0
          const isSelected = selectedCity?.id === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => { if (!isFull) { onSelect(c); onClose() } }}
              className="flex items-center justify-between rounded-[14px] border px-[16px] py-[14px] text-start w-full"
              style={{
                borderColor: isSelected ? '#d9c98a' : '#e7dfc9',
                background: isSelected ? '#fffdf5' : 'white',
                opacity: isFull ? 0.5 : 1,
                cursor: isFull ? 'default' : 'pointer',
              }}
            >
              <div>
                <p className="text-[15px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#8a938e' : '#23302a' }} {...td(c.name)} />
                {/* Status line follows the relay-city chips: red "Not available" when full, "N added"
                    only on cities that actually hold members, else a green "Available". */}
                <p className="mt-[3px] flex items-center gap-[5px] text-[13px] font-bold"
                  style={{ fontFamily: FONT, color: isFull ? '#b23b3b' : (isSelected || added > 0) ? '#5a6660' : '#1f7a4d' }}>
                  {isFull ? t('Not available') : (isSelected || added > 0) ? <><PeopleMini /> {added} added</> : t('Available')}
                </p>
              </div>
              <div
                className="size-[24px] shrink-0 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: '#d9c98a' }}
              >
                {isSelected && <div className="size-[12px] rounded-full" style={{ background: '#d9c98a' }} />}
              </div>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

// ── Zone picker (same-day-flow events only) ─────────────────────────────────────
// Ported from HostCityMove.tsx's ZoneTrigger/ZoneMoveDropdown (the in-table zone-change dropdown) —
// adapted to seed.ts's real `Zone` shape ({capacity, filled} instead of {left}).

/** Pill trigger showing the picked zone (or a placeholder) — opens `ZoneMoveDropdown` anchored below. */
function ZoneTrigger({ label, placeholder, active, disabled, onClick }: { label: string | null; placeholder: string; active: boolean; disabled?: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(e.currentTarget) }}
      className="inline-flex h-[40px] w-full max-w-[210px] items-center justify-between gap-[8px] rounded-full border px-[16px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ fontFamily: FONT, borderColor: disabled ? '#e7dfc9' : '#1f5a44', background: disabled ? '#faf9f5' : 'white' }}
    >
      <span className={`truncate text-[14px] font-bold ${label ? 'text-[#1f5a44]' : 'text-[#5a7d6e]'}`}>{label ?? placeholder}</span>
      {!disabled && (
        <svg viewBox="0 0 16 16" fill="none" className={`size-[14px] shrink-0 transition-transform ${active ? 'rotate-180' : ''}`}>
          <path d="M4 6l4 4 4-4" stroke="#1f5a44" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

/** Searchable zone dropdown popover (anchored, fixed) — the per-row zone picker. */
function ZoneMoveDropdown({ anchor, zones, selectedZoneId, search, onSearch, onSelect, onClose }: {
  anchor: HTMLElement
  zones: Zone[]
  selectedZoneId: string | null
  search: string
  onSearch: (v: string) => void
  onSelect: (z: Zone) => void
  onClose: () => void
}) {
     const { tx, t, td } = useT()
  const filtered = search ? zones.filter((z) => z.name.toLowerCase().includes(search.toLowerCase())) : zones
  return (
    <Popover anchor={anchor} width={300} onClose={onClose}>
        <div className="p-[10px]">
          <div className="flex h-[40px] items-center gap-[8px] rounded-full border border-[#e7dfc9] bg-[#faf8f2] px-[12px]">
            <input autoFocus value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('Search zone names...')}
              className="flex-1 bg-transparent text-[14px] outline-none text-[#23302a] placeholder-[#b0b8b3]" style={{ fontFamily: FONT }} />
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0 text-[#8a938e]"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
        </div>
        <div className="max-h-[240px] overflow-y-auto px-[8px] pb-[10px]">
          {filtered.map((z) => {
            const isFull = z.capacity - z.filled <= 0
            const selected = z.id === selectedZoneId
            return (
              <button key={z.id} type="button" disabled={isFull} onClick={!isFull ? () => onSelect(z) : undefined}
                className="flex w-full items-center justify-between rounded-[10px] px-[12px] py-[11px] text-start transition-colors"
                style={{ background: selected ? '#eaf3ed' : 'transparent', cursor: isFull ? 'not-allowed' : 'pointer' }}>
                <span className="truncate text-[15px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#b0b8b3' : '#23302a' }} {...td(z.name)} />
                {isFull
                  ? <span className="text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Full')} />
                  : (selected && (
                      <svg viewBox="0 0 16 16" fill="none" className="size-[16px] shrink-0"><path d="M3 8.5l3 3 7-7.5" stroke="#1f7a4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ))}
              </button>
            )
          })}
          {filtered.length === 0 && <p className="px-[12px] py-[10px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No zones found.')} />}
        </div>
    </Popover>
  )
}

/** Small Host/Relay City pill — ported from ZoneSelection.tsx's CityKindTag, for the combined
 *  screen's zone-confirmed summary (grouped by zone, each carrying its own city's type). */
function CityKindTag({ type }: { type?: 'host' | 'relay' }) {
  const { t } = useT()
  if (!type) return null
  const host = type === 'host'
  return (
    <span className="mt-[6px] inline-flex h-[20px] items-center rounded-full px-[9px] text-[10px] font-bold tracking-[0.3px]"
      style={{ fontFamily: FONT, background: host ? '#f7efd6' : '#e1eef1', color: host ? '#a8843e' : '#2e6a7d' }}>
      {host ? t('Host City') : t('Relay City')}
    </span>
  )
}

// ── AllocateGroupCard (mobile) ─────────────────────────────────────────────────

/**
 * Mobile group-allocation card — the phone-idiom equivalent of the desktop
 * `AllocateDesktopTable` row. Matches the merged web redesign: NO per-member
 * checkbox — tapping the whole card allocates/deallocates the group to the active
 * city (linked members move together). The footer mirrors the web table's
 * Status + City type + City columns. Assigned cards take a gold/cream selected skin.
 */
function AllocateGroupCard({
  group, assignedCity, available, eligible, closed, opensAt, location, onSelect, autoAllocated, locked, activeCityName, isRequest,
  showZone, zone, zoneDropdownOpen, onOpenZoneDropdown, swapTarget, onSwap, onRemove, hideReserveCta, currentAlloc,
}: {
  group: Group
  assignedCity: LiveCity | null
  available: boolean
  /** Global eligibility → drives the Status line (an admin-closed city does NOT flip this). */
  eligible: boolean
  /** The ACTIVE city has been admin-closed for a member of this group (status stays valid, but this
   *  specific city can't be reserved) → "Not Available · Please choose a different city." Mirrors the
   *  desktop table, which was already receiving this via `closedFor`. */
  closed?: boolean
  /** Invited member whose reservation window hasn't opened yet (display string). */
  opensAt?: string
  /** Home city of an invited member who lives elsewhere. */
  location?: string
  onSelect: () => void
  /** This group never needs manual city selection — it's already been auto-allocated to the host
   *  city (a per-event "auto-allocate Others" rule). Not toggleable/removable, reads "Auto-allocated". */
  autoAllocated?: boolean
  /** Re-select mode: this group already holds another member's saved city — shown READ-ONLY (city
   *  displayed, no controls). Only the registrant's own group is (re)selectable. */
  locked?: boolean
  /** Missed-deadline / closed-window flow — the CTA files a request ("Request {city}" + send icon). */
  isRequest?: boolean
  /** The currently-picked city's name → the action reads "Reserve in <city>". Null means no city is
   *  picked yet, so the action becomes a "Select a city first" hint instead. */
  activeCityName: string | null
  /** Same-day-flow events only: adds a per-row zone picker so city + zone are both chosen on this
   *  single screen. Gated behind a dedicated per-event flag, never true for any other event. */
  showZone?: boolean
  zone?: Zone | null
  zoneDropdownOpen?: boolean
  onOpenZoneDropdown?: (el: HTMLElement) => void
  /** The city this already-reserved group can swap TO (the active city), or null when no swap is on
   *  offer. When set, the footer shows the "Current → Swap to" state instead of the Reserved pill. */
  swapTarget?: LiveCity | null
  /** Confirm the swap (move the single reservation to `swapTarget`). */
  onSwap?: () => void
  /** Cancel/remove the reservation entirely (the footer ✕) — kept distinct from the card tap so a tap
   *  in the swap-pending state swaps rather than removes. */
  onRemove?: () => void
  /** "Reserve all" already covers every eligible member for the active city → the per-row Reserve
   *  button is redundant here, so show a muted dash instead (matches the Allocation column's own
   *  empty-state dash). Never hides the blocked states (closed / full) or the swap pill. */
  hideReserveCta?: boolean
  /** Modify-city-zone flow: the group's CURRENT (pre-change) city + zone, shown as a "Now" caption. */
  currentAlloc?: { cityName: string; cityType: 'host' | 'relay'; zoneName: string } | null
}) {
     const { tx, t, td, tdText } = useT()
  const linked = !!group.label
  const isAssigned = assignedCity !== null
  const foreignName = group.members.find((mm) => mm.member.opensAt)?.member.name ?? ''
  const [showTip, setShowTip] = useState(false)
  // Status reflects the SELECTED city: a group that can't take the active city (admin-closed for a
  // member, or full) reads "Not valid for allocation" — not just the global eligibility flag.
  const validForSelected = eligible && !(!!activeCityName && !isAssigned && !opensAt && !available)

  return (
    <div
      onClick={autoAllocated || locked ? undefined : onSelect}
      className={`${autoAllocated || locked ? 'cursor-default' : 'cursor-pointer'} overflow-hidden rounded-[14px] border bg-white transition-all duration-200`}
      style={{
        borderColor: isAssigned ? '#d9c98a' : '#e7dfc9',
        background: isAssigned ? '#fffdf5' : 'white',
        opacity: available ? 1 : 0.6,
        boxShadow: isAssigned ? '0 8px 22px -14px rgba(168,132,62,0.5)' : 'none',
      }}
    >
      {linked && (
        <div className="flex h-[32px] items-center gap-[8px] bg-[#e1eef1] px-[13px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>{group.label ? t(bandLabel(group.label)) : null}</span>
        </div>
      )}
      <div className="relative">
        {group.members.map((mm, mi) => (
          <div key={mm.member.id} className="relative flex items-center gap-[10px] px-[13px] py-[10px]">
            {/* Connector drawn only in the gaps above/below each avatar (18px radius) → stops at edges. */}
            {linked && group.members.length > 1 && mi !== 0 && (
              <span className="pointer-events-none absolute start-[31px] z-0 w-[2px] bg-[#fac775]" style={{ top: 0, height: 'calc(50% - 18px)' }} />
            )}
            {linked && group.members.length > 1 && mi !== group.members.length - 1 && (
              <span className="pointer-events-none absolute start-[31px] z-0 w-[2px] bg-[#fac775]" style={{ top: 'calc(50% + 18px)', bottom: 0 }} />
            )}
            <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-[10px]">
              <Avatar name={mm.member.name} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#23302a] leading-[18px]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                <p className="text-[12px] text-[#5a6660] mt-[2px]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
                {mi === 0 && currentAlloc && (
                  /* Wraps rather than truncates — this pill IS the reason the screen exists (it's
                     the allocation you're changing away from), and "Colombo · Zon…" hid the very
                     zone name the user needs to compare against. */
                  <span className="mt-[6px] inline-flex max-w-full items-start gap-x-[6px] rounded-[11px] border border-[#e3decf] bg-[#faf7ef] px-[9px] py-[3px]" style={{ fontFamily: FONT }}>
                    <span className="shrink-0 pt-[1px] text-[10px] font-bold uppercase leading-[15px] tracking-[0.4px] text-[#a08a54]" {...tx('Now')} />
                    <span className="min-w-0 text-[11.5px] font-bold leading-[15px] text-[#6a726c]">{currentAlloc.cityName}{currentAlloc.zoneName ? ` · ${currentAlloc.zoneName}` : ''}</span>
                  </span>
                )}
              </div>
            </div>
            <RoleBadge kind={mm.badge} />
          </div>
        ))}
      </div>
      <div className="border-t border-[#f0ebe0] px-[13px] py-[10px]">
        {isAssigned && swapTarget ? (
          // Swap-pending — the current reservation stays visible while the newly-picked city animates in
          // as a "Swap to" destination. Nothing moves until the gold Swap button is tapped; the ✕
          // cancels the reservation entirely. Exactly one reservation is ever held.
          <div className="flex flex-col gap-[10px]">
            <div className="flex items-center gap-[10px]">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx(assignedCity!.type === 'host' ? 'Current allocation · Host city' : 'Current allocation · Relay city')} />
                <p className="mt-[1px] text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(assignedCity!.name)} />
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); onRemove?.() }} aria-label={t('Cancel reservation')}
                className="flex size-[26px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
                <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div key={swapTarget.id} className="swap-in flex items-center justify-between gap-[10px] rounded-[12px] border border-dashed border-[#d9c98a] bg-[#fffdf5] px-[12px] py-[10px]">
              <div className="min-w-0">
                <p className="flex items-center gap-[4px] text-[10px] font-bold uppercase tracking-[0.5px] text-[#a8843e]" style={{ fontFamily: FONT }}>
                  <svg viewBox="0 0 16 16" fill="none" className="size-[12px] shrink-0"><path d="M8 3v9M4.5 8.5L8 12l3.5-3.5" stroke="#a8843e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {t(swapTarget.type === 'host' ? 'Swap to · Host city' : 'Swap to · Relay city')}
                </p>
                <p className="mt-[1px] text-[16px] font-bold leading-[20px] text-[#a8843e]" style={{ fontFamily: FONT }} {...td(swapTarget.name)} />
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); onSwap?.() }}
                className="shrink-0 inline-flex h-[34px] items-center gap-[6px] rounded-full border border-[#2e6a7d] bg-white px-[16px] text-[13px] font-bold text-[#2e6a7d] transition-colors hover:bg-[#eef5f7] active:scale-[0.97]"
                style={{ fontFamily: FONT }}>
                <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#2e6a7d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span {...tx('Swap')} />
              </button>
            </div>
            <p className="text-[11.5px] font-semibold leading-[15px] text-[#23302a]" style={{ fontFamily: FONT }}>
              <span className="font-bold text-[#1f7a4d]" {...tx("You're selected in {city}", { city: tdText(assignedCity!.name) })} />
              {' '}
              <span {...tx('— do you want to swap it?')} />
            </p>
          </div>
        ) : isAssigned ? (
          // Once reserved, the footer becomes the allocation summary (city type + name, left)
          // and a light "Reserved" pill with a separate cancel icon (right) — matching the
          // desktop table's Action-column look instead of a small pill crammed into the status row.
          <div className="flex items-center justify-between gap-[8px]">
            <div className="min-w-0">
              <p className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>{assignedCity!.type === 'host' ? 'Host city' : 'Relay city'}</p>
              <p className="mt-[2px] text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(assignedCity!.name)} />
            </div>
            <div className="flex shrink-0 items-center gap-[10px]">
              <span className={`inline-flex items-center gap-[6px] rounded-full border px-[14px] py-[7px] text-[13px] font-bold ${isRequest && !autoAllocated && !locked ? 'border-[#f0d9a8] bg-[#fdf1dc] text-[#a9740f]' : 'border-[#bfe3cd] bg-[#eef7f1] text-[#1f7a4d]'}`} style={{ fontFamily: FONT }}>
                {isRequest && !autoAllocated && !locked ? (
                  <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                    <circle cx="9" cy="9" r="7.1" stroke="#a9740f" strokeWidth="1.4" />
                    <path d="M9 5.4V9l2.4 1.5" stroke="#a9740f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                    <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
                    <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {autoAllocated ? t('Auto-allocated') : isRequest && !locked ? t('Requested') : t('Selected')}
              </span>
              {!autoAllocated && !locked && (
                <button type="button" onClick={(e) => { e.stopPropagation(); (onRemove ?? onSelect)() }} aria-label={t('Remove reservation')}
                  className="flex size-[26px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
                  <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-[8px]">
            {/* Status — mirrors the web table's Status column (reflects the selected city too) */}
            {validForSelected ? (
              <span className="inline-flex items-center gap-[6px] text-[12.5px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT }}>
                <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                  <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
                  <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                
                {t('Valid for allocation')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-[5px] text-[12.5px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>
                <InfoIcon />
                
                {t('Not valid for allocation')}
              </span>
            )}
            {/* Action — mirrors the desktop table's Action column exactly, including the two blocked
                states that were missing on mobile: admin-closed for this city, and city full. */}
            {!opensAt && eligible && (
              closed ? (
                // Admin closed THIS city for a member (status stays valid) → "Not Available" + a hint.
                <div className="flex shrink-0 flex-col items-end gap-[3px]">
                  <span className="inline-flex h-[30px] items-center rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[14px] text-[12.5px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                  <span className="text-end text-[11px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Please choose a different city.')} />
                </div>
              ) : activeCityName && !available ? (
                // City out of seats for this group.
                <div className="flex shrink-0 flex-col items-end gap-[3px]">
                  <span className="inline-flex h-[30px] items-center rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[14px] text-[12.5px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                  <span className="text-end text-[11px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('This city is full — choose another.')} />
                </div>
              ) : activeCityName && !hideReserveCta ? (
                // Same "Reserve" pill as the desktop table's Action column — only shown once a city is
                // picked. The whole card is still tappable (this button just makes it visible/explicit).
                <button type="button" onClick={(e) => { e.stopPropagation(); onSelect() }}
                  className="shrink-0 inline-flex h-[30px] items-center gap-[6px] rounded-full px-[16px] text-[12.5px] font-bold transition-colors"
                  style={{ fontFamily: FONT, border: '1.5px solid #1f5a44', background: '#1f5a44', color: 'white' }}>
                  {isRequest && <svg viewBox="0 0 24 24" fill="none" className="size-[13px] shrink-0"><path d="M4.5 12l15-7.5-7 15-2.2-5.3L4.5 12z" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  {/* Verb and destination in one key. `{verb} {city}` glued in JSX puts the city
                      after the verb in every language, which is a decision the sentence has to
                      make, not the markup. */}
                  <bdi {...tx(isRequest ? 'Request {city}' : 'Select {city}', { city: tdText(activeCityName) })} />
                </button>
              ) : activeCityName ? (
                // "Reserve all" already covers everyone — redundant per-row button, muted dash instead.
                <span className="shrink-0 text-[13px] font-bold text-[#c2ccc6]">—</span>
              ) : (
                // No city picked yet → guide the user to pick one first, instead of a Reserve button
                // that would just error. Reserve appears once a city is selected above.
                <span className="shrink-0 inline-flex h-[30px] items-center rounded-full px-[14px] text-[12px] font-semibold"
                  style={{ fontFamily: FONT, border: '1.5px dashed #d3c8ac', color: '#a08a5e', background: 'transparent' }} {...tx('Select host or relay')} />
              )
            )}
          </div>
        )}
        {/* Same-day-flow events only: a per-row zone picker alongside the city Reserve action, so
            both are chosen on this one screen instead of a separate Zone Selection screen. */}
        {showZone && !opensAt && eligible && (
          <div className="mt-[10px] flex items-center justify-between gap-[8px]" onClick={(e) => e.stopPropagation()}>
            <span className="text-[13px] font-semibold text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Zone')} />
            <ZoneTrigger
              label={zone?.name ?? null}
              placeholder={t('Select a zone')}
              active={!!zoneDropdownOpen}
              // Zone follows the reserved city → only enabled once THIS member is reserved.
              disabled={!isAssigned}
              onClick={(rect) => onOpenZoneDropdown?.(rect)}
            />
          </div>
        )}
        {opensAt && (
          <OpensLaterNotice location={location ?? 'Their city'} opensAt={opensAt} name={foreignName} className="mt-[10px]" />
        )}
      </div>
    </div>
  )
}

// ── Host city flow (single host city + per-group reserve) ───────────────────────

/**
 * Decorative Islamic star-tessellation watermark for the Host city card. Reproduces the
 * lattice from the Figma "Frame 2147224619" (the mask strokes), themed to our gold and kept
 * subtle. `slice` + the card's overflow-hidden clip it to the rounded corners.
 */
export function HostCardPattern() {
  const D = [
    'M143.102 -45.459L95.6074 2.03591L48.1125 -45.459L95.6074 -92.9539L143.102 -45.459Z','M95.6074 -27.9307V2.64519',
    'M238.864 -45.459L191.369 2.03591L143.874 -45.459L191.369 -92.9539L238.864 -45.459Z','M191.369 -27.9307V2.64519',
    'M334.626 -45.459L287.131 2.03591L239.636 -45.459L287.131 -92.9539L334.626 -45.459Z','M287.131 -27.9307V2.64519',
    'M430.389 -45.459L382.895 2.03591L335.4 -45.459L382.895 -92.9539L430.389 -45.459Z','M382.895 -27.9307V2.64519',
    'M64.6474 1.85411L47.7266 18.775L30.8057 1.85411L47.7266 -15.0667L64.6474 1.85411Z','M79.9759 1.853L47.7266 34.1023L15.4772 1.853L47.7266 -30.3963L79.9759 1.853Z','M95.2215 1.85446L47.7266 49.3494L0.231637 1.85446L47.7266 -45.6405L95.2215 1.85446Z','M65.2559 1.85352H95.6852','M47.7266 19.3828V49.9587','M30.1972 1.85352H-0.376953',
    'M160.409 1.85411L143.488 18.775L126.567 1.85411L143.488 -15.0667L160.409 1.85411Z','M175.738 1.853L143.488 34.1023L111.239 1.853L143.488 -30.3963L175.738 1.853Z','M190.983 1.85446L143.488 49.3494L95.9934 1.85446L143.488 -45.6405L190.983 1.85446Z','M161.018 1.85352H191.447','M143.488 19.3828V49.9587','M125.959 1.85352H95.3848',
    'M256.171 1.85411L239.25 18.775L222.329 1.85411L239.25 -15.0667L256.171 1.85411Z','M271.499 1.853L239.25 34.1023L207.001 1.853L239.25 -30.3963L271.499 1.853Z','M286.745 1.85446L239.25 49.3494L191.755 1.85446L239.25 -45.6405L286.745 1.85446Z','M256.779 1.85352H287.209','M239.25 19.3828V49.9587','M221.721 1.85352H191.146',
    'M351.935 1.85411L335.014 18.775L318.093 1.85411L335.014 -15.0667L351.935 1.85411Z','M367.263 1.853L335.014 34.1023L302.764 1.853L335.014 -30.3963L367.263 1.853Z','M382.509 1.85446L335.014 49.3494L287.519 1.85446L335.014 -45.6405L382.509 1.85446Z','M352.543 1.85352H382.972','M335.014 19.3828V49.9587','M317.484 1.85352H286.91',
    'M447.696 1.85411L430.775 18.775L413.855 1.85411L430.775 -15.0667L447.696 1.85411Z','M463.025 1.853L430.775 34.1023L398.526 1.853L430.775 -30.3963L463.025 1.853Z','M478.27 1.85446L430.775 49.3494L383.28 1.85446L430.775 -45.6405L478.27 1.85446Z','M413.246 1.85352H382.672',
    'M112.528 49.1681L95.6074 66.0889L78.6866 49.1681L95.6074 32.2472L112.528 49.1681Z','M127.857 49.167L95.6074 81.4163L63.3581 49.167L95.6074 16.9176L127.857 49.167Z','M143.102 49.1684L95.6074 96.6634L48.1125 49.1684L95.6074 1.6735L143.102 49.1684Z','M95.6074 31.6381V1.06396','M113.137 49.1675H143.566','M95.6074 66.6968V97.2726','M78.078 49.1675H47.5039',
    'M208.29 49.1681L191.369 66.0889L174.448 49.1681L191.369 32.2472L208.29 49.1681Z','M223.618 49.167L191.369 81.4163L159.12 49.167L191.369 16.9176L223.618 49.167Z','M238.864 49.1684L191.369 96.6634L143.874 49.1684L191.369 1.6735L238.864 49.1684Z','M191.369 31.6381V1.06396','M208.898 49.1675H239.328','M191.369 66.6968V97.2726','M173.84 49.1675H143.266',
    'M304.052 49.1681L287.131 66.0889L270.21 49.1681L287.131 32.2472L304.052 49.1681Z','M319.38 49.167L287.131 81.4163L254.882 49.167L287.131 16.9176L319.38 49.167Z','M334.626 49.1684L287.131 96.6634L239.636 49.1684L287.131 1.6735L334.626 49.1684Z','M287.131 31.6381V1.06396','M304.66 49.1675H335.089','M287.131 66.6968V97.2726','M269.601 49.1675H239.027',
    'M399.815 49.1681L382.895 66.0889L365.974 49.1681L382.895 32.2472L399.815 49.1681Z','M415.144 49.167L382.895 81.4163L350.645 49.167L382.895 16.9176L415.144 49.167Z','M430.389 49.1684L382.895 96.6634L335.4 49.1684L382.895 1.6735L430.389 49.1684Z','M382.895 31.6381V1.06396','M400.424 49.1675H430.853','M382.895 66.6968V97.2726','M365.365 49.1675H334.791',
    'M160.409 96.482L143.488 113.403L126.567 96.482L143.488 79.5612L160.409 96.482Z','M175.738 96.4809L143.488 128.73L111.239 96.4809L143.488 64.2316L175.738 96.4809Z','M190.983 96.4824L143.488 143.977L95.9934 96.4824L143.488 48.9875L190.983 96.4824Z','M143.488 78.9521V48.3779','M161.018 96.4814H191.447','M143.488 114.011V144.587','M125.959 96.4814H95.3848',
    'M256.171 96.482L239.25 113.403L222.329 96.482L239.25 79.5612L256.171 96.482Z','M271.499 96.4809L239.25 128.73L207.001 96.4809L239.25 64.2316L271.499 96.4809Z','M286.745 96.4824L239.25 143.977L191.755 96.4824L239.25 48.9875L286.745 96.4824Z','M239.25 78.9521V48.3779','M256.779 96.4814H287.209','M239.25 114.011V144.587','M221.721 96.4814H191.146',
    'M351.933 96.482L335.012 113.403L318.091 96.482L335.012 79.5612L351.933 96.482Z','M367.261 96.4809L335.012 128.73L302.762 96.4809L335.012 64.2316L367.261 96.4809Z','M382.507 96.4824L335.012 143.977L287.517 96.4824L335.012 48.9875L382.507 96.4824Z','M335.012 78.9521V48.3779','M352.541 96.4814H382.97','M335.012 114.011V144.587','M317.482 96.4814H286.908',
  ]
  return (
    <svg viewBox="0 0 419 120" fill="none" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
      <g stroke="#FAF8F4" strokeWidth="0.862069" strokeMiterlimit="10" opacity="1">
        {D.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  )
}

/**
 * Host city card — a SELECTABLE card in the merged City Selection sidebar. Clicking
 * it (or its "Select" pill) makes the host city the active city. Selecting highlights
 * the card (gold border + cream fill + lift) as a one-shot micro-interaction; the pill
 * flips to a filled "Selected" state. Phase badge lives beside the heading now, not here.
 */
/** Small muted dot-in-ring, used by the "Already in this city" status pill. */
function PinDot() {
  return (
    <span className="flex size-[13px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#b3aa97]">
      <span className="size-[5px] rounded-full bg-[#b3aa97]" />
    </span>
  )
}

export function HostCityCard({
  city, selected, preferred, onSelect, onReserveAll, allGroupsAssigned, onSwapAll, anySwappable, topLabel,
  swapAllLabel = 'Swap all', isRequest = false, isCurrentCity = false,
}: {
  city: LiveCity
  selected: boolean
  preferred?: boolean
  onSelect: () => void
  /** When set (and `selected`), an inline "Reserve all"/"Remove all" pill renders at the bottom-left
   *  of the card — so reserving everyone into the Host city is one tap right where it was just picked,
   *  instead of a separate button elsewhere on the page. Omit to render the card without it (e.g. the
   *  read-only Host-mode summary in `HostCityMove.tsx`). */
  onReserveAll?: () => void
  allGroupsAssigned?: boolean
  /** Same slot as `onReserveAll` — when the user holds reservation(s) elsewhere and this city is
   *  active, a teal "Swap all" pill renders instead (the two never apply at once). */
  onSwapAll?: () => void
  anySwappable?: boolean
  /** e.g. "Top preferred city" — rendered as the card's own first row (icon + text), inside the
   *  border, instead of a separate label sitting above the card as an external sibling. */
  topLabel?: string
  /** Verb for the bulk swap pill. Defaults to "Swap all" (City Selection); Modify Reservation
   *  passes "Switch all" to match its per-row "Switch to {city}" wording. */
  swapAllLabel?: string
  /** Closed-window / missed-deadline / already-issued-Raza flow — the whole card is staging a
   *  *request* rather than an immediate pick, so "Select"/"Selected" reads "Request"/"Requested" and
   *  the reserve-all pill reads "Request all" (never applies to "Remove all" — un-staging a pick before
   *  submission is still a plain remove). Mirrors the per-row `isRequest` treatment on the allocation
   *  tables. Defaults false — every other caller is unaffected. */
  isRequest?: boolean
  /** This card IS the city the party is already allocated to. "Change city & zone" exists to move
   *  somewhere else (there's a separate "Switch to a different zone" option for staying put), so
   *  offering Select / Select all here is a no-op that reads as a staged change — especially since
   *  the host card is pre-selected on entry. Renders a static "Already in this city" status instead
   *  and makes the whole card non-interactive. Defaults false, so every other caller is unaffected. */
  isCurrentCity?: boolean
}) {
     const { t, tx, td } = useT()
  // Host card always reads "Filling fast" (never the literal seat count) — the specific number
  // otherwise looks mismatched once Arrange My Cities puts a relay city (with its own seat pool)
  // in this slot.
  const fast = true
  // The bar mirrors that same "don't show the literal count" rule: a fixed ~70% reads as "seats are
  // going, but some remain" without implying the real number is (or isn't) actually near-full.
  const pct = fast ? 70 : Math.min(100, Math.round(((city.totalSeats - city.seatsLeft) / city.totalSeats) * 100))
  const accent = fast ? '#c0392b' : '#1f5a44'
  return (
    <div
      role={isCurrentCity ? undefined : 'button'}
      tabIndex={isCurrentCity ? undefined : 0}
      onClick={isCurrentCity ? undefined : onSelect}
      onKeyDown={isCurrentCity ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      aria-pressed={isCurrentCity ? undefined : selected}
      className={`group/host relative w-full shrink-0 overflow-hidden rounded-[14px] px-[14px] py-[12px] sm:px-[18px] sm:py-[16px] text-start transition-transform duration-200 ease-out ${isCurrentCity ? 'cursor-default' : 'cursor-pointer hover:-translate-y-[1px]'}`}
      style={{
        border: isCurrentCity ? '2px solid #e3decf' : selected ? '2px solid #c2a04e' : '2px solid #e7dfc9',
        background: isCurrentCity ? '#faf7ef' : selected ? '#fffdf5' : 'white',
        boxShadow: selected ? '0 10px 26px -12px rgba(168,132,62,0.55)' : '0 4px 18px -12px rgba(21,64,47,0.10)',
      }}
    >
      <HostCardPattern />
      <div className="relative z-[1]">
      {topLabel && (
        <div className="mb-[8px] flex items-center gap-[8px] sm:mb-[12px]">
          <PreferredStarIcon />
          <p className="text-[15px] leading-[19px] sm:text-[17px] sm:leading-[21px] text-[#15402f]" style={{ fontFamily: SERIF }}>{topLabel}</p>
        </div>
      )}
      {/* Single row on both breakpoints: icon+title (truncates rather than wrapping) on the left, the
          action group on the right — mobile gets a compact pill+radio (radio replaces the desktop
          "Select"/"Selected" pill), desktop keeps its fuller action + Select pill group. Sitting on the
          same row as the icon uses that row's extra vertical room instead of a separate label row. */}
      <div className="flex flex-wrap items-center gap-[10px] sm:gap-[12px]">
        <div className="flex min-w-0 flex-1 items-center gap-[10px] sm:gap-[12px]">
        <span
          className="flex size-[38px] shrink-0 items-center justify-center rounded-[12px] border transition-colors duration-200 sm:size-[46px]"
          style={{ borderColor: selected ? '#e0cc93' : '#d7e0da', background: selected ? '#f7efd6' : '#eef1f0' }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-[20px] sm:size-[24px]">
            <path d="M12 3v2.2" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8.6 9.4a3.4 3.4 0 016.8 0" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M5 21V10.5M19 21V10.5" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 21v-5a4 4 0 018 0v5" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M3.5 21h17" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-[7px]">
            {/* The label follows the OCCUPYING city's real type, not the slot's position — an
                Arrange My Cities layout can put a relay city in the host slot, and it should read
                as a relay city, not "Host city" (matches the same rule in ArrangeCities.tsx). */}
            {/* `truncate` — this card can sit in a 220px sidebar column while still on the `sm:`
                (desktop) branch, because Tailwind's `sm:` is a VIEWPORT query and the column is
                not the viewport. Unbounded, this kicker overflowed its own `min-w-0` box and was
                painted over by the action group beside it. Truncating matches the city name
                directly below, which has always truncated for the same reason. */}
            <p className="truncate text-[13px] leading-[17px] sm:text-[14px] sm:leading-[18px] font-bold text-[#5a6660]" style={{ fontFamily: FONT }}>
              {city.type === 'host' ? 'Host city' : 'Relay city'}
            </p>
            {preferred && (
              <span className="inline-flex items-center gap-[3px] rounded-full bg-[#f7efd6] px-[8px] py-[2px] text-[10px] font-bold uppercase tracking-[0.3px] text-[#a8843e]" style={{ fontFamily: FONT }}>
                <svg viewBox="0 0 12 12" fill="none" className="size-[10px] shrink-0"><path d="M6 1l1.5 3 3.3.4-2.4 2.3.6 3.3L6 8.7 3 10.3l.6-3.3L1.2 4.4l3.3-.4L6 1z" fill="#c2a04e" /></svg>
                <span {...tx('Preferred')} />
              </span>
            )}
          </div>
          <p className="truncate text-[18px] leading-[23px] sm:text-[20px] sm:leading-[26px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(city.name)} />
        </div>
        </div>
        {/* Mobile-only: compact reserve/swap-all pill + radio, vertically centered with the icon row
            (radio replaces the desktop "Select"/"Selected" pill). */}
        <div className="flex shrink-0 items-center gap-[8px] sm:hidden">
          {isCurrentCity && (
            <span className="inline-flex items-center gap-[4px] rounded-full border border-[#d9d2c2] bg-white px-[9px] py-[3px] text-[11px] font-bold text-[#6a726c]" style={{ fontFamily: FONT }}>
              <PinDot />
              
              {t('Current')}
            </span>
          )}
          {!isCurrentCity && selected && onReserveAll && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReserveAll() }}
              className={`relative z-[1] flex h-[28px] shrink-0 items-center justify-center rounded-full px-[12px] text-[12px] font-bold transition-colors ${
                allGroupsAssigned
                  ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
                  : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
              }`}
              style={{ fontFamily: FONT }}
            >
              {allGroupsAssigned ? t('Remove all') : isRequest ? t('Request all') : t('Select all')}
            </button>
          )}
          {!isCurrentCity && selected && anySwappable && onSwapAll && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSwapAll() }}
              className="relative z-[1] inline-flex h-[28px] shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full bg-[#2e6a7d] px-[12px] text-[12px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
              style={{ fontFamily: FONT }}
            >
              <svg viewBox="0 0 18 18" fill="none" className="size-[12px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {swapAllLabel}
            </button>
          )}
          {!isCurrentCity && <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect() }}
            aria-label={selected ? (isRequest ? t('Requested') : t('Selected')) : (isRequest ? 'Request' : 'Select')}
            aria-pressed={selected}
            className="flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors duration-200"
            style={{ border: selected ? 'none' : '1.5px solid #c2a04e', background: selected ? '#1f5a44' : 'white' }}
          >
            {selected && (
              <svg viewBox="0 0 16 16" fill="none" className="size-[11px]">
                <path d="M3 8.5l3 3 7-7.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>}
        </div>
        {/* Desktop-only: Reserve/Remove all (or Swap all) + Select pill, right-aligned. Reserve all and
            Swap all never apply at the same time.

            Three changes together, and each one is load-bearing: the ROW above wraps, this group
            may shrink (`min-w-0`, not `shrink-0`), and the Select pill's label truncates. In LSD
            the pill labels are wider than their English counterparts, and this card can sit in a
            220px sidebar column while still on the `sm:` branch, so the group ran out of the
            card — which is `overflow-hidden` — and the labels were sheared off. Shrinking the
            group ALONE was tried and is worse: with every child `shrink-0` a narrower box does
            not wrap them, it spills the `justify-end` content out of the box's start edge onto
            the "Host city" label. It only works once that label truncates too. */}
        <div className="hidden min-w-0 flex-wrap items-center justify-end gap-[8px] sm:ms-auto sm:flex">
          {isCurrentCity && (
            <span className="flex h-[34px] shrink-0 items-center gap-[7px] rounded-full border-[1.5px] border-[#d9d2c2] bg-white px-[14px]" style={{ fontFamily: FONT }}>
              <PinDot />
              <span className="text-[13px] font-bold text-[#6a726c]" {...tx('Already in this city')} />
            </span>
          )}
          {!isCurrentCity && selected && onReserveAll && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReserveAll() }}
              className={`relative z-[1] flex h-[34px] shrink-0 items-center justify-center rounded-full px-[16px] text-[13px] font-bold transition-colors ${
                allGroupsAssigned
                  ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
                  : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
              }`}
              style={{ fontFamily: FONT }}
            >
              {allGroupsAssigned ? t('Remove all') : isRequest ? t('Request all') : t('Select all')}
            </button>
          )}
          {!isCurrentCity && selected && anySwappable && onSwapAll && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSwapAll() }}
              className="relative z-[1] inline-flex h-[34px] shrink-0 items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[16px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
              style={{ fontFamily: FONT }}
            >
              <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {swapAllLabel}
            </button>
          )}
          {/* Select pill — reflects the selected state (micro-interaction). Solid green (`#1f5a44`)
              once selected — matches the "PHASE 1 · LIVE" badge's green right above this card, so the
              two status indicators read as one consistent color instead of clashing (teal was tried
              first and swapped out per follow-up feedback). */}
          {/* `min-w-0` + a truncating label: in a 220px sidebar card the LSD state word is wider
              than the whole card, and the pill is inside a `shrink-0` group, so it sheared off
              against the card's `overflow-hidden`. The check glyph beside it carries the state
              on its own, so an ellipsis here loses nothing the user needs. */}
          <span
            className={`${isCurrentCity ? 'hidden' : 'flex'} h-[34px] min-w-0 shrink-0 items-center gap-[7px] rounded-full px-[14px] transition-all duration-200`}
            style={{
              border: selected ? '1.5px solid #1f5a44' : '1.5px solid #c2a04e',
              background: selected ? '#1f5a44' : 'transparent',
            }}
          >
            {selected ? (
              <svg viewBox="0 0 16 16" fill="none" className="size-[15px]">
                <path d="M3 8.5l3 3 7-7.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span className="size-[13px] rounded-full border-[1.5px] border-[#c2a04e]" />
            )}
            <span className="truncate text-[13px] font-bold" style={{ fontFamily: FONT, color: selected ? 'white' : '#a8843e' }}>
              {selected ? (isRequest ? t('Requested') : t('Selected')) : (isRequest ? t('Request') : t('Select'))}
            </span>
          </span>
        </div>
      </div>
      <p className="mt-[8px] text-[13px] sm:mt-[12px] sm:text-[14px] font-bold" style={{ fontFamily: FONT, color: accent }}>
        {fast ? t('Filling fast') : `${city.seatsLeft} seats left`}
      </p>
      <div className="mt-[6px] h-[7px] sm:mt-[8px] sm:h-[9px] w-full overflow-hidden rounded-full" style={{ background: fast ? '#f7dad7' : '#e4efe7' }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: accent }} />
      </div>
      </div>
    </div>
  )
}

/** "PHASE 1 · LIVE" badge + info tooltip. Tapping the (i) toggles the tooltip on mobile (where there
 *  is no hover); desktop also opens it on hover. `compact` is the smaller mobile size. */
function PhaseTag({ compact = false }: { compact?: boolean }) {
  const { tx, t } = useT()
  const [showTip, setShowTip] = useState(false)
  return (
    <span className="group/ph relative flex shrink-0 items-center gap-[6px]">
      <span className={`inline-flex items-center gap-[5px] rounded-full bg-[#1f5a44] ${compact ? 'h-[22px] px-[9px]' : 'h-[26px] px-[11px]'}`}>
        <span className={`rounded-full ${compact ? 'size-[5px]' : 'size-[6px]'}`} style={{ background: '#86e6ad' }} />
        <span className={`whitespace-nowrap font-bold uppercase text-white ${compact ? 'text-[10px] tracking-[0.4px]' : 'text-[11px] tracking-[0.6px]'}`} style={{ fontFamily: FONT }} {...tx('Phase 1 · Live')} />
      </span>
      <button type="button" onClick={(e) => { e.stopPropagation(); setShowTip((v) => !v) }} aria-label={t('Phase 1 info')} className="inline-flex text-[#8a938e]">
        <svg viewBox="0 0 20 20" fill="none" className={compact ? 'size-[16px]' : 'size-[18px]'}><circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.4" /><path d="M10 9.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10" cy="6.7" r="1" fill="currentColor" /></svg>
      </button>
      <span className={`pointer-events-none absolute ${compact ? 'start-0' : 'end-0'} top-[calc(100%+10px)] z-[60] w-[272px] sm:w-[300px] overflow-hidden rounded-[16px] border border-[#d3e3d9] bg-[#e8f1ea] text-start shadow-[0_16px_44px_-12px_rgba(21,64,47,0.3)] transition-opacity duration-200 group-hover/ph:opacity-100 ${showTip ? 'opacity-100' : 'opacity-0'}`} style={{ fontFamily: FONT }}>
        <span className="block px-[18px] pt-[16px] pb-[14px]">
          <span className="inline-flex items-center rounded-full bg-[#1c3f2e] px-[12px] py-[5px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.7px] text-white" {...tx('Phase 1 · Live')} />
          </span>
          <span className="mt-[12px] block text-[18px] font-bold leading-[24px] text-[#15402f]" {...tx('Reserve your slot')} />
          <span className="mt-[6px] block text-[14px] leading-[20px] text-[#5a6660]" {...tx('It\'s your Jamaat\'s. Book your group before 2:00 PM today.')} />
        </span>
        <span className="block h-px bg-[#d3e3d9]" />
        <span className="block px-[18px] py-[13px] text-[14px] leading-[20px] text-[#5a6660]">After this, booking opens to everyone in <strong className="font-bold text-[#2e3a34]" {...tx('Phase2')} />.</span>
      </span>
    </span>
  )
}

/** "Choose a city" heading row: serif title + PHASE 1 · LIVE badge + info tooltip. In the
 *  missed-deadline / closed-window flow (`isRequest`) the LIVE badge is dropped (the slot is closed,
 *  not live) — the `SlotClosedCard` below explains the state instead. */
function ChooseCityHeading({ isRequest = false, showPhase = true }: { isRequest?: boolean; showPhase?: boolean }) {
  const { tx } = useT()
  return (
    <div className="flex items-center gap-[12px]">
      <h2 className="text-[28px] leading-[34px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Choose a city')} />
      {showPhase && !isRequest && <span className="ms-auto"><PhaseTag /></span>}
    </div>
  )
}

/** "You missed your turn" card — shown in place of the PHASE 1 · LIVE badge when the booking window
 *  has closed (reached here via Ask Help to file a request). Maroon "SLOT CLOSED" badge, then the
 *  round-2 explainer + Phase 2 start time. */
function SlotClosedCard() {
  const { tx, t, tdText } = useT()
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#eccfca] bg-[#fbeeec]">
      <div className="px-[18px] pt-[16px] pb-[14px]">
        <span className="inline-flex items-center rounded-full bg-[#a2382c] px-[12px] py-[5px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.7px] text-white" style={{ fontFamily: FONT }} {...tx('Phase 1 · Slot Closed')} />
        </span>
        <p className="mt-[12px] text-[18px] font-bold leading-[24px] text-[#15402f]" style={{ fontFamily: FONT }} {...tx('You missed your turn')} />
        <p className="mt-[6px] text-[14px] leading-[20px] text-[#8a7975]" style={{ fontFamily: FONT }} {...tx('Your Jamaat\'s booking time is over. You can book again in Round 2, open for everyone.')} />
      </div>
      <div className="h-px bg-[#eccfca]" />
      <p className="px-[18px] py-[13px] text-[14px] leading-[20px] text-[#5a4f4c]" style={{ fontFamily: FONT }}>
        <strong className="font-bold text-[#3a2f2d]" {...tx('Phase 2')} />{' '}
        <span {...tx('starts')} />{' '}
        {/* Two isolates, not one. `t('Fri')` is Arabic in LSD, so a single <Iso> around the whole
            fragment held both scripts — which isolates the pair from the sentence but leaves the
            ASCII "20" unbounded against the Arabic weekday right beside it. */}
        <Iso>{t('Fri')}</Iso>{', '}<Iso>20</Iso>{' · '}<TimeLine value="6:00 PM" />.
      </p>
    </div>
  )
}

function HostGroupCard({
  group, gi, checkedIds, holdSec, onReserve, onCancel, onToggleMember,
}: {
  group: Group
  gi: number
  checkedIds: Set<string>
  holdSec: number | undefined
  onReserve: () => void
  onCancel: () => void
  onToggleMember: (memberId: string) => void
}) {
     const { tx, t, td } = useT()
  const linked = !!group.label
  const held = holdSec !== undefined
  return (
    <div className="overflow-hidden rounded-[14px] border bg-white" style={{ borderColor: held ? '#1f5a44' : '#e7dfc9' }}>
      {linked && (
        <div className="flex h-[32px] items-center gap-[8px] bg-[#e1eef1] px-[13px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>{group.label ? t(bandLabel(group.label)) : null}</span>
        </div>
      )}
      <div className="relative">
        {group.members.map((mm, mi) => (
          <div key={mm.member.id} onClick={() => onToggleMember(mm.member.id)}
            className="relative flex cursor-pointer items-center gap-[10px] px-[13px] py-[10px]">
            {linked && group.members.length > 1 && (
              <span className="pointer-events-none absolute start-[58px] w-[2px] bg-[#fac775]" style={{ top: mi === 0 ? '50%' : 0, bottom: mi === group.members.length - 1 ? '50%' : 0 }} />
            )}
            <Checkbox checked={checkedIds.has(memKey(gi, mm.member.id))} onClick={() => onToggleMember(mm.member.id)} />
            <div className="relative flex min-w-0 flex-1 items-center gap-[10px]">
              <Avatar name={mm.member.name} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#23302a] leading-[18px]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                <p className="text-[12px] text-[#5a6660] mt-[2px]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
              </div>
            </div>
            <RoleBadge kind={mm.badge} />
          </div>
        ))}
      </div>
      {held ? (
        <div className="border-t border-[#f0ebe0] px-[13px] py-[12px]">
          <div className="rounded-[10px] px-[12px] py-[10px]" style={{ background: '#fdf0db' }}>
            <div className="flex items-center justify-between gap-[10px]">
              <span className="flex min-w-0 items-center gap-[7px] text-[12.5px] font-bold leading-[16px]" style={{ fontFamily: FONT, color: '#9a6712' }}>
                <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                  <circle cx="9" cy="10" r="6" stroke="#c98a2e" strokeWidth="1.5" />
                  <path d="M9 6.8V10l2.2 1.4M6.6 3.4h4.8" stroke="#c98a2e" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="truncate" {...tx('Confirm before time expires')} />
              </span>
              <span className="flex shrink-0 items-center gap-[8px]">
                <span className="text-[13px] font-extrabold leading-[16px]" style={{ fontFamily: FONT, color: '#9a6712' }}>{fmtClock(holdSec!)}</span>
                <button type="button" onClick={onCancel} aria-label={t('Cancel reservation')}
                  className="flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#f7d9d4] active:scale-90">
                  <svg viewBox="0 0 20 20" fill="none" className="size-[15px]">
                    <path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            </div>
            <div className="mt-[9px] h-[6px] w-full overflow-hidden rounded-full" style={{ background: '#f4ddae' }}>
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                style={{ width: `${((HOLD_SEC - holdSec!) / HOLD_SEC) * 100}%`, background: '#e8941e' }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t border-[#f0ebe0] px-[13px] py-[10px]">
          <span className="flex items-center gap-[5px] text-[12px]" style={{ fontFamily: FONT }}>
            <span className="text-[#5a6660]" {...tx('Status :')} />
            <span className="font-bold text-[#1f5a44]" {...tx('Valid for allocation')} />
          </span>
          <button
            type="button"
            onClick={onReserve}
            className="h-[34px] rounded-full px-[20px] text-[13px] font-bold transition-colors"
            style={{ fontFamily: FONT, border: '1.5px solid #1f5a44', background: 'white', color: '#1f5a44' }} {...tx('Reserve')} />
        </div>
      )}
    </div>
  )
}

// ── Relay-city dropdown atoms ──────────────────────────────────────────────────

function InfoIcon({ color = '#b23b3b' }: { color?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0">
      <circle cx="10" cy="10" r="7.25" stroke={color} strokeWidth="1.4" />
      <path d="M10 9.2v3.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.7" r="1" fill={color} />
    </svg>
  )
}

/** The pill button in the "Relay city" column that opens the relay-city dropdown. */
function RelayCityTrigger({ label, active, onClick }: { label: string; active: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      className="inline-flex h-[40px] min-w-[150px] max-w-[210px] items-center justify-between gap-[8px] rounded-full border border-[#1f5a44] bg-white px-[16px] transition-colors"
      style={{ fontFamily: FONT }}
    >
      <span className="truncate text-[14px] font-bold text-[#1f5a44]">{isolateRuns(label)}</span>
      <svg viewBox="0 0 16 16" fill="none" className={`size-[14px] shrink-0 transition-transform ${active ? 'rotate-180' : ''}`}>
        <path d="M4 6l4 4 4-4" stroke="#1f5a44" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/** Searchable relay-city dropdown popover — fixed-positioned, anchored to its trigger so it escapes table overflow. */
function RelayCityDropdown({ anchor, cities, selectedCityId, availabilityOf, search, onSearch, onSelect, onClose }: {
  anchor: HTMLElement
  cities: LiveCity[]
  selectedCityId: string | null
  availabilityOf: (c: LiveCity) => boolean
  search: string
  onSearch: (v: string) => void
  onSelect: (c: LiveCity) => void
  onClose: () => void
}) {
     const { tx, t, td } = useT()
  const filtered = search ? cities.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())) : cities
  return (
    <Popover anchor={anchor} width={280} onClose={onClose}>
        <div className="p-[10px]">
          <div className="flex h-[40px] items-center gap-[8px] rounded-full border border-[#e7dfc9] bg-[#faf8f2] px-[12px]">
            <input
              autoFocus
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t('Search city names...')}
              className="flex-1 bg-transparent text-[14px] outline-none text-[#23302a] placeholder-[#b0b8b3]"
              style={{ fontFamily: FONT }}
            />
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0 text-[#8a938e]">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="max-h-[230px] overflow-y-auto px-[8px] pb-[10px]">
          {filtered.map((c) => {
            const avail = availabilityOf(c)
            const selected = c.id === selectedCityId
            return (
              <button
                key={c.id}
                type="button"
                disabled={!avail}
                onClick={avail ? () => onSelect(c) : undefined}
                className="flex w-full items-center justify-between rounded-[10px] px-[12px] py-[11px] text-start transition-colors"
                style={{ background: selected ? '#eaf3ed' : 'transparent', cursor: avail ? 'pointer' : 'not-allowed' }}
              >
                <span className="truncate text-[15px] font-bold" style={{ fontFamily: FONT, color: avail ? '#23302a' : '#b0b8b3' }} {...td(c.name)} />
                {avail
                  ? (selected && (
                      <svg viewBox="0 0 16 16" fill="none" className="size-[16px] shrink-0">
                        <path d="M3 8.5l3 3 7-7.5" stroke="#1f7a4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ))
                  : <span className="text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>N/A</span>}
              </button>
            )
          })}
          {filtered.length === 0 && <p className="px-[12px] py-[10px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No cities found.')} />}
        </div>
    </Popover>
  )
}

// ── AllocateDesktopTable ───────────────────────────────────────────────────────
// "reserve together" pattern: full-width blue group band + gold connector (NOT └
// nesting); per-row Status + a per-group "Relay city" dropdown column.

function AllocateDesktopTable({
  groups, groupCityMap, availableFor, eligibleFor, closedFor, opensAtFor, locationFor, activeCity, onReserveGroup, onRemoveGroup, onBlockedCity, isAutoGroup, isLockedGroup, isRequest,
  showZoneColumn, zoneFor, openZoneGi, onOpenZoneDropdown, onOpenZoneAllDropdown, canSetAllZones, swapTargetFor, onSwapGroup, hideReserveCta, currentAllocFor,
}: {
  groups: Group[]
  groupCityMap: Map<number, LiveCity>
  availableFor: (gi: number) => boolean
  /** Group's global eligibility → drives the Status column (an admin-closed city does NOT flip this). */
  eligibleFor: (gi: number) => boolean
  /** The active city is closed by the admin for a member of this group (status stays valid). */
  closedFor: (gi: number) => boolean
  /** An invited member whose reservation window hasn't opened yet (display string). */
  opensAtFor: (gi: number) => string | undefined
  /** Home city of an invited member who lives elsewhere. */
  locationFor: (gi: number) => string | undefined
  /** The currently selected target city (null until one is picked). */
  activeCity: LiveCity | null
  /** Per-group in-table Reserve → allocate the whole group to the active city. */
  onReserveGroup: (gi: number) => void
  /** Remove a group's allocation. */
  onRemoveGroup: (gi: number) => void
  /** Clicking a Reserve that's blocked because the active city is closed for this member. */
  onBlockedCity: () => void
  /** This group never needs manual city selection — already auto-allocated to the host city
   *  (a per-event "auto-allocate Others" rule). Not toggleable/removable, reads "Auto-allocated". */
  isAutoGroup?: (gi: number) => boolean
  /** Re-select mode: this group already holds a saved allocation from another member, shown READ-ONLY
   *  (city displayed, no Reserve/Swap/✕). Only the registrant's own group is (re)selectable. */
  isLockedGroup?: (gi: number) => boolean
  /** Missed-deadline / closed-window flow (reached via Ask Help) — the per-row CTA files a REQUEST,
   *  so it reads "Request {city}" with a send icon instead of "Select {city}". */
  isRequest?: boolean
  /** Same-day-flow events only: adds a 6th "Zone" column with a per-row picker, so city + zone are
   *  both chosen on this one screen instead of a separate Zone Selection screen. Never true for any
   *  other event. */
  showZoneColumn?: boolean
  /** Opens the zone dropdown in "apply to every selected group" mode, anchored to the Zone header. */
  onOpenZoneAllDropdown?: (el: HTMLElement) => void
  /** False while no group has a city yet — a zone can't be chosen before the city it belongs to. */
  canSetAllZones?: boolean
  zoneFor?: (gi: number) => Zone | null
  openZoneGi?: number | null
  onOpenZoneDropdown?: (gi: number, el: HTMLElement) => void
  /** The city an already-reserved group can swap TO (the active city), or null when no swap is offered.
   *  Drives the "Current → Swap to" state; the reservation only moves on an explicit swap click. */
  swapTargetFor?: (gi: number) => LiveCity | null
  onSwapGroup?: (gi: number) => void
  /** "Reserve all" already covers every eligible member for the active city → the per-row Reserve
   *  button is redundant, so show a muted dash instead (matches the Allocation column's own empty
   *  dash). Never hides the blocked states (closed / full) or the swap pill. */
  hideReserveCta?: boolean
  /** Modify-city-zone flow: the group's CURRENT (pre-change) city + zone, shown as a caption under
   *  the member so the user sees what they're changing FROM. Omitted in every other flow. */
  currentAllocFor?: (gi: number) => { cityName: string; cityType: 'host' | 'relay'; zoneName: string } | null
}) {
     const { tx, t, td, tdText } = useT()
  // Ordering: every group that can still be reserved is listed first; groups that read "Not Available"
  // (globally not valid for allocation) always sink to the bottom. This keeps the eligibility reason
  // out of the way — the top of the list reads as "these seats are still open", and the unavailable
  // rows look like the capacity simply ran out rather than exposing a per-member policy decision.
  // Stable sort preserves the original order within each tier (indices below stay the real `gi`).
  // In the request (closed-window) flow, the already-allocated members aren't part of the request —
  // only the un-allocated registrant is — so their read-only rows are dropped entirely here.
  const displayOrder = groups.map((_, i) => i)
    .filter((i) => !(isRequest && isLockedGroup?.(i)))
    .sort((a, b) => (eligibleFor(a) ? 0 : 1) - (eligibleFor(b) ? 0 : 1))
  return (
    // Same-day-flow only: Allocation + Action merge into one "City" column (see the merged-vs-split
    // branch below), so this stays a 5-column table exactly like the non-zone case — just with Zone
    // instead of a separate Action column. That merge is what keeps Zone visible without needing the
    // horizontal scroll a 6th column would have forced.
    <div className="overflow-x-auto rounded-[14px] border border-[#e7dfc9] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: showZoneColumn
        // With the zone column the member col is explicitly 200px, so the floor is just the
        // sum of the five columns — adding MEMBER_COL_MIN on top would double-count it.
        ? '840px'
        // Without it the member col is the unsized one, so it needs the floor added.
        : memberTableMinWidth(110, 188, 120, 242) }}>
        <colgroup>
          <col style={showZoneColumn ? { width: '200px' } : undefined} />
          <col style={{ width: showZoneColumn ? '90px' : '110px' }} />
          <col style={{ width: showZoneColumn ? '130px' : '188px' }} />
          {/* Allocation narrower / Action wider (net-zero table width) so the swap button + cancel ✕
              both fit inside the Action cell padding instead of the ✕ overhanging the table border. */}
          <col style={{ width: showZoneColumn ? '230px' : '120px' }} />
          <col style={{ width: showZoneColumn ? '190px' : '242px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {/* The array holds English KEYS and `t()` is applied at render, so the test below
                compares a key against a key. Built the other way round — `[t('Zone'), …]` matched
                against `t('Zone')` — it is correct only while both sides go through the same
                call, and silently selects nothing the moment one of them stops. MiqaatDetail had
                three of those and the walkthrough lost an anchor in LSD without any error. */}
            {(showZoneColumn ? ['Member', '', 'Status', 'City', 'Zone'] : ['Member', '', 'Status', 'Allocation', 'Action']).map((h, i) => (
              <th key={i} className="px-[16px] py-[11px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT, whiteSpace: 'nowrap' }}>
                {/* The ZONE column's bulk action — the zone counterpart of the city card's "Select
                    all". Without it, putting a whole party in one zone meant opening the per-row
                    dropdown once per group. */}
                {h === 'Zone' && onOpenZoneAllDropdown ? (
                  <span className="flex items-center justify-between gap-[10px]">
                    <span {...tx(h)} />
                    <button
                      type="button"
                      disabled={!canSetAllZones}
                      onClick={(e) => onOpenZoneAllDropdown(e.currentTarget)}
                      className={`rounded-full border px-[10px] py-[3px] text-[11px] font-bold normal-case tracking-normal transition-colors ${canSetAllZones ? 'border-[#c2a04e] bg-white text-[#9a6a1e] hover:bg-[#fdf5e6]' : 'cursor-not-allowed border-[#e7dfc9] bg-white text-[#c4c9c6]'}`}
                      style={{ fontFamily: FONT }}
                      title={canSetAllZones ? 'Pick one zone and apply it to every selected member' : 'Select a city for your members first'} {...tx('Same zone for all')} />
                  </span>
                ) : h && t(h)}
              </th>
            ))}
          </tr>
        </thead>
        {displayOrder.map((gi) => {
          const { t } = useT()
          const g = groups[gi]
          const linked = !!g.label
          const assignedCity = groupCityMap.get(gi) ?? null
          const isAssigned = assignedCity !== null
          const available = availableFor(gi)
          const eligible = eligibleFor(gi)
          const opensAt = opensAtFor(gi)
          const location = locationFor(gi)
          const closed = closedFor(gi)
          const foreignName = g.members.find((mm) => mm.member.opensAt)?.member.name ?? ''
          // In the request flow an assigned group is a PENDING request, not a confirmed reservation —
          // its pill reads "Requested" (amber) instead of "Selected" (green).
          const requested = isRequest && isAssigned && !isAutoGroup?.(gi) && !isLockedGroup?.(gi)
          // Dim a row only when a city is selected that this (unassigned) group can't use.
          const dim = activeCity !== null && !available && !isAssigned && eligible
          const hasConnector = g.members.length > 1
          // Swap-pending: this reserved group can move to the newly-selected city (standard flow only —
          // the same-day-flow layout merges columns and owns the zone picker, left unchanged).
          const swapTarget = !showZoneColumn ? (swapTargetFor?.(gi) ?? null) : null
          // Status reflects the SELECTED city: a group that can't take the active city reads "Not valid
          // for allocation" — not just the global eligibility flag. This holds even for a group already
          // reserved elsewhere: if the active city is admin-closed for a member (e.g. Sakina → Indore),
          // that member is not valid for THAT city, so `!closed` is checked regardless of `isAssigned`.
          const validForActive = eligible && !closed && !(activeCity !== null && !isAssigned && !opensAt && !available)
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #f0ebe0', background: '#e1eef1' }}>
                  <td colSpan={5} className="px-[16px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
                      <LinkGlyph />{g.label ? t(bandLabel(g.label)) : null}
                    </span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const { t } = useT()
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                return (
                  <tr key={mm.member.id}
                    className="bg-white" style={{ borderTop: linked ? undefined : '1px solid #f0ebe0' }}>
                    <td className="relative px-[16px] py-[10px] align-middle">
                      {/* Gold connector — drawn only in the gaps ABOVE/BELOW each avatar (18px = avatar
                          radius), so it stops at the circle's edge and never crosses the avatars. */}
                      {hasConnector && !isFirst && (
                        <span className="pointer-events-none absolute start-[33px] z-0 w-[2px] bg-[#fac775]" style={{ top: 0, height: 'calc(50% - 18px)' }} />
                      )}
                      {hasConnector && !isLast && (
                        <span className="pointer-events-none absolute start-[33px] z-0 w-[2px] bg-[#fac775]" style={{ top: 'calc(50% + 18px)', bottom: 0 }} />
                      )}
                      <div className="relative z-[1] flex items-center gap-[10px]" style={{ opacity: dim ? 0.55 : 1 }}>
                        <Avatar name={mm.member.name} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                          <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
                          {isFirst && currentAllocFor && (() => {
                            const cur = currentAllocFor(gi)
                            return cur ? (
                              /* Wraps rather than truncates — same reasoning as the mobile card's
                                 copy of this pill above. */
                              <span className="mt-[6px] inline-flex max-w-full items-start gap-x-[6px] rounded-[11px] border border-[#e3decf] bg-[#faf7ef] px-[9px] py-[3px]" style={{ fontFamily: FONT }}>
                                <span className="shrink-0 pt-[1px] text-[10px] font-bold uppercase leading-[15px] tracking-[0.4px] text-[#a08a54]" {...tx('Now')} />
                                <span className="min-w-0 text-[11.5px] font-bold leading-[15px] text-[#6a726c]">{cur.cityName}{cur.zoneName ? ` · ${cur.zoneName}` : ''}</span>
                              </span>
                            ) : null
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="px-[16px] py-[10px] align-middle" style={{ opacity: dim ? 0.6 : 1 }}>
                      {mm.badge ? <RoleBadge kind={mm.badge} /> : null}
                    </td>
                    <td className="px-[16px] py-[10px] align-middle">
                      {validForActive ? (
                        <span className="inline-flex items-center gap-[7px] text-[13px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT }}>
                          <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
                            <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
                            <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          
                          {t('Valid for allocation')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-[6px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>
                          <InfoIcon />
                          
                          {t('Not valid for allocation')}
                        </span>
                      )}
                    </td>
                    {isFirst && opensAt && (
                      /* Invited/added member from another location → full "opens later" message,
                         spanning the last 2 columns (City+Zone when merged, else Allocation+Action). */
                      <td colSpan={2} rowSpan={g.members.length} className="px-[16px] py-[10px] align-middle">
                        <OpensLaterNotice location={location ?? 'Their city'} opensAt={opensAt} name={foreignName} />
                      </td>
                    )}
                    {isFirst && !opensAt && showZoneColumn && (
                      <>
                        {/* City — same-day-flow only: Allocation + Action merged into one column (matches
                            the mobile card's existing combined layout) so the freed-up width keeps Zone
                            visible without needing to scroll. */}
                        <td rowSpan={g.members.length} className="px-[16px] py-[10px] align-middle">
                          {isAssigned ? (
                            <div className="flex items-center justify-between gap-[10px]">
                              <div className="flex flex-col gap-[2px]">
                                <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" style={{ fontFamily: FONT }}>{assignedCity!.type === 'host' ? t('Host City') : t('Relay City')}</span>
                                <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(assignedCity!.name)} />
                              </div>
                              <div className="flex shrink-0 items-center gap-[6px]">
                                <span className={`inline-flex h-[30px] w-fit items-center gap-[5px] rounded-full border px-[12px] text-[12px] font-bold ${requested ? 'border-[#f0d9a8] bg-[#fdf1dc] text-[#a9740f]' : 'border-[#bfe3cd] bg-[#eef7f1] text-[#1f7a4d]'}`} style={{ fontFamily: FONT }}>
                                  {requested ? (
                                    <svg viewBox="0 0 18 18" fill="none" className="size-[13px] shrink-0">
                                      <circle cx="9" cy="9" r="7.1" stroke="#a9740f" strokeWidth="1.4" />
                                      <path d="M9 5.4V9l2.4 1.5" stroke="#a9740f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 18 18" fill="none" className="size-[13px] shrink-0">
                                      <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
                                      <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                  {isAutoGroup?.(gi) ? t('Auto-allocated') : requested ? t('Requested') : t('Selected')}
                                </span>
                                {!isAutoGroup?.(gi) && !isLockedGroup?.(gi) && (
                                  <button type="button" onClick={() => onRemoveGroup(gi)} aria-label={t('Remove reservation')}
                                    className="flex size-[24px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
                                    <svg viewBox="0 0 20 20" fill="none" className="size-[14px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : !eligible ? (
                            <span className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[16px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                          ) : activeCity && closed ? (
                            <div className="flex flex-col gap-[4px]">
                              <span className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[16px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                              <span className="text-[11.5px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Please choose a different city.')} />
                            </div>
                          ) : activeCity && !available ? (
                            <div className="flex flex-col gap-[4px]">
                              <span className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[16px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                              <span className="text-[11.5px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('This city is full — choose another.')} />
                            </div>
                          ) : activeCity && !hideReserveCta ? (
                            <button type="button" onClick={() => onReserveGroup(gi)}
                              className="inline-flex h-[34px] items-center gap-[7px] rounded-full px-[22px] text-[13px] font-bold transition-colors"
                              style={{ fontFamily: FONT, whiteSpace: 'nowrap', border: '1.5px solid #1f5a44', background: '#1f5a44', color: 'white' }}>
                              {isRequest && <svg viewBox="0 0 24 24" fill="none" className="size-[14px] shrink-0"><path d="M4.5 12l15-7.5-7 15-2.2-5.3L4.5 12z" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              <bdi {...tx(isRequest ? 'Request {city}' : 'Select {city}', { city: tdText(activeCity.name) })} />
                            </button>
                          ) : activeCity ? (
                            // "Reserve all" already covers everyone — redundant per-row button, muted dash.
                            <span className="text-[14px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                          ) : (
                            // No city picked yet → guide the user to pick one first, matching the mobile
                            // card's dashed hint (was a faded/disabled "Reserve" button, easy to miss).
                            <span className="inline-flex h-[34px] w-fit items-center rounded-full px-[16px] text-[13px] font-semibold"
                              style={{ fontFamily: FONT, border: '1.5px dashed #d3c8ac', color: '#a08a5e', background: 'transparent' }} {...tx('Select host or relay')} />
                          )}
                        </td>
                        <td rowSpan={g.members.length} className="px-[16px] py-[10px] align-middle">
                          {eligible ? (
                            <ZoneTrigger
                              label={zoneFor?.(gi)?.name ?? null}
                              placeholder={t('Select a zone')}
                              active={openZoneGi === gi}
                              // Only after THIS member's city is reserved — not merely when a city is
                              // selected on the left. Zone follows the reserved city.
                              disabled={!isAssigned}
                              onClick={(rect) => onOpenZoneDropdown?.(gi, rect)}
                            />
                          ) : (
                            <span className="text-[14px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                          )}
                        </td>
                      </>
                    )}
                    {isFirst && !opensAt && !showZoneColumn && (
                      <>
                        {/* Allocation — the group's current assigned city (type + name), else a dash. When a
                            swap is pending this stays as the CURRENT allocation; the "Swap to <city>" action
                            lives in the Action column, so nothing changes here until it's confirmed. */}
                        <td rowSpan={g.members.length} className="px-[16px] py-[10px] align-middle">
                          {isAssigned ? (
                            <div className="flex flex-col gap-[2px]">
                              <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" style={{ fontFamily: FONT }}>{assignedCity!.type === 'host' ? t('Host City') : t('Relay City')}</span>
                              <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(assignedCity!.name)} />
                            </div>
                          ) : (
                            <span className="text-[14px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                          )}
                        </td>
                        {/* Action — Swap-to / Reserved / Reserve / unavailable / opens-later */}
                        <td rowSpan={g.members.length} className="px-[16px] py-[10px] align-middle">
                          {isAssigned && swapTarget ? (
                            // Swap-pending — a dedicated GOLD action, deliberately distinct from the green
                            // "Reserved" pill, so it reads as "you have a choice to make", not "done".
                            // Clicking it moves the single reservation; the ✕ cancels it entirely. Nothing
                            // is reserved twice and nothing swaps until this button is pressed.
                            <div className="flex flex-col gap-[6px]">
                              <div className="flex items-center gap-[8px]">
                                <button type="button" onClick={() => onSwapGroup?.(gi)}
                                  className="inline-flex h-[34px] min-w-0 items-center gap-[7px] rounded-full border border-[#2e6a7d] bg-white px-[16px] text-[13px] font-bold text-[#2e6a7d] transition-colors hover:bg-[#eef5f7] active:scale-[0.97]"
                                  style={{ fontFamily: FONT }}>
                                  <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#2e6a7d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  <span className="truncate" {...tx('Swap to {city}', { city: tdText(swapTarget.name) })} />
                                </button>
                                <button type="button" onClick={() => onRemoveGroup(gi)} aria-label={t('Cancel reservation')}
                                  className="flex size-[26px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
                                  <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
                                </button>
                              </div>
                              <span className="text-[11.5px] font-semibold leading-[15px] text-[#23302a]" style={{ fontFamily: FONT }}>
                                <span className="font-bold text-[#1f7a4d]">You're selected in {assignedCity!.name}</span> — do you want to swap it?
                              </span>
                            </div>
                          ) : isAssigned ? (
                            // Reserved pill + a SEPARATE cancel icon (not embedded in the pill border) —
                            // matches the mobile card footer and HostCityMove's desktop table. Auto-allocated
                            // groups (a per-event "auto-allocate Others" rule) get the same pill relabelled, with no
                            // remove icon — there's nothing for the user to undo.
                            <div className="flex items-center gap-[10px]">
                              <span className={`inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border px-[14px] text-[13px] font-bold ${requested ? 'border-[#f0d9a8] bg-[#fdf1dc] text-[#a9740f]' : 'border-[#bfe3cd] bg-[#eef7f1] text-[#1f7a4d]'}`} style={{ fontFamily: FONT }}>
                                {requested ? (
                                  <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                                    <circle cx="9" cy="9" r="7.1" stroke="#a9740f" strokeWidth="1.4" />
                                    <path d="M9 5.4V9l2.4 1.5" stroke="#a9740f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                                    <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
                                    <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                                {isAutoGroup?.(gi) ? t('Auto-allocated') : requested ? t('Requested') : t('Selected')}
                              </span>
                              {!isAutoGroup?.(gi) && !isLockedGroup?.(gi) && (
                                <button type="button" onClick={() => onRemoveGroup(gi)} aria-label={t('Remove reservation')}
                                  className="flex size-[26px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
                                  <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
                                </button>
                              )}
                            </div>
                          ) : !eligible ? (
                            // Globally not valid → can't choose any city (status already says why; no city hint).
                            <span className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[16px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                          ) : activeCity && closed ? (
                            // Admin closed THIS city for the member (status stays valid) → "Not Available"
                            // pill (matches the other blocked states) + a hint to pick a different city.
                            <div className="flex flex-col gap-[4px]">
                              <span className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[16px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                              <span className="text-[11.5px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Please choose a different city.')} />
                            </div>
                          ) : activeCity && !available ? (
                            // City out of seats for this group.
                            <div className="flex flex-col gap-[4px]">
                              <span className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border border-[#e3c9c4] bg-[#fbf3f2] px-[16px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Not Available')} />
                              <span className="text-[11.5px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('This city is full — choose another.')} />
                            </div>
                          ) : activeCity && !hideReserveCta ? (
                            <button type="button" onClick={() => onReserveGroup(gi)}
                              className="inline-flex h-[34px] items-center gap-[7px] rounded-full px-[22px] text-[13px] font-bold transition-colors"
                              style={{ fontFamily: FONT, whiteSpace: 'nowrap', border: '1.5px solid #1f5a44', background: '#1f5a44', color: 'white' }}>
                              {isRequest && <svg viewBox="0 0 24 24" fill="none" className="size-[14px] shrink-0"><path d="M4.5 12l15-7.5-7 15-2.2-5.3L4.5 12z" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              <bdi {...tx(isRequest ? 'Request {city}' : 'Select {city}', { city: tdText(activeCity.name) })} />
                            </button>
                          ) : activeCity ? (
                            // "Reserve all" already covers everyone — redundant per-row button, muted dash.
                            <span className="text-[14px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                          ) : (
                            // No city picked yet → guide the user to pick one first, matching the mobile
                            // card's dashed hint (was a faded/disabled "Reserve" button, easy to miss).
                            <span className="inline-flex h-[34px] w-fit items-center rounded-full px-[16px] text-[13px] font-semibold"
                              style={{ fontFamily: FONT, border: '1.5px dashed #d3c8ac', color: '#a08a5e', background: 'transparent' }} {...tx('Select host or relay')} />
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

// ── HostDesktopTable (host self-allocate, per-member checkbox + per-group reserve) ─
// Approved "reserve together" pattern: full-width blue group band + gold profile
// connector (NOT └ nesting) + per-row Status + per-group Reserve/Confirm action.

function HostDesktopTable({
  groups, checkedIds, holds, allChecked, onSelectAll, onReserve, onCancelHold, onToggleMember,
}: {
  groups: Group[]
  checkedIds: Set<string>
  holds: Map<number, number>
  allChecked: boolean
  onSelectAll: () => void
  onReserve: (gi: number) => void
  onCancelHold: (gi: number) => void
  onToggleMember: (gi: number, memberId: string) => void
}) {
     const { tx, t, td } = useT()
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[#e7dfc9] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: memberTableMinWidth(40, 124, 172, 132) }}>
        <colgroup>
          <col style={{ width: '40px' }} />
          <col />
          <col style={{ width: '124px' }} />
          <col style={{ width: '172px' }} />
          <col style={{ width: '132px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            <th className="px-[14px] py-[9px] align-middle">
              <span title={allChecked ? 'Deselect all' : 'Select all'}>
                <Checkbox checked={allChecked} onClick={onSelectAll} />
              </span>
            </th>
            {[t('Member'), '', t('Status'), 'Action'].map((h, i) => (
              <th key={i} className="px-[14px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const { t } = useT()
          const linked = !!g.label
          const holdSec = holds.get(gi)
          const held = holdSec !== undefined
          const hasConnector = g.members.length > 1
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #f0ebe0', background: '#e1eef1' }}>
                  <td colSpan={5} className="px-[14px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
                      <LinkGlyph />{g.label ? t(bandLabel(g.label)) : null}
                    </span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                return (
                  <tr key={mm.member.id} onClick={() => onToggleMember(gi, mm.member.id)}
                    className="cursor-pointer bg-white transition-colors duration-150 hover:bg-[#faf9f4]" style={{ borderTop: linked ? undefined : '1px solid #f0ebe0' }}>
                    <td className="px-[14px] py-[9px] align-middle">
                      <Checkbox checked={checkedIds.has(memKey(gi, mm.member.id))} onClick={() => onToggleMember(gi, mm.member.id)} />
                    </td>
                    <td className="relative px-[14px] py-[9px] align-middle">
                      {/* gold profile connector — joins guardian/caregiver avatar to its dependent(s) */}
                      {hasConnector && (
                        <span className="pointer-events-none absolute start-[31px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                      )}
                      <div className="relative flex items-center gap-[10px]">
                        <Avatar name={mm.member.name} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                          <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-[14px] py-[9px] align-middle">
                      {mm.badge ? <RoleBadge kind={mm.badge} /> : null}
                    </td>
                    <td className="px-[14px] py-[9px] align-middle">
                      <span className="text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }} {...tx('Valid for allocation')} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="ps-[14px] pe-[18px] py-[9px] align-middle">
                      {isFirst && (held ? (
                        <div className="flex items-center justify-end gap-[12px]">
                          <div className="min-w-0">
                            <span className="flex items-center gap-[5px] text-[13px] font-bold text-[#9a6712]" style={{ fontFamily: FONT }}>
                              <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0">
                                <circle cx="8" cy="8.5" r="6" stroke="#c98a2e" strokeWidth="1.4" />
                                <path d="M8 5.4V8.5l1.9 1.2M6 2.9h4" stroke="#c98a2e" strokeWidth="1.4" strokeLinecap="round" />
                              </svg>
                              {t('Confirm in {time}', { time: fmtClock(holdSec!) })}
                            </span>
                            <div className="mt-[6px] h-[5px] w-full max-w-[160px] overflow-hidden rounded-full" style={{ background: '#f4ddae' }}>
                              <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${((HOLD_SEC - holdSec!) / HOLD_SEC) * 100}%`, background: '#e8941e' }} />
                            </div>
                          </div>
                          <button type="button" onClick={() => onCancelHold(gi)} aria-label={t('Cancel reservation')} className="shrink-0">
                            <svg viewBox="0 0 20 20" fill="none" className="size-[20px]">
                              <path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="1.9" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => onReserve(gi)} className="ms-auto flex h-[38px] items-center rounded-full border-[1.5px] border-[#1f5a44] bg-white px-[20px] text-[13px] font-bold text-[#1f5a44] transition-all duration-200 hover:bg-[#eef5f0] hover:shadow-[0_5px_14px_-6px_rgba(31,90,68,0.4)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/30" style={{ fontFamily: FONT }} {...tx('Reserve')} />
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

// ── WhosInWhichCitySheet ───────────────────────────────────────────────────────

function WhosInWhichCitySheet({
  groups, groupCityMap, onClose,
}: {
  groups: Group[]
  groupCityMap: Map<number, LiveCity>
  onClose: () => void
}) {
     const { t, td } = useT()
  const byCityMap = new Map<string, { city: LiveCity; groupIndices: number[] }>()
  groupCityMap.forEach((city, gi) => {
    if (!byCityMap.has(city.id)) byCityMap.set(city.id, { city, groupIndices: [] })
    byCityMap.get(city.id)!.groupIndices.push(gi)
  })

  return (
    <BottomSheet open title={t('Who\'s in which city')} onClose={onClose}>
      <div>
        {[...byCityMap.values()].map(({ city, groupIndices }) => (
          <div key={city.id} className="mb-[16px]">
            <p className="text-[12px] font-bold uppercase tracking-[0.8px] text-[#8a938e] mb-[8px]" style={{ fontFamily: FONT }} {...td(city.name)} />
            {groupIndices.map((gi) =>
              groups[gi]?.members.map((mm) => (
                <div key={mm.member.id} className="flex items-center gap-[10px] py-[6px]">
                  <Avatar name={mm.member.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                    <p className="text-[12px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
                  </div>
                  <RoleBadge kind={mm.badge} />
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}

// ── Success: mobile group card ─────────────────────────────────────────────────

function SuccessGroupCard({ group, statusText }: { group: Group; statusText?: string }) {
  const { t, td } = useT()
  const linked = !!group.label
  // A group flagged not-valid can never be allocated → show that reason (matches City Selection).
  const groupNotValid = group.members.some((mm) => mm.member.notValidForCity)
  const rowStatus = statusText ? (groupNotValid ? 'Not valid for allocation' : statusText) : undefined
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
      {linked && (
        <div className="flex h-[32px] items-center gap-[8px] bg-[#e1eef1] px-[13px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>{group.label ? t(bandLabel(group.label)) : null}</span>
        </div>
      )}
      <div className="relative">
        {group.members.map((mm, mi) => (
          <div key={mm.member.id} className="relative flex items-center gap-[10px] px-[13px] py-[10px]">
            {linked && group.members.length > 1 && (
              <span className="pointer-events-none absolute start-[30px] w-[2px] bg-[#fac775]" style={{ top: mi === 0 ? '50%' : 0, bottom: mi === group.members.length - 1 ? '50%' : 0 }} />
            )}
            <div className="relative flex min-w-0 flex-1 items-center gap-[10px]">
              <Avatar name={mm.member.name} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                <p className="text-[12px] text-[#5a6660] mt-[2px]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
              </div>
            </div>
            <RoleBadge kind={mm.badge} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-[#f0ebe0] px-[13px] py-[10px]">
        <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }}>{statusText ? t('Status') : t('Raza status')}</span>
        {rowStatus ? (
          <span className="flex items-center gap-[5px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>
            <span className="size-[6px] rounded-full bg-[#d2632b]" />{rowStatus}
          </span>
        ) : (
          <span className="flex items-center gap-[5px] text-[13px] font-bold text-[#b8821e]" style={{ fontFamily: FONT }}>
            <span className="size-[6px] rounded-full bg-[#f59e0b]" />{t('Pending')}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Two-panel desktop atoms (host / relay) ─────────────────────────────────────

/** "👥 N members" cream pill shown under the desktop heading. */
function MembersChip({ count }: { count: number }) {
  const { tx } = useT()
  return (
    <span className="inline-flex h-[34px] items-center gap-[8px] rounded-full bg-[#fbeed3] px-[16px]">
      <PeopleMini color="#9a6712" />
      <span className="text-[15px] font-bold text-[#9a6712]" style={{ fontFamily: FONT }} {...tx(plural(count, '{n} member', '{n} members'), { n: count })} />
    </span>
  )
}

/** "PHASE 1 · LIVE" badge + info tooltip (host self-allocation). */
function PhaseBadge() {
  const { tx } = useT()
  return (
    <span className="inline-flex items-center gap-[8px]">
      <span className="inline-flex h-[28px] items-center gap-[7px] rounded-full bg-[#1f5a44] px-[13px]">
        <span className="size-[7px] rounded-full" style={{ background: '#86e6ad' }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-white" style={{ fontFamily: FONT }} {...tx('Phase 1 · Live')} />
      </span>
      <span className="group/ph relative inline-flex">
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px] text-[#8a938e]">
          <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 9.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="6.7" r="1" fill="currentColor" />
        </svg>
        <span className="pointer-events-none absolute end-0 top-[calc(100%+8px)] z-[60] w-[220px] rounded-[8px] bg-[#23302a] px-[11px] py-[8px] text-[12px] font-medium leading-[16px] text-white opacity-0 shadow-[0_8px_22px_-6px_rgba(0,0,0,0.4)] transition-opacity duration-200 group-hover/ph:opacity-100" style={{ fontFamily: FONT }} {...tx('Phase 1 self-allocation is live. Reserve your group before the timer closes.')} />
      </span>
    </span>
  )
}

/** Relay-city grid cell (desktop sidebar). */
function RelayGridCard({ city, selected, added, unavailable, onClick }: { city: LiveCity; selected: boolean; added: number; unavailable: boolean; onClick: () => void }) {
  const { t, tx, td } = useT()
  return (
    <div className="group/rc relative">
      <button
        type="button"
        disabled={unavailable}
        onClick={!unavailable ? onClick : undefined}
        className="flex h-[60px] w-full flex-col justify-center rounded-[12px] px-[12px] text-start transition-all duration-200 enabled:hover:-translate-y-[1px] enabled:hover:shadow-[0_8px_18px_-10px_rgba(21,64,47,0.3)] enabled:active:translate-y-0 disabled:pointer-events-none"
        style={{
          border: selected ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9',
          background: selected ? '#fffdf5' : unavailable ? '#f6f6f4' : 'white',
          cursor: unavailable ? 'not-allowed' : 'pointer',
        }}
      >
        <span className="flex w-full min-w-0 items-center gap-[5px]">
          <span className="truncate text-[14px] font-bold leading-[18px]" style={{ fontFamily: FONT, color: unavailable ? '#8a938e' : '#23302a' }} {...td(city.name)} />
          {/* An Arrange My Cities layout can displace the real host city into this grid (another
              city took the host slot) — flag it here, compact enough to not affect the card's
              fixed height/width. */}
          {city.type === 'host' && (
            <span
              className="shrink-0 rounded-full px-[5px] py-[1px] text-[9px] font-bold uppercase leading-[12px] tracking-[0.2px]"
              style={{ background: '#f7efd6', color: '#a8843e' }} {...tx('Host')} />
          )}
        </span>
        {/* Reserved status slot — fixed height so adding members never resizes the card */}
        <span className="mt-[3px] flex h-[16px] items-center gap-[4px] whitespace-nowrap text-[12px] font-semibold" style={{ fontFamily: FONT }}>
          {unavailable ? (
            <span className="inline-flex items-center gap-[4px] text-[#8a938e]">
              
              {t('Not available')}
              <svg viewBox="0 0 20 20" fill="none" className="size-[13px]"><circle cx="10" cy="10" r="7.25" stroke="#b23b3b" strokeWidth="1.4" /><path d="M10 9.2v3.6" stroke="#b23b3b" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10" cy="6.7" r="1" fill="#b23b3b" /></svg>
            </span>
          ) : (selected || added > 0) ? (
            <span className="inline-flex items-center gap-[4px] text-[#5a6660]">
              <PeopleMini /> {added} added
            </span>
          ) : (
            <span className="text-[#1f7a4d]" {...tx('Available')} />
          )}
        </span>
      </button>
      {unavailable && (
        <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-[#23302a] px-[10px] py-[6px] text-[12px] font-semibold text-white opacity-0 shadow-[0_8px_22px_-6px_rgba(0,0,0,0.4)] transition-opacity duration-200 group-hover/rc:opacity-100" style={{ fontFamily: FONT }} {...tx('Capacity is full.')} />
      )}
    </div>
  )
}

/** Small star/pin glyph for the "My Preferred City" card header. */
function PreferredStarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
      <path d="M12 3.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.5l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76L12 3.5Z" stroke="#c2a04e" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** "My Preferred City" — the user's own ranked shortlist from the Preferred City screen, between the
 *  Host city card and the Relay city grid. Every entry is selectable, reusing `RelayGridCard` so it
 *  behaves identically to the grid below (same select/added/unavailable states, same `onSelect`). A
 *  preferred pick that isn't one of THIS event's live/relay cities is treated as generally available
 *  (a synthetic city with open capacity) rather than blocked — the user ranked it as a preference, so
 *  it stays choosable even though this event doesn't track real seat counts for it. The host city is
 *  excluded since it already has its own big card above. */
function MyPreferredCityCard({
  cities,
  hostCityId,
  liveById,
  activeCityId,
  addedOf,
  unavailableOf,
  onSelect,
  onReserveAll,
  allGroupsAssigned,
  onSwapAll,
  anySwappable,
}: {
  cities: RankedCity[]
  hostCityId?: string
  liveById: Map<string, LiveCity>
  activeCityId: string | null
  addedOf: (id: string) => number
  unavailableOf: (c: LiveCity) => boolean
  onSelect: (c: LiveCity) => void
  /** Same slot as the Host card / Relay grid header — when a preferred pick is the active city, a
   *  "Reserve all"/"Remove all" pill renders beside the title (mirrors HostCityCard/RelaySidebarCard). */
  onReserveAll?: () => void
  allGroupsAssigned?: boolean
  /** Same slot as the Host card / Relay grid header — when the user holds reservation(s) elsewhere
   *  and the active city is one of THIS card's preferred picks, a teal "Swap all to {city}" pill
   *  renders beside the title. */
  onSwapAll?: () => void
  anySwappable?: boolean
}) {
     const { t, tx, tdText } = useT()
  const preferred = cities.filter((c) => c.id !== hostCityId)
  if (preferred.length === 0) return null
  const activeInThisCard = preferred.find((c) => c.id === activeCityId)
  const showInlineReserveAll = !!onReserveAll && !!activeInThisCard
  const showInlineSwapAll = !!onSwapAll && !!anySwappable && !!activeInThisCard
  return (
    <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[16px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
      <div className="flex items-center gap-[8px]">
        <PreferredStarIcon />
        <p className="text-[17px] leading-[21px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('My Preferred City')} />
        {showInlineReserveAll && (
          <button
            type="button"
            onClick={onReserveAll}
            className={`ms-auto inline-flex h-[34px] shrink-0 items-center justify-center rounded-full px-[16px] text-[13px] font-bold transition-colors ${
              allGroupsAssigned
                ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
                : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
            }`}
            style={{ fontFamily: FONT }}
          >
            {allGroupsAssigned ? t('Remove all') : 'Select all'}
          </button>
        )}
        {showInlineSwapAll && (
          <button
            type="button"
            onClick={onSwapAll}
            className="ms-auto inline-flex h-[34px] shrink-0 items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[16px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
            style={{ fontFamily: FONT }}
          >
            <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="truncate" {...tx('Swap all to {city}', { city: tdText(activeInThisCard?.name ?? '') })} />
          </button>
        )}
      </div>
      <div className="mt-[12px] grid grid-cols-3 gap-[10px]">
        {preferred.map((c) => {
          const live: LiveCity = liveById.get(c.id) ?? { id: c.id, name: c.name, region: c.region, type: c.type ?? 'relay', seatsLeft: 999, totalSeats: 999 }
          return (
            <RelayGridCard
              key={c.id}
              city={live}
              selected={live.id === activeCityId}
              added={addedOf(live.id)}
              unavailable={unavailableOf(live)}
              onClick={() => onSelect(live)}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Desktop sidebar card: "Choose a relay city (N)" + search + scrollable city grid. */
function RelaySidebarCard({ cities, activeCityId, addedOf, unavailableOf, search, onSearch, onSelect, onReserveAll, allGroupsAssigned, onSwapAll, anySwappable }: {
  cities: LiveCity[]
  activeCityId: string | null
  addedOf: (id: string) => number
  unavailableOf: (c: LiveCity) => boolean
  search: string
  onSearch: (v: string) => void
  onSelect: (c: LiveCity) => void
  /** When set, and the active city is one of `cities`, a "Reserve all"/"Remove all" pill renders on
   *  the right of the "Relay city (N)" header — mirrors the Host city card's inline Reserve all. */
  onReserveAll?: () => void
  allGroupsAssigned?: boolean
  /** Same slot as `onReserveAll` — when the user holds reservation(s) elsewhere and the active city is
   *  one of `cities`, a teal "Swap all" pill renders instead (the two never apply at once). */
  onSwapAll?: () => void
  anySwappable?: boolean
}) {
     const { tx, t, td, tdText } = useT()
  const activeCityInGrid = cities.find((c) => c.id === activeCityId)
  const activeInThisGrid = !!activeCityInGrid
  const showInlineReserveAll = !!onReserveAll && activeInThisGrid
  const showInlineSwapAll = !!onSwapAll && !!anySwappable && activeInThisGrid

  // Grouped into per-country accordions (collapsed by default, only one open at a time) instead of
  // one long grid — mirrors ArrangeCities.tsx's "Other Cities" card. The city cards themselves
  // (RelayGridCard, with its Available/Not available/Filling-fast states) are unchanged.
  const [expanded, setExpanded] = useState<string | null>(null)
  // When the active city changes, auto-expand its country so a just-picked city never ends up
  // hidden inside a collapsed group. Doesn't fire on every render — only when the selection moves.
  useEffect(() => {
    const c = cities.find((c) => c.id === activeCityId)
    if (c) setExpanded(countryOf(c))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCityId])

  const q = search.trim().toLowerCase()
  const countries: { name: string; cities: LiveCity[] }[] = []
  const byCountry = new Map<string, LiveCity[]>()
  cities.forEach((c) => {
    const country = countryOf(c)
    let list = byCountry.get(country)
    if (!list) { list = []; byCountry.set(country, list); countries.push({ name: country, cities: list }) }
    list.push(c)
  })
  let anyMatch = false
  return (
    <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
      <div className="flex items-center gap-[8px]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[22px] shrink-0">
          <path d="M20.5 13.2A8.5 8.5 0 1110.8 3.5a6.7 6.7 0 109.7 9.7z" stroke="#c2a04e" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        <p className="text-[20px] leading-[24px] text-[#15402f]" style={{ fontFamily: SERIF }}>Other Cities ({cities.length})</p>
        {showInlineReserveAll && (
          <button
            type="button"
            onClick={onReserveAll}
            className={`ms-auto flex h-[34px] shrink-0 items-center justify-center rounded-full px-[16px] text-[13px] font-bold transition-colors ${
              allGroupsAssigned
                ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
                : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
            }`}
            style={{ fontFamily: FONT }}
          >
            {allGroupsAssigned ? t('Remove all') : 'Select all'}
          </button>
        )}
        {showInlineSwapAll && (
          <button
            type="button"
            onClick={onSwapAll}
            className="ms-auto inline-flex h-[34px] shrink-0 items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[16px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
            style={{ fontFamily: FONT }}
          >
            <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="truncate" {...tx('Swap all to {city}', { city: tdText(activeCityInGrid?.name ?? '') })} />
          </button>
        )}
      </div>
      <div className="mt-[14px] flex h-[48px] items-center gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-[#fbfbfb] px-[14px] transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12">
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('Search city names...')} className="flex-1 bg-transparent text-[15px] text-[#23302a] outline-none placeholder:text-[#9aa39d]" style={{ fontFamily: FONT }} />
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </div>
      <div className="mt-[14px] flex flex-col gap-[8px]">
        {countries.map(({ name, cities: countryCities }) => {
          // Searching pre-filters every country to matches only, and hides countries with none.
          const matches = q ? countryCities.filter((c) => c.name.toLowerCase().includes(q)) : countryCities
          // CONFIRMED CORRECT — do not "fix" this into an empty state. This hides one COUNTRY that
          // has no matches, which is what a filtered list should do; the whole-list empty state is
          // the `q && !anyMatch` block further down. Turning this into a per-country "no results"
          // row would print one for every country the user did not search for.
          if (q && matches.length === 0) return null
          if (matches.length > 0) anyMatch = true
          const isOpen = q ? true : expanded === name
          return (
            <div key={name} className="shrink-0 overflow-hidden rounded-[12px] border border-[#e7dfc9]">
              <button
                type="button"
                onClick={() => setExpanded((cur) => (cur === name ? null : name))}
                className="flex w-full items-center justify-between px-[14px] py-[12px] text-start transition-colors hover:bg-[#fffdf5]"
              >
                <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(name)} />
                <span className="flex items-center gap-[8px]">
                  <span className="text-[12px] text-[#8a938e]" style={{ fontFamily: FONT }}>{matches.length}</span>
                  <svg viewBox="0 0 16 16" fill="none" className={`size-[13px] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    <path d="M4 6l4 4 4-4" stroke="#8a938e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              {isOpen && (
                <div className="grid grid-cols-3 gap-[10px] border-t border-[#e7dfc9] p-[10px]">
                  {matches.map((c) => (
                    <RelayGridCard key={c.id} city={c} selected={c.id === activeCityId} added={addedOf(c.id)} unavailable={unavailableOf(c)} onClick={() => onSelect(c)} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {q && !anyMatch && (
          <p className="py-[12px] text-center text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No cities found.')} />
        )}
      </div>
    </div>
  )
}

// ── ReserveTip (reservation success tooltip) ────────────────────────────────────
/** A single green confirmation pill pinned above the floating footer, aligned to the right. Names the
 *  member(s) just reserved. The parent drives one-at-a-time playback (in → hold → out) via `phase`. */
function ReserveTip({ tip }: { tip: { text: string; phase: 'in' | 'out' } | null }) {
  if (!tip) return null
  return (
    <div className="pointer-events-none fixed bottom-[128px] end-[16px] z-[95] flex justify-end sm:end-[var(--content-px)]" role="status" aria-live="polite">
      <div
        className={`flex max-w-[calc(100vw-32px)] items-center gap-[9px] rounded-full px-[16px] py-[10px] ${tip.phase === 'in' ? 'reserve-tip-in' : 'reserve-tip-out'}`}
        style={{ background: '#1f5a44', boxShadow: '0 12px 30px -8px rgba(21,64,47,0.5)' }}
      >
        <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
          <circle cx="9" cy="9" r="8" fill="#2f7256" />
          <path d="M5.4 9.2l2.4 2.4 4.8-5" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate text-[13.5px] font-semibold text-white" style={{ fontFamily: FONT }}>{tip.text}</span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CitySelection() {
  const { tx, t, td, tdText } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  // Where to go after filing a request — the Miqaat detail page when Ask Help was opened from there
  // (passed via router state), else Home as before.
  const location = useLocation()
  const navState = location.state as { returnTo?: string; modifyCityZone?: boolean } | null
  const returnTo = navState?.returnTo ?? null
  // Reached from Modify Reservation's "Switch to a different city and zone" card → this screen runs
  // as a combined city+zone change: it skips the queue, always shows the Zone column (like a same-day
  // event), surfaces the member's Araz preferred cities on the left and their CURRENT city+zone in the
  // table, and returns to Modify Reservation on confirm. Gated entirely on this flag — every other
  // (fresh-registration / same-day) path is untouched when it's false.
  const modifyCityZone = !!navState?.modifyCityZone
  const flow = useStore((s) => s.flow)
  const confirmCityAction = useStore((s) => s.confirmCity)
  const setGroupCities = useStore((s) => s.setGroupCities)
  const confirmZoneAction = useStore((s) => s.confirmZone)
  const setGroupZones = useStore((s) => s.setGroupZones)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const requestReopen = useStore((s) => s.requestReopen)
  const reopenRequests = useStore((s) => s.reopenRequests)
  const registrations = useStore((s) => s.registrations)
  const stageOverrides = useStore((s) => s.stageOverrides)
  const demoPhase = id ? stageOverrides[id] : undefined

  const [view, setView] = useState<ViewState>(() => {
    // Modify-city-zone change flow → skip the queue entirely and land on the selection view.
    if ((location.state as { modifyCityZone?: boolean } | null)?.modifyCityZone) return 'browse'
    // A closed event reached via the Ask Help request flow skips the queue loader — the deadline has
    // passed, so there's no live queue to wait through; land straight on the selection view.
    const mq = miqaats.find((x) => x.id === id)
    const closed = demoPhase
      ? demoPhase !== 'city_open'
      : !!mq && mq.countdownSeconds <= 0 && !(id && reopenRequests[id]?.approved)
    return closed ? 'browse' : 'queue-waiting'
  })
  // Leave-confirmation: while actively allocating (browse view), intercept Go-back /
  // browser-back / mobile-back and confirm before abandoning the queue attempt.
  const [leaveOpen, setLeaveOpen] = useState(false)
  const leaveActionRef = useRef<() => void>(() => {})
  const requestLeave = (action: () => void) => { leaveActionRef.current = action; setLeaveOpen(true) }
  const [cityType, setCityType] = useState<'host' | 'relay' | null>(null)

  // Browser back-button / mobile back-gesture guard — only while actively allocating
  // (browse view). Re-pushes state so the page stays put, then surfaces the confirm dialog.
  useEffect(() => {
    if (view !== 'browse') return
    window.history.pushState(null, '', window.location.href)
    const onPop = () => {
      window.history.pushState(null, '', window.location.href)
      requestLeave(() => nav('/miqaats'))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])
  const [activeCity, setActiveCity] = useState<LiveCity | null>(null)
  const [groupCityMap, setGroupCityMap] = useState<Map<number, LiveCity>>(new Map())
  // Relay: members deselected from their allocated group (e.g. a dependent who can't attend).
  const [droppedMembers, setDroppedMembers] = useState<Set<string>>(new Set())
  const [showViewAll, setShowViewAll] = useState(false)
  const [showWhosInWhichCity, setShowWhosInWhichCity] = useState(false)
  const [citySearch, setCitySearch] = useState('')
  // Relay city: per-group "Relay city" dropdown (anchored popover) + its search
  const [relayDropdown, setRelayDropdown] = useState<{ gi: number; el: HTMLElement } | null>(null)
  const [relayCitySearch, setRelayCitySearch] = useState('')
  const [allocationTimer, setAllocationTimer] = useState(2 * 3600 + 42 * 60 + 11)
  const [queueCountdown, setQueueCountdown] = useState(QUEUE_WAIT_SECONDS)
  // The configured duration, held in a ref so the countdown effect can seed its deadline without
  // taking the ticking value as a dependency (which would reset the deadline once a second).
  const queueCountdownRef = useRef(QUEUE_WAIT_SECONDS)
  // Host city: per-member selection + per-group hold ("Confirm before time expires")
  const [checkedMemberIds, setCheckedMemberIds] = useState<Set<string>>(new Set())
  const [holds, setHolds] = useState<Map<number, number>>(new Map())
  const { toast, showToast } = useToast()

  // ── Reservation success tooltips ────────────────────────────────────────────
  // A small green confirmation shown above the floating footer (right-aligned) naming the member(s)
  // just reserved. Reserve/Swap all enqueue one message per group and play them one at a time — each
  // animates in, holds briefly, then eases out before the next appears (never one combined message).
  const [tipQueue, setTipQueue] = useState<string[]>([])
  const [activeTip, setActiveTip] = useState<{ text: string; phase: 'in' | 'out' } | null>(null)
  useEffect(() => {
    if (activeTip || tipQueue.length === 0) return
    setActiveTip({ text: tipQueue[0], phase: 'in' })
    setTipQueue((q) => q.slice(1))
  }, [tipQueue, activeTip])
  useEffect(() => {
    if (!activeTip) return
    // "in" phase = slide-in + short hold; "out" phase = ease-out. Kept brisk so a full family reads fast.
    const dur = activeTip.phase === 'in' ? 780 : 240
    const t = setTimeout(() => {
      setActiveTip((a) => (a ? (a.phase === 'in' ? { ...a, phase: 'out' } : null) : null))
    }, dur)
    return () => clearTimeout(t)
  }, [activeTip])
  /** Build "<member(s)> reserved in <city>." for a group. */
  const reserveTipText = (gi: number, cityName: string): string => {
    const names = groupsRef.current[gi]?.members.map((m) => m.member.name) ?? []
    if (names.length === 0) return ''
    const who = names.length === 1
      ? tdText(names[0])
      : t('{list} & {last}', { list: names.slice(0, -1).map((n) => tdText(n)).join(', '), last: tdText(names[names.length - 1]) })
    return t('{who} selected in {city}.', { who, city: tdText(cityName) })
  }
  /** Enqueue one reservation tooltip per group (played sequentially). */
  const enqueueReserveTips = (gis: number[], cityName: string | undefined = activeCity?.name) => {
    if (!cityName) return
    const msgs = gis.map((gi) => reserveTipText(gi, cityName)).filter(Boolean)
    if (msgs.length) setTipQueue((q) => [...q, ...msgs])
  }

  // `cityType` tracks the type of the most-recently picked city, for the success-screen labels.
  /** Pick a city as the active target. Host and relay live in one flow now. */
  const selectCity = (c: LiveCity | null) => {
    setActiveCity(c)
    if (c) setCityType(c.type)
  }
  /** Row click in the merged table → allocate/deallocate the whole group to the active city. */
  function toggleGroupRow(gi: number) {
    if (isAutoGroup(gi) || isLockedGroup(gi)) return // auto-allocated or locked (re-select) — not user-toggleable
    // Swap-pending: the group already holds a reservation and a DIFFERENT city is now selected — a card
    // tap offers to swap (replace), never a second reservation and never a silent removal. Standard flow
    // only (same-day-flow merges city+zone and is left untouched).
    if (!showCombined && swapTargetFor(gi)) { swapGroupToActiveCity(gi); return }
    const unassigned = !groupCityMap.has(gi)
    if (unassigned && !activeCity) { showToast('Please select a city first.'); return }
    if (unassigned && !groupEligible(gi)) { showToast('Please choose a different city.'); return }
    if (unassigned && groupOpensAt(gi)) { showToast('This member can reserve once their city opens.'); return }
    if (unassigned && groupClosedForActive(gi)) { showToast('Please choose a different city.'); return }
    if (unassigned && !groupAvailableFor(gi)) { showToast('This city is full — choose another.'); return }
    handleGroupToggle(gi)
    // Newly reserved (was unassigned, now allocated to the active city) → confirmation tooltip.
    if (unassigned && activeCity) enqueueReserveTips([gi], activeCity.name)
  }

  const miqaat = miqaats.find((x) => x.id === id)
  // Same-day-flow events (registration + city + zone all within one short window, e.g. eg-live)
  // combine city AND zone selection into this one screen instead of handing off to the separate
  // Zone Selection route — see finishCity() below. Never true for any other event.
  const isSameDayFlow = !!miqaat?.sameDayFlow
  // Show the combined City+Zone table (Zone column + Zone step) either for a genuine same-day event
  // OR when this screen is running as the Modify-Reservation "city and zone" change flow.
  const showCombined = isSameDayFlow || modifyCityZone
  // Modify-city-zone reframes the screen as a change flow (not a fresh allocation): its breadcrumb
  // roots at Modify Reservation and its heading names the action, instead of "City selection" /
  // "Allocate Your Group".
  const cityBreadcrumb = modifyCityZone
    ? [{ label: t('Home'), to: '/miqaats' }, { label: t('Modify Reservation'), to: `/miqaats/${id}/manage` }, { label: t('City & zone') }]
    : [{ label: t('Home'), to: '/miqaats' }, { label: t('City selection') }]
  const screenHeading = modifyCityZone ? 'Change city & zone' : 'Allocate Your Group'
  // City deadline already passed and not yet approved → the user got here via the Ask Help redirect for
  // a missed event, so reserving submits a *request* (with the chosen city) instead of confirming.
  // Modify-city-zone runs as an OPEN change (applied immediately on confirm) while the zone window is
  // still open — UNLESS the zone window has since closed (demoPhase at 'zone_closed' or later) OR Raza
  // has already been issued for this registrant. Either signal means the allocation is treated as
  // finalized, so a city/zone change here also has to go through the request/approval flow (matches
  // the rest of the app's request wording + submit-for-approval behavior) rather than applying instantly.
  const modifyCityZoneWindowClosed = demoPhase
    ? DEMO_PHASE_ORDER.indexOf(demoPhase) >= DEMO_PHASE_ORDER.indexOf('zone_closed')
    : false
  const isRequest = modifyCityZone
    ? (modifyCityZoneWindowClosed || !!flow.razaIssued)
    : demoPhase
    ? demoPhase !== 'city_open'
    : !!miqaat && miqaat.countdownSeconds <= 0 && !(id && reopenRequests[id]?.approved)
  // ── Arrange My Cities layout ────────────────────────────────────────────────
  // The optional post-registration "Arrange My Cities" step saves a pure LAYOUT of the left-side
  // city cards (which city sits in the host slot, the preferred slots, and the relay order). When
  // present it only changes where/in what order the cards render — every selection/reservation
  // behavior below stays exactly the same. Without one, nothing changes at all.
  const arrangement = journeyFor(flow, registrations, id ?? '').cityArrangement ?? null
  const cityById = (cid: string) => liveCities.find((c) => c.id === cid)
  const [groupZoneMap, setGroupZoneMap] = useState<Map<number, Zone>>(new Map())
  // Sentinel row index for the zone dropdown opened from the Zone column HEADER ("Set all") rather
  // than from a single row's trigger — no real group can have index -1.
  const ZONE_ALL_GI = -1
  const [zoneDropdown, setZoneDropdown] = useState<{ gi: number; el: HTMLElement } | null>(null)
  const [zoneSearch, setZoneSearch] = useState('')
  // ⚠️ A staged zone belongs to the city it was picked in. Removing a group's city — or switching it
  // to a DIFFERENT city — used to leave the zone behind in `groupZoneMap`, so an unreserved row still
  // displayed a zone the user had never chosen for it ("Select Delhi" next to "Zone A - Main Hall").
  // Prune on every city change rather than at each of the many mutation sites (row toggle, Select
  // all / Remove all, swap-all, city switch), so no path can leak a stale zone.
  useEffect(() => {
    setGroupZoneMap((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Map(prev)
      prev.forEach((zone, gi) => {
        const city = groupCityMap.get(gi)
        const stillValid = !!city && (zonesByCityId[city.id] ?? []).some((z) => z.id === zone.id)
        if (!stillValid) { next.delete(gi); changed = true }
      })
      return changed ? next : prev
    })
  }, [groupCityMap])

  /** Assign a zone to a group from the in-table dropdown (same-day-flow only). */
  function setGroupZone(gi: number, zone: Zone) {
    setGroupZoneMap((prev) => { const n = new Map(prev); n.set(gi, zone); return n })
    setZoneDropdown(null)
  }
  const selectedIds = flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)
  // This event has no Invite Mehmaan step at all — any Mehmaan invites in the shared flow belong to
  // a different event's session and must not surface here (they'd otherwise show up as extra
  // allocatable groups the user never actually invited for this registration).
  const invitesForGroups = miqaat?.hideInviteMehmaan ? flow.invites.filter((i) => i.group) : flow.invites
  const groups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, invitesForGroups)
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  // ── Re-select mode ────────────────────────────────────────────────────────────
  // After the registrant cancels ONLY their own city in Modify Reservation, they return here to pick a
  // new city just for themselves. The OTHER groups still hold a saved allocation (`flow.groupCities`),
  // so those rows are shown READ-ONLY (their city, no controls) and only the registrant's group can be
  // (re)selected. Detected purely from the data: a fresh registration (no saved allocations) or a
  // fully-allocated reservation (the registrant also has a city) never enters this mode.
  const reselectRegistrantGi = groups.findIndex((g) => g.members.some((mm) => mm.member.role === 'registrant'))
  const savedGroupCities = flow.groupCities
  const registrantHasSaved = reselectRegistrantGi >= 0 && !!savedGroupCities[String(reselectRegistrantGi)]
  const lockedSet = new Set<number>(
    registrantHasSaved
      ? []
      : groups.map((_, gi) => gi).filter((gi) => gi !== reselectRegistrantGi && !!savedGroupCities[String(gi)]),
  )
  const reselectMode = lockedSet.size > 0
  const isLockedGroup = (gi: number) => lockedSet.has(gi)
  // Seed the locked groups' saved cities into the allocation map so their rows render read-only.
  useEffect(() => {
    if (!reselectMode) return
    setGroupCityMap((prev) => {
      let changed = false
      const next = new Map(prev)
      lockedSet.forEach((gi) => {
        if (!next.has(gi)) {
          const alloc = savedGroupCities[String(gi)]
          const live: LiveCity = liveCities.find((c) => c.id === alloc.id)
            ?? { id: alloc.id, name: alloc.name, region: '', type: alloc.type, seatsLeft: 999, totalSeats: 999 }
          next.set(gi, live); changed = true
        }
      })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reselectMode, groups.length])

  // ── Araz preferred cities ───────────────────────────────────────────────────
  // Araz (this event's early preferred-city submission) stores its host/relay picks in the journey's
  // `araz.picks`, NOT in `flow.cities` — so without this they'd never surface on City Selection. When
  // the event runs an Araz phase (`miqaat.araz`) and the user submitted one, pull the distinct picked
  // cities out as the "My Preferred City" source (relay picks fill the card; a host pick badges the
  // host card). `flow.cities` (the ranked PreferredCity screen) still wins when it's been used.
  const arazPicks = miqaat?.araz ? journeyFor(flow, registrations, id ?? '').araz?.picks : undefined
  const arazPreferredCities: RankedCity[] = (() => {
    if (!arazPicks) return []
    const seen = new Set<string>()
    const out: RankedCity[] = []
    for (const p of Object.values(arazPicks)) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      const src = liveCities.find((c) => c.id === p.id) ?? cityDirectory.find((c) => c.id === p.id)
      out.push({ id: p.id, name: p.name, region: src?.region ?? '', type: p.type })
    }
    return out
  })()
  // Modify-city-zone: a group's CURRENT (pre-change) city + zone, read from the persisted allocation
  // (group 0 falls back to the single confirmedCity/confirmedZone) → drives the "Now …" table caption.
  const currentAllocFor = (gi: number): { cityName: string; cityType: 'host' | 'relay'; zoneName: string } | null => {
    const city = flow.groupCities[String(gi)] ?? (gi === 0 ? flow.confirmedCity : null)
    if (!city) return null
    const zone = flow.groupZones[String(gi)] ?? (gi === 0 ? flow.confirmedZone : null)
    return { cityName: city.name, cityType: city.type as 'host' | 'relay', zoneName: zone?.name ?? '' }
  }
  /** Same source as `currentAllocFor`, but the city ID — needed for identity comparisons, which the
   *  display name can't do reliably. */
  const currentCityIdFor = (gi: number): string | null =>
    (flow.groupCities[String(gi)] ?? (gi === 0 ? flow.confirmedCity : null))?.id ?? null
  // An Arrange-My-Cities layout pins its own preferred-slot cities; otherwise the "My Preferred
  // City" card prefers the ranked PreferredCity list, falling back to the Araz picks.
  const arrangedPreferredCities: RankedCity[] = (arrangement?.preferredCityIds ?? [])
    .map((cid) => cityById(cid))
    .filter((c): c is LiveCity => !!c)
    .map((c) => ({ id: c.id, name: c.name, region: c.region, type: c.type }))
  const preferredCities = arrangement ? arrangedPreferredCities : flow.cities.length > 0 ? flow.cities : arazPreferredCities
  // A host-city Araz pick can't live in the card (the host has its own card) — badge that card
  // instead. An arrangement can put ANY city in the host slot; the default is the real host.
  const hostCityId = arrangement?.hostCityId ?? liveCities.find((c) => c.type === 'host')?.id
  /** True when every group that HAS a current city is already in the host-slot city. "Change city &
   *  zone" exists to move elsewhere — staying put and re-picking the zone is Modify Reservation's
   *  separate "Switch to a different zone" option — so the host card shows a static "Already in this
   *  city" status instead of Select / Select all, and isn't pre-selected on entry.
   *  ⚠️ Deliberately requires ALL of them: in a party split across cities the other groups can still
   *  legitimately move INTO the host city, so the card must stay selectable for them. */
  const hostIsCurrentCity = (() => {
    if (!modifyCityZone || !hostCityId) return false
    const withCity = groups.map((_, gi) => gi).filter((gi) => currentCityIdFor(gi) !== null)
    return withCity.length > 0 && withCity.every((gi) => currentCityIdFor(gi) === hostCityId)
  })()
  const hostPreferred = !!hostCityId && arazPreferredCities.some((c) => c.id === hostCityId)
  // Cities surfaced in the "My Preferred City" card (relay picks only — host has its own card). Both
  // the desktop "Relay city" grid and the mobile "Relay cities" chip row exclude these so a preferred
  // city isn't listed twice — each has its own dedicated "My Preferred City" section instead.
  const preferredRelayIds = new Set(preferredCities.filter((c) => c.id !== hostCityId).map((c) => c.id))

  // Per-event "auto-allocate Others" rule (e.g. Urs Mubarak Syedna Taher Saifuddin RA) — members
  // added via Add People's ITS search ("Others") never need manual city selection; their group is
  // auto-allocated to the host city instead. Family members always go through the normal flow.
  const autoAllocateOthers = !!miqaat?.autoAllocateOthers
  const otherInviteIts = new Set(flow.invites.filter((i) => i.group).map((i) => i.its))
  // Per-event "auto-allocate self via invite" rule (e.g. Eid-e-Ghadeer 1447H) — once the registrant
  // has accepted an incoming "join their group" invite (Notifications → Join Group), the registrant's
  // OWN group is auto-allocated (the registrant plus any dependents who reserve together with him);
  // the rest of the family (added separately, in their own groups) still self-allocates.
  const autoAllocateSelf = !!miqaat?.autoAllocateSelfViaInvite && flow.joinedGroupInvite
  const isRegistrantGroup = (gi: number) => !!groups[gi]?.members.some((mm) => mm.member.role === 'registrant')
  const isAutoGroup = (gi: number) =>
    (autoAllocateOthers && !!groups[gi]?.members.some((mm) => otherInviteIts.has(mm.member.its))) ||
    (autoAllocateSelf && isRegistrantGroup(gi))
  useEffect(() => {
    if (!autoAllocateOthers && !autoAllocateSelf) return
    const hostCityDefault = liveCities.find((c) => c.type === 'host')
    if (!hostCityDefault) return
    setGroupCityMap((prev) => {
      let changed = false
      const next = new Map(prev)
      groups.forEach((_, gi) => {
        if (isAutoGroup(gi) && !next.has(gi)) { next.set(gi, hostCityDefault); changed = true }
      })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, autoAllocateOthers, autoAllocateSelf])
  // Pre-select the Top preferred city (whichever city occupies the host slot) the moment the user
  // reaches the browse view, so "Reserve all" is available immediately instead of requiring an
  // explicit "Select" tap first. Fires once — the user can still switch/deselect afterward without
  // this re-selecting it for them.
  const autoSelectedHostRef = useRef(false)
  useEffect(() => {
    if (autoSelectedHostRef.current || view !== 'browse') return
    // Never pre-select the city the party is already in — that's what made "Change city & zone" open
    // showing "Selected" on Colombo when nothing had been changed yet.
    if (hostIsCurrentCity) { autoSelectedHostRef.current = true; return }
    const defaultHostCity = hostCityId ? cityById(hostCityId) : liveCities.find((c) => c.type === 'host')
    if (defaultHostCity) {
      setActiveCity(defaultHostCity)
      autoSelectedHostRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hostCityId, hostIsCurrentCity])
  const totalMembers = groups.reduce((n, g) => n + g.members.length, 0)
  // Relay: a member is allocated when its group has a city AND it wasn't dropped (dependent opt-out).
  const memberAllocated = (gi: number, memberId: string) => groupCityMap.has(gi) && !droppedMembers.has(memberId)
  const groupAllocCount = (gi: number) =>
    groupCityMap.has(gi) ? (groups[gi]?.members.filter((m) => !droppedMembers.has(m.member.id)).length ?? 0) : 0
  const totalAllocated = groups.reduce((n, _g, gi) => n + groupAllocCount(gi), 0)
  // Host city: every (group, member) selection key + whether all are currently selected (drives the header select-all)
  const allHostKeys = groups.flatMap((g, gi) => g.members.map((m) => memKey(gi, m.member.id)))
  const allHostChecked = allHostKeys.length > 0 && allHostKeys.every((k) => checkedMemberIds.has(k))

  /**
   * Queue waiting countdown — driven by a wall-clock DEADLINE, not by accumulated ticks.
   *
   * The previous version decremented state once per interval (`t - 1`). Browsers throttle timers
   * in a background tab to roughly once a minute, so a user who switched away came back to a
   * countdown that had barely moved and a queue that never opened — it was measuring "how many
   * times this tab was allowed to run", not elapsed time. The same bug means landing after the
   * window has already opened shows an expired countdown ticking down again from the start.
   *
   * Storing an absolute deadline and recomputing the remainder makes both cases fall out: the
   * interval only refreshes the DISPLAY, and every recompute is authoritative regardless of how
   * many ticks were missed. `visibilitychange` and `focus` cover the return-to-tab path, where
   * the answer is needed immediately rather than up to a second later on the next tick.
   */
  useEffect(() => {
    if (view !== 'queue-waiting') return
    // Seeded once per entry into the waiting view. Reading the current state here (rather than a
    // constant) keeps the demo's configured duration as the source of the deadline.
    const deadline = Date.now() + queueCountdownRef.current * 1000

    const sync = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000)
      if (left <= 0) {
        setQueueCountdown(0)
        setView('queue-active')
        return true
      }
      setQueueCountdown(left)
      return false
    }

    // On mount: if the window is already open, transition now instead of rendering a countdown
    // that is already expired.
    if (sync()) return

    const iv = setInterval(sync, 250)
    const onWake = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
    // `queueCountdownRef` is a ref on purpose — including the countdown VALUE here would restart
    // the deadline on every tick and the queue would never open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Allocation timer
  useEffect(() => {
    if (view !== 'browse') return
    const iv = setInterval(() => setAllocationTimer((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(iv)
  }, [view])

  // Host city hold countdown — a hold that runs out is simply released (the member
  // selection is independent and is left untouched).
  useEffect(() => {
    if (view !== 'browse' || cityType !== 'host') return
    const iv = setInterval(() => {
      setHolds((prev) => {
        if (prev.size === 0) return prev
        const next = new Map<number, number>()
        prev.forEach((sec, gi) => { if (sec > 1) next.set(gi, sec - 1) })
        return next
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [view, cityType])

  // ── Host city allocation ───────────────────────────────────────────────────────
  // Selection (checkbox) and Reserve (hold + countdown) are INDEPENDENT actions:
  //   · toggling a checkbox only changes selection — it never starts the countdown
  //   · clicking Reserve starts the hold/countdown; with nothing selected yet it
  //     first auto-selects the whole group (linked members reserve together)
  // Linked groups select together so a dependent is never reserved without its
  // guardian/caregiver.

  /** Reserve a group → start its hold/countdown. If the group has no selected
   *  member yet, auto-select the whole group first (linked members reserve
   *  together) so Reserve works without ticking the box; an existing partial
   *  selection is kept as-is. */
  function reserveGroup(gi: number) {
    const g = groups[gi]; if (!g) return
    if (holds.has(gi)) return
    // No prior checkbox selection required: with nothing in this group selected,
    // select the whole group (guardian/caregiver + dependent together) before the hold.
    const anyChecked = g.members.some((mm) => checkedMemberIds.has(memKey(gi, mm.member.id)))
    if (!anyChecked) {
      setCheckedMemberIds((prev) => {
        const s = new Set(prev)
        g.members.forEach((mm) => s.add(memKey(gi, mm.member.id)))
        return s
      })
    }
    setHolds((prev) => { const n = new Map(prev); n.set(gi, HOLD_SEC); return n })
    showToast(`Held for ${HOLD_SEC}s - tap confirm below to secure`)
  }
  /** Toggle a member's selection only (no holds). Linked groups select together by
   *  default, but the dependent can be deselected independently (e.g. can't attend);
   *  a dependent can never be selected without its guardian/caregiver. */
  function toggleHostMember(gi: number, memberId: string) {
    const g = groups[gi]; if (!g) return
    const dep = g.members.find((mm) => mm.member.needsGuardian || mm.member.needsCaregiver)?.member
    const lead = g.members.find((mm) => !(mm.member.needsGuardian || mm.member.needsCaregiver))?.member
    const isDep = !!g.label && !!dep && memberId === dep.id
    setCheckedMemberIds((prev) => {
      const s = new Set(prev)
      const key = memKey(gi, memberId)
      if (s.has(key)) {
        s.delete(key)
        // Deselecting the guardian/caregiver also drops the dependent (can't be alone).
        if (g.label && !isDep && dep) s.delete(memKey(gi, dep.id))
      } else {
        s.add(key)
        if (g.label) {
          // Selecting the guardian/caregiver selects the dependent too (reserve together).
          if (!isDep && dep) s.add(memKey(gi, dep.id))
          // Selecting the dependent requires its guardian/caregiver.
          if (isDep && lead) s.add(memKey(gi, lead.id))
        }
      }
      return s
    })
  }
  /** Header checkbox: select (or deselect) every member. Selection only — no holds. */
  function hostSelectAll() {
    setCheckedMemberIds(allHostChecked ? new Set() : new Set(allHostKeys))
  }
  /** Cancel (✕) a group's hold — releases the seats. Selection is left untouched. */
  function cancelHold(gi: number) {
    setHolds((prev) => { const n = new Map(prev); n.delete(gi); return n })
  }
  function handleHostConfirm() {
    if (holds.size === 0) { showToast('Reserve at least one group before confirming.'); return }
    const host = liveCities.find((c) => c.type === 'host')
    if (host) {
      confirmCityAction(host)
      const map = new Map<number, LiveCity>()
      holds.forEach((_, gi) => { if (groups[gi]?.members.some((mm) => checkedMemberIds.has(memKey(gi, mm.member.id)))) map.set(gi, host) })
      setGroupCityMap(map)
      persistGroupCities(map)
    }
    if (id) setActiveMiqaat(id)
    finishCity()
  }

  /** Persist group → city so the City Allocation view can rebuild the allocation later. */
  function persistGroupCities(map: Map<number, LiveCity>) {
    const rec: Record<string, { id: string; name: string; type: 'host' | 'relay' }> = {}
    map.forEach((c, gi) => { rec[gi] = { id: c.id, name: c.name, type: c.type } })
    setGroupCities(rec)
  }

  /** Same-day-flow only: persist group → zone so the Zone Allocation view can rebuild it later.
   *  Each group's own assigned city (varies per row on this combined screen, unlike ZoneSelection's
   *  single global city) supplies the zone's cityId/cityName. */
  function persistGroupZones(map: Map<number, Zone>) {
    const rec: Record<string, { id: string; name: string; cityId: string; cityName: string }> = {}
    map.forEach((z, gi) => {
      const city = groupCityMap.get(gi)
      if (city) rec[gi] = { id: z.id, name: z.name, cityId: city.id, cityName: city.name }
    })
    setGroupZones(rec)
  }

  // ── Relay availability ─────────────────────────────────────────────────────
  /** Members already allocated to a city (drives the "N added" chip) — excludes dropped members. */
  const addedToCity = (cityId: string) =>
    groups.reduce((sum, _g, gi) => sum + (groupCityMap.get(gi)?.id === cityId ? groupAllocCount(gi) : 0), 0)
  const remainingOf = (city: LiveCity) => city.seatsLeft - addedToCity(city.id)
  /** A city is unavailable once it has no seats left. */
  const cityUnavailable = (city: LiveCity) => remainingOf(city) <= 0
  /** True if any member is flagged not-valid for allocation (eligibility/document issue) — such a
   *  group can't be reserved to ANY city and its status reads "Not valid for allocation". */
  const groupHasFlag = (gi: number): boolean => !!groups[gi]?.members.some((mm) => mm.member.notValidForCity)
  /** A group's STATUS is "Valid for allocation" unless a member is globally flagged. A city that the
   *  admin closed for a member does NOT change status — only the Reserve action for that city. */
  const groupEligible = (gi: number): boolean => !groupHasFlag(gi)
  /** An invited member whose city-selection window hasn't opened yet → "Reservation opens on …". */
  const groupOpensAt = (gi: number): string | undefined => groups[gi]?.members.find((mm) => mm.member.opensAt)?.member.opensAt
  const groupLocation = (gi: number): string | undefined => groups[gi]?.members.find((mm) => mm.member.location)?.member.location
  /** True when the ACTIVE city has been closed by the admin for a member of this group (status stays
   *  valid, but this specific city can't be reserved → "Please choose a different city."). */
  const groupClosedForActive = (gi: number): boolean =>
    !!activeCity && !!groups[gi]?.members.some((mm) => mm.member.closedCities?.includes(activeCity.id))
  /** Can the ACTIVE city take this whole group? Blocked when: globally not-valid, not yet open,
   *  admin-closed for this city, or out of seats. Already-assigned groups stay available. */
  const groupAvailableFor = (gi: number): boolean => {
    if (groupCityMap.has(gi)) return true
    if (!groupEligible(gi)) return false
    if (groupOpensAt(gi)) return false
    if (!activeCity) return true
    if (groupClosedForActive(gi)) return false
    return remainingOf(activeCity) >= groups[gi].members.length
  }
  /** A group that can never be reserved in this session (globally not-valid, or not open yet). Used
   *  by the footer gate so these members don't block "Done". */
  const groupBlocked = (gi: number): boolean => !groupEligible(gi) || !!groupOpensAt(gi)
  /** In-table Reserve → allocate the whole group to the active city (guards with a toast). */
  function reserveGroupToActiveCity(gi: number) {
    if (isAutoGroup(gi) || isLockedGroup(gi)) return // auto-allocated or locked (re-select) — not user-reservable
    if (!activeCity) { showToast('Please select a city first.'); return }
    if (!groupAvailableFor(gi)) { showToast('Please choose a different city.'); return }
    setGroupCityMap((prev) => { const n = new Map(prev); n.set(gi, activeCity); return n })
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      groups[gi]?.members.forEach((m) => n.delete(m.member.id))
      return n
    })
    enqueueReserveTips([gi], activeCity.name)
  }
  /** Remove a group's allocation. */
  function removeGroupCity(gi: number) {
    if (isAutoGroup(gi) || isLockedGroup(gi)) return // auto-allocated or locked (re-select) — can't be removed
    setGroupCityMap((prev) => { const n = new Map(prev); n.delete(gi); return n })
  }

  // ── Swap (change an existing reservation to the newly-selected city) ─────────
  // When a group ALREADY holds a reservation and the user picks a DIFFERENT (usable) city, we do NOT
  // reserve a second seat and do NOT auto-swap — the row surfaces the new city as a "Swap to" option.
  // The reservation only moves once the user clicks it (swapGroupToActiveCity), keeping exactly one
  // confirmed reservation per group at all times.
  /** Can the assigned group `gi` move its reservation to the currently-active city? */
  const canSwapTo = (gi: number): boolean => {
    if (!activeCity || isAutoGroup(gi) || isLockedGroup(gi)) return false
    const cur = groupCityMap.get(gi)
    if (!cur || cur.id === activeCity.id) return false // not assigned, or same city → nothing to swap
    if (groupClosedForActive(gi) || groupOpensAt(gi)) return false
    return remainingOf(activeCity) >= (groups[gi]?.members.length ?? 1)
  }
  /** The city this group can swap TO (the active city), or null when no swap is on offer. */
  const swapTargetFor = (gi: number): LiveCity | null => (canSwapTo(gi) ? activeCity : null)
  /** Move the group's single reservation to the active city (releases the old one). Only fires on an
   *  explicit "Swap to …" click — never automatically. */
  function swapGroupToActiveCity(gi: number) {
    if (!activeCity || !canSwapTo(gi)) { showToast('Please choose a different city.'); return }
    setGroupCityMap((prev) => { const n = new Map(prev); n.set(gi, activeCity); return n })
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      groups[gi]?.members.forEach((m) => n.delete(m.member.id))
      return n
    })
    enqueueReserveTips([gi], activeCity.name)
  }
  /** Every reserved group that can move its reservation to the currently-active city. */
  const swappableGroups = (): number[] => groups.map((_, gi) => gi).filter((gi) => canSwapTo(gi))
  /** Groups currently reserved in a DIFFERENT city than the active one — the candidates a "Swap all"
   *  would move. */
  const reservedElsewhere = (): number[] => groups.map((_, gi) => gi).filter((gi) => {
    const c = groupCityMap.get(gi)
    return !isAutoGroup(gi) && c != null && activeCity != null && c.id !== activeCity.id
  })
  /** "Swap all" shows only when EVERY reserved-elsewhere group can move to the active city. If even one
   *  can't — admin-closed for it (e.g. Sakina → Indore) or out of seats — the bulk swap would silently
   *  skip that member, so it's suppressed and those rows are swapped individually via their own "Swap to". */
  const swapCandidates = reservedElsewhere()
  const anySwappable = activeCity !== null && swapCandidates.length > 0 && swapCandidates.every((gi) => canSwapTo(gi))
  /** Swap EVERY eligible group's reservation to the active city in one action. Respects the active
   *  city's remaining capacity (swaps as many whole groups as will fit). Plays a tooltip per group. */
  function swapAllToActiveCity() {
    if (!activeCity) { showToast('Please select a city first.'); return }
    const targets = swappableGroups()
    if (targets.length === 0) { showToast('No reservations to swap.'); return }
    // Groups being swapped are currently in OTHER cities, so the active city must fit them all together.
    let remaining = remainingOf(activeCity)
    const chosen: number[] = []
    for (const gi of targets) {
      const size = groups[gi]?.members.length ?? 1
      if (remaining >= size) { chosen.push(gi); remaining -= size }
    }
    if (chosen.length === 0) { showToast('This city is full — choose another.'); return }
    setGroupCityMap((prev) => { const n = new Map(prev); chosen.forEach((gi) => n.set(gi, activeCity)); return n })
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      chosen.forEach((gi) => groups[gi]?.members.forEach((m) => n.delete(m.member.id)))
      return n
    })
    enqueueReserveTips(chosen, activeCity.name)
  }

  // ── Relay city dropdown (per-group city picker) ────────────────────────────
  // With an Arrange-My-Cities layout, the non-host list follows it exactly: preferred-slot cities
  // first (they render in the "My Preferred City" card on desktop / lead the chips on mobile), then
  // the relay cities in the arranged order — the displaced real host included, if the user moved it
  // out of the host slot. Without a layout this stays the plain seed-ordered relay list.
  const relayCities = arrangement
    ? [...arrangement.preferredCityIds, ...arrangement.relayCityIds]
        .map((cid) => cityById(cid))
        .filter((c): c is LiveCity => !!c && c.id !== hostCityId)
    : liveCities.filter((c) => c.type === 'relay')
  // Order the mobile relay chips so the active city (e.g. one picked from "View all") and any city that
  // already holds members sit at the front — otherwise a pick far down the list stays scrolled out of
  // view in the horizontal strip and reads as "nothing happened". Stable sort keeps the rest in order.
  // Preferred cities are excluded here too (they now get their own "My Preferred City" chip row above,
  // mirroring the desktop de-dupe between MyPreferredCityCard and RelaySidebarCard).
  const relayChipOrder = relayCities
    .filter((c) => !preferredRelayIds.has(c.id))
    .sort((a, b) => {
      const rank = (c: LiveCity) => (activeCity?.id === c.id ? 0 : addedToCity(c.id) > 0 ? 1 : 2)
      return rank(a) - rank(b)
    })
  /** A relay city can take a group if it has room for the whole group (or already holds it). */
  const relayCityFitsGroup = (c: LiveCity, gi: number): boolean =>
    groupCityMap.get(gi)?.id === c.id || remainingOf(c) >= (groups[gi]?.members.length ?? 1)
  /** Allocate a group to a specific relay city chosen from the dropdown. */
  function setGroupCity(gi: number, city: LiveCity) {
    setGroupCityMap((prev) => { const n = new Map(prev); n.set(gi, city); return n })
    setRelayDropdown(null)
  }

  function handleGroupToggle(gi: number) {
    if (isAutoGroup(gi) || isLockedGroup(gi)) return // auto-allocated or locked (re-select)
    if (!activeCity && !groupCityMap.has(gi)) return
    if (!groupCityMap.has(gi) && !groupAvailableFor(gi)) return // active city can't fit this group
    const next = new Map(groupCityMap)
    if (next.has(gi)) next.delete(gi)
    else if (activeCity) next.set(gi, activeCity)
    setGroupCityMap(next)
    // Reset any dropped members for this group on (de)allocation.
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      groups[gi]?.members.forEach((m) => n.delete(m.member.id))
      return n
    })
  }

  /** Per-member relay toggle: the group's lead controls the whole group, but the dependent
   *  can be deselected independently (and can never be allocated without its lead). */
  function toggleRelayMember(gi: number, memberId: string) {
    const g = groups[gi]; if (!g) return
    const dep = g.members.find((mm) => mm.member.needsGuardian || mm.member.needsCaregiver)?.member
    const isDep = !!g.label && !!dep && memberId === dep.id
    // Guard: a member can't be allocated before a relay city is chosen — toast instead of a no-op.
    if (!groupCityMap.has(gi) && !activeCity) { showToast('Please select a relay city first.'); return }
    if (!groupCityMap.has(gi)) { handleGroupToggle(gi); return } // not allocated → allocate whole group
    if (isDep) {
      setDroppedMembers((prev) => {
        const n = new Set(prev)
        if (n.has(memberId)) n.delete(memberId); else n.add(memberId)
        return n
      })
    } else {
      handleGroupToggle(gi) // the lead controls the group
    }
  }

  function handleSelectAll() {
    if (!activeCity) { showToast('Please select a relay city first.'); return }
    // Auto-allocated groups sit outside "select all" entirely — never toggled on/off by it.
    const assignable = groups.map((_, gi) => gi).filter((gi) => groupAvailableFor(gi) && !isAutoGroup(gi))
    const allAssigned = assignable.length > 0 && assignable.every((gi) => groupCityMap.has(gi))
    setDroppedMembers(new Set())
    const next = new Map(groupCityMap)
    if (allAssigned) {
      assignable.forEach((gi) => next.delete(gi))
      setGroupCityMap(next)
    } else {
      // Collect the groups newly reserved by this bulk action so each gets its own sequential tooltip.
      const newlyReserved: number[] = []
      assignable.forEach((gi) => { if (!next.has(gi)) { next.set(gi, activeCity!); newlyReserved.push(gi) } })
      setGroupCityMap(next)
      enqueueReserveTips(newlyReserved, activeCity!.name)
    }
  }

  function handleReserve() {
    if (totalAllocated === 0) { showToast('Allocate at least one member to a city before reserving.'); return }
    const firstCity = [...groupCityMap.values()][0] ?? activeCity ?? liveCities[0]
    if (isRequest) {
      // Missed-deadline path: file a city request with the chosen city, pending admin approval. In
      // re-select mode the already-allocated (locked) groups are NOT part of the request — only the
      // registrant's own newly-picked city is, so the request reads "requested Colombo", not the
      // locked members' cities too.
      const requestCities = [...groupCityMap.entries()].filter(([gi]) => !isLockedGroup(gi)).map(([, c]) => c)
      const reqFirst = requestCities[0] ?? firstCity
      const cities = [...new Set(requestCities.map((c) => c.name))]
      let label = cities.length ? cities.join(', ') : reqFirst?.name ?? ''
      // Modify-city-zone requests the ZONE too (the combined picker lets the user choose both) —
      // otherwise the zone they just picked would silently vanish once this becomes a pending request
      // instead of an immediate confirm. City Selection's own plain city-only request (not modify mode)
      // is untouched — `zonesArr` stays undefined there, same label/payload as before.
      let zonesArr: Array<{ cityId: string; cityName: string; zoneId: string; zoneName: string }> | undefined
      if (modifyCityZone) {
        const byCity = new Map<string, { cityId: string; cityName: string; zoneId: string; zoneName: string }>()
        groupCityMap.forEach((c, gi) => {
          if (isLockedGroup(gi) || byCity.has(c.id)) return
          const z = groupZoneMap.get(gi)
          byCity.set(c.id, { cityId: c.id, cityName: c.name, zoneId: z?.id ?? '', zoneName: z?.name ?? '' })
        })
        zonesArr = [...byCity.values()]
        label = zonesArr.map((z) => (z.zoneName ? `${z.cityName} — ${z.zoneName}` : z.cityName)).join(', ')
      }
      if (id && reqFirst) requestReopen(id, 'city', `City Selection — requested ${label}`, { cityId: reqFirst.id, zoneId: zonesArr?.[0]?.zoneId || undefined, label, zones: zonesArr })
      const msg = returnTo
        ? `Your city selection request for ${label} has been submitted for approval. Track it under Ask Help.`
        : `Your city selection request for ${label} has been submitted for approval. You'll find it in the Requested section below.`
      nav(returnTo ?? '/miqaats', { state: { requestSent: msg } })
      return
    }
    if (firstCity) confirmCityAction(firstCity)
    persistGroupCities(groupCityMap)
    // Same-day-flow: commit zones alongside cities — this screen replaces the separate Zone
    // Selection step entirely, so both need to land in the store together.
    if (showCombined) {
      const firstZone = [...groupZoneMap.values()][0]
      if (firstZone && firstCity) confirmZoneAction(firstZone, firstCity.id, firstCity.name)
      persistGroupZones(groupZoneMap)
    }
    if (id) setActiveMiqaat(id)
    finishCity()
  }

  /** After confirming the city: same-day events land on the combined city+zone confirmation
   *  (everything needed is already in hand — see handleReserve above); everyone else lands on the
   *  in-screen City-confirmed summary. */
  function finishCity() {
    // Modify-city-zone: the change is applied immediately (confirmCity/confirmZone above) → return to
    // Modify Reservation with a one-shot success popup, instead of the in-screen confirmation view.
    if (modifyCityZone) { nav(returnTo ?? `/miqaats/${id}/manage`, { state: { cityZoneUpdated: true } }); return }
    if (isSameDayFlow) setView('success-zone')
    else setView('success')
  }

  /** The footer CTA is always enabled; the gate is enforced on click instead. Members who can never
   *  be reserved (globally not-valid, or an invited member not open yet) don't block "Done". */
  const allocatableIdx = groups.map((_, gi) => gi).filter((gi) => !groupBlocked(gi))
  const anyAllocated = allocatableIdx.some((gi) => groupCityMap.has(gi))
  const allAllocatableAllocated = allocatableIdx.length > 0 && allocatableIdx.every((gi) => groupCityMap.has(gi))
  // Same-day-flow only: every allocatable group also needs a zone before Confirm is allowed, since
  // there's no later Zone Selection step to pick it up.
  const allAllocatableZoned = !showCombined || (allocatableIdx.length > 0 && allocatableIdx.every((gi) => groupZoneMap.has(gi)))

  // ── Bulk zone ("Set all") ────────────────────────────────────────────────────
  // Groups the bulk action can legitimately cover: allocated to the SAME city the dropdown's zone
  // list came from. A zone belongs to exactly one city, so a party split across cities must not
  // have one zone stamped across all of it — those groups keep their own per-row dropdown.
  const zoneAllCity = zoneDropdown?.gi === ZONE_ALL_GI
    ? (groupCityMap.get(allocatableIdx.find((gi) => groupCityMap.has(gi)) ?? -1) ?? activeCity)
    : null
  const bulkZoneTargets = (city: LiveCity | null) =>
    city ? allocatableIdx.filter((gi) => groupCityMap.get(gi)?.id === city.id) : []
  const canSetAllZones = allocatableIdx.some((gi) => groupCityMap.has(gi))
  /** Apply one zone to every group already allocated to that zone's city. */
  function setZoneForAll(zone: Zone, city: LiveCity | null) {
    const targets = bulkZoneTargets(city)
    if (targets.length === 0) return
    setGroupZoneMap((prev) => {
      const n = new Map(prev)
      targets.forEach((gi) => n.set(gi, zone))
      return n
    })
    setZoneDropdown(null)
  }
  function handleDone() {
    if (!anyAllocated) { showToast('Please allocate at least one member to a city before continuing.'); return }
    if (!allAllocatableAllocated) { showToast('Please allocate the remaining members before continuing.'); return }
    if (!allAllocatableZoned) { showToast('Please select a zone for every reserved member before continuing.'); return }
    handleReserve()
  }

  // ── Queue screens ────────────────────────────────────────────────────────────
  if (view === 'queue-waiting') return <QueueWaiting countdown={queueCountdown} />
  if (view === 'queue-active') return <QueueActive onContinue={() => setView('browse')} />

  // ── Success ──────────────────────────────────────────────────────────────────
  if (view === 'success') {
    const byCityMap = new Map<string, { city: LiveCity; groupIndices: number[] }>()
    groupCityMap.forEach((city, gi) => {
      if (!byCityMap.has(city.id)) byCityMap.set(city.id, { city, groupIndices: [] })
      byCityMap.get(city.id)!.groupIndices.push(gi)
    })
    const cityGroups = [...byCityMap.values()]

    // Exclude dropped members (dependents opted out) from the confirmed allocation.
    const stripDropped = (g: Group): Group => ({ ...g, members: g.members.filter((m) => !droppedMembers.has(m.member.id)) })
    const allocatedSections = cityGroups.map(({ city, groupIndices }) => ({
      name: city.name,
      typeLabel: (city.type === 'host' ? 'Host City' : 'Relay City') as 'Host City' | 'Relay City',
      count: groupIndices.reduce((n, gi) => n + groupAllocCount(gi), 0),
      groups: groupIndices.map((gi) => groups[gi]).filter(Boolean).map(stripDropped).filter((g) => g.members.length > 0),
    }))

    // Invited/added members from a city that opens later → shown as an "Opening later" list (they
    // couldn't be reserved yet, so they're NOT counted as "unallocated").
    const isForeignGroup = (gi: number) => !!groups[gi]?.members.some((m) => m.member.opensAt)
    const opensLaterList: OpensLaterInfo[] = groups.flatMap((g, gi) =>
      groupCityMap.has(gi)
        ? []
        : g.members
            .filter((m) => m.member.opensAt)
            .map((m) => ({ location: m.member.location ?? 'Their city', opensAt: m.member.opensAt!, name: m.member.name })))

    // Members still without a city: whole groups never allocated + individuals opted out of an
    // allocated group. They stay visible so the user knows who still needs allocating. (Foreign
    // "opens later" groups are excluded — they show in the "Opening later" list instead.)
    const stage: ConfirmStage = cityType === 'host' ? 'host' : 'relay'
    const unallocatedGroups: Group[] = groups
      .map((g, gi): Group | null => {
        if (!groupCityMap.has(gi)) return isForeignGroup(gi) ? null : g
        const dropped = g.members.filter((m) => droppedMembers.has(m.member.id))
        return dropped.length ? { ...g, label: undefined, members: dropped } : null
      })
      .filter((g): g is Group => g !== null)
    const unallocatedCount = unallocatedGroups.reduce((n, g) => n + g.members.length, 0)
    const confirmedSections =
      unallocatedCount > 0
        ? [
            ...allocatedSections,
            { name: 'Not allocated', count: unallocatedCount, groups: unallocatedGroups, unallocated: true, statusText: notAllocatedLabel(stage) },
          ]
        : allocatedSections
    // The "you can still allocate them until …" notice is only relevant for members who CAN yet be
    // allocated — a not-valid group can never be, so it doesn't trigger the notice (it still shows in
    // the list with its "Not valid for allocation" status).
    const isNotValidGroup = (gi: number) => !!groups[gi]?.members.some((m) => m.member.notValidForCity)
    const allocatableUnallocatedCount = groups.reduce((n, g, gi) => {
      if (groupCityMap.has(gi)) return n + g.members.filter((m) => droppedMembers.has(m.member.id)).length
      if (isForeignGroup(gi) || isNotValidGroup(gi)) return n
      return n + g.members.length
    }, 0)
    const unallocatedNotice = allocatableUnallocatedCount > 0 ? { stage, closesAt: allocationCloses[stage] } : null

    const successFooter = (
      <StickyFooter
        caption={t('City confirmed')}
        title={t('{n} members allocated', { n: totalAllocated })}
        button="Go home"
        onButton={() => nav('/miqaats')}
      />
    )

    return (
      <PhoneScreen footer={<div className="sm:hidden">{successFooter}</div>}>
        <AppBar notificationCount={3} />

        {/* ═══════════════════════ DESKTOP — two-panel confirmed ═══════════════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <ConfirmedView
            title={t('City Confirmed')}
            footerCaption={t('City confirmed')}
            infoLabel={t('Zone selection open')}
            infoValue={<><DateLine value="15 June 2026" hijri={false} />{', '}<TimeLine value="09:00 AM IST" /></>}
            membersAllocated={totalAllocated}
            sections={confirmedSections}
            unallocatedNotice={unallocatedNotice}
            opensLater={opensLaterList}
            onBack={() => nav('/miqaats')}
            onDone={() => nav('/miqaats')}
          />
        </div>

        {/* ═══════════════════════ MOBILE — unchanged single-column flow ═══════════════════════ */}
        <div className="contents sm:hidden">
        <button
          type="button"
          onClick={() => nav('/miqaats')}
          className="mx-[16px] sm:mx-0 mt-[14px] flex items-center gap-[5px] text-[13px] text-[#5a6660]"
          style={{ fontFamily: FONT }}
        >
          <svg viewBox="0 0 16 16" fill="none" className="size-[14px]">
            <path d="M2.5 7.5L8 2.5l5.5 5M4 6.5V13h8V6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          
          {t('Go Home')}
        </button>

        <div className="flex flex-col items-center px-[16px] pt-[24px] pb-[20px] sm:px-0">
          <div className="mb-[14px] size-[56px] rounded-full bg-[#1f5a44] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="size-[28px]">
              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-[26px] leading-[32px] text-[#1f5a44] text-center" style={{ fontFamily: SERIF }} {...tx('City Confirmed')} />
        </div>

        <div className="mx-[16px] sm:mx-0 overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
          <div className="flex items-center justify-between px-[16px] py-[14px] border-b border-[#f0ebe0]">
            <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Registration status')} />
            <span className="inline-flex items-center gap-[5px] rounded-full px-[10px] py-[3px] text-[12px] font-bold" style={{ background: '#e4efe7', color: '#276245', fontFamily: FONT }}>
              <span className="size-[6px] rounded-full bg-[#276245]" />{t('Allocated')}
            </span>
          </div>
          <div className="flex items-center justify-between px-[16px] py-[14px] border-b border-[#f0ebe0]">
            <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Zone selection open')} />
            <span className="text-[13px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}><DateLine value="15 June 2026" hijri={false} />{', '}<TimeLine value="09:00 AM IST" /></span>
          </div>
          <div className="flex items-center justify-between px-[16px] py-[14px]">
            <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Members allocated')} />
            <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
              {String(totalAllocated).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* City-grouped member sections */}
        <div className="mx-[16px] sm:mx-0 mt-[20px] mb-[100px]">
          {cityGroups.map(({ city, groupIndices }) => {
            const { t } = useT()
            const cityMemberCount = groupIndices.reduce((n, gi) => n + groupAllocCount(gi), 0)
            return (
              <div key={city.id} className="mb-[20px]">
                <div className="flex items-center gap-[6px] mb-[10px]">
                  <svg viewBox="0 0 24 24" fill="none" className="size-[16px] shrink-0 text-[#1f5a44]">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(city.name)} />
                  <span className="inline-flex h-[20px] items-center rounded-full px-[9px] text-[10px] font-bold tracking-[0.3px]" style={{ fontFamily: FONT, background: city.type === 'host' ? '#f7efd6' : '#e1eef1', color: city.type === 'host' ? '#a8843e' : '#2e6a7d' }}>
                    {city.type === 'host' ? t('Host City') : t('Relay City')}
                  </span>
                  <span className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>· <Iso>{t(plural(cityMemberCount, '{n} member', '{n} members'), { n: cityMemberCount })}</Iso></span>
                </div>
                {/* Mobile cards */}
                <div className="flex flex-col gap-[10px] sm:hidden">
                  {groupIndices.map((gi) => groups[gi] && stripDropped(groups[gi]).members.length > 0 && <SuccessGroupCard key={gi} group={stripDropped(groups[gi])} />)}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
                  <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '54%' }} /><col style={{ width: '22%' }} /><col />
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#faf8f2' }}>
                        {[t('Member'), 'Role', 'Raza Status'].map((h) => (
                          <th key={h} className="px-[16px] py-[12px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    {groupIndices.map((gi) => {
                      const { t } = useT()
                      const g = groups[gi]
                      if (!g) return null
                      const linked = !!g.label
                      const hasConnector = g.members.length > 1
                      return (
                        <tbody key={gi}>
                          {linked && (
                            <tr style={{ borderTop: '1px solid #e7dfc9', background: '#e1eef1' }}>
                              <td colSpan={3} className="px-[16px] py-[8px]">
                                <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}><LinkGlyph color="#2e6a7d" />{t(bandLabel(g.label!))}</span>
                              </td>
                            </tr>
                          )}
                          {g.members.map((mm, mi) => {
                            const { t, tdText } = useT()
                            const isFirst = mi === 0
                            const isLast = mi === g.members.length - 1
                            return (
                              <tr key={mm.member.id} style={{ borderTop: linked ? undefined : '1px solid #e7dfc9', background: 'white' }}>
                                <td className="relative px-[16px] py-[12px]">
                                  {hasConnector && (
                                    <span className="pointer-events-none absolute start-[31px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                                  )}
                                  <div className="relative flex items-center gap-[10px]">
                                    <Avatar name={mm.member.name} size={32} />
                                    <div className="min-w-0">
                                      <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                                      <p className="text-[12px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-[16px] py-[12px]">{mm.badge ? <RoleBadge kind={mm.badge} /> : null}</td>
                                <td className="px-[16px] py-[12px]">
                                  <span className="flex items-center gap-[5px] text-[13px] font-bold text-[#b8821e]" style={{ fontFamily: FONT }}>
                                    <span className="size-[6px] shrink-0 rounded-full bg-[#f59e0b]" />{t('Pending')}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      )
                    })}
                  </table>
                </div>
              </div>
            )
          })}

          {/* Members still awaiting a city — shown as cards so they stay visible */}
          {unallocatedCount > 0 && (
            <div className="mb-[20px]">
              <div className="mb-[10px] flex items-center gap-[6px]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[16px] shrink-0">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#d2632b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[15px] font-bold text-[#8a4b22]" style={{ fontFamily: FONT }} {...tx('Not allocated')} />
                <span className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>· <Iso>{t(plural(unallocatedCount, '{n} member', '{n} members'), { n: unallocatedCount })}</Iso></span>
              </div>
              <div className="flex flex-col gap-[10px]">
                {unallocatedGroups.map((g, i) => (
                  <SuccessGroupCard key={`u${i}`} group={g} statusText={notAllocatedLabel(stage)} />
                ))}
              </div>
            </div>
          )}
          {/* Invited/added members whose city opens later */}
          {opensLaterList.length > 0 && (
            <div className="mb-[20px]">
              <div className="mb-[10px] flex items-center gap-[6px]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[16px] shrink-0"><circle cx="12" cy="12" r="9" stroke="#8a5a1a" strokeWidth="1.75" /><path d="M12 7.5V12l3 2" stroke="#8a5a1a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="text-[15px] font-bold text-[#8a5a1a]" style={{ fontFamily: FONT }} {...tx('Opening later')} />
                <span className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>· {opensLaterList.length} member{opensLaterList.length > 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-col gap-[10px]">
                {opensLaterList.map((o, i) => <OpensLaterNotice key={i} {...o} />)}
              </div>
            </div>
          )}
          {unallocatedNotice && <UnallocatedNotice stage={unallocatedNotice.stage} closesAt={unallocatedNotice.closesAt} />}
        </div>
        </div>{/* ── end mobile ── */}
      </PhoneScreen>
    )
  }

  // ── Success — same-day flow (combined city + zone) ────────────────────────────
  // Mirrors ZoneSelection.tsx's own 'success' view (grouped by zone), the one difference being that
  // each zone-group's city comes from THIS screen's own `groupCityMap` (city varies per row here)
  // instead of a single flow-wide confirmed city.
  if (view === 'success-zone') {
    const byZone = new Map<string, { zone: Zone; groupIndices: number[] }>()
    for (const [gIdx, zone] of groupZoneMap) {
      const ex = byZone.get(zone.id)
      if (ex) ex.groupIndices.push(gIdx)
      else byZone.set(zone.id, { zone, groupIndices: [gIdx] })
    }
    const zoneGroups = [...byZone.values()]

    const stripDroppedZ = (g: Group): Group => ({ ...g, members: g.members.filter((m) => !droppedMembers.has(m.member.id)) })
    const tagOf = (t?: 'host' | 'relay') => (t === 'host' ? 'Host City' : t === 'relay' ? 'Relay City' : undefined) as 'Host City' | 'Relay City' | undefined
    const allocatedSectionsZ = zoneGroups.map(({ zone, groupIndices }) => {
      // Every group in a zone shares the same city — read it from the first group's own allocation.
      const city = groupCityMap.get(groupIndices[0])
      return {
        name: zone.name,
        cityName: city?.name ?? '',
        typeLabel: tagOf(city?.type),
        count: groupIndices.reduce((n, gi) => n + groupAllocCount(gi), 0),
        groups: groupIndices.map((gi) => groups[gi]).filter(Boolean).map(stripDroppedZ).filter((g) => g.members.length > 0),
      }
    })

    const unallocatedGroupsZ: Group[] = groups
      .map((g, gi): Group | null => {
        if (!groupZoneMap.has(gi)) return g
        const dropped = g.members.filter((m) => droppedMembers.has(m.member.id))
        return dropped.length ? { ...g, label: undefined, members: dropped } : null
      })
      .filter((g): g is Group => g !== null)
    const unallocatedCountZ = unallocatedGroupsZ.reduce((n, g) => n + g.members.length, 0)
    const confirmedSectionsZ =
      unallocatedCountZ > 0
        ? [...allocatedSectionsZ, { name: 'Not allocated', count: unallocatedCountZ, groups: unallocatedGroupsZ, unallocated: true, statusText: notAllocatedLabel('zone') }]
        : allocatedSectionsZ
    const allocatableUnallocatedCountZ = unallocatedGroupsZ.reduce(
      (n, g) => (g.members.some((m) => m.member.notValidForCity) ? n : n + g.members.length), 0,
    )
    const unallocatedNoticeZ = allocatableUnallocatedCountZ > 0 ? { stage: 'zone' as const, closesAt: allocationCloses.zone } : null

    const successZoneFooter = (
      <StickyFooter
        caption={t('Zone confirmed')}
        title={t('{n} members allocated', { n: totalAllocated || totalMembers })}
        button="Go home"
        onButton={() => nav('/miqaats')}
      />
    )

    return (
      <PhoneScreen footer={<div className="sm:hidden">{successZoneFooter}</div>}>
        <AppBar notificationCount={3} />

        {/* ═══════════════════════ DESKTOP — two-panel confirmed ═══════════════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <ConfirmedView
            title={t('Zone Confirmed')}
            footerCaption="Zone confirmed"
            reference={flow.referenceNumber ?? 'MIQ-23106'}
            infoLabel={t('Raza issues on')}
            infoValue={<><DateLine value="15 June 2026" hijri={false} />{', '}<TimeLine value="09:00 AM IST" /></>}
            membersAllocated={totalAllocated || totalMembers}
            sections={confirmedSectionsZ}
            unallocatedNotice={unallocatedNoticeZ}
            onBack={() => nav('/miqaats')}
            onDone={() => nav('/miqaats')}
          />
        </div>

        {/* ═══════════════════════ MOBILE — unchanged single-column flow ═══════════════════════ */}
        <div className="contents sm:hidden">
        <button
          type="button"
          onClick={() => nav('/miqaats')}
          className="mx-[16px] sm:mx-0 mt-[12px] flex items-center gap-[4px]"
          style={{ fontFamily: FONT }}
        >
          <svg viewBox="0 0 16 16" fill="none" className="size-[14px]">
            <path d="M2.5 7.5L8 2.5l5.5 5M4 6.5V13h8V6.5" stroke="#5a6660" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[13px] font-medium text-[#5a6660]" {...tx('Go Home')} />
        </button>

        <div className="flex flex-col items-center mt-[20px] mb-[20px]">
          <div className="size-[56px] rounded-full bg-[#1f5a44] flex items-center justify-center mb-[12px]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[28px]">
              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-[26px] leading-[34px] text-[#1f5a44]" style={{ fontFamily: SERIF }} {...tx('Zone Confirmed')} />
        </div>

        <div className="mx-[16px] sm:mx-0 overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white mb-[20px]">
          <div className="flex items-center justify-between px-[14px] py-[12px] border-b border-[#f0ebe0]">
            <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Registration status')} />
            <span
              className="inline-flex items-center gap-[5px] rounded-full px-[10px] py-[3px] text-[11px] font-bold"
              style={{ background: '#e4efe7', color: '#276245', fontFamily: FONT }}
            >
              <span className="size-[5px] rounded-full bg-[#276245]" />
              <span {...tx('Allocated')} />
            </span>
          </div>
          <div className="flex items-center justify-between px-[14px] py-[12px] border-b border-[#f0ebe0]">
            <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }}>{t('Raza issues on')}</span>
            <span className="text-[13px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
              <DateLine value="15 June 2026" hijri={false} />{', '}<TimeLine value="09:00 AM IST" />
            </span>
          </div>
          <div className="flex items-center justify-between px-[14px] py-[12px]">
            <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Members allocated')} />
            <span className="text-[13px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
              {String(totalAllocated || totalMembers).padStart(2, '0')}
            </span>
          </div>
        </div>

        <div className="mx-[16px] sm:mx-0 mb-[100px] flex flex-col gap-[16px] sm:hidden">
          {zoneGroups.map(({ zone, groupIndices }) => {
            const city = groupCityMap.get(groupIndices[0])
            return (
              <div key={zone.id}>
                <div className="mb-[8px] flex flex-wrap items-center gap-x-[6px] gap-y-[4px]">
                  <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(city?.name ?? '')} />
                  {city?.type && <CityKindTag type={city.type} />}
                  <span className="text-[13px] font-bold text-[#5a6660]" style={{ fontFamily: FONT }}>· <bdi {...td(zone.name)} /></span>
                  <span className="text-[13px] font-normal text-[#8a938e]" style={{ fontFamily: FONT }} {...tx(plural(groupIndices.reduce((sum, i) => sum + groupAllocCount(i), 0), '· {n} member', '· {n} members'), { n: groupIndices.reduce((sum, i) => sum + groupAllocCount(i), 0) })} />
                </div>
                <div className="flex flex-col gap-[8px]">
                  {groupIndices.map((gIdx) => groups[gIdx] && stripDroppedZ(groups[gIdx]).members.length > 0 && (
                    <SuccessGroupCard key={gIdx} group={stripDroppedZ(groups[gIdx])} />
                  ))}
                </div>
              </div>
            )
          })}

          {unallocatedCountZ > 0 && (
            <div>
              <p className="mb-[8px] flex items-center gap-[6px] text-[13px] font-bold text-[#8a4b22]" style={{ fontFamily: FONT }}>
                <svg viewBox="0 0 24 24" fill="none" className="size-[15px] shrink-0">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#d2632b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                
                {t('Not allocated')}
                <span className="font-normal text-[#8a938e]">· {unallocatedCountZ} members</span>
              </p>
              <div className="flex flex-col gap-[8px]">
                {unallocatedGroupsZ.map((g, i) => (
                  <SuccessGroupCard key={`u${i}`} group={g} statusText={notAllocatedLabel('zone')} />
                ))}
              </div>
            </div>
          )}
          {unallocatedNoticeZ && <UnallocatedNotice stage={unallocatedNoticeZ.stage} closesAt={unallocatedNoticeZ.closesAt} />}
        </div>
        </div>{/* ── end mobile ── */}
      </PhoneScreen>
    )
  }

  // ── Browse ────────────────────────────────────────────────────────────────────

  const allGroupsAssigned = groups.length > 0 && groups.every((_, gi) => groupCityMap.has(gi) || !groupAvailableFor(gi))
  // "Reserve all" only ever shows once a city is picked, and only while the CURRENT selection works for
  // everyone — it hides the moment any group can't take that city: globally ineligible (`notValidForCity`),
  // admin-closed for this city (`closedCities`, e.g. Sakina → Indore), or the city is full. A bulk action
  // that would silently skip a "Not Available" member is more confusing than handling that row on its own.
  const anyUnavailableForActive = activeCity !== null && groups.some((_, gi) =>
    !isAutoGroup(gi) && !groupCityMap.has(gi) && !groupOpensAt(gi) && !groupAvailableFor(gi))
  // Also hide "Reserve all" while any member is already reserved in a DIFFERENT city than the current
  // selection (a swap is pending). A bulk reserve there would be ambiguous — does it swap them or not?
  // Those members are moved one at a time via their explicit "Swap to" action instead.
  const anySwapPending = activeCity !== null && groups.some((_, gi) => {
    const c = groupCityMap.get(gi)
    return !isAutoGroup(gi) && c != null && c.id !== activeCity!.id
  })
  const showReserveAll = activeCity !== null && !anyUnavailableForActive && !anySwapPending
  // The active city is a non-preferred relay city → its own "Relay city (N)" card now carries an
  // inline Reserve/Remove all (mirrors the Host city card), so the external button would duplicate it.
  // A *preferred* relay city (shown in `MyPreferredCityCard`, which has no such header) still needs it.
  const activeInRelayGrid = activeCity?.type === 'relay' && !preferredRelayIds.has(activeCity.id)
  // The active city is a preferred pick → `MyPreferredCityCard` (desktop only) now carries its own
  // inline Reserve/Remove all, so the external desktop button would duplicate it. Mobile has no
  // preferred-city card, so its external button still covers this case.
  const activeInPreferredCard = activeCity !== null && preferredRelayIds.has(activeCity.id)
  // The Host City card renders whichever city the Arrange-My-Cities layout put in the host slot
  // (the real host by default). Selection semantics still come from the city object itself.
  const hostCity = (hostCityId ? cityById(hostCityId) : undefined) ?? liveCities.find((c) => c.type === 'host')
  // Lets "My Preferred City" match the user's ranked picks against this event's actual live cities.
  const liveById = new Map(liveCities.map((c) => [c.id, c]))
  // Same preferred list, resolved to LiveCity, for the mobile "My Preferred City" chip row (mirrors
  // MyPreferredCityCard's own per-city fallback for a pick that isn't in this event's live cities).
  const preferredMobileCities: LiveCity[] = preferredCities
    .filter((c) => c.id !== hostCity?.id)
    .map((c) => liveById.get(c.id) ?? { id: c.id, name: c.name, region: c.region, type: c.type ?? 'relay', seatsLeft: 999, totalSeats: 999 })

  const browseFooter = (
    <StickyFooter
      dataTour="city-confirm"
      caption={isRequest ? t('Request') : t('Allocation')}
      title={isRequest ? t('Submit for approval') : t('Close in {time}', { time: fmtHHMMSS(allocationTimer) })}
      button={isRequest ? 'Request' : t('Done')}
      onButton={handleDone}
      buttonDisabled={false}
    >
      {/* Allocated count + "Who's in which city" — mobile only (web shows the full table already) */}
      {totalAllocated > 0 && (
        <div className="flex items-center justify-between mb-[8px] px-[2px] sm:hidden">
          <div className="flex items-center gap-[5px]">
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px]">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM2 8a2 2 0 114 0 2 2 0 01-4 0zM15.5 17c0-2.21-2.46-4-5.5-4s-5.5 1.79-5.5 4M17 17c0-1.54-1.12-2.87-2.75-3.5M3 17c0-1.54 1.12-2.87 2.75-3.5" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[14px] font-bold text-[#15402f]" style={{ fontFamily: FONT }}>{totalAllocated}/{totalMembers}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowWhosInWhichCity(true)}
            className="flex items-center gap-[5px] rounded-full border border-[#23302a] px-[12px] h-[32px]"
          >
            <span className="text-[12px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...tx('Who\'s in which city')} />
            <svg viewBox="0 0 16 16" fill="none" className="size-[10px]">
              <path d="M4 10l4-4 4 4" stroke="#23302a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </StickyFooter>
  )

  // Desktop footer (sits inside the right panel; no mobile-only "who's in which city" row).
  const desktopFooter = (
    <StickyFooter
      dataTour="city-confirm"
      caption={isRequest ? t('Request') : t('Allocation')}
      title={isRequest ? t('Submit for approval') : t('Close in {time}', { time: fmtHHMMSS(allocationTimer) })}
      button={isRequest ? 'Request' : t('Done')}
      onButton={handleDone}
      buttonDisabled={false}
    />
  )

  return (
    <>
      {/* Leave-city confirmation — back/Go-back while allocating (web modal / mobile sheet) */}
      <LeaveCityConfirmSheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => { setLeaveOpen(false); leaveActionRef.current() }}
      />
      <Toast toast={toast} />
      <ReserveTip tip={activeTip} />
      <PhoneScreen footer={<div className="sm:hidden">{browseFooter}</div>}>
        <AppBar notificationCount={3} />

        {/* ═══════════════════════ MOBILE — unchanged single-column flow ═══════════════════════ */}
        <div className="contents sm:hidden">
        <div className="ms-[16px] sm:ms-0 mt-[12px]">
          <Breadcrumb
            items={cityBreadcrumb}
            onNavigate={(to) => nav(to)}
            onBack={() => requestLeave(() => nav(-1))}
            backOnMobile
          />
        </div>

        <h1 className="mt-[16px] px-[16px] sm:px-0 text-[24px] leading-[30px] text-[#23302a]" style={{ fontFamily: SERIF }} {...tx(screenHeading)} />

        {/* Choose a city — prominent host card + relay chips (mirrors the web sidebar) */}
        <div data-tour="city-cards" className="mt-[18px] px-[16px] sm:px-0">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <span className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...tx('Choose a city')} />
            {!isRequest && !modifyCityZone && <PhaseTag compact />}
          </div>
          {/* Not shown in modify-city-zone mode even when isRequest (Raza issued) — "you missed your
              turn" framing doesn't apply to a deliberate post-Raza change; the request-styled
              buttons/pill/footer below already communicate that this needs approval. */}
          {isRequest && !modifyCityZone && <div className="mb-[14px]"><SlotClosedCard /></div>}
          {hostCity && (
            <div className="mb-[14px]">
              <HostCityCard
                city={hostCity}
                selected={activeCity?.id === hostCity.id}
                preferred={hostPreferred}
                onSelect={() => selectCity(activeCity?.id === hostCity.id ? null : hostCity)}
                onReserveAll={showReserveAll ? handleSelectAll : undefined}
                allGroupsAssigned={allGroupsAssigned}
                onSwapAll={swapAllToActiveCity}
                anySwappable={anySwappable}
                isRequest={isRequest}
                isCurrentCity={hostIsCurrentCity}
              />
            </div>
          )}
          {/* My Preferred City — mobile chip row, same scrolling pattern as the Relay cities row
              below it (mirrors the desktop sidebar's dedicated "My Preferred City" card, which has
              no mobile equivalent otherwise). Hidden entirely when there's no preferred pick. */}
          {preferredMobileCities.length > 0 && (
            <>
              <div className="mb-[8px] flex items-center gap-[6px]">
                <PreferredStarIcon />
                <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('My Preferred City')} />
              </div>
              <div
                className="mb-[14px] flex gap-[10px] overflow-x-auto pb-[2px]"
                style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' } as React.CSSProperties}
              >
                {preferredMobileCities.map((live) => (
                  <CityHCard
                    key={live.id}
                    city={live}
                    selected={activeCity?.id === live.id}
                    added={addedToCity(live.id)}
                    unavailable={cityUnavailable(live)}
                    onClick={() => selectCity(live.id === activeCity?.id ? null : live)}
                  />
                ))}
              </div>
            </>
          )}
          <div className="mb-[8px] flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Other Cities')} />
            <button
              type="button"
              onClick={() => setShowViewAll(true)}
              className="flex items-center gap-[3px] text-[13px] font-bold text-[#23302a]"
              style={{ fontFamily: FONT }}
            >
              <span {...tx('View all')} />
              <svg viewBox="0 0 16 16" fill="none" className="size-[12px]">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div
            className="flex gap-[10px] overflow-x-auto pb-[2px]"
            style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' } as React.CSSProperties}
          >
            {relayChipOrder.map((c) => (
              <CityHCard
                key={c.id}
                city={c}
                selected={activeCity?.id === c.id}
                added={addedToCity(c.id)}
                unavailable={cityUnavailable(c)}
                onClick={() => selectCity(c.id === activeCity?.id ? null : c)}
              />
            ))}
          </div>
        </div>

        {/* Action bar (mobile) — the member count + Reserve all and the "selected city" banner.
            Only STICKY when there's more than one group card to scroll past; with a single card the
            pinned shadow just looks like clutter. */}
        <div className={groups.length > 1 ? 'sticky top-0 z-20 bg-white pb-[12px] shadow-[0_8px_14px_-12px_rgba(15,77,60,0.4)]' : 'pb-[12px]'}>
        {/* Member count + Reserve all */}
        <div className="pt-[14px] px-[16px] flex items-center justify-between">
          <div className="flex items-center gap-[6px]">
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px]">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM2 8a2 2 0 114 0 2 2 0 01-4 0zM15.5 17c0-2.21-2.46-4-5.5-4s-5.5 1.79-5.5 4M17 17c0-1.54-1.12-2.87-2.75-3.5M3 17c0-1.54 1.12-2.87 2.75-3.5" stroke="#b8821e" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[14px] font-bold text-[#b8821e]" style={{ fontFamily: FONT }} {...tx(plural(totalMembers, '{n} member', '{n} members'), { n: totalMembers })} />
          </div>
          {/* Mobile only — web has its own Reserve all button in the panel header. Only shown once a
              city is picked; hidden entirely (not just disabled) if any member is globally ineligible.
              Also hidden when the active city is Host, or a non-preferred relay city — both now have
              their own inline Reserve/Remove all (HostCityCard / RelaySidebarCard), so this would just
              be a duplicate. A *preferred* relay city (no such header) still uses this button. */}
          {showReserveAll && activeCity?.type !== 'host' && !activeInRelayGrid && (
            <button
              type="button"
              onClick={handleSelectAll}
              className={`h-[32px] rounded-full px-[14px] text-[13px] font-bold transition-colors sm:hidden ${
                allGroupsAssigned
                  ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
                  : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
              }`}
              style={{ fontFamily: FONT }}
            >
              {allGroupsAssigned ? t('Remove all') : isRequest ? t('Request all') : t('Select all')}
            </button>
          )}
          {/* Swap all — shown when the user has reservation(s) in another city and picks a different one.
              Moves every eligible group to the active city at once (teal, matching the per-row Swap).
              Hidden when the active city is Host — its card now has this inline (mobile too). A relay
              city still uses this button on mobile (no chip-grid header there to carry it). */}
          {anySwappable && activeCity?.type !== 'host' && (
            <button
              type="button"
              onClick={swapAllToActiveCity}
              className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[14px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97] sm:hidden"
              style={{ fontFamily: FONT }}
            >
              <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="truncate" {...tx('Swap all to {city}', { city: tdText(activeCity?.name ?? '') })} />
            </button>
          )}
        </div>

        {/* Allocation banner — same pill + copy as the desktop panel's "Selected host/relay city
            X — select members below" (was a differently-styled/worded "Allocating to X" banner). */}
        <div
          className="mx-[16px] sm:mx-0 mt-[12px] flex items-center gap-[8px] rounded-[12px] border px-[14px] py-[12px]"
          style={{ background: '#fdf1e2', borderColor: '#f1d7b6' }}
        >
          <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
            <path d="M9 16.4995C7.675 16.4995 6.59375 16.2901 5.75625 15.8714C4.91875 15.4526 4.5 14.912 4.5 14.2495C4.5 14.012 4.55313 13.7933 4.65938 13.5933C4.76563 13.3933 4.925 13.2058 5.1375 13.0308C5.3125 12.9058 5.50313 12.8558 5.70938 12.8808C5.91563 12.9058 6.08125 13.0058 6.20625 13.1808C6.33125 13.3558 6.37813 13.5464 6.34688 13.7526C6.31563 13.9589 6.2125 14.1245 6.0375 14.2495C6.2 14.4495 6.575 14.6245 7.1625 14.7745C7.75 14.9245 8.3625 14.9995 9 14.9995C9.6375 14.9995 10.25 14.9245 10.8375 14.7745C11.425 14.6245 11.8 14.4495 11.9625 14.2495C11.7875 14.1245 11.6844 13.9589 11.6531 13.7526C11.6219 13.5464 11.6688 13.3558 11.7938 13.1808C11.9188 13.0058 12.0844 12.9058 12.2906 12.8808C12.4969 12.8558 12.6875 12.9058 12.8625 13.0308C13.075 13.2058 13.2344 13.3933 13.3406 13.5933C13.4469 13.7933 13.5 14.012 13.5 14.2495C13.5 14.912 13.0813 15.4526 12.2438 15.8714C11.4063 16.2901 10.325 16.4995 9 16.4995ZM9.01875 12.3745C10.2563 11.462 11.1875 10.5464 11.8125 9.62764C12.4375 8.70889 12.75 7.78701 12.75 6.86201C12.75 5.58701 12.3438 4.62451 11.5313 3.97451C10.7188 3.32451 9.875 2.99951 9 2.99951C8.125 2.99951 7.28125 3.32451 6.46875 3.97451C5.65625 4.62451 5.25 5.58701 5.25 6.86201C5.25 7.69951 5.55625 8.57139 6.16875 9.47764C6.78125 10.3839 7.73125 11.3495 9.01875 12.3745ZM8.55 13.8183C8.4 13.7683 8.2625 13.6933 8.1375 13.5933C6.6625 12.4183 5.5625 11.2714 4.8375 10.1526C4.1125 9.03389 3.75 7.93701 3.75 6.86201C3.75 5.97451 3.90937 5.19639 4.22813 4.52764C4.54688 3.85889 4.95625 3.29951 5.45625 2.84951C5.95625 2.39951 6.51875 2.06201 7.14375 1.83701C7.76875 1.61201 8.3875 1.49951 9 1.49951C9.6125 1.49951 10.2313 1.61201 10.8563 1.83701C11.4813 2.06201 12.0438 2.39951 12.5438 2.84951C13.0438 3.29951 13.4531 3.85889 13.7719 4.52764C14.0906 5.19639 14.25 5.97451 14.25 6.86201C14.25 7.93701 13.8875 9.03389 13.1625 10.1526C12.4375 11.2714 11.3375 12.4183 9.8625 13.5933C9.7375 13.6933 9.6 13.7683 9.45 13.8183C9.3 13.8683 9.15 13.8933 9 13.8933C8.85 13.8933 8.7 13.8683 8.55 13.8183ZM9 8.24951C9.4125 8.24951 9.76563 8.10264 10.0594 7.80889C10.3531 7.51514 10.5 7.16201 10.5 6.74951C10.5 6.33701 10.3531 5.98389 10.0594 5.69014C9.76563 5.39639 9.4125 5.24951 9 5.24951C8.5875 5.24951 8.23438 5.39639 7.94063 5.69014C7.64688 5.98389 7.5 6.33701 7.5 6.74951C7.5 7.16201 7.64688 7.51514 7.94063 7.80889C8.23438 8.10264 8.5875 8.24951 9 8.24951Z" fill="#c8842a" />
          </svg>
          {activeCity ? (
            <p className="text-[13px] font-semibold leading-[18px]" style={{ fontFamily: FONT, color: '#9a6a1e' }}>
              {isRequest ? t('Requested') : t('Selected')} <Iso>{activeCity.type === 'host' ? 'host' : 'relay'} city</Iso> <strong className="font-bold text-[#1f5a44]" {...td(activeCity.name)} /> <Iso>— {isRequest ? 'request' : 'select'} members below</Iso>
            </p>
          ) : (
            <p className="text-[13px] font-bold" style={{ fontFamily: FONT, color: '#9a6a1e' }}>
              {isRequest ? 'Choose' : 'Select'} a city above to start {isRequest ? 'requesting' : 'allocating'} your members
            </p>
          )}
        </div>
        </div>{/* end sticky action bar */}

        {/* Bulk zone — mobile's counterpart of the desktop table's ZONE-header control. Without it a
            phone user had to open each card's own picker in turn. Same sentinel + dropdown. */}
        {showCombined && (
          <div className="mx-[16px] mt-[14px] flex items-center justify-between gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-white px-[12px] py-[10px]">
            <span className="min-w-0 text-[13px] font-semibold text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Zone')} />
            <button
              type="button"
              disabled={!canSetAllZones}
              onClick={(e) => { setZoneSearch(''); setZoneDropdown({ gi: ZONE_ALL_GI, el: e.currentTarget }) }}
              className={`shrink-0 rounded-full border px-[12px] py-[5px] text-[12px] font-bold transition-colors ${canSetAllZones ? 'border-[#c2a04e] bg-white text-[#9a6a1e]' : 'cursor-not-allowed border-[#e7dfc9] bg-white text-[#c4c9c6]'}`}
              style={{ fontFamily: FONT }} {...tx('Same zone for all')} />
          </div>
        )}

        {/* Mobile group cards — reservable groups first, "Not Available" (globally not valid) last,
            so the unavailability reads as capacity rather than a per-member eligibility reason. */}
        <div data-tour="city-members" className="mx-[16px] mt-[14px] mb-[16px] flex flex-col gap-[12px]">
          {groups.map((_, i) => i)
            .filter((i) => !(isRequest && isLockedGroup(i)))
            .sort((a, b) => (groupEligible(a) ? 0 : 1) - (groupEligible(b) ? 0 : 1))
            .map((gi) => (
            <AllocateGroupCard
              key={gi}
              group={groups[gi]}
              assignedCity={groupCityMap.get(gi) ?? null}
              available={groupAvailableFor(gi)}
              eligible={groupEligible(gi)}
              closed={groupClosedForActive(gi)}
              opensAt={groupOpensAt(gi)}
              location={groupLocation(gi)}
              onSelect={() => toggleGroupRow(gi)}
              autoAllocated={isAutoGroup(gi)}
              locked={isLockedGroup(gi)}
              isRequest={isRequest}
              activeCityName={activeCity?.name ?? null}
              showZone={showCombined}
              zone={groupZoneMap.get(gi) ?? null}
              zoneDropdownOpen={zoneDropdown?.gi === gi}
              onOpenZoneDropdown={(el) => setZoneDropdown({ gi, el })}
              currentAlloc={modifyCityZone ? currentAllocFor(gi) : undefined}
              swapTarget={showCombined ? null : swapTargetFor(gi)}
              onSwap={() => swapGroupToActiveCity(gi)}
              onRemove={() => removeGroupCity(gi)}
            />
          ))}
        </div>
        </div>{/* ── end mobile ── */}

        {/* ═══════════════════════ DESKTOP — two-panel (cream sidebar + white panel) ═══════════════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden" onClick={() => setRelayDropdown(null)}>

            {/* ───── LEFT sidebar — host card + relay grid together ───── */}
            <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[20px] overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">
              <Breadcrumb
                items={cityBreadcrumb}
                onNavigate={(to) => nav(to)}
                onBack={() => requestLeave(() => nav(-1))}
                activeColor="#a8843e"
                dense
              />
              <ChooseCityHeading isRequest={isRequest} showPhase={!modifyCityZone} />
              {isRequest && !modifyCityZone && <SlotClosedCard />}
              <div data-tour="city-cards" className="flex flex-col gap-[20px]">
                {hostCity && (
                  <HostCityCard
                    city={hostCity}
                    selected={activeCity?.id === hostCity.id}
                    preferred={hostPreferred}
                    onSelect={() => selectCity(activeCity?.id === hostCity.id ? null : hostCity)}
                    onReserveAll={showReserveAll ? handleSelectAll : undefined}
                    allGroupsAssigned={allGroupsAssigned}
                    onSwapAll={swapAllToActiveCity}
                    anySwappable={anySwappable}
                    topLabel={t('Top preferred city')}
                    isRequest={isRequest}
                    isCurrentCity={hostIsCurrentCity}
                  />
                )}
                <MyPreferredCityCard
                  cities={preferredCities}
                  hostCityId={hostCity?.id}
                  liveById={liveById}
                  activeCityId={activeCity?.id ?? null}
                  addedOf={addedToCity}
                  unavailableOf={cityUnavailable}
                  onSelect={(c) => selectCity(c.id === activeCity?.id ? null : c)}
                  onReserveAll={showReserveAll ? handleSelectAll : undefined}
                  allGroupsAssigned={allGroupsAssigned}
                  onSwapAll={swapAllToActiveCity}
                  anySwappable={anySwappable}
                />
                <RelaySidebarCard
                  cities={relayCities.filter((c) => !preferredRelayIds.has(c.id))}
                  activeCityId={activeCity?.id ?? null}
                  addedOf={addedToCity}
                  unavailableOf={cityUnavailable}
                  search={citySearch}
                  onSearch={setCitySearch}
                  onSelect={(c) => selectCity(c.id === activeCity?.id ? null : c)}
                  onReserveAll={showReserveAll ? handleSelectAll : undefined}
                  allGroupsAssigned={allGroupsAssigned}
                  onSwapAll={swapAllToActiveCity}
                  anySwappable={anySwappable}
                />
              </div>
            </aside>

            {/* ───── RIGHT panel ───── */}
            <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
                <div className="flex items-start justify-between gap-[16px]">
                  <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx(screenHeading)} />
                  <MembersChip count={totalMembers} />
                </div>
                <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
                  <StepIndicator
                    steps={[
                      { label: t('City'), done: activeCity !== null || groupCityMap.size > 0 },
                      // Same-day-flow (or modify-city-zone): Zone opens alongside City on this combined screen.
                      ...(showCombined ? [{ label: t('Zone'), done: activeCity !== null || groupCityMap.size > 0 }] : []),
                      { label: t('Members'), count: `${totalAllocated}/${totalMembers}`, done: totalAllocated > 0 },
                    ]}
                  />
                  {/* Once a city is picked, prompt the user to allocate members to it. */}
                  {activeCity && (
                    <span className="inline-flex h-[36px] items-center gap-[8px] rounded-full border px-[15px]" style={{ background: '#fdf1e2', borderColor: '#f1d7b6' }}>
                      <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
                        <path d="M9 16.4995C7.675 16.4995 6.59375 16.2901 5.75625 15.8714C4.91875 15.4526 4.5 14.912 4.5 14.2495C4.5 14.012 4.55313 13.7933 4.65938 13.5933C4.76563 13.3933 4.925 13.2058 5.1375 13.0308C5.3125 12.9058 5.50313 12.8558 5.70938 12.8808C5.91563 12.9058 6.08125 13.0058 6.20625 13.1808C6.33125 13.3558 6.37813 13.5464 6.34688 13.7526C6.31563 13.9589 6.2125 14.1245 6.0375 14.2495C6.2 14.4495 6.575 14.6245 7.1625 14.7745C7.75 14.9245 8.3625 14.9995 9 14.9995C9.6375 14.9995 10.25 14.9245 10.8375 14.7745C11.425 14.6245 11.8 14.4495 11.9625 14.2495C11.7875 14.1245 11.6844 13.9589 11.6531 13.7526C11.6219 13.5464 11.6688 13.3558 11.7938 13.1808C11.9188 13.0058 12.0844 12.9058 12.2906 12.8808C12.4969 12.8558 12.6875 12.9058 12.8625 13.0308C13.075 13.2058 13.2344 13.3933 13.3406 13.5933C13.4469 13.7933 13.5 14.012 13.5 14.2495C13.5 14.912 13.0813 15.4526 12.2438 15.8714C11.4063 16.2901 10.325 16.4995 9 16.4995ZM9.01875 12.3745C10.2563 11.462 11.1875 10.5464 11.8125 9.62764C12.4375 8.70889 12.75 7.78701 12.75 6.86201C12.75 5.58701 12.3438 4.62451 11.5313 3.97451C10.7188 3.32451 9.875 2.99951 9 2.99951C8.125 2.99951 7.28125 3.32451 6.46875 3.97451C5.65625 4.62451 5.25 5.58701 5.25 6.86201C5.25 7.69951 5.55625 8.57139 6.16875 9.47764C6.78125 10.3839 7.73125 11.3495 9.01875 12.3745ZM8.55 13.8183C8.4 13.7683 8.2625 13.6933 8.1375 13.5933C6.6625 12.4183 5.5625 11.2714 4.8375 10.1526C4.1125 9.03389 3.75 7.93701 3.75 6.86201C3.75 5.97451 3.90937 5.19639 4.22813 4.52764C4.54688 3.85889 4.95625 3.29951 5.45625 2.84951C5.95625 2.39951 6.51875 2.06201 7.14375 1.83701C7.76875 1.61201 8.3875 1.49951 9 1.49951C9.6125 1.49951 10.2313 1.61201 10.8563 1.83701C11.4813 2.06201 12.0438 2.39951 12.5438 2.84951C13.0438 3.29951 13.4531 3.85889 13.7719 4.52764C14.0906 5.19639 14.25 5.97451 14.25 6.86201C14.25 7.93701 13.8875 9.03389 13.1625 10.1526C12.4375 11.2714 11.3375 12.4183 9.8625 13.5933C9.7375 13.6933 9.6 13.7683 9.45 13.8183C9.3 13.8683 9.15 13.8933 9 13.8933C8.85 13.8933 8.7 13.8683 8.55 13.8183ZM9 8.24951C9.4125 8.24951 9.76563 8.10264 10.0594 7.80889C10.3531 7.51514 10.5 7.16201 10.5 6.74951C10.5 6.33701 10.3531 5.98389 10.0594 5.69014C9.76563 5.39639 9.4125 5.24951 9 5.24951C8.5875 5.24951 8.23438 5.39639 7.94063 5.69014C7.64688 5.98389 7.5 6.33701 7.5 6.74951C7.5 7.16201 7.64688 7.51514 7.94063 7.80889C8.23438 8.10264 8.5875 8.24951 9 8.24951Z" fill="#c8842a" />
                      </svg>
                      <span className="text-[14px] font-semibold" style={{ fontFamily: FONT, color: '#9a6a1e' }}>
                        {isRequest ? t('Requested') : t('Selected')} <Iso>{activeCity.type === 'host' ? 'host' : 'relay'} city</Iso> <strong className="font-bold text-[#1f5a44]" {...td(activeCity.name)} /> <Iso>— {isRequest ? 'request' : 'select'} members below</Iso>
                      </span>
                    </span>
                  )}
                  {/* Only shown once a city is picked; hidden entirely (not just disabled) if any
                      member is globally ineligible for allocation. Also hidden when the active city is
                      Host, a non-preferred relay city, or a preferred pick — all three now have their
                      own inline Reserve/Remove all (HostCityCard / RelaySidebarCard / MyPreferredCityCard). */}
                  {showReserveAll && activeCity?.type !== 'host' && !activeInRelayGrid && !activeInPreferredCard && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className={`ms-auto flex h-[36px] shrink-0 items-center justify-center rounded-full px-[16px] text-[13px] font-bold transition-colors ${
                        allGroupsAssigned
                          ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
                          : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
                      }`}
                      style={{ fontFamily: FONT }}
                    >
                      {allGroupsAssigned ? t('Remove all') : isRequest ? t('Request all') : t('Select all')}
                    </button>
                  )}
                  {/* Desktop "Swap all" used to live here too, but every case now has its own inline
                      button (HostCityCard / RelaySidebarCard / MyPreferredCityCard) — this external
                      copy was a pure duplicate on desktop and has been removed. The mobile action bar's
                      Swap all (above) stays: mobile's relay chips have no per-card header to carry it. */}
                </div>
                {/* The 0.6 dim is a first-run "pick a city first" cue for the ORIGINAL City Selection
                    flow. In the Modify Reservation flows the user already has an allocation and the
                    table is showing it (the "Now …" pills, the current city/zone) — greying that out
                    reads as broken, not as guidance. Especially since the host card is no longer
                    pre-selected when you're already in that city, which left the table dimmed on
                    entry with nothing to explain it. */}
                <div data-tour="city-members" className="mt-[20px] transition-opacity duration-200 ease-out" style={{ opacity: modifyCityZone || activeCity !== null || groupCityMap.size > 0 ? 1 : 0.6 }}>
                  <AllocateDesktopTable
                    groups={groups}
                    groupCityMap={groupCityMap}
                    availableFor={groupAvailableFor}
                    eligibleFor={groupEligible}
                    closedFor={groupClosedForActive}
                    opensAtFor={groupOpensAt}
                    locationFor={groupLocation}
                    activeCity={activeCity}
                    onReserveGroup={reserveGroupToActiveCity}
                    onRemoveGroup={removeGroupCity}
                    onBlockedCity={() => showToast(t('Please choose a different city.'))}
                    isAutoGroup={isAutoGroup}
                    isLockedGroup={isLockedGroup}
                    isRequest={isRequest}
                    showZoneColumn={showCombined}
                    onOpenZoneAllDropdown={(el) => { setZoneSearch(''); setZoneDropdown({ gi: ZONE_ALL_GI, el }) }}
                    canSetAllZones={canSetAllZones}
                    zoneFor={(gi) => groupZoneMap.get(gi) ?? null}
                    openZoneGi={zoneDropdown?.gi ?? null}
                    onOpenZoneDropdown={(gi, el) => setZoneDropdown({ gi, el })}
                    swapTargetFor={swapTargetFor}
                    onSwapGroup={swapGroupToActiveCity}
                    currentAllocFor={modifyCityZone ? currentAllocFor : undefined}
                  />
                </div>
              </div>
              <div className="shrink-0">{desktopFooter}</div>
            </section>
          </div>
        </div>
      </PhoneScreen>

      {showViewAll && (
        <ViewAllSheet
          cities={relayCities}
          selectedCity={activeCity}
          addedOf={addedToCity}
          onSelect={(c) => selectCity(c)}
          onClose={() => { setShowViewAll(false); setCitySearch('') }}
          search={citySearch}
          onSearch={setCitySearch}
        />
      )}

      {showWhosInWhichCity && (
        <WhosInWhichCitySheet
          groups={groups}
          groupCityMap={groupCityMap}
          onClose={() => setShowWhosInWhichCity(false)}
        />
      )}

      {relayDropdown && (
        <RelayCityDropdown
          anchor={relayDropdown.el}
          cities={relayCities}
          selectedCityId={groupCityMap.get(relayDropdown.gi)?.id ?? null}
          availabilityOf={(c) => relayCityFitsGroup(c, relayDropdown.gi)}
          search={relayCitySearch}
          onSearch={setRelayCitySearch}
          onSelect={(c) => setGroupCity(relayDropdown.gi, c)}
          onClose={() => setRelayDropdown(null)}
        />
      )}

      {/* Same-day-flow only: the per-row zone dropdown, anchored to whichever row's Zone trigger was
          clicked. Zones are scoped to that row's own assigned city (falling back to the currently
          selected city if the row isn't reserved yet). */}
      {zoneDropdown && (
        <ZoneMoveDropdown
          anchor={zoneDropdown.el}
          zones={zonesByCityId[(zoneDropdown.gi === ZONE_ALL_GI ? zoneAllCity : (groupCityMap.get(zoneDropdown.gi) ?? activeCity))?.id ?? ''] ?? []}
          selectedZoneId={zoneDropdown.gi === ZONE_ALL_GI ? null : (groupZoneMap.get(zoneDropdown.gi)?.id ?? null)}
          search={zoneSearch}
          onSearch={setZoneSearch}
          onSelect={(z) => {
            if (zoneDropdown.gi === ZONE_ALL_GI) setZoneForAll(z, zoneAllCity)
            else setGroupZone(zoneDropdown.gi, z)
          }}
          onClose={() => setZoneDropdown(null)}
        />
      )}
    </>
  )
}
