import { useState, useEffect, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { Count, Iso, isolateRuns } from '../components/Bidi'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import BottomSheet from '../components/figma/BottomSheet'
import StickyFooter from '../components/figma/StickyFooter'
import { family, genderByIts, liveCities, zonesByCityId, miqaats } from '../data/seed'
import type { FamilyMember, LiveCity } from '../data/seed'
import { bandLabel, buildAllGroups, type BadgeKind, type Group } from '../lib/group'
import RoleBadge from '../components/figma/RoleBadge'
import Checkbox from '../components/figma/Checkbox'
import StepIndicator from '../components/figma/StepIndicator'
import Toast, { useToast } from '../components/figma/Toast'
import { HostCityCard } from './CitySelection'
import { useStore, journeyFor, type ChangeRequest, type GroupCityAlloc, type GroupZoneAlloc } from '../store'
import { plural, useT, tNow } from '../i18n'
import { memberTableMinWidth } from '../components/memberTable'
import { notLanguage } from '../components/NotLanguage'

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

const CITY = 'Mumbai'
const CURRENT_ZONE = 'Zone A - Main Hall'

type Zone = { id: string; name: string; left: number }
type City = { id: string; name: string; left: number; zones: Zone[]; region?: string; type: 'host' | 'relay' }

/** Real city → local `City` shape, real zones from `zonesByCityId` → local `Zone` shape — so this
 *  screen reads the SAME underlying data City Selection does (real regions for country-grouping,
 *  real seat counts, real zone lists, real type) instead of a separate fabricated list with its own
 *  id space. `type` is the city's OWN real type (host/relay) — independent of which SLOT it sits in;
 *  an arrangement can put a relay city in the host slot, so "is it in the host slot" and "is it a
 *  real host city" are two different questions (mirrors City Selection's own Host card, which reads
 *  the same city.type for its "Host city"/"Relay city" label). */
function toLocalCity(c: LiveCity): City {
  return {
    id: c.id,
    name: c.name,
    left: c.seatsLeft,
    region: c.region,
    type: c.type,
    zones: (zonesByCityId[c.id] ?? []).map((z) => ({ id: z.id, name: z.name, left: z.capacity - z.filled })),
  }
}

type Allocation = { cityId: string; cityName: string; zoneId: string; zoneName: string }

// ── helpers ──────────────────────────────────────────────────────────────────
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

/** `LiveCity.region` is a mix of Indian states and direct country names — map states to "India" so
 *  the relay grid groups into the SAME countries as City Selection / Edit-layout (same source data,
 *  same helper, kept in sync across all three files). */
const REGION_TO_COUNTRY: Record<string, string> = {
  Maharashtra: 'India', 'Tamil Nadu': 'India', 'Madhya Pradesh': 'India', 'West Bengal': 'India',
  Telangana: 'India', Delhi: 'India', Gujarat: 'India', Kerala: 'India', Karnataka: 'India', 'Uttar Pradesh': 'India',
  Rajasthan: 'India',
  USA: 'United States', UK: 'United Kingdom', UAE: 'United Arab Emirates',
}
const countryOf = (c: City) => REGION_TO_COUNTRY[c.region ?? ''] ?? c.region ?? 'Other'

const age2 = (n: number) => String(n).padStart(2, '0')

function familyMeta(relation: string, age: number, its: string, gender?: string) {
  // Gender prefers an explicit value (invited Mehmaan/Others carry it) over the family-only lookup.
  // A blank relation (an invited primary) drops the leading tag instead of showing a stray "·".
  const g = gender ?? genderByIts(its)
  const base = `${g ? `${g} · ` : ''}${tNow('Age')} ${age2(age)} · ${tNow('ITS')} ${its}`
  return isolateRuns(relation ? `${relation} · ${base}` : base)
}

function fmtHHMMSS(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function seatColor(left: number) {
  return left <= 0 ? '#8a938e' : left <= 15 ? '#b23b3b' : '#1f5a44'
}

// ── atoms ──────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="text-white font-bold" style={{ fontSize: size * 0.36, fontFamily: FONT, lineHeight: 1 }} {...notLanguage}>{initials(name)}</span>
    </div>
  )
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0">
      <path d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699"
        stroke="#2e6a7d" strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PinIcon({ color = '#1f5a44', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M12 2C8.69 2 6 4.69 6 8c0 5.25 6 12 6 12s6-6.75 6-12c0-3.31-2.69-6-6-6zm0 8.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill={color} />
    </svg>
  )
}

/** Same gold star used above City Selection's "Top preferred city" / "My Preferred City" headers. */
function PreferredStarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
      <path d="M12 3.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.5l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76L12 3.5Z" stroke="#c2a04e" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
      <path d="M12 3l7 2.6v5.1c0 4.4-3 7.4-7 8.9-4-1.5-7-4.5-7-8.9V5.6L12 3z" stroke="#1f7a4d" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 11.8l2.1 2.1L15 10" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PeopleMini({ color = '#5a6660' }: { color?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[15px] shrink-0">
      <path d="M14 17v-1.5a3 3 0 00-3-3H5a3 3 0 00-3 3V17M8 9.5a3 3 0 100-6 3 3 0 000 6zM18 17v-1.5a3 3 0 00-2.25-2.9M13 3.6a3 3 0 010 5.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PersonAddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
      <path d="M14 17.5v-1.667A3.333 3.333 0 0010.667 12.5H5.333A3.333 3.333 0 002 15.833V17.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9.167a3.333 3.333 0 100-6.667 3.333 3.333 0 000 6.667zM18 7v5M20.5 9.5h-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Radio({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="size-[24px] shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center">
      <svg viewBox="0 0 12 10" fill="none" className="size-[11px]"><path d="M1 5l3 3L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  ) : (
    <span className="size-[24px] shrink-0 rounded-full border-2 border-[#d9c98a]" />
  )
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0">
      <path d="M10 3.2L17.5 16.5a1 1 0 01-.87 1.5H3.37a1 1 0 01-.87-1.5L10 3.2z" stroke="#c2922a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 8.2v3.1M10 13.7h.01" stroke="#c2922a" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function Chevron({ color = '#1f5a44' }: { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[15px]">
      <path d="M6 4l4 4-4 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── ZoneHCard (horizontal zone chip) ───────────────────────────────────────────
function ZoneHCard({ zone, selected, onSelect }: { zone: Zone; selected: boolean; onSelect: () => void }) {
  const { t, td } = useT()
  const isFull = zone.left <= 0
  return (
    <button type="button" onClick={!isFull ? onSelect : undefined}
      className="shrink-0 flex flex-col items-start px-[16px] py-[14px] rounded-[14px] transition-colors min-w-[168px]"
      style={{
        border: selected ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9',
        background: selected ? '#fffdf5' : isFull ? '#f7f7f7' : 'white',
        opacity: isFull ? 0.55 : 1,
      }}>
      <span className="text-[15px] leading-[20px] text-[#23302a] text-start font-bold" style={{ fontFamily: FONT }} {...td(zone.name)} />
      <span className="text-[14px] leading-[18px] mt-[4px] font-bold" style={{ fontFamily: FONT, color: seatColor(zone.left) }}>
        {isFull ? t('Full') : t('{n} spots left', { n: zone.left })}
      </span>
    </button>
  )
}

// ── CityHCard (relay city chip) ────────────────────────────────────────────────
function CityHCard({ city, selected, added, onSelect }: { city: City; selected: boolean; added: number; onSelect: () => void }) {
  const { tx, td } = useT()
  const isFull = city.left <= 0
  return (
    <button type="button" onClick={!isFull ? onSelect : undefined}
      className="shrink-0 flex flex-col items-start px-[16px] py-[12px] rounded-[14px] transition-colors min-w-[150px]"
      style={{
        border: selected ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9',
        background: selected ? '#fffdf5' : isFull ? '#f5f5f3' : 'white',
        opacity: isFull ? 0.7 : 1,
      }}>
      <span className="flex items-center gap-[5px]">
        <span className="text-[16px] leading-[20px] text-[#23302a] font-bold" style={{ fontFamily: FONT }} {...td(city.name)} />
        {city.type === 'host' && (
          <span className="shrink-0 rounded-full px-[5px] py-[1px] text-[9px] font-bold uppercase leading-[12px] tracking-[0.2px]" style={{ background: '#f7efd6', color: '#a8843e' }} {...tx('Host')} />
        )}
      </span>
      {isFull ? (
        <span className="mt-[5px] text-[13px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Not available')} />
      ) : (selected || added > 0) ? (
        <span className="mt-[5px] flex items-center gap-[5px] text-[13px] leading-[16px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          <PeopleMini /> {added} added
        </span>
      ) : (
        <span className="mt-[5px] text-[13px] leading-[16px] text-[#1f7a4d]" style={{ fontFamily: FONT }} {...tx('Available')} />
      )}
    </button>
  )
}

// ── LocBox (CURRENT / NEW destination) ─────────────────────────────────────────
// `onClick`/`active` are GONE. They rendered a chevron and made the box a button that opened a
// zone picker, and the comment below claimed that was the zone-move behaviour — but no caller has
// ever passed them, and the zone-move branch says in its own comment that the NEW box is a plain
// display because the zone is chosen from the chips above. Dead branch, misleading comment.
function LocBox({ label, line, sublabel, accent, highlight, onRemove }: { label: string; line: string; sublabel?: string; accent?: boolean; highlight?: boolean; onRemove?: () => void }) {
  const { t, td } = useT()
  // `highlight` = a destination is chosen but this member hasn't been placed there yet — draw the
  // eye to the empty NEW box (dashed gold + soft ring) so it's clear the user still has to pick here.
  const emphasised = accent || highlight
  const cls = `flex-1 rounded-[12px] border px-[12px] py-[10px] text-left transition-colors ${highlight ? 'border-dashed ring-2 ring-[#f2e2b8]' : ''}`
  const style = { borderColor: emphasised ? '#c5a84d' : '#e7dfc9', background: emphasised ? '#fffdf5' : '#faf9f5' }
  const body = (
    <>
      <div className="flex items-center justify-between gap-[8px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#8a938e]" style={{ fontFamily: FONT }}>{isolateRuns(label)}</p>
        {onRemove ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label={t('Remove')}
            className="flex size-[20px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
            <svg viewBox="0 0 20 20" fill="none" className="size-[13px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        ) : null}
      </div>
      {sublabel ? (
        <div className="mt-[6px] flex items-start gap-[6px]">
          <span className="mt-[2px]"><PinIcon color={emphasised ? '#b8821e' : '#5a6660'} size={14} /></span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#8a938e]" style={{ fontFamily: FONT }}>{isolateRuns(sublabel)}</p>
            <p className="mt-[1px] text-[14px] font-bold leading-[18px]" style={{ fontFamily: FONT, color: emphasised ? '#9a6a1e' : '#23302a' }} {...td(line)} />
          </div>
        </div>
      ) : (
        <div className="mt-[5px] flex items-start gap-[5px]">
          <span className="mt-[1px]"><PinIcon color={emphasised ? '#b8821e' : '#5a6660'} size={14} /></span>
          <span className="text-[13px] font-bold leading-[17px]" style={{ fontFamily: FONT, color: emphasised ? '#9a6a1e' : '#23302a' }} {...td(line)} />
        </div>
      )}
    </>
  )
  return <div className={cls} style={style}>{body}</div>
}

// ── MoveGroupCard ──────────────────────────────────────────────────────────────
function MoveGroupCard({
  group, allocOf, active, currentLine, currentSublabel, cityOnly, newPlaceholder = 'Choose city', newSublabel, guardianName, onToggleCard, onAssignGuardian, pendingRequest,
}: {
  group: Group
  allocOf: (memberId: string) => Allocation | null
  active: { cityId: string; zoneId: string } | null
  currentLine: string
  /** "Host City" / "Relay City" — shown above the current city name (see LocBox). */
  currentSublabel: string
  cityOnly?: boolean
  /** Placeholder in the "New" box before allocation — host mode has one fixed city ("Move to Colombo"). */
  newPlaceholder?: string
  /** "Host City" / "Relay City" — shown above the new city name once one is chosen, matching CURRENT. */
  newSublabel: string
  guardianName: string | null
  /** Toggle the whole group's move on/off. The ENTIRE card is tappable (some users tap the card, not
   *  the member row), so this fires from the card body, the ✕ remove, and nowhere that stops it. */
  onToggleCard: () => void
  onAssignGuardian: () => void
  /** The pending request covering this group, if any — its `toLabel` fills the "New" box (instead
   *  of leaving it blank) with a single "Pending approval" tag for the whole group. */
  pendingRequest: ChangeRequest | null
}) {
     const { tx, t, td } = useT()
  const linked = !!group.label
  const newAlloc = group.members.map((mm) => allocOf(mm.member.id)).find(Boolean) ?? null
  // A destination is chosen (active) but this group isn't placed there yet → prompt the NEW box.
  const promptNew = !!active && !newAlloc && !pendingRequest
  const clickable = !pendingRequest
  return (
    <div
      onClick={clickable ? onToggleCard : undefined}
      className={`overflow-hidden rounded-[14px] border transition-colors ${clickable ? 'cursor-pointer' : ''}`}
      style={{ borderColor: newAlloc ? '#c5a84d' : '#e7dfc9', background: newAlloc ? '#fffdf5' : 'white', opacity: pendingRequest ? 0.85 : 1 }}
    >
      {linked && (
        <div className="flex h-[34px] items-center gap-[8px] bg-[#e1eef1] px-[13px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }} {...tx(group.label!)} />
        </div>
      )}
      <div className="relative px-[13px] pt-[10px]">
        {group.members.map((mm, mi) => {
          // Selection is card-wide now (the whole card toggles the group), so the rows are display
          // only — no per-row click. The card's border/tint carries the selected state.
          return (
            <div key={mm.member.id}
              className="relative -mx-[13px] flex items-center gap-[10px] px-[13px] py-[7px]">
              {linked && group.members.length > 1 && (
                <span className="pointer-events-none absolute start-[31px] w-[2px] bg-[#fac775]" style={{ top: mi === 0 ? '50%' : 0, bottom: mi === group.members.length - 1 ? '50%' : 0 }} />
              )}
              <div className="relative flex min-w-0 flex-1 items-center gap-[10px]">
                <Avatar name={mm.member.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-[#23302a] leading-[18px]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                  <p className="text-[12px] text-[#5a6660] mt-[1px]" style={{ fontFamily: FONT }}>{familyMeta(mm.member.relation, mm.member.age, mm.member.its, mm.member.gender)}</p>
                </div>
              </div>
              <RoleBadge kind={mm.badge} />
            </div>
          )
        })}
      </div>

      {linked && (
        guardianName ? (
          <div className="mx-[13px] mt-[6px] flex items-center gap-[8px] rounded-[10px] bg-[#e7f1ea] px-[12px] py-[10px]">
            <ShieldIcon />
            <p className="flex-1 text-[13px] leading-[17px]" style={{ fontFamily: FONT }}>
              <span className="text-[#5a6660]" {...tx('Guardian:')} />
              <span className="font-bold text-[#15402f]">{guardianName}</span>
            </p>
            <button type="button" onClick={(e) => { e.stopPropagation(); onAssignGuardian() }} className="shrink-0 text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }} {...tx('Change')} />
          </div>
        ) : (
          <div className="mx-[13px] mt-[6px] flex items-center gap-[10px] rounded-[10px] bg-[#fdf4e3] px-[11px] py-[9px]">
            <WarnIcon />
            <p className="flex-1 text-[12.5px] leading-[17px] text-[#7a6326]" style={{ fontFamily: FONT }} {...tx('Moving alone? Transfer the dependent first.')} />
            <button type="button" onClick={(e) => { e.stopPropagation(); onAssignGuardian() }}
              className="shrink-0 flex items-center gap-[3px] rounded-[8px] border border-[#d6b66a] bg-white px-[10px] py-[5px] text-[12px] font-bold text-[#9a6a1e]"
              style={{ fontFamily: FONT }}>
              <span {...tx('Transfer')} /> <Chevron color="#9a6a1e" />
            </button>
          </div>
        )
      )}

      {pendingRequest ? (
        // A pending request already covers this group — show what was actually requested (instead
        // of a blank/placeholder "New" box) with the ONE "Pending approval" tag for the whole group.
        <div className="flex items-stretch gap-[10px] px-[13px] pb-[13px] pt-[11px]">
          <LocBox label={t('Current')} line={currentLine} sublabel={currentSublabel} />
          <div className="flex-1 rounded-[12px] border px-[12px] py-[10px] text-start" style={{ borderColor: '#f0d9a8', background: '#fffdf5' }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('New')} />
            <div className="mt-[5px] flex items-start gap-[5px]">
              <span className="mt-[1px]"><PinIcon color="#9a6a1e" size={14} /></span>
              <span className="text-[13px] font-bold leading-[17px] text-[#9a6a1e]" style={{ fontFamily: FONT }}>{pendingRequest.toLabel}</span>
            </div>
            <div className="mt-[6px]"><PendingApprovalBadge /></div>
          </div>
        </div>
      ) : cityOnly ? (
        <div className="flex items-stretch gap-[10px] px-[13px] pb-[13px] pt-[11px]">
          <LocBox label={t('Current')} line={currentLine} sublabel={currentSublabel} />
          <LocBox
            label={t('New')}
            line={newAlloc ? newAlloc.cityName : newPlaceholder}
            sublabel={newAlloc ? newSublabel : undefined}
            accent={!!newAlloc}
            highlight={promptNew}
            onRemove={newAlloc ? onToggleCard : undefined}
          />
        </div>
      ) : (
        // Zone move — same two-box CURRENT | NEW layout as the city move. The zone is chosen from the
        // chips above and applied by tapping the card, so the NEW box is a plain display (no dropdown).
        <div className="flex items-stretch gap-[10px] px-[13px] pb-[13px] pt-[11px]">
          <LocBox label={t('Current')} line={currentLine} sublabel={currentSublabel} />
          <LocBox
            label={t('New')}
            line={newAlloc ? newAlloc.zoneName : t('Choose zone')}
            sublabel={newAlloc ? newAlloc.cityName : undefined}
            accent={!!newAlloc}
            highlight={promptNew}
            onRemove={newAlloc ? onToggleCard : undefined}
          />
        </div>
      )}
    </div>
  )
}

// ── Assign guardian sheet (opened from Transfer / Change) ──────────────────────
function AssignGuardianSheet({ dependent, currentGuardianId, onClose, onAssign, onRemove }: {
  dependent: FamilyMember
  currentGuardianId?: string
  onClose: () => void
  onAssign: (guardianId: string) => void
  onRemove?: () => void
}) {
     const { tx, t, td, tdText } = useT()
  const [selId, setSelId] = useState<string | null>(currentGuardianId ?? null)
  const candidates = family.filter((f) => f.role !== 'dependent' && f.id !== dependent.id)
  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <p className="text-[12px] font-bold uppercase tracking-[1px] text-[#a8843e]" style={{ fontFamily: FONT }} {...tx('Assign guardian')} />
          <h2 className="mt-[4px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }}>For {dependent.name}</h2>
          <p className="mt-[5px] text-[14px] leading-[19px] text-[#8a938e]" style={{ fontFamily: FONT }}>
            {tdText(dependent.relation)} · {tdText(dependent.gender)} · {t('Age')} {age2(dependent.age)} · Choose an adult family member
          </p>
        </>
      )}
      footer={(
        <>
          {onRemove && (
            <button type="button" onClick={onRemove}
              className="mb-[10px] flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[14px] border border-solid border-[#eccfcb] bg-white text-[#c0392b] transition-colors hover:bg-[#fdf2f1]">
              <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
                <path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 13a1 1 0 001 1h10a1 1 0 001-1l1-13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[15px] font-bold" style={{ fontFamily: FONT }} {...tx('Remove Guardian')} />
            </button>
          )}
          <button type="button" disabled={!selId} onClick={() => selId && onAssign(selId)}
            className="flex h-[52px] w-full items-center justify-center gap-[8px] rounded-[14px] transition-colors"
            style={{ background: selId ? '#1f5a44' : '#a9c4b6' }}>
            <PersonAddIcon />
            <span className="text-[16px] font-bold text-white" style={{ fontFamily: FONT }}>{onRemove ? 'Update guardian' : t('Add guardian')}</span>
          </button>
        </>
      )}
    >
      <div className="flex flex-col gap-[10px]">
        {candidates.map((c) => {
          const isCurrent = c.id === currentGuardianId
          const sel = selId === c.id
          return (
            <button key={c.id} type="button" onClick={() => setSelId(c.id)}
              className="flex items-center gap-[12px] rounded-[12px] border px-[14px] py-[12px] text-start transition-colors"
              style={{ borderColor: sel ? '#1f5a44' : '#e7dfc9', background: sel ? '#f3f8f5' : 'white' }}>
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(c.name)} />
                <p className="mt-[2px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(c.relation, c.age, c.its)}</p>
              </div>
              {isCurrent ? (
                <span className="shrink-0 rounded-full bg-[#e4efe7] px-[12px] py-[4px] text-[13px] font-semibold text-[#276245]" style={{ fontFamily: FONT }} {...tx('Current Guardian')} />
              ) : (
                <Radio selected={sel} />
              )}
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

// ── All zones sheet (View all + search) ────────────────────────────────────────
function AllZonesSheet({ cityName, zones, activeZoneId, onSelect, onClose }: {
  cityName: string
  zones: Zone[]
  activeZoneId: string | null
  onSelect: (z: Zone) => void
  onClose: () => void
}) {
     const { t, td, tx, tdText } = useT()
  const [q, setQ] = useState('')
  const list = q ? zones.filter((z) => z.name.toLowerCase().includes(q.toLowerCase())) : zones
  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <div className="pe-[36px]">
            <span className="text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('All {city} zones', { city: tdText(cityName) })} />
          </div>
          <div className="mt-[14px] flex items-center gap-[10px] rounded-full border border-[#e7dfc9] bg-[#faf8f2] px-[14px] h-[44px]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search zones...')}
              className="flex-1 bg-transparent text-[14px] outline-none text-[#23302a] placeholder-[#b0b8b3]" style={{ fontFamily: FONT }} />
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
          const isFull = z.left <= 0
          const selected = z.id === activeZoneId
          return (
            <button key={z.id} type="button" onClick={() => { if (!isFull) { onSelect(z); onClose() } }}
              className="flex items-center justify-between rounded-[14px] border px-[16px] py-[14px] text-start w-full"
              style={{ borderColor: selected ? '#d9c98a' : '#e7dfc9', background: selected ? '#fffdf5' : 'white', opacity: isFull ? 0.5 : 1 }}>
              <span className="text-[15px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#8a938e' : '#23302a' }} {...td(z.name)} />
              <span className="text-[13px] font-bold" style={{ fontFamily: FONT, color: seatColor(z.left) }}>
                {isFull ? t('Full') : t('{n} spots left', { n: z.left })}
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

// ── All relay cities sheet (View all + search) ─────────────────────────────────
function AllCitiesSheet({ cities, activeCityId, addedOf, onSelect, onClose }: {
  cities: City[]
  activeCityId: string | null
  addedOf: (cityId: string) => number
  onSelect: (c: City) => void
  onClose: () => void
}) {
     const { tx, t, td } = useT()
  const [q, setQ] = useState('')
  const list = q ? cities.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : cities
  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <div className="pe-[36px]">
            <span className="text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('All relay cities')} />
          </div>
          <div className="mt-[14px] flex items-center gap-[10px] rounded-full border border-[#e7dfc9] bg-[#faf8f2] px-[14px] h-[44px]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search city names...')}
              className="flex-1 bg-transparent text-[14px] outline-none text-[#23302a] placeholder-[#b0b8b3]" style={{ fontFamily: FONT }} />
            <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    >
      <div className="flex flex-col gap-[8px]">
        {list.map((c) => {
          const isFull = c.left <= 0
          const selected = c.id === activeCityId
          return (
            <button key={c.id} type="button" onClick={() => { if (!isFull) { onSelect(c); onClose() } }}
              className="flex items-center justify-between rounded-[14px] border px-[16px] py-[14px] text-start w-full"
              style={{ borderColor: selected ? '#d9c98a' : '#e7dfc9', background: selected ? '#fffdf5' : 'white', opacity: isFull ? 0.5 : 1 }}>
              <span>
                <span className="block text-[15px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#8a938e' : '#23302a' }} {...td(c.name)} />
                {!isFull && <span className="mt-[2px] flex items-center gap-[5px] text-[12px] text-[#5a6660]" style={{ fontFamily: FONT }}><PeopleMini /> {addedOf(c.id)} added</span>}
              </span>
              <span className="text-[13px] font-bold" style={{ fontFamily: FONT, color: isFull ? '#b23b3b' : '#1f7a4d' }}>
                {isFull ? t('Not available') : t('Available')}
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

// ── Confirm popup ──────────────────────────────────────────────────────────────
function ConfirmPopup({ others, cityOnly, onConfirm, onClose }: {
  others: { id: string; name: string; zone: string }[]
  /** True when this move never touched a zone (city-only stage) — wording must say "City", not "Zone". */
  cityOnly: boolean
  onConfirm: () => void
  onClose: () => void
}) {
     const { t, tx } = useT()
  const hasOthers = others.length > 0
  return (
    <BottomSheet
      open
      onClose={onClose}
      footer={(
        <button type="button" onClick={onConfirm}
          className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] text-[16px] font-bold text-white shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.3)] transition-colors"
          style={{ fontFamily: FONT }} {...tx('Submit Request')} />
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
        <h2 className="mt-[18px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }}>
          {cityOnly ? t('Send City Change Request') : t('Send Zone Change Request')}
        </h2>
        <p className="mt-[10px] max-w-[332px] text-[15px] font-semibold leading-[21px] text-[#2c3a34]" style={{ fontFamily: FONT }}>
          This {cityOnly ? 'city' : 'zone'} change will be sent to the admin for approval.
        </p>
        <p className="mt-[6px] max-w-[332px] text-[14px] leading-[20px] text-[#7a857f]" style={{ fontFamily: FONT }} {...tx('Your current reservation stays as it is until the request is approved. You can track or cancel it on the Modify Reservation screen.')} />
        {hasOthers && (
          <p className="mt-[8px] max-w-[332px] text-[14px] leading-[20px] text-[#7a857f]" style={{ fontFamily: FONT }} {...tx('Other selected members will also need to verify with the OTP sent to their registered mobile numbers.')} />
        )}
      </div>
    </BottomSheet>
  )
}

/** Success popup for an IMMEDIATE change (selection window still open — applied on the spot, no
 *  admin request). Centered modal so it reads identically on both breakpoints. */
function UpdatedPopup({ kind, onDone }: { kind: 'city' | 'zone'; onDone: () => void }) {
  const { t, tx } = useT()
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-[20px]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[rgba(13,31,23,0.55)]" />
      <div className="relative w-full max-w-[400px] rounded-[20px] bg-white px-[26px] pb-[26px] pt-[30px] text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]">
        <span className="mx-auto flex size-[62px] items-center justify-center rounded-full" style={{ background: '#e7f1ea' }}>
          <svg viewBox="0 0 32 32" fill="none" className="size-[30px]">
            <circle cx="16" cy="16" r="14" fill="#1f5a44" />
            <path d="M10 16.6l4 4 8-8.6" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-[16px] text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>
          {kind === 'city' ? 'City updated successfully' : t('Zone updated successfully')}
        </h2>
        <p className="mt-[8px] text-[14px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          {kind === 'city' ? 'Your city allocation has been updated.' : 'Your zone allocation has been updated.'}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-[20px] flex h-[50px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] text-[15px] font-bold text-white shadow-[0_6px_22px_-8px_rgba(21,64,47,0.18)] transition-colors hover:bg-[#194a37]"
          style={{ fontFamily: FONT }} {...tx('Done')} />
      </div>
    </div>,
    document.body,
  )
}

// ── Destination-zone + desktop two-panel atoms ─────────────────────────────────

/** "Swap to {city}" / "Reserved" pill for the city-only NEW column — the same Action-column pattern
 *  City Selection's per-group Reserve button uses, instead of a plain text link. Every member here
 *  already has SOME current allocation (that's the premise of "modify"), so moving them is always
 *  effectively a swap — labeled with the destination city name, mirroring the bulk "Swap all to
 *  {city}" action. Falls back to plain "Reserve" when no destination city name applies (e.g. the
 *  fixed single-destination host-only stage). */
function ReserveCityButton({ active, cityName, onClick, verb = 'Switch to' }: { active: boolean; cityName?: string; onClick: () => void; verb?: string }) {
  const { tx, td } = useT()
  if (cityName) {
    // Same teal outlined "Switch to {city}" pill + arrows icon as City/Zone Selection's per-row swap
    // action, instead of a solid green fill with no icon. Verb becomes "Request to" while the window
    // is closed (clicking Done files an approval request, not an immediate move).
    return (
      <button type="button" onClick={onClick}
        className="inline-flex h-[34px] min-w-0 items-center gap-[7px] rounded-full border border-[#2e6a7d] bg-white px-[16px] text-[13px] font-bold text-[#2e6a7d] transition-colors hover:bg-[#eef5f7] active:scale-[0.97]"
        style={{ fontFamily: FONT, opacity: active ? 1 : 0.55 }}>
        <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#2e6a7d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="truncate">{verb} <bdi {...td(cityName)} /></span>
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick}
      className="inline-flex h-[34px] items-center gap-[7px] rounded-full px-[22px] text-[13px] font-bold transition-colors"
      style={{ fontFamily: FONT, border: '1.5px solid #1f5a44', background: active ? '#1f5a44' : 'white', color: active ? 'white' : '#1f5a44', opacity: active ? 1 : 0.55 }} {...tx('Reserve')} />
  )
}

/** NEW-column cell — the destination city (type + name), matching the CURRENT column's stacked
 *  layout. `pending` (a destination picked but not yet reserved) renders it muted grey. */
function DestCityCell({ cityLabel, cityName, pending }: { cityLabel: string; cityName: string; pending?: boolean }) {
  const { td } = useT()
  return (
    <div className="flex min-w-0 flex-col justify-center gap-[1px]">
      <span className="truncate text-[11px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" style={{ fontFamily: FONT }}>{isolateRuns(cityLabel)}</span>
      <span className="truncate text-[13px] font-bold leading-[17px]" style={{ fontFamily: FONT, color: pending ? '#8a938e' : '#9a6a1e' }} {...td(cityName)} />
    </div>
  )
}

/** ACTION-column pill once a member is staged — green "Reserved" while the window is open (the
 *  move applies immediately), amber "Requested" while it's closed (staging this here will file an
 *  approval request, not an instant reservation — the pill shouldn't claim otherwise). Same shape
 *  as `PendingApprovalBadge`'s tone, just with an icon + the remove ✕ still available (an unsent
 *  request can still be un-staged, unlike an already-filed one). */
function ReservedPill({ onRemove, pending }: { onRemove: () => void; pending?: boolean }) {
  const { t } = useT()
  const color = pending ? '#9a6a1e' : '#1f7a4d'
  return (
    <div className="flex items-center gap-[8px]">
      <span
        className="inline-flex h-[34px] w-fit items-center gap-[6px] rounded-full border px-[14px] text-[13px] font-bold"
        style={{ fontFamily: FONT, borderColor: pending ? '#f1d7b6' : '#bfe3cd', background: pending ? '#fdf1e2' : '#eef7f1', color }}
      >
        {pending ? (
          <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
            <circle cx="9" cy="9" r="7.25" stroke={color} strokeWidth="1.4" />
            <path d="M9 5.3v3.9l2.6 1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
            <circle cx="9" cy="9" r="7.25" stroke={color} strokeWidth="1.4" />
            <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {pending ? t('Requested') : t('Selected')}
      </span>
      <button type="button" onClick={onRemove} aria-label={pending ? t('Cancel request') : t('Remove reservation')}
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
        <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </div>
  )
}

/** Shown in place of the role badge / Reserve action for a member who already has a change request
 *  awaiting approval — the row is read-only until that request is cancelled or resolved, so a second,
 *  overlapping request never stacks on top of it. */
function PendingApprovalBadge() {
  const { t } = useT()
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-full bg-[#fdf1e2] px-[10px] text-[11px] font-bold text-[#9a6a1e]" style={{ fontFamily: FONT }}>
      <span className="size-[6px] rounded-full bg-[#b8821e]" />
      
      {t('Pending approval')}
    </span>
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

/** Sidebar zone grid cell — zone name + "N left" / "Full", selected state. */
function MoveZoneGridCard({ zone, selected, onClick }: { zone: Zone; selected: boolean; onClick: () => void }) {
  const { t, td } = useT()
  const isFull = zone.left <= 0
  return (
    <button type="button" disabled={isFull} onClick={!isFull ? onClick : undefined}
      className="flex w-full flex-col items-start rounded-[12px] px-[12px] py-[11px] text-start transition-all duration-200 enabled:hover:-translate-y-[1px] enabled:hover:shadow-[0_8px_18px_-10px_rgba(21,64,47,0.3)] enabled:active:translate-y-0"
      style={{ border: selected ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9', background: selected ? '#fffdf5' : isFull ? '#f6f6f4' : 'white', cursor: isFull ? 'not-allowed' : 'pointer', minHeight: 64 }}>
      <span className="text-[14px] font-bold leading-[18px]" style={{ fontFamily: FONT, color: isFull ? '#8a938e' : '#23302a' }} {...td(zone.name)} />
      <span className="mt-[5px] text-[13px] font-bold" style={{ fontFamily: FONT, color: seatColor(zone.left) }}>{isFull ? t('Full') : t('{n} spots left', { n: zone.left })}</span>
    </button>
  )
}

/** Sidebar relay-city grid cell (relay mode). */
function MoveCityGridCard({ city, selected, added, onClick }: { city: City; selected: boolean; added: number; onClick: () => void }) {
  const { tx, td } = useT()
  const isFull = city.left <= 0
  return (
    <button type="button" disabled={isFull} onClick={!isFull ? onClick : undefined}
      className="flex h-[60px] w-full flex-col justify-center rounded-[12px] px-[12px] text-start transition-all duration-200 enabled:hover:-translate-y-[1px] enabled:hover:shadow-[0_8px_18px_-10px_rgba(21,64,47,0.3)] enabled:active:translate-y-0"
      style={{ border: selected ? '1.5px solid #c5a84d' : '1.5px solid #e7dfc9', background: selected ? '#fffdf5' : isFull ? '#f6f6f4' : 'white', cursor: isFull ? 'not-allowed' : 'pointer' }}>
      <span className="flex w-full min-w-0 items-center gap-[5px]">
        <span className="truncate text-[14px] font-bold leading-[18px]" style={{ fontFamily: FONT, color: isFull ? '#8a938e' : '#23302a' }} {...td(city.name)} />
        {city.type === 'host' && (
          <span className="shrink-0 rounded-full px-[5px] py-[1px] text-[9px] font-bold uppercase leading-[12px] tracking-[0.2px]" style={{ background: '#f7efd6', color: '#a8843e' }} {...tx('Host')} />
        )}
      </span>
      {/* Reserved status slot — fixed height so the card never resizes */}
      <span className="mt-[3px] flex h-[16px] items-center gap-[4px] whitespace-nowrap text-[12px] font-semibold" style={{ fontFamily: FONT }}>
        {isFull
          ? <span className="text-[#8a938e]" {...tx('Not available')} />
          : (selected || added > 0)
            ? <span className="inline-flex items-center gap-[4px] text-[#5a6660]"><PeopleMini /> {added} added</span>
            : <span className="text-[#1f7a4d]" {...tx('Available')} />}
      </span>
    </button>
  )
}

/** Desktop sidebar card: (relay) relay-city grid + "{City} zones (N)" search + 2-col zone grid. */
/** "Switch all"/"Remove all" pill — same visual treatment as City Selection's HostCityCard/
 *  RelaySidebarCard header buttons. The verb is "Switch" (not "Swap") on this Modify Reservation
 *  screen, matching the per-row "Switch to {city}" wording (City Selection keeps "Swap"). Never
 *  "Reserve all": every member here already has a current allocation, so moving them is always a
 *  move away from somewhere, never a first-time reserve. */
function SwapAllPill({ allMoved, destName, onClick, verb }: { allMoved: boolean; destName?: string; onClick: () => void; verb: string }) {
  const { tx, t, tdText } = useT()
  return allMoved ? (
    <button type="button" onClick={onClick}
      className="ms-auto flex h-[32px] shrink-0 items-center justify-center rounded-full border border-[#e0b0aa] bg-white px-[14px] text-[13px] font-bold text-[#c0392b] transition-colors hover:bg-[#fdf3f2]"
      style={{ fontFamily: FONT }} {...tx('Remove all')} />
  ) : (
    <button type="button" onClick={onClick}
      className="ms-auto inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[14px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
      style={{ fontFamily: FONT }}>
      <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {/* "Request to {city}" is one key: the preposition belongs to the sentence, not to the
          concatenation, and LSD does not necessarily put the city after it. */}
      {destName
        ? <span className="truncate" {...tx('{verb} to {city}', { verb, city: tdText(destName) })} />
        : <span className="truncate">{verb}</span>}
    </button>
  )
}

function MoveSidebarCard({
  isRelay, showZones = true, cities, activeCityId, addedOf, onSelectCity, citySearch, onCitySearch,
  cityName, zones, activeZoneId, onSelectZone, zoneSearch, onZoneSearch, hostLiveCity, swapAll,
  showHostOption, hostCity, preferredCities,
}: {
  isRelay: boolean
  showZones?: boolean
  cities: City[]
  activeCityId: string | null
  addedOf: (id: string) => number
  /** Pass `null` to clear the current pick — the card handlers below toggle a re-click of the
   *  active city to `null`, matching City Selection's deselect behavior. */
  onSelectCity: (c: City | null) => void
  citySearch: string
  onCitySearch: (v: string) => void
  cityName: string
  zones: Zone[]
  activeZoneId: string | null
  onSelectZone: (z: Zone) => void
  zoneSearch: string
  onZoneSearch: (v: string) => void
  /** Host mode's fixed destination — the same seat/fill data City Selection's HostCityCard uses. */
  hostLiveCity: LiveCity
  /** Set once a destination is fully picked and there's more than one selectable member — renders in
   *  the header of whichever section represents the COMPLETE destination (the relay-city grid when no
   *  zone step applies, else the zones grid, since a city alone isn't the full destination there). */
  swapAll?: { allMoved: boolean; destName?: string; onClick: () => void; verb: string }
  /** Relay mode only — the merged "Switch to a different city" flow offers the Host City as one more
   *  pickable destination, above the relay-city list (same layout as City Selection's own Host card). */
  showHostOption?: boolean
  hostCity?: City
  /** Same slot as City Selection's "My Preferred City" card — the user's ranked picks that also
   *  exist in this screen's city list. Omitted (or empty) renders nothing, same as City Selection. */
  preferredCities?: City[]
}) {
     const { tx, t, tdText } = useT()
  const zoneList = zoneSearch ? zones.filter((z) => z.name.toLowerCase().includes(zoneSearch.toLowerCase())) : zones

  // Host city, no zone step → the destination is fixed. HostCityCard is already a complete card
  // (border/background/shadow), so it sits directly on the cream sidebar — same as City
  // Selection — instead of being nested inside this white panel (which read as a redundant
  // "card inside a card" white background).
  if (!isRelay && !showZones) {
    return (
      <HostCityCard
        city={hostLiveCity}
        selected
        onSelect={() => {}}
        onSwapAll={swapAll?.onClick}
        anySwappable={!!swapAll}
        swapAllLabel={swapAll?.verb ?? 'Switch all'}
      />
    )
  }

  // Whichever ONE section the active city actually belongs to gets the swap-all pill in ITS OWN
  // header (mirrors City Selection: Host card, My Preferred City, and the relay grid each carry
  // their own inline pill, shown only when the active destination is actually theirs) — never a
  // pill on a section the user didn't click into.
  const activeInHost = !!showHostOption && !!hostCity && activeCityId === hostCity.id
  const activeInPreferred = !!preferredCities?.some((c) => c.id === activeCityId)
  const activeInRelay = !activeInHost && !activeInPreferred

  return (
    <div className="flex flex-col gap-[16px]">
      {showHostOption && hostCity && (
        <HostCityCard
          city={hostLiveCity}
          selected={activeCityId === hostCity.id}
          onSelect={() => onSelectCity(activeCityId === hostCity.id ? null : hostCity)}
          topLabel={t('Top preferred city')}
          onSwapAll={activeInHost ? swapAll?.onClick : undefined}
          anySwappable={activeInHost && !!swapAll}
          swapAllLabel={swapAll?.verb ?? 'Switch all'}
        />
      )}
      {/* Independent of `showHostOption` — a registrant already in the Host City still has their own
          ranked preferred (relay) cities worth surfacing; only the Host card above is the
          self-referential no-op there. `preferredCities` (the caller's `preferredCitiesInScreen`) is
          already empty when this section genuinely shouldn't render (e.g. "Change your zone" mode). */}
      {preferredCities && preferredCities.length > 0 && (
        <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[16px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
          <div className="flex items-center gap-[8px]">
            <PreferredStarIcon />
            <p className="text-[17px] leading-[21px] text-[#15402f]" style={{ fontFamily: FONT }} {...tx('My Preferred City')} />
            {activeInPreferred && swapAll && (
              <button
                type="button"
                onClick={swapAll.onClick}
                className="ms-auto inline-flex h-[34px] shrink-0 items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[16px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
                style={{ fontFamily: FONT }}
              >
                <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {swapAll.destName
                  ? <span className="truncate" {...tx('{verb} to {city}', { verb: swapAll.verb, city: tdText(swapAll.destName) })} />
                  : <span className="truncate">{swapAll.verb}</span>}
              </button>
            )}
          </div>
          <div className="mt-[12px] grid grid-cols-[repeat(auto-fill,minmax(98px,1fr))] gap-[10px]">
            {preferredCities.map((c) => (
              <MoveCityGridCard key={c.id} city={c} selected={c.id === activeCityId} added={addedOf(c.id)} onClick={() => onSelectCity(c.id === activeCityId ? null : c)} />
            ))}
          </div>
        </div>
      )}
      <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
      {isRelay && (
        <>
          <div className="flex items-center gap-[7px]">
            <PinIcon color="#c5912f" size={18} />
            <p className="text-[16px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>Other Cities ({cities.length})</p>
            {/* Only when a relay city alone is the complete destination (no zone step) — otherwise
                the button belongs on the zones header below, the step that actually finishes it. Also
                only when the active destination is actually one of THESE cities — Host / My Preferred
                City carry their own pill instead when the active pick is theirs. */}
            {!showZones && swapAll && activeInRelay && <SwapAllPill allMoved={swapAll.allMoved} destName={swapAll.destName} onClick={swapAll.onClick} verb={swapAll.verb} />}
          </div>
          <div className="mt-[14px] flex h-[48px] items-center gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-[#fbfbfb] px-[14px] transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12">
            <input value={citySearch} onChange={(e) => onCitySearch(e.target.value)} placeholder={t('Search city names...')} className="flex-1 bg-transparent text-[15px] text-[#23302a] outline-none placeholder:text-[#9aa39d]" style={{ fontFamily: FONT }} />
            <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <RelayCityAccordionList cities={cities} search={citySearch} activeCityId={activeCityId} addedOf={addedOf} onSelectCity={onSelectCity} />
          {showZones && <div className="my-[18px] h-px bg-[#ece6d6]" />}
        </>
      )}
      {showZones && (
        <>
          <div className="flex items-center gap-[7px]">
            <PinIcon color="#c5912f" size={18} />
            <p className="text-[16px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...tx('{city} zones ({n})', { city: tdText(cityName), n: zones.length })} />
            {swapAll && <SwapAllPill allMoved={swapAll.allMoved} destName={swapAll.destName} onClick={swapAll.onClick} verb={swapAll.verb} />}
          </div>
          <div className="mt-[14px] flex h-[48px] items-center gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-[#fbfbfb] px-[14px] transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12">
            <input value={zoneSearch} onChange={(e) => onZoneSearch(e.target.value)} placeholder={t('Search zone names...')} className="flex-1 bg-transparent text-[15px] text-[#23302a] outline-none placeholder:text-[#9aa39d]" style={{ fontFamily: FONT }} />
            <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <div className="mt-[14px] grid max-h-[42vh] grid-cols-2 gap-[10px] overflow-y-auto pe-[4px]">
            {zoneList.map((z) => <MoveZoneGridCard key={z.id} zone={z} selected={z.id === activeZoneId} onClick={() => onSelectZone(z)} />)}
            {zoneList.length === 0 && <p className="col-span-2 py-[12px] text-center text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No zones found.')} />}
          </div>
        </>
      )}
      </div>
    </div>
  )
}

/** Groups the relay-city grid into per-country accordions (collapsed by default, only one open at a
 *  time) — mirrors ArrangeCities.tsx / CitySelection.tsx's same pattern. */
function RelayCityAccordionList({ cities, search, activeCityId, addedOf, onSelectCity }: {
  cities: City[]
  search: string
  activeCityId: string | null
  addedOf: (id: string) => number
  onSelectCity: (c: City | null) => void
}) {
     const { tx, td, lang } = useT()
  const [expanded, setExpanded] = useState<string | null>(null)
  useEffect(() => {
    const c = cities.find((c) => c.id === activeCityId)
    if (c) setExpanded(countryOf(c))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCityId])

  const q = search.trim().toLowerCase()
  const countries: { name: string; cities: City[] }[] = []
  const byCountry = new Map<string, City[]>()
  cities.forEach((c) => {
    const country = countryOf(c)
    let list = byCountry.get(country)
    if (!list) { list = []; byCountry.set(country, list); countries.push({ name: country, cities: list }) }
    list.push(c)
  })
  let anyMatch = false
  return (
    <div className="mt-[14px] flex flex-col gap-[8px]">
      {countries.map(({ name, cities: countryCities }) => {
        const matches = q ? countryCities.filter((c) => c.name.toLowerCase().includes(q)) : countryCities
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
                <span className="text-[12px] text-[#8a938e]" style={{ fontFamily: FONT }}><Count value={matches.length} lang={lang} /></span>
                <svg viewBox="0 0 16 16" fill="none" className={`size-[13px] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  <path d="M4 6l4 4 4-4" stroke="#8a938e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(98px,1fr))] gap-[10px] border-t border-[#e7dfc9] p-[10px]">
                {matches.map((c) => (
                  <MoveCityGridCard key={c.id} city={c} selected={c.id === activeCityId} added={addedOf(c.id)} onClick={() => onSelectCity(c.id === activeCityId ? null : c)} />
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
  )
}

// ── MoveDesktopTable (web ≥640px) — "reserve together" pattern ──────────────────
// Blue group band + gold connector; guardian Transfer/resolved relocated to a strip
// below the dependent; per-group CURRENT + New (destination-zone) columns.
function MoveDesktopTable({
  groups, indexMap, allocOf, currentAllocOf, cityOnly, isRelay, destCityName, destCityId, hasActiveDest, dependentOf, guardianNameFor, onToggleMember, onAssignGuardian, onChooseDest, isPendingMember, pendingRequestForGroup, windowOpen,
}: {
  groups: Group[]
  /** Maps each rendered row back to its index in the screen's FULL `groups` array. Required once
   *  the table renders a subset (members with a pending request are split into their own table),
   *  because every callback below — `currentAllocOf`, `onToggleMember`, `onChooseDest` — is keyed
   *  by that full-array index. Defaults to identity when the table renders everything. */
  indexMap?: number[]
  allocOf: (memberId: string) => Allocation | null
  /** Staging a destination here will apply IMMEDIATELY while the window is open, but only file an
   *  approval request once it's closed — the ACTION pill reads "Reserved" (green) vs "Requested"
   *  (amber) accordingly, so it doesn't claim an instant reservation that hasn't actually happened. */
  windowOpen: boolean
  /** Read PER ROW (by group index) rather than a single shared value — "Switch to a different city"
   *  can merge groups whose current allocations differ (e.g. some in Mumbai, others in Surat), so
   *  each row must show its OWN current city/zone, not one representative group's. */
  currentAllocOf: (gi: number) => { cityId: string | null; cityName: string; cityTypeLabel: string; zoneName: string }
  cityOnly?: boolean
  /** Host mode has ONE fixed city → the NEW column offers "Move to {city}" instead of a picker. */
  isRelay?: boolean
  destCityName?: string
  /** The active destination's real id — a row whose OWN current city already equals this is a no-op
   *  "swap to the city you're already in" (can happen even when the row's origin TYPE differs from
   *  the destination's, e.g. relay-Mumbai → host-Mumbai — same city either way), so its per-row
   *  ACTION is disabled instead of offering a swap that goes nowhere. */
  destCityId?: string
  /** True once a destination zone is picked from the sidebar grid — used to prompt the empty NEW
   *  zone cell (gold "Choose zone") so it's clear a row still needs to be selected. */
  hasActiveDest?: boolean
  dependentOf: (g: Group) => FamilyMember | null
  guardianNameFor: (g: Group) => string | null
  onToggleMember: (gi: number, memberId: string) => void
  onAssignGuardian: (g: Group) => void
  onChooseDest: (gi: number) => void
  /** True when a member already has a change request awaiting approval — the row is shown read-only
   *  (no checkbox/Reserve action) so a second request can't stack on top of it. */
  isPendingMember: (memberId: string) => boolean
  /** The pending request covering a group, if any — its `toLabel` is read into the NEW column so the
   *  row shows what was actually requested instead of going blank. */
  pendingRequestForGroup: (g: Group) => ChangeRequest | null
}) {
     const { t, tx, td, tdText } = useT()
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[#e7dfc9] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: memberTableMinWidth(96, 132, 150, 230) }}>
        <colgroup>
          <col />
          <col style={{ width: '96px' }} />
          <col style={{ width: '132px' }} />
          <col style={{ width: '150px' }} />
          <col style={{ width: '230px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {[t('Member'), '', 'CURRENT', t('NEW'), t('ACTION')].map((h, i) => (
              <th key={i} className="px-[12px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e] whitespace-nowrap" style={{ fontFamily: FONT }}>{h}</th>
            ))}
          </tr>
        </thead>
        {groups.map((g, li) => {
          const gi = indexMap ? indexMap[li] : li
          const linked = !!g.label
          const dep = dependentOf(g)
          const gName = guardianNameFor(g)
          const needsCare = !!dep?.needsCaregiver
          const groupDest = allocOf(g.members[0].member.id)
          const isAllocated = !!groupDest
          const groupPendingReq = pendingRequestForGroup(g)
          const groupPending = !!groupPendingReq
          const hasConnector = g.members.length > 1
          const { cityId: rowCityId, cityName: rowCityName, cityTypeLabel: rowCityLabel, zoneName: rowZoneName } = currentAllocOf(gi)
          // Same city either way (relay vs host is just which SLOT it sits in, not a different place)
          // — swapping to it would be a no-op, so the row's own ACTION is disabled instead of offered.
          const rowAlreadyAtDest = !!destCityId && rowCityId === destCityId
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #f0ebe0', background: '#e1eef1' }}>
                  <td colSpan={5} className="px-[14px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}><LinkGlyph /><bdi {...tx(g.label!)} /></span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                const isTheDependent = !!dep && mm.member.id === dep.id
                const pendingRow = isPendingMember(mm.member.id)
                return (
                  <Fragment key={mm.member.id}>
                    <tr onClick={() => { if (!pendingRow) onToggleMember(gi, mm.member.id) }}
                      className={pendingRow ? 'cursor-not-allowed' : `cursor-pointer ${allocOf(mm.member.id) ? 'bg-[#fdf8ec]' : 'bg-white hover:bg-[#faf9f4]'}`}
                      style={{ borderTop: linked ? undefined : '1px solid #f0ebe0', background: pendingRow ? '#fdf8ec' : undefined, opacity: pendingRow ? 0.75 : 1 }}>
                      <td className="relative ps-[14px] pe-[12px] py-[9px] align-middle">
                        {hasConnector && (
                          <span className="pointer-events-none absolute start-[31px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                        )}
                        <div className="relative flex items-center gap-[10px]">
                          <Avatar name={mm.member.name} size={36} />
                          <div className="min-w-0">
                            <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                            <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member.relation, mm.member.age, mm.member.its, mm.member.gender)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-[12px] py-[9px] align-middle">
                        {mm.badge ? <RoleBadge kind={mm.badge} /> : null}
                      </td>
                      <td className="px-[12px] py-[9px] align-middle">
                        <div className="flex min-h-[34px] flex-col justify-center gap-[1px]">
                          <span className="truncate text-[11px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" style={{ fontFamily: FONT }}>{isolateRuns(rowCityLabel)}</span>
                          <span className="truncate text-[13px] font-bold leading-[17px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(rowCityName)} />
                          {!cityOnly && (
                            <span className="truncate text-[12px] leading-[16px] text-[#5a6660]" style={{ fontFamily: FONT }} {...td(rowZoneName)} />
                          )}
                        </div>
                      </td>
                      {/* NEW — the destination. City-only: the picked relay/host city. Zone stage: the
                          destination CITY (grey) stacked above the ZONE (bold), same stacked pattern
                          Zone Selection's own table uses, so the city is never missing once allocated. */}
                      <td onClick={(e) => e.stopPropagation()} className="px-[12px] py-[9px] align-middle">
                        <div className="flex min-h-[34px] items-center">
                          {isFirst && (
                            groupPending ? (
                              cityOnly ? (
                                <DestCityCell cityLabel={isRelay ? t('Relay City') : t('Host City')} cityName={groupPendingReq!.toLabel} pending />
                              ) : (
                                <span className="truncate text-[13px] font-bold leading-[17px] text-[#8a938e]" style={{ fontFamily: FONT }} {...td(groupPendingReq!.toLabel)} />
                              )
                            ) : cityOnly ? (
                              isAllocated
                                ? <DestCityCell cityLabel={isRelay ? t('Relay City') : t('Host City')} cityName={groupDest!.cityName} />
                                : destCityName
                                  ? <DestCityCell cityLabel={isRelay ? t('Relay City') : t('Host City')} cityName={destCityName} pending />
                                  : <span className="text-[13px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                            ) : isAllocated ? (
                              <div className="flex min-w-0 flex-col justify-center gap-[1px]">
                                <span className="truncate text-[12px] leading-[15px] text-[#8a938e]" style={{ fontFamily: FONT }} {...td(groupDest!.cityName)} />
                                <span className="truncate text-[13px] font-bold leading-[17px] text-[#9a6a1e]" style={{ fontFamily: FONT }} {...td(groupDest!.zoneName)} />
                              </div>
                            ) : hasActiveDest ? (
                              <div className="flex min-w-0 flex-col justify-center gap-[1px]">
                                <span className="truncate text-[12px] leading-[15px] text-[#8a938e]" style={{ fontFamily: FONT }} {...td(destCityName ?? '')} />
                                <span className="truncate text-[13px] font-bold text-[#9a6a1e]" style={{ fontFamily: FONT }} {...tx('Choose zone')} />
                              </div>
                            ) : (
                              <span className="text-[13px] text-[#c2ccc6]" style={{ fontFamily: FONT }}>—</span>
                            )
                          )}
                        </div>
                      </td>
                      {/* ACTION — Reserve / Reserved (+✕) / Pending approval, same explicit per-row CTA
                          City & Zone Selection use (not just a click-anywhere-on-the-row toggle). Shown
                          for both stages now — same `onChooseDest` toggle handles either. */}
                      <td onClick={(e) => e.stopPropagation()} className="px-[12px] py-[9px] align-middle">
                        <div className="flex min-h-[34px] items-center">
                          {isFirst && (
                            groupPending
                              ? <PendingApprovalBadge />
                              : isAllocated
                                ? <ReservedPill onRemove={() => onChooseDest(gi)} pending={!windowOpen} />
                                : rowAlreadyAtDest
                                  ? <span className="text-[13px] text-[#c2ccc6]" style={{ fontFamily: FONT }} {...tx('Already in {city}', { city: tdText(destCityName ?? '') })} />
                                  : <ReserveCityButton active={cityOnly ? (!isRelay || !!destCityName) : !!hasActiveDest} cityName={destCityName} onClick={() => onChooseDest(gi)} verb={windowOpen ? 'Switch to' : 'Request to'} />
                          )}
                        </div>
                      </td>
                    </tr>
                    {isTheDependent && (
                      <tr style={{ background: 'white' }}>
                        {/* Spans Member + Role + Current only — the New/zone column stays empty so
                            the notice doesn't stretch the full row width. */}
                        <td colSpan={3} className="ps-[14px] pe-[12px] pb-[12px]">
                          {gName ? (
                            <div className="inline-flex w-fit items-center gap-[16px] rounded-[10px] bg-[#e7f1ea] px-[12px] py-[10px]">
                              <span className="flex items-center gap-[8px]">
                                <ShieldIcon />
                                <p className="text-[13px] leading-[17px]" style={{ fontFamily: FONT }}>
                                  <span className="text-[#5a6660]">{needsCare ? t('Under Care of:') : t('Guardian:')}</span>
                                  <span className="font-bold text-[#15402f]">{gName}</span>
                                </p>
                              </span>
                              <button type="button" onClick={() => onAssignGuardian(g)} className="shrink-0 flex items-center gap-[3px] text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>
                                <span {...tx('Change')} /> <Chevron color="#1f5a44" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex w-fit items-center gap-[16px] rounded-[10px] bg-[#fdf4e3] px-[12px] py-[10px]">
                              <span className="flex items-center gap-[8px]">
                                <WarnIcon />
                                <p className="text-[13px] leading-[17px] text-[#7a6326]" style={{ fontFamily: FONT }} {...tx('Moving alone? Transfer the dependent first.')} />
                              </span>
                              <button type="button" onClick={() => onAssignGuardian(g)}
                                className="shrink-0 flex items-center gap-[4px] rounded-[8px] border border-[#d6b66a] bg-white px-[12px] py-[6px] text-[13px] font-bold text-[#9a6a1e]" style={{ fontFamily: FONT }}>
                                <span {...tx('Assign')} /> <Chevron color="#9a6a1e" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td />
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

// ── Requested (pending approval) — its own table, above "Who are you moving?" ───
/** Members with a change request awaiting approval, split out of the main move table.
 *
 *  They used to sit inline among the selectable rows, read-only and dimmed, which made it hard to
 *  tell at a glance who was already requested — and there was no way to withdraw one of them from
 *  here at all. Each GROUP gets its own Cancel: a guardian and dependent reserve together and must
 *  never be split, so the group is the smallest safe unit to withdraw (same rule Modify
 *  Reservation's per-group request cards use). */
function RequestedTable({ entries, currentAllocOf, cityOnly, dependentOf, requestFor, onCancel }: {
  entries: { g: Group; gi: number }[]
  currentAllocOf: (gi: number) => { cityId: string | null; cityName: string; cityTypeLabel: string; zoneName: string }
  cityOnly?: boolean
  dependentOf: (g: Group) => FamilyMember | null
  requestFor: (g: Group) => ChangeRequest | null
  onCancel: (g: Group) => void
}) {
     const { t, tx, td } = useT()
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[#f0d9a8] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: memberTableMinWidth(96, 132, 150, 230) }}>
        <colgroup>
          <col />
          <col style={{ width: '96px' }} />
          <col style={{ width: '132px' }} />
          <col style={{ width: '150px' }} />
          <col style={{ width: '230px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#fdf8ec' }}>
            {[t('Member'), '', 'CURRENT', 'REQUESTED', t('ACTION')].map((h, i) => (
              <th key={i} className="px-[12px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#9a8f7a] whitespace-nowrap" style={{ fontFamily: FONT }}>{h}</th>
            ))}
          </tr>
        </thead>
        {entries.map(({ g, gi }) => {
          const req = requestFor(g)
          const linked = !!g.label
          const dep = dependentOf(g)
          const hasConnector = g.members.length > 1
          const { cityName: rowCityName, cityTypeLabel: rowCityLabel, zoneName: rowZoneName } = currentAllocOf(gi)
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #f0ebe0', background: '#e1eef1' }}>
                  <td colSpan={5} className="px-[14px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}><LinkGlyph /><bdi {...tx(g.label!)} /></span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                return (
                  <tr key={mm.member.id} style={{ borderTop: linked ? undefined : '1px solid #f0ebe0', background: '#fffdf8' }}>
                    <td className="relative ps-[14px] pe-[12px] py-[9px] align-middle">
                      {hasConnector && (
                        <span className="pointer-events-none absolute start-[31px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                      )}
                      <div className="relative flex items-center gap-[10px]">
                        <Avatar name={mm.member.name} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                          <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member.relation, mm.member.age, mm.member.its, mm.member.gender)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-[12px] py-[9px] align-middle">{mm.badge ? <RoleBadge kind={mm.badge} /> : null}</td>
                    <td className="px-[12px] py-[9px] align-middle">
                      <div className="flex min-h-[34px] flex-col justify-center gap-[1px]">
                        <span className="truncate text-[11px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" style={{ fontFamily: FONT }}>{isolateRuns(rowCityLabel)}</span>
                        <span className="truncate text-[13px] font-bold leading-[17px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(rowCityName)} />
                        {!cityOnly && <span className="truncate text-[12px] leading-[16px] text-[#5a6660]" style={{ fontFamily: FONT }} {...td(rowZoneName)} />}
                      </div>
                    </td>
                    {/* REQUESTED + ACTION are per GROUP, not per member — one destination and one
                        Cancel for the whole reserve-together set, on its first row only. */}
                    <td className="px-[12px] py-[9px] align-middle">
                      {isFirst && req && (
                        <div className="flex min-h-[34px] flex-col justify-center gap-[1px]">
                          <span className="truncate text-[11px] font-bold uppercase tracking-[0.4px] text-[#c2a04e]" style={{ fontFamily: FONT }} {...tx('Requested')} />
                          <span className="truncate text-[13px] font-bold leading-[17px] text-[#9a6a1e]" style={{ fontFamily: FONT }} {...td(req.toLabel)} />
                        </div>
                      )}
                    </td>
                    <td className="px-[12px] py-[9px] align-middle">
                      {isFirst && (
                        <div className="flex flex-col items-start gap-[7px]">
                          <PendingApprovalBadge />
                          <button
                            type="button"
                            onClick={() => onCancel(g)}
                            aria-label={`Cancel request for ${g.members.map((m) => m.member.name).join(', ')}`}
                            className="inline-flex h-[30px] items-center gap-[6px] rounded-full border border-[#e2bdb9] bg-white px-[12px] text-[12px] font-bold text-[#b23b3b] transition-colors hover:border-[#d98a85] hover:bg-[#fbeceb]"
                            style={{ fontFamily: FONT }}
                          >
                            <svg viewBox="0 0 20 20" fill="none" className="size-[12px]"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
                            <span {...tx('Cancel request')} />
                          </button>
                        </div>
                      )}
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

/** Mobile equivalent of one `RequestedTable` group. */
function RequestedCard({ g, current, requestedTo, cityOnly, onCancel }: {
  g: Group
  current: string
  requestedTo: string
  cityOnly?: boolean
  onCancel: () => void
}) {
     const { t, td } = useT()
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#f0d9a8] bg-[#fffdf8]">
      {g.label && (
        <div className="flex items-center gap-[8px] bg-[#e1eef1] px-[14px] py-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
          <LinkGlyph />{g.label}
        </div>
      )}
      <div className="flex flex-col gap-[10px] px-[14px] py-[12px]">
        {g.members.map((mm) => (
          <div key={mm.member.id} className="flex items-center gap-[10px]">
            <Avatar name={mm.member.name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
              <p className="truncate text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member.relation, mm.member.age, mm.member.its, mm.member.gender)}</p>
            </div>
            {mm.badge ? <RoleBadge kind={mm.badge} /> : null}
          </div>
        ))}
        <div className="flex items-center gap-[10px] rounded-[10px] bg-white px-[10px] py-[8px]" style={{ fontFamily: FONT }}>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[#5a6660]">{current}</span>
          <svg viewBox="0 0 16 16" fill="none" className="size-[13px] shrink-0"><path d="M3 8h9M9 5l3 3-3 3" stroke="#c2a04e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="min-w-0 flex-1 truncate text-end text-[13px] font-bold text-[#9a6a1e]">{requestedTo || (cityOnly ? t('Requested') : '')}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-[10px] border-t border-[#f2ead5] px-[14px] py-[10px]">
        <PendingApprovalBadge />
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-full border border-[#e2bdb9] bg-white px-[13px] text-[12px] font-bold text-[#b23b3b]"
          style={{ fontFamily: FONT }}
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-[12px]"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          
          {t('Cancel request')}
        </button>
      </div>
    </div>
  )
}

// ── ReserveTip (reservation success tooltip) ────────────────────────────────────
/** A single green confirmation pill pinned above the floating footer, aligned to the right. Names the
 *  member(s) just staged — same component/positioning as City/Zone Selection's tooltip. The parent
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

// ── Main ───────────────────────────────────────────────────────────────────────
export default function HostCityMove({ mode = 'host' }: { mode?: 'host' | 'relay' }) {
  const { t, tx, td, tdText } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const isRelay = mode === 'relay'
  const flow = useStore((s) => s.flow)
  const registrations = useStore((s) => s.registrations)
  const addChangeRequest = useStore((s) => s.addChangeRequest)
  const cancelChangeRequestMembers = useStore((s) => s.cancelChangeRequestMembers)
  const applyCityZoneChange = useStore((s) => s.applyCityZoneChange)

  // Same "Arrange My Cities" layout City Selection reads — an arrangement can put ANY live city in
  // the host slot (not just the real host), so the Host card here must reflect it too instead of
  // always hardcoding the real host city. Without one, falls back to the real host exactly like
  // City Selection's own `hostCityId` does.
  const arrangement = journeyFor(flow, registrations, id ?? '').cityArrangement ?? null
  const hostCityId = arrangement?.hostCityId ?? liveCities.find((c) => c.type === 'host')?.id ?? 'colombo'
  const HOST_CITY: City = toLocalCity(liveCities.find((c) => c.id === hostCityId) ?? liveCities.find((c) => c.type === 'host')!)
  // Real relay-type cities, minus whichever one an arrangement displaced into the host slot (it's no
  // longer "a relay pick" while it sits there — mirrors City Selection's own dropdown exclusion).
  const RELAY_CITIES: City[] = liveCities.filter((c) => c.type === 'relay' && c.id !== hostCityId).map(toLocalCity)

  const miqaat = miqaats.find((m) => m.id === id)
  const stageOverrides = useStore((s) => s.stageOverrides)
  // Which popup an immediate change shows ('city'/'zone' updated) — null while none is showing.
  const [updatedKind, setUpdatedKind] = useState<'city' | 'zone' | null>(null)

  // A reservation can have SEVERAL independently-allocated groups (e.g. one part of the family in
  // the host city, another in a relay city) — Modify Reservation's "what would you like to change"
  // list passes which group(s) this screen should move via router state. Groups sharing the same
  // allocation are moved together, so this is a LIST. Falls back to the first group (the old default)
  // when reached without it, e.g. a direct/demo navigation. `groupIndex` (singular) still names the
  // representative group used for the "current allocation" read-outs (they all share one allocation).
  const stateIndices = (location.state as { groupIndices?: number[]; groupIndex?: number; optionTitle?: string; sameCity?: boolean } | null)
  const groupIndices: number[] = stateIndices?.groupIndices
    ?? (stateIndices?.groupIndex !== undefined ? [stateIndices.groupIndex] : [0])
  const groupIndex: number = groupIndices[0] ?? 0
  // The exact option the user chose on Modify Reservation (e.g. "Switch to a relay city"), passed via
  // nav state so the pending-request card names the action instead of a generic "City change". The
  // " · N members" count suffix is stripped — the card re-appends the current member count itself.
  const optionTitle = stateIndices?.optionTitle?.replace(/\s·\s\d+\smembers?$/, '')
  // Only "Change your zone" sets `sameCity: true` — it's the one option that means "stay in the
  // same city, just pick a different zone". Every other option that can land here ("Change your
  // relay city", "Switch to a different city") omits it entirely, meaning the opposite: move AWAY
  // from the current city, so the destination picker must not default to it. A plain `?? true`
  // here would be wrong — `sameCity: undefined` (an option that omitted it) must resolve to FALSE,
  // not fall through to the same default as "no state at all" (a direct/demo nav, where there's no
  // "which option" signal to go on and the old same-city default is the safer fallback).
  const sameCityIntent = stateIndices ? !!stateIndices.sameCity : true

  // The reservation's STAGE for THIS group — not the destination city type — decides whether a zone
  // step appears. City-only stage (no zone picked yet): every switch/change stays city-only (no zone
  // UI). Once a zone exists (city+zone stage): switching to the other city type, or changing city,
  // includes the zone step. So relay→host and host→relay both stay city-only when the user never
  // chose a zone for THIS group (another group may well already have one).
  const hasZone = groupIndex === 0 ? (!!flow.confirmedZone || !!flow.groupZones[0]) : !!flow.groupZones[groupIndex]
  const cityOnlyStage = !hasZone

  // Selection window state decides HOW a change lands: still open → the change applies IMMEDIATELY
  // (no admin request, success popup instead); already closed → the existing request-for-approval
  // flow below runs unchanged. Same clock CitySelection reads (`countdownSeconds`) — except once a
  // Demo Progression Controls override exists for this miqaat, the window is open only during the
  // phase matching the kind of move this screen represents (city move → 'city_open', zone move →
  // 'zone_open'), replacing the static clock entirely for that miqaat.
  const demoPhase = id ? stageOverrides[id] : undefined
  const windowOpen = demoPhase
    ? (cityOnlyStage ? demoPhase === 'city_open' : demoPhase === 'zone_open')
    : (miqaat?.countdownSeconds ?? 0) > 0
  const manageBreadcrumbLabel = t('Modify Reservation')
  // The move action's verb depends on the window: open → it applies immediately, so it reads
  // "Switch"; closed → clicking Done files an approval request, so it reads "Request" (same signal
  // as the amber "Requested" pill and the request sheet used once the window is closed).
  const switchAllLabel = windowOpen ? 'Switch all' : 'Request all'

  // Manage reservation used to be scoped to the REGISTRANT + the dependents tagged to them, which
  // couldn't reach any other group in a split reservation. It now targets whichever group the
  // Modify Reservation list pointed at (`groupIndex`), built from the FULL registered party so the
  // index lines up with flow.groupCities/flow.groupZones (the same basis City Selection and this
  // screen's own handleConfirmed use).
  const registrant = family.find((f) => f.role === 'registrant') ?? family[0]
  // Real relationships come from the store; demo/direct-nav has none → fall back to one linked
  // dependent (Syed Nazia → registrant) so the linked-group flow stays demonstrable.
  const hasRealTags = Object.keys(flow.guardians).length > 0 || Object.keys(flow.caregivers).length > 0
  const guardians = hasRealTags ? flow.guardians : { m3: registrant.id }
  const caregivers = hasRealTags ? flow.caregivers : {}
  const registeredIds = flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)
  const allGroups: Group[] = buildAllGroups(registeredIds, guardians, caregivers, flow.invites).map((g) => ({
    ...g,
    label: g.label ? bandLabel(g.label) : undefined,
  }))
  // Move every group the option covered (a family sharing one allocation → all its members here),
  // not just the first — so "Change your zone · 3 members" actually re-seats all three.
  const groups: Group[] = groupIndices.map((i) => allGroups[i]).filter((g): g is Group => !!g)
  const totalMembers = groups.reduce((n, g) => n + g.members.length, 0)
  const allMemberIds = groups.flatMap((g) => g.members.map((m) => m.member.id))

  // Members already covered by a pending (unresolved) change request for THIS event — they can't be
  // selected into another move until that request is cancelled or resolved, so a duplicate/conflicting
  // request never stacks on top of one still awaiting approval.
  const pendingForMiqaat = (flow.changeRequests ?? []).filter((r) => r.miqaatId === id)
  const pendingMemberIds = new Set(pendingForMiqaat.flatMap((r) => r.memberIds))
  const isPendingMember = (mid: string) => pendingMemberIds.has(mid)
  // The specific request covering a group (if any) — read out its requested destination so the row
  // shows WHAT was asked for instead of a blank "New" column, with a single "Pending approval" tag
  // for the whole group rather than one per member.
  const pendingRequestForGroup = (g: Group): ChangeRequest | null =>
    pendingForMiqaat.find((r) => g.members.some((mm) => r.memberIds.includes(mm.member.id))) ?? null

  // The REAL current allocation for the TARGETED group. `flow.groupCities[groupIndex]` is the
  // authoritative per-group source once City Selection (or an earlier Modify) has run;
  // `flow.confirmedCity` is the older single-city fallback, only meaningful for group 0 (the
  // pre-multi-group flow). Only fall back further to the hardcoded CITY/CURRENT_ZONE demo constants
  // when there's truly no allocation yet. (Computed here, ahead of the state below, so `relayCityId`'s
  // initializer can read the group's CURRENT relay city instead of an arbitrary default.)
  const currentAlloc = flow.groupCities[groupIndex]
    ?? (groupIndex === 0 && flow.confirmedCity ? { id: flow.confirmedCity.id, name: flow.confirmedCity.name, type: flow.confirmedCity.type } : null)

  // Relay move: pre-select the group's CURRENT relay city ONLY for the "Change your zone" intent
  // (stay in the same relay city, just pick a different zone) — defaulting to it for "Change your
  // relay city" / "Switch to a different city" would silently re-select the very city the user is
  // trying to move away from. Otherwise (or when there's no current relay city to default to), fall
  // back to the first available OTHER relay city, explicitly excluding the current one.
  const [relayCityId, setRelayCityId] = useState<string | null>(() => isRelay
    ? (sameCityIntent && currentAlloc?.type === 'relay'
        ? currentAlloc.id
        : RELAY_CITIES.find((c) => c.left > 0 && c.id !== currentAlloc?.id)?.id ?? null)
    : null)
  // "Switch to a different city" merges the old separate "Switch to {Host}" option into this same
  // relay picker — the Host City becomes one more pickable destination here, alongside every relay
  // city. Only offered when genuinely switching away (not "Change your zone", which means stay put)
  // AND the current allocation isn't already the Host City (offering it back as a "destination"
  // would be the exact self-referential no-op the current-city exclusion elsewhere guards against).
  const showHostOption = isRelay && !sameCityIntent && currentAlloc?.type !== 'host'
  // Genuinely switching city (not "Change your zone", which means stay put) — gates "My Preferred
  // City" below. ⚠️ Deliberately NOT the same condition as `showHostOption`: a registrant whose
  // current allocation already IS the Host City still has their own ranked preferred (relay) cities
  // worth surfacing as quick picks — only the Host card itself is the self-referential no-op there,
  // not the preferred-city list (which already excludes the Host city via the id filter below).
  const showSwitchDestinations = isRelay && !sameCityIntent
  // "My Preferred City" — same card, same source, as City Selection's own: an Arrange-My-Cities
  // layout's preferred-slot picks win outright when one exists (even if it left slots empty), else
  // the ranked PreferredCity list. Gated on `showSwitchDestinations` (not just `isRelay`) so it only
  // computes when it's actually rendered below — the de-dupe filter right after would otherwise
  // silently vanish these cities from the relay grid in "Change your zone" mode without showing them
  // anywhere.
  const preferredCitiesInScreen: City[] = showSwitchDestinations
    ? (arrangement
        ? arrangement.preferredCityIds.map((cid) => liveCities.find((c) => c.id === cid)).filter((c): c is LiveCity => !!c)
        : flow.cities.map((pc) => liveCities.find((c) => c.id === pc.id)).filter((c): c is LiveCity => !!c)
      ).filter((c) => c.id !== hostCityId).map(toLocalCity)
    : []
  const preferredIdsInScreen = new Set(preferredCitiesInScreen.map((c) => c.id))
  // The relay-city PICKER itself: "Change your relay city" / "Switch to a different city" means the
  // whole point is to move AWAY from the current city, so it's excluded from the list entirely —
  // picking your own current city as the "destination" is a no-op that reads as a bug ("swap to
  // the city you're already in"). "Change your zone" is the opposite: staying in the current city
  // IS the intent, so it stays in the list (already pre-selected above). Also excludes anything
  // already shown in "My Preferred City" above, same de-dupe City Selection's own grid does.
  const selectableRelayCities = (sameCityIntent ? RELAY_CITIES : RELAY_CITIES.filter((c) => c.id !== currentAlloc?.id))
    .filter((c) => !preferredIdsInScreen.has(c.id))
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null)
  const [assign, setAssign] = useState<Record<string, Allocation>>({})
  const [guardianFor, setGuardianFor] = useState<Record<string, string>>({}) // dependentId -> guardianId
  const [assignTarget, setAssignTarget] = useState<{ dependent: FamilyMember; currentGuardianId?: string } | null>(null)
  const [showAllZones, setShowAllZones] = useState(false)
  const [showAllCities, setShowAllCities] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { toast, showToast } = useToast()
  const [secs, setSecs] = useState(42 * 60 + 11)
  // Desktop sidebar searches (zone grid + relay-city grid)
  const [zoneGridSearch, setZoneGridSearch] = useState('')
  const [cityGridSearch, setCityGridSearch] = useState('')

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])

  // Resolved from the FULL real city list by id, not just the host slot or the relay-only pool —
  // "My Preferred City" can offer a real host-type city (e.g. Colombo) that ISN'T the arrangement's
  // current host-slot occupant, and that pick still needs to resolve to a real destination instead
  // of silently falling through to null.
  const activeCity = isRelay
    ? (relayCityId ? (() => { const lc = liveCities.find((c) => c.id === relayCityId); return lc ? toLocalCity(lc) : null })() : null)
    : HOST_CITY
  const zones = activeCity?.zones ?? []
  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null
  const destCity = activeCity?.name ?? ''
  // The ACTUAL destination's type — the picked city's OWN real type (mirrors City Selection's Host
  // card, which labels by city.type regardless of which slot the city sits in), not "is it in the
  // host slot" — Mumbai occupying the host slot is still really a relay city; Colombo picked from
  // "My Preferred City" is still really the host, even though it isn't in that slot right now.
  const destType: 'host' | 'relay' = activeCity ? activeCity.type : (isRelay ? 'relay' : 'host')
  // Same seat/fill data City Selection's HostCityCard reads, so the fixed host-mode destination
  // card looks identical to the one on City Selection (not just this screen's simplified City type).
  const hostLiveCity = liveCities.find((c) => c.id === HOST_CITY.id)!

  const currentCityName = currentAlloc?.name ?? CITY
  const currentCityType: 'host' | 'relay' = currentAlloc?.type ?? (CITY === HOST_CITY.name ? 'host' : 'relay')
  const currentCityTypeLabel = currentCityType === 'host' ? t('Host City') : t('Relay City')
  const currentZoneAlloc = flow.groupZones[groupIndex]
    ?? (groupIndex === 0 && flow.confirmedZone ? { name: flow.confirmedZone.name } : null)
  const currentZoneName = currentZoneAlloc?.name ?? CURRENT_ZONE
  // The CURRENT column must read PER ROW now that "Switch to a different city" can merge groups
  // from different origin cities into one screen (e.g. some members in Mumbai, others in Surat) —
  // the single representative `groupIndex` values above are only right when every group shares one
  // allocation, which the merged option no longer guarantees. Mirrors the representative computation
  // above, just keyed by the row's own group index instead of the first one.
  const currentAllocFor = (gi: number) => {
    const alloc = flow.groupCities[gi] ?? (gi === 0 && flow.confirmedCity ? { id: flow.confirmedCity.id, name: flow.confirmedCity.name, type: flow.confirmedCity.type } : null)
    const zoneAlloc = flow.groupZones[gi] ?? (gi === 0 && flow.confirmedZone ? { name: flow.confirmedZone.name } : null)
    const cityType: 'host' | 'relay' = alloc?.type ?? (CITY === HOST_CITY.name ? 'host' : 'relay')
    return {
      cityId: alloc?.id ?? null,
      cityName: alloc?.name ?? CITY,
      cityTypeLabel: cityType === 'host' ? t('Host City') : t('Relay City'),
      zoneName: zoneAlloc?.name ?? CURRENT_ZONE,
    }
  }

  // Is this a SWITCH to the other city type (relay↔host), or a change within the same type?
  // Drives the header/breadcrumb wording so "Switch to Colombo" no longer reads "Change Host City".
  const originType: 'host' | 'relay' = currentCityType
  const isSwitch = (originType === 'relay') !== (destType === 'relay')
  // The header/breadcrumb should read exactly what the user clicked on Modify Reservation (e.g.
  // "Switch to a different city") — not a recomputed label that can drift from it once this screen
  // covers more than one destination type. Only a direct/demo nav (no option clicked) falls back to
  // the old computed wording.
  const screenTitle = optionTitle ?? (destType === 'relay'
    ? (isSwitch ? 'Switch to a Relay City' : 'Change Relay City')
    : (isSwitch ? `Switch to ${HOST_CITY.name}` : 'Change Host City Zone'))

  const allocOf = (mid: string): Allocation | null => assign[mid] ?? null
  const movedCount = Object.keys(assign).length
  const addedOf = (cityId: string) => Object.values(assign).filter((a) => a.cityId === cityId).length

  const flash = (msg: string) => showToast(msg)

  // ── Reservation success tooltips (mirrors City/Zone Selection) ─────────────
  // A small green confirmation shown above the floating footer (right-aligned) naming the member(s)
  // just staged for the move. Per-row Swap + bulk "Swap all" enqueue one message per group and play
  // them one at a time — each animates in, holds briefly, then eases out before the next appears.
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
  /** Build "<member(s)> reserved in <city>." for a group. */
  const reserveTipText = (gi: number, cityName: string): string => {
    const names = groups[gi]?.members.map((m) => m.member.name) ?? []
    if (names.length === 0) return ''
    const who = names.length === 1
      ? tdText(names[0])
      : t('{list} & {last}', { list: names.slice(0, -1).map((n) => tdText(n)).join(', '), last: tdText(names[names.length - 1]) })
    return t('{who} selected in {city}.', { who, city: tdText(cityName) })
  }
  /** Enqueue one reservation tooltip per group (played sequentially). */
  const enqueueReserveTips = (gis: number[], cityName: string | undefined = destCity) => {
    if (!cityName) return
    const msgs = gis.map((gi) => reserveTipText(gi, cityName)).filter(Boolean)
    if (msgs.length) setTipQueue((q) => [...q, ...msgs])
  }
  /** Message to show if the destination isn't fully chosen yet (city for relay, zone otherwise). */
  const destGuardMsg = (): string | null => {
    if (isRelay && !activeCity) return 'Please select a relay city first.'
    if (!cityOnlyStage && !activeZone) return 'Please select a destination zone first.'
    return null
  }
  const handleChangeClick = () => {
    if (movedCount === 0) { flash('Select at least one member to move.'); return }
    // Window still open → no request flow at all: apply on the spot and confirm with a success
    // popup. Window closed → the existing "Send … Change Request" sheet (unchanged).
    if (windowOpen) applyImmediately()
    else setShowConfirm(true)
  }
  // Every member this screen could move already has a pending request awaiting approval — there's
  // nothing left to select, so the footer CTA should send the user back rather than imply an action.
  const allMembersPending = allMemberIds.length > 0 && allMemberIds.every(isPendingMember)

  /** Toggle one member's move. Linked groups move together by default, but the
   *  dependent can be removed independently; a dependent never moves without its
   *  guardian/caregiver. */
  function toggleMoveMember(gi: number, memberId: string) {
    const g = groups[gi]; if (!g) return
    // A linked group's dependent/guardian move together — if either already has a pending request,
    // block the whole pair so one never ends up mid-approval while the other gets a second request.
    if (g.members.some((m) => isPendingMember(m.member.id))) {
      flash('This member already has a pending request. Cancel it from Modify Reservation first.')
      return
    }
    const dep = g.members.find((m) => m.member.needsGuardian || m.member.needsCaregiver)?.member
    const lead = g.members.find((m) => !(m.member.needsGuardian || m.member.needsCaregiver))?.member
    const isDep = !!g.label && !!dep && memberId === dep.id
    if (assign[memberId]) {
      setAssign((prev) => {
        const n = { ...prev }
        delete n[memberId]
        if (g.label && !isDep && dep) delete n[dep.id] // removing the lead drops the dependent
        return n
      })
      return
    }
    { const msg = destGuardMsg(); if (msg || !activeCity) { if (msg) flash(msg); return } }
    const alloc = { cityId: activeCity.id, cityName: activeCity.name, zoneId: activeZone?.id ?? '', zoneName: activeZone?.name ?? '' }
    setAssign((prev) => {
      const n = { ...prev }
      n[memberId] = alloc
      if (g.label) {
        if (!isDep && dep) n[dep.id] = alloc // selecting the lead selects the dependent
        if (isDep && lead) n[lead.id] = alloc // the dependent can't move without the lead
      }
      return n
    })
    enqueueReserveTips([gi], activeCity.name)
  }

  function selectAll() {
    { const msg = destGuardMsg(); if (msg || !activeCity) { if (msg) flash(msg); return } }
    // Members with a pending request already awaiting approval sit out of "select all" — they can't
    // be folded into a second, overlapping request.
    const selectableIds = allMemberIds.filter((mid) => !isPendingMember(mid))
    const alloc = { cityId: activeCity.id, cityName: activeCity.name, zoneId: activeZone?.id ?? '', zoneName: activeZone?.name ?? '' }
    const allHere = selectableIds.every((mid) => assign[mid]?.cityId === activeCity.id && (cityOnlyStage || assign[mid]?.zoneId === activeZone!.id))
    if (allHere) { setAssign({}); return }
    // One tip per GROUP that gains a newly-staged member here (mirrors City/Zone Selection's bulk
    // reserve — a whole family reads as one message, not one per individual).
    const newlyAddedIds = new Set(selectableIds.filter((mid) =>
      !(assign[mid]?.cityId === activeCity.id && (cityOnlyStage || assign[mid]?.zoneId === activeZone!.id))))
    setAssign((prev) => {
      const next: Record<string, Allocation> = { ...prev }
      selectableIds.forEach((mid) => { next[mid] = alloc })
      return next
    })
    const newlyGroupIdx = groups.map((_, gi) => gi).filter((gi) => groups[gi].members.some((m) => newlyAddedIds.has(m.member.id)))
    enqueueReserveTips(newlyGroupIdx, activeCity.name)
  }

  /** Whole group moves together — toggle every member's allocation to the active zone. */
  function toggleGroupMove(gi: number) {
    const g = groups[gi]; if (!g) return
    const ids = g.members.map((m) => m.member.id)
    if (ids.some((id) => assign[id])) {
      setAssign((prev) => { const n = { ...prev }; ids.forEach((id) => delete n[id]); return n })
      return
    }
    if (ids.some((id) => isPendingMember(id))) {
      flash('This member already has a pending request. Cancel it from Modify Reservation first.')
      return
    }
    { const msg = destGuardMsg(); if (msg || !activeCity) { if (msg) flash(msg); return } }
    const alloc = { cityId: activeCity.id, cityName: activeCity.name, zoneId: activeZone?.id ?? '', zoneName: activeZone?.name ?? '' }
    setAssign((prev) => {
      const n = { ...prev }
      ids.forEach((id) => { n[id] = alloc })
      return n
    })
    enqueueReserveTips([gi], activeCity.name)
  }
  // True once every selectable member (pending-request rows excluded, same as selectAll) is already
  // staged for the CURRENT destination specifically — not just "has some allocation" — so the bulk
  // button flips to "Remove all" only when it truly matches what's picked right now (mirrors City/Zone
  // Selection's allGroupsAssigned/allZoneGroupsAssigned).
  const selectableMemberIds = allMemberIds.filter((mid) => !isPendingMember(mid))
  const allMembersMoved = !!activeCity && selectableMemberIds.length > 0
    && selectableMemberIds.every((mid) => assign[mid]?.cityId === activeCity.id && (cityOnlyStage || assign[mid]?.zoneId === activeZone?.id))

  /** ⚠️ Row index → allocation lookup. The tables/cards key their rows by position within `groups`
   *  (the SUBSET this screen moves, `groupIndices.map(...)`), but `flow.groupCities`/`groupZones` —
   *  and therefore `currentAllocFor` — are keyed by position in the FULL `allGroups` array. The two
   *  only coincide when `groupIndices` is [0,1,2,…]. When it isn't (e.g. the plain "Switch to a
   *  different city" option covering only the zone-less groups → `groupIndices: [1,2]`), every
   *  CURRENT cell read one group off: a member in Kolkata rendered as "Delhi", the next as
   *  "Kolkata". Always translate before reading an allocation. */
  const currentAllocForRow = (li: number) => currentAllocFor(groupIndices[li] ?? li)

  // Members with a request already awaiting approval are rendered in their OWN table above, not
  // inline among the selectable rows — they aren't actionable here (a second request can't stack on
  // one that's pending) and mixing them in made it hard to see who was already requested. Both
  // lists carry the group's index in the FULL `groups` array, since every callback is keyed by it.
  const groupEntries = groups.map((g, gi) => ({ g, gi }))
  const requestedEntries = groupEntries.filter(({ g }) => !!pendingRequestForGroup(g))
  const movableEntries = groupEntries.filter(({ g }) => !pendingRequestForGroup(g))

  /** Withdraw one group's members from whichever request covers them, leaving the rest of that
   *  request (other groups, possibly moving from other cities) untouched. */
  function cancelGroupRequest(g: Group) {
    const req = pendingRequestForGroup(g)
    if (!req) return
    const ids = g.members.map((m) => m.member.id).filter((mid) => req.memberIds.includes(mid))
    if (ids.length === 0) return
    cancelChangeRequestMembers(req.id, ids)
    showToast('Request cancelled', 'success')
  }

  /** The dependent (needs guardian/caregiver) within a linked group. */
  const dependentOf = (g: Group): FamilyMember | null =>
    g.members.find((mm) => mm.member.needsGuardian || mm.member.needsCaregiver)?.member ?? null

  const movedMembers = allMemberIds
    .filter((mid) => assign[mid])
    .map((mid) => {
      const fm = family.find((f) => f.id === mid)!
      const a = assign[mid]
      const instant = fm.role === 'registrant' || !!fm.needsGuardian
      return { id: mid, name: fm.name, zone: `${a.cityName} - ${a.zoneName}`, instant }
    })
  const others = movedMembers.filter((m) => !m.instant)

  function handleConfirmed() {
    // A city/zone change is a REQUEST that goes to an admin for approval — it does NOT change the
    // allocation immediately. Record it so it appears (and can be cancelled) on the Modify screen,
    // then return there. Once approved, the admin flow would apply the new allocation.
    const a0 = movedMembers.map((m) => assign[m.id]).find(Boolean)
    const toLabel = a0 ? (cityOnlyStage ? a0.cityName : `${a0.cityName} - ${a0.zoneName}`) : ''
    // Each member's origin must come from THEIR OWN group, not the screen's representative
    // `groupIndex` — the merged "Switch to a different city" option can cover groups sitting in
    // different cities, and labelling all of them with the first group's city misreports the rest
    // (a member already in Colombo showing as "Delhi → …"). Same per-row reasoning as the CURRENT
    // column's `currentAllocFor`, which this reuses.
    const originOf = new Map<string, string>()
    groupIndices.forEach((gi) => {
      const g = allGroups[gi]
      if (!g) return
      const cur = currentAllocFor(gi)
      const label = cityOnlyStage ? cur.cityName : `${cur.cityName} - ${cur.zoneName}`
      g.members.forEach((mm) => originOf.set(mm.member.id, label))
    })
    const fallbackFrom = cityOnlyStage ? currentCityName : `${currentCityName} - ${currentZoneName}`
    // Destination is per-member for the same reason: `assign[id]` is written when that member is
    // staged, using whatever destination was active THEN. Switching the picked city part-way
    // through leaves earlier members staged to the earlier city, so reading only `a0` (the first
    // one) would misreport everyone staged after the switch.
    const members = movedMembers.map((m) => {
      const a = assign[m.id]
      return {
        id: m.id,
        name: m.name,
        fromLabel: originOf.get(m.id) ?? fallbackFrom,
        toLabel: a ? (cityOnlyStage ? a.cityName : `${a.cityName} - ${a.zoneName}`) : toLabel,
      }
    })
    addChangeRequest({
      id: `cr-${Date.now()}`,
      miqaatId: id ?? '',
      kind: cityOnlyStage ? 'city' : 'zone',
      title: optionTitle ?? (cityOnlyStage ? 'City change' : 'Zone change'),
      memberNames: movedMembers.map((m) => m.name),
      memberIds: movedMembers.map((m) => m.id),
      fromLabel: members[0]?.fromLabel ?? fallbackFrom,
      toLabel,
      members,
      requestedAt: new Date().toISOString(),
    })
    setShowConfirm(false)
    showToast('Request submitted for approval', 'success')
    setTimeout(() => nav(`/miqaats/${id}/manage`), 1500)
  }

  /** Selection window still open → the change is applied IMMEDIATELY (no admin request). Writes the
   *  moved groups' new city (and zone, when this stage has one) straight into the journey, then
   *  confirms with the "updated successfully" popup. Keyed by the same `allGroups` indices that
   *  `flow.groupCities`/`flow.groupZones` use, so the change reflects everywhere instantly. */
  function applyImmediately() {
    if (!activeCity) return
    const cityAlloc: GroupCityAlloc = { id: activeCity.id, name: activeCity.name, type: destType }
    const cities: Record<string, GroupCityAlloc> = {}
    const zones: Record<string, GroupZoneAlloc> = {}
    groupIndices.forEach((gi) => {
      const g = allGroups[gi]
      if (!g || !g.members.every((m) => assign[m.member.id])) return // group not (fully) selected
      cities[gi] = cityAlloc
      if (!cityOnlyStage && activeZone) {
        zones[gi] = { id: activeZone.id, name: activeZone.name, cityId: activeCity.id, cityName: activeCity.name }
      }
    })
    applyCityZoneChange(cities, zones)
    // Same-city move (e.g. "Change your zone" within the host city) → a ZONE update; anything that
    // landed in a different city → a CITY update.
    setUpdatedKind(activeCity.id !== (currentAlloc?.id ?? '') ? 'city' : 'zone')
  }

  const active = activeCity && (cityOnlyStage || activeZone) ? { cityId: activeCity.id, zoneId: activeZone?.id ?? '' } : null

  // Desktop step indicator (City/Zone selection → members to move). Mobile is unchanged.
  const membersStep = { label: t('Members'), count: `${movedCount}/${totalMembers}`, done: movedCount > 0 }
  const moveSteps = isRelay
    ? cityOnlyStage
      ? [{ label: t('City'), done: activeCity !== null }, membersStep]
      : [{ label: t('City'), done: activeCity !== null }, { label: t('Zone'), done: activeZone !== null }, membersStep]
    : cityOnlyStage
      ? [{ label: t('City'), done: true }, membersStep]
      : [{ label: t('City'), done: true }, { label: t('Zone'), done: activeZone !== null }, membersStep]
  const moveSubtext = isRelay
    ? cityOnlyStage
      ? t('Select the destination city, then choose the members to move.')
      : t('Select the destination city and zone, then choose the members to move.')
    : cityOnlyStage
      ? t('Choose the members to move to the Host City.')
      : t('Select a destination zone, then choose the members to move.')

  // Footer CTA: an OPEN window applies the move immediately (desktop "Done" / mobile "Confirm"); a
  // CLOSED one files an approval request instead, so it reads "Submit request" on both — matching the
  // "Request all"/"Request to {city}" action wording used everywhere else once the window is closed.
  const footer = (
    <StickyFooter
      caption={tx('Allocation')}
      title={tx('Close in {time}', { time: fmtHHMMSS(secs) })}
      button={allMembersPending ? t('Go back') : windowOpen ? (movedCount > 0 ? t('Confirm ({n})', { n: movedCount }) : t('Confirm')) : (movedCount > 0 ? t('Submit request ({n})', { n: movedCount }) : t('Submit request'))}
      onButton={allMembersPending ? () => nav(`/miqaats/${id}/manage`) : handleChangeClick}
      back={allMembersPending ? undefined : { onClick: () => nav(-1) }}
    />
  )
  const desktopFooter = (
    <StickyFooter
      caption={tx('Allocation')}
      title={tx('Close in {time}', { time: fmtHHMMSS(secs) })}
      button={allMembersPending ? t('Go back') : windowOpen ? t('Done') : 'Submit request'}
      onButton={allMembersPending ? () => nav(`/miqaats/${id}/manage`) : handleChangeClick}
      back={allMembersPending ? undefined : { onClick: () => nav(-1) }}
    />
  )

  return (
    <>
      <PhoneScreen footer={<div className="sm:hidden">{footer}</div>}>
        <AppBar notificationCount={3} />

        {/* ═══════════════════════ MOBILE — unchanged single-column flow ═══════════════════════ */}
        <div className="contents sm:hidden">
        <div className="ms-[16px] sm:ms-0 mt-[12px]">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/miqaats' },
              { label: manageBreadcrumbLabel, to: `/miqaats/${id}/manage` },
              { label: screenTitle },
            ]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
        </div>

        <h1 className="mt-[14px] px-[16px] sm:px-0 text-[26px] leading-[32px] text-[#15402f]" style={{ fontFamily: SERIF }}>
          {screenTitle}
        </h1>
        <p className="mt-[6px] px-[16px] sm:px-0 text-[14px] leading-[20px] text-[#6b7670]" style={{ fontFamily: FONT }}>
          {moveSubtext}
        </p>

        {/* Relay city picker (relay mode only) — mirrors the desktop sidebar's three-tier layout
            (Host card / "My Preferred City" / "Other Cities") instead of flattening everything into
            one "Other Cities" row. */}
        {isRelay && (
          <>
            {showHostOption && (
              <div className="mx-[16px] sm:mx-0 mt-[16px]">
                <HostCityCard
                  city={hostLiveCity}
                  selected={relayCityId === HOST_CITY.id}
                  onSelect={() => { setRelayCityId(relayCityId === HOST_CITY.id ? null : HOST_CITY.id); setActiveZoneId(null) }}
                  topLabel={t('Top preferred city')}
                  onSwapAll={relayCityId === HOST_CITY.id ? selectAll : undefined}
                  anySwappable={relayCityId === HOST_CITY.id && (cityOnlyStage ? !!activeCity : !!activeZone) && selectableMemberIds.length > 1}
                  swapAllLabel={switchAllLabel}
                />
              </div>
            )}
            {preferredCitiesInScreen.length > 0 && (
              <>
                <div className="mx-[16px] sm:mx-0 mt-[16px] flex items-center gap-[6px]">
                  <PreferredStarIcon />
                  <p className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...tx('My Preferred City')} />
                </div>
                <div className="mt-[12px] flex gap-[10px] overflow-x-auto px-[16px] sm:px-0 pb-[4px]" style={{ scrollbarWidth: 'none' }}>
                  {preferredCitiesInScreen.map((c) => (
                    <CityHCard key={c.id} city={c} selected={c.id === relayCityId} added={addedOf(c.id)}
                      onSelect={() => { setRelayCityId(relayCityId === c.id ? null : c.id); setActiveZoneId(null) }} />
                  ))}
                </div>
              </>
            )}
            <div className="mx-[16px] sm:mx-0 mt-[16px] flex items-center justify-between">
              <h2 className="text-[20px] leading-[26px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Other Cities')} />
              <button type="button" onClick={() => setShowAllCities(true)} className="flex items-center gap-[3px] text-[15px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>
                <span {...tx('View all')} /> <Chevron />
              </button>
            </div>
            <div className="mt-[12px] flex gap-[10px] overflow-x-auto px-[16px] sm:px-0 pb-[4px]" style={{ scrollbarWidth: 'none' }}>
              {selectableRelayCities.map((c) => (
                <CityHCard key={c.id} city={c} selected={c.id === relayCityId} added={addedOf(c.id)}
                  onSelect={() => { setRelayCityId(relayCityId === c.id ? null : c.id); setActiveZoneId(null) }} />
              ))}
            </div>
          </>
        )}

        {/* Zones — hidden when changing the relay city only (no zone step) */}
        {!cityOnlyStage && activeCity && zones.length > 0 && (
          <>
            <div className="mx-[16px] sm:mx-0 mt-[18px] flex items-center justify-between">
              <h2 className="text-[20px] leading-[26px] text-[#15402f]" style={{ fontFamily: SERIF }}>{destCity} zones</h2>
              <button type="button" onClick={() => setShowAllZones(true)} className="flex items-center gap-[3px] text-[15px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>
                <span {...tx('View all')} /> <Chevron />
              </button>
            </div>
            <div className="mt-[12px] flex gap-[10px] overflow-x-auto px-[16px] sm:px-0 pb-[4px]" style={{ scrollbarWidth: 'none' }}>
              {zones.map((z) => (
                <ZoneHCard key={z.id} zone={z} selected={activeZoneId === z.id} onSelect={() => setActiveZoneId(z.id)} />
              ))}
            </div>
          </>
        )}

        {/* Action bar (mobile) — the member count + Select all and the "selected destination" banner.
            Styling mirrors City Selection. Only STICKY when there's more than one member card to
            scroll past; with a single card the pinned shadow just looks like clutter. */}
        <div className={groups.length > 1 ? 'sticky top-0 z-20 bg-white pb-[12px] shadow-[0_8px_14px_-12px_rgba(15,77,60,0.4)]' : 'pb-[12px]'}>
        {/* Members + Swap all / Remove all — same layout/colours as City Selection's member-count
            row, teal "Swap all" (every member here already has a current allocation, so moving them
            is always a swap, never a first-time reserve) that flips to an outlined "Remove all" once
            everyone's already staged for this exact destination. Same `selectAll` toggle either way —
            only the label/style changes. */}
        <div className="pt-[16px] px-[16px] flex items-center justify-between">
          <span className="flex items-center gap-[6px] text-[14px] font-bold text-[#b8821e]" style={{ fontFamily: FONT }}>
            <PeopleMini color="#b8821e" />
            <bdi {...tx(plural(totalMembers, '{n} member', '{n} members'), { n: totalMembers })} />
          </span>
          {(cityOnlyStage ? !!activeCity : !!activeZone) && selectableMemberIds.length > 1 && (
            allMembersMoved ? (
              <button type="button" onClick={selectAll}
                className="h-[32px] rounded-full border border-[#e0b0aa] bg-white px-[14px] text-[13px] font-bold text-[#c0392b] transition-colors hover:bg-[#fdf3f2]"
                style={{ fontFamily: FONT }} {...tx('Remove all')} />
            ) : (
              <button type="button" onClick={selectAll}
                className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[#2e6a7d] px-[14px] text-[13px] font-bold text-white shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-colors hover:bg-[#265a6b] active:scale-[0.97]"
                style={{ fontFamily: FONT }}>
                <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 7h9l-2.3-2.4M13 11H4l2.3 2.4" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="truncate" {...tx('{verb} to {city}', { verb: switchAllLabel, city: tdText(destCity ?? '') })} />
              </button>
            )
          )}
        </div>

        {/* Active destination banner — same pill + copy as the desktop panel ("Selected host/relay
            city X — select members below"), city-only when changing relay city, else city · zone. */}
        {(cityOnlyStage ? !!activeCity : !!activeZone) && (
          <div className="mx-[16px] mt-[12px] flex items-center gap-[8px] rounded-[12px] border px-[14px] py-[11px]" style={{ background: '#fdf1e2', borderColor: '#f1d7b6' }}>
            <PinIcon color="#c8842a" size={15} />
            {/* The English fragments sit beside a translated `Selected` in an RTL line, so each one
                needs its own isolate; `destCity` goes through `td` like the zone name beside it,
                which both resolves it and isolates it (it was a raw string in a bare <strong>). */}
            <span className="text-[13.5px] font-semibold leading-[19px]" style={{ fontFamily: FONT, color: '#9a6a1e' }}>
              {t('Selected')} <Iso>{destType} city</Iso> <strong className="font-bold text-[#1f5a44]" {...td(destCity)} />
              {!cityOnlyStage && activeZone && <> · <strong className="font-bold text-[#1f5a44]" {...td(activeZone.name)} /></>}
              {' '}<Iso>— select members below</Iso>
            </span>
          </div>
        )}
        </div>{/* end sticky action bar */}

        {/* Already requested — own section, mirroring the desktop table above the move list */}
        {requestedEntries.length > 0 && (
          <div className="mx-[16px] mt-[20px] sm:hidden">
            <div className="flex items-baseline justify-between gap-[10px]">
              <h2 className="text-[18px] leading-[24px] font-bold text-[#1a2a23]" style={{ fontFamily: FONT }} {...tx('Already requested')} />
              <span className="shrink-0 text-[12px] text-[#8a938e]" style={{ fontFamily: FONT }}>{requestedEntries.length} pending</span>
            </div>
            <p className="mt-[4px] text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Cancel one to make those members selectable again.')} />
            <div className="mt-[12px] flex flex-col gap-[12px]">
              {requestedEntries.map(({ g, gi }) => {
                const a = currentAllocForRow(gi)
                return (
                  <RequestedCard
                    key={gi}
                    g={g}
                    current={cityOnlyStage ? a.cityName : `${a.cityName} - ${a.zoneName}`}
                    requestedTo={pendingRequestForGroup(g)?.toLabel ?? ''}
                    cityOnly={cityOnlyStage}
                    onCancel={() => cancelGroupRequest(g)}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Members */}
        <h2 className="mt-[20px] px-[16px] sm:px-0 text-[18px] leading-[24px] font-bold text-[#1a2a23]" style={{ fontFamily: FONT }} {...tx('Who are you moving?')} />

        {/* Mobile: stacked cards */}
        <div className="mx-[16px] mt-[12px] mb-[24px] flex flex-col gap-[14px] sm:hidden">
          {movableEntries.map(({ g, gi }) => {
            const dep = dependentOf(g)
            const gName = dep && guardianFor[dep.id] ? family.find((f) => f.id === guardianFor[dep.id])?.name ?? null : null
            // Per-row, not the single representative group's — "Switch to a different city" can
            // merge groups whose current allocations differ (see currentAllocFor above).
            const rowAlloc = currentAllocForRow(gi)
            const rowCurrentLine = cityOnlyStage ? rowAlloc.cityName : `${rowAlloc.cityName} - ${rowAlloc.zoneName}`
            return (
              <MoveGroupCard
                key={gi}
                group={g}
                allocOf={allocOf}
                active={active}
                currentLine={rowCurrentLine}
                currentSublabel={rowAlloc.cityTypeLabel}
                cityOnly={cityOnlyStage}
                newPlaceholder={isRelay ? 'Choose city' : `Move to ${destCity}`}
                newSublabel={destType === 'relay' ? t('Relay City') : t('Host City')}
                guardianName={gName}
                onToggleCard={() => toggleGroupMove(gi)}
                onAssignGuardian={() => { if (dep) setAssignTarget({ dependent: dep, currentGuardianId: guardianFor[dep.id] ?? g.members[0].member.id }) }}
                pendingRequest={pendingRequestForGroup(g)}
              />
            )
          })}
        </div>

        </div>{/* ── end mobile ── */}

        {/* ═══════════════════════ DESKTOP — two-panel (cream sidebar + white panel) ═══════════════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">
            {/* ───── LEFT sidebar ───── */}
            <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[24px] overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">
              <Breadcrumb
                items={[
                  { label: 'Home', to: '/miqaats' },
                  { label: manageBreadcrumbLabel, to: `/miqaats/${id}/manage` },
                  { label: screenTitle },
                ]}
                onNavigate={(to) => nav(to)}
                onBack={() => nav(-1)}
                activeColor="#a8843e"
                dense
              />
              <MoveSidebarCard
                isRelay={isRelay}
                showZones={!cityOnlyStage}
                cities={selectableRelayCities}
                activeCityId={relayCityId}
                addedOf={addedOf}
                onSelectCity={(c) => { setRelayCityId(c ? c.id : null); setActiveZoneId(null) }}
                citySearch={cityGridSearch}
                onCitySearch={setCityGridSearch}
                cityName={destCity}
                zones={zones}
                activeZoneId={activeZoneId}
                onSelectZone={(z) => setActiveZoneId(z.id)}
                zoneSearch={zoneGridSearch}
                onZoneSearch={setZoneGridSearch}
                hostLiveCity={hostLiveCity}
                showHostOption={showHostOption}
                hostCity={HOST_CITY}
                preferredCities={preferredCitiesInScreen}
                swapAll={
                  (cityOnlyStage ? !!activeCity : !!activeZone) && selectableMemberIds.length > 1
                    ? { allMoved: allMembersMoved, destName: destCity, onClick: selectAll, verb: switchAllLabel }
                    : undefined
                }
              />
            </aside>

            {/* ───── RIGHT panel ───── */}
            <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
                <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: SERIF }}>
                  {screenTitle}
                </h1>
                <p className="mt-[6px] text-[15px] leading-[21px] text-[#6b7670]" style={{ fontFamily: FONT }}>
                  {moveSubtext}
                </p>
                <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
                  <StepIndicator steps={moveSteps} />
                  {/* Once a destination is picked, prompt the user to allocate members to it —
                      same pill as City Selection's "Selected host/relay city X" and Zone
                      Selection's "Selected zone X", instead of the mobile-only plain banner. */}
                  {activeCity && (
                    <span className="inline-flex h-[36px] items-center gap-[8px] rounded-full border px-[15px]" style={{ background: '#fdf1e2', borderColor: '#f1d7b6' }}>
                      <PinIcon color="#c8842a" size={16} />
                      <span className="text-[14px] font-semibold" style={{ fontFamily: FONT, color: '#9a6a1e' }}>
                        {t('Selected')} <Iso>{destType} city</Iso> <strong className="font-bold text-[#1f5a44]" {...td(destCity)} />
                        {!cityOnlyStage && activeZone && <> · <strong className="font-bold text-[#1f5a44]" {...td(activeZone.name)} /></>}
                        {' '}<Iso>— select members below</Iso>
                      </span>
                    </span>
                  )}
                </div>
                {requestedEntries.length > 0 && (
                  <div className="mt-[20px]">
                    <div className="flex items-baseline justify-between gap-[12px]">
                      <h2 className="text-[18px] leading-[24px] font-bold text-[#1a2a23]" style={{ fontFamily: FONT }} {...tx('Already requested')} />
                      <span className="shrink-0 text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>
                        {requestedEntries.length} awaiting approval
                      </span>
                    </div>
                    <p className="mt-[4px] text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('These members already have a change request in review. Cancel one to make it selectable again.')} />
                    <div className="mt-[12px]">
                      <RequestedTable
                        entries={requestedEntries}
                        currentAllocOf={currentAllocForRow}
                        cityOnly={cityOnlyStage}
                        dependentOf={dependentOf}
                        requestFor={pendingRequestForGroup}
                        onCancel={cancelGroupRequest}
                      />
                    </div>
                  </div>
                )}
                <h2 className="mt-[20px] text-[18px] leading-[24px] font-bold text-[#1a2a23]" style={{ fontFamily: FONT }} {...tx('Who are you moving?')} />
                <div className="mt-[14px]">
                  <MoveDesktopTable
                    groups={movableEntries.map((e) => e.g)}
                    indexMap={movableEntries.map((e) => e.gi)}
                    allocOf={allocOf}
                    currentAllocOf={currentAllocForRow}
                    cityOnly={cityOnlyStage}
                    isRelay={destType === 'relay'}
                    destCityName={destCity}
                    destCityId={activeCity?.id}
                    hasActiveDest={!!active}
                    dependentOf={dependentOf}
                    guardianNameFor={(g) => {
                      const dep = dependentOf(g)
                      return dep && guardianFor[dep.id] ? family.find((f) => f.id === guardianFor[dep.id])?.name ?? null : null
                    }}
                    onToggleMember={toggleMoveMember}
                    onAssignGuardian={(g) => {
                      const dep = dependentOf(g)
                      if (dep) setAssignTarget({ dependent: dep, currentGuardianId: guardianFor[dep.id] ?? g.members[0].member.id })
                    }}
                    onChooseDest={toggleGroupMove}
                    isPendingMember={isPendingMember}
                    pendingRequestForGroup={pendingRequestForGroup}
                    windowOpen={windowOpen}
                  />
                </div>
              </div>
              <div className="shrink-0">{desktopFooter}</div>
            </section>
          </div>
        </div>
      </PhoneScreen>

      {showAllCities && (
        <AllCitiesSheet cities={selectableRelayCities} activeCityId={relayCityId} addedOf={addedOf}
          onSelect={(c) => { setRelayCityId(c.id); setActiveZoneId(null) }} onClose={() => setShowAllCities(false)} />
      )}

      {showAllZones && activeCity && (
        <AllZonesSheet cityName={destCity} zones={zones} activeZoneId={activeZoneId}
          onSelect={(z) => setActiveZoneId(z.id)} onClose={() => setShowAllZones(false)} />
      )}

      {assignTarget && (
        <AssignGuardianSheet
          dependent={assignTarget.dependent}
          currentGuardianId={assignTarget.currentGuardianId}
          onClose={() => setAssignTarget(null)}
          onAssign={(gid) => {
            setGuardianFor((prev) => ({ ...prev, [assignTarget.dependent.id]: gid }))
            setAssignTarget(null)
            showToast(`Guardian updated to ${firstName(family.find((f) => f.id === gid)?.name ?? '')}`, 'success')
          }}
          onRemove={guardianFor[assignTarget.dependent.id] ? () => {
            setGuardianFor((prev) => { const n = { ...prev }; delete n[assignTarget.dependent.id]; return n })
            setAssignTarget(null)
            showToast('Guardian removed', 'success')
          } : undefined}
        />
      )}

      {showConfirm && (
        <ConfirmPopup others={others} cityOnly={cityOnlyStage} onConfirm={handleConfirmed} onClose={() => setShowConfirm(false)} />
      )}

      {updatedKind && (
        <UpdatedPopup kind={updatedKind} onDone={() => { setUpdatedKind(null); nav(`/miqaats/${id}/manage`) }} />
      )}

      <Toast toast={toast} />
      <ReserveTip tip={activeTip} />
    </>
  )
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
