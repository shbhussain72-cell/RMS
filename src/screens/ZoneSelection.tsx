import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { Iso, isolateRuns } from '../components/Bidi'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import BottomSheet from '../components/figma/BottomSheet'
import MissedMemberSheet from '../components/figma/MissedMemberSheet'
import StickyFooter from '../components/figma/StickyFooter'
import { zonesByCityId, family, genderByIts, allocationCloses, miqaats } from '../data/seed'
import type { Zone, FamilyMember } from '../data/seed'
import { buildAllGroups, type BadgeKind, type Group } from '../lib/group'
import { CityHeader } from '../components/figma/AllocationGroupCard'
import RoleBadge from '../components/figma/RoleBadge'
import Checkbox from '../components/figma/Checkbox'
import StepIndicator from '../components/figma/StepIndicator'
import ConfirmedView, { UnallocatedNotice, notAllocatedLabel } from '../components/figma/ConfirmedView'
import Toast, { useToast } from '../components/figma/Toast'
import { useStore } from '../store'
import { plural, useT, tNow } from '../i18n'
import { DateLine, TimeLine } from '../components/DateLine'
import { memberTableMinWidth } from '../components/memberTable'

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

// ── Helpers ──────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function fmtHHMMSS(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function familyMeta(m: FamilyMember) {
  // Prefer the member's own gender (invited Mehmaan/Others carry it); genderByIts knows only family.
  // Invited primaries have a blank relation, so omit the leading tag for them.
  const g = m.gender ?? genderByIts(m.its)
  const base = `${g ? `${g} · ` : ''}${tNow('Age')} ${String(m.age).padStart(2, '0')} · ${tNow('ITS')} ${m.its}`
  return isolateRuns(m.relation ? `${tNow(m.relation)} · ${base}` : base)
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="text-white font-bold"
        style={{ fontSize: size * 0.36, fontFamily: FONT, lineHeight: 1 }}
      >
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

function PinIcon({ color = '#1f5a44', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M12 2C8.69 2 6 4.69 6 8c0 5.25 6 12 6 12s6-6.75 6-12c0-3.31-2.69-6-6-6zm0 8.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        fill={color}
      />
    </svg>
  )
}

/** Small red info-circle — mirrors CitySelection's InfoIcon so validity language reads
 *  consistently across the City and Zone steps. */
function InfoIcon({ color = '#b23b3b' }: { color?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0">
      <circle cx="10" cy="10" r="7.25" stroke={color} strokeWidth="1.4" />
      <path d="M10 9.2v3.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.7" r="1" fill={color} />
    </svg>
  )
}

/** Card for a group that never received a city allocation in City Selection. Groups flagged
 *  `notValidForCity` are excluded before reaching here — they're globally blocked, so there's
 *  nothing to do about them on this screen. */
function CityMissingCard({ group }: { group: Group }) {
  const { tx, td } = useT()
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
      {group.members.map((mm, mi) => (
        <div
          key={mm.member.id}
          className="flex items-center gap-[10px] px-[13px] py-[10px]"
          style={{ borderTop: mi > 0 ? '1px solid #f0ebe0' : undefined }}
        >
          <Avatar name={mm.member.name} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-[#23302a] leading-[18px]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
            <p className="text-[12px] text-[#5a6660] mt-[2px]" style={{ fontFamily: FONT }}>
              {familyMeta(mm.member)}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-[6px] text-[12px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>
            <InfoIcon />
            <span {...tx('No city selected')} />
          </span>
        </div>
      ))}
    </div>
  )
}

// ── CityTab ───────────────────────────────────────────────────────────────────

/** Small pill distinguishing a Host city (gold) from a Relay city (teal) — matches the
 *  confirmation screen, so the allocated-city tabs read clearly here too. */
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

function CityTab({
  name, memberCount, active, onClick, type,
}: {
  name: string; memberCount: number; active: boolean; onClick: () => void; type?: 'host' | 'relay'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 flex flex-col items-start px-[14px] py-[10px] rounded-[12px] transition-colors"
      style={{
        border: active ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9',
        background: active ? '#fffdf5' : 'white',
      }}
    >
      <span
        className="text-[14px] leading-[18px] text-[#23302a]"
        style={{ fontFamily: FONT, fontWeight: active ? 700 : 600 }}
      >
        {name}
      </span>
      <span className="text-[12px] leading-[16px] text-[#8a938e] mt-[2px]" style={{ fontFamily: FONT }}>
        {memberCount} members
      </span>
      <CityKindTag type={type} />
    </button>
  )
}

// ── ZoneHCard (horizontal-scroll zone card) ───────────────────────────────────

function ZoneHCard({
  zone, selected, onSelect,
}: {
  zone: Zone; selected: boolean; onSelect: () => void
}) {
     const { t, td } = useT()
  const left = zone.capacity - zone.filled
  const isFull = left <= 0
  return (
    <button
      type="button"
      onClick={!isFull ? onSelect : undefined}
      className="shrink-0 flex flex-col items-start px-[14px] py-[12px] rounded-[12px] transition-colors min-w-[148px]"
      style={{
        border: selected ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9',
        background: selected ? '#fffdf5' : isFull ? '#f7f7f7' : 'white',
        opacity: isFull ? 0.55 : 1,
        cursor: isFull ? 'not-allowed' : 'pointer',
      }}
    >
      <span className="text-[14px] leading-[18px] text-[#23302a] text-start font-bold" style={{ fontFamily: FONT }} {...td(zone.name)} />
      <span
        className="text-[13px] leading-[18px] mt-[3px] font-bold"
        style={{ fontFamily: FONT, color: isFull ? '#b23b3b' : '#1f5a44' }}
      >
        {isFull ? t('Full') : t('{n} spots left', { n: left })}
      </span>
    </button>
  )
}

// ── All zones sheet (opened from "View all") ──────────────────────────────────
function AllZonesSheet({ cityName, zones, activeZoneId, onSelect, onClose }: {
  cityName: string
  zones: Zone[]
  activeZoneId: string | null
  onSelect: (z: Zone) => void
  onClose: () => void
}) {
     const { tx, t, td } = useT()
  const [q, setQ] = useState('')
  const list = q ? zones.filter((z) => z.name.toLowerCase().includes(q.toLowerCase())) : zones
  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <div className="pe-[36px]">
            <span className="text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>All {cityName} zones</span>
          </div>
          <div className="mt-[14px] flex h-[44px] items-center gap-[10px] rounded-full border border-[#e7dfc9] bg-[#faf8f2] px-[14px]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search zones...')}
              className="flex-1 bg-transparent text-[14px] text-[#23302a] outline-none placeholder-[#b0b8b3]" style={{ fontFamily: FONT }} />
            <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    >
      <div className="flex flex-col gap-[8px]">
        {list.map((z) => {
          const { t } = useT()
          const left = z.capacity - z.filled
          const isFull = left <= 0
          const selected = z.id === activeZoneId
          return (
            <button key={z.id} type="button" onClick={() => { if (!isFull) { onSelect(z); onClose() } }}
              className="flex w-full items-center justify-between rounded-[14px] border px-[16px] py-[14px] text-start"
              style={{ borderColor: selected ? '#d9c98a' : '#e7dfc9', background: selected ? '#fffdf5' : 'white', opacity: isFull ? 0.5 : 1, cursor: isFull ? 'not-allowed' : 'pointer' }}>
              <span className="text-[15px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#8a938e' : '#23302a' }} {...td(z.name)} />
              <span className="text-[13px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#b23b3b' : '#1f7a4d' }}>
                {isFull ? t('Full') : t('{n} spots left', { n: left })}
              </span>
            </button>
          )
        })}
        {list.length === 0 && <p className="px-[4px] py-[10px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No zones found.')} />}
      </div>
    </BottomSheet>
  )
}

// ── Reserve / Reserved controls (mirror City Selection's Action column) ────────

/** Green "Reserved" pill + a separate remove ✕ — the zone name is shown in its own column/row, so
 *  the pill only carries the status (mirrors City Selection's Action-column Reserved pill). */
function ReservedZonePill({ onRemove, full = false, isRequest = false }: { onRemove: () => void; full?: boolean; isRequest?: boolean }) {
  const { t } = useT()
  return (
    <div className={`flex items-center gap-[10px] ${full ? 'w-full justify-between' : ''}`}>
      <span className={`inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border px-[14px] text-[13px] font-bold ${isRequest ? 'border-[#f0d9a8] bg-[#fdf1dc] text-[#a9740f]' : 'border-[#bfe3cd] bg-[#eef7f1] text-[#1f7a4d]'}`} style={{ fontFamily: FONT }}>
        {isRequest ? (
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
        {isRequest ? t('Requested') : t('Selected')}
      </span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label={t('Remove reservation')}
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
        <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </div>
  )
}

/** "Reserve" button — filled green once a zone is picked (active), faded until then. Allocates the
 *  whole group to the active zone (same interaction as City Selection's Reserve). */
function ReserveZoneButton({ activeZone, onReserve, full = false, isRequest = false }: { activeZone: Zone | null; onReserve: () => void; full?: boolean; isRequest?: boolean }) {
  const verb = isRequest ? 'Request' : 'Select'
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onReserve() }}
      className={`inline-flex items-center justify-center gap-[6px] rounded-full text-[13px] font-bold transition-colors ${full ? 'w-full' : 'px-[22px]'}`}
      style={{ fontFamily: FONT, whiteSpace: 'nowrap', height: full ? 40 : 34, border: '1.5px solid #1f5a44', background: activeZone ? '#1f5a44' : 'white', color: activeZone ? 'white' : '#1f5a44', opacity: activeZone ? 1 : 0.55 }}>
      {isRequest && activeZone && <svg viewBox="0 0 24 24" fill="none" className="size-[13px] shrink-0"><path d="M4.5 12l15-7.5-7 15-2.2-5.3L4.5 12z" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {activeZone ? `${verb} ${activeZone.name}` : verb}
    </button>
  )
}

/** "You missed your turn" card — shown when the zone booking window has closed (reached via Ask Help
 *  to file a request). Mirrors City Selection's SlotClosedCard. */
function SlotClosedCard() {
  const { tx, t } = useT()
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
        {/* Two isolates, not one: `t('Fri')` is Arabic in LSD, so a single <Iso> around the pair
            isolates them from the sentence but leaves the ASCII "20" unbounded against it. */}
        <Iso>{t('Fri')}</Iso>{', '}<Iso>20</Iso>{' · '}<TimeLine value="6:00 PM" />.
      </p>
    </div>
  )
}

/** Swap-pending — a group already in a different zone than the active one. A dedicated teal action,
 *  deliberately distinct from the green "Reserved" pill, so it reads as "you have a choice to make"
 *  (mirrors City Selection's per-row Swap-to treatment). The ✕ cancels the reservation entirely;
 *  nothing swaps until the button itself is pressed. */
function SwapZonePill({ currentZoneName, targetZoneName, onSwap, onRemove, full = false }: {
  currentZoneName: string
  targetZoneName: string
  onSwap: () => void
  onRemove: () => void
  full?: boolean
}) {
     const { t } = useT()
  return (
    <div className={`flex flex-col gap-[6px] ${full ? 'w-full' : ''}`}>
      <div className={`flex items-center gap-[8px] ${full ? 'w-full' : ''}`}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onSwap() }}
          className={`inline-flex h-[34px] min-w-0 items-center gap-[7px] rounded-full border border-[#2e6a7d] bg-white px-[16px] text-[13px] font-bold text-[#2e6a7d] transition-colors hover:bg-[#eef5f7] active:scale-[0.97] ${full ? 'flex-1' : ''}`}
          style={{ fontFamily: FONT }}>
          <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#2e6a7d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="truncate">Swap to {targetZoneName}</span>
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label={t('Cancel reservation')}
          className="flex size-[26px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
          <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>
      <span className="text-[11.5px] font-semibold leading-[15px] text-[#23302a]" style={{ fontFamily: FONT }}>
        <span className="font-bold text-[#1f7a4d]">You're selected in {currentZoneName}</span> — do you want to swap it?
      </span>
    </div>
  )
}

/** "Reserve all"/"Remove all"/"Swap all" — same treatment as City Selection's HostCityCard/
 *  RelaySidebarCard header buttons, placed in the "{City} zones (N)" sidebar card header (not a
 *  separate row above the page). Reserve/Remove and Swap never apply at the same time. */
function ZoneBulkActionPill({ kind, destName, onClick }: { kind: 'reserve' | 'remove' | 'swap'; destName?: string; onClick: () => void }) {
  const { t } = useT()
  if (kind === 'swap') {
    return (
      <button type="button" onClick={onClick}
        className="ms-auto inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[14px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
        style={{ fontFamily: FONT }}>
        <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="truncate">Swap all{destName ? ` to ${destName}` : ''}</span>
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick}
      className={`ms-auto flex h-[32px] shrink-0 items-center justify-center rounded-full px-[14px] text-[13px] font-bold transition-colors ${
        kind === 'remove'
          ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
          : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
      }`}
      style={{ fontFamily: FONT }}>
      {kind === 'remove' ? t('Remove all') : 'Select all'}
    </button>
  )
}

// ── AllocateGroupCard (browse – mobile) ───────────────────────────────────────

function AllocateGroupCard({
  group, assignedZone, activeZone, memberChecked, onToggleMember, onReserve, onRemove, autoAllocated, swapTarget, hideReserveCta, isRequest = false,
}: {
  group: Group
  assignedZone: Zone | null
  /** The currently-picked zone — drives the Reserve button's active (filled) state. */
  activeZone: Zone | null
  memberChecked: (memberId: string) => boolean
  onToggleMember: (memberId: string) => void
  /** Reserve the whole group to the active zone (also used to CONFIRM a swap — same operation). */
  onReserve: () => void
  /** Remove this group's zone reservation. */
  onRemove: () => void
  /** This group never needs manual zone selection — it's already been auto-allocated (a per-event
   *  "auto-allocate Others" rule). Not toggleable, reads "Auto-allocated" instead of a picker. */
  autoAllocated?: boolean
  /** Set when this group is already in a DIFFERENT zone than the active one — swaps the footer to
   *  the "Swap to X" treatment instead of the plain Reserved pill. */
  swapTarget?: Zone | null
  /** "Reserve all" already covers every eligible member for the active zone → the per-row Reserve
   *  button is redundant, so show a muted dash instead (mirrors City Selection's mobile card). */
  hideReserveCta?: boolean
  /** Missed-deadline / closed-window flow — CTA files a request ("Request {zone}") + "Requested" pill. */
  isRequest?: boolean
}) {
     const { tx, td } = useT()
  const linked = !!group.label
  const isAssigned = assignedZone !== null
  return (
    <div
      className="overflow-hidden rounded-[14px] border transition-all duration-200"
      style={{
        // Reserved cards take the same gold/cream selected skin as City Selection, so the whole card
        // (footer included) reads as one piece instead of a cream top over a white footer.
        borderColor: isAssigned ? '#d9c98a' : '#e7dfc9',
        background: isAssigned ? '#fffdf5' : 'white',
        boxShadow: isAssigned ? '0 8px 22px -14px rgba(168,132,62,0.5)' : 'none',
      }}
    >
      {linked && (
        <div className="flex h-[32px] items-center gap-[8px] bg-[#e1eef1] px-[13px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
            {group.label}
          </span>
        </div>
      )}
      <div className="relative">
        {group.members.map((mm, mi) => (
          <div key={mm.member.id} onClick={autoAllocated ? undefined : () => onToggleMember(mm.member.id)}
            className={`relative flex items-center gap-[10px] px-[13px] py-[10px] ${autoAllocated ? 'cursor-default' : 'cursor-pointer'}`}
            style={{ background: !isAssigned && memberChecked(mm.member.id) ? '#fbf7ec' : undefined }}>
            {linked && group.members.length > 1 && (
              <span className="pointer-events-none absolute start-[31px] w-[2px] bg-[#fac775]" style={{ top: mi === 0 ? '50%' : 0, bottom: mi === group.members.length - 1 ? '50%' : 0 }} />
            )}
            <div className="relative flex min-w-0 flex-1 items-center gap-[10px]">
              <Avatar name={mm.member.name} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#23302a] leading-[18px]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                <p className="text-[12px] text-[#5a6660] mt-[2px]" style={{ fontFamily: FONT }}>
                  {familyMeta(mm.member)}
                </p>
              </div>
            </div>
            <RoleBadge kind={mm.badge} />
          </div>
        ))}
      </div>
      {/* Reserve action (mirrors City Selection's mobile footer) — once reserved/auto-allocated the
          zone name shows on the LEFT (its own labelled block) and the status pill on the RIGHT, so
          the pill only carries "Reserved" / "Auto-allocated". */}
      <div className="border-t border-[#f0ebe0] px-[13px] py-[10px]" onClick={(e) => e.stopPropagation()}>
        {assignedZone && !autoAllocated && swapTarget ? (
          <SwapZonePill currentZoneName={assignedZone.name} targetZoneName={swapTarget.name} onSwap={onReserve} onRemove={onRemove} full />
        ) : assignedZone ? (
          <div className="flex items-center justify-between gap-[8px]">
            <div className="min-w-0">
              <p className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Zone')} />
              <p className="mt-[2px] text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(assignedZone.name)} />
            </div>
            {autoAllocated ? (
              <span className="inline-flex shrink-0 items-center gap-[6px] rounded-full border border-[#bfe3cd] bg-[#eef7f1] px-[14px] py-[7px] text-[13px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT }}>
                <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                  <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
                  <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span {...tx('Auto-allocated')} />
              </span>
            ) : (
              <ReservedZonePill onRemove={onRemove} isRequest={isRequest} />
            )}
          </div>
        ) : hideReserveCta ? (
          <div className="flex h-[40px] w-full items-center justify-center">
            <span className="text-[14px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
          </div>
        ) : (
          <ReserveZoneButton activeZone={activeZone} onReserve={onReserve} full isRequest={isRequest} />
        )}
      </div>
    </div>
  )
}

// ── "Who's in which zone" bottom sheet ───────────────────────────────────────

function WhosWhereSheet({
  open, onClose, groups, groupZoneMap, cityName, totalMembers,
}: {
  open: boolean
  onClose: () => void
  groups: Group[]
  groupZoneMap: Map<number, Zone>
  cityName: string
  totalMembers: number
}) {
     const { tx, td } = useT()
  const totalAllocated = [...groupZoneMap.entries()].reduce(
    (sum, [gIdx]) => sum + groups[gIdx].members.length, 0
  )

  const byZone = new Map<string, { zone: Zone; groupIndices: number[] }>()
  for (const [gIdx, zone] of groupZoneMap) {
    const ex = byZone.get(zone.id)
    if (ex) ex.groupIndices.push(gIdx)
    else byZone.set(zone.id, { zone, groupIndices: [gIdx] })
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      header={(
        <>
          <div className="pe-[36px]">
            <h2 className="text-[18px] leading-[24px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Who\'s in which zone')} />
          </div>
          <p className="text-[12px] text-[#8a938e] mt-[2px]" style={{ fontFamily: FONT }}>
            placed {totalAllocated} of {totalMembers}
          </p>
          {/* City */}
          <div className="flex items-center gap-[6px] mt-[10px]">
            <PinIcon />
            <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
              {cityName}
            </span>
          </div>
        </>
      )}
    >
      <div className="flex flex-col gap-[14px]">
        {byZone.size === 0 ? (
          <p className="text-[13px] text-[#8a938e] py-[12px] text-center" style={{ fontFamily: FONT }} {...tx('No members allocated yet. Select a zone and check members above.')} />
        ) : (
          [...byZone.values()].map(({ zone, groupIndices }) => {
            const zoneMembers = groupIndices.flatMap((i) => groups[i].members)
            return (
              <div key={zone.id}>
                <p className="text-[13px] font-bold text-[#23302a] mb-[8px]" style={{ fontFamily: FONT }}>
                  {zone.name}
                  <span className="font-normal text-[#8a938e]"> · {zoneMembers.length} members</span>
                </p>
                <div className="flex flex-col gap-[6px]">
                  {zoneMembers.map((mm) => (
                    <div
                      key={mm.member.id}
                      className="flex items-center justify-between rounded-[10px] border border-[#e7dfc9] px-[12px] py-[8px]"
                    >
                      <div>
                        <p className="text-[13px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                        <p className="text-[11px] text-[#8a938e] mt-[1px]" style={{ fontFamily: FONT }}>
                          {familyMeta(mm.member)}
                        </p>
                      </div>
                      <RoleBadge kind={mm.badge} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </BottomSheet>
  )
}

// ── Success – group card (mobile) ─────────────────────────────────────────────

function SuccessGroupCard({ group, statusText }: { group: Group; statusText?: string }) {
  const { t, td } = useT()
  const linked = !!group.label
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
      {linked && (
        <div className="flex h-[32px] items-center gap-[8px] bg-[#e1eef1] px-[13px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
            {group.label}
          </span>
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
                <p className="text-[14px] font-bold text-[#23302a] leading-[18px]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                <p className="text-[12px] text-[#5a6660] mt-[2px]" style={{ fontFamily: FONT }}>
                  {familyMeta(mm.member)}
                </p>
              </div>
            </div>
            <RoleBadge kind={mm.badge} />
          </div>
        ))}
      </div>
      {/* Status strip — Raza (allocated) or "Zone – Not Allocated" (unallocated) */}
      <div
        className="mx-[13px] my-[8px] flex h-[30px] items-center justify-between rounded-[8px] px-[12px]"
        style={{ background: statusText ? '#fdf3ea' : '#fff6e5' }}
      >
        <span className="text-[12px] text-[#3d3d3a]" style={{ fontFamily: FONT, fontWeight: 500 }}>
          {statusText ? t('Status') : t('Raza status')}
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="size-[6px] rounded-full" style={{ background: statusText ? '#d2632b' : '#b8821e' }} />
          <span className="text-[12px] font-bold" style={{ fontFamily: FONT, color: statusText ? '#b23b3b' : '#b8821e' }}>{statusText ?? t('Pending')}</span>
        </span>
      </div>
    </div>
  )
}

// ── Desktop two-panel atoms ─────────────────────────────────────────────────────

function PeopleMini({ color = '#5a6660' }: { color?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[15px] shrink-0">
      <path d="M14 17v-1.5a3 3 0 00-3-3H5a3 3 0 00-3 3V17M8 9.5a3 3 0 100-6 3 3 0 000 6zM18 17v-1.5a3 3 0 00-2.25-2.9M13 3.6a3 3 0 010 5.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MembersChip({ count }: { count: number }) {
  return (
    <span className="inline-flex h-[34px] items-center gap-[8px] rounded-full bg-[#fbeed3] px-[16px]">
      <PeopleMini color="#9a6712" />
      <span className="text-[15px] font-bold text-[#9a6712]" style={{ fontFamily: FONT }}>{count} members</span>
    </span>
  )
}

/** Sidebar city tab — city name + "N members" with a people glyph + Host/Relay tag. */
function CityTabCard({ name, count, active, onClick, type }: { name: string; count: number; active: boolean; onClick: () => void; type?: 'host' | 'relay' }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col items-start rounded-[12px] px-[12px] py-[10px] text-start transition-all duration-200"
      style={{ border: active ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9', background: active ? '#fffdf5' : 'white' }}>
      <span className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }}>{name}</span>
      <span className="mt-[3px] inline-flex items-center gap-[4px] text-[12px] font-semibold text-[#5a6660]" style={{ fontFamily: FONT }}>
        <PeopleMini /> {count} members
      </span>
      <CityKindTag type={type} />
    </button>
  )
}

/** Sidebar zone grid cell — zone name + "N left", selected / full states. */
function ZoneGridCard({ zone, selected, onClick }: { zone: Zone; selected: boolean; onClick: () => void }) {
  const { t, td } = useT()
  const left = zone.capacity - zone.filled
  const isFull = left <= 0
  return (
    <button type="button" disabled={isFull} onClick={!isFull ? onClick : undefined}
      className="flex w-full flex-col items-start rounded-[12px] px-[12px] py-[11px] text-start transition-all duration-200 enabled:hover:-translate-y-[1px] enabled:hover:shadow-[0_8px_18px_-10px_rgba(21,64,47,0.3)] enabled:active:translate-y-0"
      style={{ border: selected ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9', background: selected ? '#fffdf5' : isFull ? '#f6f6f4' : 'white', cursor: isFull ? 'not-allowed' : 'pointer', minHeight: 64 }}>
      <span className="text-[14px] font-bold leading-[18px]" style={{ fontFamily: FONT, color: isFull ? '#8a938e' : '#23302a' }} {...td(zone.name)} />
      <span className="mt-[5px] text-[13px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#b23b3b' : '#1f5a44' }}>{isFull ? t('Full') : t('{n} spots left', { n: left })}</span>
    </button>
  )
}

/** Desktop sidebar card: "Members allocated cities" tabs + "{City} zones (N)" search + 2-col grid. */
function ZoneSidebarCard({
  cityTabs, activeCityTab, onSelectTab, cityName, zones, activeZoneId, onSelectZone, search, onSearch, bulkAction,
}: {
  cityTabs: { id: string; name: string; memberCount: number; type?: 'host' | 'relay' }[]
  activeCityTab: number
  onSelectTab: (i: number) => void
  cityName: string
  zones: Zone[]
  activeZoneId: string | null
  onSelectZone: (z: Zone) => void
  search: string
  onSearch: (v: string) => void
  /** Set once a zone is picked and there's more than one selectable member — renders in the "{City}
   *  zones (N)" header, the step that completes the destination (mirrors City Selection's
   *  RelaySidebarCard header treatment, not a separate row above the page). */
  bulkAction?: { kind: 'reserve' | 'remove' | 'swap'; destName?: string; onClick: () => void }
}) {
     const { tx, t } = useT()
  const filtered = search ? zones.filter((z) => z.name.toLowerCase().includes(search.toLowerCase())) : zones
  return (
    <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
      <p className="text-[18px] leading-[24px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...tx('Members allocated cities')} />
      <div className="mt-[14px] grid grid-cols-3 gap-[10px]">
        {cityTabs.map((t, i) => (
          <CityTabCard key={t.id} name={t.name} count={t.memberCount} type={t.type} active={activeCityTab === i} onClick={() => onSelectTab(i)} />
        ))}
      </div>
      <div className="my-[18px] h-px bg-[#ece6d6]" />
      <div className="flex items-center gap-[7px]">
        <PinIcon color="#c5912f" size={18} />
        <p className="text-[16px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{cityName} zones ({zones.length})</p>
        {bulkAction && <ZoneBulkActionPill kind={bulkAction.kind} destName={bulkAction.destName} onClick={bulkAction.onClick} />}
      </div>
      <div className="mt-[14px] flex h-[48px] items-center gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-[#fbfbfb] px-[14px] transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12">
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('Search zone names...')} className="flex-1 bg-transparent text-[15px] text-[#23302a] outline-none placeholder:text-[#9aa39d]" style={{ fontFamily: FONT }} />
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </div>
      <div className="mt-[14px] grid max-h-[42vh] grid-cols-2 gap-[10px] overflow-y-auto pe-[4px]">
        {filtered.map((z) => (
          <ZoneGridCard key={z.id} zone={z} selected={z.id === activeZoneId} onClick={() => onSelectZone(z)} />
        ))}
        {filtered.length === 0 && <p className="col-span-2 py-[12px] text-center text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No zones found.')} />}
      </div>
    </div>
  )
}

/** Right-panel member table (desktop) — one city's members. `disabled` greys it and blocks
 *  interaction (used for cities that aren't the active tab; the wrapper handles activating them). */
function ZoneBrowseDesktopTable({
  groups, visibleIdx, groupZoneMap, onToggleMember, memberChecked, activeZone, onReserveGroup, onRemoveGroup, isAutoGroup, disabled = false, cityName, swapTargetFor, hideReserveCta, isRequest = false,
}: {
  groups: Group[]
  visibleIdx: number[]
  /** Missed-deadline / closed-window flow — the per-row CTA files a REQUEST ("Request {zone}") and
   *  the confirmed pill reads "Requested" (amber) instead of "Selected". */
  isRequest?: boolean
  /** City this table's members are allocated to — shown above the zone name in the Zone column. */
  cityName?: string
  groupZoneMap: Map<number, Zone>
  onToggleMember: (gi: number, memberId: string) => void
  memberChecked: (gi: number, memberId: string) => boolean
  /** The currently-picked zone — drives the Reserve button's active (filled) state. */
  activeZone: Zone | null
  /** Reserve the whole group to the active zone (also used to CONFIRM a swap — same operation). */
  onReserveGroup: (gi: number) => void
  /** Remove a group's zone reservation. */
  onRemoveGroup: (gi: number) => void
  /** This group never needs manual zone selection — already auto-allocated (a per-event "local
   *  member" rule). Not toggleable, reads "Auto-allocated" instead of a picker. */
  isAutoGroup?: (gi: number) => boolean
  /** Non-interactive — this city isn't the active tab (the parent handles any dimming). */
  disabled?: boolean
  /** Set for a group already in a DIFFERENT zone than the active one — swaps the Action cell to the
   *  "Swap to X" treatment instead of the plain Reserved pill. */
  swapTargetFor?: (gi: number) => Zone | null
  /** "Reserve all" already covers every eligible member for the active zone → the per-row Reserve
   *  button is redundant, so show a muted dash instead (mirrors City Selection's Action column). */
  hideReserveCta?: boolean
}) {
     const { t, td } = useT()
  return (
    <div className={`overflow-x-auto rounded-[14px] border border-[#e7dfc9] bg-white ${disabled ? 'pointer-events-none' : ''}`}>
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: memberTableMinWidth(124, 160, 270) }}>
        <colgroup>
          <col />
          <col style={{ width: '124px' }} />
          <col style={{ width: '160px' }} />
          <col style={{ width: '270px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {[t('Member'), '', t('Zone'), 'Action'].map((h, i) => (
              <th key={i} className="px-[14px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        {visibleIdx.map((gi) => {
          const { t } = useT()
          const g = groups[gi]
          if (!g) return null
          const linked = !!g.label
          const assigned = groupZoneMap.get(gi) ?? null
          const hasConnector = g.members.length > 1
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #f0ebe0', background: '#e1eef1' }}>
                  <td colSpan={4} className="px-[14px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
                      <LinkGlyph />{g.label?.replace('registered together', t('reserve together'))}
                    </span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const { t } = useT()
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                const auto = isAutoGroup?.(gi) ?? false
                return (
                  <tr key={mm.member.id} onClick={auto ? undefined : () => onToggleMember(gi, mm.member.id)}
                    className={`${auto ? 'cursor-default bg-white' : `cursor-pointer ${memberChecked(gi, mm.member.id) ? 'bg-[#fdf8ec]' : 'bg-white hover:bg-[#faf9f4]'}`}`} style={{ borderTop: linked ? undefined : '1px solid #f0ebe0' }}>
                    <td className="relative px-[14px] py-[9px] align-middle">
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
                    {isFirst && (
                      <>
                        {/* Zone — city name (grey) above the assigned zone name (bold), else a dash */}
                        <td rowSpan={g.members.length} className="px-[14px] py-[9px] align-middle">
                          {assigned ? (
                            <div className="flex flex-col gap-[2px]">
                              {cityName && <span className="text-[12px] leading-[15px] text-[#8a938e]" style={{ fontFamily: FONT }}>{cityName}</span>}
                              <span className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(assigned.name)} />
                            </div>
                          ) : (
                            <span className="text-[14px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                          )}
                        </td>
                        {/* Action — Swap-to / Reserved / Reserve / Auto-allocated */}
                        <td rowSpan={g.members.length} className="px-[14px] py-[9px] align-middle" onClick={(e) => e.stopPropagation()}>
                          {auto ? (
                            <span className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border border-[#bfe3cd] bg-[#eef7f1] px-[14px] text-[13px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT }}>
                              <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
                                <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
                                <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              
                              {t('Auto-allocated')}
                            </span>
                          ) : (() => {
                            const swapTarget = assigned ? (swapTargetFor?.(gi) ?? null) : null
                            return swapTarget ? (
                              <SwapZonePill currentZoneName={assigned!.name} targetZoneName={swapTarget.name} onSwap={() => onReserveGroup(gi)} onRemove={() => onRemoveGroup(gi)} />
                            ) : assigned ? (
                              <ReservedZonePill onRemove={() => onRemoveGroup(gi)} isRequest={isRequest} />
                            ) : hideReserveCta ? (
                              <span className="text-[14px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                            ) : (
                              <ReserveZoneButton activeZone={activeZone} onReserve={() => onReserveGroup(gi)} isRequest={isRequest} />
                            )
                          })()}
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

// ── ReserveTip (reservation success tooltip) ────────────────────────────────────
/** A single green confirmation pill pinned above the floating footer, aligned to the right. Names the
 *  member(s) just reserved — same component/positioning as City Selection's tooltip. The parent
 *  drives one-at-a-time playback (in → hold → out) via `phase`. */
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ZoneSelection() {
  const { tx, t, td, tdText } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  // Ask-Help-from-detail returns to the event's detail page after a request, else Home.
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? null
  const flow = useStore((s) => s.flow)
  const confirmZoneAction = useStore((s) => s.confirmZone)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const setGroupZones = useStore((s) => s.setGroupZones)
  const requestReopen = useStore((s) => s.requestReopen)
  const reopenRequests = useStore((s) => s.reopenRequests)
  const stageOverrides = useStore((s) => s.stageOverrides)
  const demoPhase = id ? stageOverrides[id] : undefined

  const miqaat = miqaats.find((x) => x.id === id)
  // Zone deadline already passed and not yet approved → the user got here via the Ask Help redirect for
  // a missed event, so reserving submits a *request* (with the per-group zone allocation) instead of
  // confirming directly. Once approved, the deadline bypass makes it a normal reserve.
  const isRequest = demoPhase
    ? demoPhase !== 'zone_open'
    : !!miqaat && miqaat.countdownSeconds <= 0 && !(id && reopenRequests[id]?.approved)
  const selectedIds =
    flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)
  // This event has no Invite Mehmaan step at all — any Mehmaan invites in the shared flow belong to
  // a different event's session and must not surface here (they'd otherwise show up as extra
  // allocatable groups the user never actually invited for this registration).
  const invitesForGroups = miqaat?.hideInviteMehmaan ? flow.invites.filter((i) => i.group) : flow.invites
  const groups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, invitesForGroups)
  // Total = the members that actually form groups. Derive it from `groups` (like City Selection) so
  // the denominator always matches `totalAllocated`, which also iterates `groups`. Re-deriving it as
  // effectiveSelectedIds + invites.length over-counts invites that never became group members — e.g.
  // a dependent invite whose primary isn't in the invite list is dropped by buildInviteGroups but was
  // still counted, which showed "3/5" for a 3-member party.
  const totalMembers = groups.reduce((n, g) => n + g.members.length, 0)

  // Per-event "auto-allocate Others" rule (e.g. Urs Mubarak Syedna Taher Saifuddin RA) — members
  // added via Add People's ITS search ("Others") never need manual zone selection either; City
  // Selection already auto-allocated their group to the host city (flow.groupCities), so here we
  // just auto-pick a zone within that same city. Family members always go through the normal flow.
  const autoAllocateOthers = !!miqaat?.autoAllocateOthers
  const otherInviteIts = new Set(flow.invites.filter((i) => i.group).map((i) => i.its))
  // Per-event "auto-allocate self via invite" rule (e.g. Eid-e-Ghadeer 1447H) — once the registrant
  // has accepted an incoming "join their group" invite, the registrant's OWN group is auto-allocated
  // (the registrant plus any dependents who reserve together with him); the rest of the family (added
  // separately, in their own groups) still self-allocates.
  const autoAllocateSelf = !!miqaat?.autoAllocateSelfViaInvite && flow.joinedGroupInvite
  const isRegistrantGroup = (gi: number) => !!groups[gi]?.members.some((mm) => mm.member.role === 'registrant')
  const isAutoGroup = (gi: number) =>
    (autoAllocateOthers && !!groups[gi]?.members.some((mm) => otherInviteIts.has(mm.member.its))) ||
    (autoAllocateSelf && isRegistrantGroup(gi))

  // City tabs reflect the actual per-group city allocation made in City Selection:
  // a HOST reservation has a single city; a RELAY reservation can span several.
  const fallbackCityId = flow.confirmedCity?.id ?? 'colombo'
  const fallbackCityName = flow.confirmedCity?.name ?? 'Colombo'
  const cityTabs = (() => {
    const map = new Map<string, { id: string; name: string; memberCount: number; type?: 'host' | 'relay' }>()
    groups.forEach((g, gi) => {
      const alloc = flow.groupCities[String(gi)]
      if (!alloc) return
      const existing = map.get(alloc.id)
      if (existing) existing.memberCount += g.members.length
      else map.set(alloc.id, { id: alloc.id, name: alloc.name, memberCount: g.members.length, type: alloc.type })
    })
    let list = [...map.values()]
    // Request flow: only surface the registrant's OWN city tab — the other members are already zoned
    // and aren't part of this request, so their city tabs would just be empty.
    const registrantCityId = flow.groupCities['0']?.id
    if (isRequest && registrantCityId) {
      const own = list.filter((c) => c.id === registrantCityId)
      if (own.length) list = own
    }
    if (list.length > 0) return list
    return [{ id: fallbackCityId, name: fallbackCityName, memberCount: groups.reduce((n, g) => n + g.members.length, 0), type: flow.confirmedCity?.type }]
  })()

  const [view, setView] = useState<'browse' | 'success'>('browse')
  const [activeCityTab, setActiveCityTab] = useState(0)
  const [activeZone, setActiveZone] = useState<Zone | null>(null)
  const [groupZoneMap, setGroupZoneMap] = useState<Map<number, Zone>>(new Map())
  // Members deselected from their allocated group (e.g. a dependent who can't attend).
  const [droppedMembers, setDroppedMembers] = useState<Set<string>>(new Set())
  // Transient validation message (e.g. selecting a member before a zone, or Reserve with nothing).
  const { toast, showToast } = useToast()
  const [showWhosWhere, setShowWhosWhere] = useState(false)
  const [showAllZones, setShowAllZones] = useState(false)
  const [showMissed, setShowMissed] = useState(false)
  const [timer, setTimer] = useState(42 * 60 + 11)
  // Desktop sidebar zone-grid search
  const [sidebarSearch, setSidebarSearch] = useState('')

  // The active city follows the selected tab; zones are that city's zones.
  const activeCity = cityTabs[activeCityTab] ?? cityTabs[0]
  const cityId = activeCity.id
  const cityName = activeCity.name
  const zones = zonesByCityId[cityId] ?? []

  useEffect(() => {
    if (!autoAllocateOthers && !autoAllocateSelf) return
    setGroupZoneMap((prev) => {
      let changed = false
      const next = new Map(prev)
      groups.forEach((_, gi) => {
        if (!isAutoGroup(gi) || next.has(gi)) return
        const gCityId = flow.groupCities[String(gi)]?.id ?? 'colombo'
        const zone = zonesByCityId[gCityId]?.[0]
        if (zone) { next.set(gi, zone); changed = true }
      })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length, autoAllocateOthers, autoAllocateSelf])

  // Whether City Selection allocated cities per-group at all (the multi-city flow). When it did,
  // a group with no entry is one that was left unassigned (e.g. globally blocked) — it must NOT
  // default to "visible", or it leaks into every city tab (the reported Colombo-shows-2 bug).
  // Only the older single-city flow (no per-group data at all) falls back to "show everywhere".
  const hasPerGroupAlloc = groups.some((_, gi) => !!flow.groupCities[String(gi)])
  // Groups that never got a city — shown separately below so they don't just vanish. A group
  // flagged `notValidForCity` is globally blocked (it can never be reserved to ANY city, in City
  // Selection either) — it's excluded entirely rather than surfaced here with nothing to do.
  const cityUnallocatedIdx = groups
    .map((_, gi) => gi)
    .filter((gi) => hasPerGroupAlloc && !flow.groupCities[String(gi)] && !groups[gi].members.some((mm) => mm.member.notValidForCity))

  // Re-select (zone): the registrant cancelled ONLY their own zone — other groups still hold a saved
  // zone (flow.groupZones). In the request (closed-window) flow those already-allocated rows aren't
  // part of THIS request, so they're hidden; only the registrant's un-zoned group is shown.
  const zoneRegistrantGi = groups.findIndex((g) => g.members.some((mm) => mm.member.role === 'registrant'))
  const registrantMissingZone = zoneRegistrantGi >= 0 && !flow.groupZones[String(zoneRegistrantGi)]
  const isLockedGroup = (gi: number) => registrantMissingZone && gi !== zoneRegistrantGi && !!flow.groupZones[String(gi)]

  // Desktop: the member table shows only the members allocated to the active city tab. In the request
  // flow the already-zoned (locked) members are dropped entirely.
  const visibleIdx = groups
    .map((_, gi) => gi)
    .filter((gi) => !(isRequest && isLockedGroup(gi)))
    .filter((gi) => {
      const alloc = flow.groupCities[String(gi)]
      if (alloc) return alloc.id === cityId
      return !hasPerGroupAlloc
    })
  const allVisibleAssigned = visibleIdx.length > 0 && visibleIdx.every((gi) => groupZoneMap.has(gi))
  // Group indices allocated to a given city — used to render one section per allocated city so every
  // member stays visible in a stable position (the active city's section is interactive; the others
  // are shown disabled, and tapping one makes it the active city in place — nothing reorders).
  const groupIdxForCity = (cid: string) =>
    groups.map((_, gi) => gi).filter((gi) => flow.groupCities[String(gi)]?.id === cid)
  const multiCity = hasPerGroupAlloc && cityTabs.length > 1
  // A member is allocated when its group has a zone AND it wasn't dropped (dependent opt-out).
  const memberAllocated = (gi: number, memberId: string) => groupZoneMap.has(gi) && !droppedMembers.has(memberId)
  const groupAllocCount = (gi: number) =>
    groupZoneMap.has(gi) ? (groups[gi]?.members.filter((m) => !droppedMembers.has(m.member.id)).length ?? 0) : 0
  // Auto-allocated groups sit outside "select all"/swap entirely — never toggled by either.
  const assignableZoneIdx = visibleIdx.filter((gi) => !isAutoGroup(gi))
  /** True once every assignable group in this city is already in the ACTIVE zone specifically (not
   *  just "has some zone") — drives the Reserve-all/Remove-all toggle label, mirrors City Selection's
   *  `allGroupsAssigned`. */
  const allZoneGroupsAssigned = activeZone !== null && assignableZoneIdx.length > 0
    && assignableZoneIdx.every((gi) => groupZoneMap.get(gi)?.id === activeZone.id)
  /** Groups already in a DIFFERENT zone than the active one — swap candidates, same city. */
  const swappableZoneGroups = (): number[] => {
    if (!activeZone) return []
    return assignableZoneIdx.filter((gi) => {
      const z = groupZoneMap.get(gi)
      return z != null && z.id !== activeZone.id
    })
  }
  const anyZoneSwappable = activeZone !== null && swappableZoneGroups().length > 0
  /** Reserve all / Remove all hides while a swap is pending (same rule as City Selection) — a bulk
   *  reserve would be ambiguous for a member already sitting in a different zone. */
  const showReserveAllZone = activeZone !== null && !anyZoneSwappable
  /** True exactly when the "Reserve all" bulk pill itself is actually rendered (mirrors the same
   *  `assignableZoneIdx.length > 1` gate the pill's own JSX uses — hidden entirely for a single
   *  member, since the per-row action alone already covers that case). Drives the table's per-row
   *  `hideReserveCta` so the two states never disagree: whenever the bulk pill is offered, the
   *  redundant per-row Reserve button is replaced with a dash instead. */
  const reserveAllZoneShown = showReserveAllZone && assignableZoneIdx.length > 1
  /** A group already in a different zone than the active one — the swap target to offer instead of
   *  a plain Reserve button. Auto-allocated groups never swap. */
  const zoneSwapTargetFor = (gi: number): Zone | null => {
    if (!activeZone || isAutoGroup(gi)) return null
    const z = groupZoneMap.get(gi)
    return z && z.id !== activeZone.id ? activeZone : null
  }
  // ── Reservation success tooltips (mirrors City Selection) ──────────────────
  // A small green confirmation shown above the floating footer (right-aligned) naming the member(s)
  // just reserved. Reserve/Reserve-all/Swap/Swap-all enqueue one message per group and play them one
  // at a time — each animates in, holds briefly, then eases out before the next appears.
  const [tipQueue, setTipQueue] = useState<string[]>([])
  const [activeTip, setActiveTip] = useState<{ text: string; phase: 'in' | 'out' } | null>(null)
  useEffect(() => {
    if (activeTip || tipQueue.length === 0) return
    setActiveTip({ text: tipQueue[0], phase: 'in' })
    setTipQueue((q) => q.slice(1))
  }, [tipQueue, activeTip])
  useEffect(() => {
    if (!activeTip) return
    const dur = activeTip.phase === 'in' ? 780 : 240
    const t = setTimeout(() => {
      setActiveTip((a) => (a ? (a.phase === 'in' ? { ...a, phase: 'out' } : null) : null))
    }, dur)
    return () => clearTimeout(t)
  }, [activeTip])
  /** Build "<member(s)> reserved in <zone>." for a group. */
  const reserveTipText = (gi: number, zoneName: string): string => {
    const names = groups[gi]?.members.map((m) => m.member.name) ?? []
    if (names.length === 0) return ''
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
    return `${who} selected in ${zoneName}.`
  }
  /** Enqueue one reservation tooltip per group (played sequentially). */
  const enqueueReserveTips = (gis: number[], zoneName: string | undefined = activeZone?.name) => {
    if (!zoneName) return
    const msgs = gis.map((gi) => reserveTipText(gi, zoneName)).filter(Boolean)
    if (msgs.length) setTipQueue((q) => [...q, ...msgs])
  }
  function handleSelectAllZone() {
    if (!activeZone) { showToast('Please select a zone first.'); return }
    setDroppedMembers(new Set())
    const next = new Map(groupZoneMap)
    if (allZoneGroupsAssigned) {
      assignableZoneIdx.forEach((gi) => next.delete(gi))
      setGroupZoneMap(next)
    } else {
      const newlyReserved: number[] = []
      assignableZoneIdx.forEach((gi) => { if (!next.has(gi)) { next.set(gi, activeZone); newlyReserved.push(gi) } })
      setGroupZoneMap(next)
      enqueueReserveTips(newlyReserved, activeZone.name)
    }
  }
  /** Swap every group already in a different zone to the active one, in one action. Mirrors City
   *  Selection's swapAllToActiveCity, minus the cross-city capacity juggling — this only ever moves
   *  members between zones of the SAME city, so there's no "does it fit elsewhere" question. */
  function swapAllToActiveZone() {
    if (!activeZone) { showToast('Please select a zone first.'); return }
    const targets = swappableZoneGroups()
    if (targets.length === 0) { showToast('No reservations to swap.'); return }
    setGroupZoneMap((prev) => { const n = new Map(prev); targets.forEach((gi) => n.set(gi, activeZone)); return n })
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      targets.forEach((gi) => groups[gi]?.members.forEach((m) => n.delete(m.member.id)))
      return n
    })
    enqueueReserveTips(targets, activeZone.name)
  }

  useEffect(() => {
    const iv = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(iv)
  }, [])

  const totalAllocated = groups.reduce((sum, _g, gi) => sum + groupAllocCount(gi), 0)
  // Members the user could still allocate but hasn't — a whole group never given a zone, or a
  // dependent dropped from an allocated group. Globally-blocked groups (`notValidForCity`) are
  // excluded: they can never be allocated, so warning about them would be a dead end. Drives the
  // "you missed some members" confirmation on Confirm (mirrors the success view's unallocated count).
  const missedMemberCount = groups.reduce((n, g, gi) => {
    // Locked (already-zoned) groups are hidden in the request flow — they're not part of THIS request,
    // so they must not count as "missed" (which would block Request on the registrant's own zone).
    if (isRequest && isLockedGroup(gi)) return n
    if (g.members.some((m) => m.member.notValidForCity)) return n
    if (groupZoneMap.has(gi)) return n + g.members.filter((m) => droppedMembers.has(m.member.id)).length
    return n + g.members.length
  }, 0)

  function handleGroupToggle(groupIdx: number) {
    if (isAutoGroup(groupIdx)) return // already auto-allocated
    if (!activeZone && !groupZoneMap.has(groupIdx)) return
    const next = new Map(groupZoneMap)
    if (next.has(groupIdx)) {
      next.delete(groupIdx)
    } else if (activeZone) {
      next.set(groupIdx, activeZone)
    }
    setGroupZoneMap(next)
    // Reset any dropped members for this group on (de)allocation.
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      groups[groupIdx]?.members.forEach((m) => n.delete(m.member.id))
      return n
    })
  }

  /** Per-member zone toggle: the group's lead controls the whole group, but the dependent
   *  can be deselected independently (and is never allocated without its lead). */
  function toggleZoneMember(gi: number, memberId: string) {
    if (isAutoGroup(gi)) return // already auto-allocated
    const g = groups[gi]; if (!g) return
    const dep = g.members.find((mm) => mm.member.needsGuardian || mm.member.needsCaregiver)?.member
    const isDep = !!g.label && !!dep && memberId === dep.id
    // Guard: a member can't be allocated before a zone is chosen — surface a toast instead of a no-op.
    if (!groupZoneMap.has(gi) && !activeZone) { showToast('Please select a zone first.'); return }
    if (!groupZoneMap.has(gi)) { handleGroupToggle(gi); return }
    if (isDep) {
      setDroppedMembers((prev) => {
        const n = new Set(prev)
        if (n.has(memberId)) n.delete(memberId); else n.add(memberId)
        return n
      })
    } else {
      handleGroupToggle(gi)
    }
  }

  // ── Per-group Reserve / Remove (mirrors City Selection's active-city reserve) ──────────────
  /** The relay city a group was allocated to (shown in the read-only "Relay city" column). */
  const relayCityFor = (gi: number) => flow.groupCities[String(gi)]?.name ?? cityName
  /** Reserve the whole group to the currently-picked (active) zone. Reserving pulls the WHOLE group
   *  in together (guardian/caregiver + dependent), so any previously-dropped member is re-included. */
  function reserveGroupToActiveZone(gi: number) {
    if (isAutoGroup(gi)) return // already auto-allocated
    if (!activeZone) { showToast('Please select a zone first.'); return }
    setGroupZoneMap((prev) => { const n = new Map(prev); n.set(gi, activeZone); return n })
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      groups[gi]?.members.forEach((m) => n.delete(m.member.id))
      return n
    })
    enqueueReserveTips([gi], activeZone.name)
  }
  /** Remove a group's zone reservation. */
  function removeGroupZone(gi: number) {
    if (isAutoGroup(gi)) return
    setGroupZoneMap((prev) => { const n = new Map(prev); n.delete(gi); return n })
    setDroppedMembers((prev) => {
      if (!prev.size) return prev
      const n = new Set(prev)
      groups[gi]?.members.forEach((m) => n.delete(m.member.id))
      return n
    })
  }

  /** Commit the zone reservations and move to the success view. */
  function commitReserve() {
    if (isRequest) {
      // Missed-deadline path: file a zone request carrying the per-group allocation (one entry per city
      // for the Requested card + approval), pending admin approval — no direct confirm.
      const byCity = new Map<string, { cityId: string; cityName: string; zoneId: string; zoneName: string }>()
      groupZoneMap.forEach((z, gi) => {
        const c = flow.groupCities[gi] ?? flow.confirmedCity
        const cid = c?.id ?? cityId
        if (!byCity.has(cid)) byCity.set(cid, { cityId: cid, cityName: c?.name ?? cityName, zoneId: z.id, zoneName: z.name })
      })
      const zonesArr = [...byCity.values()]
      const label = zonesArr.map((z) => `${z.cityName} — ${z.zoneName}`).join(', ')
      if (id) requestReopen(id, 'zone', `Zone Selection — requested ${label}`, { zoneId: zonesArr[0]?.zoneId, label, zones: zonesArr })
      const msg = returnTo
        ? `Your zone selection request for ${label} has been submitted for approval. Track it under Ask Help.`
        : `Your zone selection request for ${label} has been submitted for approval. You'll find it in the Requested section below.`
      nav(returnTo ?? '/miqaats', { state: { requestSent: msg } })
      return
    }
    const zoneToConfirm = [...groupZoneMap.values()][0] ?? activeZone ?? zones[0]
    if (zoneToConfirm) confirmZoneAction(zoneToConfirm, cityId, cityName)
    // Persist group → zone so the Zone Allocation view can rebuild the allocation.
    const rec: Record<string, { id: string; name: string; cityId: string; cityName: string }> = {}
    groupZoneMap.forEach((z, gi) => { rec[gi] = { id: z.id, name: z.name, cityId, cityName } })
    setGroupZones(rec)
    if (id) setActiveMiqaat(id)
    setShowMissed(false)
    setView('success')
  }

  function handleReserve() {
    if (totalAllocated === 0) { showToast('Allocate at least one member to a zone before reserving.'); return }
    // Someone the user could still allocate is left out → confirm before proceeding without them.
    if (missedMemberCount > 0) { setShowMissed(true); return }
    commitReserve()
  }

  // ── Success View ─────────────────────────────────────────────────────────────

  if (view === 'success') {
    const byZone = new Map<string, { zone: Zone; groupIndices: number[] }>()
    for (const [gIdx, zone] of groupZoneMap) {
      const ex = byZone.get(zone.id)
      if (ex) ex.groupIndices.push(gIdx)
      else byZone.set(zone.id, { zone, groupIndices: [gIdx] })
    }
    const zoneGroups = [...byZone.values()]

    // Exclude dropped members (dependents opted out) from the confirmed allocation.
    const stripDropped = (g: Group): Group => ({ ...g, members: g.members.filter((m) => !droppedMembers.has(m.member.id)) })
    const tagOf = (t?: 'host' | 'relay') => (t === 'host' ? 'Host City' : t === 'relay' ? 'Relay City' : undefined) as 'Host City' | 'Relay City' | undefined
    const allocatedSections = (zoneGroups.length > 0
      ? zoneGroups.map(({ zone, groupIndices }) => {
          // Every group in a zone shares the same city → read it from the first group's allocation.
          const city = flow.groupCities[groupIndices[0]] ?? flow.confirmedCity ?? undefined
          return {
            name: zone.name,
            cityName: city?.name ?? cityName,
            typeLabel: tagOf(city?.type),
            count: groupIndices.reduce((n, gi) => n + groupAllocCount(gi), 0),
            groups: groupIndices.map((gi) => groups[gi]).filter(Boolean).map(stripDropped).filter((g) => g.members.length > 0),
          }
        })
      : [{ name: cityName, count: totalMembers, groups, typeLabel: tagOf(flow.confirmedCity?.type) }])

    // Members still without a zone: whole groups never allocated + individuals opted out of an
    // allocated group. Keep them visible so the user knows who still needs a zone.
    const unallocatedGroups: Group[] = groups
      .map((g, gi): Group | null => {
        if (!groupZoneMap.has(gi)) return g
        const dropped = g.members.filter((m) => droppedMembers.has(m.member.id))
        return dropped.length ? { ...g, label: undefined, members: dropped } : null
      })
      .filter((g): g is Group => g !== null)
    const unallocatedCount = unallocatedGroups.reduce((n, g) => n + g.members.length, 0)
    const confirmedSections =
      unallocatedCount > 0
        ? [
            ...allocatedSections,
            { name: 'Not allocated', count: unallocatedCount, groups: unallocatedGroups, unallocated: true, statusText: notAllocatedLabel('zone') },
          ]
        : allocatedSections
    // The "you can still allocate them until …" notice is only relevant for members who CAN yet be
    // allocated — a globally not-valid member never can be, no matter how long they wait, so their
    // presence in the "Not allocated" list shouldn't trigger it (matches CitySelection's same rule).
    // The flag lives on the guardian/caregiver, not the dependent, so this must be a GROUP-level
    // check — excluding only the flagged member would still count their (per se valid) dependent.
    const allocatableUnallocatedCount = unallocatedGroups.reduce(
      (n, g) => (g.members.some((m) => m.member.notValidForCity) ? n : n + g.members.length), 0,
    )
    const unallocatedNotice = allocatableUnallocatedCount > 0 ? { stage: 'zone' as const, closesAt: allocationCloses.zone } : null

    const successFooter = (
      <StickyFooter
        caption={t('Zone confirmed')}
        title={t(plural(totalMembers, '{city} · {n} member', '{city} · {n} members'), { city: tdText(cityName), n: totalMembers })}
        button={t('Done')}
        onButton={() => nav('/miqaats')}
      />
    )

    return (
      <PhoneScreen footer={<div className="sm:hidden">{successFooter}</div>}>
        {/* AppBar */}
        <div>
          <AppBar notificationCount={3} />
        </div>

        {/* ═══════════════════════ DESKTOP — two-panel confirmed ═══════════════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <ConfirmedView
            title={t('Zone Confirmed')}
            footerCaption="Zone confirmed"
            reference={flow.referenceNumber ?? 'MIQ-23106'}
            infoLabel={t('Raza issues on')}
            infoValue={<><DateLine value="15 June 2026" hijri={false} />{', '}<TimeLine value="09:00 AM IST" /></>}
            membersAllocated={totalAllocated || totalMembers}
            sections={confirmedSections}
            unallocatedNotice={unallocatedNotice}
            onBack={() => nav('/miqaats')}
            onDone={() => nav('/miqaats')}
          />
        </div>

        {/* ═══════════════════════ MOBILE — unchanged single-column flow ═══════════════════════ */}
        <div className="contents sm:hidden">
        {/* Back link */}
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

        {/* Checkmark + Title */}
        <div className="flex flex-col items-center mt-[20px] mb-[20px]">
          <div className="size-[56px] rounded-full bg-[#1f5a44] flex items-center justify-center mb-[12px]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[28px]">
              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-[26px] leading-[34px] text-[#1f5a44]" style={{ fontFamily: SERIF }} {...tx('Zone Confirmed')} />
        </div>

        {/* Info rows */}
        <div className="mx-[16px] sm:mx-0 overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white mb-[20px]">
          <div className="flex items-center justify-between px-[14px] py-[12px] border-b border-[#f0ebe0]">
            <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Registration status')} />
            <span
              className="inline-flex items-center gap-[5px] rounded-full px-[10px] py-[3px] text-[11px] font-bold"
              style={{ background: '#e4efe7', color: '#276245', fontFamily: FONT }}
            >
              <span className="size-[5px] rounded-full bg-[#276245]" />
              
              {t('Allocated')}
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
              {String(totalMembers).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Mobile: zone sections with group cards (each carries its city + Host/Relay tag) */}
        <div className="mx-[16px] sm:mx-0 mb-[100px] flex flex-col gap-[16px] sm:hidden">
          {zoneGroups.length === 0 ? (
            groups.map((g, i) => <SuccessGroupCard key={i} group={g} />)
          ) : (
            zoneGroups.map(({ zone, groupIndices }) => {
              const city = flow.groupCities[groupIndices[0]] ?? flow.confirmedCity
              return (
              <div key={zone.id}>
                <div className="mb-[8px] flex flex-wrap items-center gap-x-[6px] gap-y-[4px]">
                  <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{city?.name ?? cityName}</span>
                  {city?.type && <CityKindTag type={city.type} />}
                  <span className="text-[13px] font-bold text-[#5a6660]" style={{ fontFamily: FONT }}>· {zone.name}</span>
                  <span className="text-[13px] font-normal text-[#8a938e]" style={{ fontFamily: FONT }}>· {groupIndices.reduce((sum, i) => sum + groupAllocCount(i), 0)} members</span>
                </div>
                <div className="flex flex-col gap-[8px]">
                  {groupIndices.map((gIdx) => groups[gIdx] && stripDropped(groups[gIdx]).members.length > 0 && (
                    <SuccessGroupCard key={gIdx} group={stripDropped(groups[gIdx])} />
                  ))}
                </div>
              </div>
              )
            })
          )}

          {/* Members still awaiting a zone — shown as cards so they stay visible */}
          {unallocatedCount > 0 && (
            <div>
              <p className="mb-[8px] flex items-center gap-[6px] text-[13px] font-bold text-[#8a4b22]" style={{ fontFamily: FONT }}>
                <svg viewBox="0 0 24 24" fill="none" className="size-[15px] shrink-0">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#d2632b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                
                {t('Not allocated')}
                <span className="font-normal text-[#8a938e]">· {unallocatedCount} members</span>
              </p>
              <div className="flex flex-col gap-[8px]">
                {unallocatedGroups.map((g, i) => (
                  <SuccessGroupCard key={`u${i}`} group={g} statusText={notAllocatedLabel('zone')} />
                ))}
              </div>
            </div>
          )}
          {unallocatedNotice && <UnallocatedNotice stage={unallocatedNotice.stage} closesAt={unallocatedNotice.closesAt} />}
        </div>
        </div>{/* ── end mobile ── */}
      </PhoneScreen>
    )
  }

  // ── Browse View ───────────────────────────────────────────────────────────────

  const browseFooter = (
    <StickyFooter
      dataTour="reserve-confirm"
      caption={t('Allocate')}
      title={<>{t('Close in')} <span style={{ color: '#b8821e' }}>{fmtHHMMSS(timer)}</span></>}
      button={isRequest ? t('Request') : totalAllocated > 0 ? t('Confirm ({n})', { n: totalAllocated }) : t('Confirm')}
      onButton={handleReserve}
    >
      {/* Allocated count + "Who's in which zone" — mobile only (web shows the full table already) */}
      {totalAllocated > 0 && (
        <div className="flex items-center justify-between mb-[8px] px-[2px] sm:hidden">
          <div className="flex items-center gap-[5px]">
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px]">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM2 8a2 2 0 114 0 2 2 0 01-4 0zM15.5 17c0-2.21-2.46-4-5.5-4s-5.5 1.79-5.5 4M17 17c0-1.54-1.12-2.87-2.75-3.5M3 17c0-1.54 1.12-2.87 2.75-3.5" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[14px] font-bold text-[#15402f]" style={{ fontFamily: FONT }}>
              {totalAllocated}/{totalMembers}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowWhosWhere(true)}
            className="flex items-center gap-[5px] rounded-full border border-[#23302a] px-[12px] h-[32px]"
          >
            <span className="text-[12px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...tx('Who\'s in which zone')} />
            <svg viewBox="0 0 16 16" fill="none" className="size-[10px]">
              <path d="M4 10l4-4 4 4" stroke="#23302a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </StickyFooter>
  )

  return (
    <PhoneScreen footer={<div className="sm:hidden">{browseFooter}</div>}>
      {/* validation toast (select-zone-first / nothing-allocated) */}
      <Toast toast={toast} />
      <ReserveTip tip={activeTip} />

      {/* AppBar */}
      <div>
        <AppBar notificationCount={3} />
      </div>

      {/* ═══════════════════════ MOBILE — unchanged single-column flow ═══════════════════════ */}
      <div className="contents sm:hidden">
      {/* Breadcrumb (shared component → consistent Home + Go-back) */}
      <div className="mx-[16px] sm:mx-0 mt-[10px] mb-[14px]">
        <Breadcrumb
          items={[{ label: 'Home', to: '/miqaats' }, { label: t('Zone selection') }]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      {/* Title */}
      <h1
        className="mx-[16px] sm:mx-0 text-[22px] leading-[30px] text-[#15402f] mb-[16px]"
        style={{ fontFamily: SERIF }} {...tx('Zone Selection')} />

      {/* City tabs (horizontal scroll) */}
      <div
        className="overflow-x-auto ps-[16px] sm:ps-0 pe-[16px] mb-[18px]"
        style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
      >
        <div className="flex gap-[10px] w-max">
          {cityTabs.map((city, i) => (
            <CityTab
              key={city.id}
              name={city.name}
              memberCount={city.memberCount}
              type={city.type}
              active={activeCityTab === i}
              onClick={() => { setActiveCityTab(i); setActiveZone(null) }}
            />
          ))}
        </div>
      </div>

      {/* Zones section heading */}
      <div className="mx-[16px] sm:mx-0 flex items-center justify-between mb-[10px]">
        <p className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
          {cityTabs[activeCityTab]?.name} zones
        </p>
        <button type="button" onClick={() => setShowAllZones(true)} className="text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }} {...tx('View all →')} />
      </div>

      {/* Zone cards (horizontal scroll) */}
      <div
        data-tour="zone-list"
        className="overflow-x-auto ps-[16px] sm:ps-0 pe-[16px] mb-[14px]"
        style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
      >
        <div className="flex gap-[10px] w-max">
          {zones.map((zone) => (
            <ZoneHCard
              key={zone.id}
              zone={zone}
              selected={activeZone?.id === zone.id}
              onSelect={() => setActiveZone(zone)}
            />
          ))}
        </div>
      </div>

      {/* Action bar (mobile) — the "selected zone" banner. Only STICKY when the active tab has more
          than one group card to scroll past; with a single card the pinned shadow looks like clutter. */}
      <div className={visibleIdx.length > 1 ? 'sticky top-0 z-20 bg-white pt-[6px] pb-[12px] shadow-[0_8px_14px_-12px_rgba(15,77,60,0.4)]' : 'pt-[6px] pb-[12px]'}>
      {/* Member count + Reserve all / Swap all — same pattern as City Selection's mobile action bar.
          Reserve all hides while a swap is pending (ambiguous otherwise); Swap all only appears once
          at least one visible group is already in a different zone than the active one. */}
      {activeZone && assignableZoneIdx.length > 1 && (showReserveAllZone || anyZoneSwappable) && (
        <div className="mx-[16px] sm:mx-0 mb-[10px] flex items-center justify-between">
          <div className="flex items-center gap-[6px]">
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px]">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM2 8a2 2 0 114 0 2 2 0 01-4 0zM15.5 17c0-2.21-2.46-4-5.5-4s-5.5 1.79-5.5 4M17 17c0-1.54-1.12-2.87-2.75-3.5M3 17c0-1.54 1.12-2.87 2.75-3.5" stroke="#b8821e" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[14px] font-bold text-[#b8821e]" style={{ fontFamily: FONT }}>{totalMembers} members</span>
          </div>
          {showReserveAllZone ? (
            <button type="button" onClick={handleSelectAllZone}
              className={`h-[32px] rounded-full px-[14px] text-[13px] font-bold transition-colors ${
                allZoneGroupsAssigned
                  ? 'border border-[#e0b0aa] bg-white text-[#c0392b] hover:bg-[#fdf3f2]'
                  : 'bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] reserve-all-glow'
              }`}
              style={{ fontFamily: FONT }}>
              {allZoneGroupsAssigned ? t('Remove all') : 'Select all'}
            </button>
          ) : (
            <button type="button" onClick={swapAllToActiveZone}
              className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[14px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
              style={{ fontFamily: FONT }}>
              <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="truncate">Swap all to {activeZone.name}</span>
            </button>
          )}
        </div>
      )}
      {/* Allocation banner — same pill + copy as the desktop panel's "Selected zone X — select
          members below" (and City Selection's matching pill), instead of a differently-styled
          banner that also silently disappeared with no message when no zone was picked yet. */}
      <div
        className="mx-[16px] sm:mx-0 flex items-center gap-[8px] rounded-[12px] border px-[14px] py-[12px]"
        style={{ background: '#fdf1e2', borderColor: '#f1d7b6' }}
      >
        <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
          <path d="M9 16.4995C7.675 16.4995 6.59375 16.2901 5.75625 15.8714C4.91875 15.4526 4.5 14.912 4.5 14.2495C4.5 14.012 4.55313 13.7933 4.65938 13.5933C4.76563 13.3933 4.925 13.2058 5.1375 13.0308C5.3125 12.9058 5.50313 12.8558 5.70938 12.8808C5.91563 12.9058 6.08125 13.0058 6.20625 13.1808C6.33125 13.3558 6.37813 13.5464 6.34688 13.7526C6.31563 13.9589 6.2125 14.1245 6.0375 14.2495C6.2 14.4495 6.575 14.6245 7.1625 14.7745C7.75 14.9245 8.3625 14.9995 9 14.9995C9.6375 14.9995 10.25 14.9245 10.8375 14.7745C11.425 14.6245 11.8 14.4495 11.9625 14.2495C11.7875 14.1245 11.6844 13.9589 11.6531 13.7526C11.6219 13.5464 11.6688 13.3558 11.7938 13.1808C11.9188 13.0058 12.0844 12.9058 12.2906 12.8808C12.4969 12.8558 12.6875 12.9058 12.8625 13.0308C13.075 13.2058 13.2344 13.3933 13.3406 13.5933C13.4469 13.7933 13.5 14.012 13.5 14.2495C13.5 14.912 13.0813 15.4526 12.2438 15.8714C11.4063 16.2901 10.325 16.4995 9 16.4995ZM9.01875 12.3745C10.2563 11.462 11.1875 10.5464 11.8125 9.62764C12.4375 8.70889 12.75 7.78701 12.75 6.86201C12.75 5.58701 12.3438 4.62451 11.5313 3.97451C10.7188 3.32451 9.875 2.99951 9 2.99951C8.125 2.99951 7.28125 3.32451 6.46875 3.97451C5.65625 4.62451 5.25 5.58701 5.25 6.86201C5.25 7.69951 5.55625 8.57139 6.16875 9.47764C6.78125 10.3839 7.73125 11.3495 9.01875 12.3745ZM8.55 13.8183C8.4 13.7683 8.2625 13.6933 8.1375 13.5933C6.6625 12.4183 5.5625 11.2714 4.8375 10.1526C4.1125 9.03389 3.75 7.93701 3.75 6.86201C3.75 5.97451 3.90937 5.19639 4.22813 4.52764C4.54688 3.85889 4.95625 3.29951 5.45625 2.84951C5.95625 2.39951 6.51875 2.06201 7.14375 1.83701C7.76875 1.61201 8.3875 1.49951 9 1.49951C9.6125 1.49951 10.2313 1.61201 10.8563 1.83701C11.4813 2.06201 12.0438 2.39951 12.5438 2.84951C13.0438 3.29951 13.4531 3.85889 13.7719 4.52764C14.0906 5.19639 14.25 5.97451 14.25 6.86201C14.25 7.93701 13.8875 9.03389 13.1625 10.1526C12.4375 11.2714 11.3375 12.4183 9.8625 13.5933C9.7375 13.6933 9.6 13.7683 9.45 13.8183C9.3 13.8683 9.15 13.8933 9 13.8933C8.85 13.8933 8.7 13.8683 8.55 13.8183ZM9 8.24951C9.4125 8.24951 9.76563 8.10264 10.0594 7.80889C10.3531 7.51514 10.5 7.16201 10.5 6.74951C10.5 6.33701 10.3531 5.98389 10.0594 5.69014C9.76563 5.39639 9.4125 5.24951 9 5.24951C8.5875 5.24951 8.23438 5.39639 7.94063 5.69014C7.64688 5.98389 7.5 6.33701 7.5 6.74951C7.5 7.16201 7.64688 7.51514 7.94063 7.80889C8.23438 8.10264 8.5875 8.24951 9 8.24951Z" fill="#c8842a" />
        </svg>
        {activeZone ? (
          <p className="text-[13px] font-semibold leading-[18px]" style={{ fontFamily: FONT, color: '#9a6a1e' }}>
            {/* "Selected zone" stays an inline literal: it has no wordlist row, and wrapping it in
                an <Iso> turns it into a scanner-visible UNROUTED string that fails check:lsd. It
                is not a reported bidi violation either — the zone name and trailing phrase beside
                it are what needed bounding. Routing it needs an xlsx row first. */}
            Selected zone <strong className="font-bold text-[#1f5a44]" {...td(activeZone.name)} /> <Iso>— select members below</Iso>
          </p>
        ) : (
          <p className="text-[13px] font-bold" style={{ fontFamily: FONT, color: '#9a6a1e' }} {...tx('Select a zone above to start allocating your members')} />
        )}
      </div>
      </div>{/* end sticky action bar */}

      {/* Mobile: member cards. Single city → a flat list; multiple cities → one section per city in a
          stable order, the active city interactive and the others the same card shown disabled (tap
          to make that city active in place), so no member sitting under another city gets forgotten. */}
      {multiCity ? (
        <div data-tour="zone-members" className="mx-[16px] sm:mx-0 mb-[16px] flex flex-col gap-[20px] sm:hidden">
          {cityTabs.map((tab, ci) => {
            const idx = groupIdxForCity(tab.id)
            if (idx.length === 0) return null
            const isActive = ci === activeCityTab
            // Dim + prompt only a non-active city that still has members to allocate; a fully reserved
            // city stays full-strength even when it isn't active (its members are already done).
            const hasPending = idx.some((gi) => !groupZoneMap.has(gi))
            const dimmed = !isActive && hasPending
            return (
              <div key={tab.id} className="flex flex-col gap-[10px]">
                <CityHeader name={tab.name} type={tab.type} count={tab.memberCount} />
                {dimmed && (
                  <p className="text-[12px] font-semibold text-[#a8843e]" style={{ fontFamily: FONT }} {...tx('Select this city to choose a zone for them')} />
                )}
                <div
                  className={isActive ? 'flex flex-col gap-[10px]' : 'flex flex-col gap-[10px] cursor-pointer'}
                  onClick={isActive ? undefined : () => { setActiveCityTab(ci); setActiveZone(null) }}
                >
                  <div className="flex flex-col gap-[10px]" style={isActive ? undefined : { opacity: dimmed ? 0.5 : 1, pointerEvents: 'none' }}>
                    {idx.map((i) => (
                      <AllocateGroupCard
                        key={i}
                        group={groups[i]}
                        assignedZone={groupZoneMap.get(i) ?? null}
                        activeZone={isActive ? activeZone : null}
                        memberChecked={(mid) => memberAllocated(i, mid)}
                        onToggleMember={(mid) => toggleZoneMember(i, mid)}
                        onReserve={() => reserveGroupToActiveZone(i)}
                        onRemove={() => removeGroupZone(i)}
                        autoAllocated={isAutoGroup(i)}
                        swapTarget={isActive ? zoneSwapTargetFor(i) : null}
                        isRequest={isRequest}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div data-tour="zone-members" className="mx-[16px] sm:mx-0 mb-[16px] flex flex-col gap-[10px] sm:hidden">
          {visibleIdx.map((i) => {
            const g = groups[i]
            if (!g) return null
            return (
              <AllocateGroupCard
                key={i}
                group={g}
                assignedZone={groupZoneMap.get(i) ?? null}
                activeZone={activeZone}
                memberChecked={(mid) => memberAllocated(i, mid)}
                onToggleMember={(mid) => toggleZoneMember(i, mid)}
                onReserve={() => reserveGroupToActiveZone(i)}
                onRemove={() => removeGroupZone(i)}
                autoAllocated={isAutoGroup(i)}
                swapTarget={zoneSwapTargetFor(i)}
                isRequest={isRequest}
              />
            )
          })}
        </div>
      )}

      {/* Mobile: members still without any city (e.g. globally blocked) — surfaced, not hidden */}
      {cityUnallocatedIdx.length > 0 && (
        <div className="mx-[16px] sm:mx-0 mb-[16px] flex flex-col gap-[10px] sm:hidden">
          <p className="text-[13px] font-bold text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Not allocated to a city yet')} />
          {cityUnallocatedIdx.map((gi) => (
            <CityMissingCard key={gi} group={groups[gi]} />
          ))}
        </div>
      )}

      </div>{/* ── end mobile ── */}

      {/* ═══════════════════════ DESKTOP — two-panel (cream sidebar + white panel) ═══════════════════════ */}
      <div className="hidden sm:block sm-full-bleed">
        <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">
          {/* ───── LEFT sidebar ───── */}
          <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[24px] overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">
            <Breadcrumb
              items={[{ label: 'Home', to: '/miqaats' }, { label: t('Zone selection') }]}
              onNavigate={(to) => nav(to)}
              onBack={() => nav(-1)}
              activeColor="#a8843e"
              dense
            />
            {isRequest && <SlotClosedCard />}
            <div data-tour="zone-list">
              <ZoneSidebarCard
                cityTabs={cityTabs}
                activeCityTab={activeCityTab}
                onSelectTab={(i) => { setActiveCityTab(i); setActiveZone(null) }}
                cityName={cityName}
                zones={zones}
                activeZoneId={activeZone?.id ?? null}
                onSelectZone={(z) => setActiveZone(z)}
                search={sidebarSearch}
                onSearch={setSidebarSearch}
                bulkAction={
                  activeZone && assignableZoneIdx.length > 1
                    ? anyZoneSwappable
                      ? { kind: 'swap', destName: activeZone.name, onClick: swapAllToActiveZone }
                      : { kind: allZoneGroupsAssigned ? 'remove' : 'reserve', onClick: handleSelectAllZone }
                    : undefined
                }
              />
            </div>
          </aside>

          {/* ───── RIGHT panel ───── */}
          <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
              <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Zone Selection')} />
              <p className="mt-[6px] text-[15px] leading-[21px] text-[#6b7670]" style={{ fontFamily: FONT }} {...tx('Pick a city, then a zone, then choose who to reserve.')} />
              <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
                <StepIndicator
                  steps={[
                    { label: t('City'), done: true },
                    { label: t('Zone'), done: activeZone !== null || groupZoneMap.size > 0 },
                    { label: t('Members'), count: `${totalAllocated}/${totalMembers}`, done: totalAllocated > 0 },
                  ]}
                />
                {/* Once a zone is picked, prompt the user to allocate members to it — mirrors
                    City Selection's "Selected host/relay city X — select members below" pill. */}
                {activeZone && (
                  <span className="inline-flex h-[36px] items-center gap-[8px] rounded-full border px-[15px]" style={{ background: '#fdf1e2', borderColor: '#f1d7b6' }}>
                    <PinIcon color="#c8842a" size={16} />
                    <span className="text-[14px] font-semibold" style={{ fontFamily: FONT, color: '#9a6a1e' }}>
                      {/* "Selected zone" stays an inline literal: it has no wordlist row, and wrapping it in
                an <Iso> turns it into a scanner-visible UNROUTED string that fails check:lsd. It
                is not a reported bidi violation either — the zone name and trailing phrase beside
                it are what needed bounding. Routing it needs an xlsx row first. */}
            Selected zone <strong className="font-bold text-[#1f5a44]" {...td(activeZone.name)} /> <Iso>— select members below</Iso>
                    </span>
                  </span>
                )}
              </div>
              {multiCity ? (
                // One section per allocated city, in a STABLE order — the active city's table is
                // interactive, the others are the same table shown disabled. Tapping a disabled city
                // makes it active in place (nothing jumps to the top), so no member gets forgotten.
                <div data-tour="zone-members" className="mt-[20px] flex flex-col gap-[26px]">
                  {cityTabs.map((tab, ci) => {
                    const idx = groupIdxForCity(tab.id)
                    if (idx.length === 0) return null
                    const isActive = ci === activeCityTab
                    // Dim + prompt only a non-active city that still has members to allocate. A fully
                    // reserved city is "done", so it stays full-strength even when it isn't active.
                    const hasPending = idx.some((gi) => !groupZoneMap.has(gi))
                    const dimmed = !isActive && hasPending
                    return (
                      <div key={tab.id}>
                        <CityHeader name={tab.name} type={tab.type} count={tab.memberCount} />
                        {dimmed && (
                          <p className="mt-[5px] text-[13px] font-semibold text-[#a8843e]" style={{ fontFamily: FONT }} {...tx('Select this city to choose a zone for them')} />
                        )}
                        <div
                          className={isActive ? 'mt-[14px]' : 'mt-[14px] cursor-pointer'}
                          style={dimmed ? { opacity: 0.5 } : undefined}
                          onClick={isActive ? undefined : () => { setActiveCityTab(ci); setActiveZone(null) }}
                        >
                          <ZoneBrowseDesktopTable
                            groups={groups}
                            visibleIdx={idx}
                            groupZoneMap={groupZoneMap}
                            onToggleMember={toggleZoneMember}
                            memberChecked={memberAllocated}
                            activeZone={isActive ? activeZone : null}
                            onReserveGroup={reserveGroupToActiveZone}
                            onRemoveGroup={removeGroupZone}
                            isAutoGroup={isAutoGroup}
                            disabled={!isActive}
                            cityName={tab.name}
                            swapTargetFor={isActive ? zoneSwapTargetFor : undefined}
                            isRequest={isRequest}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div data-tour="zone-members" className="mt-[20px]">
                  <ZoneBrowseDesktopTable
                    groups={groups}
                    visibleIdx={visibleIdx}
                    groupZoneMap={groupZoneMap}
                    onToggleMember={toggleZoneMember}
                    memberChecked={memberAllocated}
                    activeZone={activeZone}
                    onReserveGroup={reserveGroupToActiveZone}
                    onRemoveGroup={removeGroupZone}
                    isAutoGroup={isAutoGroup}
                    cityName={cityName}
                    swapTargetFor={zoneSwapTargetFor}
                    isRequest={isRequest}
                  />
                </div>
              )}

              {cityUnallocatedIdx.length > 0 && (
                <div className="mt-[20px] flex flex-col gap-[10px]">
                  <p className="text-[13px] font-bold text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Not allocated to a city yet')} />
                  <div className="flex flex-col gap-[10px]">
                    {cityUnallocatedIdx.map((gi) => (
                      <CityMissingCard key={gi} group={groups[gi]} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0">
              <StickyFooter
                dataTour="reserve-confirm"
                caption={t('Allocation')}
                title={<>{t('Close in')} <span style={{ color: '#b8821e' }}>{fmtHHMMSS(timer)}</span></>}
                button={isRequest ? t('Request') : totalAllocated > 0 ? t('Confirm ({n})', { n: totalAllocated }) : t('Confirm')}
                onButton={handleReserve}
              />
            </div>
          </section>
        </div>
      </div>

      {/* All zones sheet (from "View all") */}
      {showAllZones && (
        <AllZonesSheet
          cityName={cityName}
          zones={zones}
          activeZoneId={activeZone?.id ?? null}
          onSelect={(z) => setActiveZone(z)}
          onClose={() => setShowAllZones(false)}
        />
      )}

      {/* Who's in which zone sheet */}
      <WhosWhereSheet
        open={showWhosWhere}
        onClose={() => setShowWhosWhere(false)}
        groups={groups}
        groupZoneMap={groupZoneMap}
        cityName={cityName}
        totalMembers={totalMembers}
      />

      {/* "you missed some members" confirmation — shown when Confirm leaves someone unallocated */}
      <MissedMemberSheet
        open={showMissed}
        onClose={() => setShowMissed(false)}
        onConfirm={commitReserve}
        count={missedMemberCount}
        context="zone"
      />
    </PhoneScreen>
  )
}
