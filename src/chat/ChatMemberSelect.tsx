import RoleBadge from '@/components/figma/RoleBadge'
import type { ChatOption } from './types'
import { useT } from '../i18n'
import { notLanguage } from '../components/NotLanguage'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const CHECKBOX_BLANK = '/figma/checkbox-blank.svg'
const CHECKBOX_CHECKED = '/figma/checkbox-checked.svg'

const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/** Checkbox list inside the chat's control zone — re-skins (does not reimplement) AddPeople.tsx's
 *  PersonCard/CheckboxButton selection pattern, with an avatar circle for the ClickUp-style look. */
export default function ChatMemberSelect({
  options,
  selectedIds,
  onToggle,
  addedNames,
  onAddIts,
  readOnly = false,
}: {
  options: ChatOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
  addedNames?: string[]
  onAddIts?: () => void
  /** Non-interactive display (handoff preview): drops the checkbox/tap and shows every member as a
   *  plain neutral row — the real screen does the actual per-member picking. */
  readOnly?: boolean
}) {
     const { tx, td } = useT()
  if (readOnly) {
    return (
      <div className="flex flex-col gap-[8px]">
        {options.map((o) => (
          <div
            key={o.value}
            className="flex items-center gap-[11px] rounded-[14px] border border-solid border-[#e7dfc9] bg-white px-[13px] py-[10px]"
            style={{ fontFamily: FONT_SANS }}
          >
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44] text-[13px] font-bold text-white" {...notLanguage}>
              {initials(o.label)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-[6px]">
                <span className="min-w-0 truncate text-[13.5px] font-bold text-[#23302a]">{o.label}</span>
                {o.tag && (
                  <span className="shrink-0 rounded-full bg-[#eaf3ed] px-[7px] py-[1.5px] text-[10px] font-bold text-[#1f5a44]">{o.tag}</span>
                )}
              </span>
              {o.sublabel && <span className="block truncate text-[11.5px] text-[#5a6660]">{o.sublabel}</span>}
            </span>
            {o.badge && <RoleBadge kind={o.badge} />}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-[8px]">
      {options.map((o) => {
        const checked = selectedIds.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => onToggle(o.value)}
            className={`flex items-center gap-[11px] rounded-[14px] border border-solid px-[13px] py-[10px] text-start transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              checked ? 'border-[#1f5a44] bg-[#f4faf6]' : 'border-[#e7dfc9] bg-white'
            }`}
            style={{ fontFamily: FONT_SANS }}
          >
            <img src={checked ? CHECKBOX_CHECKED : CHECKBOX_BLANK} alt="" className="size-[20px] shrink-0" />
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44] text-[13px] font-bold text-white" {...notLanguage}>
              {initials(o.label)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-[6px]">
                <span className="min-w-0 truncate text-[13.5px] font-bold text-[#23302a]">{o.label}</span>
                {o.tag && (
                  <span className="shrink-0 rounded-full bg-[#eaf3ed] px-[7px] py-[1.5px] text-[10px] font-bold text-[#1f5a44]">{o.tag}</span>
                )}
              </span>
              {o.sublabel && <span className="block truncate text-[11.5px] text-[#5a6660]">{o.sublabel}</span>}
            </span>
            {o.badge && <RoleBadge kind={o.badge} />}
          </button>
        )
      })}
      {addedNames?.map((name) => (
        <div key={name} className="flex items-center gap-[11px] rounded-[14px] border border-solid border-[#1f5a44] bg-[#f4faf6] px-[13px] py-[10px]">
          <img src={CHECKBOX_CHECKED} alt="" className="size-[20px] shrink-0" />
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44] text-[13px] font-bold text-white" {...notLanguage}>
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-bold text-[#23302a]" {...td(name)} />
            <span className="block truncate text-[11.5px] text-[#5a6660]" {...tx('Added by ITS')} />
          </span>
        </div>
      ))}
      {onAddIts && (
        <button type="button" onClick={onAddIts} className="mt-[4px] flex items-center gap-[8px] rounded-[14px] border border-dashed border-[#c3ccc6] px-[13px] py-[11px] text-[13px] font-bold text-[#1f5a44] transition-colors hover:border-[#1f5a44] hover:bg-[#f4faf6]" style={{ fontFamily: FONT_SANS }}>
          <span className="flex size-[22px] items-center justify-center rounded-full bg-[#eaf3ed] text-[16px] leading-none">+</span>
          <span {...tx('Add someone by ITS')} />
        </button>
      )}
    </div>
  )
}
