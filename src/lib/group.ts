import { family, lookupMember, type FamilyMember } from '../data/seed'

export type BadgeKind = 'registrant' | 'dependent' | 'caregiver' | 'guardian' | null

export interface Group {
  label?: string
  members: { member: FamilyMember; badge: BadgeKind }[]
}

const byId = (id: string) => family.find((f) => f.id === id)!

/**
 * A dependent who still needs a guardian/caregiver assigned cannot be selected.
 * Returns the kind of assignment that is missing, or null when the member is selectable.
 */
export function memberBlockedReason(
  m: FamilyMember,
  guardians: Record<string, string>,
  caregivers: Record<string, string>,
): 'guardian' | 'caregiver' | null {
  if (m.needsGuardian && !guardians[m.id]) return 'guardian'
  if (m.needsCaregiver && !caregivers[m.id]) return 'caregiver'
  return null
}

/** Human-readable error shown when the user tries to select a still-unassigned dependent. */
export function blockedMessage(m: FamilyMember, kind: 'guardian' | 'caregiver'): string {
  return `Assign a ${kind} for ${m.name} before selecting this member.`
}

/**
 * The single source of truth for a member's role tag, used by EVERY table/card.
 * - Registrant ALWAYS shows "Registrant" (even when they also act as guardian/caregiver).
 * - A dependent shows "Dependent".
 * - Otherwise: "Guardian" if they're assigned as someone's guardian, else "Caregiver"
 *   if assigned as someone's caregiver, else no tag.
 * (A member can never be both — guardian is checked first and assignment enforces it.)
 */
export function roleBadgeFor(
  m: FamilyMember,
  guardians: Record<string, string>,
  caregivers: Record<string, string>,
): BadgeKind {
  if (m.role === 'registrant') return 'registrant'
  if (m.role === 'dependent') return 'dependent'
  if (Object.values(guardians).includes(m.id)) return 'guardian'
  if (Object.values(caregivers).includes(m.id)) return 'caregiver'
  return null
}

/** Builds the linked "registered together" groups shown in Review and Roster. */
export function buildGroups(
  selectedIds: string[],
  guardians: Record<string, string>,
  caregivers: Record<string, string>,
): Group[] {
  // Ignore any ids not present in `family` (e.g. a party persisted when the roster was larger) so a
  // stale/foreign id can never crash `byId(...)!` downstream — it's simply dropped from the group.
  const ids = selectedIds.filter((id) => family.some((f) => f.id === id))
  const selected = new Set(ids)
  const used = new Set<string>()
  const groups: Group[] = []
  const badge = (id: string): BadgeKind => roleBadgeFor(byId(id), guardians, caregivers)

  for (const [depId, gId] of Object.entries(guardians)) {
    if (!selected.has(depId) || !selected.has(gId)) continue
    groups.push({
      label: 'Guardian + dependent · registered together',
      members: [
        { member: byId(gId), badge: badge(gId) },
        { member: byId(depId), badge: badge(depId) },
      ],
    })
    used.add(depId).add(gId)
  }
  for (const [depId, cId] of Object.entries(caregivers)) {
    if (!selected.has(depId) || !selected.has(cId)) continue
    groups.push({
      label: 'Caregiver + dependent · registered together',
      members: [
        { member: byId(cId), badge: badge(cId) },
        { member: byId(depId), badge: badge(depId) },
      ],
    })
    used.add(depId).add(cId)
  }
  for (const id of ids) {
    if (used.has(id)) continue
    // A dependent must NEVER appear on its own — it only travels inside its guardian/caregiver
    // group above. If it reaches here, its lead isn't assigned+selected, so it is dropped entirely
    // (a dependent without an eligible guardian/caregiver can't proceed anywhere in the flow).
    if (byId(id).role === 'dependent') continue
    groups.push({ members: [{ member: byId(id), badge: badge(id) }] })
  }
  return groups
}

/** Minimal shape of a registered invite (Add People "Others" or Mehmaan) needed to allocate it. */
export interface AllocatableInvite {
  its: string
  name: string
  age: number
  gender?: 'Male' | 'Female'
  /** ITS of the primary this invite is a linked dependent of (renders nested in its group). */
  dependentOf?: string
  /** Home city of an invited member who lives elsewhere (surfaced at City Selection). */
  location?: string
  /** When this invited member's city-selection window opens (display string). */
  opensAt?: string
}

/** Render an invite as a FamilyMember-shaped row so the allocation tables can show + allocate it. */
function inviteAsMember(inv: AllocatableInvite): FamilyMember {
  return {
    id: `inv-${inv.its}`,
    name: inv.name,
    relation: inv.dependentOf ? 'Dependent' : 'Guest',
    // Prefer the gender stored on the invite; older invites saved without it fall back to the same
    // deterministic ITS lookup the Invite screens use (so the Status/Raza view never shows a blank).
    gender: inv.gender ?? lookupMember(inv.its)?.gender ?? 'Male',
    age: inv.age,
    its: inv.its,
    role: inv.dependentOf ? 'dependent' : 'member',
    location: inv.location,
    opensAt: inv.opensAt,
  }
}

/** Groups formed by the invited members — a primary plus any linked dependents reserve together. */
export function buildInviteGroups(invites: AllocatableInvite[]): Group[] {
  const primaries = invites.filter((i) => !i.dependentOf)
  return primaries.map((p) => {
    const deps = invites.filter((i) => i.dependentOf === p.its)
    const members = [
      { member: inviteAsMember(p), badge: null as BadgeKind },
      ...deps.map((d) => ({ member: inviteAsMember(d), badge: 'dependent' as BadgeKind })),
    ]
    return deps.length
      ? { label: 'Guardian + dependent · registered together', members }
      : { members }
  })
}

/**
 * The COMPLETE registered party — family groups PLUS invited-member groups (Add People "Others"
 * and Mehmaan). Allocation screens (City / Zone / Confirmation / Raza) use this so every member
 * registered in Add People persists through the whole journey instead of dropping after Review.
 * Family groups always come first, so the per-group allocation indices stay aligned across every
 * screen that builds from the same `flow.invites`.
 */
export function buildAllGroups(
  selectedIds: string[],
  guardians: Record<string, string>,
  caregivers: Record<string, string>,
  invites: AllocatableInvite[],
): Group[] {
  return [...buildGroups(selectedIds, guardians, caregivers), ...buildInviteGroups(invites)]
}

/** A registration request's party as stored on the request / shown in "View members": the linked
 *  guardian(caregiver) + dependent groups kept together, each member tagged with its role. */
export interface RequestPartyGroup {
  label?: string
  members: { name: string; badge: BadgeKind }[]
}

/** A single flattened row for the "View members" list — the member's role badge plus, for a
 *  dependent that reserves with a guardian/caregiver, who they're tagged with. */
export interface RequestMember {
  name: string
  badge: BadgeKind
  /** For a dependent: the name of the guardian/caregiver they're registered together with. */
  linkedToName?: string
  /** Whether `linkedToName` is the dependent's guardian or caregiver. */
  linkedRole?: 'guardian' | 'caregiver'
}

/** Serialise the grouped party to the lean, store-safe {label, members:{name,badge}} shape. */
function toPartyGroups(groups: Group[]): RequestPartyGroup[] {
  return groups.map((g) => ({ label: g.label, members: g.members.map((mm) => ({ name: mm.member.name, badge: mm.badge })) }))
}

/** The requested party, grouped + role-badged, for a registration request. */
export function buildRequestParty(
  selectedIds: string[],
  guardians: Record<string, string>,
  caregivers: Record<string, string>,
  invites: AllocatableInvite[],
): RequestPartyGroup[] {
  return toPartyGroups(buildAllGroups(selectedIds, guardians, caregivers, invites))
}

/**
 * The flat "View members" list for a registration request. Prefers the party stored on the request
 * (captured at filing time); falls back to the party still in the journey; then to the whole family
 * (role badges only — no guardian/caregiver linkage is knowable then). Dependents that reserve with a
 * guardian/caregiver carry that linkage so the list can show who is tagged with whom.
 */
export function resolveRequestMembers(
  stored: RequestPartyGroup[] | undefined,
  selectedIds: string[],
  guardians: Record<string, string>,
  caregivers: Record<string, string>,
  invites: AllocatableInvite[],
): RequestMember[] {
  const groups: RequestPartyGroup[] =
    stored && stored.length
      ? stored
      : (() => {
          const fromJourney = buildAllGroups(selectedIds, guardians, caregivers, invites)
          if (fromJourney.length) return toPartyGroups(fromJourney)
          return family.map((m) => ({ members: [{ name: m.name, badge: roleBadgeFor(m, {}, {}) }] }))
        })()

  const out: RequestMember[] = []
  for (const grp of groups) {
    // A linked "registered together" group is [lead (guardian/caregiver/registrant), dependent] —
    // tag the dependent with the lead so the row reads "with <lead> · Guardian".
    if (grp.label && grp.members.length === 2 && grp.members[1].badge === 'dependent') {
      const [lead, dep] = grp.members
      out.push({ name: lead.name, badge: lead.badge })
      out.push({ name: dep.name, badge: dep.badge, linkedToName: lead.name, linkedRole: lead.badge === 'caregiver' ? 'caregiver' : 'guardian' })
    } else {
      for (const mm of grp.members) out.push({ name: mm.name, badge: mm.badge })
    }
  }
  return out
}

/**
 * The family ids that are actually VALID in the registered group — every member except a dependent
 * whose guardian/caregiver isn't both assigned and selected. Use this for every "N members" count so
 * the counts agree with `buildGroups` (which excludes such dependents). Single source of truth.
 */
export function effectiveSelectedIds(
  selectedIds: string[],
  guardians: Record<string, string>,
  caregivers: Record<string, string>,
): string[] {
  // Drop ids that are not in `family` BEFORE dereferencing them, exactly as buildGroups does.
  // Without this, `byId(id)` returns undefined for a stale or foreign id and `m.role` on the next
  // line is a TypeError — thrown during render, with no boundary below the router, which blanks
  // the screen. The ids arrive from `flow.selectedMemberIds`, which is persisted to localStorage,
  // so a party saved when the roster was larger reproduces it on a cold load with no SPA state.
  // buildGroups was hardened for this and this function was not, which is why the two disagreed.
  const ids = selectedIds.filter((id) => family.some((f) => f.id === id))
  const sel = new Set(ids)
  return ids.filter((id) => {
    const m = byId(id)
    if (m.role !== 'dependent') return true
    const g = guardians[id]
    const c = caregivers[id]
    return (!!g && sel.has(g)) || (!!c && sel.has(c))
  })
}
