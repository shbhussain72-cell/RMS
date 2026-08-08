const FONT = 'Mulish, system-ui, sans-serif'

export type Step = {
  label: string
  done: boolean
  /**
   * A live "3/8" tally shown after the label.
   *
   * Held apart from `label` rather than baked into it. The label used to arrive as the finished
   * string `Members 3/8`, which this component then took apart again with a regex — so the
   * animation only worked while the count happened to be the last thing in the string, which is
   * an assumption about English word order that no translation is obliged to keep.
   */
  count?: string
}

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
 * Step label. Colour transitions smoothly on done. A live "X/Y" tally is keyed on its own
 * value → it fades on change while the rest of the pill stays put, instead of the whole
 * indicator re-animating on every tick.
 *
 * The tally stays LTR in both languages: `3/8` is a ratio, and a solidus between two numerals
 * is a neutral character that would otherwise take its side from the paragraph.
 */
function StepLabel({ label, done, count }: Step) {
  const color = done ? '#1f6a48' : '#9a8d72'
  return (
    <span className="text-[15px] font-semibold" style={{ fontFamily: FONT, color }}>
      {label}
      {count ? (
        <>
          {' '}
          <bdi key={count} className="step-count-in inline-block" style={{ unicodeBidi: 'isolate' }}>{count}</bdi>
        </>
      ) : null}
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
          <StepLabel label={s.label} done={s.done} count={s.count} />
        </span>
      ))}
    </div>
  )
}
