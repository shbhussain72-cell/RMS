import { useState, useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import BottomSheet from '../components/figma/BottomSheet'
import { miqaats, liveCities, zonesByCityId, family, genderByIts } from '../data/seed'
import type { FamilyMember } from '../data/seed'
import { buildAllGroups, type BadgeKind, type Group } from '../lib/group'
import RoleBadge from '../components/figma/RoleBadge'
import { RazaStatusCard } from '../components/figma/RazaStatusCard'
import { useStore, journeyFor, type GroupCityAlloc, type ChangeRequest } from '../store'

// ── Constants ──────────────────────────────────────────────────────────────────

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'
const CARD_BG = '/figma/miqaat-card-bg.png'

const CURRENT_ZONE_NAME = 'Zone A – North'

// ── Helpers ────────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name

function familyMeta(relation: string, age: number, its: string, gender?: string) {
  // Gender prefers an explicit value (invited Mehmaan/Others carry it) over the family-only lookup.
  // A blank relation (an invited primary) drops the leading tag instead of showing a stray "·".
  const g = gender ?? genderByIts(its)
  const base = `${g ? `${g} · ` : ''}Age ${String(age).padStart(2, '0')} · ITS ${its}`
  return relation ? `${relation} · ${base}` : base
}

/** Returns the under-10 dependent this member guards, if any (drives the "can't be left" flow). */
function guardedDependentOf(memberId: string, guardians: Record<string, string>): FamilyMember | null {
  const entry = Object.entries(guardians).find(([, g]) => g === memberId)
  if (!entry) return null
  const dep = family.find((f) => f.id === entry[0])
  return dep?.needsGuardian ? dep : null
}

// ── Shared atoms ───────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="text-white font-bold" style={{ fontSize: size * 0.36, fontFamily: FONT, lineHeight: 1 }}>
        {initials(name)}
      </span>
    </div>
  )
}


function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0">
      <path
        d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699"
        stroke="#2e6a7d" strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function PinIcon({ color = '#1f5a44', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <path
        d="M8 1.333c-2.21 0-4 1.79-4 4 0 3 4 7.334 4 7.334s4-4.334 4-7.334c0-2.21-1.79-4-4-4z"
        stroke={color} strokeWidth="1.3" strokeLinejoin="round"
      />
      <circle cx="8" cy="5.333" r="1.333" stroke={color} strokeWidth="1.3" />
    </svg>
  )
}

function LandmarkIcon({ color = '#1f5a44', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <path d="M8 1.5L14 5H2L8 1.5z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3.5 6.5V12M6.5 6.5V12M9.5 6.5V12M12.5 6.5V12M2 13.5h12" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function CancelIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <circle cx="8" cy="8" r="6.2" stroke="#c0392b" strokeWidth="1.3" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="#c0392b" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function Check({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 12 10" fill="none" style={{ width: size, height: size }}>
      <path d="M1.5 5l3 3L10.5 2" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Radio({ selected }: { selected: boolean }) {
  return selected ? (
    <span className="size-[24px] shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center">
      <Check />
    </span>
  ) : (
    <span className="size-[24px] shrink-0 rounded-full border-2 border-[#d9c98a]" />
  )
}

function CurrentBadge() {
  return (
    <span
      className="shrink-0 rounded-full px-[12px] py-[4px] text-[13px] font-semibold"
      style={{ background: '#e4efe7', color: '#276245', fontFamily: FONT }}
    >
      Current
    </span>
  )
}

function Seats({ left }: { left: number }) {
  const full = left <= 0
  return (
    <span className="text-[14px] font-semibold" style={{ fontFamily: FONT, color: full ? '#b23b3b' : '#1f5a44' }}>
      {full ? '0 seats' : `${left} seats`}
    </span>
  )
}

// ── Member action buttons (City / Zone / Cancel) ─────────────────────────────────

function ActionButton({
  icon, label, danger, onClick,
}: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[38px] items-center justify-center gap-[6px] rounded-[10px] border bg-white px-[12px] transition-colors"
      style={{ borderColor: danger ? '#eccfcb' : '#e7dfc9' }}
    >
      {icon}
      <span
        className="text-[13px] font-bold"
        style={{ fontFamily: FONT, color: danger ? '#c0392b' : '#23302a' }}
      >
        {label}
      </span>
    </button>
  )
}

// ── Member row (inside a group card) ─────────────────────────────────────────────

function MemberBlock({
  member, badge, cityName, showZone, onCity, onZone, onCancel,
}: {
  member: FamilyMember
  badge: BadgeKind
  cityName: string
  showZone: boolean
  onCity: () => void
  onZone: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-start gap-[8px]">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-[#23302a] leading-[20px]" style={{ fontFamily: FONT }}>
            {member.name}
          </p>
          <p className="mt-[2px] text-[12px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            {familyMeta(member.relation, member.age, member.its)}
          </p>
        </div>
        <RoleBadge kind={badge} />
      </div>
      <div className="mt-[8px] flex items-center gap-[5px]">
        <PinIcon />
        <span className="text-[13px] text-[#1f5a44]" style={{ fontFamily: FONT, fontWeight: 600 }}>
          {cityName}{showZone ? ` · ${CURRENT_ZONE_NAME}` : ''}
        </span>
      </div>
      <div className={`mt-[12px] grid gap-[8px] ${showZone ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <ActionButton icon={<LandmarkIcon />} label="City" onClick={onCity} />
        {showZone && <ActionButton icon={<PinIcon />} label="Zone" onClick={onZone} />}
        <ActionButton icon={<CancelIcon />} label="Cancel" danger onClick={onCancel} />
      </div>
    </div>
  )
}

// ── Group card ───────────────────────────────────────────────────────────────────

function GroupCard({
  group, cityName, showZone, onCity, onZone, onCancel,
}: {
  group: Group
  cityName: string
  showZone: boolean
  onCity: (m: FamilyMember) => void
  onZone: (m: FamilyMember) => void
  onCancel: (m: FamilyMember) => void
}) {
  const linked = !!group.label
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
      {linked && (
        <div className="flex h-[34px] items-center gap-[8px] bg-[#e1eef1] px-[14px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
            {group.label}
          </span>
        </div>
      )}
      <div>
        {group.members.map((mm, i) => (
          <div
            key={mm.member.id}
            className="flex items-start gap-[10px] px-[14px] py-[14px]"
            style={{ borderTop: i > 0 ? '1px solid #f4f0e6' : undefined }}
          >
            <Avatar name={mm.member.name} />
            <MemberBlock
              member={mm.member}
              badge={mm.badge}
              cityName={cityName}
              showZone={showZone}
              onCity={() => onCity(mm.member)}
              onZone={() => onZone(mm.member)}
              onCancel={() => onCancel(mm.member)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Icons & footer button ────────────────────────────────────────────────────────

function PersonAddIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <circle cx="9" cy="7" r="3.2" stroke="white" strokeWidth="1.7" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18.5 7.5v5M21 10h-5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <circle cx="10" cy="10" r="8" fill="#2e6a7d" />
      <path d="M10 9v4.5M10 6.5h.01" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** Full-width sheet CTA pinned under a divider (green by default, orange for destructive). */
function SheetFooterButton({
  label, icon, onClick, disabled, tone = 'green',
}: {
  label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'green' | 'orange'
}) {
  const bg = disabled ? '#a9c4b6' : tone === 'orange' ? '#d2632b' : '#1f5a44'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-[52px] w-full items-center justify-center gap-[8px] rounded-[14px] text-[16px] font-bold text-white transition-colors"
      style={{ background: bg, fontFamily: FONT }}
    >
      {icon}{label}
    </button>
  )
}

// ── Guardian resolution (dependent header + Assign box + a second option) ─────────

function GuardianResolution({
  dependent, assignedGuardianName, onRequestAssign, secondTitle, secondSub, secondChosen, onSecondChoose,
}: {
  dependent: FamilyMember
  assignedGuardianName: string | null
  onRequestAssign: () => void
  secondTitle: string
  secondSub: string
  secondChosen: boolean
  onSecondChoose: () => void
}) {
  const fn = firstNameOf(dependent.name)
  const assigned = !!assignedGuardianName
  return (
    <>
      <div className="flex items-center gap-[10px]">
        <Avatar name={dependent.name} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-[#23302a] leading-[20px] truncate" style={{ fontFamily: FONT }}>
            {dependent.name}
          </p>
          <p className="mt-[2px] text-[12px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            {familyMeta(dependent.relation, dependent.age, dependent.its)}
          </p>
        </div>
        <RoleBadge kind="dependent" />
      </div>

      <p className="mt-[12px] text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
        {fn} can&apos;t be left without a guardian. Choose one:
      </p>

      {/* Assign to someone staying */}
      <div
        className="mt-[10px] flex items-center gap-[10px] rounded-[12px] px-[12px] py-[12px]"
        style={{ background: '#fdf6e6', border: `1px solid ${assigned ? '#1f5a44' : '#e8d9a8'}` }}
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0">
          <path d="M10 2.5L18 16.5H2L10 2.5z" stroke="#b8821e" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M10 8v3.5M10 13.5h.01" stroke="#b8821e" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <p className="flex-1 text-[13px] leading-[18px] text-[#5a4a22]" style={{ fontFamily: FONT }}>
          {assigned ? <><strong>{assignedGuardianName}</strong> will stay with {fn}.</> : <>Link {fn} to someone staying. so they keep their place.</>}
        </p>
        <button
          type="button"
          onClick={onRequestAssign}
          className="shrink-0 flex items-center gap-[4px] rounded-[10px] border border-[#1f5a44] bg-white px-[12px] h-[34px]"
        >
          <span className="text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>{assigned ? 'Change' : 'Assign'}</span>
          <svg viewBox="0 0 16 16" fill="none" className="size-[12px]">
            <path d="M6 4l4 4-4 4" stroke="#1f5a44" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Second option (Move with me / Cancel reservation too) */}
      <button
        type="button"
        onClick={onSecondChoose}
        className="mt-[10px] flex w-full items-start gap-[10px] rounded-[12px] px-[12px] py-[12px] text-left transition-colors"
        style={{ border: `1px solid ${secondChosen ? '#1f5a44' : '#e7dfc9'}`, background: secondChosen ? '#f3f8f5' : 'white' }}
      >
        <span className="mt-[1px]"><Radio selected={secondChosen} /></span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{secondTitle}</p>
          <p className="mt-[2px] text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }}>{secondSub}</p>
        </div>
      </button>
    </>
  )
}

// ── Change city sheet ────────────────────────────────────────────────────────────

function ChangeCitySheet({
  member, currentCityName, guardians, assignedGuardianId, onRequestAssign, onClose, onSend,
}: {
  member: FamilyMember
  currentCityName: string
  guardians: Record<string, string>
  assignedGuardianId?: string
  onRequestAssign: () => void
  onClose: () => void
  onSend: () => void
}) {
  const [selCityId, setSelCityId] = useState<string | null>(null)
  const [secondChosen, setSecondChosen] = useState(false)
  const guarded = guardedDependentOf(member.id, guardians)
  const fn = firstNameOf(member.name)
  const others = liveCities.filter((c) => c.name !== currentCityName)
  const assignedName = assignedGuardianId ? family.find((f) => f.id === assignedGuardianId)?.name ?? null : null
  const resolved = secondChosen || !!assignedGuardianId
  const canSend = !!selCityId && (!guarded || resolved)

  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <h2 className="text-[26px] leading-[32px] text-[#15402f]" style={{ fontFamily: SERIF }}>Change city</h2>
          <p className="mt-[6px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            Reserve {fn} in a different city. You can pick a zone there afterwards.
          </p>
        </>
      )}
      footer={canSend ? <SheetFooterButton label="Send request" onClick={onSend} /> : undefined}
    >
      <p className="mb-[10px] text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>Pick new city</p>

      {/* Current */}
      <div className="flex items-center justify-between rounded-[12px] border border-[#e7dfc9] bg-white px-[16px] py-[14px]">
        <span className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{currentCityName}</span>
        <CurrentBadge />
      </div>

      <div className="mt-[10px] flex flex-col gap-[10px]">
        {others.map((c) => {
          const isFull = c.seatsLeft <= 0
          const selected = selCityId === c.id
          return (
            <div
              key={c.id}
              className="rounded-[12px] border"
              style={{ borderColor: selected ? '#1f5a44' : '#e7dfc9', opacity: isFull ? 0.55 : 1 }}
            >
              <button
                type="button"
                onClick={() => { if (!isFull) { setSelCityId(c.id); setSecondChosen(false) } }}
                className="flex w-full items-center justify-between px-[16px] py-[14px]"
                style={{ cursor: isFull ? 'default' : 'pointer' }}
              >
                <span className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{c.name}</span>
                <span className="flex items-center gap-[12px]">
                  <Seats left={c.seatsLeft} />
                  {!isFull && <Radio selected={selected} />}
                </span>
              </button>
              {selected && guarded && (
                <div className="border-t border-[#f0ebe0] px-[16px] pb-[14px] pt-[12px]">
                  <GuardianResolution
                    dependent={guarded}
                    assignedGuardianName={assignedName}
                    onRequestAssign={onRequestAssign}
                    secondTitle={`Move ${firstNameOf(guarded.name)} with me`}
                    secondSub={`Take ${firstNameOf(guarded.name)} to your new city too, so you stay together.`}
                    secondChosen={secondChosen}
                    onSecondChoose={() => setSecondChosen((v) => !v)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

    </BottomSheet>
  )
}

// ── Change zone sheet ────────────────────────────────────────────────────────────

function ChangeZoneSheet({
  member, cityName, guardians, assignedGuardianId, onRequestAssign, onClose, onSend,
}: {
  member: FamilyMember
  cityName: string
  guardians: Record<string, string>
  assignedGuardianId?: string
  onRequestAssign: () => void
  onClose: () => void
  onSend: () => void
}) {
  const [selZoneId, setSelZoneId] = useState<string | null>(null)
  const [secondChosen, setSecondChosen] = useState(false)
  const guarded = guardedDependentOf(member.id, guardians)
  const zones = zonesByCityId['colombo'] ?? []
  const assignedName = assignedGuardianId ? family.find((f) => f.id === assignedGuardianId)?.name ?? null : null
  const resolved = secondChosen || !!assignedGuardianId
  const canSend = !!selZoneId && (!guarded || resolved)

  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <h2 className="text-[26px] leading-[32px] text-[#15402f]" style={{ fontFamily: SERIF }}>Change zone</h2>
          <p className="mt-[6px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            Move yourself to another zone in {cityName}.
          </p>
        </>
      )}
      footer={canSend ? <SheetFooterButton label="Send request" onClick={onSend} /> : undefined}
    >
      <p className="mb-[10px] text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>Pick new zone</p>

      <div className="flex flex-col gap-[10px]">
        {zones.map((z) => {
          const left = z.capacity - z.filled
          const isCurrent = z.name === CURRENT_ZONE_NAME
          const isFull = left <= 0
          const selected = selZoneId === z.id
          return (
            <div
              key={z.id}
              className="rounded-[12px] border"
              style={{ borderColor: selected ? '#1f5a44' : '#e7dfc9', opacity: isFull && !isCurrent ? 0.55 : 1 }}
            >
              <button
                type="button"
                onClick={() => { if (!isCurrent && !isFull) { setSelZoneId(z.id); setSecondChosen(false) } }}
                className="flex w-full items-center justify-between px-[16px] py-[14px]"
                style={{ cursor: isCurrent || isFull ? 'default' : 'pointer' }}
              >
                <span className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{z.name}</span>
                {isCurrent ? (
                  <CurrentBadge />
                ) : (
                  <span className="flex items-center gap-[12px]">
                    <Seats left={left} />
                    {!isFull && <Radio selected={selected} />}
                  </span>
                )}
              </button>
              {selected && guarded && (
                <div className="border-t border-[#f0ebe0] px-[16px] pb-[14px] pt-[12px]">
                  <GuardianResolution
                    dependent={guarded}
                    assignedGuardianName={assignedName}
                    onRequestAssign={onRequestAssign}
                    secondTitle={`Move ${firstNameOf(guarded.name)} with me`}
                    secondSub={`Take ${firstNameOf(guarded.name)} to your new city too, so you stay together.`}
                    secondChosen={secondChosen}
                    onSecondChoose={() => setSecondChosen((v) => !v)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

    </BottomSheet>
  )
}

// ── Assign guardian sheet (nested popup from the "Assign" action) ─────────────────

function AssignGuardianSheet({
  dependent, currentGuardianId, onClose, onAssigned,
}: {
  dependent: FamilyMember
  currentGuardianId?: string
  onClose: () => void
  onAssigned: (guardianId: string) => void
}) {
  const [selId, setSelId] = useState<string | null>(null)
  const candidates = family.filter((f) => f.role !== 'dependent' && f.id !== dependent.id)

  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <>
          <p className="text-[12px] font-bold uppercase tracking-[1px] text-[#a8843e]" style={{ fontFamily: FONT }}>
            Assign guardian
          </p>
          <h2 className="mt-[4px] text-[26px] leading-[32px] text-[#15402f]" style={{ fontFamily: SERIF }}>
            For {dependent.name}
          </h2>
          <p className="mt-[6px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            {dependent.relation} · {dependent.gender} · Age {String(dependent.age).padStart(2, '0')} · Choose an adult family member
          </p>
        </>
      )}
      footer={(
        <SheetFooterButton
          label="Add guardian"
          icon={<PersonAddIcon />}
          disabled={!selId}
          onClick={() => selId && onAssigned(selId)}
        />
      )}
    >
      <div className="flex flex-col gap-[10px]">
        {candidates.map((c) => {
          const isCurrent = c.id === currentGuardianId
          const selected = selId === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => { if (!isCurrent) setSelId(c.id) }}
              className="flex items-center gap-[12px] rounded-[12px] border px-[14px] py-[12px] text-left transition-colors"
              style={{ borderColor: selected ? '#1f5a44' : '#e7dfc9', background: selected ? '#f3f8f5' : 'white' }}
            >
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{c.name}</p>
                <p className="mt-[2px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>
                  {familyMeta(c.relation, c.age, c.its)}
                </p>
              </div>
              {isCurrent ? <CurrentBadge /> : <Radio selected={selected} />}
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
      <path d="M12 3l7 2.6v5.1c0 4.4-3 7.4-7 8.9-4-1.5-7-4.5-7-8.9V5.6L12 3z" stroke="#1f7a4d" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 11.8l2.1 2.1L15 10" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Result popup (centered success → Done) ───────────────────────────────────────

function ResultPopup({ title, subtext, onDone }: { title: string; subtext: string; onDone: () => void }) {
  return (
    <BottomSheet
      open
      onClose={onDone}
      footer={(
        <button type="button" onClick={onDone}
          className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] text-[16px] font-bold text-white shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.3)]"
          style={{ fontFamily: FONT }}>
          Done
        </button>
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
        <h2 className="mt-[18px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }}>{title}</h2>
        <p className="mt-[10px] max-w-[336px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT }}>{subtext}</p>
      </div>
    </BottomSheet>
  )
}

// ── Linked Reservation card (approved group design + in-card transfer / pending) ──

/**
 * The "Linked to your reservation" card — the approved second design: a grouped card
 * (Guardian + dependent · added together band, gold connector, Dependent tag) with the
 * transfer prompt / acceptance-pending status shown INSIDE the card. Content-width, not
 * stretched full-bleed. Prominent tier (avatar 44 / name 16) per the design system.
 */
function LinkedReservationCard({
  primary, registrant, dependents, transferState, transferGuardianName, onTransfer, onCancelTransfer, primaryBadge = 'registrant',
}: {
  primary: FamilyMember
  /** The logged-in registrant ("you") — the previous holder. In the transferred state `primary`
   *  becomes the NEW guardian, so this is threaded separately to render the "Was linked to" side. */
  registrant: FamilyMember
  dependents: FamilyMember[]
  transferState: 'none' | 'pending' | 'transferred'
  transferGuardianName: string | null
  onTransfer: () => void
  /** Revert a pending transfer back to un-transferred (the "Cancel Transfer" control). */
  onCancelTransfer?: () => void
  /** The lead member's tag — flips to 'guardian' once the dependent has been transferred to them. */
  primaryBadge?: BadgeKind
}) {
  const members = [primary, ...dependents]
  const linked = dependents.length > 0
  const dep = dependents[0] ?? null
  const fn = dep ? firstNameOf(dep.name) : ''
  // Pronouns follow the dependent's gender so the copy reads correctly for any linked member.
  const posPron = dep?.gender === 'Male' ? 'his' : 'her'   // possessive: his/her
  const objPron = dep?.gender === 'Male' ? 'him' : 'her'   // object: him/her

  // ── Pending acceptance — full-card transfer-flow view (replaces the member-list card entirely) ──
  if (dep && transferState === 'pending') {
    const newGuardianFn = transferGuardianName ? firstNameOf(transferGuardianName) : 'the new guardian'
    return (
      <div data-tour="linked-transfer" className="overflow-hidden rounded-[16px] border border-[#ecd9a6] bg-white">
        {/* Header band */}
        <div className="flex items-center gap-[9px] px-[16px] py-[12px]" style={{ background: '#fdefd2' }}>
          <span className="size-[11px] shrink-0 rounded-full bg-[#c08a1e]" />
          <span className="text-[15px] font-extrabold tracking-[0.2px] text-[#b07d16]" style={{ fontFamily: FONT }}>Pending acceptance</span>
        </div>
        {/* "Spot is safe" reassurance strip */}
        <div className="flex items-center gap-[9px] px-[16px] py-[11px]" style={{ background: '#e9f3ec' }}>
          <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
            <circle cx="12" cy="12" r="9" stroke="#1f7a4d" strokeWidth="1.6" />
            <path d="M8.4 12.2l2.3 2.3 4.9-5" stroke="#1f7a4d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[13.5px] leading-[19px]" style={{ fontFamily: FONT }}>
            <span className="font-extrabold text-[#15603f]">{fn}&apos;s spot is safe.</span>
            <span className="text-[#5a6660]"> It stays reserved until {newGuardianFn} accepts or the request expires.</span>
          </p>
        </div>
        {/* Transfer-flow diagram: FROM YOU → TRANSFERING → NEW GUARDIAN */}
        <div className="px-[18px] pt-[20px] pb-[18px]" style={{ background: '#fffdf7' }}>
          <div className="relative flex items-start">
            {/* dashed connectors + arrow, centred on the 60px avatars (centre y = 30px) */}
            <span className="pointer-events-none absolute top-[30px] border-t-2 border-dashed border-[#e2c88f]" style={{ left: 'calc(16.666% + 34px)', right: 'calc(50% + 34px)' }} />
            <span className="pointer-events-none absolute top-[30px] border-t-2 border-dashed border-[#e2c88f]" style={{ left: 'calc(50% + 34px)', right: 'calc(16.666% + 40px)' }} />
            <svg viewBox="0 0 16 16" fill="none" className="pointer-events-none absolute size-[16px]" style={{ top: '22px', right: 'calc(16.666% + 26px)' }}>
              <path d="M3 8h8M8 4l4 4-4 4" stroke="#c9992f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {/* FROM YOU */}
            <div className="flex flex-1 flex-col items-center px-[4px] text-center">
              <Avatar name={primary.name} size={60} />
              <p className="mt-[10px] text-[11px] font-extrabold uppercase tracking-[1px] text-[#5f7183]" style={{ fontFamily: FONT }}>From you</p>
              <p className="mt-[6px] text-[15px] font-bold leading-[19px] text-[#23302a]" style={{ fontFamily: FONT }}>{primary.name}</p>
            </div>
            {/* TRANSFERING */}
            <div className="flex flex-1 flex-col items-center px-[4px] text-center">
              <span className="flex size-[60px] shrink-0 items-center justify-center rounded-full border-2 border-[#d9b978] bg-[#f6e6bf]">
                <span className="text-[18px] font-bold text-[#9a7420]" style={{ fontFamily: FONT }}>{initials(dep.name)}</span>
              </span>
              <p className="mt-[10px] text-[11px] font-extrabold uppercase tracking-[1px] text-[#c08a1e]" style={{ fontFamily: FONT }}>Transfering</p>
              <p className="mt-[6px] text-[15px] font-bold leading-[19px] text-[#23302a]" style={{ fontFamily: FONT }}>{dep.name}</p>
            </div>
            {/* NEW GUARDIAN */}
            <div className="flex flex-1 flex-col items-center px-[4px] text-center">
              <Avatar name={transferGuardianName ?? ''} size={60} />
              <p className="mt-[10px] text-[11px] font-extrabold uppercase tracking-[1px] text-[#5f7183]" style={{ fontFamily: FONT }}>New guardian</p>
              <p className="mt-[6px] text-[15px] font-bold leading-[19px] text-[#23302a]" style={{ fontFamily: FONT }}>{transferGuardianName ?? '—'}</p>
            </div>
          </div>
        </div>
        {/* Footer: Requested → Approved stepper + Cancel Transfer */}
        <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-[#eee7d6] px-[16px] py-[12px]">
          <div className="flex items-center gap-[8px]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
              <circle cx="9" cy="7" r="3.2" stroke="#b07d16" strokeWidth="1.6" />
              <path d="M3.6 19c0-3 2.4-5 5.4-5s5.4 2 5.4 5" stroke="#b07d16" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M15.5 12.6l2 2 3.4-3.5" stroke="#b07d16" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[14px] font-extrabold text-[#b07d16]" style={{ fontFamily: FONT }}>Requested</span>
            <span className="h-[2px] w-[26px] shrink-0 rounded bg-[#e0d3ad]" />
            <span className="size-[15px] shrink-0 rounded-full border-2 border-[#cdd3cd]" />
            <span className="text-[14px] font-bold text-[#9aa39d]" style={{ fontFamily: FONT }}>Approved</span>
          </div>
          <button type="button" onClick={onCancelTransfer} className="flex h-[38px] shrink-0 items-center gap-[6px] rounded-[12px] border border-[#cdd5cf] bg-white px-[14px]">
            <svg viewBox="0 0 16 16" fill="none" className="size-[13px]"><path d="M4 4l8 8M12 4l-8 8" stroke="#1f5a44" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span className="text-[14px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>Cancel Transfer</span>
          </button>
        </div>
      </div>
    )
  }

  // ── Transferred — full-card "was linked to → now linked to" view (replaces the member-list card) ──
  if (dep && transferState === 'transferred') {
    const newGuardian = primary                       // in this state `primary` is the accepting guardian
    const newFn = firstNameOf(newGuardian.name)
    const depFn = firstNameOf(dep.name)
    const youMeta = `(You) · ${registrant.gender} · Age ${String(registrant.age).padStart(2, '0')} · ITS ${registrant.its}`
    return (
      <div data-tour="linked-transfer" className="overflow-hidden rounded-[16px] border border-[#cfe6d5] bg-white">
        {/* Header band — transferred + who accepted */}
        <div className="flex items-center gap-[8px] px-[16px] py-[9px]" style={{ background: '#eaf4ed' }}>
          <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
            <circle cx="12" cy="12" r="9" stroke="#1f8a54" strokeWidth="1.7" />
            <path d="M8.4 12.2l2.3 2.3 4.9-5" stroke="#1f8a54" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[14px] sm:text-[15px] font-extrabold tracking-[0.2px] text-[#1f7a4d]" style={{ fontFamily: FONT }}>
            Transferred · Accepted by {newFn}
          </span>
        </div>

        {/* Body — was/now diagram + dependent row */}
        <div className="px-[14px] py-[14px] sm:px-[16px] sm:py-[16px]">
          <div className="flex items-stretch gap-[6px] sm:gap-[10px]">
            {/* WAS LINKED TO (previous holder = you) */}
            <div className="min-w-0 flex-1 rounded-[12px] sm:rounded-[14px] border border-dashed border-[#d6cdb8] bg-[#faf8f2] p-[9px] sm:p-[14px]">
              <p className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.4px] sm:tracking-[0.8px] text-[#5f7183]" style={{ fontFamily: FONT }}>Was linked to</p>
              <div className="mt-[8px] sm:mt-[10px] flex items-center gap-[7px] sm:gap-[9px]">
                <span className="flex size-[32px] sm:size-[46px] shrink-0 items-center justify-center rounded-full bg-[#ece4d3]">
                  <span className="text-[11px] sm:text-[15px] font-bold text-[#7c6f57]" style={{ fontFamily: FONT }}>{initials(registrant.name)}</span>
                </span>
                <p className="min-w-0 break-words text-[11px] sm:text-[15px] font-bold leading-[14px] sm:leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }}>{registrant.name}</p>
              </div>
              <p className="mt-[7px] sm:mt-[9px] text-[9.5px] sm:text-[12px] leading-[13px] sm:leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{youMeta}</p>
            </div>

            {/* arrow */}
            <div className="flex shrink-0 items-center">
              <span className="flex size-[24px] sm:size-[36px] items-center justify-center rounded-full bg-[#1f7a4d]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[12px] sm:size-[17px]"><path d="M5 12h13M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </div>

            {/* NOW LINKED TO (new guardian) */}
            <div className="min-w-0 flex-1 rounded-[12px] sm:rounded-[14px] border border-[#bacbc0] bg-[#f0f7f2] p-[9px] sm:p-[14px]">
              <p className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.4px] sm:tracking-[0.8px] text-[#5f7183]" style={{ fontFamily: FONT }}>Now linked to</p>
              <div className="mt-[8px] sm:mt-[10px] flex items-center gap-[7px] sm:gap-[9px]">
                <span className="flex size-[32px] sm:size-[46px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44]">
                  <span className="text-[11px] sm:text-[15px] font-bold text-white" style={{ fontFamily: FONT }}>{initials(newGuardian.name)}</span>
                </span>
                <p className="min-w-0 break-words text-[11px] sm:text-[15px] font-bold leading-[14px] sm:leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }}>{newGuardian.name}</p>
              </div>
              <p className="mt-[7px] sm:mt-[9px] text-[9.5px] sm:text-[12px] leading-[13px] sm:leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>
                {familyMeta(newGuardian.relation, newGuardian.age, newGuardian.its, newGuardian.gender)}
              </p>
            </div>
          </div>

          {/* dependent — place secured */}
          <div className="mt-[10px] sm:mt-[12px] flex items-center justify-between gap-[8px] sm:gap-[10px] rounded-[12px] sm:rounded-[14px] border border-[#e3decf] px-[11px] py-[10px] sm:px-[14px] sm:py-[12px]" style={{ background: '#fdfaf3' }}>
            <div className="flex min-w-0 items-center gap-[9px] sm:gap-[11px]">
              <span className="flex size-[38px] sm:size-[46px] shrink-0 items-center justify-center rounded-full bg-[#f5e2b3]">
                <span className="text-[13px] sm:text-[15px] font-bold text-[#c08a1e]" style={{ fontFamily: FONT }}>{initials(dep.name)}</span>
              </span>
              <div className="min-w-0">
                <p className="text-[13px] sm:text-[16px] font-bold leading-[17px] sm:leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }}>{dep.name}</p>
                <p className="mt-[2px] text-[10.5px] sm:text-[13px] leading-[14px] sm:leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>
                  {familyMeta(dep.relation, dep.age, dep.its, dep.gender)}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full px-[11px] py-[6px] sm:px-[14px] sm:py-[7px] text-[11px] sm:text-[14px] font-bold text-[#2f8f5b]" style={{ fontFamily: FONT, background: '#dcefe1' }}>Place secured</span>
          </div>
        </div>

        {/* Footer — cancelling is now safe */}
        <div className="flex items-center gap-[11px] px-[16px] py-[11px]" style={{ background: '#f3f9f5' }}>
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[#d3dfd7]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[16px]">
              <path d="M12 3l7 2.6v5.1c0 4.4-3 7.4-7 8.9-4-1.5-7-4.5-7-8.9V5.6L12 3z" stroke="#1f5a44" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4" stroke="#1f5a44" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[14px] sm:text-[15px] font-extrabold leading-[20px] text-[#22503a]" style={{ fontFamily: FONT }}>You&apos;re no longer dependent for {dep.name}.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-tour="linked-transfer" className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
      {linked && (
        <div className="flex h-[34px] items-center gap-[8px] bg-[#e1eef1] px-[14px]">
          <LinkGlyph />
          <span className="text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>Guardian + dependent · reserve together</span>
        </div>
      )}
      <div className="relative px-[14px] py-[6px]">
        {members.map((m, i) => {
          const isDep = i > 0
          const isFirst = i === 0
          const isLast = i === members.length - 1
          return (
            <div key={m.id} className="relative flex items-center gap-[12px] py-[10px]">
              {members.length > 1 && (
                <span className="pointer-events-none absolute left-[21px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
              )}
              <div className="relative shrink-0"><Avatar name={m.name} size={44} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold text-[#23302a] leading-[20px]" style={{ fontFamily: FONT }}>{m.name}</p>
                <p className="mt-[2px] text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(m.relation, m.age, m.its)}</p>
              </div>
              <RoleBadge kind={isDep ? 'dependent' : primaryBadge} />
            </div>
          )
        })}
      </div>

      {/* Transfer prompt — full-bleed amber section attached directly under the member rows */}
      {dep && transferState === 'none' && (
        <div className="border-t border-[#ecd9a6] px-[16px] py-[14px]" style={{ background: '#fdf3df' }}>
          <div className="flex items-start gap-[9px]">
            <span className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-[#f4e4bd]">
              <svg viewBox="0 0 24 24" fill="none" className="size-[15px]">
                <path d="M12 3l7 2.6v5.1c0 4.4-3 7.4-7 8.9-4-1.5-7-4.5-7-8.9V5.6L12 3z" stroke="#a9781f" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="mt-[3px] text-[14px] font-extrabold leading-[19px] text-[#3f3413]" style={{ fontFamily: FONT }}>
              Not attending? Reassign {fn} to keep {posPron} place.
            </p>
          </div>
          <p className="mt-[8px] text-[13px] leading-[19px] text-[#6b5c30]" style={{ fontFamily: FONT }}>
            {fn}&apos;s reservation is tied to yours. Link {objPron} to another attending adult before you withdraw.
          </p>
          <button type="button" onClick={onTransfer} className="group mt-[12px] inline-flex h-[44px] w-fit items-center justify-center gap-[8px] rounded-[12px] border border-[#1f5a44] bg-white px-[18px]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[16px] shrink-0">
              <path d="M4 8h13l-3-3" stroke="#1f5a44" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="group-hover:animate-[transferArrowFwd_320ms_ease-in-out_infinite_alternate] motion-reduce:group-hover:animate-none" />
              <path d="M20 16H7l3 3" stroke="#1f5a44" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="group-hover:animate-[transferArrowBack_320ms_ease-in-out_infinite_alternate] motion-reduce:group-hover:animate-none" />
            </svg>
            <span className="text-[14px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>Transfer {fn} to another guardian</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Cancel: blocked (linked) info popup + normal confirmation popup ────────────────

function CancelBlockedPopup({ onClose, onTransfer, pending, depName }: { onClose: () => void; onTransfer?: () => void; pending?: boolean; depName?: string }) {
  const who = depName ?? 'the linked member'
  return (
    <BottomSheet
      open
      onClose={onClose}
      footer={onTransfer ? (
        // The block is usually the linked dependent — let the user resolve it right here by
        // transferring, instead of dismissing and hunting for the in-card Transfer button.
        <div className="flex flex-col gap-[10px]">
          <button type="button" onClick={onTransfer}
            className="flex h-[52px] w-full items-center justify-center gap-[8px] rounded-[14px] bg-[#1f5a44] text-[16px] font-bold text-white" style={{ fontFamily: FONT }}>
            <svg viewBox="0 0 20 20" fill="none" className="size-[17px]"><path d="M4 7h12l-3-3M16 13H4l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Transfer
          </button>
          <button type="button" onClick={onClose}
            className="flex h-[52px] w-full items-center justify-center rounded-[14px] border border-[#d6cdb8] bg-white text-[16px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
            Okay
          </button>
        </div>
      ) : (
        <button type="button" onClick={onClose}
          className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] text-[16px] font-bold text-white" style={{ fontFamily: FONT }}>
          Okay
        </button>
      )}
    >
      <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
        <span className="flex size-[64px] items-center justify-center rounded-full bg-[#fdf0db]">
          <svg viewBox="0 0 24 24" fill="none" className="size-[30px]">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#c98a2e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-[16px] text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>
          {pending ? `Waiting for ${who} to accept` : `Transfer ${who} first`}
        </h2>
        <p className="mt-[10px] max-w-[340px] text-[14px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          {pending ? (
            <>You&apos;ve sent a transfer request to <strong className="text-[#23302a]">{who}</strong>. You can cancel your reservation only after <strong className="text-[#23302a]">{who}</strong> accepts it.</>
          ) : (
            <><strong className="text-[#23302a]">{who}</strong> is reserved together with you. Transfer {who} to another guardian first, then you can cancel your reservation.</>
          )}
        </p>
      </div>
    </BottomSheet>
  )
}

/** "Cancel your city selection?" — confirmation for cancelling ONLY the city allocation (the
 *  registration stays). Shows the event name (eyebrow) + the currently-selected city prominently. */
function CancelCityConfirmPopup({ eventName, cityName, onClose, onConfirm }: {
  eventName: string; cityName: string; onClose: () => void; onConfirm: () => void
}) {
  return (
    <BottomSheet
      open
      onClose={onClose}
      footer={(
        <div className="flex gap-[12px]">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-[12px] border border-[#e7dfc9] py-[14px] text-[15px] font-bold text-[#23302a] transition-colors hover:bg-[#fdf9f4]" style={{ fontFamily: FONT }}>
            Keep my reservation
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-[12px] bg-[#d2632b] py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#bd5723]" style={{ fontFamily: FONT }}>
            Cancel my city
          </button>
        </div>
      )}
    >
      <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
        <span className="flex size-[64px] items-center justify-center rounded-full bg-[#f3ecd9]">
          <PinIcon color="#b8821e" size={30} />
        </span>
        <p className="mt-[16px] text-[12px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT }}>{eventName}</p>
        <h2 className="mt-[5px] text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>Cancel your city selection?</h2>
        <div className="mt-[14px] flex items-center gap-[8px] rounded-[12px] border border-[#e7dfc9] bg-[#faf8f2] px-[14px] py-[10px]">
          <span className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>Current city</span>
          <span className="text-[15px] font-extrabold text-[#15402f]" style={{ fontFamily: FONT }}>{cityName}</span>
        </div>
        <p className="mt-[14px] max-w-[360px] text-[14px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          This removes <strong className="font-bold text-[#23302a]">{cityName}</strong> from your reservation. Your registration stays intact.
        </p>
      </div>
    </BottomSheet>
  )
}

function CancelZoneConfirmPopup({ eventName, zoneName, cityName, onClose, onConfirm }: {
  eventName: string; zoneName: string; cityName: string; onClose: () => void; onConfirm: () => void
}) {
  return (
    <BottomSheet
      open
      onClose={onClose}
      footer={(
        <div className="flex gap-[12px]">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-[12px] border border-[#e7dfc9] py-[14px] text-[15px] font-bold text-[#23302a] transition-colors hover:bg-[#fdf9f4]" style={{ fontFamily: FONT }}>
            Keep my reservation
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-[12px] bg-[#d2632b] py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#bd5723]" style={{ fontFamily: FONT }}>
            Cancel my zone
          </button>
        </div>
      )}
    >
      <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
        <span className="flex size-[64px] items-center justify-center rounded-full bg-[#eef1ef]">
          <PinIcon color="#2e6a7d" size={30} />
        </span>
        <p className="mt-[16px] text-[12px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT }}>{eventName}</p>
        <h2 className="mt-[5px] text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>Cancel your zone selection?</h2>
        <div className="mt-[14px] flex items-center gap-[8px] rounded-[12px] border border-[#e7dfc9] bg-[#faf8f2] px-[14px] py-[10px]">
          <span className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT }}>Current zone</span>
          <span className="text-[15px] font-extrabold text-[#15402f]" style={{ fontFamily: FONT }}>{zoneName}</span>
        </div>
        <p className="mt-[14px] max-w-[360px] text-[14px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          This removes <strong className="font-bold text-[#23302a]">{zoneName}</strong> from your reservation. You stay in <strong className="font-bold text-[#23302a]">{cityName}</strong> and your registration is unchanged.
        </p>
      </div>
    </BottomSheet>
  )
}

function CancelConfirmPopup({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <BottomSheet
      open
      onClose={onClose}
      footer={(
        <div className="flex gap-[12px]">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-[12px] border border-[#e7dfc9] py-[14px] text-[15px] font-bold text-[#23302a] transition-colors hover:bg-[#fdf9f4]" style={{ fontFamily: FONT }}>
            Keep reservation
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-[12px] bg-[#d2632b] py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#bd5723]" style={{ fontFamily: FONT }}>
            Cancel reservation
          </button>
        </div>
      )}
    >
      <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
        <span className="flex size-[64px] items-center justify-center rounded-full bg-[#fbeceb]">
          <CancelIcon size={30} />
        </span>
        <h2 className="mt-[16px] text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>Cancel my reservation?</h2>
        <p className="mt-[10px] max-w-[340px] text-[14px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          This will cancel your reservation for this Miqaat. This action can&apos;t be undone.
        </p>
      </div>
    </BottomSheet>
  )
}

// ── Cancel reservation sheet (shown when the registrant guards a linked dependent) ─

function CancelReservationSheet({
  dependent, assignedGuardianId, onRequestAssign, onClose, onCancelBoth, onCancelMine,
}: {
  dependent: FamilyMember
  assignedGuardianId?: string
  onRequestAssign: () => void
  onClose: () => void
  onCancelBoth: () => void
  onCancelMine: () => void
}) {
  const fn = firstNameOf(dependent.name)
  const assignedName = assignedGuardianId ? family.find((f) => f.id === assignedGuardianId)?.name ?? null : null
  const hasGuardian = !!assignedName

  return (
    <BottomSheet
      open
      onClose={onClose}
      header={(
        <h2 className="text-[26px] leading-[32px] text-[#15402f]" style={{ fontFamily: SERIF }}>Cancel my reservation</h2>
      )}
      footer={(
        hasGuardian
          ? <SheetFooterButton tone="orange" label={`Cancel mine & request ${fn} consent`} onClick={onCancelMine} />
          : <SheetFooterButton tone="orange" label="Cancel event" onClick={onCancelBoth} />
      )}
    >
      <div className="rounded-[14px] border border-[#e7dfc9] p-[14px]">
        <div className="flex items-center gap-[10px]">
          <Avatar name={dependent.name} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-[#23302a] leading-[20px]" style={{ fontFamily: FONT }}>{dependent.name}</p>
            <p className="mt-[2px] text-[12px] text-[#5a6660]" style={{ fontFamily: FONT }}>{familyMeta(dependent.relation, dependent.age, dependent.its)}</p>
          </div>
          <RoleBadge kind="dependent" />
        </div>

        <p className="mt-[12px] text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
          {fn} can&apos;t be left without a guardian. Choose one:
        </p>

        {hasGuardian ? (
          <div className="mt-[10px] flex items-center gap-[8px] rounded-[12px] bg-[#e7f1ea] px-[12px] py-[11px]">
            <ShieldCheckIcon />
            <p className="flex-1 text-[13px] leading-[18px]" style={{ fontFamily: FONT }}>
              <span className="text-[#5a6660]">Guardian: </span>
              <span className="font-bold text-[#15402f]">{assignedName}</span>
            </p>
            <button type="button" onClick={onRequestAssign} className="shrink-0 text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>Change</button>
          </div>
        ) : (
          <div className="mt-[10px] flex items-center gap-[10px] rounded-[12px] px-[12px] py-[12px]" style={{ background: '#fdf6e6', border: '1px solid #e8d9a8' }}>
            <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0">
              <path d="M10 2.5L18 16.5H2L10 2.5z" stroke="#b8821e" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M10 8v3.5M10 13.5h.01" stroke="#b8821e" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <p className="flex-1 text-[13px] leading-[18px] text-[#5a4a22]" style={{ fontFamily: FONT }}>Link {fn} to someone staying. so they keep their place.</p>
            <button type="button" onClick={onRequestAssign} className="shrink-0 flex items-center gap-[4px] rounded-[10px] border border-[#1f5a44] bg-white px-[12px] h-[34px]">
              <span className="text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }}>Transfer</span>
              <svg viewBox="0 0 16 16" fill="none" className="size-[12px]"><path d="M6 4l4 4-4 4" stroke="#1f5a44" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      <div className="mt-[12px] flex items-start gap-[10px] rounded-[12px] px-[12px] py-[12px]" style={{ background: '#e6f0f3' }}>
        <span className="mt-[1px]"><InfoIcon /></span>
        <p className="text-[13px] leading-[19px] text-[#2c4a52]" style={{ fontFamily: FONT }}>
          A confirmation request goes to {fn}. Your change applies now; {fn}&apos;s part stays pending until they confirm.
        </p>
      </div>
    </BottomSheet>
  )
}

// ── Desktop members table (matches the registration / city-selection table) ──────

function MembersTable({
  groups, cityName, showZone, onCity, onZone, onCancel,
}: {
  groups: Group[]
  cityName: string
  showZone: boolean
  onCity: (m: FamilyMember) => void
  onZone: (m: FamilyMember) => void
  onCancel: (m: FamilyMember) => void
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7dfc9]">
      <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: 780 }}>
        <colgroup>
          <col style={{ width: '42%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '20%' }} />
          <col />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {['Member', 'Role', 'Location', 'Actions'].map((h) => (
              <th
                key={h}
                className="px-[16px] py-[10px] text-left text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e] whitespace-nowrap"
                style={{ fontFamily: FONT }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const isLinked = !!g.label
          return (
            <tbody key={gi}>
              {isLinked && (
                <tr style={{ background: '#e1eef1' }}>
                  <td colSpan={4} className="px-[16px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
                      <LinkGlyph />{g.label}
                    </span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const isDep = isLinked && mi > 0
                return (
                  <tr key={mm.member.id} style={{ borderTop: '1px solid #f0ebe0', background: isDep ? '#fdfcf8' : 'white' }}>
                    <td className="px-[16px] py-[9px]">
                      <div className={`flex items-center gap-[10px] ${isDep ? 'pl-[20px]' : ''}`}>
                        {isDep && <span className="shrink-0 select-none text-[15px] leading-none text-[#c5bfb0]">└</span>}
                        <Avatar name={mm.member.name} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }}>{mm.member.name}</p>
                          <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>
                            {familyMeta(mm.member.relation, mm.member.age, mm.member.its, mm.member.gender)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-[16px] py-[9px]"><RoleBadge kind={mm.badge} /></td>
                    <td className="px-[16px] py-[9px]">
                      <span className="flex items-center gap-[5px]">
                        <PinIcon />
                        <span className="truncate text-[13px] text-[#1f5a44]" style={{ fontFamily: FONT, fontWeight: 600 }}>
                          {cityName}{showZone ? ` · ${CURRENT_ZONE_NAME}` : ''}
                        </span>
                      </span>
                    </td>
                    <td className="px-[16px] py-[9px]">
                      <div className="flex items-center gap-[8px]">
                        <ActionButton icon={<LandmarkIcon />} label="City" onClick={() => onCity(mm.member)} />
                        {showZone && <ActionButton icon={<PinIcon />} label="Zone" onClick={() => onZone(mm.member)} />}
                        <ActionButton icon={<CancelIcon />} label="Cancel" danger onClick={() => onCancel(mm.member)} />
                      </div>
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
}

function MosqueIcon({ color = '#2e6a7d', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <path d="M12 2.5c1.9 1.5 3 2.9 3 4.4H9c0-1.5 1.1-2.9 3-4.4z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5 21V11.6M19 21V11.6M4.6 11.8c0-2.2 3.3-3.9 7.4-3.9s7.4 1.7 7.4 3.9" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.6 21v-3.1a2.4 2.4 0 014.8 0V21" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 21h18" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** "Edit person" glyph — for the "Edit registration" option card (material-symbols person-edit-outline). */
function EditPeopleIcon({ color = '#1f5a44', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <path d="M4 20V17.2C4 16.6333 4.146 16.1127 4.438 15.638C4.73 15.1633 5.11733 14.8007 5.6 14.55C6.63333 14.0333 7.68333 13.646 8.75 13.388C9.81667 13.13 10.9 13.0007 12 13C12.6167 13 13.225 13.0377 13.825 13.113C14.425 13.1883 15.025 13.309 15.625 13.475L13.95 15.175C13.6167 15.125 13.2917 15.0833 12.975 15.05C12.6583 15.0167 12.3333 15 12 15C11.0667 15 10.1417 15.1127 9.225 15.338C8.30833 15.5633 7.4 15.9007 6.5 16.35C6.35 16.4333 6.229 16.55 6.137 16.7C6.045 16.85 5.99933 17.0167 6 17.2V18H12V20H4ZM14 21V17.925L19.525 12.425C19.675 12.275 19.8417 12.1667 20.025 12.1C20.2083 12.0333 20.3917 12 20.575 12C20.775 12 20.9667 12.0377 21.15 12.113C21.3333 12.1883 21.5 12.3007 21.65 12.45L22.575 13.375C22.7083 13.525 22.8127 13.6917 22.888 13.875C22.9633 14.0583 23.0007 14.2417 23 14.425C22.9993 14.6083 22.966 14.796 22.9 14.988C22.834 15.18 22.7257 15.3507 22.575 15.5L17.075 21H14ZM15.5 19.5H16.45L19.475 16.45L19.025 15.975L18.55 15.525L15.5 18.55V19.5ZM19.025 15.975L18.55 15.525L19.475 16.45L19.025 15.975ZM9.175 10.825C8.39167 10.0417 8 9.1 8 8C8 6.9 8.39167 5.95833 9.175 5.175C9.95833 4.39167 10.9 4 12 4C13.1 4 14.0417 4.39167 14.825 5.175C15.6083 5.95833 16 6.9 16 8C16 9.1 15.6083 10.0417 14.825 10.825C14.0417 11.6083 13.1 12 12 12C10.9 12 9.95833 11.6083 9.175 10.825ZM13.413 9.413C13.8043 9.021 14 8.55 14 8C14 7.45 13.8043 6.97933 13.413 6.588C13.0217 6.19667 12.5507 6.00067 12 6C11.4493 5.99933 10.9787 6.19533 10.588 6.588C10.1973 6.98067 10.0013 7.45133 10 8C9.99867 8.54867 10.1947 9.01967 10.588 9.413C10.9813 9.80633 11.452 10.002 12 10C12.548 9.998 13.019 9.80233 13.413 9.413Z" fill={color} />
    </svg>
  )
}

function SwapIcon({ color = '#1f5a44', size = 26 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <path d="M7 4L3 8l4 4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8h13a4 4 0 014 4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 20l4-4-4-4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 16H8a4 4 0 01-4-4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Circular "change / refresh" glyph — for the "Change your relay city" option card. */
function ChangeIcon({ color = '#b8821e', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <path d="M20 11.5a8 8 0 00-14-4.2M4 12.5a8 8 0 0014 4.2" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 3v4h-4M5.5 21v-4h4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Green calendar / clock glyphs for the sidebar event card (icons read green in the design). */
function CalGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[15px] shrink-0">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="#1f5a44" strokeWidth="1.3" />
      <path d="M2 6h12M5.5 1.5v3M10.5 1.5v3" stroke="#1f5a44" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
function ClockGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[15px] shrink-0">
      <circle cx="8" cy="8" r="6.2" stroke="#1f5a44" strokeWidth="1.3" />
      <path d="M8 4.8V8l2.2 1.4" stroke="#1f5a44" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── "What would you like to change?" sheet — dynamic options per reservation state ──

type ChangeOption = {
  key: string
  title: string
  desc: string
  to: string
  icon: React.ReactNode
  iconBg: string
  /** Which group(s) the destination screen should move. A reservation can have several
   *  independently-allocated groups (e.g. part of the family in the host city, another in a relay
   *  city). Groups that share the SAME allocation are merged into ONE option (so a family all in
   *  one city shows a single "Change your zone", not one card per person), hence a list of indices. */
  groupIndices: number[]
  /** True only for "Change your zone" (stay in the same city, pick a different zone) — the
   *  destination screen uses this to decide whether to pre-select the group's CURRENT city.
   *  "Change your relay city" / "Switch to a different city" also route to the same screen but
   *  must NOT default to the city the user is trying to move away from. */
  sameCity?: boolean
  /** Where the destination screen returns to (e.g. the zone card reuses the full Zone Selection
   *  screen, which needs to come back to Modify Reservation rather than Home). */
  returnTo?: string
  /** "Switch to a different city and zone" → the destination shows the combined same-day
   *  city+zone layout (Araz preferred cities on the left, current city+zone in the table). */
  modifyCityZone?: boolean
}

/** Centered modal on web / bottom sheet on mobile (shared BottomSheet). Shows only the
 *  modification options valid for the user's current confirmed reservation. */
function ChangeOptionsSheet({
  open, options, onSelect, onClose,
}: {
  open: boolean
  options: ChangeOption[]
  onSelect: (o: ChangeOption) => void
  onClose: () => void
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      header={(
        <div className="pr-[36px]">
          <h2 className="text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>What would you like to change?</h2>
          <p className="mt-[6px] text-[13.5px] leading-[19px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            Choose how you&apos;d like to update your reservation. Only the options applicable to your current reservation are shown.
          </p>
        </div>
      )}
    >
      <div className="flex flex-col gap-[10px] pt-[8px]">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o)}
            className="group flex w-full items-center gap-[14px] rounded-[14px] border border-[#e7dfc9] bg-white px-[14px] py-[13px] text-left transition-all duration-200 hover:border-[#c2a04e] hover:bg-[#fdfaf2] hover:shadow-[0_6px_18px_-10px_rgba(21,64,47,0.25)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/30"
          >
            <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[12px]" style={{ background: o.iconBg }}>{o.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }}>{o.title}</span>
              <span className="mt-[3px] block text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }}>{o.desc}</span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" className="size-[20px] shrink-0 text-[#a8843e] transition-transform duration-200 group-hover:translate-x-[2px]">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

// ── Entry chooser — the first thing shown when opening Modify Reservation ──────────
// A high-level "what do you want to modify or cancel?" popup that routes straight into
// the EXISTING flows (City → Switch city, Zone → Change zone, Registration → Cancel).
// It's purely an entry point: every downstream screen, validation, and cancel/request
// rule stays exactly as-is. Options shown depend on the reservation's phase — City +
// Registration once a city is allocated, plus Zone once a zone is confirmed too.
type EntryItem = { key: string; label: string; desc: string; icon: React.ReactNode; iconBg: string; danger?: boolean; onClick: () => void }
function ReservationEntrySheet({ open, items, onClose }: {
  open: boolean
  items: EntryItem[]
  onClose: () => void
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      header={(
        <div className="pr-[36px]">
          <h2 className="text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>What would you like to cancel?</h2>
          <p className="mt-[6px] text-[13.5px] leading-[19px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            Choose what you&apos;d like to cancel for this reservation.
          </p>
        </div>
      )}
    >
      <div className="flex flex-col gap-[10px] pt-[8px]">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            className={`group flex w-full items-center gap-[14px] rounded-[14px] border bg-white px-[14px] py-[13px] text-left transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 ${
              it.danger
                ? 'border-[#e7dfc9] hover:border-[#d98a85] hover:bg-[#fdf3f2] hover:shadow-[0_6px_18px_-10px_rgba(178,59,59,0.28)] focus-visible:ring-[#d98a85]/40'
                : 'border-[#e7dfc9] hover:border-[#c2a04e] hover:bg-[#fdfaf2] hover:shadow-[0_6px_18px_-10px_rgba(21,64,47,0.25)] focus-visible:ring-[#1f5a44]/30'
            }`}
          >
            <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[12px]" style={{ background: it.iconBg }}>{it.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }}>{it.label}</span>
              <span className="mt-[3px] block text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }}>{it.desc}</span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" className={`size-[20px] shrink-0 transition-transform duration-200 group-hover:translate-x-[2px] ${it.danger ? 'text-[#b23b3b]' : 'text-[#a8843e]'}`}>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

// ── Main component ───────────────────────────────────────────────────────────────

type Sheet = { type: 'city' | 'zone' | 'cancel'; member: FamilyMember }

/** One card's worth of a pending request: the members of a SINGLE group within it, plus a back-
 *  reference to the request they came from so cancelling can name the right one. See
 *  `requestSlices` for why a request is split at all. */
type RequestSlice = {
  key: string
  req: ChangeRequest
  rows: { id: string; name: string; fromLabel: string; toLabel: string }[]
  /** True when the parent request covers other groups too — the card says so, so cancelling reads
   *  as withdrawing these members rather than the whole request. */
  partOfLarger: boolean
}

/** A small uppercase section label — the lowest tier of the request card's text hierarchy. */
function CardEyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a8f7a] ${className}`} style={{ fontFamily: FONT }}>
      {children}
    </p>
  )
}

/** One member row inside a request card: initial avatar + name. */
function RequestMemberRow({ name }: { name: string }) {
  return (
    <li className="flex items-center gap-[10px]">
      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[#f3ecd9]">
        <span className="text-[11px] font-bold text-[#9a6a1e]" style={{ fontFamily: FONT }}>{initials(name)}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] leading-[19px] text-[#3d4a44]" style={{ fontFamily: FONT }}>{name}</span>
    </li>
  )
}

/** The `from → to` route line. `size` promotes it to the card's hero when there's a single origin. */
function RouteLine({ from, to, size }: { from: string; to: string; size: 'hero' | 'inline' }) {
  const hero = size === 'hero'
  return (
    <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
      <span
        className={hero ? 'text-[17px] leading-[24px] text-[#7c8a83]' : 'text-[13px] leading-[18px] text-[#7c8a83]'}
        style={{ fontFamily: hero ? SERIF : FONT }}
      >
        {from}
      </span>
      <svg viewBox="0 0 16 16" fill="none" className={`${hero ? 'size-[15px]' : 'size-[12px]'} shrink-0 self-center`} aria-hidden>
        <path d="M3 8h9M9 5l3 3-3 3" stroke="#c2a04e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span
        className={hero ? 'text-[22px] leading-[28px] text-[#15402f]' : 'text-[13px] font-bold leading-[18px] text-[#1f5a44]'}
        style={{ fontFamily: hero ? SERIF : FONT }}
      >
        {to}
      </span>
    </div>
  )
}

/**
 * One pending change-request card.
 *
 * Text hierarchy, strongest to weakest: the destination (serif, largest) → what kind of change +
 * status → who's affected → event/timestamp/cancel. The old card gave the title, the event, the
 * route and the member list near-identical weight, so nothing read first.
 *
 * ⚠️ Renders ONE SLICE of a request, not the whole thing — a merged request covering several
 * groups is split into one card per group (see `requestSlices`), so a member moving from a
 * different city can be withdrawn on his own. Cancel therefore cancels only THIS slice's members.
 * The route-grouping below still stands: a slice can in principle hold more than one route.
 */
function RequestCard({ slice, eventTitle, onCancel }: { slice: RequestSlice; eventTitle: string; onCancel: (reqId: string, memberIds: string[]) => void }) {
  const r = slice.req
  const rows = slice.rows
  const count = rows.length
  const memberWord = count === 1 ? 'member' : 'members'
  // Group members by their own from→to route, preserving first-seen order.
  const routes: { from: string; to: string; names: string[] }[] = []
  rows.forEach((m) => {
    const bucket = routes.find((b) => b.from === m.fromLabel && b.to === m.toLabel)
    if (bucket) bucket.names.push(m.name)
    else routes.push({ from: m.fromLabel, to: m.toLabel, names: [m.name] })
  })
  const singleRoute = routes.length <= 1
  const destinations = Array.from(new Set(routes.map((b) => b.to)))
  const origins = Array.from(new Set(routes.map((b) => b.from)))
  // One shared destination (only the origins differ) still has a headline worth leading with.
  const sharedDest = destinations.length === 1 ? destinations[0] : null
  const requestedOn = (() => {
    const d = new Date(r.requestedAt)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  })()

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#f0d9a8] bg-white shadow-[0_4px_18px_-12px_rgba(21,64,47,0.2)]">
      {/* ── Tier 3: what kind of change + live status ── */}
      <div className="flex items-center justify-between gap-[10px] border-b border-[#f5ecd8] px-[16px] py-[10px]">
        <CardEyebrow className="min-w-0 truncate">{r.title}</CardEyebrow>
        <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full bg-[#fdf1e2] px-[9px] py-[3px]">
          <svg viewBox="0 0 24 24" fill="none" className="size-[12px]" aria-hidden>
            <circle cx="12" cy="12" r="8.5" stroke="#b8821e" strokeWidth="2" />
            <path d="M12 7.5V12l3 1.8" stroke="#b8821e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px] font-bold text-[#9a6a1e]" style={{ fontFamily: FONT }}>Pending approval</span>
        </span>
      </div>

      <div className="px-[16px] pb-[14px] pt-[13px]">
        {/* ── Tier 1: the change itself ── */}
        {singleRoute ? (
          <RouteLine from={routes[0]?.from ?? r.fromLabel} to={routes[0]?.to ?? r.toLabel} size="hero" />
        ) : sharedDest ? (
          <>
            <CardEyebrow>Moving to</CardEyebrow>
            <p className="mt-[2px] text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>{sharedDest}</p>
          </>
        ) : (
          /* Genuinely different destinations — no single headline can be truthful, so the routes
             below carry it and the eyebrow just names what this block is. */
          <CardEyebrow>Requested changes</CardEyebrow>
        )}
        <p className={`${singleRoute || sharedDest ? 'mt-[5px]' : 'mt-[3px]'} text-[13px] leading-[18px] text-[#7c8a83]`} style={{ fontFamily: FONT }}>
          {count} {memberWord}
          {!singleRoute && (sharedDest ? <> · from {origins.length} cities</> : <> · {destinations.length} destinations</>)}
          <span className="px-[6px] text-[#cfc7b4]">|</span>
          {eventTitle}
        </p>

        {/* ── Tier 2: who's affected ── */}
        {singleRoute ? (
          <ul className="mt-[12px] flex flex-col gap-[8px] border-t border-[#f5ecd8] pt-[12px]">
            {routes[0]?.names.map((n) => <RequestMemberRow key={n} name={n} />)}
          </ul>
        ) : (
          /* Each route gets its own panel: it binds the members to the route they belong to, and
             the header row balances a short route line against its own member count instead of
             trailing off into dead space. */
          <div className="mt-[12px] flex flex-col gap-[10px] border-t border-[#f5ecd8] pt-[12px]">
            {routes.map((b) => (
              <div key={`${b.from}→${b.to}`} className="rounded-[12px] border border-[#f3e9d2] bg-white px-[12px] py-[10px]">
                <div className="flex items-center justify-between gap-[10px]">
                  <RouteLine from={b.from} to={b.to} size="inline" />
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a8f7a]" style={{ fontFamily: FONT }}>
                    {b.names.length} {b.names.length === 1 ? 'member' : 'members'}
                  </span>
                </div>
                <ul className="mt-[9px] flex flex-col gap-[8px] border-t border-[#f5efe0] pt-[9px]">
                  {b.names.map((n) => <RequestMemberRow key={n} name={n} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tier 4: provenance + the escape hatch ── */}
      <div className="flex items-center justify-between gap-[10px] border-t border-[#f2ead5] bg-white px-[16px] py-[10px]">
        <span className="min-w-0 text-[12px] leading-[16px] text-[#9a8f7a]" style={{ fontFamily: FONT }}>
          <span className="block truncate">{requestedOn ? `Requested ${requestedOn}` : 'Requested'}</span>
          {/* The card is one slice of a bigger request — say so, so "Cancel request" doesn't read
              as taking down the members shown on the OTHER cards too. */}
          {slice.partOfLarger && (
            <span className="block truncate">Cancels {count === 1 ? 'this member' : `these ${count} members`} only</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onCancel(r.id, rows.map((m) => m.id))}
          aria-label={`Cancel request for ${rows.map((m) => m.name).join(', ')}`}
          className="inline-flex h-[34px] shrink-0 items-center gap-[6px] rounded-full border border-[#e2bdb9] bg-white px-[14px] text-[13px] font-bold text-[#b23b3b] transition-colors hover:border-[#d98a85] hover:bg-[#fbeceb]"
          style={{ fontFamily: FONT }}
        >
          <svg viewBox="0 0 20 20" fill="none" className="size-[13px]"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          Cancel request
        </button>
      </div>
    </div>
  )
}

/** Modify Reservation entry point for pending change requests: heading + description + a SINGLE
 *  summary card. Tapping the card opens the full list in a popup. */
function RequestsSummaryCard({ count, onOpen, dense = false }: { count: number; onOpen: () => void; dense?: boolean }) {
  return (
    <div className="mb-[2px]">
      <h2 className={`text-[#15402f] ${dense ? 'text-[30px] leading-[36px]' : 'text-[22px] leading-[28px]'}`} style={{ fontFamily: SERIF }}>
        Requests in progress
      </h2>
      <p className={`mt-[8px] text-[#5a6660] ${dense ? 'max-w-[720px] text-[16px] leading-[23px]' : 'text-[14px] leading-[20px]'}`} style={{ fontFamily: FONT }}>
        These changes have been sent for approval. You can cancel a request while it&apos;s still under review.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-[16px] flex w-full max-w-[560px] items-center gap-[14px] rounded-[16px] border border-[#f0d9a8] bg-[#fffdf8] p-[16px] text-left shadow-[0_4px_18px_-12px_rgba(21,64,47,0.2)] transition-all duration-200 hover:border-[#c2a04e] hover:shadow-[0_8px_22px_-12px_rgba(21,64,47,0.28)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/25"
      >
        <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px] bg-[#fbeecb]">
          <svg viewBox="0 0 24 24" fill="none" className="size-[26px]">
            <circle cx="12" cy="12" r="8.5" stroke="#b8821e" strokeWidth="1.6" />
            <path d="M12 7.5V12l3 1.8" stroke="#b8821e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-[8px]">
            <p className="text-[16px] font-bold leading-[21px] text-[#23302a]" style={{ fontFamily: FONT }}>
              {count} pending {count === 1 ? 'request' : 'requests'}
            </p>
            <span className="inline-flex items-center gap-[5px] rounded-full bg-[#fdf1e2] px-[10px] py-[3px]">
              <span className="size-[6px] rounded-full bg-[#b8821e]" />
              <span className="text-[12px] font-bold text-[#9a6a1e]" style={{ fontFamily: FONT }}>Awaiting approval</span>
            </span>
          </div>
          <p className="mt-[3px] text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }}>
            Tap to view details or cancel a request.
          </p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" className="size-[22px] shrink-0 text-[#9a6a1e]"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className={`${dense ? 'mt-[30px]' : 'mt-[26px]'} border-t border-[#eee7d8]`} />
    </div>
  )
}

/** Popup listing all pending change requests, with a segmented filter (by action) + cancel per card. */
function RequestsPopup({
  open,
  onClose,
  slices,
  eventTitle,
  onCancel,
}: {
  open: boolean
  onClose: () => void
  slices: RequestSlice[]
  eventTitle: string
  onCancel: (reqId: string, memberIds: string[]) => void
}) {
  const [filter, setFilter] = useState<string>('all')
  // One chip per distinct request name so the user can pick out the exact request they made.
  const titles = Array.from(new Set(slices.map((s) => s.req.title)))
  const showChips = titles.length > 1
  const activeFilter = titles.includes(filter) ? filter : 'all'
  const visible = activeFilter === 'all' ? slices : slices.filter((s) => s.req.title === activeFilter)
  const countOf = (t: string) => (t === 'all' ? slices.length : slices.filter((s) => s.req.title === t).length)
  const chips = ['all', ...titles]
  return (
    <BottomSheet open={open} onClose={onClose} title="Requests in progress" wide>
      {showChips && (
        <div className="mb-[4px] flex gap-[8px] overflow-x-auto pb-[4px] no-scrollbar">
          {chips.map((c) => {
            const active = activeFilter === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={`flex h-[34px] shrink-0 items-center gap-[7px] rounded-full px-[14px] text-[13px] font-bold transition-colors ${active ? 'bg-[#1f5a44] text-white' : 'border border-[#e7dfc9] bg-white text-[#5a6660] hover:border-[#c2a04e]'}`}
                style={{ fontFamily: FONT }}
              >
                <span className="whitespace-nowrap">{c === 'all' ? 'All' : c}</span>
                <span className={`flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-[5px] text-[11px] ${active ? 'bg-white/20 text-white' : 'bg-[#f3ecd9] text-[#9a6a1e]'}`}>{countOf(c)}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-col gap-[12px] pt-[10px]">
        {visible.map((s) => (
          <RequestCard key={s.key} slice={s} eventTitle={eventTitle} onCancel={onCancel} />
        ))}
      </div>
    </BottomSheet>
  )
}

export default function ManageReservations() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // Read THIS event's journey (active or archived) so the screen always reflects the reservation
  // named in the URL — never whichever event happened to be active when the page mounted.
  const flow = useStore((s) => journeyFor(s.flow, s.registrations, id ?? ''))
  const resetFlow = useStore((s) => s.resetFlow)
  const cancelRegistrantCity = useStore((s) => s.cancelRegistrantCity)
  const cancelRegistrantZone = useStore((s) => s.cancelRegistrantZone)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const cancelChangeRequestMembers = useStore((s) => s.cancelChangeRequestMembers)
  // Pending city/zone change requests for THIS reservation (awaiting admin approval).
  const pendingRequests = flow.changeRequests ?? []
  // Managing an event that isn't the active journey (tapped "Modify" on a Home Registered card while
  // another event was being edited) makes this event's journey active, so cancel/transfer act on it.
  useEffect(() => { if (id) setActiveMiqaat(id) }, [id, setActiveMiqaat])

  const miqaat = miqaats.find((m) => m.id === id) ?? miqaats.find((m) => m.id === 'eg-cityopen')!
  // Demo Progression Controls (ashara-1448 only): "Edit registration" stays offered through
  // reg_closed too — registration is done, but city selection hasn't opened yet, so there's nothing
  // else to change here and editing details is still safe. Once city selection has demo-opened (or
  // later), the reservation is being actively allocated and editable details are no longer offered.
  const demoPhase = useStore((s) => s.stageOverrides[miqaat.id])
  const showEditRegistration = miqaat.id === 'ashara-1448' && (!demoPhase || demoPhase === 'reg_open' || demoPhase === 'reg_closed')
  // The registrant's own group is always index '0' (CitySelection, HostCityMove's handleConfirmed,
  // and this screen all build groups from the SAME flow.selectedMemberIds basis). Once a Modify
  // Reservation switch has run, `flow.groupCities['0']` is the up-to-date allocation — `confirmedCity`
  // is only ever written by the original City Selection flow and goes stale the moment a switch
  // changes the city without it (that staleness was showing the OLD city name here, and made
  // hostConfirmed/relayConfirmed both true at once — see below).
  const registrantCity = flow.groupCities['0'] ?? flow.confirmedCity ?? null
  const cityName = registrantCity?.name ?? 'Colombo'
  // The registrant's own zone (group '0'), mirroring registrantCity — drives the cancel-zone option.
  const registrantZone = flow.groupZones['0'] ?? flow.confirmedZone ?? null
  const zoneName = registrantZone?.name ?? ''

  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set())
  const [assignTarget, setAssignTarget] = useState<FamilyMember | null>(null)
  const [guardianFor, setGuardianFor] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [result, setResult] = useState<{ title: string; subtext: string } | null>(null)
  // Returning from the "Edit registration" flow (Add People → Review → success → Post Registration
  // Details → here) surfaces a one-shot success popup, then clears the router state so a refresh or
  // back-navigation doesn't replay it.
  useEffect(() => {
    const st = location.state as { registrationEdited?: boolean; cityZoneUpdated?: boolean; requestSent?: string } | null
    if (st?.registrationEdited) {
      setResult({ title: 'Registration updated', subtext: 'Your registration details have been saved successfully.' })
      nav(location.pathname, { replace: true, state: {} })
    } else if (st?.cityZoneUpdated) {
      setResult({ title: 'Reservation updated', subtext: 'Your city and zone allocation has been updated successfully.' })
      nav(location.pathname, { replace: true, state: {} })
    } else if (st?.requestSent) {
      // City Selection's modify-city-zone flow, once Raza is issued, submits a pending request instead
      // of applying immediately (see CitySelection.tsx isRequest) — it returns here (returnTo) with this
      // message, which otherwise had nowhere to surface (only the detail page / Home read `requestSent`).
      setResult({ title: 'Request submitted', subtext: st.requestSent })
      nav(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Transfer of the linked dependent to a staying guardian; 'pending' = awaiting their acceptance.
  const [transferState, setTransferState] = useState<'none' | 'pending' | 'transferred'>('none')
  const [transferGuardianId, setTransferGuardianId] = useState<string | null>(null)
  // Cancel popups: blocked (reservation is linked / awaiting acceptance) vs the normal confirmation.
  const [showCancelBlocked, setShowCancelBlocked] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // The logged-in registrant.
  const registrant = family.find((f) => f.role === 'registrant') ?? family[0]

  // The registered group persists from registration (Add People → Invite → Review) via the store.
  const selectedIds = flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)

  // Dependents that are part of THIS reservation and are linked to the registrant (the registrant
  // guards/cares for them). A reservation is "linked" while it still carries such a dependent
  // (incl. while a transfer is pending acceptance) → the registrant can't cancel until it's resolved.
  const linkedDependents = family.filter(
    (f) => selectedIds.includes(f.id) && (flow.guardians[f.id] === registrant.id || flow.caregivers[f.id] === registrant.id),
  )
  const cancelDep = linkedDependents[0] ?? null
  // `isLinked` drives whether the "Linked to your reservation" card shows. Cancellation is blocked
  // only while the dependent is still linked AND the transfer hasn't completed — once transferred,
  // the registrant is free to cancel (the card stays, showing the completed transfer).
  const isLinked = linkedDependents.length > 0
  const cancelBlocked = isLinked && transferState !== 'transferred'
  const transferGuardianMember = transferGuardianId ? family.find((f) => f.id === transferGuardianId) ?? null : null
  const transferGuardianName = transferGuardianMember?.name ?? null
  // Once the transfer completes, the linked card leads with the new guardian (badged 'guardian')
  // instead of the registrant — the dependent now reserves together with that person.
  const linkedPrimary = transferState === 'transferred' && transferGuardianMember ? transferGuardianMember : registrant
  const linkedPrimaryBadge: BadgeKind = transferState === 'transferred' ? 'guardian' : 'registrant'
  // Relay = city only (no zone); Host = city + zone. registrantCity/hostConfirmed/relayConfirmed
  // describe the REGISTRANT'S OWN group only (index 0) — used for the summary card above. They
  // deliberately do NOT decide what's changeable below: a reservation can have SEVERAL
  // independently-allocated groups (e.g. one part of the family in the host city, another in a
  // relay city), so "what can I change" is computed per group, not once for the whole page.
  const relayConfirmed = registrantCity?.type === 'relay'
  const hostConfirmed = registrantCity?.type === 'host'
  const zoneConfirmed = !!flow.confirmedZone || Object.keys(flow.groupZones).length > 0

  // Raw, unfiltered groups — index-aligned with flow.groupCities/flow.groupZones, which City
  // Selection and HostCityMove's handleConfirmed both key by this SAME buildAllGroups position.
  // (The `groups` computed further below additionally drops cancelled members and re-compacts the
  // array, which would shift indices — fine for display, wrong for these lookups.)
  const rawGroups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, flow.invites)

  /** A member's CURRENT allocation, formatted the way `ChangeRequest.fromLabel` is.
   *
   *  Used to repair LEGACY requests only — those raised before `ChangeRequest.members` existed,
   *  which stored a single representative origin that misreports every member outside the first
   *  group (a member sitting in Colombo showing as "Delhi → …"). A pending request never alters the
   *  allocation until it's approved, so a member's current city IS that request's origin, making
   *  this a faithful reconstruction rather than a guess. Keyed by the same `buildAllGroups` position
   *  `flow.groupCities`/`groupZones` use. Returns null when there's nothing to resolve, so the card
   *  falls back to the stored label instead of inventing one. */
  const originFor = (memberId: string, kind: 'city' | 'zone'): string | null => {
    const gi = rawGroups.findIndex((g) => g.members.some((mm) => mm.member.id === memberId))
    if (gi < 0) return null
    const city = flow.groupCities[gi] ?? (gi === 0 && flow.confirmedCity ? { name: flow.confirmedCity.name } : null)
    if (!city) return null
    if (kind === 'city') return city.name
    const zone = flow.groupZones[gi] ?? (gi === 0 && flow.confirmedZone ? { name: flow.confirmedZone.name } : null)
    return zone ? `${city.name} - ${zone.name}` : city.name
  }

  /** Split each pending request into ONE CARD PER GROUP.
   *
   *  A merged "Switch to a different city · 3 members" request can cover several independent groups
   *  (a guardian + dependent from Delhi, plus a lone member from Colombo). Rendering it as a single
   *  card left the user no way to withdraw just one of them — the only control was a Cancel that
   *  took the whole request down. Splitting by group gives each its own card and its own Cancel.
   *
   *  The GROUP is the smallest safe unit: a guardian and their dependent reserve together and must
   *  never be separated, which is exactly what `buildAllGroups` already encodes. Members whose
   *  group can't be resolved fall back to bucketing by route, so nothing is ever dropped. */
  const requestSlices: RequestSlice[] = pendingRequests.flatMap((r) => {
    // Legacy requests (no `members`) get their origins resolved from the live allocation — see
    // `originFor`. `memberIds`/`memberNames` are parallel arrays, both built from the same
    // `movedMembers.map` in `HostCityMove.handleConfirmed`.
    const rows = r.members ?? r.memberNames.map((name, i) => ({
      id: r.memberIds[i],
      name,
      fromLabel: originFor(r.memberIds[i], r.kind) ?? r.fromLabel,
      toLabel: r.toLabel,
    }))
    const buckets: { key: string; rows: RequestSlice['rows'] }[] = []
    rows.forEach((m) => {
      const gi = rawGroups.findIndex((g) => g.members.some((mm) => mm.member.id === m.id))
      const key = gi >= 0 ? `g${gi}` : `${m.fromLabel}→${m.toLabel}`
      const bucket = buckets.find((b) => b.key === key)
      if (bucket) bucket.rows.push(m)
      else buckets.push({ key, rows: [m] })
    })
    return buckets.map((b) => ({ key: `${r.id}:${b.key}`, req: r, rows: b.rows, partOfLarger: buckets.length > 1 }))
  })

  // ── "What would you like to change?" options — one set per DISTINCT allocation, not per group.
  //    Groups that share the same city+zone (e.g. a family all auto-allocated to Colombo / Zone A)
  //    collapse into a single option covering all of them, so the list isn't a wall of identical
  //    "Change your zone · 1 member" cards. A genuinely split reservation (part host, part relay)
  //    still yields one option set per allocation. A group with no city yet has nothing to change.
  //    Per allocation: host → Switch to Relay [+ Change Zone once it has a zone]; relay → Change
  //    Relay City + Switch to Host City. Each option is suffixed with the combined member count. ──
  const [showChangePopup, setShowChangePopup] = useState(false)
  // Cancel chooser (City / Registration) — no longer auto-opens on mount; it's opened only by the
  // "Cancel my reservation" button. City → the cancel-city confirmation below; Registration → the
  // existing cancel-registration flow.
  const [showEntryChooser, setShowEntryChooser] = useState(false)
  // "Cancel your city selection?" confirmation → resetCityZone + success popup.
  const [showCancelCity, setShowCancelCity] = useState(false)
  const [showCancelZone, setShowCancelZone] = useState(false)
  // Pending-requests popup (opened from the single summary card). Auto-closes once none remain.
  const [showRequests, setShowRequests] = useState(false)
  useEffect(() => { if (pendingRequests.length === 0) setShowRequests(false) }, [pendingRequests.length])
  // Merge groups by their current allocation signature (city type + city id + zone id). Preserves
  // first-seen order and accumulates the member count + the list of group indices to move.
  type AllocBucket = { alloc: GroupCityAlloc; zoneConfirmed: boolean; members: number; groupIndices: number[] }
  const buckets: AllocBucket[] = []
  const bucketBySig = new Map<string, AllocBucket>()
  rawGroups.forEach((g, gi) => {
    const alloc = flow.groupCities[gi]
    if (!alloc) return // this group hasn't picked a city yet → nothing to change yet
    const zoneId = flow.groupZones[gi]?.id ?? ''
    const sig = `${alloc.type}:${alloc.id}:${zoneId}`
    let b = bucketBySig.get(sig)
    if (!b) { b = { alloc, zoneConfirmed: !!flow.groupZones[gi], members: 0, groupIndices: [] }; bucketBySig.set(sig, b); buckets.push(b) }
    b.members += g.members.length
    b.groupIndices.push(gi)
  })
  // Descriptions are ZONE-AWARE: a zone step is only mentioned (and only appears in the next screen)
  // when that allocation actually has a zone. Without one, switching/changing is city-only.
  // Two buckets can render an identical-looking card (same title — e.g. two different relay
  // allocations that both happen to have the same member count) — merged by title below so the
  // list never shows two cards a user can't tell apart; the merged card still moves every group
  // behind either bucket.
  const changeOptionsByTitle = new Map<string, ChangeOption>()
  const changeOptions: ChangeOption[] = []
  const addOption = (o: ChangeOption) => {
    const existing = changeOptionsByTitle.get(o.title)
    if (existing) { existing.groupIndices = [...existing.groupIndices, ...o.groupIndices]; return }
    changeOptionsByTitle.set(o.title, o)
    changeOptions.push(o)
  }
  // Accumulated across every bucket (host AND relay) — folded into ONE merged "Switch to a different
  // city and zone" option below, so a party split across a host city and relay cities shows a single
  // switch card, not one per allocation type. Relay indices are listed first (see the concat below) so
  // the destination screen's single representative `groupIndex` stays relay-typed when a mix exists —
  // keeping `showHostOption` true there so the Host City remains a pickable destination.
  // ⚠️ Only buckets that already have a CONFIRMED zone go here — switching their city invalidates that
  // zone, so the combined city+zone picker is genuinely needed. A bucket with no zone yet has nothing
  // zone-related to also change; it falls into the plain city-only accumulator below instead.
  let switchMembers = 0
  let relaySwitchGroupIndices: number[] = []
  let hostSwitchGroupIndices: number[] = []
  // Plain "Switch to a different city" (no zone involved) — for buckets that haven't picked a zone
  // yet, e.g. a party still waiting on a separate zone-selection phase. Routes to the dedicated,
  // phase-aware HostCityMove screen (Switch when city selection is open, Request when closed) instead
  // of forcing the combined city+zone picker.
  let citySwitchMembers = 0
  let relayCitySwitchGroupIndices: number[] = []
  let hostCitySwitchGroupIndices: number[] = []
  // Zone-change is a SINGLE card too — the Zone Selection screen it opens already shows every
  // allocated city and its zones at once, so a party split across cities picks any member's zone
  // there. Accumulating (instead of one card per city) avoids "Change your zone · Colombo" +
  // "Change your zone · Kolkata" showing as two near-identical cards.
  let zoneChangeMembers = 0
  const zoneChangeGroupIndices: number[] = []
  buckets.forEach((b) => {
    const { alloc, zoneConfirmed, members, groupIndices } = b
    if (zoneConfirmed) {
      // Can change just the zone (host city stays fixed; a relay allocation keeps its city) — folds
      // into the zone card below — AND can switch city+zone together via the combined switch card.
      zoneChangeMembers += members; zoneChangeGroupIndices.push(...groupIndices)
      switchMembers += members
      if (alloc.type === 'host') hostSwitchGroupIndices.push(...groupIndices)
      else relaySwitchGroupIndices.push(...groupIndices)
    } else {
      // No zone yet — city-only switch.
      citySwitchMembers += members
      if (alloc.type === 'host') hostCitySwitchGroupIndices.push(...groupIndices)
      else relayCitySwitchGroupIndices.push(...groupIndices)
    }
  })
  // ONE "Switch to a different zone" card covering every zone-allocated member, routed to the full
  // Zone Selection screen (which handles all cities/zones itself).
  if (zoneChangeGroupIndices.length > 0) {
    const suffix = ` · ${zoneChangeMembers} member${zoneChangeMembers > 1 ? 's' : ''}`
    addOption({
      key: 'switch-different-zone',
      title: `Switch to a different zone${suffix}`,
      desc: 'Pick a different zone for your allocated members.',
      to: `/miqaats/${id}/zone`,
      icon: <PinIcon color="#2e6a7d" size={22} />, iconBg: '#eef1ef',
      groupIndices: zoneChangeGroupIndices,
      sameCity: true,
      returnTo: `/miqaats/${id}/manage`,
    })
  }
  // Relay first, then host — so `groupIndices[0]` on the destination screen is relay-typed whenever
  // the party includes any relay members (keeps the Host City offered as a destination there).
  const switchGroupIndices = [...relaySwitchGroupIndices, ...hostSwitchGroupIndices]
  if (switchGroupIndices.length > 0) {
    const suffix = ` · ${switchMembers} member${switchMembers > 1 ? 's' : ''}`
    addOption({
      key: 'switch-different-city-zone',
      title: `Switch to a different city and zone${suffix}`,
      desc: 'Move to a different city and pick a zone there.',
      to: `/miqaats/${id}/city`,
      icon: <SwapIcon color="#b8821e" size={24} />, iconBg: '#f3ecd9',
      groupIndices: switchGroupIndices,
      modifyCityZone: true,
      returnTo: `/miqaats/${id}/manage`,
    })
  }
  // Plain city-only switch — no zone confirmed yet, so nothing zone-related to also change. Routes to
  // the dedicated HostCityMove screen (phase-aware: "Switch" while city selection is open, "Request"
  // once it's closed), mirroring how this card behaved before it was folded into the combined flow.
  const citySwitchGroupIndices = [...relayCitySwitchGroupIndices, ...hostCitySwitchGroupIndices]
  if (citySwitchGroupIndices.length > 0) {
    const suffix = ` · ${citySwitchMembers} member${citySwitchMembers > 1 ? 's' : ''}`
    addOption({
      key: 'switch-different-city',
      title: `Switch to a different city${suffix}`,
      desc: 'Move to a different city.',
      to: `/miqaats/${id}/manage/relay`,
      icon: <SwapIcon color="#b8821e" size={24} />, iconBg: '#f3ecd9',
      groupIndices: citySwitchGroupIndices,
    })
  }
  // Entry-chooser routing targets — the existing change options the popup dispatches into.
  // City exists once any city is allocated (the merged switch card); Zone only once a zone is
  // confirmed (which is also what splits the "City / Registration" vs "City / Zone / Registration"
  // phases). Both reuse the exact options/nav-state already built above — no new flow logic.
  const cityChangeOption = changeOptions.find((o) => o.title.startsWith('Switch to a different city')) ?? null

  const groups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, flow.invites)
    .map((g) => ({
      ...g,
      label: g.label?.replace('registered together', 'reserved together'),
      members: g.members.filter((mm) => !cancelledIds.has(mm.member.id)),
    }))
    .filter((g) => g.members.length > 0)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  // Linked (or awaiting transfer acceptance) → cancellation is blocked with an explainer popup.
  // Otherwise the normal confirmation popup → success popup runs.
  function handleCancelClick() {
    if (cancelBlocked) setShowCancelBlocked(true)
    else setShowCancelConfirm(true)
  }

  // Normal cancel (no linked member) — confirm → clear the reservation (the event becomes
  // registerable again) → go Home, where the success popup is shown (not on this screen).
  function handleConfirmCancel() {
    setShowCancelConfirm(false)
    resetFlow()
    nav('/miqaats', { state: { reservationCancelled: true } })
  }

  // "Cancel my city" — cancels ONLY the registrant's own group's city/zone (other members keep
  // theirs; the registration itself stays), then surfaces the success popup on this screen.
  function handleConfirmCancelCity() {
    setShowCancelCity(false)
    cancelRegistrantCity()
    setResult({ title: 'City selection cancelled', subtext: `Your city selection for ${miqaat.title} has been cancelled. Your registration is unchanged.` })
  }

  // "Cancel my zone" — clears ONLY the registrant's own zone (city kept), then the success popup.
  function handleConfirmCancelZone() {
    setShowCancelZone(false)
    cancelRegistrantZone()
    setResult({ title: 'Zone selection cancelled', subtext: `Your zone selection for ${miqaat.title} has been cancelled. You stay in ${cityName} and your registration is unchanged.` })
  }

  // Sidebar summary flag + the "city opens on …" label for the empty state. The open label is
  // lifted from the miqaat's deadlineLabel ("City opens in <date> - <time>") and reformatted to
  // "<date> at <time>"; a graceful fallback keeps the empty state readable for any seed.
  const cityAllocated = hostConfirmed || relayConfirmed
  const cityOpenMatch = miqaat.deadlineLabel.match(/opens?\s+(?:in|on)\s+(.+)$/i)
  const cityOpenLabel = (cityOpenMatch ? cityOpenMatch[1] : 'Thu, 19 Jun 2026 - 09:00 AM IST').replace(' - ', ' at ')

  // Transfer the linked dependent to a staying guardian → card moves to "Acceptance Pending".
  function handleTransferAssigned(gid: string) {
    if (cancelDep) setGuardianFor((prev) => ({ ...prev, [cancelDep.id]: gid }))
    setTransferGuardianId(gid)
    setTransferState('pending')
    setAssignTarget(null)
    showToast(`Transfer request sent to ${cancelDep ? firstNameOf(cancelDep.name) : 'the member'}`)
  }

  return (
    <>
      <PhoneScreen statusTone="light">
        <AppBar notificationCount={3} />

        {/* ═══════════════════════ MOBILE — single column (unchanged) ═══════════════════════ */}
        <div className="sm:hidden">
        <div className="ml-[16px] sm:ml-0 mt-[12px]">
          <Breadcrumb
            items={[{ label: 'Home', to: '/miqaats' }, { label: 'Modify Reservation' }]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
        </div>

        <h1 className="mt-[14px] px-[16px] sm:px-0 text-[26px] leading-[32px] text-[#15402f]" style={{ fontFamily: SERIF }}>
          Modify Reservation
        </h1>

        {/* Registrant — usability testing found users landing on this screen immediately look for
            "whose reservation is this", but the only place their name showed was buried inside
            "Linked to your reservation" (which doesn't render at all without a linked dependent).
            Shown right under the heading instead, so it's the first thing on the screen. */}
        <div className="mx-[16px] sm:mx-0 mt-[16px] flex max-w-[600px] items-center gap-[12px] rounded-[14px] border border-[#ece4d2] bg-white p-[14px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.12)]">
          <Avatar name={registrant.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }}>{registrant.name}</p>
            <p className="mt-[2px] text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }}>{familyMeta(registrant.relation, registrant.age, registrant.its)}</p>
          </div>
          <RoleBadge kind="registrant" />
        </div>

        {/* Miqaat summary card */}
        <div className="mx-[16px] sm:mx-0 mt-[16px] rounded-[16px] border border-[#ece4d2] bg-white p-[14px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.12)]">
          <div className="flex gap-[12px]">
            <img src={CARD_BG} alt="" className="size-[64px] shrink-0 rounded-[12px] object-cover" />
            <div className="min-w-0 flex-1 pt-[2px]">
              <h2 className="text-[19px] leading-[24px] text-[#23302a]" style={{ fontFamily: SERIF }}>{miqaat.title}</h2>
              <div className="mt-[6px] flex items-center gap-[6px]">
                <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0">
                  <rect x="2" y="3" width="12" height="11" rx="2" stroke="#8a938e" strokeWidth="1.2" />
                  <path d="M2 6h12M5.5 1.5v3M10.5 1.5v3" stroke="#8a938e" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }}>{miqaat.dateLabel}</span>
              </div>
              <div className="mt-[4px] flex items-center gap-[6px]">
                <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0">
                  <circle cx="8" cy="8" r="6.2" stroke="#8a938e" strokeWidth="1.2" />
                  <path d="M8 4.8V8l2.2 1.4" stroke="#8a938e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[13px] text-[#5a6660]" style={{ fontFamily: FONT }}>{miqaat.timeLabel}</span>
              </div>
            </div>
          </div>

          <div className="mt-[14px] flex items-center justify-between rounded-[10px] px-[12px] py-[11px]" style={{ background: '#eaf3ee' }}>
            <span className="flex items-center gap-[8px]">
              <span className="flex size-[24px] items-center justify-center rounded-full bg-[#1f5a44]">
                <LandmarkIcon color="#ffffff" size={13} />
              </span>
              <span className="text-[13px] text-[#3d3d3a]" style={{ fontFamily: FONT, fontWeight: 500 }}>{hostConfirmed || relayConfirmed ? 'City allocated' : 'City'}</span>
            </span>
            <span className="text-[14px] font-bold" style={{ fontFamily: FONT, color: hostConfirmed || relayConfirmed ? '#1f5a44' : '#8a938e' }}>{hostConfirmed || relayConfirmed ? cityName : 'Not allocated'}</span>
          </div>

          <RazaStatusCard
            issued={flow.razaIssued}
            onView={() => { setActiveMiqaat(id ?? ''); nav(`/miqaats/${id}/raza-letter`) }}
            className="mt-[8px]"
          />
        </div>

        {/* Linked to your reservation — approved group card (content-width, not full-bleed).
            Shown only when the reservation actually carries a linked dependent. */}
        {isLinked && (
          <>
            <h2 className="mt-[26px] px-[16px] sm:px-0 text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>
              Linked to your reservation
            </h2>
            <div className="mx-[16px] sm:mx-0 mt-[14px] max-w-[600px]">
              <LinkedReservationCard
                primary={linkedPrimary}
                registrant={registrant}
                primaryBadge={linkedPrimaryBadge}
                dependents={linkedDependents}
                transferState={transferState}
                transferGuardianName={transferGuardianName}
                onTransfer={() => cancelDep && setAssignTarget(cancelDep)}
                onCancelTransfer={() => { setTransferState('none'); setTransferGuardianId(null) }}
              />
            </div>
          </>
        )}

        {/* Pending change requests (awaiting admin approval) — shown above the options */}
        {pendingRequests.length > 0 && (
          <div className="mx-[16px] sm:mx-0 mt-[26px]">
            <RequestsSummaryCard count={requestSlices.length} onOpen={() => setShowRequests(true)} />
          </div>
        )}

        {/* What would you like to do? */}
        <h2 className="mt-[26px] px-[16px] sm:px-0 text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: SERIF }}>
          What would you like to do?
        </h2>
        {/* Edit registration — Ashara Mubaraka 1448H only (demo flow): jumps to Add People,
            then on to City Selection instead of the pre-submit Review screen. Demo Progression
            Controls: only offered while registration is still open (see showEditRegistration). */}
        {showEditRegistration && (
          <div className="mx-[16px] sm:mx-0 mt-[14px] max-w-[560px]">
            <button
              type="button"
              onClick={() => nav(`/miqaats/${id}/people`, { state: { fromModify: true } })}
              className="group flex w-full items-center gap-[14px] rounded-[16px] border border-[#e7dfc9] bg-white p-[16px] text-left shadow-[0_4px_18px_-12px_rgba(21,64,47,0.2)] transition-all duration-200 hover:border-[#c2a04e] hover:shadow-[0_8px_22px_-12px_rgba(21,64,47,0.28)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/25"
            >
              <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px]" style={{ background: '#e8f2ec' }}>
                <EditPeopleIcon color="#1f5a44" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold leading-[21px] text-[#23302a]" style={{ fontFamily: FONT }}>Edit registration</span>
                <span className="mt-[3px] block text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT }}>Update your family members, guardians, and other details.</span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" className="size-[20px] shrink-0 text-[#a8843e] transition-transform duration-200 group-hover:translate-x-[2px]">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
        <div data-tour="modify-options" className={`mx-[16px] sm:mx-0 mt-[14px] mb-[28px] grid gap-[12px] sm:max-w-[460px] ${changeOptions.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {changeOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowChangePopup(true)}
              className="flex flex-col items-center gap-[14px] rounded-[16px] border border-[#e7dfc9] bg-white px-[14px] py-[24px] text-center transition-all duration-200 hover:border-[#c2a04e] hover:shadow-[0_8px_22px_-12px_rgba(21,64,47,0.28)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/25"
            >
              <span className="flex size-[52px] items-center justify-center rounded-[14px]" style={{ background: '#f3ecd9' }}>
                <SwapIcon color="#b8821e" size={28} />
              </span>
              <span className="text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }}>Change reservation</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowEntryChooser(true)}
            className="flex flex-col items-center gap-[14px] rounded-[16px] border border-[#e7dfc9] bg-white px-[14px] py-[24px] text-center transition-all duration-200 hover:border-[#d98a85] hover:shadow-[0_8px_22px_-12px_rgba(178,59,59,0.28)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d98a85]/40"
          >
            <span className="flex size-[52px] items-center justify-center rounded-[14px]" style={{ background: '#fbeceb' }}>
              <CancelIcon size={26} />
            </span>
            <span className="text-[16px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: FONT }}>Cancel my reservation</span>
          </button>
        </div>
        </div>{/* ── end mobile ── */}

        {/* ═══════════════════════ DESKTOP — two-panel (cream sidebar + white panel) ═══════════════════════ */}
        <div className="hidden sm:block sm-full-bleed">
          <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">

            {/* ───── LEFT sidebar ───── */}
            <aside className="flex w-[40%] max-w-[600px] shrink-0 flex-col overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[28px] pl-[var(--content-px)] pr-[30px]">
              <Breadcrumb
                items={[{ label: 'Home', to: '/miqaats' }, { label: 'Modify Reservation' }]}
                onNavigate={(to) => nav(to)}
                onBack={() => nav(-1)}
                activeColor="#a8843e"
                dense
              />

              <h1 className="mt-[16px] text-[38px] leading-[44px] text-[#26332c]" style={{ fontFamily: SERIF }}>
                Modify Reservation
              </h1>

              {/* Registrant identity card — compact horizontal row (avatar left, name/meta right) */}
              <div className="mt-[22px] flex items-center gap-[14px] rounded-[18px] border border-[#eae2d1] bg-white px-[18px] py-[16px] shadow-[0px_6px_22px_-10px_rgba(21,64,47,0.12)]">
                <Avatar name={registrant.name} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-bold leading-[23px] text-[#23302a]" style={{ fontFamily: FONT }}>{registrant.name}</p>
                  <p className="mt-[3px] text-[14px] text-[#5a6660]" style={{ fontFamily: FONT }}>
                    {registrant.gender} · Age {registrant.age} · ITS {registrant.its}
                  </p>
                </div>
              </div>

              {/* Event summary card */}
              <div className="mt-[18px] rounded-[18px] border border-[#eae2d1] bg-white p-[16px] shadow-[0px_6px_22px_-10px_rgba(21,64,47,0.12)]">
                <div className="flex gap-[14px]">
                  <img src={miqaat.image ?? CARD_BG} alt="" className="size-[86px] shrink-0 rounded-[14px] object-cover" />
                  <div className="min-w-0 flex-1 pt-[2px]">
                    <h2 className="text-[21px] leading-[26px] text-[#23302a]" style={{ fontFamily: SERIF }}>{miqaat.title}</h2>
                    <div className="mt-[8px] flex items-center gap-[7px]">
                      <CalGlyph />
                      <span className="text-[14px] text-[#5a6660]" style={{ fontFamily: FONT }}>{miqaat.dateLabel}</span>
                    </div>
                    <div className="mt-[5px] flex items-center gap-[7px]">
                      <ClockGlyph />
                      <span className="text-[14px] text-[#5a6660]" style={{ fontFamily: FONT }}>{miqaat.timeLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-[16px] flex items-center justify-between rounded-[12px] px-[14px] py-[13px]" style={{ background: '#e8f2ec' }}>
                  <span className="flex items-center gap-[9px]">
                    <span className="flex size-[26px] items-center justify-center rounded-full bg-[#1f5a44]">
                      <LandmarkIcon color="#ffffff" size={14} />
                    </span>
                    <span className="text-[14px] text-[#3d3d3a]" style={{ fontFamily: FONT, fontWeight: 500 }}>{cityAllocated ? 'City allocated' : 'City'}</span>
                  </span>
                  <span className="text-[15px] font-bold" style={{ fontFamily: FONT, color: cityAllocated ? '#1f5a44' : '#8a938e' }}>{cityAllocated ? cityName : 'Not allocated'}</span>
                </div>

                <RazaStatusCard
                  issued={flow.razaIssued}
                  onView={() => { setActiveMiqaat(id ?? ''); nav(`/miqaats/${id}/raza-letter`) }}
                  className="mt-[10px]"
                />
              </div>

              {/* Cancel my reservation */}
              <button
                type="button"
                onClick={() => setShowEntryChooser(true)}
                className="mt-[18px] flex items-center gap-[14px] rounded-[18px] border border-[#eae2d1] bg-white p-[16px] text-left shadow-[0px_6px_22px_-10px_rgba(21,64,47,0.12)] transition-colors hover:border-[#e4b9b3] hover:bg-[#fdf7f6]"
              >
                <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[13px] bg-[#fbeceb]">
                  <CancelIcon size={22} />
                </span>
                <span className="text-[17px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>Cancel my reservation</span>
              </button>
            </aside>

            {/* ───── RIGHT panel ───── */}
            <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
              <div className="min-h-0 flex-1 overflow-y-auto py-[34px] pl-[40px] pr-[var(--content-px)]">

                {/* Linked to your reservation */}
                {isLinked && (
                  <>
                    <h2 className="text-[30px] leading-[36px] text-[#15402f]" style={{ fontFamily: SERIF }}>
                      Linked to your reservation
                    </h2>
                    <div className="mt-[16px] max-w-[620px]">
                      <LinkedReservationCard
                        primary={linkedPrimary}
                        registrant={registrant}
                        primaryBadge={linkedPrimaryBadge}
                        dependents={linkedDependents}
                        transferState={transferState}
                        transferGuardianName={transferGuardianName}
                        onTransfer={() => cancelDep && setAssignTarget(cancelDep)}
                        onCancelTransfer={() => { setTransferState('none'); setTransferGuardianId(null) }}
                      />
                    </div>
                  </>
                )}

                {/* Pending change requests (awaiting admin approval) — above the options */}
                {pendingRequests.length > 0 && (
                  <>
                    {isLinked && <div className="my-[30px] border-t border-[#eee7d8]" />}
                    <RequestsSummaryCard dense count={requestSlices.length} onOpen={() => setShowRequests(true)} />
                  </>
                )}

                {/* What would you like to do? — inline option cards */}
                {(changeOptions.length > 0 || showEditRegistration) && (
                  <>
                    {isLinked && pendingRequests.length === 0 && <div className="my-[30px] border-t border-[#eee7d8]" />}
                    <h2 className="text-[30px] leading-[36px] text-[#15402f]" style={{ fontFamily: SERIF }}>
                      What would you like to do?
                    </h2>
                    <p className="mt-[8px] max-w-[720px] text-[16px] leading-[23px] text-[#5a6660]" style={{ fontFamily: FONT }}>
                      Choose how you&apos;d like to update your reservation. Only the options applicable to your current reservation are shown.
                    </p>
                    {/* Edit registration — Ashara Mubaraka 1448H only (demo flow): jumps to
                        Add People, then on to City Selection instead of the pre-submit Review screen.
                        Demo Progression Controls: only offered while registration is still open. */}
                    {showEditRegistration && (
                      <button
                        type="button"
                        onClick={() => nav(`/miqaats/${id}/people`, { state: { fromModify: true } })}
                        className="group mt-[22px] flex w-full max-w-[560px] items-center gap-[16px] rounded-[16px] border border-[#e7dfc9] bg-white px-[18px] py-[18px] text-left transition-all duration-200 hover:border-[#c2a04e] hover:bg-[#fdfaf2] hover:shadow-[0_8px_22px_-12px_rgba(21,64,47,0.25)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/25"
                      >
                        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[13px]" style={{ background: '#e8f2ec' }}>
                          <EditPeopleIcon color="#1f5a44" size={24} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[18px] font-bold leading-[23px] text-[#23302a]" style={{ fontFamily: FONT }}>Edit registration</span>
                          <span className="mt-[3px] block text-[14.5px] leading-[19px] text-[#5a6660]" style={{ fontFamily: FONT }}>Update your family members, guardians, and other details.</span>
                        </span>
                      </button>
                    )}
                    {changeOptions.length > 0 && (
                    <div data-tour="modify-options" className="mt-[22px] grid max-w-[920px] grid-cols-1 gap-[16px] lg:grid-cols-2">
                      {changeOptions.map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() => nav(o.to, { state: { groupIndices: o.groupIndices, optionTitle: o.title, sameCity: o.sameCity, returnTo: o.returnTo, modifyCityZone: o.modifyCityZone } })}
                          className="group flex items-center gap-[16px] rounded-[16px] border border-[#e7dfc9] bg-white px-[18px] py-[18px] text-left transition-all duration-200 hover:border-[#c2a04e] hover:bg-[#fdfaf2] hover:shadow-[0_8px_22px_-12px_rgba(21,64,47,0.25)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/25"
                        >
                          <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[13px]" style={{ background: o.iconBg }}>{o.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[18px] font-bold leading-[23px] text-[#23302a]" style={{ fontFamily: FONT }}>{o.title}</span>
                            <span className="mt-[3px] block text-[14.5px] leading-[19px] text-[#5a6660]" style={{ fontFamily: FONT }}>{o.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    )}
                  </>
                )}

                {/* Empty state — registered, city selection not yet open, nothing to modify */}
                {!isLinked && changeOptions.length === 0 && miqaat.id !== 'ashara-1448' && (
                  <div className="flex min-h-[70vh] items-center justify-center">
                    <div className="flex w-full max-w-[620px] flex-col items-center rounded-[20px] border-2 border-dashed border-[#dcd4bf] bg-[#fdfbf5] px-[40px] py-[56px] text-center">
                      <span className="flex size-[92px] items-center justify-center rounded-full" style={{ background: '#f2ead5' }}>
                        <MosqueIcon color="#1f5a44" size={44} />
                      </span>
                      <h3 className="mt-[24px] text-[34px] leading-[40px] text-[#15402f]" style={{ fontFamily: SERIF }}>City not opened yet</h3>
                      <p className="mt-[14px] max-w-[440px] text-[19px] leading-[28px] text-[#5a6660]" style={{ fontFamily: FONT }}>
                        City selection opens on <strong className="font-bold text-[#23302a]">{cityOpenLabel}</strong>. Once it opens, you&apos;ll be able to choose your preferred city.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </PhoneScreen>

      {/* Pending change requests — the summary card opens this popup with the full list */}
      <RequestsPopup
        open={showRequests && pendingRequests.length > 0}
        onClose={() => setShowRequests(false)}
        slices={requestSlices}
        eventTitle={miqaat.title}
        onCancel={cancelChangeRequestMembers}
      />

      {/* Cancel chooser — opened by "Cancel my reservation". City → the cancel-city confirmation
          (does NOT route to City Selection); Registration → the existing cancel-registration flow. */}
      <ReservationEntrySheet
        open={showEntryChooser}
        onClose={() => setShowEntryChooser(false)}
        items={[
          ...(cityChangeOption ? [{
            key: 'city', label: 'City', desc: `Cancel your city allocation (${cityName}).`,
            icon: <PinIcon color="#b8821e" size={22} />, iconBg: '#f3ecd9',
            onClick: () => { setShowEntryChooser(false); setShowCancelCity(true) },
          }] : []),
          ...(registrantZone ? [{
            key: 'zone', label: 'Zone', desc: `Cancel your zone allocation (${zoneName}).`,
            icon: <PinIcon color="#2e6a7d" size={22} />, iconBg: '#eef1ef',
            onClick: () => { setShowEntryChooser(false); setShowCancelZone(true) },
          }] : []),
          {
            key: 'registration', label: 'Registration', desc: 'Cancel your reservation for this Miqaat.',
            icon: <CancelIcon size={22} />, iconBg: '#fbeceb', danger: true,
            onClick: () => { setShowEntryChooser(false); handleCancelClick() },
          },
        ]}
      />

      {/* "What would you like to change?" — centered modal (web) / bottom sheet (mobile) */}
      <ChangeOptionsSheet
        open={showChangePopup}
        options={changeOptions}
        onClose={() => setShowChangePopup(false)}
        onSelect={(o) => { setShowChangePopup(false); nav(o.to, { state: { groupIndices: o.groupIndices, optionTitle: o.title, sameCity: o.sameCity, returnTo: o.returnTo, modifyCityZone: o.modifyCityZone } }) }}
      />

      {/* Cancel blocked (linked / awaiting acceptance) */}
      {showCancelBlocked && (
        <CancelBlockedPopup
          // Dismissing the "Waiting for … to accept" popup completes the transfer (demo: the
          // dependent has accepted) — the card flips to "Transferred" and the registrant can cancel.
          onClose={() => { setShowCancelBlocked(false); if (transferState === 'pending') setTransferState('transferred') }}
          pending={transferState === 'pending'}
          depName={cancelDep ? firstNameOf(cancelDep.name) : undefined}
          // Offer Transfer only when the block is a linked dependent that hasn't already been sent for
          // transfer (a pending transfer can't be re-sent — Okay is the only action then).
          onTransfer={cancelDep && transferState !== 'pending'
            ? () => { setShowCancelBlocked(false); setAssignTarget(cancelDep) }
            : undefined}
        />
      )}

      {/* Cancel confirmation (not linked) → success popup */}
      {showCancelConfirm && (
        <CancelConfirmPopup onClose={() => setShowCancelConfirm(false)} onConfirm={handleConfirmCancel} />
      )}

      {/* Cancel-city confirmation (from the cancel chooser's "City" option) → success popup */}
      {showCancelCity && (
        <CancelCityConfirmPopup eventName={miqaat.title} cityName={cityName} onClose={() => setShowCancelCity(false)} onConfirm={handleConfirmCancelCity} />
      )}

      {/* Cancel-zone confirmation (from the cancel chooser's "Zone" option) → success popup */}
      {showCancelZone && (
        <CancelZoneConfirmPopup eventName={miqaat.title} zoneName={zoneName} cityName={cityName} onClose={() => setShowCancelZone(false)} onConfirm={handleConfirmCancelZone} />
      )}

      {/* Assign-a-guardian popup — the in-card "Transfer" action opens this */}
      {assignTarget && (
        <AssignGuardianSheet
          dependent={assignTarget}
          currentGuardianId={guardianFor[assignTarget.id] ?? registrant.id}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleTransferAssigned}
        />
      )}

      {result && (
        <ResultPopup title={result.title} subtext={result.subtext} onDone={() => setResult(null)} />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-[40px] z-[60] flex justify-center px-[24px]">
          <div className="flex items-center gap-[8px] rounded-full bg-[#1f5a44] px-[18px] py-[11px] shadow-[0px_10px_30px_-8px_rgba(21,64,47,0.5)]">
            <svg viewBox="0 0 20 20" fill="none" className="size-[16px]">
              <path d="M4 10.5l3.5 3.5L16 5.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[14px] font-bold text-white" style={{ fontFamily: FONT }}>{toast}</span>
          </div>
        </div>
      )}
    </>
  )
}
