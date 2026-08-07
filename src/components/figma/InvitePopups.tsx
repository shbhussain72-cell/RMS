import BottomSheet from './BottomSheet'
import { isolateRuns } from '../Bidi'
import RoleBadge from './RoleBadge'
import type { LinkedMember } from '../../data/seed'
import { useT } from '../../i18n'

const FM: React.CSSProperties = { fontFamily: 'Marcellus, serif' }
const FMU: React.CSSProperties = { fontFamily: 'Mulish, system-ui, sans-serif' }

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div className="relative flex shrink-0 items-center justify-center overflow-clip rounded-full bg-[#1f5a44]" style={{ width: size, height: size }}>
      <span className="font-bold text-white"
        style={{ ...FMU, fontSize: Math.round(size * 0.39) }}>
        {initials(name)}
      </span>
    </div>
  )
}

/** Approved member row — avatar 36, name 14/18, meta 12/16 ("{Gender} · Age NN · ITS xxx"), Dependent tag. */
function DependentRow({ member }: { member: LinkedMember }) {
  const { t, td, tdText } = useT()
  return (
    <div className="flex items-center gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-white px-[14px] py-[10px]">
      <Avatar name={member.name} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={FMU} {...td(member.name)} />
        <p className="mt-[2px] text-[12px] leading-[16px] text-[#8a938e]" style={FMU}>
          {isolateRuns(`${tdText(member.gender)} · ${t('Age')} ${String(member.age).padStart(2, '0')} · ${t('ITS')} ${member.its}`)}
        </p>
      </div>
      <RoleBadge kind="dependent" />
    </div>
  )
}

/**
 * "This member has linked dependents" confirmation — shows the primary's linked member(s)
 * that will be added together. Uses the shared BottomSheet (content-driven height, no scrollbar
 * for short content, fixed Cancel/Add footer).
 */
export function LinkedDependentPopup({
  memberName, dependents, onCancel, onConfirm,
}: {
  memberName: string
  dependents: LinkedMember[]
  onCancel: () => void
  onConfirm: () => void
}) {
     const { tx, td } = useT()
  const many = dependents.length > 1
  return (
    <BottomSheet
      open
      onClose={onCancel}
      footer={
        <div className="flex gap-[12px]">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-[12px] border border-[#e7dfc9] py-[14px] text-[16px] font-bold text-[#23302a] transition-colors hover:bg-[#fdf9f4]" style={FMU} {...tx('Cancel')} />
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-[12px] bg-[#1f5a44] py-[14px] text-[16px] font-bold text-white shadow-[0px_4px_12px_rgba(21,64,47,0.25)] transition-colors hover:bg-[#184a37]" style={FMU} {...tx('Add')} />
        </div>
      }
    >
      <div className="mx-auto mb-[16px] mt-[8px] flex size-[64px] items-center justify-center rounded-full bg-[#f5ecd8]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[28px]" style={{ color: '#c9a45c' }}>
          <path d="M9.5 13a3.6 3.6 0 005.1 0l2.9-2.9a3.6 3.6 0 00-5.1-5.1l-1.1 1.1M14.5 11a3.6 3.6 0 00-5.1 0l-2.9 2.9a3.6 3.6 0 005.1 5.1l1.1-1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="mb-[10px] text-center text-[22px] leading-[28px] text-[#15402f]" style={FM}>
        This member has {many ? 'linked dependents' : 'a linked dependent'}
      </h3>
      <p className="mx-auto mb-[18px] max-w-[340px] text-center text-[14px] font-normal leading-[21px] text-[#5a6660]" style={FMU}>
        <strong className="font-bold text-[#23302a]" {...td(memberName)} /> is linked to {many ? `${dependents.length} members` : 'a dependent'} who will be added with them.
      </p>

      <div className="mb-[16px] flex flex-col gap-[8px]">
        {dependents.map((d) => <DependentRow key={d.its} member={d} />)}
      </div>

      <div className="rounded-[12px] bg-[#e1eef1] px-[16px] py-[12px]">
        <p className="text-center text-[14px] leading-[20px] text-[#2e6a7d]" style={{ ...FMU, fontWeight: 600 }} {...tx('All will be added to your list. A seat is only used when each one accepts.')} />
      </div>
    </BottomSheet>
  )
}

/** "Not enough invitations" popup — shown when a linked group needs more slots than remain. */
export function InviteLimitPopup({
  needed, remaining, onClose,
}: {
  needed: number
  remaining: number
  onClose: () => void
}) {
     const { tx } = useT()
  return (
    <BottomSheet
      open
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose}
          className="w-full rounded-[12px] bg-[#1f5a44] py-[13px] text-[15px] font-bold text-white shadow-[0px_4px_12px_rgba(21,64,47,0.25)]" style={FMU} {...tx('Okay')} />
      }
    >
      <div className="mb-[14px] mt-[8px] flex size-[48px] items-center justify-center rounded-full bg-[rgba(178,59,59,0.08)]">
        <svg viewBox="0 0 24 24" fill="none" className="size-[24px]" style={{ color: '#b23b3b' }}>
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="mb-[6px] text-[20px] leading-[26px] text-[#15402f]" style={FM} {...tx('Not enough invitations')} />
      <p className="text-[14px] font-normal leading-[21px] text-[#5a6660]" style={FMU}>
        You need <strong className="font-semibold text-[#23302a]">{needed} invitation{needed !== 1 ? 's' : ''}</strong> but only have <strong className="font-semibold text-[#23302a]">{remaining} remaining</strong>.
      </p>
    </BottomSheet>
  )
}
