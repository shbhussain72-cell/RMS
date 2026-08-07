import { useStore, journeyFor, type DemoPhase, type RegistrationFlow } from '../../store'
import { useT } from '../../i18n'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

type NonTerminalPhase = Exclude<DemoPhase, 'raza_issued'>

const NEXT: Record<NonTerminalPhase, { label: string; next: DemoPhase; ready: (f: RegistrationFlow) => boolean }> = {
  reg_not_open: { label: 'Open Registration', next: 'reg_open', ready: () => true },
  reg_open: { label: 'Close Registration', next: 'reg_closed', ready: (f) => f.submitted },
  reg_closed: { label: 'Open City Selection', next: 'city_open', ready: () => true },
  // Closing City Selection only needs the user to be registered — NOT to currently hold a confirmed
  // city. This lets the "cancel my city → gate closes → Ask Help re-request" demo proceed even after
  // the registrant has cancelled their own city (confirmedCity is null then).
  city_open: { label: 'Close City Selection', next: 'city_closed', ready: (f) => f.submitted },
  city_closed: { label: 'Open Zone Selection', next: 'zone_open', ready: () => true },
  // Like City Selection, closing Zone Selection only needs the user to be registered — not to
  // currently hold a confirmed zone — so the "cancel my zone → close gate → Ask Help request" demo works.
  zone_open: { label: 'Close Zone Selection', next: 'zone_closed', ready: (f) => f.submitted },
  zone_closed: { label: 'Issue Raza', next: 'raza_issued', ready: () => true },
}

/**
 * Demo Progression Controls — a single "next action" pill for stepping ashara-1448 through its
 * demo lifecycle (Registration → City Selection → Zone Selection → Raza) without waiting on real
 * countdowns. Shows exactly ONE button at a time (the current phase's next step) — a "Close X"
 * step stays hidden entirely (not shown-disabled) until its stage is actually completed
 * (submitted/confirmedCity/confirmedZone), then appears ready to tap. Renders nothing once Raza
 * is issued (terminal state). Deliberately styled distinct from real CTAs (dashed outline,
 * translucent fill, "(Demo)" caption) so a presenter can tell it apart from an actual user action.
 * Safe to drop into an already-clickable card (stops propagation) or a plain banner alike.
 */
export function DemoProgressionControl({ miqaatId, className = '' }: { miqaatId: string; className?: string }) {
  const { tx } = useT()
  const phase = useStore((s) => s.stageOverrides[miqaatId])
  const flow = useStore((s) => journeyFor(s.flow, s.registrations, miqaatId))
  const setStagePhase = useStore((s) => s.setStagePhase)

  if (!phase || phase === 'raza_issued') return null

  const step = NEXT[phase]
  if (!step.ready(flow)) return null

  return (
    <div className={`flex flex-col items-start gap-[4px] ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setStagePhase(miqaatId, step.next)
        }}
        className="inline-flex h-[38px] items-center justify-center whitespace-nowrap rounded-full border border-dashed border-[rgba(227,205,150,0.7)] bg-[rgba(0,0,0,0.45)] px-[16px] text-[13px] tracking-[0.2px] text-[#e3cd96] backdrop-blur-[3px]"
        style={{ fontFamily: FONT_SANS, fontWeight: 700 }}
      >
        ▶ <span {...tx(step.label)} />
      </button>
      <p className="text-[11px] leading-[14px] text-[rgba(255,255,255,0.85)]" style={{ fontFamily: FONT_SANS }}>
        (Demo) Tap to advance the demo.
      </p>
    </div>
  )
}
