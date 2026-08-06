// Contextual per-page walkthrough — definitions.
//
// Instead of one continuous cross-route tour, each SCREEN owns its own short walkthrough that opens
// the first time the user lands on that page. A screen can have one highlight or several — multiple
// highlights advance in place with Next/Next. The walkthrough never drives navigation: the user
// moves through the real flow at their own pace, and each new screen introduces itself once.
//
// Anchors are `data-tour="…"` attributes on the real UI. Screens are matched by pathname; each
// remembers that it has been shown (see TOUR_SEEN_KEY) so it won't reappear unless replayed from Help.

export interface TourStep {
  /** `data-tour` value of the element to highlight (overlay picks the first visible match). */
  anchor: string
  title: string
  description: string
  /** Preferred tooltip side; the overlay flips it to stay on-screen. */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Optional highlighted note rendered under the description (e.g. the "revisit from Help" hint). */
  note?: string
}

export interface TourScreen {
  /** Stable id, used as the "seen" key. */
  key: string
  /** Pathname matcher for this screen. */
  test: RegExp
  steps: TourStep[]
  /** Show the "Step X of N" progress indicator + dots. Only meaningful for multi-step screens where
   *  the count is a helpful, sequential instruction (City & Zone). Off elsewhere so a two-tip screen
   *  (detail, Modify) doesn't read as a rigid numbered process. */
  progress?: boolean
}

export const TOUR_SCREENS: TourScreen[] = [
  {
    key: 'list',
    test: /^\/miqaats\/?$/,
    steps: [
      {
        anchor: 'miqaat-cards',
        title: 'Welcome to RMS',
        description: 'Browse available Miqaats and select the event you wish to attend.',
        placement: 'bottom',
        note: 'You can revisit this guide anytime from the Help (?) menu.',
      },
    ],
  },
  {
    // Detail page, before registering → introduce the page's key actions. Steps whose element isn't
    // present (e.g. Invite Mehmaan on events that don't accept guests) are skipped automatically.
    key: 'detail',
    test: /^\/miqaats\/[^/]+\/?$/,
    steps: [
      {
        anchor: 'register-button',
        title: 'Review & Register',
        description: 'Review the event information, timeline, and important notices before registering.',
        placement: 'left',
      },
      {
        anchor: 'event-timeline',
        title: 'Event Timeline',
        description: 'Open the full timeline to see every milestone — registration, city and zone selection, Raza, and the Miqaat date.',
        placement: 'left',
      },
      {
        anchor: 'invite-mehmaan',
        title: 'Invite Mehmaan',
        description: 'Invite guests with their ITS ID. They join your group once they accept the invitation.',
        placement: 'left',
      },
    ],
  },
  {
    // Detail page, once registered → the status tracker exists, so introduce it there. This arms
    // only when the `status-cards` anchor is actually on the page (i.e. after the user registers and
    // lands back on the Miqaat page), never on the first pre-registration visit.
    key: 'detail-status',
    test: /^\/miqaats\/[^/]+\/?$/,
    steps: [
      {
        anchor: 'status-cards',
        title: 'Status Tracking',
        description: 'Track your reservation progress from Registration to City Allocation, Zone Allocation, and Raza.',
        placement: 'left',
      },
    ],
  },
  {
    key: 'people',
    test: /\/people\/?$/,
    steps: [
      {
        anchor: 'add-people-section',
        title: 'Add People',
        description: 'Add yourself, your family members, or invite eligible Mehmaan before continuing.',
        placement: 'bottom',
      },
      {
        anchor: 'family-table',
        title: 'Your Family',
        description: 'Select which family members are attending. Members needing a guardian or caregiver are flagged here — tap Assign to link them before continuing.',
        placement: 'top',
      },
      {
        anchor: 'other-details-section',
        title: 'Other Details',
        description: 'Share a few extra details — accommodation, food, travel, medical and more — so we can plan your Miqaat journey.',
        placement: 'top',
      },
    ],
  },
  {
    key: 'review',
    test: /\/review\/?$/,
    steps: [
      {
        anchor: 'review-section',
        title: 'Review & Submit',
        description: 'Verify your group details before submitting your registration.',
        placement: 'bottom',
      },
    ],
  },
  {
    // Preferred City — the search opens with its dropdown already showing, so the walkthrough points
    // first at the search box, then (on Next) at the open list of pickable cities.
    key: 'preferred-city',
    test: /\/preferred-city\/?$/,
    progress: true,
    steps: [
      {
        anchor: 'preferred-search',
        title: 'Search for a City',
        description: 'Type a city name to quickly find it among the available options.',
        placement: 'right',
      },
      {
        anchor: 'preferred-dropdown',
        title: 'Pick from the List',
        description: 'Browse the suggestions and tap Add on any city to include it in your ranked choices.',
        placement: 'right',
      },
    ],
  },
  {
    key: 'city',
    test: /\/city\/?$/,
    progress: true,
    steps: [
      {
        anchor: 'city-cards',
        title: 'Choose a City',
        description: 'First, choose your preferred Host or Relay City based on availability.',
        placement: 'right',
      },
      {
        anchor: 'city-members',
        title: 'Reserve Your Members',
        description: 'Then reserve each eligible member to your chosen city. Members marked "Not available" can’t be allocated here.',
        placement: 'top',
      },
      {
        anchor: 'city-confirm',
        title: 'Confirm in Time',
        description: 'Your seats are held while the timer runs. Tap Confirm before it reaches zero to lock in the allocation.',
        placement: 'top',
      },
    ],
  },
  {
    // Modify Reservation. The linked-dependent tip only appears when the reservation has a linked
    // "reserve together" pair (its anchor is present) — so a plain reservation shows a single
    // options tip with no step counter, while a linked one gets both.
    key: 'manage',
    test: /\/manage\/?$/,
    steps: [
      {
        anchor: 'linked-transfer',
        title: 'Linked Members',
        description: 'This member is reserved together with a dependent. To keep the dependent’s place, transfer them to someone staying before you change or cancel your own reservation.',
        placement: 'bottom',
      },
      {
        anchor: 'modify-options',
        title: 'Modify Your Reservation',
        description: 'Update your reservation here — change your city or zone, switch between the Host city and a relay city, or cancel. Pick the option that matches what you want to do.',
        placement: 'top',
      },
    ],
  },
  {
    key: 'zone',
    test: /\/zone\/?$/,
    progress: true,
    steps: [
      {
        anchor: 'zone-list',
        title: 'Choose a Zone',
        description: 'First, pick a zone within your allocated city.',
        placement: 'right',
      },
      {
        anchor: 'zone-members',
        title: 'Reserve Your Members',
        description: 'Then choose which members to reserve in that zone using the Reserve action.',
        placement: 'top',
      },
      {
        anchor: 'reserve-confirm',
        title: 'Confirm in Time',
        description: 'Your slot is temporarily held while the timer runs. Tap Confirm before it expires to complete your reservation.',
        placement: 'top',
      },
    ],
  },
]

/** localStorage key holding the JSON array of screen keys already shown. */
export const TOUR_SEEN_KEY = 'rms-tour-seen'

/** The first walkthrough screen whose route matches `path` (used by the Help replay). */
export function screenForPath(path: string): TourScreen | undefined {
  return TOUR_SCREENS.find((s) => s.test.test(path))
}

/** Every walkthrough screen whose route matches `path`, in order. A single route can host more than
 *  one (e.g. the detail page has both `detail` and `detail-status`, disambiguated by which anchor is
 *  actually present). */
export function screensForPath(path: string): TourScreen[] {
  return TOUR_SCREENS.filter((s) => s.test.test(path))
}
