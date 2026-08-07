import { useCallback, useRef, useState } from 'react'

const FONT = 'Mulish, system-ui, sans-serif'

export type ToastTone = 'warn' | 'success' | 'error'
export interface ToastMsg { text: string; tone: ToastTone }

/** Tone only changes the colour/icon. Position, size, animation and timing stay identical so the
 *  toast is visually consistent across every screen (web + mobile). */
const STYLE: Record<ToastTone, { bg: string; fg: string; ring: string; shadow: string }> = {
  warn: { bg: '#fdf0db', fg: '#8a5a1e', ring: '#c98a2e', shadow: '0 12px 30px -8px rgba(120,80,20,0.32)' },
  success: { bg: '#1f5a44', fg: '#ffffff', ring: '#bfe0cb', shadow: '0 12px 30px -8px rgba(21,64,47,0.5)' },
  error: { bg: '#c53030', fg: '#ffffff', ring: '#f3b4b4', shadow: '0 12px 30px -8px rgba(165,42,42,0.4)' },
}

/** Shared transient-toast state. One hook → consistent auto-dismiss timing everywhere. */
export function useToast(duration = 2800) {
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback(
    (text: string, tone: ToastTone = 'warn') => {
      setToast({ text, tone })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setToast(null), duration)
    },
    [duration],
  )
  return { toast, showToast }
}

/** Render the active toast (or nothing). Pin it once near the bottom of the screen — it is
 *  `fixed` and sits just above the sticky CTA. Defaults to centred; `align="right"` tucks it to the
 *  right edge (aligned with the footer's content inset) so it clears a busy centre column. */
export default function Toast({ toast, align = 'center' }: { toast: ToastMsg | null; align?: 'center' | 'right' }) {
  if (!toast) return null
  const s = STYLE[toast.tone]
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-[118px] z-[90] flex px-[16px] ${
        align === 'right' ? 'justify-end sm:pe-[var(--content-px)]' : 'justify-center'
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        key={toast.text}
        className="toast-in flex max-w-[calc(100%-20px)] items-center gap-[8px] rounded-full px-[18px] py-[10px]"
        style={{ background: s.bg, boxShadow: s.shadow }}
      >
        {toast.tone === 'warn' && (
          <svg viewBox="0 0 18 18" fill="none" className="size-[15px] shrink-0">
            <circle cx="9" cy="9" r="7" stroke={s.ring} strokeWidth="1.5" />
            <path d="M9 5.4V9.6M9 12.1h.01" stroke={s.ring} strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        )}
        <span className="whitespace-nowrap text-[13.5px] font-semibold" style={{ fontFamily: FONT, color: s.fg }}>
          {toast.text}
        </span>
      </div>
    </div>
  )
}
