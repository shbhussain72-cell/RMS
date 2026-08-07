import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { isolateRuns } from '../components/Bidi'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import StickyFooter from '../components/figma/StickyFooter'
import { INVITE_QUOTA, lookupMember, miqaats, type MemberLookup } from '../data/seed'
import { LinkedDependentPopup, InviteLimitPopup } from '../components/figma/InvitePopups'
import { InvitedMembersTable, InvitedMembersCards, type InvitedGroup } from '../components/figma/InvitedMembers'
import RoleBadge from '../components/figma/RoleBadge'
import { useStore } from '../store'
import { useT } from '../i18n'

const INFO_FILLED = '/figma/invite-info-filled.svg'
const FM: React.CSSProperties = { fontFamily: 'Marcellus, serif' }
const FMU: React.CSSProperties = { fontFamily: 'Mulish, system-ui, sans-serif' }

// ─── icons ───────────────────────────────────────────────────────────────────

function GroupAddIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" className="block size-full" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.25 5.975C6.49167 5.70833 6.67708 5.40417 6.80625 5.0625C6.93542 4.72083 7 4.36667 7 4C7 3.63333 6.93542 3.27917 6.80625 2.9375C6.67708 2.59583 6.49167 2.29167 6.25 2.025C6.75 2.09167 7.16667 2.3125 7.5 2.6875C7.83333 3.0625 8 3.5 8 4C8 4.5 7.83333 4.9375 7.5 5.3125C7.16667 5.6875 6.75 5.90833 6.25 5.975ZM8.725 10C8.81667 9.85 8.88542 9.68958 8.93125 9.51875C8.97708 9.34792 9 9.175 9 9V8.5C9 8.2 8.93333 7.91458 8.8 7.64375C8.66667 7.37292 8.49167 7.13333 8.275 6.925C8.7 7.075 9.09375 7.26875 9.45625 7.50625C9.81875 7.74375 10 8.075 10 8.5V9C10 9.275 9.90208 9.51042 9.70625 9.70625C9.51042 9.90208 9.275 10 9 10H8.725ZM10 5.5H9.5C9.35833 5.5 9.23958 5.45208 9.14375 5.35625C9.04792 5.26042 9 5.14167 9 5C9 4.85833 9.04792 4.73958 9.14375 4.64375C9.23958 4.54792 9.35833 4.5 9.5 4.5H10V4C10 3.85833 10.0479 3.73958 10.1438 3.64375C10.2396 3.54792 10.3583 3.5 10.5 3.5C10.6417 3.5 10.7604 3.54792 10.8562 3.64375C10.9521 3.73958 11 3.85833 11 4V4.5H11.5C11.6417 4.5 11.7604 4.54792 11.8562 4.64375C11.9521 4.73958 12 4.85833 12 5C12 5.14167 11.9521 5.26042 11.8562 5.35625C11.7604 5.45208 11.6417 5.5 11.5 5.5H11V6C11 6.14167 10.9521 6.26042 10.8562 6.35625C10.7604 6.45208 10.6417 6.5 10.5 6.5C10.3583 6.5 10.2396 6.45208 10.1438 6.35625C10.0479 6.26042 10 6.14167 10 6V5.5ZM2.5875 5.4125C2.19583 5.02083 2 4.55 2 4C2 3.45 2.19583 2.97917 2.5875 2.5875C2.97917 2.19583 3.45 2 4 2C4.55 2 5.02083 2.19583 5.4125 2.5875C5.80417 2.97917 6 3.45 6 4C6 4.55 5.80417 5.02083 5.4125 5.4125C5.02083 5.80417 4.55 6 4 6C3.45 6 2.97917 5.80417 2.5875 5.4125ZM0 9V8.6C0 8.31667 0.0729167 8.05625 0.21875 7.81875C0.364583 7.58125 0.558333 7.4 0.8 7.275C1.31667 7.01667 1.84167 6.82292 2.375 6.69375C2.90833 6.56458 3.45 6.5 4 6.5C4.55 6.5 5.09167 6.56458 5.625 6.69375C6.15833 6.82292 6.68333 7.01667 7.2 7.275C7.44167 7.4 7.63542 7.58125 7.78125 7.81875C7.92708 8.05625 8 8.31667 8 8.6V9C8 9.275 7.90208 9.51042 7.70625 9.70625C7.51042 9.90208 7.275 10 7 10H1C0.725 10 0.489583 9.90208 0.29375 9.70625C0.0979167 9.51042 0 9.275 0 9ZM4 5C4.275 5 4.51042 4.90208 4.70625 4.70625C4.90208 4.51042 5 4.275 5 4C5 3.725 4.90208 3.48958 4.70625 3.29375C4.51042 3.09792 4.275 3 4 3C3.725 3 3.48958 3.09792 3.29375 3.29375C3.09792 3.48958 3 3.725 3 4C3 4.275 3.09792 4.51042 3.29375 4.70625C3.48958 4.90208 3.725 5 4 5ZM1 9H7V8.6C7 8.50833 6.97708 8.425 6.93125 8.35C6.88542 8.275 6.825 8.21667 6.75 8.175C6.3 7.95 5.84583 7.78125 5.3875 7.66875C4.92917 7.55625 4.46667 7.5 4 7.5C3.53333 7.5 3.07083 7.55625 2.6125 7.66875C2.15417 7.78125 1.7 7.95 1.25 8.175C1.175 8.21667 1.11458 8.275 1.06875 8.35C1.02292 8.425 1 8.50833 1 8.6V9Z"
        fill="#0c3d22"
      />
    </svg>
  )
}

// ─── helpers & sub-components ─────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-clip rounded-full bg-[#1f5a44]"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-white"
        style={{ ...FMU, fontSize: Math.round(size * 0.39) }}
      >
        {initials(name)}
      </span>
    </div>
  )
}

function PersonRow({ name, age, its, gender, large = false }: { name: string; age: number; its: string; gender?: string; large?: boolean }) {
  const { t } = useT()
  return (
    <div className="flex min-w-0 flex-1 items-center gap-[12px]">
      <Avatar name={name} size={large ? 52 : 36} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        <p className={`truncate font-bold text-[#15402f] ${large ? 'text-[17px] leading-[22px]' : 'text-[14px] leading-[18px]'}`} style={FMU}>
          {name}
        </p>
        <p className={`font-normal text-[#5a6660] ${large ? 'text-[13.5px] leading-[19px]' : 'text-[12px] leading-[18px]'}`} style={FMU}>
          {isolateRuns(`${gender ? `${gender} · ` : ''}${t('Age')} ${age} · ${t('ITS')} ${its}`)}
        </p>
      </div>
    </div>
  )
}

/** Person-add glyph shown inside the Invite CTA. */
function PersonAddIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0">
      <path d="M13.5 17v-1.5a3.5 3.5 0 0 0-3.5-3.5H6a3.5 3.5 0 0 0-3.5 3.5V17" stroke="#194a37" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="6.5" r="3" stroke="#194a37" strokeWidth="1.6" />
      <path d="M16 7.5v4M14 9.5h4" stroke="#194a37" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** Green check-in-circle badge glyph — "Match found". */
function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0">
      <circle cx="10" cy="10" r="8" stroke="#1f7a4d" strokeWidth="1.6" />
      <path d="M6.5 10.2l2.3 2.3 4.7-5" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0">
      <path d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699" stroke="#2e6a7d" strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MemberRow({ name, age, its, gender, badge, linkTop, linkBottom }: { name: string; age: number; its: string; gender?: string; badge?: boolean; linkTop?: boolean; linkBottom?: boolean }) {
  const { t } = useT()
  return (
    <div className="relative flex items-center gap-[12px] py-[6px]">
      {(linkTop || linkBottom) && (
        <span className="pointer-events-none absolute start-[18px] w-[2px] bg-[#fac775]" style={{ top: linkTop ? 0 : '50%', bottom: linkBottom ? 0 : '50%' }} />
      )}
      <div className="relative shrink-0"><Avatar name={name} size={36} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={FMU}>{name}</p>
        <p className="mt-[2px] text-[12px] leading-[16px] text-[#5a6660]" style={FMU}>{isolateRuns(`${gender ? `${gender} · ` : ''}${t('Age')} ${age} · ${t('ITS')} ${its}`)}</p>
      </div>
      {badge && <RoleBadge kind="dependent" />}
    </div>
  )
}

// ─── main screen ──────────────────────────────────────────────────────────────

export default function InviteMehmaan() {
  const { tx, t, td, tdText } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const { addInvite, removeInvite } = useStore()
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const miqaat = miqaats.find((x) => x.id === id) ?? miqaats[0]

  // Invites must land on THIS event's journey (so they show on its detail page, and the card flips to
  // "Edit"). Make it the active journey on mount — same as Add People — rather than adding to whatever
  // event happened to be active.
  useEffect(() => { if (id) setActiveMiqaat(id) }, [id, setActiveMiqaat])

  const [its, setIts] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [result, setResult] = useState<MemberLookup | null>(null)
  // Set only after an explicit search (icon click / Enter) comes back with no match — distinct from
  // lookupError (format / already-in-list), which renders as a small inline red line, not a full empty state.
  const [noResults, setNoResults] = useState(false)
  const [cardSelected, setCardSelected] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const [showDependentPopup, setShowDependentPopup] = useState(false)
  const [showLimitPopup, setShowLimitPopup] = useState(false)
  const [limitNeeded, setLimitNeeded] = useState(0)

  // The quota + counter apply only to Mehmaan invites; Add People "Others" (group) members are excluded.
  const mehmaanInvites = flow.invites.filter((i) => !i.group)
  const remaining = INVITE_QUOTA - mehmaanInvites.length
  const quotaFull = remaining <= 0
  const canAdd = !!result && cardSelected && !quotaFull

  const showSentToast = () => {
    window.clearTimeout(toastTimer.current)
    setToast('Invitation sent. The member will appear here once they accept your request.')
    toastTimer.current = window.setTimeout(() => setToast(null), 4500)
  }

  // Typing only updates the raw input and clears any prior result/error — it never searches on its
  // own. The search only runs on an explicit trigger (icon click / Enter), via `performSearch` below.
  const handleItsChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 8)
    setIts(digits)
    setCardSelected(false)
    setResult(null)
    setLookupError(null)
    setNoResults(false)
  }

  const performSearch = () => {
    setCardSelected(false)
    if (its.length !== 8) { setResult(null); setNoResults(false); setLookupError('Please enter a valid 8-digit ITS ID.'); return }
    if (flow.invites.some((i) => i.its === its)) { setResult(null); setNoResults(false); setLookupError('This member is already in your invitation list.'); return }
    setLookupError(null)
    const hit = lookupMember(its)
    if (!hit) { setResult(null); setNoResults(true); return }
    setNoResults(false)
    setResult(hit)
  }

  const reset = () => { setShowDependentPopup(false); setResult(null); setIts(''); setCardSelected(false); setLookupError(null); setNoResults(false) }

  const handleInvite = () => {
    if (!result) return

    // A linked group consumes one slot per member (primary + every dependent).
    const needed = 1 + result.dependents.length
    if (remaining < needed) {
      setLimitNeeded(needed)
      setShowLimitPopup(true)
      return
    }

    // Linked members → confirm with the existing dependent popup; single → add directly.
    if (result.dependents.length > 0) {
      setShowDependentPopup(true)
      return
    }

    addInvite({ its: result.its, name: result.name, age: result.age, gender: result.gender, status: 'pending', location: result.location, opensAt: result.opensAt })
    showSentToast()
    reset()
  }

  const commitWithDependent = () => {
    if (!result) return
    addInvite({ its: result.its, name: result.name, age: result.age, gender: result.gender, status: 'pending', location: result.location, opensAt: result.opensAt })
    result.dependents.forEach((d) =>
      addInvite({ its: d.its, name: d.name, age: d.age, gender: d.gender, status: 'pending', dependentOf: result.its, location: d.location, opensAt: d.opensAt }))
    showSentToast()
    reset()
  }

  /** Remove a member and any linked dependents in one action. */
  const removeGroup = (memberIts: string) => {
    flow.invites.filter((i) => i.its === memberIts || i.dependentOf === memberIts).forEach((i) => removeInvite(i.its))
  }

  // This page lists Mehmaan invites only (Add People "Others"/group members live on the Add People screen).
  // A member (no dependentOf) carries its linked dependents.
  const memberInvites = mehmaanInvites.filter((i) => !i.dependentOf)
  const dependentsOf = (memberIts: string) => mehmaanInvites.filter((i) => i.dependentOf === memberIts)
  const empty = memberInvites.length === 0
  // Gender falls back to the deterministic lookup for any invite stored before gender was tracked.
  const inviteGender = (i: { its: string; gender?: 'Male' | 'Female' }) => i.gender ?? lookupMember(i.its)?.gender
  const invitedGroups: InvitedGroup[] = memberInvites.map((m) => ({
    primary: { its: m.its, name: m.name, age: m.age, gender: inviteGender(m) },
    dependents: dependentsOf(m.its).map((d) => ({ its: d.its, name: d.name, age: d.age, gender: inviteGender(d) })),
  }))

  // ─── shared result card (lookup hit) + quota card builders ────────────────────
  const linked = !!result && result.dependents.length > 0
  const inviteButton = (
    <button
      type="button"
      onClick={handleInvite}
      className="flex h-[46px] shrink-0 items-center justify-center gap-[8px] rounded-full bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] px-[30px] text-[15px] font-bold text-[#194a37] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-opacity active:opacity-80"
      style={FMU}
    >
      <PersonAddIcon />
      <span {...tx('Invite')} />
    </button>
  )
  const matchFoundBadge = (
    <div className="flex items-center gap-[6px]">
      <CheckCircleIcon />
      <span className="text-[13px] font-bold text-[#1f7a4d]" style={FMU} {...tx('Match found')} />
    </div>
  )
  const resultCard = result && (
    <div className="w-full animate-[fadeInUp_320ms_ease-out] rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_10px_28px_-12px_rgba(21,64,47,0.28)] sm:p-[24px]">
      {linked ? (
        // Member WITH linked dependents — the Invite CTA adds the whole group.
        <>
          {matchFoundBadge}
          <div className="mt-[14px] flex items-center gap-[8px] rounded-[10px] bg-[#e1eef1] px-[12px] py-[9px]">
            <LinkGlyph />
            <span className="text-[12.5px] font-bold text-[#2e6a7d]" style={FMU} {...tx('Guardian + dependent · added together')} />
          </div>
          <div className="mt-[10px] flex flex-col">
            <MemberRow name={result.name} age={result.age} its={result.its} gender={tdText(result.gender)} linkBottom={result.dependents.length > 0} />
            {result.dependents.map((d, i) => <MemberRow key={d.its} name={d.name} age={d.age} its={d.its} gender={tdText(d.gender)} badge linkTop linkBottom={i < result.dependents.length - 1} />)}
          </div>
          <div className="mt-[16px] flex items-center justify-between gap-[12px] border-t border-[#f0ebe0] pt-[16px]">
            <span className="text-[13px] font-semibold text-[#5a6660]" style={FMU}>
              {1 + result.dependents.length} members · uses {1 + result.dependents.length} invitations
            </span>
            {inviteButton}
          </div>
        </>
      ) : (
        // Single member — centred "match found" card matching the reference design.
        <>
          {matchFoundBadge}
          <div className="mt-[16px] flex flex-col items-center text-center">
            <Avatar name={result.name} size={72} />
            <p className="mt-[14px] text-[17px] font-bold text-[#15402f]" style={FMU} {...td(result.name)} />
            <p className="mt-[4px] text-[13.5px] text-[#5a6660]" style={FMU}>
              {result.gender ? `${tdText(result.gender)} · ` : ''}{t('Age')} {result.age} · {t('ITS')} {result.its}
            </p>
            <div className="mt-[18px]">{inviteButton}</div>
          </div>
        </>
      )}
    </div>
  )

  /* ── "No members found" empty state — shown after an explicit search comes back with no match ── */
  const noResultsCard = noResults && (
    <div className="w-full animate-[fadeInUp_320ms_ease-out] rounded-[16px] border border-dashed border-[#e0d9c4] bg-[#faf8f2] px-[20px] py-[26px] text-center">
      <svg viewBox="0 0 20 20" fill="none" className="mx-auto size-[22px] text-[#a8a196]">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.8 13.8L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p className="mt-[8px] text-[15px] font-bold text-[#23302a]" style={FMU} {...tx('No members found')} />
      <p className="mt-[4px] text-[13px] leading-[18px] text-[#7a827c]" style={FMU} {...tx('Try searching with a different ITS ID or member name.')} />
    </div>
  )

  /* ── clickable search-icon button — sits beside the ITS input, triggers the search ── */
  const searchIconButton = (
    <button
      type="button"
      onClick={performSearch}
      disabled={quotaFull}
      aria-label={t('Search')}
      className="flex size-[48px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-[19px] shrink-0 text-[#194a37]">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  )

  // Badge on the quota card: fully available (green) / partially used (gold) / full (red).
  const quotaBadge =
    quotaFull
      ? { text: 'Quota full', bg: '#fdeceb', color: '#b23b3b' }
      : remaining === INVITE_QUOTA
        ? { text: 'All available', bg: '#e4f1e9', color: '#1f7a4d' }
        : { text: `${INVITE_QUOTA - remaining} used`, bg: '#fbeecb', color: '#a9740f' }

  const quotaPill = (
    <div className="w-full rounded-[16px] border border-[#c2cdc4] bg-[#e2e6e0] px-[20px] py-[18px]">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-[15px] font-bold text-[#15402f]" style={FM} {...tx('Invitation quota')} />
        <span
          className="whitespace-nowrap rounded-full px-[12px] py-[4px] text-[12px] font-bold"
          style={{ ...FMU, background: quotaBadge.bg, color: quotaBadge.color }}
        >
          {quotaBadge.text}
        </span>
      </div>
      <div className="mt-[10px] flex items-baseline gap-[7px]">
        <span className="size-[8px] shrink-0 translate-y-[-3px] rounded-full bg-[#c9a45c]" />
        <span className="text-[30px] leading-none text-[#15402f]" style={{ ...FM, fontWeight: 700 }}>{remaining}</span>
        <span className="text-[14px] text-[#5a6660]" style={FMU}>/ {INVITE_QUOTA} remaining</span>
      </div>
      <p className="mt-[10px] text-[13px] leading-[19px] text-[#5a6660]" style={FMU} {...tx('Each accepted invitation counts toward your Mehmaan quota for this Miqaat.')} />
    </div>
  )

  // ─── the standard left/right sticky CTA shared by web (in-panel) + mobile (footer) ──
  // Only shown once at least one Mehmaan is invited; removing them all hides the CTA again.
  const inviteFooterCta = mehmaanInvites.length > 0 ? (
    <StickyFooter
      caption={miqaat.title}
      title={`${mehmaanInvites.length} invited`}
      button={t('Confirm')}
      // Invite Mehmaan is opened from the event's detail-page card, so Confirm returns there (the
      // card then reads "Edit") — not the Add People / registration flow.
      onButton={() => nav(`/miqaats/${id}`)}
    />
  ) : null

  // ─── footer — info banner + the sticky CTA (mobile only; desktop puts the CTA in-panel) ──
  const footer = (
    <div className="sm:hidden">
      <div className="w-full px-[16px] pt-3">
        <div className="flex items-start gap-[10px] rounded-[16px] border border-[#cfe2e7] bg-[#e1eef1] px-[14px] py-[13px]">
          <span className="mt-[1px] block size-[18px] shrink-0">
            <img src={INFO_FILLED} alt="" className="block size-full" />
          </span>
          <p className="text-[13px] font-normal leading-[19px] text-[#2e6a7d]" style={FMU}>
            <span {...tx('Invited Mehmaan stay')} /> <strong className="font-bold" {...tx('Pending')} />{' '}
            <span {...tx('until they accept their invitation. A seat is only used when each one accepts.')} />
          </p>
        </div>
      </div>
      {inviteFooterCta}
    </div>
  )

  return (
    <PhoneScreen statusTone="dark" footer={footer}>
      {/* ── Dependent popup (shared) ── */}
      {showDependentPopup && result && result.dependents.length > 0 && (
        <LinkedDependentPopup
          memberName={result.name}
          dependents={result.dependents}
          onCancel={() => setShowDependentPopup(false)}
          onConfirm={commitWithDependent}
        />
      )}

      {/* ── Limit popup (shared) ── */}
      {showLimitPopup && (
        <InviteLimitPopup needed={limitNeeded} remaining={remaining} onClose={() => setShowLimitPopup(false)} />
      )}

      {/* ── Invitation sent toast (shared) ── */}
      {toast && (
        <div className="fixed bottom-[110px] start-[16px] end-[16px] z-50 animate-[noticeIn_320ms_ease-out] sm:left-auto sm:right-[var(--content-px)] sm:w-[380px]">
          <div className="flex items-start gap-[10px] rounded-[14px] bg-[#1f5a44] px-[14px] py-[12px] shadow-[0_8px_24px_-8px_rgba(21,64,47,0.3)]">
            <svg viewBox="0 0 24 24" className="mt-[1px] size-[16px] shrink-0" fill="none">
              <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.2)" />
              <path d="M8 12l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[13px] leading-[18px] text-white" style={{ ...FMU, fontWeight: 500 }}>
              {toast}
            </p>
          </div>
        </div>
      )}

      {/* ── AppBar (shared) ── */}
      <div>
        <AppBar notificationCount={3} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MOBILE — unchanged single-column flow.
         ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="contents sm:hidden">
        {/* Breadcrumb */}
        <div className="ms-[16px] mt-[12px]">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/miqaats' },
              { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
              { label: t('Add people'), to: `/miqaats/${id}/people` },
              { label: t('Invitations') },
            ]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
        </div>

        <div className="px-[16px] pb-[24px]">
          {/* Title */}
          <h2 className="mt-[20px] text-[20px] leading-[28px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Invite Mehmaan')} />

          {/* ITS input */}
          <div className="relative mt-[16px]">
            <div className="flex items-center gap-[8px]">
              <div
                className={`flex h-[48px] flex-1 overflow-clip rounded-[12px] border border-solid transition-colors ${lookupError ? 'border-[#b23b3b] bg-[#fff5f5]' : 'border-[#e7dfc9] bg-[#fbfbfb]'}`}
              >
                <input
                  value={its}
                  onChange={(e) => handleItsChange(e.target.value)}
                  disabled={quotaFull}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder={t('Enter 8-digit ITS ID')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); performSearch() } }}
                  className="h-full w-full bg-transparent px-[11px] text-[16px] font-normal text-[#23302a] outline-none placeholder:font-normal placeholder:text-[#757575] disabled:cursor-not-allowed disabled:opacity-60"
                  style={FMU}
                />
              </div>
              {searchIconButton}
            </div>

            {lookupError && (
              <p className="mt-[6px] text-[12px] font-medium leading-[18px] text-[#b23b3b]" style={FMU}>
                {lookupError}
              </p>
            )}
          </div>

          {/* Match found — its own card, outside the input card, with a drop shadow */}
          {resultCard && <div className="mt-[16px]">{resultCard}</div>}

          {/* No match for the searched ITS */}
          {noResultsCard && <div className="mt-[16px]">{noResultsCard}</div>}

          {/* Quota pill */}
          <div className="mt-[16px]">{quotaPill}</div>

          {/* Cards — shared invited-members component (consistent with the desktop table) */}
          <div className="mt-[16px] flex flex-col gap-[8px]">
            {!empty && <InvitedMembersCards groups={invitedGroups} showStatus onRemove={removeGroup} />}

            {/* Empty state */}
            {empty && (
              <div className="flex flex-col items-center gap-[12px] rounded-[14px] border-2 border-dashed border-[#e7dfc9] bg-[#fffdf8] px-[24px] py-[32px] text-center">
                <span className="flex size-[56px] items-center justify-center rounded-full bg-[rgba(201,164,92,0.15)]">
                  <span className="block size-[26px] opacity-80">
                    <GroupAddIcon />
                  </span>
                </span>
                <p className="text-[18px] leading-[22px] text-[#15402f]" style={FM} {...tx('No invitations added yet')} />
                <p className="max-w-[300px] text-[13.5px] font-normal leading-[20.25px] text-[#5a6660]" style={FMU} {...tx('Start by entering an ITS ID to invite a Mumineen. Invited members will appear here and count toward your available quota.')} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          DESKTOP — two-panel layout (cream sidebar + white members panel).
         ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="hidden sm:block sm-full-bleed">
        <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">

          {/* ───────── LEFT sidebar ───────── */}
          <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[20px] overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">

            {/* breadcrumb header — Go back merged in as the leading item */}
            <Breadcrumb
              items={[
                { label: 'Home', to: '/miqaats' },
                { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
                { label: t('Add people'), to: `/miqaats/${id}/people` },
                { label: t('Invite') },
              ]}
              onNavigate={(to) => nav(to)}
              onBack={() => nav(-1)}
              activeColor="#a8843e"
              dense
            />

            {/* Invite Mehmaan card */}
            <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
              <p className="text-[22px] leading-[26px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Invite Mehmaan')} />
              <div className="mt-[16px] flex items-center gap-[10px]">
                <div className={`group relative h-[48px] flex-1 overflow-clip rounded-[12px] border border-solid transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12 ${lookupError ? 'border-[#b23b3b] bg-[#fff5f5]' : 'border-[#e7dfc9] bg-[#fbfbfb] hover:border-[#d6cbab]'}`}>
                  <input
                    value={its}
                    onChange={(e) => handleItsChange(e.target.value)}
                    disabled={quotaFull}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder={t('Enter 8-digit ITS ID')}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); performSearch() } }}
                    className="absolute start-[13px] end-[13px] top-1/2 -translate-y-1/2 bg-transparent text-[15px] font-normal text-[#23302a] outline-none placeholder:text-[#9aa39d] disabled:cursor-not-allowed disabled:opacity-60"
                    style={FMU}
                  />
                </div>
                {searchIconButton}
              </div>

              {lookupError && (
                <p className="mt-[8px] text-[12px] font-medium leading-[18px] text-[#b23b3b]" style={FMU}>
                  {lookupError}
                </p>
              )}
            </div>

            {/* Match found — its own card, outside the input card, with a drop shadow */}
            {resultCard}

            {/* No match for the searched ITS */}
            {noResultsCard}

            {/* Quota pill */}
            {quotaPill}
          </aside>

          {/* ───────── RIGHT members panel ───────── */}
          <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
              {empty ? (
                <div className="flex min-h-full items-center justify-center">
                  <div className="flex w-full max-w-[640px] flex-col items-center gap-[18px] rounded-[20px] border-2 border-dashed border-[#dcd3bd] bg-[#fdfbf5] px-[40px] py-[56px] text-center">
                    <span className="flex size-[72px] items-center justify-center rounded-full bg-[rgba(201,164,92,0.15)]">
                      <span className="block size-[32px] opacity-80"><GroupAddIcon /></span>
                    </span>
                    <p className="text-[28px] leading-[34px] text-[#15402f]" style={FM} {...tx('No invitations added yet')} />
                    <p className="max-w-[460px] text-[15px] font-normal leading-[24px] text-[#5a6660]" style={FMU} {...tx('Start by entering an ITS ID to invite a Mumineen. Invited members will appear here and count toward your available quota.')} />
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Mehmaan members')} />
                  <div className="mt-[24px]">
                    <InvitedMembersTable groups={invitedGroups} showStatus onRemove={removeGroup} />
                  </div>
                  <div className="mt-[16px] flex items-center gap-[12px] rounded-[14px] border border-[#cfe2e7] bg-[#e1eef1] px-[18px] py-[14px]">
                    <span className="block size-[20px] shrink-0">
                      <img src={INFO_FILLED} alt="" className="block size-full" />
                    </span>
                    <p className="text-[14px] leading-[20px] text-[#2e6a7d]" style={FMU} {...tx('Mehmaan will be added once they accept the invitation.')} />
                  </div>
                </>
              )}
            </div>
            {/* Sticky CTA pinned inside the white panel (web) */}
            <div className="shrink-0">{inviteFooterCta}</div>
          </section>
        </div>
      </div>
    </PhoneScreen>
  )
}
