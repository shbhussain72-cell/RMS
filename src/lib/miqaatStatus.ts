// Shared miqaat status/reopen-stage helpers — factored out of MiqaatList.tsx so both the Home
// screen and the Ask Help chat (src/chat/) can classify events identically without one importing
// the other (which would create a circular import between the screen and the chat feature).
import { miqaats, type Miqaat } from '@/data/seed'
import { journeyFor, DEMO_PHASE_ORDER, type ReopenStage, type ReopenRequest, type DemoPhase } from '@/store'

type Flow = Parameters<typeof journeyFor>[0]
type Registrations = Parameters<typeof journeyFor>[1]

export type DisplayMiqaat = Miqaat & { effectiveStatus: string }

/** Derive a card's display state from the user's journey for THAT miqaat (else its seed status).
 *  `demoPhase` (Demo Progression Controls, ashara-1448 only) gates whether a confirmed city already
 *  unlocks "Select zone" — while the phase hasn't actually reached `zone_open` yet, a confirmed city
 *  reads as `city_done_waiting_zone` instead of jumping straight to host/relay_allocated. */
export function deriveStatus(m: Miqaat, flow: Flow, demoPhase?: DemoPhase): string {
  if (m.id !== flow.miqaatId) return m.status // other miqaats keep their seed state
  if (flow.confirmedZone) return flow.razaIssued ? 'raza_issued' : 'zone_done' // raza issued (final) / zone allocated
  if (flow.confirmedCity) {
    const zoneStageReached = !demoPhase || DEMO_PHASE_ORDER.indexOf(demoPhase) >= DEMO_PHASE_ORDER.indexOf('zone_open')
    if (!zoneStageReached) return 'city_done_waiting_zone'
    return flow.confirmedCity.type === 'host' ? 'host_allocated' : 'relay_allocated' // State 3 / 4
  }
  if (flow.submitted) return 'registered_select' // State 2 — registered → Select City
  return m.status // State 1 — not registered yet
}

/** Statuses that mean the user has an active/registered reservation → "Registered" section. */
export const REGISTERED_STATES = ['registered_select', 'city_open', 'zone_open', 'zone_select', 'host_allocated', 'relay_allocated', 'zone_done', 'raza_issued', 'city_done_waiting_zone']

/** Which reopen stage (if any) a status maps to, and its display title — shared by the "Ask Help"
 *  CTA (useCard) and the Requested card's stage label. */
export function reopenStageFor(s: string): { stage: ReopenStage; title: string } | null {
  if (s === 'live') return { stage: 'register', title: 'Registration' }
  if (s === 'city_open' || s === 'registered_select') return { stage: 'city', title: 'City Selection' }
  if (s === 'zone_select' || s === 'host_allocated' || s === 'relay_allocated' || s === 'zone_open') return { stage: 'zone', title: 'Zone Selection' }
  return null
}

export const REOPEN_CTA_LABEL: Record<ReopenStage, string> = { register: 'Request to Register', city: 'Request City', zone: 'Request Zone' }

/** What the user requested, for the Requested card (Home) and Track My Requests (Ask Help chat).
 *  These are allocation/registration requests (the user's picked city/zone, or a registration with
 *  N members) shown as pending — NOT "reopen a window". */
export function requestSummary(request: ReopenRequest): string {
  if (request.stage === 'register') {
    const n = request.memberCount
    return `Registration requested${n ? ` · ${n} member${n === 1 ? '' : 's'}` : ''}`
  }
  const what = request.choiceLabel ?? (request.stage === 'city' ? 'a city' : 'a zone')
  return `Requested: ${what}`
}

/** Every non-Ashara miqaat with its display status resolved against the user's journeys. */
export function getDisplayMiqaats(flow: Flow, registrations: Registrations): DisplayMiqaat[] {
  const journey = (id: string) => journeyFor(flow, registrations, id)
  return miqaats
    .filter((m) => m.id !== 'ashara-1448')
    .map((m) => ({ ...m, effectiveStatus: deriveStatus(m, journey(m.id)) }))
}
