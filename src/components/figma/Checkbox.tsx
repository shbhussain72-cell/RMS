const GOLD = '#B48B39'

/**
 * The single approved member-selection checkbox used by every allocation table
 * (desktop + mobile). One component, one design — three visual states:
 *   - checked              → filled gold (#B48B39) + white check
 *   - active, unchecked    → gold outline (the table's prerequisite is met, so the
 *                            row is ready to pick)
 *   - disabled, unchecked  → grey outline (prerequisite not met → looks inactive)
 *
 * `onClick` may still be passed on disabled rows (e.g. to surface a "select a city
 * first" toast) — `disabled` only controls the unchecked appearance, never wiring.
 */
export default function Checkbox({ checked, disabled = false, onClick }: {
  checked: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      className={`size-[18px] shrink-0 rounded-[4px] flex items-center justify-center ${interactive ? 'cursor-pointer sm:hover:scale-110 sm:active:scale-90' : ''}`}
      style={{
        background: checked ? GOLD : 'transparent',
        border: checked ? 'none' : `2px solid ${disabled ? '#c8c8c8' : GOLD}`,
        // Transition only the border (grey→gold when the table activates) and the hover
        // scale — NOT background. Animating background-color under a per-second countdown
        // re-render left the checked fill stuck transparent on the modify-zone screens.
        transition: 'border-color 200ms ease-out, transform 200ms ease-out',
      }}
    >
      {checked && (
        <svg viewBox="0 0 10 8" fill="none" className="size-[10px]">
          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}
