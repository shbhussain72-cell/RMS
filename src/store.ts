/**
 * CONFIRMED: this store is entirely SYNCHRONOUS, by design, and there is nothing to await.
 *
 * There is no `await`, `fetch` or `Promise` anywhere in this file or in the registration flow —
 * every action reads seed data and sets state in the same tick. So there are no loading states
 * to add and no async transitions to guard: a spinner here would render for zero frames and a
 * "still loading" branch would be dead code.
 *
 * Recorded because the absence looks like an oversight to anyone arriving from a normal
 * data-fetching app, and "the flow has no loading states" reads as a bug rather than as the
 * consequence of having no I/O. When a real backend does arrive, that is the point at which
 * loading and empty states become necessary — not before.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INVITE_QUOTA, family, miqaats, liveCities, zonesByCityId } from './data/seed'
import type { LiveCity, Zone } from './data/seed'
import { effectiveSelectedIds, buildAllGroups, type RequestPartyGroup } from './lib/group'
import { notifications } from './data/notifications'

/** Notification ids that start out read (the seed's read flags). */
const SEED_READ_NOTIF_IDS = notifications.filter((n) => n.read).map((n) => n.id)

export interface Invite {
  its: string
  name: string
  age: number
  /** Gender of the invited member (shown in the meta line, consistent with family rows). */
  gender?: 'Male' | 'Female'
  status: 'pending' | 'accepted'
  /** If set, this invite is the linked dependent of the member with this ITS (renders as a group). */
  dependentOf?: string
  /** True for members added via Add People ("Others") — part of the user's own group, NOT counted
   *  against the Mehmaan invitation quota. Mehmaan invites (from the Invite Mehmaan page) omit it. */
  group?: boolean
  /** Home city of an invited member who lives elsewhere (e.g. London) — surfaced at City Selection. */
  location?: string
  /** When this invited member's city-selection window opens (display string). While set, they can't
   *  be reserved yet; City Selection shows "Reservation opens on …" instead of a Reserve action. */
  opensAt?: string
}

export interface RankedCity {
  id: string
  name: string
  region: string
  type?: 'host' | 'relay'
}

export interface SelectedCity {
  id: string
  name: string
  region: string
  type: 'host' | 'relay'
  seatsLeft: number
  totalSeats: number
}

export interface SelectedZone {
  id: string
  name: string
  cityId: string
  cityName: string
  capacity: number
  filled: number
}

/** Per-group city allocation (relay can spread groups across cities). */
export interface GroupCityAlloc {
  id: string
  name: string
  type: 'host' | 'relay'
}

/** Per-group zone allocation (group → zone within a city). */
export interface GroupZoneAlloc {
  id: string
  name: string
  cityId: string
  cityName: string
}

/** Araz submission (early preferred-city choices). Each group gets ONE preferred city — a host OR a
 *  relay city (the `type` on the alloc distinguishes them). This is a preference only: it never
 *  confirms/reserves a city, and it's kept separate from `confirmedCity`/`groupCities`. */
export interface ArazSelection {
  submittedAt: string
  /** group index → the single preferred city (host or relay) chosen for that group. */
  picks: Record<string, GroupCityAlloc>
}

/** "Arrange My Cities" setup — a pure LAYOUT of which city shows in which card slot on City
 *  Selection (host card, preferred-city slots, relay grid order). Saved between registration and
 *  City Selection. Display-only: it never reserves/allocates anything and doesn't touch any
 *  reservation state — City Selection just renders its left-side cards in this order. */
export interface CityArrangement {
  savedAt: string
  /** The city shown in the big Host City card slot. */
  hostCityId: string
  /** City ids pinned into the "Preferred city" card slots, in order (max 6). */
  preferredCityIds: string[]
  /** Remaining city ids in the exact order the relay grid should list them. */
  relayCityIds: string[]
}

/** A city/zone change the user submitted for admin approval. It does NOT alter the reservation until
 *  approved — it's tracked on the Modify Reservation screen so the user can see it's pending (or
 *  cancel it). */
export interface ChangeRequest {
  id: string
  /** The event this request belongs to. */
  miqaatId: string
  /** 'city' = relay/host city move; 'zone' = zone change. */
  kind: 'city' | 'zone'
  /** Short label for the requested change, e.g. "Switch to Colombo". */
  title: string
  /** Names of the members included in the move. */
  memberNames: string[]
  /** Ids of the members included in the move — used to block a member from being submitted into a
   *  second, overlapping request while one is still awaiting approval. */
  memberIds: string[]
  /** Current allocation being moved from. Representative only — see `members` below. */
  fromLabel: string
  /** Requested allocation being moved to. Representative only — see `members` below. */
  toLabel: string
  /** Per-member origin AND destination — the authoritative record of what was actually requested.
   *  Neither end is safe to collapse to a single label:
   *   - origin: the merged "Switch to a different city" option folds groups sitting in DIFFERENT
   *     current cities into one request (some in Delhi, one in Colombo);
   *   - destination: members are staged one at a time against whatever destination was active at
   *     that moment, so changing the picked city mid-selection leaves earlier members staged to the
   *     earlier city.
   *  Present on requests raised from `HostCityMove`; absent on older/simpler ones, which fall back
   *  to the flat `fromLabel`/`toLabel`. */
  members?: { id: string; name: string; fromLabel: string; toLabel: string }[]
  requestedAt: string
}

export type ReopenStage = 'register' | 'city' | 'zone'

/** A request to reopen a window the user missed entirely (registration never completed, or city/zone
 *  never picked before its selection window closed). Unlike `ChangeRequest` (which changes an already-
 *  complete allocation), this unlocks the ability to do the original action at all — so it's tracked
 *  top-level, keyed by miqaat id, rather than inside `flow`/`registrations` (a missed-registration
 *  miqaat has no flow yet to hold it in). */
export interface ReopenRequest {
  miqaatId: string
  stage: ReopenStage
  /** e.g. "Registration", "City Selection", "Zone Selection" — shown on the Requested card. */
  title: string
  requestedAt: string
  /** The destination the user picked in the AI chat (city/zone stages only). On approval it's applied
   *  to the journey (confirmCity/confirmZone) so their choice is honoured, not asked for again. */
  chosenCityId?: string
  chosenZoneId?: string
  /** What the user requested, for the Requested card ("Mumbai", "Zone B — East Wing"). City/zone only. */
  choiceLabel?: string
  /** Zone requests can span several cities (a family split across host + relay cities picks a zone per
   *  city). Each entry maps a city to the chosen zone; applied per-group on approval. */
  chosenZones?: Array<{ cityId: string; cityName: string; zoneId: string; zoneName: string }>
  /** How many members the registration request covers (register stage only). */
  memberCount?: number
  /** The names of the members the registration request covers (register stage only) — shown when the
   *  user taps "View members" on the Requested card / detail-page pending box / Track My Requests. */
  memberNames?: string[]
  /** The full requested party, grouped (linked guardian/caregiver + dependent together) and role-
   *  badged, so "View members" can show who's the registrant, who's a dependent, and who they're
   *  tagged with. Register stage only. */
  memberParty?: RequestPartyGroup[]
  /** Demo-only: no real admin backend exists, so approval is simulated by tapping the Requested card. */
  approved: boolean
}

/** Linear demo-only phase for "Demo Progression Controls" (scoped to ashara-1448 today). One
 *  ordered phase — not independent booleans — so "never opened" vs "opened then closed" stays
 *  unambiguous, while each gating site still derives the single boolean it needs
 *  (e.g. `phase === 'city_open'`, `phase !== 'zone_open'`). Presence of an entry in
 *  `stageOverrides` is what every gating site checks to decide "consult the phase" vs "leave this
 *  event's existing countdownSeconds-driven behavior untouched". */
export type DemoPhase =
  | 'reg_not_open' | 'reg_open' | 'reg_closed'
  | 'city_open' | 'city_closed'
  | 'zone_open' | 'zone_closed'
  | 'raza_issued'

export const DEMO_PHASE_ORDER: DemoPhase[] = [
  'reg_not_open', 'reg_open', 'reg_closed', 'city_open', 'city_closed', 'zone_open', 'zone_closed', 'raza_issued',
]

export interface QuestionnaireAnswers {
  // 1. Personal Information
  mobile: string
  email: string
  // 2. Attendance Details (+ 8. Dependents, folded in when registeringFor === 'family')
  attending: 'yes' | 'no' | null
  registeringFor: 'myself' | 'family' | 'mehmaan' | null
  memberUnder10: 'yes' | 'no' | null
  needsGuardianFlag: 'yes' | 'no' | null
  needsCaregiverFlag: 'yes' | 'no' | null
  // 3. Accommodation
  needsAccommodation: 'yes' | 'no' | null
  accommodationCount: string
  accommodationType: 'shared' | 'family_room' | 'hotel' | null
  // 4. Food Arrangements
  needsFood: 'yes' | 'no' | null
  mealCount: string
  dietary: string[]
  dietaryOther: string
  // 5. Travel Details
  needsTravel: 'yes' | 'no' | null
  arrivalDate: string
  departureDate: string
  travelMode: 'flight' | 'train' | 'bus' | 'personal_vehicle' | null
  /** Admin-added question (demo): highlighted as "New" on the registration form until answered. */
  airportPickupNeeded: 'yes' | 'no' | null
  // 6. Medical Assistance
  needsMedical: 'yes' | 'no' | null
  medicalNeeds: string[]
  // 7. Accessibility Requirements
  accessibilityNeeds: string[]
  accessibilityOther: string
  // 9. Emergency Contact
  emergencyName: string
  emergencyRelation: string
  emergencyMobile: string
  /** Admin-added question (demo): highlighted as "New" on the registration form until answered. */
  emergencyAltMobile: string
  // 10. Confirmation (folded into the Review & Submit step)
  confirmAccurate: boolean
  confirmGuidelines: boolean
  completed: boolean
}

export interface RegistrationFlow {
  /** family member ids included in the group */
  selectedMemberIds: string[]
  /** dependentId -> guardian memberId */
  guardians: Record<string, string>
  /** dependentId -> caregiver memberId */
  caregivers: Record<string, string>
  invites: Invite[]
  cities: RankedCity[]
  submitted: boolean
  referenceNumber: string | null
  // ── City & Zone Selection ──────────────────────────────────────────────────
  /** The city the user confirmed in the live city selection screen */
  confirmedCity: SelectedCity | null
  cityConfirmedAt: string | null
  /** The zone the user confirmed */
  confirmedZone: SelectedZone | null
  zoneConfirmedAt: string | null
  /** Whether Raza has been issued/approved for the group */
  razaIssued: boolean
  /** Which miqaat this registration journey belongs to (drives that card's state). */
  miqaatId: string | null
  /** group index → allocated city (drives the City Allocation view; relay may span cities). */
  groupCities: Record<string, GroupCityAlloc>
  /** group index → allocated zone (drives the Zone Allocation view). */
  groupZones: Record<string, GroupZoneAlloc>
  /** Accepted an incoming "join their group" invite from another member (Notifications → Join
   *  Group). For events that auto-allocate on acceptance, this lets the registrant's own city/zone
   *  selection skip straight to "Auto-allocated" while their own family still self-allocates. */
  joinedGroupInvite: boolean
  /** The Eid-e-Ghadeer group invitation only "arrives" AFTER the user registers for that event —
   *  before that there's nothing to invite them to. Gates the "Invitation received" notification. */
  invitationReceived: boolean
  /** One-shot: show the in-app invitation banner the next time the user lands on Home after
   *  registering. Cleared once the banner has been shown, so it appears exactly once per invitation. */
  invitationBannerPending: boolean
  /** City/zone change requests submitted for admin approval (shown on the Modify screen, cancellable
   *  until reviewed). Pending only — they don't alter the reservation's allocation. */
  changeRequests: ChangeRequest[]
  /** Answers to the pre-registration questionnaire (mobile, accommodation, food, travel, medical,
   *  accessibility, emergency contact, etc.) shown between "Register Now" and Add People. */
  questionnaire: QuestionnaireAnswers
  /** Visa document uploaded by the user for this event's eligibility check (stored as a data URL —
   *  there's no backend/file storage in this prototype). Null until uploaded. */
  visaDocument: VisaDocument | null
  /** When the registration form (questionnaire) was last saved — drives the "Last updated" row on
   *  the Registration Form card. Stamped by every `setQuestionnaire` call. */
  questionnaireUpdatedAt: string | null
  /** Araz early preferred-city submission for this event (null until submitted). Preferences only —
   *  they do NOT set `confirmedCity`/`groupCities` or reserve anything. */
  araz: ArazSelection | null
  /** "Arrange My Cities" layout for this event (null until saved). Once saved, the Home CTA moves
   *  on from "Arrange My Cities" to "Select City", and City Selection renders its city cards in
   *  this order. Layout only — never reserves anything. */
  cityArrangement: CityArrangement | null
}

export interface VisaDocument {
  name: string
  /** base64 data URL, e.g. "data:application/pdf;base64,…" */
  dataUrl: string
  sizeLabel: string
  uploadedAt: string
}

interface StoreState {
  loggedIn: boolean
  /** The registration journey currently being edited (its `miqaatId` names the active event). */
  flow: RegistrationFlow
  /** Completed / in-progress journeys for every OTHER miqaat, keyed by miqaat id. Lets several
   *  events stay registered at once (each shows its own card in the Home "Registered" section).
   *  Invariant: the active `flow`'s miqaat is NOT in this map — it lives in `flow` until switched
   *  away from (see `setActiveMiqaat`), at which point it's archived here. */
  registrations: Record<string, RegistrationFlow>
  /** Requests to reopen a missed registration/city/zone window, keyed by miqaat id — one at a time per
   *  miqaat, since a miqaat can only be missing ONE of the three stages at any given moment. */
  reopenRequests: Record<string, ReopenRequest>
  /** Demo Progression Controls: current demo phase per miqaat id (only 'ashara-1448' today).
   *  Presence of an entry is what every gating site checks to decide "consult the phase" vs
   *  "leave this event's existing countdownSeconds-driven behavior untouched". */
  stageOverrides: Record<string, DemoPhase>
  /** Notification ids the user has read (drives the header badge + read styling). */
  readNotifIds: string[]
  login: () => void
  logout: () => void
  /** Fire when the user registers for Eid-e-Ghadeer: unlocks the invitation notification and arms the
   *  Home-screen invitation banner. */
  receiveInvitation: () => void
  /** Clear the Home-screen invitation banner signal once it's been shown (keeps it one-shot). */
  dismissInvitationBanner: () => void
  /** Mark every notification as read (clears the unread badge). */
  markAllNotificationsRead: () => void
  // family selection
  toggleMember: (id: string) => void
  selectAllFamily: () => void
  assignGuardian: (dependentId: string, guardianId: string) => void
  assignCaregiver: (dependentId: string, caregiverId: string) => void
  removeGuardian: (dependentId: string) => void
  removeCaregiver: (dependentId: string) => void
  // invites
  addInvite: (invite: Invite) => void
  removeInvite: (its: string) => void
  acceptInvite: (its: string) => void
  // preferred cities (ranking)
  addCity: (city: RankedCity) => void
  removeCity: (id: string) => void
  reorderCity: (from: number, to: number) => void
  // submit registration
  submit: () => void
  resetFlow: () => void
  /** Tag the journey with the miqaat the user is acting on (so its card reflects progress). */
  setActiveMiqaat: (id: string) => void
  // city & zone confirmation
  confirmCity: (city: LiveCity) => void
  confirmZone: (zone: Zone, cityId: string, cityName: string) => void
  /** Local events skip city/zone selection entirely — the system allocates both at once. Unlike
   *  confirmZone, this does NOT mark Raza issued: the user still waits on that separately. */
  autoAllocateCityZone: (city: LiveCity, zone: Zone) => void
  resetCityZone: () => void
  /** Cancel ONLY the registrant's own group ('0') city+zone allocation — other groups' allocations
   *  are left untouched. Syncs `confirmedCity`/`confirmedZone` (which mirror group '0') to null. */
  cancelRegistrantCity: () => void
  /** Cancel ONLY the registrant's own group ('0') ZONE — the city allocation is kept. Syncs
   *  `confirmedZone` (mirrors group '0') to null. Other groups' zones are untouched. */
  cancelRegistrantZone: () => void
  /** Persist the per-group city allocation (from the live city selection). */
  setGroupCities: (map: Record<string, GroupCityAlloc>) => void
  /** Persist the per-group zone allocation (from the zone selection). */
  setGroupZones: (map: Record<string, GroupZoneAlloc>) => void
  /** Accept an incoming "join their group" invite (Notifications → Join Group). */
  acceptGroupInvite: () => void
  /** Submit a city/zone change for admin approval (tracked on the Modify screen; doesn't apply yet). */
  addChangeRequest: (req: ChangeRequest) => void
  /** Withdraw a pending change request before it's reviewed. */
  /** Cancel the members whose ids are given. A merged request can cover several groups moving from
   *  different cities, and the user must be able to withdraw one of them without losing the rest —
   *  so cancellation is always member-scoped (Modify Reservation renders one card per group and
   *  passes that card's members). Drops the request itself once no members remain, which is how a
   *  whole request gets cancelled: pass all of its `memberIds`. */
  cancelChangeRequestMembers: (id: string, memberIds: string[]) => void
  /** Raise a request to reopen a missed registration/city/zone window (moves the Home card into the
   *  "Requested" section). */
  requestReopen: (miqaatId: string, stage: ReopenStage, title: string, choice?: { cityId?: string; zoneId?: string; label?: string; memberCount?: number; memberNames?: string[]; memberParty?: RequestPartyGroup[]; zones?: Array<{ cityId: string; cityName: string; zoneId: string; zoneName: string }> }) => void
  /** Demo-only: simulate an admin approving a reopen request (no backend exists) — tapping the
   *  Requested card calls this, then the card returns to its normal section, unlocked. */
  approveReopenRequest: (miqaatId: string) => void
  /** Demo Progression Controls: advance/set `miqaatId`'s demo phase — called by the single "next
   *  action" button in DemoProgressionControl. When advancing to 'raza_issued' it also flips that
   *  journey's `flow.razaIssued` (confirmZone no longer does this automatically once an override
   *  exists for the miqaat — see confirmZone). */
  setStagePhase: (miqaatId: string, phase: DemoPhase) => void
  /** Merge a patch of answers into the active journey's questionnaire. */
  setQuestionnaire: (patch: Partial<QuestionnaireAnswers>) => void
  /** Attach the eligibility visa document to the active journey. */
  setVisaDocument: (doc: VisaDocument) => void
  /** Remove the active journey's uploaded visa document. */
  clearVisaDocument: () => void
  /** Save the active journey's Araz preferred-city choices (group index → preferred host/relay city).
   *  Preferences only — does not touch `confirmedCity`/`groupCities`. */
  saveAraz: (picks: Record<string, GroupCityAlloc>) => void
  /** Save the active journey's "Arrange My Cities" layout (which city sits in which card slot on
   *  City Selection). Layout only — does not touch any reservation state. */
  saveCityArrangement: (arrangement: Omit<CityArrangement, 'savedAt'>) => void
  /** Apply a Modify-Reservation city/zone change IMMEDIATELY (selection window still open — no
   *  admin request needed). Merges the moved groups' new allocations into `groupCities`/`groupZones`
   *  and, when the registrant's own group ('0') moved, syncs `confirmedCity`/`confirmedZone` so the
   *  summary cards (Home, Modify Reservation) reflect the change everywhere. */
  applyCityZoneChange: (cities: Record<string, GroupCityAlloc>, zones: Record<string, GroupZoneAlloc>) => void
}

const emptyQuestionnaire: QuestionnaireAnswers = {
  mobile: '',
  email: '',
  attending: null,
  registeringFor: null,
  memberUnder10: null,
  needsGuardianFlag: null,
  needsCaregiverFlag: null,
  needsAccommodation: null,
  accommodationCount: '',
  accommodationType: null,
  needsFood: null,
  mealCount: '',
  dietary: [],
  dietaryOther: '',
  needsTravel: null,
  arrivalDate: '',
  departureDate: '',
  travelMode: null,
  airportPickupNeeded: null,
  needsMedical: null,
  medicalNeeds: [],
  accessibilityNeeds: [],
  accessibilityOther: '',
  emergencyName: '',
  emergencyRelation: '',
  emergencyMobile: '',
  emergencyAltMobile: '',
  confirmAccurate: false,
  confirmGuidelines: false,
  completed: false,
}

const emptyFlow: RegistrationFlow = {
  selectedMemberIds: [],
  guardians: {},
  caregivers: {},
  invites: [],
  cities: [],
  submitted: false,
  referenceNumber: null,
  confirmedCity: null,
  cityConfirmedAt: null,
  confirmedZone: null,
  zoneConfirmedAt: null,
  razaIssued: false,
  miqaatId: null,
  groupCities: {},
  groupZones: {},
  joinedGroupInvite: false,
  invitationReceived: false,
  invitationBannerPending: false,
  changeRequests: [],
  questionnaire: { ...emptyQuestionnaire },
  visaDocument: null,
  questionnaireUpdatedAt: null,
  araz: null,
  cityArrangement: null,
}

/** Baseline `registrations` entries for the "missed a deadline" demo miqaats — reproducible on every
 *  login (like every other seed miqaat's baseline state), since `miss-city`/`miss-zone` need a
 *  pre-existing registration for their City/Zone Selection cards to render sensibly. `miss-register`
 *  needs no entry: it's exactly like any other never-registered live event. `m3` needsGuardian and
 *  `m5` needsCaregiver — buildAllGroups silently drops a dependent with no guardian/caregiver mapping,
 *  so both must be set for the pre-seeded family of 5 to appear intact. */
function buildDemoRegistrations(): Record<string, RegistrationFlow> {
  const base: RegistrationFlow = {
    ...emptyFlow,
    selectedMemberIds: family.map((f) => f.id),
    guardians: { m3: 'm1' },
    caregivers: { m5: 'm2' },
    submitted: true,
  }
  return {
    'miss-city': { ...base, miqaatId: 'miss-city', referenceNumber: 'MIQ-24901' },
    'miss-zone': {
      ...base,
      miqaatId: 'miss-zone',
      referenceNumber: 'MIQ-24902',
      confirmedCity: { id: 'colombo', name: 'Colombo', region: 'Sri Lanka', type: 'host', seatsLeft: 15, totalSeats: 100 },
      cityConfirmedAt: new Date().toISOString(),
    },
  }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      loggedIn: false,
      flow: { ...emptyFlow },
      registrations: buildDemoRegistrations(),
      reopenRequests: {},
      stageOverrides: { 'ashara-1448': 'reg_not_open' },
      readNotifIds: [...SEED_READ_NOTIF_IDS],

      login: () => set({ loggedIn: true }),
      logout: () => set({ loggedIn: false, flow: { ...emptyFlow }, registrations: buildDemoRegistrations(), reopenRequests: {}, stageOverrides: { 'ashara-1448': 'reg_not_open' }, readNotifIds: [...SEED_READ_NOTIF_IDS] }),

      receiveInvitation: () =>
        set((s) => (s.flow.invitationReceived ? s : { flow: { ...s.flow, invitationReceived: true, invitationBannerPending: true } })),
      dismissInvitationBanner: () =>
        set((s) => (s.flow.invitationBannerPending ? { flow: { ...s.flow, invitationBannerPending: false } } : s)),

      markAllNotificationsRead: () => set({ readNotifIds: notifications.map((n) => n.id) }),

      toggleMember: (id) =>
        set((s) => {
          const has = s.flow.selectedMemberIds.includes(id)
          if (has) {
            // Deselecting a member also deselects any dependent that relies on it as the
            // assigned guardian/caregiver — a dependent can't stay selected without its primary.
            const dropped = new Set<string>([id])
            Object.entries(s.flow.guardians).forEach(([dep, gid]) => { if (gid === id) dropped.add(dep) })
            Object.entries(s.flow.caregivers).forEach(([dep, cid]) => { if (cid === id) dropped.add(dep) })
            return { flow: { ...s.flow, selectedMemberIds: s.flow.selectedMemberIds.filter((m) => !dropped.has(m)) } }
          }
          // Selecting a guardian/caregiver also selects the dependent(s) it covers, so the linked
          // pair is always reserved together (mirrors the deselect cascade above).
          const added = new Set<string>([id])
          Object.entries(s.flow.guardians).forEach(([dep, gid]) => { if (gid === id) added.add(dep) })
          Object.entries(s.flow.caregivers).forEach(([dep, cid]) => { if (cid === id) added.add(dep) })
          return { flow: { ...s.flow, selectedMemberIds: Array.from(new Set([...s.flow.selectedMemberIds, ...added])) } }
        }),

      selectAllFamily: () =>
        set((s) => ({
          flow: { ...s.flow, selectedMemberIds: family.map((m) => m.id) },
        })),

      assignGuardian: (dependentId, guardianId) =>
        set((s) => ({
          flow: {
            ...s.flow,
            guardians: { ...s.flow.guardians, [dependentId]: guardianId },
            // A member can't be both — drop any caregiver role this person holds.
            caregivers: Object.fromEntries(Object.entries(s.flow.caregivers).filter(([, cid]) => cid !== guardianId)),
          },
        })),

      assignCaregiver: (dependentId, caregiverId) =>
        set((s) => ({
          flow: {
            ...s.flow,
            caregivers: { ...s.flow.caregivers, [dependentId]: caregiverId },
            guardians: Object.fromEntries(Object.entries(s.flow.guardians).filter(([, gid]) => gid !== caregiverId)),
          },
        })),

      removeGuardian: (dependentId) =>
        set((s) => {
          const guardians = { ...s.flow.guardians }
          delete guardians[dependentId]
          // The dependent can no longer be selected without a guardian → deselect it.
          return { flow: { ...s.flow, guardians, selectedMemberIds: s.flow.selectedMemberIds.filter((id) => id !== dependentId) } }
        }),

      removeCaregiver: (dependentId) =>
        set((s) => {
          const caregivers = { ...s.flow.caregivers }
          delete caregivers[dependentId]
          return { flow: { ...s.flow, caregivers, selectedMemberIds: s.flow.selectedMemberIds.filter((id) => id !== dependentId) } }
        }),

      addInvite: (invite) =>
        set((s) => {
          if (s.flow.invites.some((i) => i.its === invite.its)) return s
          // Mehmaan invites are capped by INVITE_QUOTA; group ("Others") members are unlimited.
          if (!invite.group) {
            const mehmaanCount = s.flow.invites.filter((i) => !i.group).length
            if (mehmaanCount >= INVITE_QUOTA) return s
          }
          return { flow: { ...s.flow, invites: [...s.flow.invites, invite] } }
        }),

      removeInvite: (its) =>
        set((s) => ({ flow: { ...s.flow, invites: s.flow.invites.filter((i) => i.its !== its) } })),

      acceptInvite: (its) =>
        set((s) => ({
          flow: {
            ...s.flow,
            invites: s.flow.invites.map((i) => i.its === its ? { ...i, status: 'accepted' } : i),
          },
        })),

      addCity: (city) =>
        set((s) => {
          if (s.flow.cities.some((c) => c.id === city.id)) return s
          return { flow: { ...s.flow, cities: [...s.flow.cities, city] } }
        }),

      removeCity: (id) =>
        set((s) => ({ flow: { ...s.flow, cities: s.flow.cities.filter((c) => c.id !== id) } })),

      reorderCity: (from, to) =>
        set((s) => {
          const next = [...s.flow.cities]
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          return { flow: { ...s.flow, cities: next } }
        }),

      submit: () =>
        set((s) => ({
          flow: {
            ...s.flow,
            submitted: true,
            referenceNumber: s.flow.referenceNumber ?? 'MIQ-23106',
          },
        })),

      // Clears the ACTIVE journey (e.g. cancelling a reservation) so its event returns to
      // "not registered". Archived journeys for other events are untouched.
      resetFlow: () =>
        set((s) => {
          if (!s.flow.miqaatId) return { flow: { ...emptyFlow } }
          const registrations = { ...s.registrations }
          delete registrations[s.flow.miqaatId] // belt-and-suspenders (invariant: not present)
          return { flow: { ...emptyFlow }, registrations }
        }),

      // Make `id`'s journey the active one. If we're already on it, no-op. Otherwise archive the
      // outgoing active journey (so its event keeps its Registered card) and load `id`'s saved
      // journey — or a fresh one if this is the first time we touch that event. This is what lets
      // several events stay registered simultaneously: switching between them preserves each.
      setActiveMiqaat: (id) =>
        set((s) => {
          if (s.flow.miqaatId === id) return s
          const registrations = { ...s.registrations }
          if (s.flow.miqaatId) registrations[s.flow.miqaatId] = s.flow // archive outgoing
          const next = registrations[id] ? { ...registrations[id] } : { ...emptyFlow, miqaatId: id }
          delete registrations[id] // the loaded journey is active now, not archived
          return { flow: next, registrations }
        }),

      confirmCity: (city) =>
        set((s) => ({
          flow: {
            ...s.flow,
            confirmedCity: {
              id: city.id,
              name: city.name,
              region: city.region,
              type: city.type,
              seatsLeft: city.seatsLeft,
              totalSeats: city.totalSeats,
            },
            cityConfirmedAt: new Date().toISOString(),
            confirmedZone: null,
            zoneConfirmedAt: null,
            groupZones: {},
          },
        })),

      confirmZone: (zone, cityId, cityName) =>
        set((s) => {
          // Selecting city + zone issues the raza (demo flow → immediate). Once issued it stays
          // issued through zone modifications (re-confirming a zone keeps it true). Exception:
          // once a Demo Progression Controls override exists for this miqaat (ashara-1448 today),
          // Raza is issued ONLY by the dedicated "Issue Raza" control, never automatically here.
          const hasStageOverride = !!s.flow.miqaatId && !!s.stageOverrides[s.flow.miqaatId]
          return {
            flow: {
              ...s.flow,
              confirmedZone: {
                id: zone.id,
                name: zone.name,
                cityId,
                cityName,
                capacity: zone.capacity,
                filled: zone.filled,
              },
              zoneConfirmedAt: new Date().toISOString(),
              razaIssued: hasStageOverride ? s.flow.razaIssued : true,
            },
          }
        }),

      autoAllocateCityZone: (city, zone) =>
        set((s) => {
          // Auto-allocation skips City/Zone Selection, but Modify Reservation builds its change/swap
          // options from the PER-GROUP allocation (`groupCities` / `groupZones`) — the same shape
          // that selection would have written. Populate every group with the allocated city/zone so
          // the manage screen shows the reservation as allocated (not an empty "City not opened yet"
          // state) and offers the same change options as a manually-selected reservation.
          const selectedIds = s.flow.selectedMemberIds.length > 0 ? s.flow.selectedMemberIds : family.map((f) => f.id)
          const groups = buildAllGroups(selectedIds, s.flow.guardians, s.flow.caregivers, s.flow.invites)
          const groupCities: Record<string, GroupCityAlloc> = {}
          const groupZones: Record<string, GroupZoneAlloc> = {}
          groups.forEach((_, gi) => {
            groupCities[gi] = { id: city.id, name: city.name, type: city.type }
            groupZones[gi] = { id: zone.id, name: zone.name, cityId: city.id, cityName: city.name }
          })
          return {
            flow: {
              ...s.flow,
              confirmedCity: {
                id: city.id,
                name: city.name,
                region: city.region,
                type: city.type,
                seatsLeft: city.seatsLeft,
                totalSeats: city.totalSeats,
              },
              cityConfirmedAt: new Date().toISOString(),
              confirmedZone: {
                id: zone.id,
                name: zone.name,
                cityId: city.id,
                cityName: city.name,
                capacity: zone.capacity,
                filled: zone.filled,
              },
              zoneConfirmedAt: new Date().toISOString(),
              groupCities,
              groupZones,
            },
          }
        }),

      resetCityZone: () =>
        set((s) => ({
          flow: {
            ...s.flow,
            confirmedCity: null,
            cityConfirmedAt: null,
            confirmedZone: null,
            zoneConfirmedAt: null,
            groupCities: {},
            groupZones: {},
          },
        })),

      // Cancel ONLY the registrant's own group ('0') allocation. Other groups keep their city/zone.
      cancelRegistrantCity: () =>
        set((s) => {
          const groupCities = { ...s.flow.groupCities }; delete groupCities['0']
          const groupZones = { ...s.flow.groupZones }; delete groupZones['0']
          return {
            flow: {
              ...s.flow,
              confirmedCity: null,
              cityConfirmedAt: null,
              confirmedZone: null,
              zoneConfirmedAt: null,
              groupCities,
              groupZones,
            },
          }
        }),

      // Cancel ONLY the registrant's own group ('0') zone — the city stays. Other groups keep theirs.
      cancelRegistrantZone: () =>
        set((s) => {
          const groupZones = { ...s.flow.groupZones }; delete groupZones['0']
          return {
            flow: {
              ...s.flow,
              confirmedZone: null,
              zoneConfirmedAt: null,
              groupZones,
            },
          }
        }),

      setGroupCities: (map) => set((s) => ({ flow: { ...s.flow, groupCities: map } })),
      setGroupZones: (map) => set((s) => ({ flow: { ...s.flow, groupZones: map } })),

      // Accepting a "join their group" invite auto-allocates ONLY the REGISTRANT (the invited member,
      // their own solo group) to the host city + host zone — they join the inviter's group, so their
      // city and zone settle instantly (Raza still pending, mirroring `autoAllocateCityZone`).
      //
      // Their family does NOT auto-allocate: they must self-allocate city + zone. Because the
      // reservation summary reads the SINGLE confirmed city/zone (the whole party), we only write it
      // when the registrant is the sole group (a lone invite). If family is also registered, we leave
      // it unset so the card stays at "Select City" and the family is allocated through City/Zone
      // Selection — where the registrant's own group still shows auto-allocated (the isAutoGroup rule).
      acceptGroupInvite: () =>
        set((s) => {
          const flow = { ...s.flow, joinedGroupInvite: true }
          const miqaat = miqaats.find((m) => m.autoAllocateSelfViaInvite)
          if (!miqaat) return { flow }
          flow.miqaatId = miqaat.id // this event's journey now belongs to the flow

          const selectedIds = flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)
          const invitesForGroups = miqaat.hideInviteMehmaan ? flow.invites.filter((i) => i.group) : flow.invites
          const groups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, invitesForGroups)
          const registrantOnly =
            groups.length === 1 &&
            groups[0].members.length === 1 &&
            groups[0].members[0].member.role === 'registrant'
          if (!registrantOnly) return { flow } // family present → they self-allocate; card → "Select City"

          const hostCity = liveCities.find((c) => c.name === miqaat.hostCity) ?? liveCities[0]
          const zone = hostCity && zonesByCityId[hostCity.id]?.[0]
          if (hostCity && zone) {
            flow.confirmedCity = {
              id: hostCity.id,
              name: hostCity.name,
              region: hostCity.region,
              type: hostCity.type,
              seatsLeft: hostCity.seatsLeft,
              totalSeats: hostCity.totalSeats,
            }
            flow.cityConfirmedAt = new Date().toISOString()
            flow.confirmedZone = {
              id: zone.id,
              name: zone.name,
              cityId: hostCity.id,
              cityName: hostCity.name,
              capacity: zone.capacity,
              filled: zone.filled,
            }
            flow.zoneConfirmedAt = new Date().toISOString()
          }
          return { flow }
        }),

      addChangeRequest: (req) =>
        set((s) => ({ flow: { ...s.flow, changeRequests: [...s.flow.changeRequests, req] } })),
      cancelChangeRequestMembers: (reqId, memberIds) =>
        set((s) => {
          const drop = new Set(memberIds)
          const changeRequests = s.flow.changeRequests.flatMap((r) => {
            if (r.id !== reqId) return [r]
            // Keep the three member collections in lockstep — `memberIds`/`memberNames` are
            // parallel arrays elsewhere (RequestCard indexes one by the other), so filter names by
            // their id's position rather than by name (duplicate names would desync them).
            const keptIdx = r.memberIds.map((_, i) => i).filter((i) => !drop.has(r.memberIds[i]))
            if (keptIdx.length === 0) return [] // nothing left → the request itself is cancelled
            return [{
              ...r,
              memberIds: keptIdx.map((i) => r.memberIds[i]),
              memberNames: keptIdx.map((i) => r.memberNames[i]),
              members: r.members?.filter((m) => !drop.has(m.id)),
            }]
          })
          return { flow: { ...s.flow, changeRequests } }
        }),

      requestReopen: (miqaatId, stage, title, choice) =>
        set((s) => ({
          reopenRequests: {
            ...s.reopenRequests,
            [miqaatId]: {
              miqaatId,
              stage,
              title,
              chosenCityId: choice?.cityId,
              chosenZoneId: choice?.zoneId,
              choiceLabel: choice?.label,
              chosenZones: choice?.zones,
              memberCount: choice?.memberCount,
              memberNames: choice?.memberNames,
              memberParty: choice?.memberParty,
              requestedAt: new Date().toISOString(),
              approved: false,
            },
          },
        })),
      approveReopenRequest: (miqaatId) =>
        set((s) => {
          const req = s.reopenRequests[miqaatId]
          if (!req) return s
          return { reopenRequests: { ...s.reopenRequests, [miqaatId]: { ...req, approved: true } } }
        }),

      setStagePhase: (miqaatId, phase) =>
        set((s) => {
          const stageOverrides = { ...s.stageOverrides, [miqaatId]: phase }
          if (phase === 'raza_issued') {
            if (s.flow.miqaatId === miqaatId) return { stageOverrides, flow: { ...s.flow, razaIssued: true } }
            if (s.registrations[miqaatId]) {
              return { stageOverrides, registrations: { ...s.registrations, [miqaatId]: { ...s.registrations[miqaatId], razaIssued: true } } }
            }
          }
          return { stageOverrides }
        }),

      setQuestionnaire: (patch) =>
        set((s) => ({
          flow: { ...s.flow, questionnaire: { ...s.flow.questionnaire, ...patch }, questionnaireUpdatedAt: new Date().toISOString() },
        })),

      setVisaDocument: (doc) => set((s) => ({ flow: { ...s.flow, visaDocument: doc } })),
      clearVisaDocument: () => set((s) => ({ flow: { ...s.flow, visaDocument: null } })),

      saveAraz: (picks) =>
        set((s) => ({ flow: { ...s.flow, araz: { submittedAt: new Date().toISOString(), picks } } })),

      saveCityArrangement: (arrangement) =>
        set((s) => ({ flow: { ...s.flow, cityArrangement: { ...arrangement, savedAt: new Date().toISOString() } } })),

      applyCityZoneChange: (cities, zones) =>
        set((s) => {
          const flow = {
            ...s.flow,
            groupCities: { ...s.flow.groupCities, ...cities },
            groupZones: { ...s.flow.groupZones, ...zones },
          }
          // Group '0' is the registrant's own group — the single `confirmedCity`/`confirmedZone`
          // summary fields mirror it (Home cards and older read paths still read them), so a move
          // that covers it must update them too or those surfaces would keep showing the old city.
          const c0 = cities['0']
          if (c0) {
            const live = liveCities.find((c) => c.id === c0.id)
            flow.confirmedCity = {
              id: c0.id,
              name: c0.name,
              type: c0.type,
              region: live?.region ?? s.flow.confirmedCity?.region ?? '',
              seatsLeft: live?.seatsLeft ?? s.flow.confirmedCity?.seatsLeft ?? 0,
              totalSeats: live?.totalSeats ?? s.flow.confirmedCity?.totalSeats ?? 0,
            }
            flow.cityConfirmedAt = new Date().toISOString()
            // City moved without a new zone in the same action → any old zone belongs to the OLD
            // city and no longer applies (mirrors confirmCity's reset).
            if (!zones['0'] && s.flow.confirmedZone && s.flow.confirmedZone.cityId !== c0.id) {
              flow.confirmedZone = null
              flow.zoneConfirmedAt = null
            }
          }
          const z0 = zones['0']
          if (z0) {
            const zz = (zonesByCityId[z0.cityId] ?? []).find((z) => z.id === z0.id)
            flow.confirmedZone = {
              id: z0.id,
              name: z0.name,
              cityId: z0.cityId,
              cityName: z0.cityName,
              capacity: zz?.capacity ?? s.flow.confirmedZone?.capacity ?? 0,
              filled: zz?.filled ?? s.flow.confirmedZone?.filled ?? 0,
            }
            flow.zoneConfirmedAt = new Date().toISOString()
          }
          return { flow }
        }),
    }),
    { name: 'miqaat-flow', partialize: (s) => ({ loggedIn: s.loggedIn, flow: s.flow, registrations: s.registrations, reopenRequests: s.reopenRequests, stageOverrides: s.stageOverrides }) },
  ),
)

// ---- derived selectors (kept as plain helpers to avoid re-render churn) ----

/** Shared frozen empty journey, returned for any miqaat with no registration yet. */
export const EMPTY_FLOW: RegistrationFlow = emptyFlow

/** The registration journey that belongs to `id` — the active `flow` if it owns that event,
 *  otherwise its archived journey (or an empty one). Lets Home/detail render each event's own
 *  state even when a different event is the one currently being edited. */
export function journeyFor(
  flow: RegistrationFlow,
  registrations: Record<string, RegistrationFlow>,
  id: string,
): RegistrationFlow {
  if (flow.miqaatId === id) return flow
  return registrations[id] ?? EMPTY_FLOW
}

export function headcount(flow: RegistrationFlow) {
  // Excludes any dependent without an eligible (assigned + selected) guardian/caregiver.
  return effectiveSelectedIds(flow.selectedMemberIds, flow.guardians, flow.caregivers).length + flow.invites.length
}
