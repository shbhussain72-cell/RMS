import React, { type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import { memberMeta } from '../components/MemberMeta'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import { family, inviteDirectory, genderByIts, miqaats } from '../data/seed'
import { buildGroups, type BadgeKind } from '../lib/group'
import RoleBadge from '../components/figma/RoleBadge'
import StickyFooter from '../components/figma/StickyFooter'
import { useStore, journeyFor } from '../store'
import { QuestionnaireSummary } from '../components/questionnaire/QuestionnaireFields'
import { plural, useT, tNow } from '../i18n'
import { notLanguage } from '../components/NotLanguage'

const demo = {
  selectedMemberIds: family.map((m) => m.id),
  guardians: { m3: 'm1' } as Record<string, string>,
  caregivers: { m5: 'm2' } as Record<string, string>,
  invites: Object.entries(inviteDirectory)
    .slice(0, 5)
    .map(([its, v]) => ({ its, ...v })),
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function Avatar({ name }: { name: string }) {
  return (
    <div className="relative size-[36px] shrink-0 overflow-clip rounded-[46px] bg-[#1f5a44]">
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[14px] leading-[18px] text-white"
        style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }}
       {...notLanguage}>
        {initials(name)}
      </span>
    </div>
  )
}

function RazaStatusStrip() {
  const { t, tx, tdAuthored } = useT()
  const razaIssued = useStore((s) => s.flow.razaIssued)
  return (
    <div className="flex h-[32px] items-center justify-between rounded-[8px] px-[12px]" style={{ background: razaIssued ? '#e7f1ea' : '#fff6e5' }}>
      <span className="whitespace-nowrap text-[12px] leading-[16px] text-[#3d3d3a]"
        style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 500 }} {...tx('Raza status')} />
      <span className="flex items-center gap-[6px]">
        <span className="size-[6px] shrink-0 rounded-[3px]" style={{ background: razaIssued ? '#1f7a4d' : '#b8821e' }} />
        <span className="whitespace-nowrap text-[12px] leading-[18px]"
          style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 800, letterSpacing: '0.2px', color: razaIssued ? '#1f7a4d' : '#b8821e' }}>{razaIssued ? t('Issued') : t('Pending')}</span>
      </span>
    </div>
  )
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="block size-[16px] shrink-0">
      <path
        d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699"
        stroke="#2e6a7d"
        strokeWidth="1.375"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PersonRow({ name, meta, badge, linkTop, linkBottom }: { name: string; meta: ReactNode; badge: BadgeKind; linkTop?: boolean; linkBottom?: boolean }) {
  const { td } = useT()
  return (
    <div className="relative flex min-h-[62px] items-center gap-[6px] px-[13px] py-[10px]">
      {(linkTop || linkBottom) && (
        <span className="pointer-events-none absolute start-[30px] w-[2px] bg-[#fac775]" style={{ top: linkTop ? 0 : '50%', bottom: linkBottom ? 0 : '50%' }} />
      )}
      <div className="relative shrink-0"><Avatar name={name} /></div>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="text-[14px] leading-[18px] text-[#23302a]"
          style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }} {...td(name)} />
        <p className="text-[12px] leading-[16px] text-[#5a6660]"
          style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 400 }}>{meta}</p>
      </div>
      <RoleBadge kind={badge} />
    </div>
  )
}

// Module scope, so `useT()` is unavailable — see the note on tNow in src/i18n.
// relation and gender are DATA and go through the lookup too; the age and ITS digits
// are left alone and stay LTR via the numeric CSS rule.
const familyMeta = (relation: string, age: number, its: string) => {
  const g = genderByIts(its)
  return memberMeta({
    relation: relation ? tNow(relation) : undefined,
    gender: g ? tNow(g) : undefined,
    age: String(age).padStart(2, '0'),
    its,
  }, tNow)
}

type InviteRow = { its: string; name: string; age: number }

/** Desktop gold-divider + table for an invite section (reused for "Others" and "Invited Mehmaan"). */
function InviteTableSection({ label, invites }: { label: string; invites: InviteRow[] }) {
  const { tx, t, td } = useT()
  if (invites.length === 0) return null
  return (
    <>
      <div className="mt-[32px] flex h-[18px] items-center">
        <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
        <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
          style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }}>{label}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
      </div>
      <div className="mt-[16px] overflow-hidden rounded-[14px] border border-[#e7dfc9]">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col />
            <col style={{ width: '190px' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#faf8f2' }}>
              {([t('Member'), 'Raza Status'] as const).map((h) => (
                <th key={h} className="px-[16px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e] whitespace-nowrap"
                  style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.its} style={{ borderTop: '1px solid #f0ebe0', background: 'white' }}>
                <td className="px-[16px] py-[9px]">
                  <div className="flex items-center gap-[10px]">
                    <Avatar name={inv.name} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold leading-[18px] text-[#23302a]"
                        style={{ fontFamily: 'Mulish, system-ui, sans-serif' }} {...td(inv.name)} />
                      <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]"
                        style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}>{memberMeta({ age: String(inv.age), its: inv.its }, t)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-[16px] py-[9px]">
                  <span className="flex items-center gap-[6px]">
                    <span className="size-[6px] shrink-0 rounded-[3px] bg-[#b8821e]" />
                    <span className="text-[12px] font-bold text-[#b8821e]"
                      style={{ fontFamily: 'Mulish, system-ui, sans-serif' }} {...tx('Pending')} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Mobile heading + cards for an invite section (reused for "Others" and "Invited Mehmaan"). */
function InviteCardsSection({ label, invites }: { label: string; invites: InviteRow[] }) {
  const { t, td } = useT()
  if (invites.length === 0) return null
  return (
    <>
      <div className="ms-[16px] mt-[24px] text-[16px] leading-[18px] text-[#23302a]"
        style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700, letterSpacing: '2.5px' }}>
        {label} ({invites.length})
      </div>
      <div className="mt-[16px] flex flex-col gap-[12px] px-[16px]">
        {invites.map((inv) => (
          <div key={inv.its} className="relative w-full overflow-clip rounded-[8px] border border-solid border-[#ece4d2] bg-white">
            <div className="flex h-[58px] items-center gap-[6px] px-[13px] pt-[11px]">
              <Avatar name={inv.name} />
              <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <p className="truncate text-[14px] leading-[18px] text-[#23302a]"
                  style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }} {...td(inv.name)} />
                <p className="text-[12px] leading-[18px] text-[#5a6660]"
                  style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 400 }}>{memberMeta({ age: String(inv.age), its: inv.its }, t)}</p>
              </div>
            </div>
            <div className="mx-[14px] h-px bg-[#eaeaea]" />
            <div className="px-[13px] pb-[15px] pt-[8px]"><RazaStatusStrip /></div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Roster() {
  const { tx, t, td, tdAuthored } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  // Read THIS event's journey (active or archived) so the roster is correct even when a different
  // event is the one currently being edited (e.g. opened from a pending request's "View Members").
  const flow = useStore((s) => journeyFor(s.flow, s.registrations, id ?? ''))
  // A filed-but-unapproved registration request → these members are "Requested", not yet registered.
  const request = useStore((s) => s.reopenRequests[id ?? ''])
  const pending = !!request && !request.approved && request.stage === 'register'

  const source =
    flow.selectedMemberIds.length > 0
      ? { selectedMemberIds: flow.selectedMemberIds, guardians: flow.guardians, caregivers: flow.caregivers, invites: flow.invites }
      : demo

  const groups = buildGroups(source.selectedMemberIds, source.guardians, source.caregivers)
  const familyCount = source.selectedMemberIds.length
  const inviteCount = source.invites.length
  const total = familyCount + inviteCount
  // Split invites: Add-People "Others" (group: true) vs Invite-Mehmaan guests (no group flag),
  // so members added via Add group aren't shown under "Invited Mehmaan". (The demo fallback
  // source has no group flag, so all of it reads as Mehmaan.)
  const allInvites = source.invites as unknown as (InviteRow & { group?: boolean })[]
  const otherInvites = allInvites.filter((i) => i.group)
  const mehmaanInvites = allInvites.filter((i) => !i.group)
  const miqaat = miqaats.find((x) => x.id === id) ?? miqaats[0]

  return (
    <PhoneScreen
      footer={(
        <StickyFooter
          caption={<bdi {...tdAuthored(miqaat.title)} />}
          title={tx(plural(total, '{n} Member', '{n} Members'), { n: total })}
          button={t('Go Home')}
          onButton={() => nav('/miqaats')}
        />
      )}
    >
      <div>
        <AppBar notificationCount={3} />
      </div>

      <div className="ms-[16px] sm:ms-0 mt-[12px]">
        <Breadcrumb
          items={[
            { label: 'Home', to: '/miqaats' },
            { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
            { label: pending ? t('Requested') : 'Registered' },
          ]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      <h1 className="mx-[16px] sm:mx-0 mt-[20px] text-[20px] leading-[28px] text-[#15402f]"
        style={{ fontFamily: 'Marcellus, Georgia, serif', fontWeight: 400, letterSpacing: '0.2px' }}>
        {total} {pending ? t('Requested') : 'Registered'} members
      </h1>

      {/* Pending-approval banner — when opened from a registration request that admin hasn't approved. */}
      {pending && (
        <div className="mx-[16px] sm:mx-0 mt-[16px] rounded-[14px] border border-solid border-[#eadfc4] bg-[#fdf8ec] px-[16px] py-[13px]">
          <div className="flex items-center gap-[7px]">
            <span className="size-[8px] rounded-full" style={{ background: '#c8911f' }} />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.7px] text-[#b8821e]"
              style={{ fontFamily: 'Mulish, system-ui, sans-serif' }} {...tx('Pending approval')} />
          </div>
          <p className="mt-[6px] text-[13px] leading-[18px] text-[#7a827c]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif' }} {...tx('This registration request is awaiting admin approval — these are the members you requested.')} />
        </div>
      )}

      {/* ── DESKTOP: tables with gold dividers ── */}
      <div className="mb-[8px] mt-[24px] hidden sm:block">

        {/* Gold "Your Family" divider — matches AddPeople design */}
        <div className="flex h-[18px] items-center">
          <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
          <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }} {...tx('Your Family')} />
          <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
        </div>

        {/* Family table */}
        <div className="mt-[16px] overflow-hidden rounded-[14px] border border-[#e7dfc9]">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col />
              <col style={{ width: '190px' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#faf8f2' }}>
                {([t('Member'), 'Raza Status'] as const).map((h) => (
                  <th key={h} className="px-[16px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e] whitespace-nowrap"
                    style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g, gi) => {
              const isLinked = !!g.label
              const hasConnector = g.members.length > 1
              return (
                <tbody key={gi}>
                  {isLinked && (
                    <tr style={{ borderTop: '1px solid #f0ebe0', background: '#e1eef1' }}>
                      <td colSpan={2} className="px-[16px] py-[8px]">
                        <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]"
                          style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}>
                          <LinkGlyph />{g.label}
                        </span>
                      </td>
                    </tr>
                  )}
                  {g.members.map((m, mi) => {
                    const { t } = useT()
                    const isFirst = mi === 0
                    const isLast = mi === g.members.length - 1
                    return (
                      <tr key={m.member.id} style={{ borderTop: isLinked ? undefined : '1px solid #f0ebe0', background: 'white' }}>
                        <td className="relative px-[16px] py-[9px]">
                          {hasConnector && (
                            <span className="pointer-events-none absolute start-[33px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                          )}
                          <div className="relative flex min-w-0 items-center gap-[10px]">
                            <Avatar name={m.member.name} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
                                <p className="text-[14px] font-bold leading-[18px] text-[#23302a]"
                                  style={{ fontFamily: 'Mulish, system-ui, sans-serif' }} {...td(m.member.name)} />
                                {m.badge && <RoleBadge kind={m.badge} />}
                              </div>
                              <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]"
                                style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}>
                                {familyMeta(m.member.relation, m.member.age, m.member.its)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-[16px] py-[9px]">
                          <span className="flex items-center gap-[6px]">
                            <span className="size-[6px] shrink-0 rounded-[3px]" style={{ background: flow.razaIssued ? '#1f7a4d' : '#b8821e' }} />
                            <span className="text-[12px] font-bold" style={{ fontFamily: 'Mulish, system-ui, sans-serif', color: flow.razaIssued ? '#1f7a4d' : '#b8821e' }}>{flow.razaIssued ? t('Issued') : t('Pending')}</span>
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

        {/* Others (Add-People group members) and Invited Mehmaan (guests) — kept separate */}
        <InviteTableSection label={t('Others')} invites={otherInvites} />
        <InviteTableSection label={t('Invited Mehmaan')} invites={mehmaanInvites} />

      </div>

      {/* ── MOBILE: card layout ── */}
      <div className="sm:hidden">
        <div className="ms-[16px] mt-[24px] text-[16px] leading-[18px] text-[#23302a]"
          style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700, letterSpacing: '2.5px' }}>
          Your family({familyCount})
        </div>
        <div className="mt-[16px] flex flex-col gap-[12px] px-[16px]">
          {groups.map((g, i) => {
            const linked = !!g.label
            return (
              <div key={i} className="relative w-full overflow-clip rounded-[14px] border border-solid border-[#e7dfc9] bg-white">
                {linked && (
                  <div className="flex h-[32px] items-center gap-[10px] bg-[#e1eef1] px-[14px]">
                    <LinkGlyph />
                    <span className="whitespace-nowrap text-[12px] leading-[16px] text-[#2e6a7d]"
                      style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }}>{g.label}</span>
                  </div>
                )}
                <div className="relative">
                  {g.members.map((mm, mi) => (
                    <PersonRow
                      key={mm.member.id}
                      name={mm.member.name}
                      meta={familyMeta(mm.member.relation, mm.member.age, mm.member.its)}
                      badge={mm.badge}
                      linkTop={linked && g.members.length > 1 && mi > 0}
                      linkBottom={linked && g.members.length > 1 && mi < g.members.length - 1}
                    />
                  ))}
                </div>
                <div className="mx-[14px] h-px bg-[#eaeaea]" />
                <div className="px-[13px] pb-[11px] pt-[8px]"><RazaStatusStrip /></div>
              </div>
            )
          })}
        </div>

        <InviteCardsSection label={t('Others')} invites={otherInvites} />
        <InviteCardsSection label={t('Invited Mehmaan')} invites={mehmaanInvites} />
        <div className="h-[100px]" />
      </div>

      {/* Registration form — view only (read-only answers, no edit control anywhere here). Same
          read-only rendering EditRegistrationForm/Review use elsewhere, so "what did I submit" is
          visible from every "View Members" destination, not just before submitting. */}
      <div className="mx-[16px] sm:mx-0 mt-[32px]">
        <div className="flex h-[18px] items-center">
          <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
          <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }} {...tx('Registration Form')} />
          <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
        </div>
        <div className="mt-[16px]">
          <QuestionnaireSummary q={flow.questionnaire} hideIntro />
        </div>
      </div>

      {/* bottom padding for desktop (clears the sticky footer) */}
      <div className="hidden sm:block sm:pb-[110px]" />
    </PhoneScreen>
  )
}
