import type { MemberLookup } from '@/data/seed'
import { useT } from '../i18n'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

/** 8-digit ITS lookup, ported interaction-for-interaction from AddPeople.tsx's own ITS entry —
 *  digits-only, capped at 8, looked-up member staged locally until confirmed. */
export default function ChatItsEntry({
  value,
  onChange,
  error,
  result,
  onConfirm,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  error: string | null
  result: MemberLookup | null
  onConfirm: () => void
  onCancel: () => void
}) {
     const { tx, t } = useT()
  return (
    <div className="flex flex-col gap-[8px]">
      <input
        autoFocus
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('Enter 8-digit ITS ID')}
        className="h-[40px] w-full rounded-full border border-[#e7dfc9] bg-white px-[14px] text-[14px] text-[#23302a] outline-none focus:border-[#1f5a44]"
        style={{ fontFamily: FONT_SANS }}
      />
      {error && (
        <p className="text-[12px] text-[#c0392b]" style={{ fontFamily: FONT_SANS }}>
          {error}
        </p>
      )}
      {result && (
        <div className="flex items-center justify-between gap-[8px] rounded-[12px] border border-[#d9c98a] bg-[#fffdf5] px-[12px] py-[9px]">
          <span className="truncate text-[13px] font-bold text-[#23302a]" style={{ fontFamily: FONT_SANS }}>
            {result.name} · {t('Age')} {result.age}
          </span>
          <button type="button" onClick={onConfirm} className="shrink-0 rounded-full bg-[#1f5a44] px-[12px] py-[6px] text-[12px] font-bold text-white" style={{ fontFamily: FONT_SANS }} {...tx('Add')} />
        </div>
      )}
      <button type="button" onClick={onCancel} className="self-start text-[12px] text-[#8a938e] underline" style={{ fontFamily: FONT_SANS }} {...tx('Cancel')} />
    </div>
  )
}
