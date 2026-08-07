import RoleBadge from './RoleBadge'
import { isolateRuns } from '../Bidi'
import { useT, tNow } from '../../i18n'

const FMU = { fontFamily: 'Mulish, system-ui, sans-serif' } as const

export interface InvitedPerson {
  its: string
  name: string
  age: number
  gender?: 'Male' | 'Female'
}

/** A primary invitee plus any linked dependents (renders as one "registered together" group). */
export interface InvitedGroup {
  primary: InvitedPerson
  dependents: InvitedPerson[]
}

const BAND_LABEL = 'Guardian + dependent · registered together'

/** Meta line, identical to the family rows — "{Gender} · Age NN · ITS xxx". */
function meta(p: InvitedPerson): string {
  return `${p.gender ? `${tNow(p.gender)} · ` : ''}${tNow('Age')} ${String(p.age).padStart(2, '0')} · ${tNow('ITS')} ${p.its}`
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="relative shrink-0 overflow-clip rounded-full bg-[#1f5a44]" style={{ width: size, height: size }}>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-white"
        style={{ ...FMU, fontSize: Math.round(size * 0.39) }}>
        {initials(name)}
      </span>
    </div>
  )
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-[15px] shrink-0">
      <path d="M8.6665 4.00033L9.99984 2.66699C10.6665 2.00033 11.9998 2.00033 12.6665 2.66699L13.3332 3.33366C13.9998 4.00033 13.9998 5.33366 13.3332 6.00033L9.99984 9.33366C9.33317 10.0003 7.99984 10.0003 7.33317 9.33366M7.33317 12.0003L5.99984 13.3337C5.33317 14.0003 3.99984 14.0003 3.33317 13.3337L2.6665 12.667C1.99984 12.0003 1.99984 10.667 2.6665 10.0003L5.99984 6.66699C6.6665 6.00033 7.99984 6.00033 8.6665 6.66699" stroke="#2e6a7d" strokeWidth="1.375" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const { tx } = useT()
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-[6px] text-[14px] font-bold text-[#b23b3b] transition-opacity duration-200 hover:opacity-75 active:scale-[0.97]" style={FMU}>
      <span {...tx('Remove')} />
      <svg viewBox="0 0 20 20" fill="none" className="size-[14px]"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    </button>
  )
}

/** One member row's name + inline Dependent tag + meta (shared by table + cards). */
function MemberIdentity({ person, dependent }: { person: InvitedPerson; dependent?: boolean }) {
  const { td } = useT()
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]">
        <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={FMU} {...td(person.name)} />
        {dependent && <RoleBadge kind="dependent" />}
      </div>
      <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={FMU}>{isolateRuns(meta(person))}</p>
    </div>
  )
}

/**
 * Shared desktop invited-Mehmaan table — the approved grouped member spec
 * (blue "registered together" band, gold connectors, avatar 36, name 14/18,
 * meta 12/16 with gender, inline Dependent RoleBadge). Status / Remove columns optional.
 */
export function InvitedMembersTable({
  groups, showStatus = false, onRemove,
}: {
  groups: InvitedGroup[]
  showStatus?: boolean
  onRemove?: (its: string) => void
}) {
  const cols = 1 + (showStatus ? 1 : 0) + (onRemove ? 1 : 0)
  const headers = ['Member', ...(showStatus ? ['Status'] : []), ...(onRemove ? ['Action'] : [])]
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#e7dfc9] bg-white shadow-[0_6px_24px_-12px_rgba(15,77,60,0.12)]">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: cols === 1 ? '100%' : showStatus && onRemove ? '52%' : '60%' }} />
          {showStatus && <col style={{ width: onRemove ? '26%' : '40%' }} />}
          {onRemove && <col />}
        </colgroup>
        <thead>
          <tr className="border-b border-[#ece7da] bg-[#faf8f2]">
            {headers.map((h) => (
              <th key={h} className="px-[20px] py-[10px] text-start text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e] whitespace-nowrap" style={FMU}>{h}</th>
            ))}
          </tr>
        </thead>
        {groups.map(({ primary, dependents }) => {
          const linked = dependents.length > 0
          const members = [primary, ...dependents]
          const hasConnector = members.length > 1
          return (
            <tbody key={primary.its}>
              {linked && (
                <tr className="bg-[#e1eef1]">
                  <td colSpan={cols} className="px-[20px] py-[8px]">
                    <span className="flex items-center gap-[8px] text-[12px] font-bold text-[#2e6a7d]" style={FMU}><LinkGlyph />{BAND_LABEL}</span>
                  </td>
                </tr>
              )}
              {members.map((p, mi) => {
                const { t } = useT()
                const isDep = linked && mi > 0
                const isFirst = mi === 0
                const isLast = mi === members.length - 1
                return (
                  <tr key={p.its} className={`transition-colors duration-200 hover:bg-[#faf9f4] ${linked ? '' : 'border-t border-[#ece7da]'}`} style={{ background: 'white' }}>
                    <td className="relative px-[20px] py-[9px] align-middle">
                      {hasConnector && (
                        <span className="pointer-events-none absolute start-[37px] w-[2px] bg-[#fac775]" style={{ top: isFirst ? '50%' : 0, bottom: isLast ? '50%' : 0 }} />
                      )}
                      <div className="relative flex items-center gap-[10px]">
                        <Avatar name={p.name} size={36} />
                        <MemberIdentity person={p} dependent={isDep} />
                      </div>
                    </td>
                    {showStatus && (
                      <td className="px-[20px] py-[9px] align-middle">
                        <span className="flex items-center gap-[5px] text-[14px] font-bold text-[#b8821e]" style={FMU}>
                          <span className="size-[6px] shrink-0 rounded-full bg-[#f59e0b]" />{t('Pending')}
                        </span>
                      </td>
                    )}
                    {onRemove && (isFirst ? (
                      <td className="px-[20px] py-[9px] align-middle" rowSpan={members.length}>
                        <RemoveButton onClick={() => onRemove(primary.its)} />
                      </td>
                    ) : null)}
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

/** One member row inside a mobile card — avatar 36, name 14/18, inline Dependent tag, meta 12/16. */
function CardRow({ person, dependent, linkTop, linkBottom }: { person: InvitedPerson; dependent?: boolean; linkTop?: boolean; linkBottom?: boolean }) {
  return (
    <div className="relative flex items-center gap-[10px] py-[8px]">
      {(linkTop || linkBottom) && (
        <span className="pointer-events-none absolute start-[17px] w-[2px] bg-[#fac775]" style={{ top: linkTop ? 0 : '50%', bottom: linkBottom ? 0 : '50%' }} />
      )}
      <div className="relative shrink-0"><Avatar name={person.name} size={36} /></div>
      <div className="min-w-0 flex-1"><MemberIdentity person={person} dependent={dependent} /></div>
    </div>
  )
}

/**
 * Shared mobile invited-Mehmaan cards — one card per group (linked groups show the
 * "registered together" band + gold connectors). Optional Pending status + Remove.
 */
export function InvitedMembersCards({
  groups, showStatus = false, onRemove,
}: {
  groups: InvitedGroup[]
  showStatus?: boolean
  onRemove?: (its: string) => void
}) {
     const { tx } = useT()
  return (
    <div className="flex flex-col gap-[8px]">
      {groups.map(({ primary, dependents }) => {
        const linked = dependents.length > 0
        const members = [primary, ...dependents]
        return (
          <div key={primary.its} className="overflow-hidden rounded-[14px] border border-solid border-[#e7dfc9] bg-white">
            {linked && (
              <div className="flex h-[34px] items-center gap-[8px] bg-[#e1eef1] px-[14px]">
                <LinkGlyph />
                <span className="text-[12px] font-bold text-[#2e6a7d]" style={FMU}>{BAND_LABEL}</span>
              </div>
            )}
            <div className="relative px-[14px] py-[6px]">
              {members.map((p, mi) => (
                <CardRow key={p.its} person={p} dependent={linked && mi > 0}
                  linkTop={linked && mi > 0} linkBottom={linked && mi < members.length - 1} />
              ))}
            </div>
            {(showStatus || onRemove) && (
              <div className="flex items-center justify-between border-t border-[#f0ebe0] px-[14px] py-[12px]">
                {showStatus ? (
                  <span className="flex items-center gap-[6px] text-[14px]" style={FMU}>
                    <span className="text-[#5a6660]" {...tx('Status :')} />
                    <span className="font-bold text-[#b8821e]" {...tx('Pending')} />
                  </span>
                ) : <span />}
                {onRemove && <RemoveButton onClick={() => onRemove(primary.its)} />}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
