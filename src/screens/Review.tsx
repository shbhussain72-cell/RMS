import type { ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { Iso, isolateRuns } from '../components/Bidi'
import { memberMeta } from '../components/MemberMeta'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import StickyFooter from '../components/figma/StickyFooter'
import { liveCities, lookupMember, miqaats, zonesByCityId, type FamilyMember } from '../data/seed'
import { buildGroups, buildRequestParty, effectiveSelectedIds, type BadgeKind } from '../lib/group'
import RoleBadge from '../components/figma/RoleBadge'
import { InvitedMembersTable, InvitedMembersCards, type InvitedGroup } from '../components/figma/InvitedMembers'
import { QuestionnaireSummary } from '../components/questionnaire/QuestionnaireFields'
import { headcount, useStore, type Invite } from '../store'
import { plural, useT } from '../i18n'
import { notLanguage } from '../components/NotLanguage'

const FMU = { fontFamily: 'Mulish, system-ui, sans-serif' } as const
const FM = { fontFamily: 'Marcellus, serif' } as const

/* ---- chain-link icon ---- */
function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="block h-full w-full">
      <path
        d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699"
        stroke="#2E6A7D"
        strokeWidth="1.375"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

const agePad = (age: number) => String(age).padStart(2, '0')

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="relative shrink-0 overflow-clip rounded-full bg-[#1f5a44]" style={{ width: size, height: size }}>
      <span className="absolute left-1/2 top-[calc(50%-0.5px)] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-white"
        style={{ ...FMU, fontWeight: 700, fontSize: Math.round(size * 0.39), lineHeight: `${Math.round(size * 0.5)}px` }}
       {...notLanguage}>
        {initials(name)}
      </span>
    </div>
  )
}

/* ── mobile sub-components (unchanged) ── */

function GroupCard({ label, members }: { label: string; members: { member: FamilyMember; badge: BadgeKind }[] }) {
  return (
    <div className="w-full overflow-clip rounded-[14px] border border-solid border-[#e7dfc9] bg-white">
      <div className="flex h-[32px] items-center gap-[10px] bg-[#e1eef1] px-[14px]">
        <div className="size-[16px] shrink-0"><LinkIcon /></div>
        <p className="whitespace-nowrap text-[12px] leading-[16px] text-[#2e6a7d]" style={{ ...FMU, fontWeight: 700 }}>{label}</p>
      </div>
      <div className="relative">
        {members.map((m, mi) => (
          <div key={m.member.id} className="relative flex items-center gap-[6px] px-[13px] py-[13px]">
            {members.length > 1 && (
              <span className="pointer-events-none absolute start-[30px] w-[2px] bg-[#fac775]" style={{ top: mi === 0 ? '50%' : 0, bottom: mi === members.length - 1 ? '50%' : 0 }} />
            )}
            <div className="relative shrink-0"><Avatar name={m.member.name} /></div>
            <div className="min-w-0 flex-1"><RowText member={m.member} /></div>
            <RoleBadge kind={m.badge} />
          </div>
        ))}
      </div>
    </div>
  )
}

function RowText({ member }: { member: FamilyMember }) {
  const { t, td, tdText } = useT()
  return (
    <div className="flex min-w-0 flex-col items-start gap-[2px]">
      <p className="w-full text-[14px] leading-[18px] text-[#23302a]" style={{ ...FMU, fontWeight: 700 }} {...td(member.name)} />
      {/* One isolated string rather than separate JSX expressions — each expression would be its
          own text node, leaving `ITS` and the id as bare runs inside the RTL paragraph. */}
      <p className="w-full text-[12px] leading-[16px] text-[#5a6660]" style={{ ...FMU, fontWeight: 400 }}>
        {memberMeta({ relation: tdText(member.relation), gender: tdText(member.gender), age: agePad(member.age), its: member.its }, t)}
      </p>
    </div>
  )
}

function SingleCard({ member }: { member: FamilyMember }) {
  return (
    <div className="flex min-h-[62px] w-full items-center gap-[6px] rounded-[8px] border border-solid border-[#ece4d2] bg-white px-[13px] py-[10px]">
      <Avatar name={member.name} />
      <div className="min-w-0 flex-1"><RowText member={member} /></div>
    </div>
  )
}

// ReactNode, not string: `tx()` may hand this an array (English fallback + gap marker).
function SectionDivider({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-[18px] w-full">
      <div className="absolute start-0 end-[261.5px] top-[calc(50%-0.5px)] h-px bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
      <p className="absolute left-[calc(50%+0.5px)] top-[calc(50%-2px)] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
        style={{ ...FMU, fontWeight: 700 }}>{children}</p>
      <div className="absolute start-[261.47px] end-0 top-[calc(50%-0.5px)] h-px bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
    </div>
  )
}

/* ── "Edit" CTA — jumps back to Add People to change the group; shown beside the family header on
   both mobile and desktop so the reviewer can revise their selection without hunting the breadcrumb. */
function EditButton({ onClick }: { onClick: () => void }) {
  const { tx } = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[40px] shrink-0 items-center gap-[8px] rounded-[12px] border border-solid border-[#dcd4bf] bg-white px-[16px] transition-all duration-200 hover:border-[#c2a04e] hover:bg-[#faf8f2] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/25"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[16px]">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="#15402f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-bold text-[#15402f]" style={FMU} {...tx('Edit')} />
    </button>
  )
}

function StatTile({ value, numColor, line1, line2 }: { value: number; numColor: string; line1: string; line2: string }) {
  return (
    /* min-w-[85px]: the widest label is "Headcount" at 73px (EN; 66px LSD), plus the 12px of
       padding below. The row wraps rather than shrinking past it — three tiles share ~215px at
       768, which is 67px each, and the label was sheared by the tile's own overflow-clip. */
    <div className="relative h-[82px] min-w-[85px] flex-1 overflow-clip rounded-[8px] border border-solid border-[#e7dfc9] bg-[#fffdf8]">
      {/* The inner block used to be pinned to w-[64px] — narrower than the label it holds at every
          width, and still 64px inside a 147px tile at 1440. It spans the tile now. */}
      <div className="absolute start-0 end-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-[2px] px-[6px] text-center">
        <p className="text-[18px] leading-[20px]" style={{ ...FMU, fontWeight: 700, color: numColor }}>{String(value).padStart(2, '0')}</p>
        {/* <Iso>, not isolateRuns: a tile can pair a translated `line1` with an untranslated
            `line2` (the Group tile stacks an LSD word over the English "members"), and
            `isolateRuns` returns a BARE string for a single-run value — so a pure-Latin half got
            no wrapper at all and stayed unbounded inside the RTL tile. <Iso> always wraps. */}
        <p className="whitespace-nowrap text-[14px] leading-[20px] text-[#5a6660]" style={{ ...FMU, fontWeight: 700 }}><Iso>{line1}</Iso><br /><Iso>{line2}</Iso></p>
      </div>
    </div>
  )
}

/* ── desktop group table (MEMBER header + reserve-together sub-headers + gold connectors + badges) ── */
function FamilyTable({ groups }: { groups: ReturnType<typeof buildGroups> }) {
  const { tx, t, td, tdText } = useT()
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#e7dfc9] bg-white shadow-[0_6px_24px_-12px_rgba(15,77,60,0.12)]">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '56%' }} /><col /></colgroup>
        <thead>
          <tr className="border-b border-[#ece7da] bg-[#faf8f2]">
            <th className="px-[20px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e] whitespace-nowrap" style={FMU} {...tx('Member')} />
            <th className="px-[20px] py-[10px]" />
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const isLinked = !!g.label
          const hasConnector = g.members.length > 1
          return (
            <tbody key={gi}>
              {isLinked && (
                <tr className="bg-[#e1eef1]">
                  <td colSpan={2} className="px-[20px] py-[9px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={FMU}>
                      <span className="size-[15px] shrink-0"><LinkIcon /></span>
                      {g.label!.replace('registered together', t('reserve together'))}
                    </span>
                  </td>
                </tr>
              )}
              {g.members.map((m, mi) => {
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                return (
                  <tr key={m.member.id} className={isLinked ? '' : 'border-t border-[#ece7da]'} style={{ background: 'white' }}>
                    <td className="relative px-[20px] py-[9px]">
                      {hasConnector && (
                        <span className="pointer-events-none absolute start-[37px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                      )}
                      <div className="relative flex items-center gap-[10px]">
                        <Avatar name={m.member.name} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={FMU} {...td(m.member.name)} />
                          <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={FMU}>
                            {memberMeta({ relation: tdText(m.member.relation), gender: tdText(m.member.gender), age: agePad(m.member.age), its: m.member.its }, t)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-[20px] py-[9px] align-middle">
                      {m.badge ? <RoleBadge kind={m.badge} /> : null}
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

export default function Review() {
  const { t, tx, tdAuthored } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // Carried from the Modify Reservation "Edit registration" entry so registering here returns to that
  // screen (via the success + Post Registration Details steps) instead of the fresh-registration roster.
  const fromModify = (location.state as { fromModify?: boolean } | null)?.fromModify === true
  const flow = useStore((s) => s.flow)
  const submit = useStore((s) => s.submit)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const autoAllocateCityZone = useStore((s) => s.autoAllocateCityZone)
  const receiveInvitation = useStore((s) => s.receiveInvitation)
  const requestReopen = useStore((s) => s.requestReopen)
  const reopenRequests = useStore((s) => s.reopenRequests)

  const total = headcount(flow)
  // Valid family count — excludes any dependent without an eligible (assigned+selected) guardian/caregiver.
  const familyCount = effectiveSelectedIds(flow.selectedMemberIds, flow.guardians, flow.caregivers).length
  const miqaat = miqaats.find((m) => m.id === id) ?? miqaats[0]
  // Registration deadline already passed (the user arrived here via the Ask Help redirect for a missed
  // event) and no approval yet → this Review submits a *request* to register (with the members chosen on
  // Add People), not a direct registration. Once approved, the deadline bypass makes it a normal Register.
  const isRequest = miqaat.countdownSeconds <= 0 && !(id && reopenRequests[id]?.approved)
  const groups = buildGroups(flow.selectedMemberIds, flow.guardians, flow.caregivers)
  const linkedGroups = groups.filter((g) => g.label)
  const singles = groups.filter((g) => !g.label)

  // Invites split by origin: Add-People "Others" (group: true — part of the user's own group)
  // vs Invite-Mehmaan guests (no group flag). They render in separate sections so an "Others"
  // member added via Add group is never mislabelled as an Invited Mehmaan.
  const inviteGender = (i: { its: string; gender?: 'Male' | 'Female' }) => i.gender ?? lookupMember(i.its)?.gender
  const toGroups = (list: Invite[]): InvitedGroup[] =>
    list.filter((i) => !i.dependentOf).map((m) => ({
      primary: { its: m.its, name: m.name, age: m.age, gender: inviteGender(m) },
      dependents: list.filter((d) => d.dependentOf === m.its).map((d) => ({ its: d.its, name: d.name, age: d.age, gender: inviteGender(d) })),
    }))
  const otherInvites = flow.invites.filter((i) => i.group)
  const mehmaanInvites = flow.invites.filter((i) => !i.group)
  const otherGroups = toGroups(otherInvites)
  const mehmaanGroups = toGroups(mehmaanInvites)
  // "My family members" tile counts the immediate family only; the "Group members" tile counts the
  // people added via Add People (group: true). The participant breakdown already shows in the tiles
  // above, so the footer carries an action hint instead of repeating the count.
  // CLASS A, NOT FIXED HERE. `You're all set` HAS a wordlist entry and this renders English
  // anyway, because the strings are literals the scanner cannot see. Routing both branches
  // through tx() is the fix and is two lines — but it also makes `Ready to send` visible as
  // a NO_ROW gap, which grows scripts/lsd-baseline.json. That file may only grow by someone
  // deliberately running `check-lsd-coverage --baseline`, and that is the wordlist owner's
  // call, not a side effect of a layout branch. Pair it with an xlsx row for the new key.
  const footerHint = isRequest ? 'Ready to send' : "You're all set"

  const doSubmit = () => {
    if (id) setActiveMiqaat(id)
    // Missed-deadline path: file a registration request (carrying the members picked here) and return
    // Home, where the card shows it pending. No direct registration, no city/zone step.
    if (isRequest) {
      // Capture the requested party so "View members" (Requested card / detail page / Track My
      // Requests) can show who's the registrant, who's a dependent, and who they're tagged with —
      // grouped + role-badged, plus a flat name list for the older count-only surfaces.
      const memberParty = buildRequestParty(flow.selectedMemberIds, flow.guardians, flow.caregivers, flow.invites)
      const memberNames = memberParty.flatMap((g) => g.members.map((mm) => mm.name))
      if (id) requestReopen(id, 'register', 'Registration', { memberCount: total, memberNames, memberParty })
      // Mirror City/Zone Selection: surface a one-shot "Request Sent" popup on Home so the
      // registration request gets the same visible confirmation the city/zone requests do.
      nav('/miqaats', { state: { requestSent: t(plural(total, 'Your registration request ({n} member) has been submitted for approval. You will find it in the Requested section below.', 'Your registration request ({n} members) has been submitted for approval. You will find it in the Requested section below.'), { n: total }) } })
      return
    }
    submit()
    // Local events skip city/zone selection — allocate both immediately so the user only waits on Raza.
    if (miqaat.local) {
      const hostCity = liveCities.find((c) => c.name === miqaat.hostCity) ?? liveCities[0]
      const zone = zonesByCityId[hostCity.id]?.[0]
      if (zone) autoAllocateCityZone(hostCity, zone)
    }
    // Eid-e-Ghadeer: the group invitation only arrives once you've registered — unlock the
    // "Invitation received" notification and arm the one-shot Home banner so the user notices it.
    if (miqaat.autoAllocateSelfViaInvite) receiveInvitation()
    // Same-day flow: go straight into City Selection (queue loader → city list) instead of the
    // Success screen, so the user continues registration → city → zone in one sitting.
    nav(miqaat.sameDayFlow ? `/miqaats/${id}/city` : `/miqaats/${id}/success`, fromModify ? { state: { fromModify: true } } : undefined)
  }
  // "Edit" returns to Add People so the user can revise the group before registering (preserving the
  // Modify-Reservation origin so a second Continue still routes back to Modify Reservation at the end).
  const goEdit = () => nav(`/miqaats/${id}/people`, fromModify ? { state: { fromModify: true } } : undefined)

  const footer = (
    <StickyFooter
      caption={isRequest ? tx('Submit a registration request') : tx('Ready for Registration')}
      title={footerHint}
      button={isRequest ? t('Request') : t('Register ({n})', { n: total })}
      onButton={doSubmit}
    />
  )

  return (
    <PhoneScreen footer={<div className="sm:hidden">{footer}</div>}>
      <div>
        <AppBar notificationCount={3} onBellClick={() => {}} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE — unchanged single-column flow.
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="contents sm:hidden">
        <div className="mt-[12px] flex w-full flex-col items-start gap-[6px] ps-[16px]">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/miqaats' },
              { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
              { label: t('Add people'), to: `/miqaats/${id}/people` },
              ...(miqaat.hideInviteMehmaan ? [] : [{ label: t('Invitations'), to: `/miqaats/${id}/invite` }]),
              { label: t('Summary') },
            ]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
        </div>

        <h1 className="mt-[20px] ps-[16px] text-[24px] leading-[28px] tracking-[0.2px] text-[#15402f]" style={FM} {...tdAuthored(miqaat.title)} />
        <p className="mt-[6px] ps-[16px] text-[16px] leading-[22px] text-[#15402f]" style={FM} {...tx('Review & Register')} />
        <p className="mt-[10px] ps-[16px] pe-[16px] text-[14px] leading-[21px] text-[#5a6660]" style={{ ...FMU, fontWeight: 400 }} {...tx('Check your group before submitting. You can go back to edit any step.')} />

        <h2 className="mt-[24px] ps-[16px] text-[20px] leading-[28px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Participant Count')} />
        <div data-tour="review-section" className="mt-[12px] flex flex-wrap gap-[15px] ps-[16px] pe-[16px]">
          <StatTile value={total} numColor="#1f5a44" line1="Total" line2="Headcount" />
          <StatTile value={familyCount} numColor="#a8843e" line1="My family" line2="members" />
          <StatTile value={otherInvites.length} numColor="#a8843e" line1={t('Group')} line2="members" />
        </div>

        <div className="mt-[24px]"><SectionDivider {...tx('YOUR FAMILY')} /></div>
        <div className="mt-[14px] flex justify-end ps-[16px] pe-[16px]"><EditButton onClick={goEdit} /></div>
        <div className="mt-[12px] flex flex-col items-start gap-[12px] ps-[16px] pe-[16px]">
          {groups.length === 0 && (
            <p className="text-[14px] leading-[18px] text-[#5a6660]" style={{ ...FMU, fontWeight: 400 }} {...tx('No family members selected.')} />
          )}
          {linkedGroups.map((g, i) => (
            <GroupCard key={`g${i}`} label={g.label!} members={g.members} />
          ))}
          {singles.map((g) => (
            <SingleCard key={g.members[0].member.id} member={g.members[0].member} />
          ))}
        </div>
        {otherGroups.length > 0 && (
          <>
            <div className="mt-[24px]"><SectionDivider {...tx('Group')} /></div>
            <div className="mt-[16px] flex flex-col items-start gap-[8px] ps-[16px] pe-[16px]">
              <div className="w-full"><InvitedMembersCards groups={otherGroups} /></div>
            </div>
          </>
        )}
        <div className="mt-[24px]"><SectionDivider {...tx('Invite Mehmaan')} /></div>
        <div className="mb-[24px] mt-[16px] flex flex-col items-start gap-[8px] ps-[16px] pe-[16px]">
          {mehmaanInvites.length === 0 ? (
            <p className="text-[14px] leading-[18px] text-[#5a6660]" style={{ ...FMU, fontWeight: 400 }} {...tx('No mehmaan invited.')} />
          ) : (
            <div className="w-full"><InvitedMembersCards groups={mehmaanGroups} /></div>
          )}
        </div>

        <div className="mt-[24px]"><SectionDivider {...tx('Other Details')} /></div>
        <div className="mb-[24px] mt-[16px] flex flex-col items-start gap-[12px] ps-[16px] pe-[16px]">
          <QuestionnaireSummary q={flow.questionnaire} idPrefix="rv-" hideIntro />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP — two-panel layout (cream summary sidebar + white group panel).
         ═══════════════════════════════════════════════════════════════════ */}
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
                ...(miqaat.hideInviteMehmaan ? [] : [{ label: t('Invitations'), to: `/miqaats/${id}/invite` }]),
                { label: t('Summary') },
              ]}
              onNavigate={(to) => nav(to)}
              onBack={() => nav(-1)}
              activeColor="#a8843e"
              dense
            />

            <div>
              <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={FM} {...tdAuthored(miqaat.title)} />
              <p className="mt-[6px] text-[18px] leading-[24px] text-[#15402f]" style={FM} {...tx('Review & Register')} />
              <p className="mt-[12px] max-w-[360px] text-[15px] leading-[22px] text-[#5a6660]" style={{ ...FMU, fontWeight: 400 }} {...tx('Check your group before submitting. You can go back to edit any step.')} />
            </div>

            {/* Stat cards */}
            <div data-tour="review-section" className="mt-[4px] flex flex-wrap gap-[12px]">
              <StatTile value={total} numColor="#1f5a44" line1="Total" line2="Headcount" />
              <StatTile value={familyCount} numColor="#a8843e" line1="My family" line2="members" />
              <StatTile value={otherInvites.length} numColor="#a8843e" line1={t('Group')} line2="members" />
            </div>
          </aside>

          {/* ───────── RIGHT group panel ───────── */}
          <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">

              {/* Your family */}
              <div className="flex items-center justify-between gap-[16px]">
                <p className="text-[24px] leading-[30px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Your family')} />
                <EditButton onClick={goEdit} />
              </div>
              <div className="mt-[16px]">
                {groups.length === 0 ? (
                  <div className="rounded-[16px] border border-[#e7dfc9] bg-white px-[20px] py-[16px]">
                    <p className="text-[14px] text-[#5a6660]" style={FMU} {...tx('No members selected.')} />
                  </div>
                ) : (
                  <FamilyTable groups={groups} />
                )}
              </div>

              {/* Others — members added via Add People (group), kept distinct from Mehmaan guests */}
              {otherGroups.length > 0 && (
                <>
                  <p className="mt-[32px] text-[24px] leading-[30px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Group')} />
                  <div className="mt-[16px]">
                    <InvitedMembersTable groups={otherGroups} />
                  </div>
                </>
              )}

              {/* Invited Mehmaan */}
              {mehmaanGroups.length > 0 && (
                <>
                  <p className="mt-[32px] text-[24px] leading-[30px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Invited Mehmaan')} />
                  <div className="mt-[16px]">
                    <InvitedMembersTable groups={mehmaanGroups} />
                  </div>
                </>
              )}

              {/* Other Details — the filled-in registration questionnaire, view-only */}
              <p className="mt-[32px] text-[24px] leading-[30px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Other Details')} />
              <div className="mt-[16px]">
                <QuestionnaireSummary q={flow.questionnaire} idPrefix="rvd-" hideIntro />
              </div>
            </div>

            {/* sticky footer CTA */}
            <div className="shrink-0">{footer}</div>
          </section>
        </div>
      </div>
    </PhoneScreen>
  )
}
