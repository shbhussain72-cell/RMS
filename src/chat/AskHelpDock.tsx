import { useEffect, useState } from 'react'
import AskHelpChat from './AskHelpChat'
import { AiSparkGlyph } from './icons'
import type { AskHelpInit } from './types'
import { useT } from '../i18n'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

/** Home-only general entry point (floater) for the Ask Help chat, plus the shell that also opens
 *  when a specific card's "Ask Help" CTA fires (`askHelp` set from outside). Both drive the same
 *  chat instance so there's only ever one conversation open at a time. */
export default function AskHelpDock({
  askHelp,
  onConsumeAskHelp,
  onToast,
  scopedMiqaatId,
  returnTo,
  floaterClassName = 'fixed bottom-[24px] right-[20px] z-[100]',
}: {
  askHelp: AskHelpInit | null
  onConsumeAskHelp: () => void
  onToast: (msg: string) => void
  /** When set, the floater opens the chat LOCKED to this one event (Miqaat detail page) — the user
   *  still picks what they need help with, but the request only ever targets this event. */
  scopedMiqaatId?: string
  /** Where a submitted request should return the user (the event's detail page) instead of Home. */
  returnTo?: string
  /** Floater button position (defaults to Home's bottom-right). The detail page overrides this to
   *  clear its sticky footer + timeline fab. */
  floaterClassName?: string
}) {
     const { tx, t } = useT()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (askHelp) setOpen(true)
  }, [askHelp])

  const close = () => {
    setOpen(false)
    onConsumeAskHelp()
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('Ask Help')}
          className={`ai-cta ${floaterClassName}`}
        >
          <span className="ai-cta__glow" aria-hidden="true" />
          <span className="ai-cta__ring">
            <span className="ai-cta__spin" aria-hidden="true" />
            <span className="ai-cta__pill">
              <AiSparkGlyph className="size-[20px]" />
              <span className="text-[14px] font-bold" style={{ fontFamily: FONT_SANS }} {...tx('Ask Help')} />
            </span>
          </span>
        </button>
      )}
      {open && <AskHelpChat key={askHelp ? `${askHelp.category}-${askHelp.miqaatId}` : (scopedMiqaatId ? `scoped-${scopedMiqaatId}` : 'general')} init={askHelp ?? { category: null, scopedMiqaatId, returnTo }} onToast={onToast} onClose={close} />}
    </>
  )
}
