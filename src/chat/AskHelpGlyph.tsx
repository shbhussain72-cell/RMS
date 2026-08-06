/** Chat-bubble-with-question-mark glyph — inline so it inherits `currentColor`, matching the
 *  CalendarGlyph/ClockGlyph pattern in MiqaatList.tsx. Used by the per-card "Ask Help" CTA and
 *  the general floater. */
export default function AskHelpGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4.5 5.5A2.5 2.5 0 0 1 7 3h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 15H9.8l-3.9 3.15c-.4.32-.9-.06-.9-.55V15A2.5 2.5 0 0 1 2.5 12.5v-7A2.5 2.5 0 0 1 4.5 5.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 8.3c0-1.1.9-1.9 2.1-1.9s2.1.7 2.1 1.8c0 .8-.4 1.2-1 1.7-.5.4-.7.7-.7 1.2h-1.3c0-.9.4-1.3 1-1.8.4-.3.6-.6.6-1 0-.5-.4-.8-.9-.8-.6 0-1 .3-1 .9z"
        fill="currentColor"
      />
      <circle cx="12" cy="13.6" r="0.75" fill="currentColor" />
    </svg>
  )
}
