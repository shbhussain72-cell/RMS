import type { Group } from '../../lib/group'
import { isolateRuns } from '../Bidi'
import RoleBadge from './RoleBadge'
import { useStore } from '../../store'
import { genderByIts } from '../../data/seed'
import { useT, tNow } from '../../i18n'

const FONT = 'Mulish, system-ui, sans-serif'

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function familyMeta(relation: string, age: number, its: string) {
  const g = genderByIts(its)
  const base = `${g ? `${g} · ` : ''}${tNow('Age')} ${String(age).padStart(2, '0')} · ${tNow('ITS')} ${its}`
  return isolateRuns(relation ? `${relation} · ${base}` : base)
}

function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <div className="shrink-0 rounded-full bg-[#1f5a44] flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="text-white font-bold" style={{ fontFamily: FONT, lineHeight: 1, fontSize: Math.round(size * 0.33) }}>
        {initials(name)}
      </span>
    </div>
  )
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[16px] shrink-0">
      <path
        d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699"
        stroke="#2e6a7d" strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

export function PinIcon({ size = 20, color = '#1f5a44' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }} className="shrink-0">
      <path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.4" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

/** Host City (gold) / Relay City (teal) pill — tells the user which kind of city a section is. */
export function CityTypeTag({ type }: { type: 'host' | 'relay' }) {
  const { t } = useT()
  const host = type === 'host'
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center rounded-full px-[10px] text-[11px] font-bold tracking-[0.3px]"
      style={{ fontFamily: FONT, background: host ? '#f7efd6' : '#e1eef1', color: host ? '#a8843e' : '#2e6a7d' }}
    >
      {host ? t('Host City') : t('Relay City')}
    </span>
  )
}

/** "📍 City · Host City · N members" — section header above a city's groups (optional trailing action). */
export function CityHeader({ name, count, type, action }: { name: string; count?: number; type?: 'host' | 'relay'; action?: React.ReactNode }) {
  const { td } = useT()
  return (
    <div className="flex items-center justify-between gap-[10px]">
      <div className="flex items-center gap-[8px] min-w-0">
        <PinIcon size={20} />
        <span className="text-[20px] font-bold text-[#23302a] truncate" style={{ fontFamily: FONT }} {...td(name)} />
        {type && <CityTypeTag type={type} />}
        {count !== undefined && (
          <span className="text-[15px] text-[#8a938e] shrink-0" style={{ fontFamily: FONT }}>· {count} members</span>
        )}
      </div>
      {action}
    </div>
  )
}

/** "Zone A - Main Hall · N members" — zone sub-heading inside a city. */
export function ZoneHeader({ name, count }: { name: string; count: number }) {
  return (
    <p className="text-[17px] font-bold text-[#23302a]" style={{ fontFamily: FONT }}>
      {name}
      <span className="text-[15px] font-normal text-[#8a938e]"> · {count} members</span>
    </p>
  )
}

/** The reserved group card: linked header + member rows + "Raza status · Pending" strip. */
export function AllocationGroupCard({ group }: { group: Group }) {
  const { t, tx, td } = useT()
  const linked = !!group.label
  const razaIssued = useStore((s) => s.flow.razaIssued)
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#ece4d2] bg-white">
      {linked && (
        <div className="flex items-center gap-[8px] bg-[#dcebef] px-[16px] py-[11px]">
          <LinkGlyph />
          <span className="text-[14px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}>{group.label}</span>
        </div>
      )}
      <div className="relative px-[16px] pt-[14px] pb-[6px]">
        {group.members.map((mm, mi) => (
          <div key={mm.member.id} className="relative flex items-center gap-[14px] py-[8px]">
            {linked && group.members.length > 1 && (
              <span className="pointer-events-none absolute start-[23px] w-[2px] bg-[#f0b94e]" style={{ top: mi === 0 ? '50%' : 0, bottom: mi === group.members.length - 1 ? '50%' : 0 }} />
            )}
            <div className="relative shrink-0"><Avatar name={mm.member.name} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-bold text-[#23302a] leading-[22px]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
              <p className="text-[13px] text-[#7a847e] mt-[3px]" style={{ fontFamily: FONT }}>
                {familyMeta(mm.member.relation, mm.member.age, mm.member.its)}
              </p>
            </div>
            <RoleBadge kind={mm.badge} />
          </div>
        ))}
      </div>
      <div className="mx-[16px] border-t border-[#efe9da]" />
      <div className="m-[14px] flex items-center justify-between rounded-[10px] px-[16px] h-[44px]" style={{ background: razaIssued ? '#e7f1ea' : '#fdf2d9' }}>
        <span className="text-[15px] text-[#3d3d3a]" style={{ fontFamily: FONT }} {...tx('Raza status')} />
        <span className="flex items-center gap-[7px]">
          <span className="size-[7px] rounded-full" style={{ background: razaIssued ? '#1f7a4d' : '#c8951f' }} />
          <span className="text-[15px] font-bold" style={{ fontFamily: FONT, color: razaIssued ? '#1f7a4d' : '#c8951f' }}>{razaIssued ? t('Issued') : t('Pending')}</span>
        </span>
      </div>
    </div>
  )
}

/**
 * Web (≥640px) table view of reserved groups — Add-Group table pattern.
 * Linked groups render as a header row + nested dependents (└); standalone members
 * get no group header. Read-only: Member · Status (role) · Raza status.
 */
export function AllocationDesktopTable({ groups }: { groups: Group[] }) {
  const { t, td } = useT()
  const razaIssued = useStore((s) => s.flow.razaIssued)
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#ece4d2] bg-white">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col />
          <col style={{ width: '190px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#faf8f2' }}>
            {([t('Member'), t('Raza status')] as const).map((h) => (
              <th key={h} className="px-[16px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e] whitespace-nowrap" style={{ fontFamily: FONT }}>{h}</th>
            ))}
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const linked = !!g.label
          const hasConnector = g.members.length > 1
          return (
            <tbody key={gi}>
              {linked && (
                <tr style={{ borderTop: '1px solid #f0ebe0', background: '#dcebef' }}>
                  <td colSpan={2} className="px-[16px] py-[9px]">
                    <span className="flex items-center gap-[8px] text-[13px] font-bold text-[#2e6a7d]" style={{ fontFamily: FONT }}><LinkGlyph />{g.label}</span>
                  </td>
                </tr>
              )}
              {g.members.map((mm, mi) => {
                const { t } = useT()
                const isFirst = mi === 0
                const isLast = mi === g.members.length - 1
                return (
                  <tr key={mm.member.id} style={{ borderTop: linked ? undefined : '1px solid #f0ebe0', background: 'white' }}>
                    <td className="relative px-[16px] py-[9px]">
                      {hasConnector && (
                        <span className="pointer-events-none absolute start-[33px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                      )}
                      <div className="relative flex items-center gap-[10px]">
                        <Avatar name={mm.member.name} size={36} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
                            <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={{ fontFamily: FONT }} {...td(mm.member.name)} />
                            {mm.badge && <RoleBadge kind={mm.badge} />}
                          </div>
                          <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={{ fontFamily: FONT }}>{familyMeta(mm.member.relation, mm.member.age, mm.member.its)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-[16px] py-[9px] align-middle">
                      <span className="inline-flex items-center gap-[7px] text-[14px] font-bold" style={{ fontFamily: FONT, color: razaIssued ? '#1f7a4d' : '#c8951f' }}>
                        <span className="size-[7px] rounded-full" style={{ background: razaIssued ? '#1f7a4d' : '#c8951f' }} /> {razaIssued ? t('Issued') : t('Pending')}
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
  )
}
