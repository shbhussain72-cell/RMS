const FONT = 'Mulish, system-ui, sans-serif'

export type Step = { label: string; done: boolean }

/** Completed step — filled green circle + white check. Mounts only when the step
 *  flips to done, so the scale-pop + check fade-in play once (not on every render). */
function StepCheck() {
  return (
    <span className="step-pop flex size-[20px] shrink-0 items-center justify-center rounded-full" style={{ background: '#1f7a4d' }}>
      <svg viewBox="0 0 12 10" fill="none" className="step-check-in size-[11px]">
        <path d="M1 5.2l3 3L11 1.4" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** Pending step — hollow outlined circle. */
function StepEmpty() {
  return <span className="size-[20px] shrink-0 rounded-full" style={{ border: '2px solid #c9bd9e', background: 'white' }} />
}

/**
 * Step label. Colour transitions smoothly on done. When the label carries a live
 * "X/Y" count (Members), only the count is keyed → it fades on change while the
 * rest of the pill stays put (no full-indicator re-animation per count tick).
 */
function StepLabel({ label, done }: { label: string; done: boolean }) {
  const m = label.match(/^(.*?)(\d+\/\d+)$/)
  const color = done ? '#1f6a48' : '#9a8d72'
  const base = 'text-[15px] font-semibold'
  if (!m) {
    return <span className={base} style={{ fontFamily: FONT, color }}>{label}</span>
  }
  return (
    <span className={base} style={{ fontFamily: FONT, color }}>
      {m[1]}
      <span key={m[2]} className="step-count-in inline-block">{m[2]}</span>
    </span>
  )
}

/**
 * Desktop-only progress indicator for the allocation flows (City → Zone → Members).
 * Completed steps turn green; pending steps stay tan. The circle pops and the check
 * draws in (one-shot keyframes) as each step completes — subtle success feedback only.
 * NB: colours are applied directly (no CSS transition): the allocation screens re-render
 * every second from the countdown, which leaves a background-color transition perpetually
 * mid-flight (stuck on the "from" colour). Keyframe animations are unaffected.
 */
export default function StepIndicator({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-wrap items-center gap-[10px]">
      {steps.map((s, i) => (
        <span
          key={i}
          className="inline-flex h-[36px] items-center gap-[8px] rounded-full px-[15px]"
          style={{ background: s.done ? '#dceee2' : '#ece4d2' }}
        >
          {s.done ? <StepCheck /> : <StepEmpty />}
          <StepLabel label={s.label} done={s.done} />
        </span>
      ))}
    </div>
  )
}
