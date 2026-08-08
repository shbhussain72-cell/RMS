import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '@/components/figma/PhoneScreen'
import { useT } from '../i18n'
import { isolateRuns } from '../components/Bidi'
import AppBar from '@/components/figma/AppBar'
import Breadcrumb from '@/components/figma/Breadcrumb'
import StickyFooter from '@/components/figma/StickyFooter'
import { family, lookupMember, miqaats, type FamilyMember, type MemberLookup } from '@/data/seed'
import { type BadgeKind, memberBlockedReason, blockedMessage, roleBadgeFor } from '@/lib/group'
import { LinkedDependentPopup } from '@/components/figma/InvitePopups'
import MissedMemberSheet from '@/components/figma/MissedMemberSheet'
import RoleTag from '@/components/figma/RoleBadge'
import { useStore, type QuestionnaireAnswers } from '@/store'
import { QuestionnaireSections, QuestionnaireSummary, validateQuestionnaire } from '@/components/questionnaire/QuestionnaireFields'

const SHIELD = '/figma/shield-task.svg'
const WARNING = '/figma/warning-amber.svg'
const ARROW_FWD = '/figma/arrow-forward.svg'
const RADIO_ON = '/figma/radio-checked.svg'
const RADIO_OFF = '/figma/radio-unchecked.svg'
const PERSON_ADD = '/figma/person-add.svg'
const CHECKBOX_BLANK = '/figma/checkbox-blank.svg'
const CHECKBOX_CHECKED = '/figma/checkbox-checked.svg'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

const age2 = (n: number) => String(n).padStart(2, '0')

/** Green check-in-circle badge — "Match found" (mirrors the Invite Mehmaan lookup card). */
function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[16px] shrink-0">
      <circle cx="10" cy="10" r="8" stroke="#1f7a4d" strokeWidth="1.6" />
      <path d="M6.5 10.2l2.3 2.3 4.7-5" stroke="#1f7a4d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Person-add glyph for the gold "Add" CTA (mirrors the Invite Mehmaan "Invite" button). */
function AddPersonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px] shrink-0">
      <path d="M13.5 17v-1.5a3.5 3.5 0 0 0-3.5-3.5H6a3.5 3.5 0 0 0-3.5 3.5V17" stroke="#194a37" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="6.5" r="3" stroke="#194a37" strokeWidth="1.6" />
      <path d="M16 7.5v4M14 9.5h4" stroke="#194a37" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

type Kind = 'guardian' | 'caregiver'
interface SheetState { dependent: FamilyMember; kind: Kind }

/* ── role badge (dash=true renders a "-" for members with no badge, per the approved table) ──
   Computes the badge kind from the member, then defers to the shared RoleTag so the pill
   looks identical to every other screen. */
function RoleBadge({ badge, dash = false }: { badge: BadgeKind; dash?: boolean }) {
  if (!badge) return dash ? <span className="text-[14px] text-[#8a938e]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>-</span> : null
  return <RoleTag kind={badge} />
}

/* ── amber warning strip ──
   Shared by the mobile person card AND the desktop table. Interaction states on the
   Assign button are gated behind `sm:` so the mobile experience is never altered. */
function WarnStrip({ text, onAssign, interactive = true }: { text: string; onAssign: () => void; interactive?: boolean }) {
  const { tx } = useT()
  return (
    <div role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); onAssign() } : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onAssign() } } : undefined}
      className={`flex items-center gap-[10px] rounded-[8px] border border-solid px-[10px] py-[8px] ${interactive ? 'cursor-pointer sm:transition-colors sm:hover:bg-[rgba(254,237,201,0.35)]' : ''}`}
      style={{ backgroundColor: 'rgba(254,237,201,0.2)', borderColor: 'rgba(222,124,0,0.3)' }}>
      <img src={WARNING} alt="" className="size-[16px] shrink-0" />
      {/* `text` arrives as a t() string, which does no isolation — the guardian warning mixes an
          ASCII "10" and Arabic in one node, so it needs isolating here like the meta rows below. */}
      <p className="flex-1 text-[12px] leading-[16px]" style={{ fontFamily: FONT_SANS, fontWeight: 400, color: 'rgba(51,27,6,0.9)' }}>{isolateRuns(text)}</p>
      {interactive && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAssign() }}
          className="flex h-[24px] shrink-0 cursor-pointer items-center gap-[4px] rounded-[12px] border border-solid px-[10px] sm:transition-all sm:duration-200 sm:hover:bg-[#fff8ec] sm:hover:shadow-[0_2px_6px_-2px_rgba(21,64,47,0.18)] sm:active:scale-[0.96] sm:focus-visible:outline-none sm:focus-visible:ring-2 sm:focus-visible:ring-[#1f5a44]/30"
          style={{ backgroundColor: '#fffdf8', borderColor: 'rgba(12,61,34,0.2)' }}>
          <span className="text-[12px] leading-[16px]" style={{ fontFamily: FONT_SANS, fontWeight: 600, color: '#0c3d22' }} {...tx('Assign')} />
          <img src={ARROW_FWD} alt="" className="size-[12px]" />
        </button>
      )}
    </div>
  )
}

/* ── green resolved strip ──
   The "Change" trailing arrow only renders at sm+ (desktop), so the mobile card is untouched. */
function ResolvedStrip({ prefix, name, onChange, interactive = true }: { prefix: string; name: string; onChange: () => void; interactive?: boolean }) {
  const { tx, td } = useT()
  return (
    <div className="flex items-center gap-[8px] rounded-[8px] border border-solid px-[11px] py-[8px]"
      style={{ backgroundColor: '#e5f5e7', borderColor: '#badcc7' }}>
      <img src={SHIELD} alt="" className="size-[20px] shrink-0" />
      <p className="flex-1 text-[12px] leading-[16px]" style={{ fontFamily: FONT_SANS, fontWeight: 400, color: 'rgba(11,119,67,0.9)' }}>
        {prefix}<span style={{ fontWeight: 700 }} {...td(name)} />
      </p>
      {interactive && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onChange() }}
          className="flex shrink-0 cursor-pointer items-center gap-[4px] whitespace-nowrap rounded-[8px] text-[12px] leading-[16px] sm:transition-all sm:duration-200 sm:hover:opacity-80 sm:active:scale-[0.96] sm:focus-visible:outline-none sm:focus-visible:ring-2 sm:focus-visible:ring-[#0b7743]/30"
          style={{ fontFamily: FONT_SANS, fontWeight: 700, color: 'rgba(11,119,67,0.9)' }}>
          <span {...tx('Change')} />
          <svg viewBox="0 0 24 24" className="hidden size-[13px] sm:block" fill="none" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

/* ── checkbox image ── */
function Checkbox({ checked, sizeClass = 'size-[24px]', className = '' }: { checked: boolean; sizeClass?: string; className?: string }) {
  return <img src={checked ? CHECKBOX_CHECKED : CHECKBOX_BLANK} alt="" className={`block ${sizeClass} ${className}`} />
}

/* ── interactive checkbox (Add People member list) ──
   Clickable wrapper around the checkbox image. `dimmed` is used for a dependent still awaiting a
   guardian/caregiver — it stays clickable so tapping it surfaces the "assign first" prompt. */
function CheckboxButton({ checked, dimmed = false, onToggle }: { checked: boolean; dimmed?: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className="flex size-[24px] shrink-0 items-center justify-center transition-transform active:scale-90"
      style={{ opacity: dimmed ? 0.4 : 1 }}>
      <Checkbox checked={checked} />
    </button>
  )
}

/* ── invitation status pill ──
   Mehmaan invites land here as "Pending" and flip to "Accepted" once the guest accepts. */
function StatusPill({ status }: { status: 'pending' | 'accepted' }) {
  const { t } = useT()
  const accepted = status === 'accepted'
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-[10px] py-[3px] text-[11px]"
      style={{ fontFamily: FONT_SANS, fontWeight: 700, background: accepted ? '#e4efe7' : '#fdf0d8', color: accepted ? '#276245' : '#9a6b12' }}
    >
      <span className="size-[6px] rounded-full" style={{ background: accepted ? '#2f8f5b' : '#d99b2b' }} />
      {accepted ? 'Accepted' : t('Pending')}
    </span>
  )
}

/* ── small circular ✕ remove control (Group table rows) ── */
function RemoveButton({ onClick }: { onClick: () => void }) {
  const { t } = useT()
  return (
    <button
      type="button"
      aria-label={t('Remove from group')}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="flex size-[26px] shrink-0 items-center justify-center rounded-full border border-solid border-[#e6d3cf] bg-white text-[#b4544a] transition-colors hover:border-[#d99c94] hover:bg-[#fdf5f4]"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}

/* ── mobile person card — selectable member row (tap card or checkbox to toggle) ── */
function PersonCard({ member, badge, checked, dimmed, selectable = true, onToggle, children }: {
  member: FamilyMember; badge: BadgeKind; checked: boolean; dimmed?: boolean; selectable?: boolean; onToggle: () => void; children?: ReactNode
}) {
     const { t, td, tdText } = useT()
  return (
    <div onClick={selectable ? onToggle : undefined}
      className={`w-full rounded-[14px] border border-solid p-[13px] transition-colors ${selectable ? `cursor-pointer ${checked ? 'border-[#d9c98a] bg-[#fffdf5]' : 'border-[#e7dfc9] bg-[#fffdf8]'}` : 'border-[#e7dfc9] bg-white'}`}>
      <div className="flex items-start gap-[10px]">
        {selectable && <div className="mt-[6px]"><CheckboxButton checked={checked} dimmed={dimmed} onToggle={onToggle} /></div>}
        <div className="mt-[2px] flex size-[36px] shrink-0 items-center justify-center overflow-clip rounded-full bg-[#1f5a44]">
          <span className="text-[14px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>{initials(member.name)}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="text-[14px] leading-[18px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...td(member.name)} />
          <p className="text-[12px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>
            {isolateRuns(`${tdText(member.relation)} · ${tdText(member.gender)} · ${t('Age')} ${age2(member.age)} · ${t('ITS')} ${member.its}`)}
          </p>
        </div>
        <RoleBadge badge={badge} />
      </div>
      {children && <div className="mt-[10px]">{children}</div>}
    </div>
  )
}

/* ── desktop table row — optional checkbox column (selectable) + member ── */
function DesktopRow({ name, meta, status, isLast, selectable = false, plain = false, checked = false, dimmed = false, onToggle }: {
  name: string; meta: string; status?: ReactNode; isLast: boolean
  selectable?: boolean; plain?: boolean; checked?: boolean; dimmed?: boolean; onToggle?: () => void
}) {
     const { td } = useT()
  return (
    <tr onClick={selectable ? onToggle : undefined}
      className={`transition-colors duration-150 ${selectable ? 'cursor-pointer' : ''} ${plain ? 'bg-white' : (checked ? 'bg-[#fffdf5]' : 'hover:bg-[#faf9f4]')} ${isLast ? '' : 'border-b border-[#ece7da]'}`}>
      {selectable && (
        <td className="py-[9px] ps-[16px] pe-[12px] align-middle">
          <CheckboxButton checked={checked} dimmed={dimmed} onToggle={onToggle ?? (() => {})} />
        </td>
      )}
      <td className={`py-[9px] ${selectable ? 'ps-0' : 'ps-[16px]'} pe-[16px] align-middle`}>
        <div className="flex items-center gap-[10px]">
          <div className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44]">
            <span className="text-[14px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>{initials(name)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] leading-[18px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...td(name)} />
            <p className="mt-[2px] text-[12px] leading-[16px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>{isolateRuns(meta)}</p>
          </div>
        </div>
      </td>
      <td className="py-[9px] pe-[24px] align-middle">{status}</td>
    </tr>
  )
}

/* ── rounded table container + header (MEMBER). When `selectable`, a leading checkbox column
      with a select-all header checkbox is added (Add People family list). ── */
function MembersTableShell({ selectable = false, selectAllChecked = false, onSelectAll, children }: {
  selectable?: boolean; selectAllChecked?: boolean; onSelectAll?: () => void; children: ReactNode
}) {
     const { tx } = useT()
  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#e7dfc9] bg-white shadow-[0_6px_24px_-12px_rgba(15,77,60,0.12)]">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: selectable ? '520px' : '460px' }}>
        <colgroup>
          {selectable && <col style={{ width: '52px' }} />}
          <col style={{ width: selectable ? '48%' : '54%' }} />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-[#ece7da] bg-[#faf8f2]">
            {selectable && (
              <th className="py-[10px] ps-[16px] pe-[12px] align-middle">
                <span title={selectAllChecked ? 'Deselect all' : 'Select all'}>
                  <CheckboxButton checked={selectAllChecked} onToggle={() => onSelectAll?.()} />
                </span>
              </th>
            )}
            <th className={`py-[10px] ${selectable ? 'ps-0' : 'ps-[16px]'} pe-[16px] text-start text-[11px] uppercase leading-[16px] tracking-[0.6px] text-[#8a938e]`}
              style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx('Member')} />
            <th className="py-[10px] pe-[24px]" />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export default function AddPeople() {
  const { tx, t, td, tdText, tdAuthored } = useT()
  const { id } = useParams()
  const miqaat = miqaats.find((m) => m.id === id) ?? miqaats[0]
  const nav = useNavigate()
  const location = useLocation()
  // Reached from Modify Reservation's "Edit registration details" card (Ashara Mubaraka 1448H only,
  // per the demo flow requested). Continue runs the SAME pre-submit path as a fresh registration
  // (Review & Register → success → Post Registration Details), but the flag is threaded through every
  // hop so the tail end returns to Modify Reservation (with a success popup) instead of the roster.
  const fromModify = (location.state as { fromModify?: boolean } | null)?.fromModify === true && id === 'ashara-1448'
  // Edit-registration flow only: the screen opens READ-ONLY (view), with an "Edit" CTA on the family
  // header. A fresh registration is always editable (`editing` starts true), so `viewMode` is never
  // entered outside the Modify-Reservation edit flow. `editing` gates every interactive control below.
  const [editing, setEditing] = useState(!fromModify)
  const viewMode = fromModify && !editing
  const flow = useStore((s) => s.flow)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const { toggleMember, assignGuardian, assignCaregiver, removeGuardian, removeCaregiver, addInvite, removeInvite, acceptInvite, setQuestionnaire } = useStore()

  // Starting a registration for THIS event makes its journey the active one — archiving whatever
  // event was active before (so a previously-registered event keeps its own Registered card, and
  // this event starts from a clean slate rather than inheriting the other event's selections).
  useEffect(() => {
    if (id) setActiveMiqaat(id)
  }, [id, setActiveMiqaat])
  const activeReady = flow.miqaatId === id

  // On first landing (nothing selected yet) pre-select every family member whose checkbox is active —
  // i.e. all except dependents still needing a guardian/caregiver (those stay unchecked + disabled
  // until one is assigned). Runs once the active journey belongs to this event; if the user returns
  // with an existing selection it's untouched.
  const didInit = useRef(false)
  useEffect(() => {
    if (!activeReady || didInit.current) return
    didInit.current = true
    // No manual selection on this screen — every family member is in the group by default. Ensure all
    // non-blocked members are included (a dependent joins once its guardian/caregiver is assigned).
    family.forEach((m) => {
      if (!flow.selectedMemberIds.includes(m.id) && !memberBlockedReason(m, flow.guardians, flow.caregivers)) toggleMember(m.id)
    })
    // Demo: coming back to Add People after inviting Mehmaan marks those invitations accepted, so the
    // guest becomes a confirmed member and is counted in the Continue CTA. Events with no Invite
    // Mehmaan step skip this — any pending Mehmaan invites belong to a different event's session.
    if (!miqaat.hideInviteMehmaan) {
      flow.invites.forEach((i) => { if (!i.group && i.status === 'pending') acceptInvite(i.its) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReady])

  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [itsInput, setItsInput] = useState('')
  const [searchResult, setSearchResult] = useState<MemberLookup | null>(null)
  const [cardSelected, setCardSelected] = useState(false)
  const [itsError, setItsError] = useState<string | null>(null)
  // Set only after an explicit search (icon click / Enter) comes back with no match — distinct from
  // itsError (format / already-in-list), which renders as a small inline red line, not a full empty state.
  const [noResults, setNoResults] = useState(false)
  const [showDepPopup, setShowDepPopup] = useState(false)
  const [missedOpen, setMissedOpen] = useState(false)
  // Set once Continue has been pressed and the questionnaire failed validation — from then on every
  // still-empty required field shows its own red border/error text (not just the toast), and clears
  // itself per-field as each is answered.
  const [showQErrors, setShowQErrors] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const errTimer = useRef<number | undefined>(undefined)
  const showErr = (m: string) => {
    window.clearTimeout(errTimer.current)
    setErr(m)
    errTimer.current = window.setTimeout(() => setErr(null), 4500)
  }
  const canAdd = !!searchResult && cardSelected

  const selected = new Set(flow.selectedMemberIds)
  // The CTA reflects how many people are in the group. It sums:
  //  • valid family members (a dependent awaiting its guardian/caregiver isn't counted until assigned),
  //  • Others added via ITS on this screen (the user's own group), and
  //  • Mehmaan whose invitation is accepted (pending guests aren't confirmed members yet).
  const validFamilyCount = family.filter((m) => selected.has(m.id) && !memberBlockedReason(m, flow.guardians, flow.caregivers)).length
  const othersCount = flow.invites.filter((i) => i.group).length
  // Events with no Invite Mehmaan step never count Mehmaan — any accepted ones belong to a different
  // event's session and must not inflate this event's headcount.
  const acceptedMehmaanCount = miqaat.hideInviteMehmaan ? 0 : flow.invites.filter((i) => !i.group && i.status === 'accepted').length
  const effectiveSelectedCount = validFamilyCount + othersCount + acceptedMehmaanCount
  // Footer summary — the header already shows the event name, so surface the running headcount instead.
  const footerSummary = othersCount > 0
    ? `${validFamilyCount} family · ${othersCount} group`
    : `${validFamilyCount} family ${validFamilyCount === 1 ? 'member' : 'members'}`

  /** Guarded selection — a dependent can't be selected until its guardian/caregiver is assigned. */
  const tryToggleMember = (m: FamilyMember) => {
    if (viewMode) return // read-only until "Edit" is tapped
    if (!selected.has(m.id)) {
      const reason = memberBlockedReason(m, flow.guardians, flow.caregivers)
      if (reason) { showErr(blockedMessage(m, reason)); return }
    }
    toggleMember(m.id)
  }

  // Family members still left out of the group because they need an assignment (a child under 10
  // without a guardian, or a member needing a caregiver). Tapping Continue warns about these once
  // via the "You missed some members" sheet before proceeding without them.
  const missedMembers = family.filter((m) => !!memberBlockedReason(m, flow.guardians, flow.caregivers))
  const missedCount = missedMembers.length

  const goReview = () => nav(`/miqaats/${id}/review`, fromModify ? { state: { fromModify: true } } : undefined)
  const handleConfirm = () => {
    // An unassigned dependent is simply left unchecked (not part of the group), so Continue no longer
    // blocks on it — but we surface a confirmation so the user notices who's being left behind.
    if (effectiveSelectedCount === 0) { showErr('Please add at least one member to continue.'); return }
    // Require the inline "Other Details" questionnaire (intro sections are hidden here, so skip them).
    // On a problem, scroll the visible instance into view so the user is taken straight to it.
    const qPrefix = window.matchMedia('(min-width: 640px)').matches ? 'ap-' : 'apm-'
    const problem = validateQuestionnaire(flow.questionnaire, qPrefix, true)
    if (problem) {
      setShowQErrors(true)
      showErr(problem.message)
      document.getElementById(problem.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (missedCount > 0) { setMissedOpen(true); return }
    goReview()
  }

  // ── Registration Questionnaire variation: the same questionnaire shown on its own screen between
  // "Register Now" and this page, rendered again here below the member list so both placements can
  // be compared. Submitting it validates the questionnaire, then defers to the existing Continue
  // logic (member-count check + missed-member sheet) so both entry points behave identically.
  const registrant = family.find((f) => f.role === 'registrant') ?? family[0]
  const setQuestionnaireField = (patch: Partial<QuestionnaireAnswers>) => setQuestionnaire(patch)

  // The Registration Questionnaire variation, rendered inline below the member list. Kept as a
  // helper so the same form can mount in both the mobile flow and the desktop right panel; each
  // placement passes a distinct `idPrefix` to keep section DOM ids unique across breakpoints.
  const renderQuestionnaireVariation = (idPrefix: string) => (
    <div data-tour="other-details-section">
      <div className="mb-[24px] h-px w-full bg-[#e7dfc9]" />

      <h2 className="text-[22px] leading-[28px] tracking-[0.2px] text-[#15402f] sm:text-[28px]" style={{ fontFamily: FONT_SERIF }} {...tx('Other Details')} />
      <p className="mt-[6px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }} {...tx('Share your requirements so we can make your Miqaat journey comfortable, safe, and well organized.')} />

      <div className="mt-[20px]">
        {viewMode
          ? <QuestionnaireSummary q={flow.questionnaire} idPrefix={idPrefix} hideIntro />
          : <QuestionnaireSections q={flow.questionnaire} onChange={setQuestionnaireField} registrant={registrant} idPrefix={idPrefix} hideIntro miqaatId={id} showErrors={showQErrors} />}
      </div>
    </div>
  )
  const nameOf = (mid: string) => family.find((f) => f.id === mid)?.name ?? ''
  // Members already acting as a guardian/caregiver for ANOTHER dependent — excluded as candidates
  // so one person can't lead two unrelated groups (no duplicate primary across groups).
  const primaryElsewhere = new Set<string>()
  if (sheet) {
    Object.entries(flow.guardians).forEach(([dep, gid]) => { if (dep !== sheet.dependent.id) primaryElsewhere.add(gid) })
    Object.entries(flow.caregivers).forEach(([dep, cid]) => { if (dep !== sheet.dependent.id) primaryElsewhere.add(cid) })
  }
  // Only eligible adults — never another dependent (e.g. Amatullah Bhen must not be a guardian).
  const eligibleAdults = sheet
    ? family.filter((m) => m.age >= 18 && m.role !== 'dependent' && m.id !== sheet.dependent.id && !primaryElsewhere.has(m.id))
    : []
  // The currently-assigned guardian/caregiver for the open sheet's dependent (if any).
  const currentAssignedId = sheet
    ? (sheet.kind === 'guardian' ? flow.guardians[sheet.dependent.id] : flow.caregivers[sheet.dependent.id]) ?? null
    : null

  // "All selected" is based on the members that CAN be selected (a dependent still needing a
  // guardian/caregiver is excluded until assigned) so the header checkbox reflects a full selection.
  const selectableFamily = family.filter((m) => !memberBlockedReason(m, flow.guardians, flow.caregivers))
  const allSelected = selectableFamily.length > 0 && selectableFamily.every((m) => selected.has(m.id))
  const handleSelectAll = () => {
    if (viewMode) return // read-only until "Edit" is tapped
    if (allSelected) {
      family.forEach((m) => { if (selected.has(m.id)) toggleMember(m.id) })
    } else {
      let blocked = 0
      family.forEach((m) => {
        if (selected.has(m.id)) return
        if (memberBlockedReason(m, flow.guardians, flow.caregivers)) { blocked++; return }
        toggleMember(m.id)
      })
      if (blocked) showErr('Assign a guardian/caregiver for the dependent member(s) before selecting them.')
    }
  }

  // Desktop table order matches the approved design: the member needing a caregiver is grouped
  // directly after the member needing a guardian. Seed order (and the mobile list) are untouched.
  const desktopFamily = (() => {
    const arr = [...family]
    const ci = arr.findIndex((m) => m.needsCaregiver)
    const gi = arr.findIndex((m) => m.needsGuardian)
    if (ci > -1 && gi > -1 && ci > gi + 1) {
      const [cg] = arr.splice(ci, 1)
      arr.splice(gi + 1, 0, cg)
    }
    return arr
  })()

  // "Others" = members added here via ITS (the user's own group, not Mehmaan invites). Included by
  // default; a local set tracks any the user unticks. Kept separate from the family selection so the
  // footer "members selected" count is unchanged.
  const otherInvites = flow.invites.filter((i) => i.group)
  // Mehmaan invites (from the Invite Mehmaan page — no `group` flag). Shown here with their
  // invitation status so the user can track them right on the Add People screen. Events with no
  // Invite Mehmaan step never surface Mehmaan here (any belong to a different event's session).
  const mehmaanInvites = miqaat.hideInviteMehmaan ? [] : flow.invites.filter((i) => !i.group)
  const [othersUnchecked, setOthersUnchecked] = useState<Set<string>>(() => new Set())
  const isOtherChecked = (its: string) => !othersUnchecked.has(its)
  const toggleOther = (its: string) =>
    setOthersUnchecked((prev) => {
      const n = new Set(prev)
      if (n.has(its)) n.delete(its); else n.add(its)
      return n
    })
  const othersAllChecked = otherInvites.length > 0 && otherInvites.every((i) => isOtherChecked(i.its))
  const toggleAllOthers = () =>
    setOthersUnchecked((prev) => {
      const allChecked = otherInvites.every((i) => !prev.has(i.its))
      return allChecked ? new Set(otherInvites.map((i) => i.its)) : new Set()
    })

  const openSheet = (dependent: FamilyMember, kind: Kind) => {
    setPick(kind === 'guardian' ? flow.guardians[dependent.id] ?? null : flow.caregivers[dependent.id] ?? null)
    setSheet({ dependent, kind })
  }
  const closeSheet = () => { setSheet(null); setPick(null) }
  const confirmAssign = () => {
    if (!sheet || !pick) return
    if (sheet.kind === 'guardian') assignGuardian(sheet.dependent.id, pick)
    else assignCaregiver(sheet.dependent.id, pick)
    // Now that the dependent has a guardian/caregiver, auto-select it (it was unchecked + disabled).
    if (!selected.has(sheet.dependent.id)) toggleMember(sheet.dependent.id)
    closeSheet()
  }
  // Remove the current guardian/caregiver → the dependent returns to "Requires …".
  const removeAssign = () => {
    if (!sheet) return
    if (sheet.kind === 'guardian') removeGuardian(sheet.dependent.id)
    else removeCaregiver(sheet.dependent.id)
    closeSheet()
  }

  // Typing only updates the raw input and clears any prior result/error — it never searches on its
  // own. The search only runs on an explicit trigger (icon click / Enter), via `performSearch` below.
  const handleItsChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '').slice(0, 8)
    setItsInput(cleaned)
    setSearchResult(null)
    setCardSelected(false)
    setItsError(null)
    setNoResults(false)
  }

  const performSearch = () => {
    setCardSelected(false)
    if (itsInput.length !== 8) { setSearchResult(null); setNoResults(false); setItsError('Please enter a valid 8-digit ITS ID.'); return }
    if (flow.invites.some((i) => i.its === itsInput)) { setSearchResult(null); setNoResults(false); setItsError('This member is already in your list.'); return }
    setItsError(null)
    // Demo: any valid 8-digit ITS resolves to a realistic member (+ any linked dependents).
    const hit = lookupMember(itsInput)
    if (!hit) { setSearchResult(null); setNoResults(true); return }
    setNoResults(false)
    setSearchResult(hit)
  }

  const resetSearch = () => {
    setItsInput(''); setSearchResult(null); setCardSelected(false); setItsError(null); setNoResults(false); setShowDepPopup(false)
  }
  const sentToast = () => {
    window.clearTimeout(toastTimer.current)
    setToast('Invitation sent. The member will appear here once they accept your request.')
    toastTimer.current = window.setTimeout(() => setToast(null), 4500)
  }
  const commitSearchGroup = () => {
    if (!searchResult) return
    // group: true → these are the user's own group ("Others"), NOT Mehmaan invitations (no quota).
    addInvite({ its: searchResult.its, name: searchResult.name, age: searchResult.age, gender: searchResult.gender, status: 'pending', group: true, location: searchResult.location, opensAt: searchResult.opensAt })
    searchResult.dependents.forEach((d) =>
      addInvite({ its: d.its, name: d.name, age: d.age, gender: d.gender, status: 'pending', dependentOf: searchResult.its, group: true, location: d.location, opensAt: d.opensAt }))
    sentToast()
    resetSearch()
  }

  const handleAdd = () => {
    if (!searchResult) return
    // Add People members are the user's own group — no invitation-quota limit here.
    if (searchResult.dependents.length > 0) { setShowDepPopup(true); return }
    commitSearchGroup()
  }

  // Remove a group member from the "Group" table — cascades to any of their dependents.
  const removeGroupMember = (its: string) => {
    otherInvites.filter((i) => i.dependentOf === its).forEach((d) => removeInvite(d.its))
    removeInvite(its)
  }

  // ── Footer state ──
  //  • view mode (edit-registration, not yet editing): a single "Go back" → Modify Reservation.
  //  • editing (edit-registration, Edit tapped): "Continue" + a "Cancel" secondary that returns to view.
  //  • fresh registration: unchanged — "Continue".
  const goManage = () => nav(`/miqaats/${id}/manage`)
  const footerButton = viewMode ? 'Go back' : (effectiveSelectedCount > 0 ? `Continue(${effectiveSelectedCount})` : 'Continue')
  const onFooterButton = viewMode ? goManage : handleConfirm
  // Header CTA (edit-registration flow only), sitting top-right of the family header. In the read-only
  // view it reads "Edit" (unlocks the checkboxes / assignment changes / questionnaire); once editing it
  // becomes "Cancel" in the SAME spot, reverting to the read-only view. The footer carries no Cancel.
  const editCta = fromModify ? (
    editing ? (
      <button type="button" onClick={() => setEditing(false)}
        className="inline-flex h-[36px] shrink-0 items-center gap-[7px] rounded-[10px] border border-[#dcd4bf] bg-white px-[14px] text-[#5a6660] transition-colors hover:border-[#c9c0a6] hover:bg-[#faf8f2] active:scale-[0.98]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[14px]">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[14px] font-bold" style={{ fontFamily: FONT_SANS }} {...tx('Cancel')} />
      </button>
    ) : (
      <button type="button" onClick={() => setEditing(true)}
        className="inline-flex h-[36px] shrink-0 items-center gap-[7px] rounded-[10px] border border-[#e0cc93] bg-white px-[14px] text-[#a8843e] transition-colors hover:bg-[#faf6ea] active:scale-[0.98]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[15px]">
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[14px] font-bold" style={{ fontFamily: FONT_SANS }} {...tx('Edit')} />
      </button>
    )
  ) : null

  /* ── responsive footer (mobile only — desktop moves Confirm to the top of the panel) ── */
  const footer = (
    <div className="sm:hidden">
      <StickyFooter
        caption="People in your reservation"
        title={footerSummary}
        button={footerButton}
        onButton={onFooterButton}
      />
    </div>
  )

  /* ── per-row strip helper ── */
  const stripFor = (m: FamilyMember) => {
    const { t } = useT()
    const guardian = flow.guardians[m.id]
    const caregiver = flow.caregivers[m.id]
    if (m.needsGuardian) {
      return guardian
        ? <ResolvedStrip prefix={t('Guardian:')} name={nameOf(guardian)} onChange={() => openSheet(m, 'guardian')} interactive={editing} />
        : <WarnStrip text={t('Children under 10 cannot be allocated independently. Assign a guardian.')} onAssign={() => openSheet(m, 'guardian')} interactive={editing} />
    }
    if (m.needsCaregiver) {
      return caregiver
        ? <ResolvedStrip prefix={t('Under Care of:')} name={nameOf(caregiver)} onChange={() => openSheet(m, 'caregiver')} interactive={editing} />
        : <WarnStrip text={t('This member requires medical assistance. Assign a caregiver.')} onAssign={() => openSheet(m, 'caregiver')} interactive={editing} />
    }
    return null
  }

  /* ── one avatar+name+meta row inside the result card ── */
  const ResultRow = ({ name, meta, dependent }: { name: string; meta: string; dependent?: boolean }) => (
    <div className="flex items-center gap-[12px]">
      <div className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44]">
        <span className="text-[13px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>{initials(name)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="text-[14px] leading-[18px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...td(name)} />
        <p className="text-[12px] leading-[16px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>{isolateRuns(meta)}</p>
      </div>
      {dependent && (
        <span className="shrink-0 rounded-full bg-[#fbf2d8] px-[10px] py-[3px] text-[11px] font-bold text-[#9f8127]" style={{ fontFamily: FONT_SANS }} {...tx('Dependent')} />
      )}
    </div>
  )

  /* ── the member-found search-result card + ITS error (shared markup for both layouts) ── */
  const searchLinked = !!searchResult && searchResult.dependents.length > 0
  const addButton = (
    <button
      type="button"
      onClick={handleAdd}
      className="flex h-[46px] shrink-0 items-center justify-center gap-[8px] rounded-full bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] px-[30px] text-[15px] font-bold text-[#194a37] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-opacity active:opacity-80"
      style={{ fontFamily: FONT_SANS }}
    >
      <AddPersonIcon />
      
      {t('Add')}
    </button>
  )
  const matchFoundBadge = (
    <div className="flex items-center gap-[6px]">
      <CheckCircleIcon />
      <span className="text-[13px] font-bold text-[#1f7a4d]" style={{ fontFamily: FONT_SANS }} {...tx('Match found')} />
    </div>
  )
  // Result card mirrors the Invite Mehmaan lookup card: its own white card (drop shadow) with a
  // "Match found" badge, a centred 72px avatar + name/meta, and a gold pill CTA. The linked variant
  // keeps the group layout but adopts the same badge + card treatment.
  const searchResultCard = searchResult && (
    <div className="mt-[12px] w-full animate-[fadeInUp_320ms_ease-out] rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_10px_28px_-12px_rgba(21,64,47,0.28)] sm:p-[24px]">
      {searchLinked ? (
        // Member WITH linked dependents — the Add CTA adds the whole group.
        <>
          {matchFoundBadge}
          <div className="mt-[14px] flex items-center gap-[8px] rounded-[10px] bg-[#e1eef1] px-[12px] py-[9px]">
            <svg viewBox="0 0 16 16" fill="none" className="size-[14px] shrink-0"><path d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699" stroke="#2e6a7d" strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="text-[12.5px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT_SANS }} {...tx('Guardian + dependent · added together')} />
          </div>
          <div className="mt-[10px] flex flex-col gap-[8px]">
            <ResultRow name={searchResult.name} meta={`${tdText(searchResult.gender)} · ${t('Age')} ${age2(searchResult.age)} · ${t('ITS')} ${searchResult.its}`} />
            {searchResult.dependents.map((d) => (
              <ResultRow key={d.its} name={d.name} meta={`${tdText(d.gender)} · ${t('Age')} ${age2(d.age)} · ${t('ITS')} ${d.its}`} dependent />
            ))}
          </div>
          <div className="mt-[16px] flex items-center justify-between gap-[12px] border-t border-[#f0ebe0] pt-[16px]">
            <span className="text-[13px] font-semibold text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
              {1 + searchResult.dependents.length} members
            </span>
            {addButton}
          </div>
        </>
      ) : (
        // Single member — centred "match found" card matching the reference design.
        <>
          {matchFoundBadge}
          <div className="mt-[16px] flex flex-col items-center text-center">
            <div className="flex size-[72px] items-center justify-center rounded-full bg-[#1f5a44]">
              <span className="text-[26px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>{initials(searchResult.name)}</span>
            </div>
            <p className="mt-[14px] text-[17px] font-bold text-[#15402f]" style={{ fontFamily: FONT_SANS }} {...td(searchResult.name)} />
            <p className="mt-[4px] text-[13.5px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
              {isolateRuns(`${searchResult.gender ? `${tdText(searchResult.gender)} · ` : ''}${t('Age')} ${age2(searchResult.age)} · ${t('ITS')} ${searchResult.its}`)}
            </p>
            <div className="mt-[18px]">{addButton}</div>
          </div>
        </>
      )}
    </div>
  )

  const errorRow = itsError && (
    <div className="mt-[8px] flex animate-[noticeIn_320ms_ease-out] items-center gap-[6px]">
      <svg viewBox="0 0 24 24" className="size-[14px] shrink-0" fill="none">
        <circle cx="12" cy="12" r="9" fill="#e53e3e"/>
        <rect x="11" y="7" width="2" height="7" rx="1" fill="#fff"/>
        <circle cx="12" cy="16.5" r="1.1" fill="#fff"/>
      </svg>
      <p className="text-[12px] leading-[16px] text-[#c53030]" style={{ fontFamily: FONT_SANS, fontWeight: 500 }}>
        {itsError}
      </p>
    </div>
  )

  /* ── "No members found" empty state — shown after an explicit search comes back with no match ── */
  const noResultsCard = noResults && (
    <div className="mt-[12px] w-full animate-[fadeInUp_320ms_ease-out] rounded-[16px] border border-dashed border-[#e0d9c4] bg-[#faf8f2] px-[20px] py-[26px] text-center">
      <svg viewBox="0 0 20 20" fill="none" className="mx-auto size-[22px] text-[#a8a196]">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.8 13.8L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p className="mt-[8px] text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT_SANS }} {...tx('No members found')} />
      <p className="mt-[4px] text-[13px] leading-[18px] text-[#7a827c]" style={{ fontFamily: FONT_SANS }} {...tx('Try searching with a different ITS ID or member name.')} />
    </div>
  )

  /* ── clickable search-icon button — sits beside the ITS input, triggers the search ── */
  const searchIconButton = (
    <button
      type="button"
      onClick={performSearch}
      aria-label={t('Search')}
      className="flex size-[48px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-opacity active:opacity-80"
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-[19px] shrink-0 text-[#194a37]">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  )

  return (
    <PhoneScreen statusTone="dark" footer={footer}>

      {/* ── linked-dependent popup (shared); no invitation-limit popup — Add People is unlimited ── */}
      {showDepPopup && searchResult && searchResult.dependents.length > 0 && (
        <LinkedDependentPopup
          memberName={searchResult.name}
          dependents={searchResult.dependents}
          onCancel={() => setShowDepPopup(false)}
          onConfirm={commitSearchGroup}
        />
      )}

      {/* ── top chrome: phone status-bar offset + AppBar (shared mobile + desktop) ── */}
      <div>
        <AppBar notificationCount={3} onBellClick={() => {}} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MOBILE — unchanged single-column flow. `contents` keeps the children in the
          exact same layout as before; the whole group simply hides at sm+.
         ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="contents sm:hidden">

        {/* ── breadcrumb ── */}
        <div className="ms-[16px] sm:ms-0 mt-[13px] flex sm:mt-6">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/miqaats' },
              fromModify
                ? { label: t('Edit registration'), to: `/miqaats/${id}/manage` }
                : { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
              { label: t('Add people') },
            ]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
        </div>

        {/* ── event header (main) ── */}
        <div className="ms-[16px] mt-[18px]">
          <h1 className="text-[26px] leading-[32px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tdAuthored(miqaat.title)} />
          <p className="mt-[4px] text-[14px] leading-[19px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }} {...tx('Family & Group Allocation')} />
        </div>

        {/* ── section title + ITS search — hidden in the read-only edit-registration view ── */}
        {!viewMode && (
          <>
            <h2 className="ms-[16px] sm:ms-0 mt-[22px] text-[20px] leading-[28px] tracking-[0.2px] text-[#15402f] sm:mt-8 sm:text-[26px]"
              style={{ fontFamily: FONT_SERIF }} {...tx('Add People to group')} />

            {/* ── ITS input + Add button ── */}
            <div data-tour="add-people-section" className="mx-[16px] sm:mx-0 mt-[12px] sm:mt-4 sm:max-w-[440px]">
              <div className="flex items-center gap-[9px]">
                <div className={`relative h-[48px] flex-1 overflow-clip rounded-[12px] border border-solid bg-[#fbfbfb] ${itsError ? 'border-[#e53e3e]' : 'border-[#e7dfc9]'}`}>
                  <input
                    value={itsInput}
                    onChange={(e) => handleItsChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); performSearch() } }}
                    inputMode="numeric" maxLength={8} placeholder={t('Enter 8-digit ITS ID')}
                    className="absolute start-[11px] end-[11px] top-1/2 -translate-y-1/2 bg-transparent text-[16px] leading-normal text-[#23302a] outline-none placeholder:text-[#757575]"
                    style={{ fontFamily: FONT_SANS, fontWeight: 400 }}
                  />
                </div>
                {searchIconButton}
              </div>

              {/* ── member found card — click Add inside the card to add ── */}
              {searchResultCard}

              {/* ── no match for the searched ITS ── */}
              {noResultsCard}

              {/* ── ITS validation error ── */}
              {errorRow}
            </div>
          </>
        )}

        {/* ── YOUR FAMILY divider ── */}
        <div className="mx-[16px] sm:mx-0 mt-[18px] flex h-[18px] items-center sm:mt-8">
          <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
          <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
            style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx('Your Family')} />
          <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
        </div>

        {/* Edit CTA — read-only edit-registration view only */}
        {editCta && <div className="mx-[16px] mt-[12px] flex justify-end">{editCta}</div>}

        {/* ── MOBILE: card list ── */}
        <div data-tour="family-table" className="mx-[16px] mt-[16px] flex flex-col gap-[8px]">
          {family.map((m) => (
            <PersonCard key={m.id} member={m} badge={roleBadgeFor(m, flow.guardians, flow.caregivers)}
              checked={selected.has(m.id)}
              selectable={!viewMode}
              dimmed={!!memberBlockedReason(m, flow.guardians, flow.caregivers)}
              onToggle={() => tryToggleMember(m)}>
              {stripFor(m)}
            </PersonCard>
          ))}
        </div>

        {/* ── GROUP divider + cards (mobile) — members added via ITS on this screen ── */}
        {otherInvites.length > 0 && (
          <>
            <div className="mx-[16px] mt-[20px] flex h-[18px] items-center">
              <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
              <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
                style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx('Group')} />
              <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
            </div>
            <div className="mx-[16px] mt-[16px] flex flex-col gap-[8px]">
              {otherInvites.map((inv) => {
                const { t } = useT()
                const gender = inv.gender ?? lookupMember(inv.its)?.gender
                const meta = [gender, `Age ${age2(inv.age)}`, `ITS ${inv.its}`, inv.dependentOf ? t('Dependent') : null].filter(Boolean).join(' · ')
                return (
                  <div key={inv.its} className="w-full rounded-[14px] border border-solid border-[#e7dfc9] bg-[#fffdf8] p-[13px]">
                    <div className="flex items-start gap-[10px]">
                      <div className="mt-[2px] flex size-[36px] shrink-0 items-center justify-center overflow-clip rounded-full bg-[#1f5a44]">
                        <span className="text-[14px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>{initials(inv.name)}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <p className="text-[14px] leading-[18px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...td(inv.name)} />
                        <p className="text-[12px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>{isolateRuns(meta)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-[8px]">
                        <StatusPill status={inv.status} />
                        {editing && <RemoveButton onClick={() => removeGroupMember(inv.its)} />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── INVITED MEHMAAN divider + status cards (mobile) ── */}
        {mehmaanInvites.length > 0 && (
          <>
            <div className="mx-[16px] mt-[20px] flex h-[18px] items-center">
              <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
              <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
                style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...tx('Invited Mehmaan')} />
              <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
            </div>
            <div className="mx-[16px] mt-[16px] flex flex-col gap-[8px]">
              {mehmaanInvites.map((inv) => {
                const { t } = useT()
                const gender = inv.gender ?? lookupMember(inv.its)?.gender
                const meta = [gender, `Age ${age2(inv.age)}`, `ITS ${inv.its}`, inv.dependentOf ? t('Dependent') : null].filter(Boolean).join(' · ')
                return (
                  <div key={inv.its} className="w-full rounded-[14px] border border-solid border-[#e7dfc9] bg-[#fffdf8] p-[13px]">
                    <div className="flex items-start gap-[10px]">
                      <div className="mt-[2px] flex size-[36px] shrink-0 items-center justify-center overflow-clip rounded-full bg-[#1f5a44]">
                        <span className="text-[14px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>{initials(inv.name)}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <p className="text-[14px] leading-[18px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...td(inv.name)} />
                        <p className="text-[12px] leading-[18px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>{isolateRuns(meta)}</p>
                      </div>
                      <StatusPill status={inv.status} />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Registration Questionnaire variation — inline below the family cards (mobile) ── */}
        <div className="mx-[16px] mt-[24px]">
          {renderQuestionnaireVariation('apm-')}
        </div>

        <div className="mb-[20px]" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          DESKTOP — two-panel layout (cream sidebar + white allocation panel).
          Full-bleed so the two columns reach the viewport edges below the app bar.
         ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="hidden sm:block sm-full-bleed">
        <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">

          {/* ───────── LEFT sidebar (stays in place; right panel scrolls) ───────── */}
          <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[24px] overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">

            {/* breadcrumb header — Go back merged in as the leading item */}
            <Breadcrumb
              items={[
                { label: 'Home', to: '/miqaats' },
                fromModify
                  ? { label: t('Edit registration'), to: `/miqaats/${id}/manage` }
                  : { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
                { label: t('Add people') },
              ]}
              onNavigate={(to) => nav(to)}
              onBack={() => nav(-1)}
              activeColor="#a8843e"
              dense
            />

            {/* Add People to group card — replaced by a read-only note in the edit-registration view */}
            {viewMode ? (
              <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
                <p className="text-[22px] leading-[26px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Your reservation')} />
                <p className="mt-[10px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>
                  Reviewing the people and details on this registration. Tap <span className="font-bold text-[#a8843e]" {...tx('Edit')} /> to change your group, guardians, or details.
                </p>
              </div>
            ) : (
              <div data-tour="add-people-section" className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
                <p className="text-[22px] leading-[26px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Add People to group')} />
                <div className="mt-[16px] flex items-center gap-[10px]">
                  <div className={`group relative h-[48px] flex-1 overflow-clip rounded-[12px] border border-solid bg-[#fbfbfb] transition-all duration-200 focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12 ${itsError ? 'border-[#e53e3e]' : 'border-[#e7dfc9] hover:border-[#d6cbab]'}`}>
                    <input
                      value={itsInput}
                      onChange={(e) => handleItsChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); performSearch() } }}
                      inputMode="numeric" maxLength={8} placeholder={t('Enter 8-digit ITS ID')}
                      className="absolute start-[13px] end-[13px] top-1/2 -translate-y-1/2 bg-transparent text-[15px] leading-normal text-[#23302a] outline-none placeholder:text-[#9aa39d]"
                      style={{ fontFamily: FONT_SANS, fontWeight: 400 }}
                    />
                  </div>
                  {searchIconButton}
                </div>

                {searchResultCard}
                {noResultsCard}
                {errorRow}
              </div>
            )}
          </aside>

          {/* ───────── RIGHT allocation panel — scrollable content + sticky footer CTA ───────── */}
          <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">

            {/* scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
              <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tdAuthored(miqaat.title)} />
              <p className="mt-[6px] text-[15px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }} {...tx('Family & Group Allocation')} />

              {/* Your family */}
              <div className="mt-[18px] flex items-center justify-between gap-[12px]">
                <p className="text-[20px] leading-[26px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Your family')} />
                {editCta}
              </div>
              <div data-tour="family-table" className="mt-[14px]">
                <MembersTableShell selectable={!viewMode} selectAllChecked={allSelected} onSelectAll={handleSelectAll}>
                  {desktopFamily.map((m, idx) => {
                    const strip = stripFor(m)
                    return (
                      <DesktopRow
                        key={m.id}
                        selectable={!viewMode}
                        plain={viewMode}
                        checked={selected.has(m.id)}
                        dimmed={!!memberBlockedReason(m, flow.guardians, flow.caregivers)}
                        onToggle={() => tryToggleMember(m)}
                        name={m.name}
                        meta={`${tdText(m.relation)} · ${tdText(m.gender)} · ${t('Age')} ${age2(m.age)} · ${t('ITS')} ${m.its}`}
                        isLast={idx === desktopFamily.length - 1}
                        status={
                          strip
                            ? <div className="flex justify-end"><div className="w-full max-w-[470px]">{strip}</div></div>
                            : <RoleBadge badge={roleBadgeFor(m, flow.guardians, flow.caregivers)} />
                        }
                      />
                    )
                  })}
                </MembersTableShell>
              </div>

              {/* Others — members added here via ITS on the Add People page. (Mehmaan invitations from
                  the Invite Mehmaan page appear in the "Invited Mehmaan" section below, with status.) */}
              {otherInvites.length > 0 && (
                <>
                  <p className="mt-[28px] text-[20px] leading-[26px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Group')} />
                  <div className="mt-[14px]">
                    <MembersTableShell selectAllChecked={othersAllChecked} onSelectAll={toggleAllOthers}>
                      {otherInvites.map((inv, idx) => {
                        const gender = inv.gender ?? lookupMember(inv.its)?.gender
                        return (
                          <DesktopRow
                            key={inv.its}
                            name={inv.name}
                            meta={`${gender ? `${gender} · ` : ''}${t('Age')} ${age2(inv.age)} · ${t('ITS')} ${inv.its}${inv.dependentOf ? ' · Dependent' : ''}`}
                            isLast={idx === otherInvites.length - 1}
                            status={
                              <div className="flex items-center justify-end gap-[10px]">
                                <StatusPill status={inv.status} />
                                {editing && <RemoveButton onClick={() => removeGroupMember(inv.its)} />}
                              </div>
                            }
                          />
                        )
                      })}
                    </MembersTableShell>
                  </div>
                </>
              )}

              {/* Invited Mehmaan — guests invited from the Invite Mehmaan page, with live status. */}
              {mehmaanInvites.length > 0 && (
                <>
                  <p className="mt-[28px] text-[20px] leading-[26px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Invited Mehmaan')} />
                  <div className="mt-[14px]">
                    <MembersTableShell>
                      {mehmaanInvites.map((inv, idx) => {
                        const gender = inv.gender ?? lookupMember(inv.its)?.gender
                        return (
                          <DesktopRow
                            key={inv.its}
                            name={inv.name}
                            meta={`${gender ? `${gender} · ` : ''}${t('Age')} ${age2(inv.age)} · ${t('ITS')} ${inv.its}${inv.dependentOf ? ' · Dependent' : ''}`}
                            isLast={idx === mehmaanInvites.length - 1}
                            status={<div className="flex justify-end"><StatusPill status={inv.status} /></div>}
                          />
                        )
                      })}
                    </MembersTableShell>
                  </div>
                </>
              )}

              {/* ── Registration Questionnaire variation — inline in the right panel, below Your family ── */}
              <div className="mt-[32px]">
                {renderQuestionnaireVariation('ap-')}
              </div>
            </div>

            {/* sticky footer CTA — restored standard StickyFooter, pinned inside the white panel */}
            <div className="shrink-0">
              <StickyFooter
                caption="People in your reservation"
                title={footerSummary}
                button={footerButton}
                onButton={onFooterButton}
              />
            </div>
          </section>
        </div>
      </div>

      {/* ── success toast (shared) ── */}
      {toast && (
        <div className="fixed bottom-[110px] start-[16px] end-[16px] z-50 animate-[noticeIn_320ms_ease-out] sm:start-auto sm:end-[var(--content-px)] sm:w-[380px]">
          <div className="flex items-start gap-[10px] rounded-[14px] bg-[#1f5a44] px-[14px] py-[12px] shadow-[0_8px_24px_-8px_rgba(21,64,47,0.3)]">
            <svg viewBox="0 0 24 24" className="mt-[1px] size-[16px] shrink-0" fill="none">
              <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.2)"/>
              <path d="M8 12l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-[13px] leading-[18px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 500 }}>
              {toast}
            </p>
          </div>
        </div>
      )}

      {/* ── validation / blocked-selection error toast (shared) ── */}
      {err && (
        <div className="fixed bottom-[110px] start-[16px] end-[16px] z-50 animate-[noticeIn_320ms_ease-out] sm:start-auto sm:end-[var(--content-px)] sm:w-[380px]">
          <div className="flex items-start gap-[10px] rounded-[14px] bg-[#c53030] px-[14px] py-[12px] shadow-[0_8px_24px_-8px_rgba(165,42,42,0.35)]">
            <svg viewBox="0 0 24 24" className="mt-[1px] size-[16px] shrink-0" fill="none">
              <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.2)"/>
              <rect x="11" y="6.5" width="2" height="8" rx="1" fill="#fff"/>
              <circle cx="12" cy="17" r="1.2" fill="#fff"/>
            </svg>
            <p className="text-[13px] leading-[18px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 500 }}>
              {err}
            </p>
          </div>
        </div>
      )}

      {/* ── assign sheet: bottom sheet on mobile, centered modal on desktop (shared) ── */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-name="AssignSheet">
          <button type="button" aria-label={t('Close')} onClick={closeSheet} className="absolute inset-0 bg-[rgba(0,0,0,0.5)]" />
          <div className="relative flex w-full max-w-[480px] flex-col">
            <div className="relative flex max-h-[90dvh] w-full flex-col overflow-clip rounded-tl-[30px] rounded-tr-[30px] bg-white sm:max-h-[85vh] sm:rounded-[24px]">
              {/* Header — fixed */}
              <div className="shrink-0 px-[16px] pt-[4px] sm:pt-[24px]">
                <div className="-mx-[16px] flex h-[20px] items-end justify-center pb-[6px] sm:hidden">
                  <div className="h-[5px] w-[134px] rounded-[100px] bg-black opacity-30" />
                </div>
                <p className="text-[12px] uppercase leading-[17px] tracking-[0.5px] text-[#a8843e]"
                  style={{ fontFamily: FONT_SANS, fontWeight: 600 }}>
                  {sheet.kind === 'guardian' ? t('Assign guardian') : 'Assign caregiver'}
                </p>
                <p className="mt-[5px] text-[16px] leading-[20px] text-[#15402f]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>
                  For {sheet.dependent.name}
                </p>
                <p className="mt-[5px] text-[14px] leading-[18px] text-[#8a938e]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>
                  {tdText(sheet.dependent.relation)} · {tdText(sheet.dependent.gender)} · {t('Age')} {age2(sheet.dependent.age)} · Choose an adult family member
                </p>
              </div>
              {/* Body — scrolls only if the list is long */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[16px] pb-[16px] pt-[16px]">
                <div className="flex flex-col gap-[8px]">
                  {eligibleAdults.map((a) => {
                    const { t } = useT()
                    const active = pick === a.id
                    const isCurrent = a.id === currentAssignedId
                    return (
                      <button key={a.id} type="button" onClick={() => setPick(a.id)}
                        className={`flex min-h-[61px] w-full items-center gap-[10px] rounded-[12px] border border-solid px-[11px] py-[8px] text-start sm:transition-colors ${
                          active ? 'border-[#1f5a44] bg-[#eef6f1]' : 'border-[#fcf5df] bg-white sm:hover:border-[#e7dfc9] sm:hover:bg-[#fdfbf4]'
                        }`}>
                        <img src={active ? RADIO_ON : RADIO_OFF} alt="" className="size-[24px] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
                            <p className="text-[14px] leading-[20px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }} {...td(a.name)} />
                            {isCurrent && (
                              <span className="rounded-full bg-[#e4efe7] px-[8px] py-[2px] text-[11px] font-bold text-[#276245]" style={{ fontFamily: FONT_SANS }}>
                                
                                {t('Current')} {sheet.kind === 'guardian' ? t('Guardian') : t('Caregiver')}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] leading-[18px] text-[#8a938e]" style={{ fontFamily: FONT_SANS, fontWeight: 400 }}>
                            {isolateRuns(`${tdText(a.relation)} · ${tdText(a.gender)} · ${t('Age')} ${age2(a.age)} · ${t('ITS')} ${a.its}`)}
                          </p>
                        </div>
                        {a.role === 'registrant' && <RoleBadge badge="registrant" />}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Footer — fixed */}
              <div className="shrink-0 border-t border-solid border-[#dfd7c2] bg-white px-[16px] pb-[max(env(safe-area-inset-bottom),12px)] pt-[12px]">
                {currentAssignedId && (
                  <button type="button" onClick={removeAssign}
                    className="mb-[10px] flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[14px] border border-solid border-[#eccfcb] bg-white text-[#c0392b] transition-colors hover:bg-[#fdf2f1] active:scale-[0.99]">
                    <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
                      <path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 13a1 1 0 001 1h10a1 1 0 001-1l1-13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[15px] font-bold" style={{ fontFamily: FONT_SANS }}>
                      {sheet.kind === 'guardian' ? t('Remove Guardian') : 'Remove Caregiver'}
                    </span>
                  </button>
                )}
                <button type="button" disabled={!pick} onClick={confirmAssign}
                  className="flex h-[52px] w-full items-center justify-center gap-[8px] rounded-[14px] bg-[#1f5a44] shadow-[0_6px_22px_-8px_rgba(21,64,47,0.18)] disabled:opacity-50 sm:transition-all sm:duration-200 sm:hover:bg-[#184a37] sm:active:scale-[0.99] sm:disabled:hover:bg-[#1f5a44]">
                  <img src={PERSON_ADD} alt="" className="size-[18px]" />
                  <span className="text-[15px] text-white" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>
                    {currentAssignedId ? (sheet.kind === 'guardian' ? 'Update guardian' : 'Update caregiver') : (sheet.kind === 'guardian' ? t('Add guardian') : 'Add caregiver')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "You missed some members" — confirm before continuing without the unassigned dependents. */}
      <MissedMemberSheet
        open={missedOpen}
        count={missedCount}
        onClose={() => setMissedOpen(false)}
        onConfirm={() => { setMissedOpen(false); goReview() }}
      />
    </PhoneScreen>
  )
}
