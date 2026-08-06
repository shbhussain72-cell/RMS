import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { family, liveCities, zonesByCityId, lookupMember, age2, miqaats, type MemberLookup } from '@/data/seed'
import { buildAllGroups, memberBlockedReason, resolveRequestMembers, roleBadgeFor } from '@/lib/group'
import { useStore, journeyFor, DEMO_PHASE_ORDER, type ReopenStage } from '@/store'
import { deriveStatus, getDisplayMiqaats, reopenStageFor, requestSummary, type DisplayMiqaat } from '@/lib/miqaatStatus'
import type { AskHelpInit, ChatAddedMember, ChatBubble, ChatCategory, ChatOption, ChatStep } from './types'

const CATEGORY_LABEL: Record<ChatCategory, string> = {
  register: 'Register for an event',
  city: 'City selection',
  zone: 'Zone selection',
}

// Explicit display order for the event list (open events first, in the product-requested order). Any
// event not listed (e.g. closed/missed ones) keeps its seed order and falls after these — a stable sort.
const EVENT_ORDER = ['open-city', 'open-zone', 'miss-register', 'eg-soon', 'eg-registered', 'eg-cityopen', 'eg-live']
const eventRank = (id: string) => {
  const i = EVENT_ORDER.indexOf(id)
  return i === -1 ? EVENT_ORDER.length : i
}

function eventPrompt(cat: ChatCategory) {
  if (cat === 'register') return 'Which event would you like to register for?'
  return `Which event needs ${cat === 'city' ? 'city' : 'zone'} help?`
}
function memberPrompt(cat: ChatCategory) {
  return cat === 'register' ? 'Who would you like to register?' : 'Which member(s) is this request for?'
}
function zonePrompt(cityName: string, remaining: number) {
  // remaining > 1 means more cities to come after this one → make the per-city framing explicit.
  return remaining > 1 ? `Which zone in ${cityName}? (${remaining} cities to choose)` : `Which zone would you like in ${cityName}?`
}
function destinationPrompt(cat: ChatCategory) {
  return cat === 'city' ? 'Which city would you like?' : 'Which zone would you like?'
}

let bubbleSeq = 0
const nextBubbleId = () => `b${++bubbleSeq}`

// A stable, human-readable request number from the miqaat id — deterministic so the same request
// always shows the same "REQ-######" across renders (no real backend issues one).
function reqNumber(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return `REQ-${100000 + (h % 900000)}`
}
function formatReqDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
const STAGE_CATEGORY: Record<ReopenStage, string> = {
  register: 'Registration',
  city: 'City selection',
  zone: 'Zone selection',
}

/** Scripted, structured "AI chat" state machine — no real backend/LLM, just a guided quick-reply
 *  flow that ends by calling the same store actions the real screens already use (see the confirm
 *  handlers below). Kept entirely component-local: it never needs to survive a reload/navigation
 *  mid-conversation (destination picking stays in bubbles; the one handoff point, Register → an
 *  open event's Add People screen, happens only after the real store mutations are already committed). */
export function useAskHelpChat(init: AskHelpInit, onToast: (msg: string) => void, onClose: () => void) {
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const registrations = useStore((s) => s.registrations)
  const requestReopen = useStore((s) => s.requestReopen)
  const addChangeRequest = useStore((s) => s.addChangeRequest)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const resetFlow = useStore((s) => s.resetFlow)
  const reopenRequests = useStore((s) => s.reopenRequests)
  const stageOverrides = useStore((s) => s.stageOverrides)
  const asharaPhase = stageOverrides['ashara-1448']

  // `getDisplayMiqaats` deliberately drops ashara-1448 (it's the Home hero, not a card). The Ask Help
  // chat, however, needs it selectable for its City/Zone request flow, so append it here with a
  // DEMO-phase-derived status. Every downstream lookup (`activeMiqaat`, `pickEvent`, scoped init)
  // reads this same list, so ashara resolves correctly once picked.
  const displayMiqaats = useMemo(() => {
    const base = getDisplayMiqaats(flow, registrations)
    const ashara = miqaats.find((m) => m.id === 'ashara-1448')
    if (ashara) base.push({ ...ashara, effectiveStatus: deriveStatus(ashara, journeyFor(flow, registrations, 'ashara-1448'), asharaPhase) })
    return base
  }, [flow, registrations, asharaPhase])

  // "Track My Requests" — every miqaat with a filed reopen request (pending or already approved),
  // for the read-only status list. Mirrors Home's "Requested" section but summarised for the chat.
  // Sourced from the FULL miqaat list (not `displayMiqaats`, which drops ashara-1448) so a request
  // filed for the demo event via Ask Help is still trackable here.
  const trackedRequests = useMemo(
    () =>
      miqaats
        .filter((m) => reopenRequests[m.id])
        .map((m) => {
          const req = reopenRequests[m.id]
          const j = journeyFor(flow, registrations, m.id)
          // The requested party (role-badged, with dependent↔guardian/caregiver linkage) for the
          // "View members" list — from the request's stored party, else the journey, else the family.
          const requestMembers = req.stage === 'register'
            ? resolveRequestMembers(req.memberParty, j.selectedMemberIds, j.guardians, j.caregivers, j.invites)
            : []
          // "To" is the destination the user asked for; "From" is their current allocation (if any —
          // a missed-window request often has nothing allocated yet, hence the "Not allocated" fallback).
          let fromLabel = ''
          let toLabel = ''
          if (req.stage === 'city') {
            fromLabel = j.confirmedCity?.name ?? 'Not allocated'
            toLabel = req.choiceLabel ?? '—'
          } else if (req.stage === 'zone') {
            fromLabel = j.confirmedZone
              ? `${j.confirmedCity?.name ? `${j.confirmedCity.name} · ` : ''}${j.confirmedZone.name}`
              : j.confirmedCity
                ? `${j.confirmedCity.name} · No zone`
                : 'Not allocated'
            toLabel = req.choiceLabel ?? '—'
          }
          return {
            id: m.id,
            title: m.title,
            summary: requestSummary(req),
            approved: req.approved,
            stage: req.stage,
            reqNo: reqNumber(m.id),
            dateLabel: formatReqDate(req.requestedAt),
            categoryLabel: STAGE_CATEGORY[req.stage],
            memberCount: req.memberCount,
            requestMembers,
            fromLabel,
            toLabel,
          }
        }),
    [reopenRequests, flow, registrations],
  )

  const initRef = useRef(init)
  const contextual = !!initRef.current.category && !!initRef.current.miqaatId
  // Detail-page scope: locked to one event but the category isn't chosen yet — the chat opens at the
  // category grid, then skips the all-events picker and goes straight to this event's handoff.
  const scopedRef = useRef(initRef.current.scopedMiqaatId ?? null)

  const [step, setStep] = useState<ChatStep>(contextual ? 'handoff-preview' : initRef.current.startTrack ? 'track' : 'category')
  const [category, setCategory] = useState<ChatCategory | null>(initRef.current.category ?? null)
  const [miqaatId, setMiqaatId] = useState<string | null>(initRef.current.miqaatId ?? initRef.current.scopedMiqaatId ?? null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [addedMembers, setAddedMembers] = useState<ChatAddedMember[]>([])
  const [itsEntryOpen, setItsEntryOpen] = useState(false)
  const [itsDraft, setItsDraft] = useState('')
  const [itsError, setItsError] = useState<string | null>(null)
  const [itsResult, setItsResult] = useState<MemberLookup | null>(null)

  // Zone requests are asked per city: a family split across host + relay cities picks a zone for each
  // city its members are in. `zoneQueue` is the distinct cities among the selected members, `zoneIndex`
  // is which one we're on, `zonePicks` accumulates the chosen zone per city.
  const [zoneQueue, setZoneQueue] = useState<Array<{ id: string; name: string }>>([])
  const [zoneIndex, setZoneIndex] = useState(0)
  const [zonePicks, setZonePicks] = useState<Array<{ cityId: string; cityName: string; zoneId: string; zoneName: string }>>([])

  // Step history for the header Back arrow — each forward transition pushes a full snapshot of the
  // conversation state (incl. the transcript, so going back also drops that step's bubbles); Back
  // pops the latest and restores it. Simpler and less error-prone than reversing each transition.
  type Snapshot = {
    step: ChatStep
    category: ChatCategory | null
    miqaatId: string | null
    selectedMemberIds: string[]
    addedMembers: ChatAddedMember[]
    transcript: ChatBubble[]
  }
  const [history, setHistory] = useState<Snapshot[]>([])

  const [transcript, setTranscript] = useState<ChatBubble[]>(() => {
    if (contextual) {
      const m = displayMiqaats.find((d) => d.id === initRef.current.miqaatId)
      const cat = initRef.current.category!
      // Every contextual entry redirects to its real screen on mount (see the effect below), so we just
      // show the intro line here.
      return [{ id: nextBubbleId(), from: 'bot', text: `Let's get help with ${CATEGORY_LABEL[cat]}${m ? ` for "${m.title}"` : ''}.` }]
    }
    if (initRef.current.startTrack) {
      return [{ id: nextBubbleId(), from: 'bot', text: trackedRequests.length ? "Here's the status of your submitted requests:" : "You don't have any pending requests right now." }]
    }
    return [{ id: nextBubbleId(), from: 'bot', text: 'What would you like help with?' }]
  })

  // A contextual entry (a card's "Ask Help") has a known event + category → land on the handoff
  // preview (registered-member list + Continue) once on mount. The initial step is already
  // 'handoff-preview'; nothing to append (the greeting bubble is already in the transcript).
  const beganRef = useRef(false)
  useEffect(() => {
    if (beganRef.current) return
    if (contextual && initRef.current.category && initRef.current.miqaatId) {
      beganRef.current = true
      offerHandoff()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const say = (from: 'bot' | 'user', text: string) =>
    setTranscript((t) => [...t, { id: nextBubbleId(), from, text }])

  const activeMiqaat = useMemo(() => displayMiqaats.find((m) => m.id === miqaatId) ?? null, [displayMiqaats, miqaatId])
  const journey = useMemo(() => (miqaatId ? journeyFor(flow, registrations, miqaatId) : null), [flow, registrations, miqaatId])

  // ── Cancel reservation (scoped chat only) ────────────────────────────────────
  // Offered when the user is registered for THIS event. A "tagged" reservation — one still carrying
  // a dependent the registrant guards/cares for — can't be cancelled here (they must change the
  // tagging on Modify Reservation first); an untagged one cancels straight from the chat. Mirrors
  // ManageReservations' own `linkedDependents`/`cancelBlocked` rule so both surfaces agree.
  const registrant = useMemo(() => family.find((f) => f.role === 'registrant') ?? family[0], [])
  const canCancel = !!journey && (journey.submitted || journey.selectedMemberIds.length > 0)
  const cancelDep = useMemo(
    () => (journey
      ? family.find((f) => journey.selectedMemberIds.includes(f.id) && (journey.guardians[f.id] === registrant.id || journey.caregivers[f.id] === registrant.id)) ?? null
      : null),
    [journey, registrant.id],
  )
  const cancelTagged = !!cancelDep
  const cancelDepName = cancelDep ? cancelDep.name.split(' ')[0] : null

  const eventOptions: ChatOption[] = useMemo(() => {
    if (!category) return []
    const noun = category === 'register' ? 'Registration' : category === 'city' ? 'City selection' : 'Zone selection'
    // The ashara demo event's city/zone window is driven by the DEMO phase, not a real countdown —
    // it's "closed" (request-only) whenever the phase has passed the stage's open phase.
    const openPhase = category === 'city' ? 'city_open' : 'zone_open'
    const asharaStageReached = !!asharaPhase && DEMO_PHASE_ORDER.indexOf(asharaPhase) >= DEMO_PHASE_ORDER.indexOf(openPhase)
    return displayMiqaats
      .filter((m) => {
        if (reopenStageFor(m.effectiveStatus)?.stage !== category) return false
        // Only surface ashara once its stage has actually opened in the demo (never prematurely).
        if (m.id === 'ashara-1448') return asharaStageReached
        return true
      })
      .slice()
      .sort((a, b) => eventRank(a.id) - eventRank(b.id))
      .map((m) => {
        // A closed event can only be requested; an open one still has time left and can be selected
        // directly (e.g. the admin-enabled open-city / open-zone events). Ashara's open/closed comes
        // from the demo phase; everyone else from the real countdown.
        const closed = m.id === 'ashara-1448' ? asharaPhase !== openPhase : m.countdownSeconds <= 0
        if (closed) return { value: m.id, label: m.title, sublabel: `${noun} closed`, sublabelTone: 'closed' as const }
        const d = Math.floor(m.countdownSeconds / 86400)
        const h = Math.floor((m.countdownSeconds % 86400) / 3600)
        const left = d > 0 ? `${d}d ${h}h` : `${h}h`
        return { value: m.id, label: m.title, sublabel: `${noun} open · closes in ${left}`, sublabelTone: 'open' as const }
      })
  }, [category, displayMiqaats, asharaPhase])

  // Each member's allocated city (from the per-group city allocation, or the single confirmed city).
  // Drives the city pill on Zone member rows and the per-city grouping of the zone picker.
  const memberCity = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {}
    if (!journey) return map
    const groups = buildAllGroups(journey.selectedMemberIds, journey.guardians, journey.caregivers, journey.invites)
    groups.forEach((g, gi) => {
      const gc = journey.groupCities?.[gi]
      const city = gc ? { id: gc.id, name: gc.name } : journey.confirmedCity ? { id: journey.confirmedCity.id, name: journey.confirmedCity.name } : null
      if (city) g.members.forEach(({ member }) => { map[member.id] = city })
    })
    return map
  }, [journey])

  // Each member's allocated ZONE (per-group, or the single confirmed zone) — for the Zone request
  // preview so the user can see "who's in which zone" alongside their city.
  const memberZone = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {}
    if (!journey) return map
    const groups = buildAllGroups(journey.selectedMemberIds, journey.guardians, journey.caregivers, journey.invites)
    groups.forEach((g, gi) => {
      const gz = journey.groupZones?.[gi]
      const zone = gz ? { id: gz.id, name: gz.name } : journey.confirmedZone ? { id: journey.confirmedZone.id, name: journey.confirmedZone.name } : null
      if (zone) g.members.forEach(({ member }) => { map[member.id] = zone })
    })
    return map
  }, [journey])

  const memberOptions: ChatOption[] = useMemo(() => {
    const registered = category !== 'register' && !!journey && journey.selectedMemberIds.length > 0
    // Register, OR an admin-open City/Zone event with no registration yet → preview the WHOLE family:
    // there are no registered groups to build (and no guardians/caregivers assigned, which would
    // otherwise drop dependents), and the user should see every family member to allocate.
    if (!registered || !journey) {
      return family.map((m) => ({
        value: m.id,
        label: m.name,
        sublabel: `${m.relation} · ${m.gender} · Age ${age2(m.age)} · ITS ${m.its}`,
        disabled: category === 'register' ? !!memberBlockedReason(m, flow.guardians, flow.caregivers) : undefined,
        badge: roleBadgeFor(m, flow.guardians, flow.caregivers),
      }))
    }
    // Registered City/Zone → the actual registered party, grouped with its role badges.
    const groups = buildAllGroups(journey.selectedMemberIds, journey.guardians, journey.caregivers, journey.invites)
    return groups.flatMap((g) =>
      g.members.map(({ member, badge }) => {
        const city = memberCity[member.id]?.name
        const zone = memberZone[member.id]?.name
        // Tag surfaces the member's allocation: a City request shows the city; a Zone request shows
        // "City · Zone" (or just the city while a zone isn't picked yet). `allocated` reflects whether
        // they hold the allocation being requested (a city / a zone) — drives the preview split.
        let tag: string | undefined
        let allocated = false
        if (category === 'city') { tag = city; allocated = !!city }
        else if (category === 'zone') { tag = zone && city ? `${city} · ${zone}` : city; allocated = !!zone }
        return {
          value: member.id,
          label: member.name,
          sublabel: `${member.relation} · ${member.gender} · Age ${age2(member.age)} · ITS ${member.its}`,
          tag,
          allocated,
          badge,
        }
      }),
    )
  }, [category, journey, flow.guardians, flow.caregivers, memberCity, memberZone])

  // Seed the default selection the first time the members step is reached — mirrors AddPeople's
  // own "everyone non-blocked starts checked" default for Register; City/Zone default to the
  // whole existing party (the user narrows down who the request covers).
  const seededMembersRef = useRef(false)
  if (step === 'members' && !seededMembersRef.current && memberOptions.length) {
    seededMembersRef.current = true
    setSelectedMemberIds(
      category === 'register' ? memberOptions.filter((o) => !o.disabled).map((o) => o.value) : memberOptions.map((o) => o.value),
    )
  }

  // The city whose zones the picker is currently showing (zone requests walk the queue city by city).
  const activeZoneCity = zoneQueue[zoneIndex]
  const destinationOptions: ChatOption[] = useMemo(() => {
    if (category === 'city') {
      return liveCities.map((c) => ({ value: c.id, label: c.name, sublabel: c.type === 'host' ? 'Host City' : 'Relay City', disabled: c.seatsLeft <= 0 }))
    }
    if (category === 'zone') {
      const zones = activeZoneCity ? zonesByCityId[activeZoneCity.id] ?? [] : []
      return zones.map((z) => ({ value: z.id, label: z.name, sublabel: `${Math.max(z.capacity - z.filled, 0)} left`, disabled: z.capacity - z.filled <= 0 }))
    }
    return []
  }, [category, activeZoneCity])

  const hasExistingAllocation = category === 'city' ? !!journey?.confirmedCity : category === 'zone' ? !!journey?.confirmedZone : false

  // Snapshot the current state before a forward step so Back can restore it. Reads the current
  // render's values (closure) — call at the top of a transition, before any setter runs.
  const pushHistory = () =>
    setHistory((h) => [...h, { step, category, miqaatId, selectedMemberIds, addedMembers, transcript }])

  const canGoBack = history.length > 0 || itsEntryOpen

  function goBack() {
    // Inside the ITS sub-entry, Back just closes it (returns to the member list) rather than
    // rewinding a whole step.
    if (itsEntryOpen) {
      setItsEntryOpen(false)
      return
    }
    setHistory((h) => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setStep(prev.step)
      setCategory(prev.category)
      setMiqaatId(prev.miqaatId)
      setSelectedMemberIds(prev.selectedMemberIds)
      setAddedMembers(prev.addedMembers)
      setTranscript(prev.transcript)
      // Landing back on/above the event pick means a different event may be chosen next — let the
      // members step re-seed its default selection when it's reached again.
      if (prev.step === 'category' || prev.step === 'event') seededMembersRef.current = false
      return h.slice(0, -1)
    })
  }

  function pickCategory(value: string) {
    pushHistory()
    const cat = value as ChatCategory
    say('user', CATEGORY_LABEL[cat])
    setCategory(cat)
    // Detail-page scope: the event is already locked, so skip the all-events picker and go straight
    // to the member handoff for THIS event (miqaatId was seeded from `scopedMiqaatId`).
    if (scopedRef.current) {
      const m = displayMiqaats.find((d) => d.id === scopedRef.current)
      say('bot', `Let's get help with ${CATEGORY_LABEL[cat]}${m ? ` for "${m.title}"` : ''}.`)
      offerHandoff()
      return
    }
    setStep('event')
    say('bot', eventPrompt(cat))
  }

  // "Track My Requests" doesn't need the category → event → handoff machinery at all — it's a
  // read-only status list, so it gets its own step straight off the category grid.
  function pickTrack() {
    pushHistory()
    say('user', 'Track My Requests')
    setStep('track')
    say('bot', trackedRequests.length ? "Here's the status of your submitted requests:" : "You don't have any pending requests right now.")
  }
  // "Cancel reservation" — untagged → an in-chat confirm; tagged → the "change it on Modify
  // Reservation first" block. Either way it lands on the dedicated 'cancel' step.
  function pickCancel() {
    pushHistory()
    say('user', 'Cancel reservation')
    setStep('cancel')
    if (cancelTagged) {
      say('bot', `You're reserved together with ${cancelDepName}. Change it in Modify Reservation first — then you can cancel your reservation.`)
    } else {
      say('bot', `Cancel your reservation${activeMiqaat ? ` for "${activeMiqaat.title}"` : ''}? This removes your registration for the event.`)
    }
  }
  // Untagged confirm → clear the reservation (same store action the Modify Reservation cancel uses)
  // and land on Home, where the "Reservation Cancelled" success popup shows.
  function confirmCancel() {
    if (!miqaatId) return
    setActiveMiqaat(miqaatId)
    resetFlow()
    onClose()
    nav('/miqaats', { state: { reservationCancelled: true } })
  }
  // Tagged block CTA → jump to this event's Modify Reservation page to change the tagging.
  function goModifyReservation() {
    if (!miqaatId) return
    setActiveMiqaat(miqaatId)
    onClose()
    nav(`/miqaats/${miqaatId}/manage`)
  }

  function pickEvent(value: string) {
    pushHistory()
    const m = displayMiqaats.find((d) => d.id === value)
    say('user', m?.title ?? value)
    setMiqaatId(value)
    // Every category hands off to its real screen (Add People / City / Zone Selection), which shows each
    // member's city and does the per-group allocation the chat can't — but land the user in the chat
    // first (member list + Continue), not a silent jump.
    offerHandoff()
  }

  function toggleChatMember(id: string) {
    setSelectedMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function openItsEntry() {
    setItsEntryOpen(true)
    setItsDraft('')
    setItsError(null)
    setItsResult(null)
  }
  function cancelItsEntry() {
    setItsEntryOpen(false)
  }
  function setItsDraftValue(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 8)
    setItsDraft(digits)
    setItsError(null)
    if (digits.length === 8) {
      const r = lookupMember(digits)
      setItsResult(r)
      if (!r) setItsError('Please enter a valid 8-digit ITS ID.')
    } else {
      setItsResult(null)
    }
  }
  function confirmItsMember() {
    if (!itsResult) return
    const result = itsResult
    setAddedMembers((list) => (list.some((m) => m.its === result.its) ? list : [...list, { its: result.its, name: result.name, age: result.age, gender: result.gender }]))
    say('user', `Add ${result.name} (ITS ${result.its})`)
    say('bot', `Added ${result.name} to the list.`)
    setItsEntryOpen(false)
  }

  function membersContinue() {
    pushHistory()
    const names = memberOptions.filter((o) => selectedMemberIds.includes(o.value)).map((o) => o.label)
    say('user', names.join(', '))
    if (category === 'zone') {
      // Zones are city-scoped, so ask a zone per distinct city the selected members belong to.
      const cities: Array<{ id: string; name: string }> = []
      selectedMemberIds.forEach((mid) => {
        const c = memberCity[mid]
        if (c && !cities.some((x) => x.id === c.id)) cities.push(c)
      })
      setZoneQueue(cities)
      setZoneIndex(0)
      setZonePicks([])
      setStep('destination')
      say('bot', cities.length ? zonePrompt(cities[0].name, cities.length) : 'Which zone would you like?')
      return
    }
    setStep('destination')
    say('bot', destinationPrompt(category!))
  }

  // Register always redirects to the real Add People → Review flow — the chat never selects members
  // itself (Add People owns member selection + guardian/caregiver assignment). Whether this ends as a
  // direct registration or a *request* is decided on the Review screen: an open event registers
  // normally; a closed (missed) event's Review submits a registration request instead (CTA "Request").
  // Land the user in the chat first, in two stages: `handoff-preview` shows the registered-member list
  // + a "Continue" button; tapping it reveals the handoff message below the list and switches to the
  // `handoff` step, whose button (`proceedToScreen`) does the redirect.
  function offerHandoff() {
    setStep('handoff-preview')
  }
  // The one-liner shown below the member list once the preview is confirmed. Category-specific noun.
  const handoffMessage = useMemo(() => {
    const cat = category
    if (!cat) return ''
    const noun = cat === 'register' ? 'registration' : cat === 'city' ? 'city selection' : 'zone selection'
    return `I'll take you to the ${noun} screen, where you can pick for each member and submit your request. Tap continue when you're ready.`
  }, [category])
  function confirmHandoffPreview() {
    pushHistory()
    setStep('handoff')
  }
  function proceedToScreen() {
    if (!miqaatId || !category) return
    // Route by the CATEGORY the user asked help for: City/Zone open their selection screen directly
    // (admin-enabled), even for an event the user hasn't registered for. Register goes to Add People.
    const screen = category === 'register' ? 'people' : category // 'city' | 'zone'
    setActiveMiqaat(miqaatId)
    onClose()
    // `returnTo` (set when Ask Help was opened from a Miqaat detail page) lets the selection screen
    // send the user back to that detail page after submitting a request, instead of Home.
    nav(`/miqaats/${miqaatId}/${screen}`, initRef.current.returnTo ? { state: { returnTo: initRef.current.returnTo } } : undefined)
  }
  const handoffLabel =
    category === 'register' ? 'Continue to registration' : category === 'city' ? 'Continue to city selection' : 'Continue to zone selection'

  function pickDestination(value: string) {
    const opt = destinationOptions.find((o) => o.value === value)
    const label = opt?.label ?? value
    if (!miqaatId || !journey || !activeMiqaat) return
    if (category !== 'city' && category !== 'zone') return // destination step is only reachable for these

    // Zone: one pick per city in the queue. Record it, then either advance to the next city or submit.
    if (category === 'zone') {
      const city = activeZoneCity
      if (!city) return
      say('user', `${label} · ${city.name}`)
      const nextPicks = [...zonePicks, { cityId: city.id, cityName: city.name, zoneId: value, zoneName: label }]
      if (zoneIndex + 1 < zoneQueue.length) {
        setZonePicks(nextPicks)
        const nextIdx = zoneIndex + 1
        setZoneIndex(nextIdx)
        say('bot', zonePrompt(zoneQueue[nextIdx].name, zoneQueue.length - nextIdx))
        return
      }
      pushHistory()
      const chosen = memberOptions.filter((o) => selectedMemberIds.includes(o.value))
      const summary = nextPicks.map((p) => `${p.cityName} — ${p.zoneName}`).join(', ')
      if (hasExistingAllocation) {
        addChangeRequest({
          id: `cr-${Date.now()}`, miqaatId, kind: 'zone', title: 'Zone change',
          memberNames: chosen.map((o) => o.label), memberIds: chosen.map((o) => o.value),
          fromLabel: `${journey.confirmedCity?.name ?? ''} - ${journey.confirmedZone?.name ?? ''}`, toLabel: summary,
          requestedAt: new Date().toISOString(),
        })
        say('bot', 'Change request submitted for approval — see it on Modify Reservation.')
        onToast('Change request submitted — see it in Modify Reservation')
      } else {
        const stage = reopenStageFor(activeMiqaat.effectiveStatus)
        requestReopen(miqaatId, 'zone', `${stage?.title ?? 'Zone Selection'} — requested ${summary}`, { zoneId: nextPicks[0]?.zoneId, label: summary, zones: nextPicks })
        say('bot', 'Request submitted — you can track it under Track My Requests.')
        onToast('Request submitted — see it in Requested below')
      }
      setStep('confirm')
      return
    }

    // City: a single pick applied to the selected members.
    pushHistory()
    say('user', label)
    const chosen = memberOptions.filter((o) => selectedMemberIds.includes(o.value))
    if (hasExistingAllocation) {
      addChangeRequest({
        id: `cr-${Date.now()}`, miqaatId, kind: 'city', title: 'City change',
        memberNames: chosen.map((o) => o.label), memberIds: chosen.map((o) => o.value),
        fromLabel: journey.confirmedCity?.name ?? '', toLabel: label,
        requestedAt: new Date().toISOString(),
      })
      say('bot', 'Change request submitted for approval — see it on Modify Reservation.')
      onToast('Change request submitted — see it in Modify Reservation')
    } else {
      const stage = reopenStageFor(activeMiqaat.effectiveStatus)
      requestReopen(miqaatId, 'city', `${stage?.title ?? 'City Selection'} — requested ${label}`, { cityId: value, label })
      say('bot', 'Request submitted — you can track it under Track My Requests.')
      onToast('Request submitted — see it in Requested below')
    }
    setStep('confirm')
  }

  return {
    step,
    category,
    canGoBack,
    goBack,
    transcript,
    eventOptions,
    memberOptions,
    selectedMemberIds,
    addedMembers,
    itsEntryOpen,
    itsDraft,
    itsError,
    itsResult,
    destinationOptions,
    showAddIts: category === 'register',
    pickCategory,
    pickTrack,
    trackedRequests,
    canCancel,
    cancelTagged,
    cancelDepName,
    pickCancel,
    confirmCancel,
    goModifyReservation,
    pickEvent,
    toggleChatMember,
    openItsEntry,
    cancelItsEntry,
    setItsDraftValue,
    confirmItsMember,
    membersContinue,
    pickDestination,
    handoffLabel,
    handoffMessage,
    // "Registered members" only when there's an actual registration to show. For admin-configured
    // open events (registration removed) City/Zone fall back to the whole family → "Family members".
    memberListLabel:
      category === 'register'
        ? 'Members'
        : journey && journey.selectedMemberIds.length > 0
          ? 'Registered members'
          : 'Family members',
    confirmHandoffPreview,
    proceedToScreen,
  }
}
