import StickyFooter from './StickyFooter'
import { memberMeta } from '../MemberMeta'
import RoleBadge from './RoleBadge'
import { bandLabel, type Group } from '../../lib/group'
import { genderByIts } from '../../data/seed'
import { useT, tNow, type TxProps } from '../../i18n'
import { notLanguage } from '../NotLanguage'

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

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

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
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

function PinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="shrink-0" style={{ width: size, height: size }}>
      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke="#1f5a44" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" stroke="#1f5a44" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Right-panel member table — Member | (badge) | status, grouped by reserve-together bands.
 *  When `statusText` is set the rows show that "… – Not Allocated" status instead of the Raza pill. */
function ConfirmedMemberTable({ groups, statusText }: { groups: Group[]; statusText?: string }) {
  const { t, td } = useT()
  const statusHeader = statusText ? 'Status' : 'Raza Status'
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '58%' }} /><col style={{ width: '20%' }} /><col />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {[t('Member'), '', statusHeader].map((h, i) => (
              <th key={i} className="px-[16px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={{ fontFamily: FONT, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const linked = !!g.label
          const hasConnector = g.members.length > 1
          // A group with a member flagged not-valid can never be allocated → show that reason
          // (matches the City Selection table) instead of the generic "… – Not Allocated".
          const groupNotValid = g.members.some((mm) => mm.member.notValidForCity)
          const rowStatus = statusText ? (groupNotValid ? t('Not valid for allocation') : statusText) : undefined
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #e7dfc9', background: '#e1eef1' }}>
                  <td colSpan={3} className="px-[16px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>
                      <LinkGlyph />{t(bandLabel(g.label!))}
                    </span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                return (
                  <tr key={mm.member.id} style={{ borderTop: linked ? undefined : '1px solid #e7dfc9', background: 'white' }}>
                    <td className="relative px-[16px] py-[9px] align-middle">
                      {hasConnector && (
                        <span className="pointer-events-none absolute start-[33px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                      )}
                      <div className="relative flex items-center gap-[10px]">
                        <Avatar name={mm.member.name} size={36} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                          <p className="text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member.relation, mm.member.age, mm.member.its)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-[16px] py-[9px] align-middle">{mm.badge ? <RoleBadge kind={mm.badge} /> : null}</td>
                    <td className="px-[16px] py-[9px] align-middle">
                      {rowStatus ? (
                        <span className="flex items-center gap-[5px] text-[13px] font-bold text-[#b23b3b]" style={{ fontFamily: FONT }}>
                          <span className="size-[6px] shrink-0 rounded-full bg-[#d2632b]" />{rowStatus}
                        </span>
                      ) : (
                        <span className="flex items-center gap-[5px] text-[13px] font-bold text-[#b8821e]" style={{ fontFamily: FONT }}>
                          <span className="size-[6px] shrink-0 rounded-full bg-[#f59e0b]" />{t('Pending')}
                        </span>
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

export interface ConfirmedSection {
  name: string
  count: number
  groups: Group[]
  /** Unallocated bucket — header shows an amber "Not allocated" treatment. */
  unallocated?: boolean
  /** When set, the table's status column shows this "… – Not Allocated" text instead of Raza. */
  statusText?: string
  /** Optional "Host City" / "Relay City" tag shown beside the city name so it's clear which is which. */
  typeLabel?: 'Host City' | 'Relay City'
  /** For zone sections: the city this zone belongs to, shown (with the tag) before the zone name. */
  cityName?: string
}

/** Small pill distinguishing a Host city (gold) from a Relay city (teal) in the section header. */
function CityTypeTag({ label }: { label: 'Host City' | 'Relay City' }) {
  const host = label === 'Host City'
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center rounded-full px-[10px] text-[11px] font-bold tracking-[0.3px]"
      style={{ fontFamily: FONT, background: host ? '#f7efd6' : '#e1eef1', color: host ? '#a8843e' : '#2e6a7d' }}
    >
      {label}
    </span>
  )
}

/** Which confirmation stage we're on — drives the not-allocated label + notice copy. */
export type ConfirmStage = 'host' | 'relay' | 'zone'

const STAGE_NOUN: Record<ConfirmStage, string> = { host: 'host city', relay: 'relay city', zone: 'zone' }

/** The status-column value for an unallocated member, per stage (e.g. "City – Not Allocated"). */
export function notAllocatedLabel(stage: ConfirmStage): string {
  const head = stage === 'host' ? 'City' : stage === 'relay' ? 'Relay City' : 'Zone'
  return `${head} – Not Allocated`
}

function AlertIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="shrink-0" style={{ width: size, height: size }}>
      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke="#d2632b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClockIcon({ size = 18, color = '#b07a2a' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="shrink-0" style={{ width: size, height: size }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.75" />
      <path d="M12 7.5V12l3 2" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Info shown for an invited/added member from a city whose allocation window opens later. */
export interface OpensLaterInfo { location: string; opensAt: string; name: string }

/**
 * Cream "allocation opens later" message for a member who lives elsewhere and can only be reserved
 * once their city's window opens. Shared by City Selection and the City Confirmed page.
 */
export function OpensLaterNotice({ location, opensAt, name, className = '' }: OpensLaterInfo & { className?: string }) {
  const first = name.trim().split(/\s+/)[0]
  return (
    <div className={`flex items-start gap-[10px] rounded-[12px] border border-[#efd9b0] bg-[#fdf6ea] px-[13px] py-[10px] ${className}`}>
      <ClockIcon />
      <p className="text-[13px] leading-[19px] text-[#8a5a1a]" style={{ fontFamily: FONT }}>
        <span className="font-bold">{location}</span> allocation opens <span className="font-bold">{opensAt}</span>. You can reserve {first} then.
      </p>
    </div>
  )
}

/**
 * Contextual amber card shown below the confirmed table when some members aren't allocated yet.
 * Same card on web + mobile; the copy + closing date/time are stage-specific.
 */
export function UnallocatedNotice({ stage, closesAt, className = '' }: { stage: ConfirmStage; closesAt: string; className?: string }) {
  const noun = STAGE_NOUN[stage]
  return (
    <div className={`flex items-start gap-[10px] rounded-[14px] border border-[#f0d6bf] bg-[#fdf3ea] px-[16px] py-[13px] ${className}`}>
      <AlertIcon />
      <p className="text-[13.5px] leading-[20px] text-[#8a4b22]" style={{ fontFamily: FONT }}>
        Some members haven&apos;t been allocated to a {noun} yet. You can allocate them until the {noun} allocation closes on{' '}
        <span className="font-bold">{closesAt}</span>.
      </p>
    </div>
  )
}

/**
 * Shared desktop two-panel "Confirmed" view — used identically by City Confirmed,
 * Relay City Confirmed and Zone Confirmed so all three stay consistent. Mobile is
 * rendered by each screen separately (this is gated behind `sm:` by the caller).
 *
 * Left cream sidebar: success check + title + reference card + summary rows.
 * Right white panel: per-section "📍 {name} · N members" + member table + Done footer.
 */
export default function ConfirmedView({
  title, footerCaption, reference, infoLabel, infoValue, membersAllocated, sections, unallocatedNotice, opensLater, onBack, onDone,
  statusRowLabel = 'Registration status', statusPill = 'Allocated', countLabel = 'Members allocated', footerNoun = 'members allocated',
}: {
  title: string
  /** Routed text, not a string — see the Slot note in StickyFooter. */
  footerCaption: TxProps
  reference?: string
  infoLabel: string
  /** ReactNode, not string: dates/times arrive pre-formatted and bidi-isolated. */
  infoValue: React.ReactNode
  membersAllocated: number
  sections: ConfirmedSection[]
  /** Render the amber notice below the table when members remain unallocated. */
  unallocatedNotice?: { stage: ConfirmStage; closesAt: string } | null
  /** Invited/added members whose city opens later → an "Opening later" section of cream notices. */
  opensLater?: OpensLaterInfo[]
  onBack: () => void
  onDone: () => void
  /** Left-summary + footer wording overrides (default to the City/Zone "allocated" copy). Set for
   *  other flows (e.g. Araz preferences) so the same layout reads correctly. */
  statusRowLabel?: string
  statusPill?: string
  countLabel?: string
  footerNoun?: string
}) {
     const { tx } = useT()
  return (
    <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">
      {/* ───── LEFT sidebar ───── */}
      <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] pt-[24px] pb-[40px] ps-[var(--content-px)] pe-[28px]">
        {/* Confirmed screens go Home (not the previous step). */}
        <button type="button" onClick={onBack}
          className="group flex w-fit items-center gap-[6px] text-[#5a6660] transition-colors hover:text-[#15402f] focus-visible:outline-none">
          <svg viewBox="0 0 24 24" className="size-[18px] transition-transform duration-200 group-hover:-translate-y-[1px]" fill="none" aria-hidden="true">
            <path d="M4 11.5L12 4l8 7.5M6 10v9h12v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[15px] leading-none" style={{ fontFamily: FONT, fontWeight: 600 }} {...tx('Go Home')} />
        </button>

        <div className="mt-[36px] flex flex-col items-center">
          <div className="size-[64px] rounded-full bg-[#1f5a44] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="size-[32px]">
              <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-[16px] text-center text-[32px] leading-[40px] text-[#1f5a44]" style={{ fontFamily: SERIF }}>{title}</h1>
        </div>

        {/* Summary rows */}
        <div className="mt-[28px] overflow-hidden rounded-[16px] border border-[#e7dfc9] bg-white">
          <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-[#f0ebe0]">
            <span className="text-[14px] text-[#5a6660]" style={{ fontFamily: FONT }}>{statusRowLabel}</span>
            <span className="inline-flex items-center gap-[5px] rounded-full px-[12px] py-[4px] text-[12px] font-bold" style={{ background: '#e4efe7', color: '#276245', fontFamily: FONT }}>
              <span className="size-[6px] rounded-full bg-[#276245]" />{statusPill}
            </span>
          </div>
          <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-[#f0ebe0]">
            <span className="text-[14px] text-[#5a6660]" style={{ fontFamily: FONT }}>{infoLabel}</span>
            <span className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{infoValue}</span>
          </div>
          <div className="flex items-center justify-between px-[18px] py-[15px]">
            <span className="text-[14px] text-[#5a6660]" style={{ fontFamily: FONT }}>{countLabel}</span>
            <span className="text-[15px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>{String(membersAllocated).padStart(2, '0')}</span>
          </div>
        </div>
      </aside>

      {/* ───── RIGHT panel ───── */}
      <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
          {sections.map((s, i) => (
            <div key={i} className={i === 0 ? '' : 'mt-[28px]'}>
              <div className="mb-[12px] flex flex-wrap items-center gap-x-[8px] gap-y-[4px]">
                {s.unallocated ? <AlertIcon size={18} /> : <PinIcon size={18} />}
                <span className="text-[18px] font-bold" style={{ fontFamily: FONT, color: s.unallocated ? '#8a4b22' : '#23302a' }}>{s.cityName ?? s.name}</span>
                {s.typeLabel && <CityTypeTag label={s.typeLabel} />}
                {s.cityName && <span className="text-[16px] font-bold text-[#5a6660]" style={{ fontFamily: FONT }}>· {s.name}</span>}
                <span className="text-[14px] text-[#8a938e]" style={{ fontFamily: FONT }}>· {s.count} members</span>
              </div>
              <ConfirmedMemberTable groups={s.groups} statusText={s.statusText} />
            </div>
          ))}
          {opensLater && opensLater.length > 0 && (
            <div className="mt-[28px]">
              <div className="mb-[12px] flex items-center gap-[8px]">
                <ClockIcon size={18} color="#8a5a1a" />
                <span className="text-[18px] font-bold text-[#8a5a1a]" style={{ fontFamily: FONT }} {...tx('Opening later')} />
                <span className="text-[14px] text-[#8a938e]" style={{ fontFamily: FONT }}>· {opensLater.length} member{opensLater.length > 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-col gap-[10px]">
                {opensLater.map((o, i) => <OpensLaterNotice key={i} {...o} />)}
              </div>
            </div>
          )}
          {unallocatedNotice && (
            <UnallocatedNotice stage={unallocatedNotice.stage} closesAt={unallocatedNotice.closesAt} className="mt-[20px]" />
          )}
        </div>
        <div className="shrink-0">
          <StickyFooter
            caption={footerCaption}
            title={`${String(membersAllocated).padStart(2, '0')} ${footerNoun}`}
            button="Go home"
            onButton={onDone}
          />
        </div>
      </section>
    </div>
  )
}
