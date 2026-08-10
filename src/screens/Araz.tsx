import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { isolateRuns } from '../components/Bidi'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import StickyFooter from '../components/figma/StickyFooter'
import Popover from '../components/Popover'
import BottomSheet from '../components/figma/BottomSheet'
import Toast, { useToast } from '../components/figma/Toast'
import StepIndicator from '../components/figma/StepIndicator'
import ConfirmedView, { type ConfirmedSection } from '../components/figma/ConfirmedView'
import { liveCities, family, arazExtraFamily, genderByIts, miqaats, type FamilyMember, type LiveCity } from '../data/seed'
import { type Group, type BadgeKind } from '../lib/group'
import { useStore, journeyFor, type GroupCityAlloc } from '../store'
import { plural, useT, tNow } from '../i18n'
import { memberTableMinWidth } from '../components/memberTable'
import { notLanguage } from '../components/NotLanguage'

// ── Constants ────────────────────────────────────────────────────────────────
const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

// ── Helpers ──────────────────────────────────────────────────────────────────
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function familyMeta(m: FamilyMember) {
  const g = m.gender ?? genderByIts(m.its)
  const base = `${g ? `${g} · ` : ''}${tNow('Age')} ${String(m.age).padStart(2, '0')} · ${tNow('ITS')} ${m.its}`
  return isolateRuns(m.relation ? `${tNow(m.relation)} · ${base}` : base)
}

// ── Atoms ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="text-white font-bold" style={{ fontSize: size * 0.36, fontFamily: FONT, lineHeight: 1 }} {...notLanguage}>{initials(name)}</span>
    </div>
  )
}

function PeopleMini({ color = '#5a6660' }: { color?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[15px] shrink-0">
      <path d="M14 17v-1.5a3 3 0 00-3-3H5a3 3 0 00-3 3V17M8 9.5a3 3 0 100-6 3 3 0 000 6zM18 17v-1.5a3 3 0 00-2.25-2.9M13 3.6a3 3 0 010 5.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon({ color = '#194a37' }: { color?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
      <path d="M9 3.5v11M3.5 9h11" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const { t } = useT()
  return (
    <button type="button" onClick={onClick} aria-label={t('Remove member')}
      className="flex size-[30px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fbeceb] active:scale-90">
      <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M6 6l8 8M14 6l-8 8" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" /></svg>
    </button>
  )
}

/** Visual radio dot (no button element — the clickable wrapper is a button, so this stays a span to
 *  keep the markup valid). Filled green when checked. */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span className="flex size-[20px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
      style={{ borderColor: checked ? '#1f5a44' : '#c2c9c3', background: checked ? '#1f5a44' : 'white' }}>
      {checked && <span className="size-[8px] rounded-full bg-white" />}
    </span>
  )
}

function MembersChip({ count }: { count: number }) {
  const { tx } = useT()
  return (
    <span className="inline-flex h-[34px] items-center gap-[8px] rounded-full bg-[#fbeed3] px-[16px]">
      <PeopleMini color="#9a6712" />
      <span className="text-[15px] font-bold text-[#9a6712]" style={{ fontFamily: FONT }} {...tx(plural(count, '{n} member', '{n} members'), { n: count })} />
    </span>
  )
}

/** Gold "Add" CTA (plus icon) — opens the ITS-search popup to add a family member to the table. */
function AddCta({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useT()
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex h-[38px] shrink-0 items-center gap-[7px] rounded-full bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] px-[16px] text-[14px] font-bold text-[#194a37] shadow-[0px_4px_14px_-6px_rgba(21,64,47,0.3)] transition-all duration-200 hover:from-[#e7d3a2] hover:to-[#cfab65] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-[#e3cd96] disabled:hover:to-[#c9a45c] disabled:active:scale-100"
      style={{ fontFamily: FONT }}>
      <PlusIcon />  {t('Add')}
    </button>
  )
}

/** Edit ⇄ Cancel toggle — sits to the right of Add. Shown only when a prior Araz submission exists;
 *  Edit (gold outline) unlocks the read-only table, Cancel (red outline) discards unsaved edits. */
function EditToggle({ editing, onClick }: { editing: boolean; onClick: () => void }) {
  const { t } = useT()
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex h-[38px] shrink-0 items-center gap-[7px] rounded-full border px-[16px] text-[14px] font-bold transition-all duration-200 active:scale-[0.97] ${
        editing
          ? 'border-[#e3c9c4] bg-[#fbf3f2] text-[#b23b3b] hover:bg-[#f7e9e7]'
          : 'border-[#d8c48a] bg-white text-[#a8843e] hover:bg-[#faf6ec]'
      }`}
      style={{ fontFamily: FONT }}>
      {editing ? (
        <>
          <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          
          {t('Cancel')}
        </>
      ) : (
        <>
          <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0"><path d="M11.4 3.3l3.3 3.3M2.75 15.25l.7-3 8.2-8.2a1.2 1.2 0 011.7 0l1.3 1.3a1.2 1.2 0 010 1.7l-8.2 8.2-3 .7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          
          {t('Edit')}
        </>
      )}
    </button>
  )
}

/** Small Host/Relay tag — used only in the compact success-view summary list. */
function CityKindTag({ type }: { type: 'host' | 'relay' }) {
  const { t } = useT()
  const host = type === 'host'
  return (
    <span className="inline-flex h-[20px] items-center rounded-full px-[9px] text-[10px] font-bold tracking-[0.3px]"
      style={{ fontFamily: FONT, background: host ? '#f7efd6' : '#e1eef1', color: host ? '#a8843e' : '#2e6a7d' }}>
      {host ? t('Host City') : t('Relay City')}
    </span>
  )
}

// ── Info banner (prominent — makes the "preference only" distinction unmissable) ──
function ArazInfoBanner() {
  const { tx } = useT()
  return (
    <div className="overflow-hidden rounded-[16px] border" style={{ borderColor: '#f1d7b6', background: 'linear-gradient(180deg,#fef6ea 0%,#fdf1e2 100%)' }}>
      <div className="flex gap-[14px] px-[18px] py-[16px]">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full" style={{ background: '#f6e2c2' }}>
          <svg viewBox="0 0 20 20" fill="none" className="size-[20px]">
            <circle cx="10" cy="10" r="8" stroke="#c8842a" strokeWidth="1.5" />
            <path d="M10 9v4.2" stroke="#c8842a" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="10" cy="6.4" r="1.05" fill="#c8842a" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[17px] leading-[22px] text-[#8a5a12]" style={{ fontFamily: SERIF }} {...tx('Preferred City Selection')} />
          <p className="mt-[6px] text-[13.5px] leading-[19px] text-[#7a5a2a]" style={{ fontFamily: FONT, fontWeight: 500 }} {...tx('Submit your preferred Host and Relay City choices. Final city allocation will be confirmed during the official allocation phase.')} />
        </div>
      </div>
    </div>
  )
}

// ── Left-panel quota card (Host City / Relay City) — count only, no city selection ──
function QuotaCard({ title, icon, quota, remaining, poolFull, helper }: {
  title: string
  icon: React.ReactNode
  quota: number
  remaining: number
  poolFull: boolean
  helper: string
}) {
     const { tx } = useT()
  return (
    <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
      <div className="flex items-center gap-[8px]">
        {icon}
        <p className="text-[20px] leading-[24px] text-[#15402f]" style={{ fontFamily: SERIF }}>{title}</p>
      </div>
      {/* Quota / Remaining — prominent so the allowance is immediately clear */}
      <div className="mt-[12px] flex items-stretch gap-[10px]">
        <div className="flex-1 rounded-[12px] border border-[#e7dfc9] bg-[#faf8f2] px-[14px] py-[10px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Quota')} />
          <p className="mt-[2px] text-[22px] font-extrabold leading-none text-[#15402f]" style={{ fontFamily: FONT }}>{quota}</p>
        </div>
        <div className="flex-1 rounded-[12px] border px-[14px] py-[10px]" style={{ borderColor: poolFull ? '#e3c9c4' : '#bfe3cd', background: poolFull ? '#fbf3f2' : '#eef7f1' }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.6px]" style={{ fontFamily: FONT, color: poolFull ? '#b23b3b' : '#1f7a4d' }} {...tx('Remaining')} />
          <p className="mt-[2px] text-[22px] font-extrabold leading-none" style={{ fontFamily: FONT, color: poolFull ? '#b23b3b' : '#1f7a4d' }}>{remaining}</p>
        </div>
      </div>
      <div className="mt-[14px] flex items-start gap-[9px] rounded-[12px] border border-dashed border-[#cdd8d1] bg-[#f6f9f7] px-[13px] py-[11px]">
        <svg viewBox="0 0 18 18" fill="none" className="mt-[1px] size-[15px] shrink-0"><circle cx="9" cy="9" r="7.25" stroke="#2e6a7d" strokeWidth="1.4" /><path d="M9 8.2v4" stroke="#2e6a7d" strokeWidth="1.5" strokeLinecap="round" /><circle cx="9" cy="5.7" r="0.9" fill="#2e6a7d" /></svg>
        <p className="text-[12.5px] leading-[17px] font-semibold text-[#4a5a52]" style={{ fontFamily: FONT }}>{helper}</p>
      </div>
    </div>
  )
}

// ── Relay-city per-row dropdown (searchable) ───────────────────────────────────
/** Pill trigger showing the picked relay city (or a placeholder), opens the searchable dropdown. */
function RelayTrigger({ label, active, onClick }: { label: string | null; active: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e.currentTarget) }}
      className="inline-flex h-[34px] min-w-0 max-w-[190px] items-center justify-between gap-[8px] rounded-full border border-[#2e6a7d] bg-white px-[14px] transition-colors hover:bg-[#eef5f7]"
      style={{ fontFamily: FONT }}
    >
      <span className={`truncate text-[13px] font-bold ${label ? 'text-[#2e6a7d]' : 'text-[#5a7d6e]'}`}>{label ?? 'Select relay city'}</span>
      <svg viewBox="0 0 16 16" fill="none" className={`size-[13px] shrink-0 transition-transform ${active ? 'rotate-180' : ''}`}>
        <path d="M4 6l4 4 4-4" stroke="#2e6a7d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/** Searchable relay-city popover — anchored + fixed so it escapes the table's overflow. */
function RelayDropdown({ anchor, cities, selectedCityId, availabilityOf, search, onSearch, onSelect, onClose }: {
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
            <input autoFocus value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('Search city names...')} className="flex-1 bg-transparent text-[14px] outline-none text-[#23302a] placeholder-[#b0b8b3]" style={{ fontFamily: FONT }} />
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0 text-[#8a938e]"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
        </div>
        <div className="max-h-[240px] overflow-y-auto px-[8px] pb-[10px]">
          {filtered.map((c) => {
            const avail = availabilityOf(c)
            const selected = c.id === selectedCityId
            return (
              <button key={c.id} type="button" disabled={!avail && !selected} onClick={(avail || selected) ? () => onSelect(c) : undefined}
                className="flex w-full items-center justify-between rounded-[10px] px-[12px] py-[11px] text-start transition-colors"
                style={{ background: selected ? '#eef5f7' : 'transparent', cursor: (avail || selected) ? 'pointer' : 'not-allowed' }}>
                <div className="min-w-0">
                  <span className="block truncate text-[15px] font-bold" style={{ fontFamily: FONT, color: (avail || selected) ? '#23302a' : '#b0b8b3' }} {...td(c.name)} />
                  <span className="block truncate text-[12px] font-semibold" style={{ fontFamily: FONT, color: '#8a938e' }} {...td(c.region)} />
                </div>
                {selected
                  ? <svg viewBox="0 0 16 16" fill="none" className="size-[16px] shrink-0"><path d="M3 8.5l3 3 7-7.5" stroke="#2e6a7d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : !avail ? <span className="shrink-0 text-[12px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }} {...tx('Quota full')} /> : null}
              </button>
            )
          })}
          {filtered.length === 0 && <p className="px-[12px] py-[10px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('No cities found.')} />}
        </div>
    </Popover>
  )
}

// ── Add-family-member popup — MANUAL ITS search (mirrors the Add People lookup) ──
// Same search field + gold search-icon button + "Match found" result card as Add People. Search
// runs only on an explicit trigger (icon click / Enter), matches an ITS ID exactly, and resolves
// ONLY against the family roster (this screen is family-members only).
function AddMemberSheet({ open, roster, inTable, onAdd, onClose }: {
  open: boolean
  roster: FamilyMember[]
  inTable: (id: string) => boolean
  onAdd: (m: FamilyMember) => void
  onClose: () => void
}) {
     const { tx, t, td } = useT()
  const [its, setIts] = useState('')
  const [result, setResult] = useState<FamilyMember | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noResults, setNoResults] = useState(false)
  // Reset the search each time the popup opens.
  useEffect(() => { if (open) { setIts(''); setResult(null); setError(null); setNoResults(false) } }, [open])

  // Typing only updates the raw input + clears prior state — it never searches on its own.
  const onChange = (v: string) => {
    setIts(v.replace(/[^0-9]/g, '').slice(0, 8))
    setResult(null); setError(null); setNoResults(false)
  }
  const performSearch = () => {
    if (its.length !== 8) { setResult(null); setNoResults(false); setError('Please enter a valid 8-digit ITS ID.'); return }
    setError(null)
    const hit = roster.find((m) => m.its === its) ?? null
    if (!hit) { setResult(null); setNoResults(true); return }
    setNoResults(false); setResult(hit)
  }
  const alreadyIn = result ? inTable(result.id) : false

  const searchIconButton = (
    <button type="button" onClick={performSearch} aria-label={t('Search')}
      className="flex size-[48px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-opacity active:opacity-80">
      <svg viewBox="0 0 20 20" fill="none" className="size-[19px] shrink-0 text-[#194a37]">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  )

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      header={(
        <div className="pe-[36px]">
          <h2 className="text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Add family member')} />
          <p className="mt-[6px] text-[13.5px] leading-[19px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Search by ITS ID to add a family member to the preference table.')} />
        </div>
      )}
    >
      <div className="flex items-center gap-[10px]">
        <div className={`relative h-[48px] flex-1 overflow-clip rounded-[12px] border border-solid bg-[#fbfbfb] transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12 ${error ? 'border-[#e53e3e]' : 'border-[#e7dfc9]'}`}>
          <input autoFocus value={its} onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); performSearch() } }}
            inputMode="numeric" maxLength={8} placeholder={t('Enter 8-digit ITS ID')}
            className="absolute start-[13px] end-[13px] top-1/2 -translate-y-1/2 bg-transparent text-[15px] leading-normal text-[#23302a] outline-none placeholder:text-[#9aa39d]"
            style={{ fontFamily: FONT }} />
        </div>
        {searchIconButton}
      </div>

      {/* Match-found result card — same treatment as the Add People lookup card. */}
      {result && (
        <div className="mt-[12px] w-full rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_10px_28px_-12px_rgba(21,64,47,0.28)]">
          <div className="flex items-center gap-[6px]">
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0"><circle cx="10" cy="10" r="8" stroke="#1f7a4d" strokeWidth="1.6" /><path d="M6.5 10.2l2.3 2.3 4.7-5" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="text-[13px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT }} {...tx('Match found')} />
          </div>
          <div className="mt-[16px] flex flex-col items-center text-center">
            <Avatar name={result.name} size={72} />
            <p className="mt-[14px] text-[17px] font-bold text-[#15402f]" style={{ fontFamily: FONT }} {...td(result.name)} />
            <p className="mt-[4px] text-[13.5px] text-[#5a6660]" style={{ fontFamily: FONT }}>{familyMeta(result)}</p>
            <div className="mt-[18px]">
              {alreadyIn ? (
                <span className="inline-flex h-[46px] items-center gap-[8px] rounded-full border border-[#bfe3cd] bg-[#eef7f1] px-[24px] text-[15px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT }}>
                  <svg viewBox="0 0 16 16" fill="none" className="size-[15px]"><path d="M3 8.5l3 3 7-7.5" stroke="#1f7a4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span {...tx('Already in table')} />
                </span>
              ) : (
                <button type="button" onClick={() => { onAdd(result); setIts(''); setResult(null); setNoResults(false) }}
                  className="flex h-[46px] items-center justify-center gap-[8px] rounded-full bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] px-[30px] text-[15px] font-bold text-[#194a37] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-opacity active:opacity-80" style={{ fontFamily: FONT }}>
                  <PlusIcon />  {t('Add')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No-match empty state — after an explicit search returns no family member. */}
      {noResults && (
        <div className="mt-[12px] w-full rounded-[16px] border border-dashed border-[#e0d9c4] bg-[#faf8f2] px-[20px] py-[26px] text-center">
          <svg viewBox="0 0 20 20" fill="none" className="mx-auto size-[22px] text-[#a8a196]"><circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" /><path d="M13.8 13.8L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <p className="mt-[8px] text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }} {...tx('No members found')} />
          <p className="mt-[4px] text-[13px] leading-[18px] text-[#7a827c]" style={{ fontFamily: FONT }} {...tx('Try searching with a different ITS ID.')} />
        </div>
      )}

      {/* ITS format error — inline red line (distinct from the empty state). */}
      {error && (
        <div className="mt-[8px] flex items-center gap-[6px]">
          <svg viewBox="0 0 24 24" className="size-[14px] shrink-0" fill="none"><circle cx="12" cy="12" r="9" fill="#e53e3e" /><rect x="11" y="7" width="2" height="7" rx="1" fill="#fff" /><circle cx="12" cy="16.5" r="1.1" fill="#fff" /></svg>
          <p className="text-[12px] leading-[16px] text-[#c53030]" style={{ fontFamily: FONT, fontWeight: 500 }}>{error}</p>
        </div>
      )}
    </BottomSheet>
  )
}

// ── Right-panel: member table (desktop) ────────────────────────────────────────
function ArazMemberTable({ members, hostCityName, hostCheckedOf, relayCheckedOf, relayCityNameOf, openRelayMid, canRemoveOf, readOnly = false, onSelectHost, onSelectRelay, onOpenRelay, onRemove }: {
  members: FamilyMember[]
  hostCityName: string
  hostCheckedOf: (id: string) => boolean
  relayCheckedOf: (id: string) => boolean
  relayCityNameOf: (id: string) => string | null
  openRelayMid: string | null
  /** Only members added via the Add popup are removable — the default (existing) roster is locked. */
  canRemoveOf: (id: string) => boolean
  /** Read-only "view" state: relay shows a plain label (no dropdown) and the remove ✕ is hidden. */
  readOnly?: boolean
  onSelectHost: (id: string) => void
  onSelectRelay: (id: string, el: HTMLElement) => void
  onOpenRelay: (id: string, el: HTMLElement) => void
  onRemove: (id: string) => void
}) {
     const { t, tx, td } = useT()
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[#e7dfc9] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: memberTableMinWidth(180, 250, 84) }}>
        <colgroup>
          <col />
          <col style={{ width: '180px' }} />
          <col style={{ width: '250px' }} />
          <col style={{ width: '84px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {[t('Member'), t('Host City'), t('Relay City'), 'Action'].map((h, i) => (
              <th key={i} className="px-[16px] py-[11px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const hc = hostCheckedOf(m.id)
            const rc = relayCheckedOf(m.id)
            return (
              <tr key={m.id} className="bg-white" style={{ borderTop: '1px solid #f0ebe0' }}>
                <td className="px-[16px] py-[10px] align-middle">
                  <div className="flex items-center gap-[10px]">
                    <Avatar name={m.name} size={36} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(m.name)} />
                      <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(m)}</p>
                    </div>
                  </div>
                </td>
                {/* Host City — radio; shows the fixed host city name once selected. */}
                <td className="px-[16px] py-[10px] align-middle">
                  <button type="button" onClick={() => onSelectHost(m.id)} className="flex items-center gap-[9px] text-start">
                    <RadioDot checked={hc} />
                    <span className="text-[14px] font-bold" style={{ fontFamily: FONT, color: hc ? '#23302a' : '#a9b1ab' }}>{hc ? hostCityName : t('Host City')}</span>
                  </button>
                </td>
                {/* Relay City — radio; reveals the searchable dropdown once selected (edit only). */}
                <td className="px-[16px] py-[10px] align-middle">
                  <div className="flex items-center gap-[9px]">
                    <button type="button" onClick={(e) => onSelectRelay(m.id, e.currentTarget)} className="flex items-center">
                      <RadioDot checked={rc} />
                    </button>
                    {rc ? (
                      readOnly
                        ? <span className="text-[14px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>{relayCityNameOf(m.id)}</span>
                        : <RelayTrigger label={relayCityNameOf(m.id)} active={openRelayMid === m.id} onClick={(el) => onOpenRelay(m.id, el)} />
                    ) : (
                      <button type="button" onClick={(e) => onSelectRelay(m.id, e.currentTarget)} className="text-[14px] font-bold text-[#a9b1ab]" style={{ fontFamily: FONT }} {...tx('Relay City')} />
                    )}
                  </div>
                </td>
                <td className="px-[16px] py-[10px] align-middle">
                  {!readOnly && canRemoveOf(m.id)
                    ? <RemoveButton onClick={() => onRemove(m.id)} />
                    : <span className="text-[12px] font-semibold text-[#c2c9c3]" style={{ fontFamily: FONT }}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Right-panel: member card (mobile) ──────────────────────────────────────────
function ArazMemberCard({ member, hostChecked, relayChecked, hostCityName, relayLabel, relayOpen, canRemove, readOnly = false, onSelectHost, onSelectRelay, onOpenRelay, onRemove }: {
  member: FamilyMember
  hostChecked: boolean
  relayChecked: boolean
  hostCityName: string
  relayLabel: string | null
  relayOpen: boolean
  canRemove: boolean
  /** Read-only "view" state: relay shows a plain label (no dropdown) and the remove ✕ is hidden. */
  readOnly?: boolean
  onSelectHost: () => void
  onSelectRelay: (el: HTMLElement) => void
  onOpenRelay: (el: HTMLElement) => void
  onRemove: () => void
}) {
     const { tx, td } = useT()
  const assigned = hostChecked || relayChecked
  return (
    <div className="overflow-hidden rounded-[14px] border bg-white transition-all duration-200"
      style={{ borderColor: assigned ? '#d9c98a' : '#e7dfc9', background: assigned ? '#fffdf5' : 'white', boxShadow: assigned ? '0 8px 22px -14px rgba(168,132,62,0.5)' : 'none' }}>
      <div className="flex items-center gap-[10px] px-[13px] py-[10px]">
        <Avatar name={member.name} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(member.name)} />
          <p className="mt-[2px] text-[12px] text-[#5a6660]" style={{ fontFamily: FONT }}>{familyMeta(member)}</p>
        </div>
        {!readOnly && canRemove && <RemoveButton onClick={onRemove} />}
      </div>
      <div className="flex flex-col gap-[10px] border-t border-[#f0ebe0] px-[13px] py-[11px]">
        {/* Host City radio */}
        <button type="button" onClick={onSelectHost} className="flex items-center gap-[10px] text-start">
          <RadioDot checked={hostChecked} />
          <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Host City')} />
          {hostChecked && <span className="ms-auto text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{hostCityName}</span>}
        </button>
        {/* Relay City radio + dropdown */}
        <div className="flex items-center gap-[10px]">
          <button type="button" onClick={(e) => onSelectRelay(e.currentTarget)} className="flex items-center gap-[10px]">
            <RadioDot checked={relayChecked} />
            <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Relay City')} />
          </button>
          {relayChecked && (
            <div className="ms-auto">
              {readOnly
                ? <span className="text-[15px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>{relayLabel}</span>
                : <RelayTrigger label={relayLabel} active={relayOpen} onClick={onOpenRelay} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function Araz() {
  const { tx, t, td } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const registrations = useStore((s) => s.registrations)
  const saveArazAction = useStore((s) => s.saveAraz)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const { toast, showToast } = useToast()

  const miqaat = miqaats.find((x) => x.id === id)
  const quota = miqaat?.araz ?? { hostQuota: 5, relayQuota: 7 }

  // This event's saved journey — drives the prefill of already-submitted Araz preferences.
  const journey = journeyFor(flow, registrations, id ?? '')

  const hostCities = useMemo(() => liveCities.filter((c) => c.type === 'host'), [])
  const relayCities = useMemo(() => liveCities.filter((c) => c.type === 'relay'), [])
  const liveById = useMemo(() => new Map(liveCities.map((c) => [c.id, c])), [])
  // The single fixed Host City (Colombo) — no dropdown; picking the Host radio assigns it directly.
  const hostCity = hostCities[0] ?? null

  // The Araz-only roster: the immediate `family` plus the extended members that exist ONLY here
  // (arazExtraFamily). Everywhere else in the app still sees just `family`, so these extras never
  // show on Add People / registration — they're only reachable via this screen's Add popup search.
  const arazRoster = useMemo(() => [...family, ...arazExtraFamily], [])
  // The "existing" (default) members — the registrant's immediate family (only these are LOCKED /
  // cannot be removed). The extended members are removable and, once removed, re-addable via the
  // Add popup's ITS search.
  const defaultIdSet = useMemo(() => new Set(family.map((m) => m.id)), [])
  // The table shows the FULL Araz roster by default (immediate family + extended members = 11). The
  // ✕ only appears on the extended ones (see `canRemove`); the immediate family stays locked.
  const [tableIds, setTableIds] = useState<string[]>(() => arazRoster.map((m) => m.id))
  const canRemove = (mid: string) => !defaultIdSet.has(mid)
  // Rebuild the member→city map from this event's persisted Araz submission. Used both to prefill on
  // mount and to revert unsaved edits when the user hits Cancel.
  const buildSavedPicks = () => {
    const m = new Map<string, LiveCity>()
    const picks = journey.araz?.picks
    if (picks) Object.entries(picks).forEach(([mid, alloc]) => {
      const c = liveById.get(alloc.id)
      if (c) m.set(mid, c)
    })
    return m
  }
  // Whether this event already has a saved Araz submission → drives the read-only "view" state + the
  // Edit/Cancel toggle (a first-time user has no prior submission, so no toggle — just fill & save).
  const submitted = !!journey.araz?.picks && Object.keys(journey.araz.picks).length > 0
  // member id → the member's single preferred city (host OR relay). Prefilled from a prior Araz save.
  const [pick, setPick] = useState<Map<string, LiveCity>>(buildSavedPicks)
  // Relay radio selected but no city chosen yet (keeps the radio "checked" before the dropdown pick).
  const [relayPending, setRelayPending] = useState<Set<string>>(new Set())
  const [relayDropdown, setRelayDropdown] = useState<{ mid: string; el: HTMLElement } | null>(null)
  const [relaySearch, setRelaySearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<'browse' | 'success'>('browse')
  // When there's a prior submission the table opens read-only ("view" state); Edit unlocks it. A
  // first-time user (submitted === false) is always editing. `locked` gates every table interaction.
  const [editing, setEditing] = useState(false)
  const locked = submitted && !editing

  // Edit ⇄ Cancel toggle. Cancel discards unsaved changes by reverting to the saved snapshot.
  function toggleEdit() {
    if (editing) {
      setPick(buildSavedPicks())
      setTableIds(arazRoster.map((m) => m.id))
      setRelayPending(new Set())
      setRelayDropdown(null)
      setEditing(false)
    } else {
      setEditing(true)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const tableMembers = useMemo(
    () => tableIds.map((mid) => arazRoster.find((m) => m.id === mid)).filter((m): m is FamilyMember => !!m),
    [tableIds, arazRoster],
  )
  const totalMembers = tableMembers.length
  const hostAssigned = tableMembers.filter((m) => pick.get(m.id)?.type === 'host').length
  const relayAssigned = tableMembers.filter((m) => pick.get(m.id)?.type === 'relay').length
  const totalAssigned = hostAssigned + relayAssigned
  const hostRemaining = Math.max(0, quota.hostQuota - hostAssigned)
  const relayRemaining = Math.max(0, quota.relayQuota - relayAssigned)

  const hostCheckedOf = (mid: string) => pick.get(mid)?.type === 'host'
  const relayCheckedOf = (mid: string) => pick.get(mid)?.type === 'relay' || relayPending.has(mid)
  const relayCityNameOf = (mid: string) => (pick.get(mid)?.type === 'relay' ? pick.get(mid)!.name : null)
  const inTable = (mid: string) => tableIds.includes(mid)

  // ── Actions ──────────────────────────────────────────────────────────────────
  function selectHost(mid: string) {
    if (!hostCity) return
    if (!hostCheckedOf(mid) && hostRemaining <= 0) { showToast('Host City preference quota reached.'); return }
    setPick((prev) => { const n = new Map(prev); n.set(mid, hostCity); return n })
    setRelayPending((prev) => { const n = new Set(prev); n.delete(mid); return n })
    if (relayDropdown?.mid === mid) setRelayDropdown(null)
  }
  function selectRelay(mid: string, el: HTMLElement) {
    // Turning on relay while the pool is full (and this member isn't already relay) → block.
    if (pick.get(mid)?.type !== 'relay' && relayRemaining <= 0) { showToast('Relay City preference quota reached.'); return }
    setPick((prev) => { const n = new Map(prev); if (n.get(mid)?.type === 'host') n.delete(mid); return n })
    setRelayPending((prev) => { const n = new Set(prev); n.add(mid); return n })
    setRelaySearch('')
    setRelayDropdown({ mid, el })
  }
  function pickRelay(mid: string, city: LiveCity) {
    if (pick.get(mid)?.id !== city.id && relayRemaining <= 0) { showToast('Relay City preference quota reached.'); return }
    setPick((prev) => { const n = new Map(prev); n.set(mid, city); return n })
    setRelayPending((prev) => { const n = new Set(prev); n.delete(mid); return n })
    setRelayDropdown(null)
    showToast(`Relay City preference: ${city.name}.`, 'success')
  }
  function removeMember(mid: string) {
    setTableIds((prev) => prev.filter((x) => x !== mid))
    setPick((prev) => { const n = new Map(prev); n.delete(mid); return n })
    setRelayPending((prev) => { const n = new Set(prev); n.delete(mid); return n })
    if (relayDropdown?.mid === mid) setRelayDropdown(null)
  }
  function addMember(m: FamilyMember) {
    setTableIds((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]))
    showToast(`${m.name.split(' ')[0]} added to the table.`, 'success')
  }

  function handleSave() {
    if (totalAssigned === 0) { showToast('Add a preferred city for at least one member first.'); return }
    if (id) setActiveMiqaat(id)
    const picks: Record<string, GroupCityAlloc> = {}
    tableMembers.forEach((m) => {
      const c = pick.get(m.id)
      if (c) picks[m.id] = { id: c.id, name: c.name, type: c.type }
    })
    saveArazAction(picks)
    // Editing an existing submission stays on this page and drops back to the read-only view state;
    // a first-time submission shows the full confirmation ("submitted") screen.
    if (submitted) { setEditing(false); showToast('Preferences updated.', 'success') }
    else setView('success')
  }

  const HostIcon = (
    <svg viewBox="0 0 24 24" fill="none" className="size-[22px] shrink-0">
      <path d="M12 3v2.2" stroke="#c2a04e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.6 9.4a3.4 3.4 0 016.8 0" stroke="#c2a04e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 21V10.5M19 21V10.5M8 21v-5a4 4 0 018 0v5M3.5 21h17" stroke="#c2a04e" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
  const RelayIcon = (
    <svg viewBox="0 0 24 24" fill="none" className="size-[22px] shrink-0">
      <path d="M20.5 13.2A8.5 8.5 0 1110.8 3.5a6.7 6.7 0 109.7 9.7z" stroke="#c2a04e" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )

  // ── Success view ────────────────────────────────────────────────────────────
  if (view === 'success') {
    const byCity = new Map<string, { city: LiveCity; members: FamilyMember[] }>()
    tableMembers.forEach((m) => {
      const c = pick.get(m.id)
      if (!c) return
      if (!byCity.has(c.id)) byCity.set(c.id, { city: c, members: [] })
      byCity.get(c.id)!.members.push(m)
    })
    const arazSections: ConfirmedSection[] = [...byCity.values()]
      .sort((a, b) => (a.city.type === 'host' ? 0 : 1) - (b.city.type === 'host' ? 0 : 1))
      .map(({ city, members }) => ({
        name: city.name,
        typeLabel: (city.type === 'host' ? 'Host City' : 'Relay City') as 'Host City' | 'Relay City',
        count: members.length,
        groups: members.map((m) => ({ members: [{ member: m, badge: null as BadgeKind }] }) as Group),
        statusText: 'Preference saved',
      }))
    const goHome = () => nav('/miqaats')

    return (
      <PhoneScreen footer={
        <div className="sm:hidden">
          <StickyFooter caption={tx('Araz · Preferred City')} title={tx('Preferences submitted')} button={t('Go home')} onButton={goHome} />
        </div>
      }>
        <AppBar notificationCount={3} />

        {/* ═══════════════ DESKTOP — City-confirmed two-panel layout ═══════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <ConfirmedView
            title={t('Preferences Submitted')}
            footerCaption={tx('Araz · Preferred City')}
            infoLabel="Final allocation"
            infoValue="Announced later"
            membersAllocated={totalAssigned}
            sections={arazSections}
            unallocatedNotice={null}
            opensLater={[]}
            onBack={goHome}
            onDone={goHome}
            statusRowLabel="Araz status"
            statusPill="Submitted"
            countLabel="Members submitted"
            footerNoun="preferences submitted"
          />
        </div>

        {/* ═══════════════ MOBILE — single column ═══════════════ */}
        <div className="contents sm:hidden">
          <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-[24px] pt-[40px] pb-[36px] text-center">
            <span className="flex size-[80px] items-center justify-center rounded-full" style={{ background: '#eef7f1' }}>
              <svg viewBox="0 0 48 48" fill="none" className="size-[44px]"><circle cx="24" cy="24" r="20" stroke="#1f7a4d" strokeWidth="2.4" /><path d="M15 24.5l6 6 12-13" stroke="#1f7a4d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <h1 className="mt-[22px] text-[28px] leading-[34px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Preferences submitted')} />
            <p className="mt-[12px] text-[14px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
              Your preferred Host and Relay City choices have been recorded through the Araz process. These are
              <strong className="font-bold text-[#15402f]"> preferences only</strong> and do not confirm or reserve your final
              city allocation — final assignments are announced during the official allocation phase.
            </p>
            <div className="mt-[22px] w-full rounded-[14px] border border-[#e7dfc9] bg-white p-[16px] text-start shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
              <p className="text-[12px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT }} {...tx('Your preferences')} />
              <div className="mt-[10px] flex flex-col gap-[8px]">
                {tableMembers.map((m) => {
                  const city = pick.get(m.id)
                  if (!city) return null
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-[10px] rounded-[10px] bg-[#faf8f2] px-[12px] py-[9px]">
                      <span className="min-w-0 truncate text-[13px] font-semibold text-[#23302a]" style={{ fontFamily: FONT }}>{m.name.split(' ')[0]}</span>
                      <span className="flex shrink-0 items-center gap-[8px]"><CityKindTag type={city.type} /><span className="text-[13px] font-bold text-[#15402f]" style={{ fontFamily: FONT }} {...td(city.name)} /></span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </PhoneScreen>
    )
  }

  // ── Browse (main) ─────────────────────────────────────────────────────────
  const stepMembersCount = `${totalAssigned}/${totalMembers}`
  const breadcrumbItems = [
    { label: t('Home'), to: '/miqaats' },
    { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
    { label: t('Araz') },
  ]
  const hostCityName = hostCity?.name ?? 'Host City'

  // Read-only view state → an info-only footer (the action lives in the header's Edit toggle). While
  // editing (or on a first-time submission) → the Save/Update CTA.
  const footer = locked ? (
    <StickyFooter caption={tx('Araz · Preferred City')} title={tx('Preferences submitted')} button={t('Go back')} onButton={() => nav(-1)} />
  ) : (
    <StickyFooter
      caption={tx('Araz · Preferred City')}
      // CLASS A, NOT FIXED HERE — `Submit your preferences` HAS a wordlist entry and this
      // renders English anyway. Same trade as Review.tsx's footerHint: routing it also
      // exposes `Update your preferences` as a NO_ROW gap and grows the coverage baseline.
      title={submitted ? 'Update your preferences' : 'Submit your preferences'}
      button={submitted ? 'Update preferences' : 'Save Preferences'}
      onButton={handleSave}
    />
  )

  return (
    <>
      <Toast toast={toast} align="right" />
      <PhoneScreen footer={<div className="sm:hidden">{footer}</div>}>
        <AppBar notificationCount={3} />

        {/* ═══════════════ MOBILE — single column ═══════════════ */}
        <div className="contents sm:hidden">
          <div className="ms-[16px] mt-[12px]">
            <Breadcrumb items={breadcrumbItems} onNavigate={(to) => nav(to)} onBack={() => nav(-1)} backOnMobile />
          </div>
          <h1 className="mt-[16px] px-[16px] text-[24px] leading-[30px] text-[#23302a]" style={{ fontFamily: SERIF }} {...tx('Submit Preferred Cities')} />

          <div className="mt-[16px] px-[16px]"><ArazInfoBanner /></div>

          <div className="mt-[18px] flex flex-col gap-[16px] px-[16px]">
            <QuotaCard title={t('Host City')} icon={HostIcon} quota={quota.hostQuota} remaining={hostRemaining} poolFull={hostRemaining <= 0} helper="Choose the Host City radio for each member in the table below." />
            <QuotaCard title={t('Relay City')} icon={RelayIcon} quota={quota.relayQuota} remaining={relayRemaining} poolFull={relayRemaining <= 0} helper="Choose the Relay City radio, then pick a city from the dropdown for each member." />
          </div>

          <div className="mx-[16px] mt-[16px] flex items-center justify-between gap-[10px]">
            <MembersChip count={totalMembers} />
            <div className="flex items-center gap-[10px]">
              <AddCta onClick={() => setAddOpen(true)} disabled={locked} />
              {submitted && <EditToggle editing={editing} onClick={toggleEdit} />}
            </div>
          </div>

          <div className={`mx-[16px] mt-[14px] mb-[16px] flex flex-col gap-[12px] ${locked ? 'pointer-events-none' : ''}`}>
            {tableMembers.map((m) => (
              <ArazMemberCard key={m.id} member={m}
                hostChecked={hostCheckedOf(m.id)} relayChecked={relayCheckedOf(m.id)}
                hostCityName={hostCityName} relayLabel={relayCityNameOf(m.id)} relayOpen={relayDropdown?.mid === m.id}
                canRemove={canRemove(m.id)} readOnly={locked}
                onSelectHost={() => selectHost(m.id)}
                onSelectRelay={(el) => selectRelay(m.id, el)}
                onOpenRelay={(el) => { setRelaySearch(''); setRelayDropdown({ mid: m.id, el }) }}
                onRemove={() => removeMember(m.id)} />
            ))}
            {tableMembers.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-[#d3c8ac] bg-[#faf8f2] px-[16px] py-[22px] text-center">
                <p className="text-[13px] font-semibold text-[#8a7a52]" style={{ fontFamily: FONT }} {...tx('No members in the table. Tap Add to include a family member.')} />
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════ DESKTOP — two-panel ═══════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">
            {/* LEFT sidebar */}
            <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[20px] overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">
              <Breadcrumb items={breadcrumbItems} onNavigate={(to) => nav(to)} onBack={() => nav(-1)} activeColor="#a8843e" dense />
              <h2 className="text-[28px] leading-[34px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Choose your cities')} />
              <QuotaCard title={t('Host City')} icon={HostIcon} quota={quota.hostQuota} remaining={hostRemaining} poolFull={hostRemaining <= 0} helper="Choose the Host City radio for each member in the table." />
              <QuotaCard title={t('Relay City')} icon={RelayIcon} quota={quota.relayQuota} remaining={relayRemaining} poolFull={relayRemaining <= 0} helper="Choose the Relay City radio, then pick a city from the dropdown for each member." />
            </aside>

            {/* RIGHT panel */}
            <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
                <ArazInfoBanner />
                <div className="mt-[20px] flex items-start justify-between gap-[16px]">
                  <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Submit Preferred Cities')} />
                  <div className="flex shrink-0 items-center gap-[12px]">
                    <MembersChip count={totalMembers} />
                    <AddCta onClick={() => setAddOpen(true)} disabled={locked} />
                    {submitted && <EditToggle editing={editing} onClick={toggleEdit} />}
                  </div>
                </div>
                <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
                  <StepIndicator steps={[{ label: t('City preference'), done: totalAssigned > 0 }, { label: t('Members'), count: stepMembersCount, done: totalAssigned > 0 }]} />
                </div>
                <div className={`mt-[20px] ${locked ? 'pointer-events-none' : ''}`}>
                  {tableMembers.length > 0 ? (
                    <ArazMemberTable
                      members={tableMembers}
                      hostCityName={hostCityName}
                      hostCheckedOf={hostCheckedOf}
                      relayCheckedOf={relayCheckedOf}
                      relayCityNameOf={relayCityNameOf}
                      openRelayMid={relayDropdown?.mid ?? null}
                      canRemoveOf={canRemove}
                      readOnly={locked}
                      onSelectHost={selectHost}
                      onSelectRelay={selectRelay}
                      onOpenRelay={(mid, el) => { setRelaySearch(''); setRelayDropdown({ mid, el }) }}
                      onRemove={removeMember}
                    />
                  ) : (
                    <div className="rounded-[14px] border border-dashed border-[#d3c8ac] bg-[#faf8f2] px-[16px] py-[28px] text-center">
                      <p className="text-[14px] font-semibold text-[#8a7a52]" style={{ fontFamily: FONT }} {...tx('No members in the table. Use Add to include a family member.')} />
                    </div>
                  )}
                </div>
              </div>
              <div className="shrink-0">{footer}</div>
            </section>
          </div>
        </div>
      </PhoneScreen>

      {relayDropdown && (
        <RelayDropdown
          anchor={relayDropdown.el}
          cities={relayCities}
          selectedCityId={pick.get(relayDropdown.mid)?.type === 'relay' ? pick.get(relayDropdown.mid)!.id : null}
          availabilityOf={() => relayRemaining > 0 || pick.get(relayDropdown.mid)?.type === 'relay'}
          search={relaySearch}
          onSearch={setRelaySearch}
          onSelect={(c) => pickRelay(relayDropdown.mid, c)}
          onClose={() => {
            // Closing without a pick clears a still-pending relay selection (keeps the radio honest).
            const mid = relayDropdown.mid
            setRelayDropdown(null)
            setRelaySearch('')
            setRelayPending((prev) => { const n = new Set(prev); n.delete(mid); return n })
          }}
        />
      )}

      <AddMemberSheet
        open={addOpen}
        roster={arazRoster}
        inTable={inTable}
        onAdd={addMember}
        onClose={() => setAddOpen(false)}
      />
    </>
  )
}
