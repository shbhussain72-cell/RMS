import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { isolateRuns } from '../components/Bidi'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import StickyFooter from '../components/figma/StickyFooter'
import RoleBadge from '../components/figma/RoleBadge'
import { liveCities, family, genderByIts, miqaats, type FamilyMember, type LiveCity } from '../data/seed'
import { buildAllGroups, type Group } from '../lib/group'
import Popover from '../components/Popover'
import { useStore, journeyFor } from '../store'
import { plural, useT, tNow } from '../i18n'
import { memberTableMinWidth } from '../components/memberTable'

// ── Constants ──────────────────────────────────────────────────────────────────

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

/** Number of "Preferred city" card slots (2 rows × 3, per the design). */
const PREFERRED_SLOTS = 6

// ── Types ──────────────────────────────────────────────────────────────────────

/** Which card slot a dropdown pick is being made for. */
type SlotRef = { kind: 'host' } | { kind: 'preferred'; idx: number } | { kind: 'relay'; idx: number }

// ── Helpers ────────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function familyMeta(m: FamilyMember) {
  const g = m.gender ?? genderByIts(m.its)
  const base = `${g ? `${g} · ` : ''}${tNow('Age')} ${String(m.age).padStart(2, '0')} · ${tNow('ITS')} ${m.its}`
  return isolateRuns(m.relation ? `${tNow(m.relation)} · ${base}` : base)
}

/** Seed-order index — used to slot a removed preferred city back into its natural relay position. */
const seedIndex = (id: string) => liveCities.findIndex((c) => c.id === id)

/** `LiveCity.region` is a mix of Indian states and direct country names — map states to "India" so
 *  the relay list can be grouped by country. Anything not listed falls back to its raw region. */
const REGION_TO_COUNTRY: Record<string, string> = {
  Maharashtra: 'India', 'Tamil Nadu': 'India', 'Madhya Pradesh': 'India', 'West Bengal': 'India',
  Telangana: 'India', Delhi: 'India', Gujarat: 'India', Kerala: 'India', Karnataka: 'India', 'Uttar Pradesh': 'India',
  Rajasthan: 'India',
  USA: 'United States', UK: 'United Kingdom', UAE: 'United Arab Emirates',
}
const countryOf = (c: LiveCity) => REGION_TO_COUNTRY[c.region] ?? c.region

// ── Shared atoms ───────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="text-white font-bold" style={{ fontSize: size * 0.36, fontFamily: FONT, lineHeight: 1 }}>
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

// ── Left panel cards ───────────────────────────────────────────────────────────

/** Host City slot card — mirrors City Selection's Host card look, but the only action is "Change"
 *  (which city should occupy this card). No selection/reservation happens here. */
function HostSlotCard({ city, onChange }: { city: LiveCity; onChange: (el: HTMLElement) => void }) {
  const { tx, td } = useT()
  return (
    <div
      className="w-full rounded-[14px] bg-white px-[18px] py-[16px]"
      style={{ border: '2px solid #e7dfc9', boxShadow: '0 4px 18px -12px rgba(21,64,47,0.10)' }}
    >
      <div className="flex items-center gap-[8px]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
          <path d="M12 3.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.5l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76L12 3.5Z" stroke="#c2a04e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <p className="text-[17px] leading-[21px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Top preferred cities')} />
      </div>
      <div className="mt-[12px] flex items-center gap-[12px]">
        <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[12px] border" style={{ borderColor: '#e0cc93', background: '#f7efd6' }}>
          <svg viewBox="0 0 24 24" fill="none" className="size-[24px]">
            <path d="M12 3v2.2" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8.6 9.4a3.4 3.4 0 016.8 0" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M5 21V10.5M19 21V10.5" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 21v-5a4 4 0 018 0v5" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M3.5 21h17" stroke="#1f5a44" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          {/* The label follows the OCCUPYING city's real type, not the slot's position — a relay
              city placed here should read as a relay city, not "Host city", to avoid confusion. */}
          <p className="text-[14px] font-bold leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            {city.type === 'host' ? 'Host city' : 'Relay city'}
          </p>
          <p className="truncate text-[20px] font-bold leading-[26px] text-[#a8843e]" style={{ fontFamily: FONT }} {...td(city.name)} />
        </div>
        <button
          type="button"
          onClick={(e) => onChange(e.currentTarget)}
          className="ms-auto flex h-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white px-[18px] text-[13px] font-bold text-[#a8843e] transition-colors hover:bg-[#fffdf5]"
          style={{ fontFamily: FONT, border: '1.5px solid #e0cc93' }} {...tx('Change')} />
      </div>
    </div>
  )
}

/** Preferred city card — 6 configurable slots. Empty slots read "+ Add"; a filled slot shows its
 *  city with Change (same dropdown) and a ✕ that returns the city to the relay list. */
function PreferredSlotsCard({ slots, liveById, onAdd, onClear }: {
  slots: (string | null)[]
  liveById: Map<string, LiveCity>
  onAdd: (idx: number, el: HTMLElement) => void
  onClear: (idx: number) => void
}) {
     const { tx, t, td } = useT()
  return (
    <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[16px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
      <div className="flex items-center gap-[8px]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
          <path d="M12 3.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.5l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76L12 3.5Z" stroke="#c2a04e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <p className="text-[17px] leading-[21px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Your Preferred Cities')} />
      </div>
      <div className="mt-[12px] grid grid-cols-3 gap-[10px]">
        {slots.map((cid, idx) => {
          const { t } = useT()
          const city = cid ? liveById.get(cid) : undefined
          if (!city) {
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => onAdd(idx, e.currentTarget)}
                className="flex h-[50px] items-center justify-center gap-[5px] rounded-[10px] bg-white transition-colors hover:bg-[#fffdf5]"
                style={{ border: '1.5px solid #e0cc93' }}
              >
                <svg viewBox="0 0 16 16" fill="none" className="size-[13px]">
                  <path d="M8 3v10M3 8h10" stroke="#a8843e" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="text-[13px] font-bold text-[#a8843e]" style={{ fontFamily: FONT }} {...tx('Add')} />
              </button>
            )
          }
          return (
            <div key={idx} className="relative flex h-[50px] flex-col justify-center rounded-[10px] bg-[#fffdf5] ps-[10px] pe-[26px] py-[6px]" style={{ border: '1.5px solid #c5a84d' }}>
              <button
                type="button"
                onClick={(e) => onAdd(idx, e.currentTarget)}
                className="min-w-0 text-start"
                title={t('Change city')}
              >
                {/* City name gets the full cell width on its own line — the type tag sits below (with
                    "Change") instead of inline, so a longer name isn't squeezed and truncated. */}
                <span className="block w-full truncate text-[13px] font-bold leading-[16px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(city.name)} />
                <span className="mt-[3px] flex items-center gap-[5px]">
                  <span
                    className="shrink-0 rounded-full px-[6px] py-[1px] text-[9px] font-bold uppercase leading-[13px] tracking-[0.3px]"
                    style={
                      city.type === 'host'
                        ? { background: '#fbeed2', color: '#a8843e' }
                        : { background: '#e3eef0', color: '#2e6a7d' }
                    }
                  >
                    {city.type === 'host' ? t('Host') : 'Relay'}
                  </span>
                  <span className="text-[10.5px] font-bold leading-[13px] text-[#a8843e]" style={{ fontFamily: FONT }} {...tx('Change')} />
                </span>
              </button>
              <button
                type="button"
                onClick={() => onClear(idx)}
                aria-label={`Remove ${city.name}`}
                className="absolute end-[4px] top-1/2 flex size-[20px] -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb]"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-[11px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Relay city card — grouped into per-country accordions (collapsed by default, only one open at a
 *  time) instead of one long list; every card's only action is "Change" (pick which city occupies
 *  that position) — this is browsing/organization only, the relay order itself is fixed/read-only. */
function RelayOrderCard({ cities, search, onSearch }: {
  cities: LiveCity[]
  search: string
  onSearch: (v: string) => void
}) {
     const { tx, t, td } = useT()
  const [expanded, setExpanded] = useState<string | null>(null)
  const q = search.trim().toLowerCase()

  // Group into countries, preserving first-appearance (relay) order.
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
      </div>
      <div className="mt-[14px] flex h-[48px] items-center gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-[#fbfbfb] px-[14px] transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12">
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('Search city names...')} className="flex-1 bg-transparent text-[15px] text-[#23302a] outline-none placeholder:text-[#9aa39d]" style={{ fontFamily: FONT }} />
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0 text-[#8a938e]"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </div>
      <div className="no-scrollbar mt-[14px] flex max-h-[44vh] flex-col gap-[8px] overflow-y-auto pe-[2px] sm:max-h-none sm:overflow-visible">
        {countries.map(({ name, cities: countryCities }) => {
          // While searching, every country's list is pre-filtered to matches only, and countries
          // with no matches are hidden entirely (not just collapsed).
          const matches = q ? countryCities.filter((c) => c.name.toLowerCase().includes(q)) : countryCities
          if (q && matches.length === 0) return null
          if (matches.length > 0) anyMatch = true
          // Searching auto-expands every matching country; otherwise it's manual, single-open.
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
                    <div
                      key={c.id}
                      className="flex h-[56px] w-full flex-col justify-center rounded-[12px] px-[12px] text-start"
                      style={{ border: '1.5px solid #e7dfc9', background: 'white' }}
                    >
                      <span className="w-full truncate text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(c.name)} />
                    </div>
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

// ── City picker dropdown ───────────────────────────────────────────────────────

/** Anchored searchable city list (same pattern as City Selection's relay dropdown). Picking a city
 *  places it in the clicked slot; the slot's previous occupant swaps into the picked city's old
 *  position — pure card arrangement, nothing is reserved. */
function CityPickDropdown({ anchor, cities, currentId, search, onSearch, onSelect, onClose }: {
  anchor: HTMLElement
  cities: LiveCity[]
  currentId: string | null
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
            const { t } = useT()
            const selected = c.id === currentId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full items-center justify-between rounded-[10px] px-[12px] py-[11px] text-start transition-colors hover:bg-[#faf8f2]"
                style={{ background: selected ? '#eaf3ed' : undefined }}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-[7px]">
                    <span className="truncate text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...td(c.name)} />
                    <span
                      className="shrink-0 rounded-full px-[7px] py-[1px] text-[10px] font-bold uppercase leading-[14px] tracking-[0.3px]"
                      style={
                        c.type === 'host'
                          ? { background: '#fbeed2', color: '#a8843e' }
                          : { background: '#e3eef0', color: '#2e6a7d' }
                      }
                    >
                      {c.type === 'host' ? t('Host') : 'Relay'}
                    </span>
                  </span>
                  <span className="block truncate text-[12px] text-[#8a938e]" style={{ fontFamily: FONT }} {...td(c.region)} />
                </span>
                {selected && (
                  <svg viewBox="0 0 16 16" fill="none" className="size-[16px] shrink-0">
                    <path d="M3 8.5l3 3 7-7.5" stroke="#1f7a4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
          {filtered.length === 0 && <p className="px-[12px] py-[10px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No cities found.')} />}
        </div>
    </Popover>
  )
}

// ── Right panel: view-only member table ────────────────────────────────────────

function StatusCell({ valid }: { valid: boolean }) {
  const { t, tx } = useT()
  return valid ? (
    <span className="inline-flex items-center gap-[7px] text-[13px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT }}>
      <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
        <circle cx="9" cy="9" r="7.25" stroke="#1f7a4d" strokeWidth="1.4" />
        <path d="M5.6 9.2l2.2 2.2 4.4-4.6" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      
      {t('Valid for allocation')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-[6px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>
      <svg viewBox="0 0 20 20" fill="none" className="size-[15px] shrink-0"><circle cx="10" cy="10" r="7.25" stroke="#b23b3b" strokeWidth="1.4" /><path d="M10 9.2v3.6" stroke="#b23b3b" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10" cy="6.7" r="1" fill="#b23b3b" /></svg>
      <span {...tx('Not valid for allocation')} />
    </span>
  )
}

/** Desktop members table — same layout/hierarchy as City Selection's table (linked-group band, gold
 *  connectors, role badges), but strictly read-only: no Allocation/Action columns, no CTAs. */
function MembersViewTable({ groups }: { groups: Group[] }) {
  const { t, td } = useT()
  const displayOrder = groups.map((_, i) => i).sort((a, b) => {
    const valid = (gi: number) => (groups[gi].members.some((mm) => mm.member.notValidForCity) ? 1 : 0)
    return valid(a) - valid(b)
  })
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[#e7dfc9] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: memberTableMinWidth(120, 210) }}>
        <colgroup>
          <col />
          <col style={{ width: '120px' }} />
          <col style={{ width: '210px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {[t('Member'), '', t('Status')].map((h, i) => (
              <th key={i} className="px-[16px] py-[11px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        {displayOrder.map((gi) => {
          const { t } = useT()
          const g = groups[gi]
          const linked = !!g.label
          const hasConnector = g.members.length > 1
          const groupValid = !g.members.some((mm) => mm.member.notValidForCity)
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #f0ebe0', background: '#e1eef1' }}>
                  <td colSpan={3} className="px-[16px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
                      <LinkGlyph />{g.label?.replace('registered together', t('reserve together'))}
                    </span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                return (
                  <tr key={mm.member.id} className="bg-white" style={{ borderTop: linked ? undefined : '1px solid #f0ebe0' }}>
                    <td className="relative px-[16px] py-[10px] align-middle">
                      {hasConnector && !isFirst && (
                        <span className="pointer-events-none absolute start-[33px] z-0 w-[2px] bg-[#fac775]" style={{ top: 0, height: 'calc(50% - 18px)' }} />
                      )}
                      {hasConnector && !isLast && (
                        <span className="pointer-events-none absolute start-[33px] z-0 w-[2px] bg-[#fac775]" style={{ top: 'calc(50% + 18px)', bottom: 0 }} />
                      )}
                      <div className="relative z-[1] flex items-center gap-[10px]">
                        <Avatar name={mm.member.name} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                          <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-[16px] py-[10px] align-middle">
                      {mm.badge ? <RoleBadge kind={mm.badge} /> : null}
                    </td>
                    <td className="px-[16px] py-[10px] align-middle">
                      <StatusCell valid={groupValid} />
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

/** Mobile members list — read-only group cards mirroring the table above. */
function MembersViewCards({ groups }: { groups: Group[] }) {
  const { td } = useT()
  const displayOrder = groups.map((_, i) => i).sort((a, b) => {
    const valid = (gi: number) => (groups[gi].members.some((mm) => mm.member.notValidForCity) ? 1 : 0)
    return valid(a) - valid(b)
  })
  return (
    <div className="flex flex-col gap-[12px]">
      {displayOrder.map((gi) => {
        const { t } = useT()
        const g = groups[gi]
        const linked = !!g.label
        const groupValid = !g.members.some((mm) => mm.member.notValidForCity)
        return (
          <div key={gi} className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
            {linked && (
              <div className="flex items-center gap-[8px] bg-[#e1eef1] px-[14px] py-[8px]">
                <LinkGlyph />
                <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
                  {g.label?.replace('registered together', t('reserve together'))}
                </span>
              </div>
            )}
            <div className="flex flex-col">
              {g.members.map((mm, mi) => (
                <div key={mm.member.id} className="flex items-center gap-[10px] px-[14px] py-[10px]" style={{ borderTop: mi === 0 && !linked ? undefined : mi === 0 ? undefined : '1px solid #f0ebe0' }}>
                  <Avatar name={mm.member.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                    <p className="mt-[2px] truncate text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member)}</p>
                  </div>
                  {mm.badge ? <RoleBadge kind={mm.badge} /> : null}
                </div>
              ))}
              <div className="border-t border-[#f0ebe0] px-[14px] py-[9px]">
                <StatusCell valid={groupValid} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ArrangeCities() {
  const { tx, t } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const registrations = useStore((s) => s.registrations)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const saveCityArrangement = useStore((s) => s.saveCityArrangement)

  const miqaat = miqaats.find((x) => x.id === id)
  // Make this event's journey the active flow (no-op when it already is) so the save lands on it.
  useEffect(() => { if (id) setActiveMiqaat(id) }, [id, setActiveMiqaat])

  const liveById = useMemo(() => new Map(liveCities.map((c) => [c.id, c])), [])
  const realHostId = liveCities.find((c) => c.type === 'host')?.id ?? liveCities[0].id

  // ── Arrangement state (city ids only — a pure layout, nothing is reserved) ──
  // Invariant: hostId, the non-null preferred slots, and relayOrder partition the live cities —
  // every city sits in exactly ONE slot, so a pick always swaps with the slot's previous occupant.
  const saved = journeyFor(flow, registrations, id ?? '').cityArrangement
  const [hostId, setHostId] = useState<string>(() => (saved && liveById.has(saved.hostCityId) ? saved.hostCityId : realHostId))
  const [preferred, setPreferred] = useState<(string | null)[]>(() => {
    const slots: (string | null)[] = Array(PREFERRED_SLOTS).fill(null)
    saved?.preferredCityIds.slice(0, PREFERRED_SLOTS).forEach((cid, i) => { if (liveById.has(cid)) slots[i] = cid })
    return slots
  })
  const [relayOrder, setRelayOrder] = useState<string[]>(() => {
    if (saved) {
      const placed = new Set([saved.hostCityId, ...saved.preferredCityIds])
      const known = saved.relayCityIds.filter((cid) => liveById.has(cid))
      // Belt-and-suspenders: any live city missing from the saved layout re-joins the relay list.
      const missing = liveCities.filter((c) => !placed.has(c.id) && !known.includes(c.id)).map((c) => c.id)
      return [...known, ...missing]
    }
    return liveCities.filter((c) => c.type === 'relay').map((c) => c.id)
  })

  const [dropdown, setDropdown] = useState<{ slot: SlotRef; el: HTMLElement } | null>(null)
  const [pickSearch, setPickSearch] = useState('')
  const [relaySearch, setRelaySearch] = useState('')

  /** Where a city currently sits in the layout. */
  const locate = (cid: string): SlotRef | null => {
    if (cid === hostId) return { kind: 'host' }
    const p = preferred.indexOf(cid)
    if (p >= 0) return { kind: 'preferred', idx: p }
    const r = relayOrder.indexOf(cid)
    if (r >= 0) return { kind: 'relay', idx: r }
    return null
  }

  /** Occupant of a slot (null for an empty preferred slot). */
  const occupantOf = (slot: SlotRef): string | null =>
    slot.kind === 'host' ? hostId : slot.kind === 'preferred' ? preferred[slot.idx] : relayOrder[slot.idx] ?? null

  /** Place `cid` into `slot`; the slot's previous occupant moves to where `cid` came from (swap).
   *  Picking into an empty preferred slot simply lifts the city out of the relay list. */
  function pickCity(slot: SlotRef, cid: string) {
    setDropdown(null)
    setPickSearch('')
    if (occupantOf(slot) === cid) return
    const origin = locate(cid)
    let h = hostId
    const p = [...preferred]
    const r = [...relayOrder]
    const prev = slot.kind === 'host' ? h : slot.kind === 'preferred' ? p[slot.idx] : r[slot.idx]

    // Put the previous occupant into the picked city's old slot (or drop the city from its origin
    // when the target slot was empty).
    if (origin?.kind === 'preferred') p[origin.idx] = prev
    else if (origin?.kind === 'relay') {
      if (prev != null) r.splice(origin.idx, 1, prev)
      else r.splice(origin.idx, 1)
    }
    // (origin 'host' can't happen: the host city is excluded from preferred/relay dropdowns, and
    //  picking the current host for the host slot is the no-op guard above.)

    if (slot.kind === 'host') h = cid
    else if (slot.kind === 'preferred') p[slot.idx] = cid
    else r[slot.idx] = cid

    setHostId(h)
    setPreferred(p)
    setRelayOrder(r)
  }

  /** ✕ on a filled preferred slot — the city returns to its natural (seed-order) relay position. */
  function clearPreferred(idx: number) {
    const cid = preferred[idx]
    if (!cid) return
    setPreferred((prev) => { const n = [...prev]; n[idx] = null; return n })
    setRelayOrder((prev) => {
      const n = [...prev]
      const at = n.findIndex((other) => seedIndex(other) > seedIndex(cid))
      n.splice(at < 0 ? n.length : at, 0, cid)
      return n
    })
  }

  function handleSave() {
    saveCityArrangement({
      hostCityId: hostId,
      preferredCityIds: preferred.filter((cid): cid is string => cid !== null),
      relayCityIds: relayOrder,
    })
    // The success popup lives on Home (mirrors the Reservation Cancelled / Request Sent one-shot
    // popups there) — navigate immediately instead of showing it over this screen first.
    nav('/miqaats', { state: { cityArrangementSaved: true } })
  }

  const hostCity = liveById.get(hostId) ?? liveCities[0]
  const relayCityList = relayOrder.map((cid) => liveById.get(cid)).filter((c): c is LiveCity => !!c)

  // Same member grouping as City Selection — this table just VIEWS who will go through it later.
  const selectedIds = flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)
  const invitesForGroups = miqaat?.hideInviteMehmaan ? flow.invites.filter((i) => i.group) : flow.invites
  const groups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, invitesForGroups)
  const totalMembers = groups.reduce((n, g) => n + g.members.length, 0)

  // Dropdown options: the host slot may take any city; preferred/relay slots exclude the current
  // host (it can only leave the host card by being replaced there) AND any city already occupying
  // a DIFFERENT preferred slot (it's already placed — showing it again as pickable elsewhere reads
  // as a duplicate). The slot being edited keeps its own current occupant listed (so its checkmark
  // still shows and reselecting it is a harmless no-op).
  const dropdownCities = (() => {
    if (dropdown?.slot.kind === 'host') return liveCities
    const slot = dropdown?.slot
    const exclude = new Set<string>([hostId])
    preferred.forEach((cid, idx) => {
      if (!cid) return
      if (slot?.kind === 'preferred' && slot.idx === idx) return
      exclude.add(cid)
    })
    return liveCities.filter((c) => !exclude.has(c.id))
  })()

  const breadcrumb = (
    <Breadcrumb
      items={[{ label: 'Home', to: '/miqaats' }, { label: t('Edit your layout') }]}
      onNavigate={(to) => nav(to)}
      onBack={() => nav(-1)}
      backOnMobile
    />
  )

  const leftCards = (
    <div className="flex flex-col gap-[16px]">
      <HostSlotCard city={hostCity} onChange={(el) => { setPickSearch(''); setDropdown({ slot: { kind: 'host' }, el }) }} />
      <PreferredSlotsCard
        slots={preferred}
        liveById={liveById}
        onAdd={(idx, el) => { setPickSearch(''); setDropdown({ slot: { kind: 'preferred', idx }, el }) }}
        onClear={clearPreferred}
      />
      <RelayOrderCard
        cities={relayCityList}
        search={relaySearch}
        onSearch={setRelaySearch}
      />
    </div>
  )

  const footer = (
    <StickyFooter
      caption="City arrangement"
      title={t('Save your city layout')}
      button={t('Save my layout')}
      onButton={handleSave}
      buttonDisabled={false}
    />
  )

  return (
    <>
      <PhoneScreen footer={<div className="sm:hidden">{footer}</div>}>
        <AppBar notificationCount={3} />

        {/* ═══════════════ MOBILE — single-column ═══════════════ */}
        <div className="contents sm:hidden">
          <div className="ms-[16px] mt-[12px]">{breadcrumb}</div>
          <h1 className="mt-[16px] px-[16px] text-[24px] leading-[30px] text-[#23302a]" style={{ fontFamily: SERIF }} {...tx('Edit your layout')} />
          <p className="mt-[6px] px-[16px] text-[13px] leading-[19px] text-[#7a827c]" style={{ fontFamily: FONT }} {...tx('Choose which city appears in each card. This only sets up how City Selection will look — nothing is reserved here.')} />
          <div className="mt-[16px] px-[16px]">{leftCards}</div>
          <div className="mt-[22px] px-[16px]">
            <p className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>Your members ({totalMembers})</p>
            <p className="mt-[3px] text-[12.5px] leading-[18px] text-[#7a827c]" style={{ fontFamily: FONT }} {...tx('These members will go through City Selection with this layout.')} />
          </div>
          <div className="mx-[16px] mb-[16px] mt-[12px]">
            <MembersViewCards groups={groups} />
          </div>
        </div>

        {/* ═══════════════ DESKTOP — two-panel (cream sidebar + white panel) ═══════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">
            {/* ───── LEFT sidebar — the configurable city cards ───── */}
            <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[20px] overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">
              <Breadcrumb
                items={[{ label: 'Home', to: '/miqaats' }, { label: t('Edit your layout') }]}
                onNavigate={(to) => nav(to)}
                onBack={() => nav(-1)}
                activeColor="#a8843e"
                dense
              />
              <h2 className="text-[28px] leading-[34px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Edit your layout')} />
              {leftCards}
            </aside>

            {/* ───── RIGHT panel — read-only member table ───── */}
            <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
                <div className="flex items-start justify-between gap-[16px]">
                  <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Your Members')} />
                  <span className="inline-flex h-[36px] items-center gap-[7px] rounded-full border border-[#e7dfc9] bg-[#faf8f2] px-[14px] text-[13px] font-bold text-[#5a6660]" style={{ fontFamily: FONT }}>
                    <svg viewBox="0 0 20 20" fill="none" className="size-[16px]">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM2 8a2 2 0 114 0 2 2 0 01-4 0zM15.5 17c0-2.21-2.46-4-5.5-4s-5.5 1.79-5.5 4M17 17c0-1.54-1.12-2.87-2.75-3.5M3 17c0-1.54 1.12-2.87 2.75-3.5" stroke="#5a6660" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {t(plural(totalMembers, '{n} member', '{n} members'), { n: totalMembers })}
                  </span>
                </div>
                <p className="mt-[8px] text-[14px] leading-[20px] text-[#7a827c]" style={{ fontFamily: FONT }} {...tx('These members will go through City Selection with the layout you set on the left. Reservations happen there — not on this screen.')} />
                <div className="mt-[20px]">
                  <MembersViewTable groups={groups} />
                </div>
              </div>
              <div className="shrink-0">{footer}</div>
            </section>
          </div>
        </div>
      </PhoneScreen>

      {dropdown && (
        <CityPickDropdown
          anchor={dropdown.el}
          cities={dropdownCities}
          currentId={occupantOf(dropdown.slot)}
          search={pickSearch}
          onSearch={setPickSearch}
          onSelect={(c) => pickCity(dropdown.slot, c.id)}
          onClose={() => { setDropdown(null); setPickSearch('') }}
        />
      )}
    </>
  )
}
