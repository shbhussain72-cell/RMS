import { useTour } from './TourProvider'
import { useT } from '../i18n'

/**
 * "Take a tour" entry point placed in the app headers. Restarts the walkthrough on demand — this is
 * how the user re-opens the guide after completing or skipping it. Rendered on the dark green header,
 * so the glyph is white.
 */
export default function TourHelpButton({ className = '' }: { className?: string }) {
  const { t } = useT()
  const { replayCurrent } = useTour()
  return (
    <button
      type="button"
      onClick={replayCurrent}
      aria-label={t('Show walkthrough for this page')}
      title={t('Show walkthrough for this page')}
      className={`flex size-[36px] shrink-0 items-center justify-center rounded-[11px] transition-colors hover:bg-[rgba(255,255,255,0.12)] ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[22px]" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" className="text-white" />
        <path
          d="M9.4 9.3a2.6 2.6 0 015.05.85c0 1.73-2.6 2.6-2.6 2.6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white"
        />
        <circle cx="12" cy="16.6" r="1" fill="currentColor" className="text-white" />
      </svg>
    </button>
  )
}
