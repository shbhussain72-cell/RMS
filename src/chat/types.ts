import type { ReactNode } from 'react'
import type { Gender } from '@/data/seed'
import type { BadgeKind } from '@/lib/group'

/** Which kind of help the chat is guiding the user through. */
export type ChatCategory = 'register' | 'city' | 'zone'

/** How the chat was opened: `category: null` = the general floater's open-ended start;
 *  a set `category` + `miqaatId` = a specific card's "Ask Help" tap, which skips straight
 *  to member selection for that event/stage. `scopedMiqaatId` (with `category: null`) = the
 *  Miqaat-detail-page floater: still asks WHAT the user needs help with, but locks the request to
 *  that ONE event (skips the all-events picker). */
export interface AskHelpInit {
  category: ChatCategory | null
  miqaatId?: string
  scopedMiqaatId?: string
  /** Open the chat straight on the Track My Requests step (detail page's "Track request" CTA). */
  startTrack?: boolean
  /** Where the flow should return after handing off to a real screen + submitting a request. Set by
   *  the Miqaat detail page so Ask Help lands back on that event's detail page, not Home. */
  returnTo?: string
}

export type ChatStep = 'category' | 'event' | 'members' | 'destination' | 'confirm' | 'handoff-preview' | 'handoff' | 'track' | 'cancel'

export interface ChatBubble {
  id: string
  from: 'bot' | 'user'
  text: string
}

/** A single tappable quick-reply option (category, event, member, or destination chip). */
export interface ChatOption {
  value: string
  label: string
  sublabel?: string
  /** Colours the sublabel in the `list` variant — e.g. an event's registration open (green) vs closed
   *  (red) status. Omitted = the default muted grey. */
  sublabelTone?: 'open' | 'closed'
  /** Small pill shown on a member row (e.g. the member's allocated city/zone, so a City/Zone request
   *  makes the per-member allocation visible). */
  tag?: string
  /** Whether this member already holds the allocation relevant to the current request (a city for a
   *  city request, a zone for a zone request) — drives the "Allocated / Not allocated yet" split. */
  allocated?: boolean
  /** Registrant/Dependent/Guardian/Caregiver role tag — same shared badge every other screen uses,
   *  so a member row here reads identically to Add People/Review/City/Zone Selection. */
  badge?: BadgeKind
  disabled?: boolean
  /** Optional leading icon, used by the `list`/`grid` variants (categories). */
  icon?: ReactNode
  /** Pastel card colour, `grid` variant only (the category picker's colourful card look). */
  color?: 'blue' | 'pink' | 'green' | 'amber' | 'purple'
}

/** A member added mid-conversation via the ITS lookup (Register category only). */
export interface ChatAddedMember {
  its: string
  name: string
  age: number
  gender?: Gender
}
