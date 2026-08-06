// Seed data transcribed from the Figma mockup (Miqaat Registration flow).
// NOTE: the mockup reuses ITS 30412790 across most family rows and 30412786 for
// every invitee — clearly placeholder copy. Unique IDs are used here for realism.

export type Role = 'registrant' | 'member' | 'dependent' | 'caregiver'
export type Gender = 'Male' | 'Female'

export interface FamilyMember {
  id: string
  name: string
  relation: string
  /** displayed alongside relation/age throughout the app */
  gender: Gender
  age: number
  its: string
  role: Role
  /** dependent that cannot be allocated alone (under 10) -> needs a guardian */
  needsGuardian?: boolean
  /** dependent that needs medical assistance -> needs a caregiver */
  needsCaregiver?: boolean
  /** member who can't be allocated to a city right now (eligibility/document issue) → shows "Not Valid". */
  notValidForCity?: boolean
  /** City ids the admin has closed for THIS member. Their status stays "Valid for allocation", but
   *  selecting one of these cities blocks the Reserve action with "Please choose a different city." */
  closedCities?: string[]
  /** For invited/added members who live elsewhere (e.g. London): the city they will reserve from. */
  location?: string
  /** For invited/added members whose city-selection window opens later: when they can come & reserve
   *  (display string). While set, the member can't be reserved yet — the table shows this instead. */
  opensAt?: string
}

export const account = {
  name: 'Murtaza bhai Moiz bhai Gheewala',
  its: '30412786',
}

export const family: FamilyMember[] = [
  { id: 'm1', name: 'Murtaza bhai Moiz bhai Gheewala', relation: '(You)', gender: 'Male', age: 31, its: '30412786', role: 'registrant' },
  { id: 'm2', name: 'Sakina Husain', relation: 'Spouse', gender: 'Female', age: 28, its: '30412790', role: 'member', closedCities: ['indore'] },
  { id: 'm3', name: 'Syed Nazia', relation: 'Daughter', gender: 'Female', age: 9, its: '30412791', role: 'dependent', needsGuardian: true },
  { id: 'm4', name: 'Mohammed Husain', relation: 'Father', gender: 'Male', age: 62, its: '30412792', role: 'member' },
  { id: 'm5', name: 'Amatullah Bhen', relation: 'Mother', gender: 'Female', age: 58, its: '30412793', role: 'dependent', needsCaregiver: true },
]

/** Extended family — extra members that exist ONLY as the Araz preferred-city screen's addable pool
 *  (searched by ITS in that screen's "Add" popup). Intentionally kept OUT of `family` so they never
 *  appear on Add People / registration or anywhere else `family` is used. */
export const arazExtraFamily: FamilyMember[] = [
  { id: 'm6', name: 'Yusuf Husain', relation: 'Son', gender: 'Male', age: 15, its: '30412794', role: 'member' },
  { id: 'm7', name: 'Fatema Husain', relation: 'Daughter', gender: 'Female', age: 19, its: '30412795', role: 'member' },
  { id: 'm8', name: 'Zainab Bhen', relation: 'Sister', gender: 'Female', age: 34, its: '30412796', role: 'member' },
  { id: 'm9', name: 'Hussain bhai Gheewala', relation: 'Brother', gender: 'Male', age: 27, its: '30412797', role: 'member' },
  { id: 'm10', name: 'Ruqaiya Bhen', relation: 'Grandmother', gender: 'Female', age: 71, its: '30412798', role: 'member' },
  { id: 'm11', name: 'Taha bhai Gheewala', relation: 'Uncle', gender: 'Male', age: 49, its: '30412801', role: 'member' },
]

/** Zero-padded age string used in every member meta line. */
export const age2 = (n: number) => String(n).padStart(2, '0')

/** Gender of a family member by ITS (invited Mehmaan have no gender on record → undefined). */
export const genderByIts = (its: string): Gender | undefined =>
  family.find((f) => f.its === its)?.gender

export type MiqaatStatus =
  | 'opens_soon' // registration not open yet
  | 'live' // registration open
  | 'registered' // user registered, raza pending, city not yet open
  | 'city_open' // city selection open
  | 'zone_open' // city allocated, zone selection open (→ "Select zone")

/** A single milestone on an event's timeline (Registration → City → Zone → Raza → Seat → Pass → Miqaat). */
export interface TimelineMilestone {
  key: 'reg' | 'city' | 'zone' | 'raza' | 'seat' | 'pass' | 'miqaat'
  title: string
  /** calendar days (within the event's month) this milestone occupies */
  days: number[]
  /** the day that carries the title label on the calendar */
  labelDay: number
  /** duration milestone → shows Opens + Closes */
  range?: { startDate: string; startTime: string; endDate: string; endTime: string }
  /** point milestone → shows a single labelled date */
  single?: { label: string; date: string }
}

/** Per-event timeline driving the Event Journey calendar + milestone cards. */
export interface EventTimeline {
  /** 0-indexed month (Jan = 0) the calendar renders */
  month: number
  year: number
  /** display name for the month title, e.g. 'June' */
  monthLabel: string
  milestones: TimelineMilestone[]
}

export interface Miqaat {
  id: string
  title: string
  /** Event name in Lisan al-Dawat (Arabic script), shown under the title on every event card. */
  titleArabic: string
  dateLabel: string
  timeLabel: string
  status: MiqaatStatus
  /** sub-line under the date row */
  deadlineLabel: string
  /** seconds remaining for the countdown timer */
  countdownSeconds: number
  hostCity: string
  relayCenters: string[]
  /** milestone schedule shown on the Event Journey page for this event */
  timeline: EventTimeline
  /** List-card hero photo for this specific event. Falls back to a shared placeholder when unset
   *  (the featured Ashara Mubaraka card uses its own dedicated banner image, not this field). */
  image?: string
  /** demo-only: statically shows an allocated city on a `zone_open` list card */
  reservedCity?: string
  /** Local event — city & zone are auto-allocated (no user selection step; the user only waits on
   *  Raza), and Invited Mehmaan don't appear on the Add People screen (only inside Your Status /
   *  the roster, since there's no reservation choice to make for them). */
  local?: boolean
  /** This event doesn't accept Mehmaan guests — the Invite Mehmaan card is hidden on its detail page. */
  hideInviteMehmaan?: boolean
  /** For THIS event only: any member added via Add People's ITS search ("Others") is auto-allocated
   *  to the host city/zone in City/Zone Selection instead of requiring manual selection. Family
   *  members still go through the normal manual flow. Unlike `local`, this only affects added members. */
  autoAllocateOthers?: boolean
  /** For THIS event only: once the registrant has accepted an incoming "join their group" invite
   *  (Notifications → Join Group), the registrant's own city/zone selection is auto-allocated —
   *  their own family (added separately) still self-allocates normally. */
  autoAllocateSelfViaInvite?: boolean
  /** Same-day flow: registration, City Selection and Zone Selection all happen in one sitting. On
   *  submit the user is taken straight into City Selection (the queue loader → city list) instead of
   *  the Success screen, and confirming the city hands off directly to Zone Selection. Everything
   *  from Zone onward (Raza, etc.) is the normal flow. */
  sameDayFlow?: boolean
  /** Demo: the admin has added new questions to this event's registration form after users already
   *  submitted it. Drives the "Action Required" card, the "Registration Form Updated" notification,
   *  and the New-question highlighting on the Edit Registration Form screen. */
  formNewQuestions?: boolean
  /** Demo: this event's "Preferred City" screen shows ONLY the Other Details form (full-screen) —
   *  the city-search / ranked-choices section is hidden. Used where the event collects requirements
   *  but doesn't take a preferred-city ranking (e.g. Ashara Mubaraka 1448H). */
  preferredCityFormOnly?: boolean
  /** Araz (early preferred-city submission) is enabled for this event. When set: the detail page
   *  shows the Araz card in place of Invite Mehmaan, and the /araz screen offers two preference
   *  quota pools (how many members may be given a host-city vs a relay-city preference). Araz is a
   *  preference submission only — it never confirms or reserves a city. */
  araz?: { hostQuota: number; relayQuota: number }
}

/**
 * Allocation closing date/time per stage. The confirmed pages use these in the "some members
 * aren't allocated yet" notice so each stage automatically shows its own deadline.
 */
export const allocationCloses = {
  host: '21 June 2026, 11:59 PM IST',
  relay: '23 June 2026, 11:59 PM IST',
  zone: '25 June 2026, 11:59 PM IST',
} as const

const NOTICES = [
  'Registration closes on 5 June 2026 at 11:59 PM. Complete all group registrations and Raza requests before the deadline.',
  'Children below 10 years of age must be assigned to a parent or guardian before proceeding.',
  'Venue allocation is subject to availability and capacity limits.',
  'Host City registrations may close early once capacity is reached.',
  'Tickets will only be generated after all required approvals are completed.',
]

export const importantNotices = NOTICES

export const fasalAnnouncement = {
  arabic: 'بسم الله الرحمن الرحيم',
  body: 'Fasal declared. Mumineen are invited to seek Raza for Ashara Mubaraka 1448H. May Allah grant all the toufeeq of hazri.',
}

const RELAY_DEFAULT = ['Mumbai', 'Surat', 'Karachi', 'Nairobi', 'London', 'Dubai']

/**
 * Build an event timeline from its milestone days/dates. Registration is a duration
 * (Opens 09:00 AM → Closes 11:59 PM); City/Zone are single-day windows; Raza and Miqaat
 * are point dates. Every event reuses this 5-stage shape with its own month + dates.
 */
function buildTimeline(
  month: number,
  year: number,
  monthLabel: string,
  s: {
    regDays: number[]
    regStart: string
    regEnd: string
    cityDay: number
    cityDate: string
    zoneDay: number
    zoneDate: string
    razaDay: number
    razaDate: string
    miqaatDay: number
    miqaatDate: string
  },
): EventTimeline {
  const window = (date: string) => ({ startDate: date, startTime: '09:00 AM IST', endDate: date, endTime: '11:59 PM IST' })
  // Seat & Pass Allocation aren't given their own explicit day/date per event — they're derived a
  // couple of days after Raza issue (same month, same "DD Mon YYYY" shape as every other date string
  // here), so every event gets both new milestones without touching all 12 call sites.
  const monthAbbrev = monthLabel.slice(0, 3)
  const seatDay = s.razaDay + 2
  const passDay = s.razaDay + 4
  const fmtDate = (day: number) => `${String(day).padStart(2, '0')} ${monthAbbrev} ${year}`
  return {
    month,
    year,
    monthLabel,
    milestones: [
      { key: 'reg', title: 'Registration open', days: s.regDays, labelDay: s.regDays[0], range: { startDate: s.regStart, startTime: '09:00 AM IST', endDate: s.regEnd, endTime: '11:59 PM IST' } },
      { key: 'city', title: 'City selection', days: [s.cityDay], labelDay: s.cityDay, range: window(s.cityDate) },
      { key: 'zone', title: 'Zone selection', days: [s.zoneDay], labelDay: s.zoneDay, range: window(s.zoneDate) },
      { key: 'raza', title: 'Raza issue', days: [s.razaDay], labelDay: s.razaDay, single: { label: 'Issue date', date: s.razaDate } },
      { key: 'seat', title: 'Seat Allocation', days: [seatDay], labelDay: seatDay, single: { label: 'Allocation date', date: fmtDate(seatDay) } },
      { key: 'pass', title: 'Pass Allocation', days: [passDay], labelDay: passDay, single: { label: 'Allocation date', date: fmtDate(passDay) } },
      { key: 'miqaat', title: 'Miqaat begins', days: [s.miqaatDay], labelDay: s.miqaatDay, single: { label: 'Event date', date: s.miqaatDate } },
    ],
  }
}

export const miqaats: Miqaat[] = [
  {
    // Araz — OG-only early preferred-city submission. Not seeded into buildDemoRegistrations, so the
    // Araz screen falls back to the whole family (works with or without a prior registration). Its
    // detail page shows the Araz card in place of Invite Mehmaan (hideInviteMehmaan + araz config).
    id: 'araz',
    title: 'Urs Mubarak Syedna Mohammed Burhanuddin RA',
    titleArabic: 'عرس مبارک سیدنا محمد برھان الدین رض',
    dateLabel: 'Fri, 03 Jul 2026',
    timeLabel: '09:00 AM IST',
    status: 'live',
    deadlineLabel: 'Araz submission closes on Tue, 30 Jun 2026 - 11:59 PM IST (before City Selection opens)',
    countdownSeconds: 6 * 86400 + 4 * 3600 + 18 * 60,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    hideInviteMehmaan: true,
    araz: { hostQuota: 5, relayQuota: 7 },
    timeline: buildTimeline(6, 2026, 'July', {
      regDays: [1, 2], regStart: '01 Jul 2026', regEnd: '02 Jul 2026',
      cityDay: 8, cityDate: '08 Jul 2026',
      zoneDay: 13, zoneDate: '13 Jul 2026',
      razaDay: 16, razaDate: '16 Jul 2026',
      miqaatDay: 3, miqaatDate: '03 Jul 2026',
    }),
  },
  {
    id: 'ashara-1448',
    title: 'Ashara Mubaraka 1448H',
    titleArabic: 'عشرہ مبارکہ ١٤٤٨ھ',
    formNewQuestions: true,
    preferredCityFormOnly: true,
    dateLabel: 'Fri, 26 Jun 2026',
    timeLabel: '05:00 AM IST',
    status: 'live',
    deadlineLabel: 'Registration closes in Thu, 25 Jun 2026 - 11:59 PM IST',
    countdownSeconds: 7 * 86400,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    hideInviteMehmaan: true,
    timeline: buildTimeline(5, 2026, 'June', {
      regDays: [1, 2], regStart: '01 Jun 2026', regEnd: '02 Jun 2026',
      cityDay: 6, cityDate: '06 Jun 2026',
      zoneDay: 11, zoneDate: '11 Jun 2026',
      razaDay: 14, razaDate: '14 Jun 2026',
      miqaatDay: 26, miqaatDate: '26 Jun 2026',
    }),
  },
  {
    id: 'eg-live',
    title: 'Milad Imam uz Zaman (AS)',
    titleArabic: 'میلاد امام الزماں (ع)',
    dateLabel: 'Sun, 19 Jul 2026',
    timeLabel: '07:00 AM IST',
    status: 'live',
    deadlineLabel: 'Registration ends in Fri, 17 Jul 2026 - 11:59 PM IST',
    countdownSeconds: 4 * 86400 + 6 * 3600 + 21 * 60 + 9,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    image: '/figma/miqaat-cards/eg-live.webp',
    // Same-day flow: register → City Selection (loader → list) → Zone Selection, all in one sitting.
    sameDayFlow: true,
    timeline: buildTimeline(6, 2026, 'July', {
      regDays: [1, 2], regStart: '01 Jul 2026', regEnd: '02 Jul 2026',
      cityDay: 6, cityDate: '06 Jul 2026',
      zoneDay: 10, zoneDate: '10 Jul 2026',
      razaDay: 13, razaDate: '13 Jul 2026',
      miqaatDay: 19, miqaatDate: '19 Jul 2026',
    }),
  },
  {
    id: 'eg-soon',
    title: 'Urs Mubarak Syedna Taher Saifuddin RA',
    titleArabic: 'عرس مبارک سیدنا طاہر سیف الدین رض',
    dateLabel: 'Sun, 23 Aug 2026',
    timeLabel: '06:30 AM IST',
    status: 'live',
    deadlineLabel: 'Registration ends in Mon, 03 Aug 2026 - 11:59 PM IST',
    countdownSeconds: 5 * 86400 + 2 * 3600 + 15 * 60,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    image: '/figma/miqaat-cards/eg-soon.webp',
    hideInviteMehmaan: true,
    autoAllocateOthers: true,
    timeline: buildTimeline(7, 2026, 'August', {
      regDays: [3, 4], regStart: '03 Aug 2026', regEnd: '04 Aug 2026',
      cityDay: 8, cityDate: '08 Aug 2026',
      zoneDay: 13, zoneDate: '13 Aug 2026',
      razaDay: 16, razaDate: '16 Aug 2026',
      miqaatDay: 23, miqaatDate: '23 Aug 2026',
    }),
  },
  {
    id: 'eg-registered',
    title: 'Milad Rasul (SAW)',
    titleArabic: 'میلاد الرسول (ص)',
    dateLabel: 'Sat, 26 Sep 2026',
    timeLabel: '06:00 AM IST',
    // A local event: city & zone auto-allocate on submit. It starts as a normal live/registerable
    // event ("Register Now") and only reads as allocated once the user's flow owns it — so logging
    // out (which clears flow) returns it to the start like every other event.
    status: 'live',
    deadlineLabel: 'Registration ends in Mon, 07 Sep 2026 - 09:00 AM IST',
    countdownSeconds: 9 * 86400 + 12 * 3600 + 30 * 60,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    image: '/figma/miqaat-cards/eg-registered.webp',
    local: true,
    timeline: buildTimeline(8, 2026, 'September', {
      regDays: [1, 2], regStart: '01 Sep 2026', regEnd: '02 Sep 2026',
      cityDay: 8, cityDate: '08 Sep 2026',
      zoneDay: 14, zoneDate: '14 Sep 2026',
      razaDay: 17, razaDate: '17 Sep 2026',
      miqaatDay: 26, miqaatDate: '26 Sep 2026',
    }),
  },
  {
    id: 'eg-cityopen',
    title: 'Eid-e-Ghadeer 1447H',
    titleArabic: 'عید الغدیر ١٤٤٧ھ',
    dateLabel: 'Sat, 25 Jul 2026',
    timeLabel: '06:30 AM IST',
    status: 'live',
    deadlineLabel: 'Registration ends in Thu, 02 Jul 2026 - 11:59 PM IST',
    countdownSeconds: 4 * 86400 + 6 * 3600 + 30 * 60,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    image: '/figma/miqaat-cards/eg-cityopen.webp',
    autoAllocateSelfViaInvite: true,
    // No Invite Mehmaan step for this event — hides the card on the detail page and keeps any stale
    // Mehmaan invites out of its registration screens (same pattern as Urs Mubarak).
    hideInviteMehmaan: true,
    timeline: buildTimeline(6, 2026, 'July', {
      regDays: [1, 2], regStart: '01 Jul 2026', regEnd: '02 Jul 2026',
      cityDay: 7, cityDate: '07 Jul 2026',
      zoneDay: 12, zoneDate: '12 Jul 2026',
      razaDay: 15, razaDate: '15 Jul 2026',
      miqaatDay: 25, miqaatDate: '25 Jul 2026',
    }),
  },
  {
    id: 'milad-imam-uz-zaman',
    title: 'Chehlum Imam Husain (AS)',
    titleArabic: 'چہلم امام حسین (ع)',
    dateLabel: 'Wed, 29 Jul 2026',
    timeLabel: '08:00 AM IST',
    status: 'opens_soon',
    deadlineLabel: 'Registration opens on Wed, 08 Jul 2026 - 09:00 AM IST',
    countdownSeconds: 8 * 86400 + 5 * 3600 + 12 * 60,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    image: '/figma/miqaat-cards/milad-imam-uz-zaman.webp',
    timeline: buildTimeline(6, 2026, 'July', {
      regDays: [8, 9], regStart: '08 Jul 2026', regEnd: '09 Jul 2026',
      cityDay: 14, cityDate: '14 Jul 2026',
      zoneDay: 19, zoneDate: '19 Jul 2026',
      razaDay: 22, razaDate: '22 Jul 2026',
      miqaatDay: 29, miqaatDate: '29 Jul 2026',
    }),
  },
  // ── "Missed a deadline" demo events ─────────────────────────────────────────
  // Each starts already closed (countdownSeconds: 0) so the reopen-request flow (Home → raise a
  // request → "Requested" section → simulate approval → continue) is testable immediately, without
  // waiting on a real countdown. `miss-city`/`miss-zone` need a matching pre-seeded registration in
  // store.ts's buildDemoRegistrations() for their status to make sense (already registered).
  {
    id: 'miss-register',
    title: 'Shahadat Imam Ali (AS)',
    titleArabic: 'شہادت امام علی (ع)',
    dateLabel: 'Sun, 28 Jun 2026',
    timeLabel: '07:00 AM IST',
    status: 'live', // never registered — the window closed before they did
    deadlineLabel: 'Registration closed on Tue, 02 Jun 2026 - 11:59 PM IST',
    countdownSeconds: 0,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    timeline: buildTimeline(5, 2026, 'June', {
      regDays: [1, 2], regStart: '01 Jun 2026', regEnd: '02 Jun 2026',
      cityDay: 8, cityDate: '08 Jun 2026',
      zoneDay: 13, zoneDate: '13 Jun 2026',
      razaDay: 16, razaDate: '16 Jun 2026',
      miqaatDay: 28, miqaatDate: '28 Jun 2026',
    }),
  },
  {
    id: 'miss-city',
    title: 'Milad Syedna Yusuf Najmuddin RA',
    titleArabic: 'میلاد سیدنا یوسف نجم الدین رض',
    dateLabel: 'Sat, 25 Jul 2026',
    timeLabel: '06:30 AM IST',
    status: 'city_open', // registered, but the city-selection window closed before they picked one
    deadlineLabel: 'City selection closed on Wed, 08 Jul 2026 - 11:59 PM IST',
    countdownSeconds: 0,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    timeline: buildTimeline(6, 2026, 'July', {
      regDays: [1, 2], regStart: '01 Jul 2026', regEnd: '02 Jul 2026',
      cityDay: 8, cityDate: '08 Jul 2026',
      zoneDay: 13, zoneDate: '13 Jul 2026',
      razaDay: 16, razaDate: '16 Jul 2026',
      miqaatDay: 25, miqaatDate: '25 Jul 2026',
    }),
  },
  {
    id: 'miss-zone',
    title: 'Urs Mubarak Syedna Abdulqadir Najmuddin RA',
    titleArabic: 'عرس مبارک سیدنا عبد القادر نجم الدین رض',
    dateLabel: 'Thu, 30 Jul 2026',
    timeLabel: '06:00 AM IST',
    status: 'zone_open', // city allocated, but the zone-selection window closed before they picked one
    deadlineLabel: 'Zone selection closed on Mon, 13 Jul 2026 - 11:59 PM IST',
    countdownSeconds: 0,
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    reservedCity: 'Colombo',
    timeline: buildTimeline(6, 2026, 'July', {
      regDays: [1, 2], regStart: '01 Jul 2026', regEnd: '02 Jul 2026',
      cityDay: 6, cityDate: '06 Jul 2026',
      zoneDay: 13, zoneDate: '13 Jul 2026',
      razaDay: 16, razaDate: '16 Jul 2026',
      miqaatDay: 30, miqaatDate: '30 Jul 2026',
    }),
  },
  // ── Open direct-selection events (admin-enabled): city/zone selection is open to everyone WITHOUT
  //    prior registration. Not seeded into buildDemoRegistrations, so the City/Zone screens fall back
  //    to the whole family and the user allocates directly. Surfaced in the Ask Help City/Zone lists.
  {
    // "City card": pick a city, THEN a zone (sameDayFlow shows both on one screen).
    id: 'open-city',
    title: 'Milad Syedna RA',
    titleArabic: 'میلاد سیدنا قطب الدین رض',
    dateLabel: 'Sat, 29 Aug 2026',
    timeLabel: '06:30 AM IST',
    status: 'city_open',
    deadlineLabel: 'City selection closes on Wed, 05 Aug 2026 - 11:59 PM IST',
    countdownSeconds: 6 * 86400 + 3 * 3600, // open (~6d 3h left)
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    sameDayFlow: true, // city + zone chosen together
    timeline: buildTimeline(7, 2026, 'August', {
      regDays: [1, 2], regStart: '01 Aug 2026', regEnd: '02 Aug 2026',
      cityDay: 5, cityDate: '05 Aug 2026',
      zoneDay: 5, zoneDate: '05 Aug 2026',
      razaDay: 8, razaDate: '08 Aug 2026',
      miqaatDay: 29, miqaatDate: '29 Aug 2026',
    }),
  },
  {
    // "Zone card": city already fixed (host) → directly pick a zone and move on.
    id: 'open-zone',
    title: 'Urs Mubarak Syedna Ismail Badruddin RA',
    titleArabic: 'عرس مبارک سیدنا اسماعیل بدر الدین رض',
    dateLabel: 'Sun, 30 Aug 2026',
    timeLabel: '06:00 AM IST',
    status: 'zone_open',
    deadlineLabel: 'Zone selection closes on Thu, 13 Aug 2026 - 11:59 PM IST',
    countdownSeconds: 5 * 86400 + 2 * 3600, // open (~5d 2h left)
    hostCity: 'Colombo',
    relayCenters: RELAY_DEFAULT,
    reservedCity: 'Colombo',
    timeline: buildTimeline(7, 2026, 'August', {
      regDays: [1, 2], regStart: '01 Aug 2026', regEnd: '02 Aug 2026',
      cityDay: 5, cityDate: '05 Aug 2026',
      zoneDay: 13, zoneDate: '13 Aug 2026',
      razaDay: 16, razaDate: '16 Aug 2026',
      miqaatDay: 30, miqaatDate: '30 Aug 2026',
    }),
  },
]

export interface InviteDirectoryEntry {
  name: string
  age: number
  /** If set, inviting this member also adds their linked dependent (uses 2 quota slots) */
  linkedDependent?: { name: string; age: number; its: string }
}

/** Directory used by the "Invite Mehmaan" ITS lookup. */
export const inviteDirectory: Record<string, InviteDirectoryEntry> = {
  '30412786': { name: 'Yusuf Bhaisaheb', age: 31, linkedDependent: { name: 'Zainab Bhen', age: 26, its: '30412799' } },
  '30412801': { name: 'Amina Khatun', age: 42 },
  '30412802': { name: 'Rahim Miah', age: 22 },
  '30412803': { name: 'Fatema Begum', age: 22 },
  '30412804': { name: 'Jamal Uddin', age: 20 },
  '30748392': { name: 'Hatim Bhai Saheb', age: 34 },
  '34578549': { name: 'Abbas Husain', age: 27 },
  '34928272': { name: 'Fatema Sakina', age: 34 },
}

// ─── Dynamic ITS lookup (demo) ────────────────────────────────────────────────
// For the demo, ANY valid 8-digit ITS resolves to a realistic Bohra community
// member (deterministically generated from the digits, so the same ITS always
// returns the same person). One fixed ITS additionally carries linked dependents.

export interface LinkedMember {
  its: string; name: string; age: number; gender: Gender
  /** Home city of a member who lives elsewhere (e.g. London) — their allocation opens later. */
  location?: string
  /** When this member's city-selection window opens (display string). While set, they can't be
   *  reserved yet at City Selection — the "… allocation opens … You can reserve … then." message shows. */
  opensAt?: string
}
export interface MemberLookup extends LinkedMember { dependents: LinkedMember[] }

/** Demo: an invited/added member from a city whose self-allocation window opens later. */
export const FOREIGN_LOCATION = 'London'
export const FOREIGN_OPENS_AT = 'Sat, 21 Jun · 9:00 AM IST'
/** Demo rule: a looked-up member whose ITS is ODD lives in {@link FOREIGN_LOCATION} and can only be
 *  reserved once that city's window opens ({@link FOREIGN_OPENS_AT}). Family members never get this
 *  (they're resolved before this is applied). In production this is backend data per member. */
function withForeign<T extends { its: string }>(m: T): T {
  return parseInt(m.its, 10) % 2 === 1 ? { ...m, location: FOREIGN_LOCATION, opensAt: FOREIGN_OPENS_AT } : m
}

/** The one fixed demo ITS that returns a member WITH linked dependents (for the client demo). */
export const LINKED_DEMO_ITS = '30000001'

const MALE_FIRST = [
  'Mufaddal', 'Yusuf', 'Taha', 'Husain', 'Abbas', 'Mustafa', 'Juzar', 'Aliasger',
  'Shabbir', 'Idris', 'Huzefa', 'Aziz', 'Moiz', 'Hatim', 'Zoeb', 'Ammar',
  'Quraish', 'Adnan', 'Taher', 'Burhanuddin', 'Qaidjoher', 'Fakhruddin', 'Saifuddin', 'Murtaza',
]
const FEMALE_FIRST = [
  'Fatema', 'Sakina', 'Zainab', 'Amatullah', 'Maryam', 'Husaina', 'Tasneem', 'Arwa',
  'Insiya', 'Rumana', 'Munira', 'Aaliyah', 'Khadija', 'Sugra', 'Batul', 'Jumana',
  'Nafisa', 'Saira', 'Alefiya', 'Rashida', 'Mariyah', 'Zahra', 'Sakina', 'Hababa',
]
const SURNAMES = [
  'Rangwala', 'Lokhandwala', 'Saifee', 'Najmi', 'Badami', 'Bandukwala', 'Patanwala', 'Kapasi',
  'Tankiwala', 'Ratlamwala', 'Udaipurwala', 'Saboowala', 'Contractor', 'Burhani', 'Vajihi', 'Mithaiwala',
  'Electricwala', 'Calcuttawala', 'Shajapurwala', 'Hamdani', 'Dholkawala', 'Bharmal',
]

/** Deterministically build a realistic member from an 8-digit ITS. */
function generateMember(its: string): MemberLookup {
  const n = parseInt(its, 10)
  const gender: Gender = n % 2 === 0 ? 'Male' : 'Female'
  const pool = gender === 'Male' ? MALE_FIRST : FEMALE_FIRST
  const first = pool[Math.floor(n / 3) % pool.length]
  const surname = SURNAMES[Math.floor(n / 11) % SURNAMES.length]
  const age = 18 + (n % 55) // 18..72
  return { its, name: `${first} ${surname}`, age, gender, dependents: [] }
}

/**
 * Resolve any 8-digit ITS to a member (+ any linked dependents).
 * Returns null only when the ITS is not exactly 8 digits.
 */
export function lookupMember(its: string): MemberLookup | null {
  if (!/^\d{8}$/.test(its)) return null

  // Known family member → return as-is (family members are never "opens later").
  const fam = family.find((f) => f.its === its)
  if (fam) return { its, name: fam.name, age: fam.age, gender: fam.gender, dependents: [] }

  // Build the base lookup, then apply the demo "opens later" rule to the primary + each dependent.
  let base: MemberLookup
  if (its === LINKED_DEMO_ITS) {
    // Fixed demo ITS → member with linked dependents.
    base = {
      its,
      name: 'Mustafa bhai Najmuddin',
      age: 48,
      gender: 'Male',
      dependents: [
        { its: '30000002', name: 'Rashida Najmuddin', age: 44, gender: 'Female' },
      ],
    }
  } else {
    // Curated directory entry → map its optional single dependent; else deterministically generate.
    const dir = inviteDirectory[its]
    base = dir
      ? {
          its,
          name: dir.name,
          age: dir.age,
          gender: generateMember(its).gender,
          dependents: dir.linkedDependent
            ? [{ ...dir.linkedDependent, gender: generateMember(dir.linkedDependent.its).gender }]
            : [],
        }
      : generateMember(its)
  }
  return { ...withForeign(base), dependents: base.dependents.map(withForeign) }
}

/** Cities offered by the preferred-city search. */
export const cityDirectory: { id: string; name: string; region: string; type: 'host' | 'relay' }[] = [
  // Only one host city exists — everything else is a relay city.
  { id: 'colombo', name: 'Colombo', region: 'Sri Lanka', type: 'host' },
  { id: 'marol', name: 'Marol', region: 'Mumbai', type: 'relay' },
  { id: 'surat', name: 'Surat', region: 'Gujarat', type: 'relay' },
  { id: 'karachi', name: 'Karachi', region: 'Pakistan', type: 'relay' },
  { id: 'nairobi', name: 'Nairobi', region: 'Kenya', type: 'relay' },
  { id: 'london', name: 'London', region: 'United Kingdom', type: 'relay' },
  { id: 'dubai', name: 'Dubai', region: 'UAE', type: 'relay' },
  { id: 'colombo2', name: 'Dehiwala', region: 'Sri Lanka', type: 'relay' },
]

// ─── City Selection (Live Allocation) Data ────────────────────────────────────

export type CityType = 'host' | 'relay'

export interface LiveCity {
  id: string
  name: string
  region: string
  type: CityType
  seatsLeft: number
  totalSeats: number
  fillingFast?: boolean
}

/** Live city list with seat counts used in the City Selection screen. */
export const liveCities: LiveCity[] = [
  { id: 'colombo', name: 'Colombo', region: 'Sri Lanka', type: 'host', seatsLeft: 15, totalSeats: 100, fillingFast: true },
  // ── Relay cities (ordered to match the 3-column grid in the design) ──
  { id: 'mumbai', name: 'Mumbai', region: 'Maharashtra', type: 'relay', seatsLeft: 18, totalSeats: 50, fillingFast: false },
  { id: 'chennai', name: 'Chennai', region: 'Tamil Nadu', type: 'relay', seatsLeft: 0, totalSeats: 40, fillingFast: false },
  { id: 'indore', name: 'Indore', region: 'Madhya Pradesh', type: 'relay', seatsLeft: 9, totalSeats: 30, fillingFast: false },
  { id: 'kolkata', name: 'Kolkata', region: 'West Bengal', type: 'relay', seatsLeft: 16, totalSeats: 45, fillingFast: false },
  { id: 'hyderabad', name: 'Hyderabad', region: 'Telangana', type: 'relay', seatsLeft: 10, totalSeats: 40, fillingFast: false },
  { id: 'delhi', name: 'Delhi', region: 'Delhi', type: 'relay', seatsLeft: 14, totalSeats: 40, fillingFast: false },
  { id: 'gujarat', name: 'Gujarat', region: 'Gujarat', type: 'relay', seatsLeft: 22, totalSeats: 55, fillingFast: false },
  { id: 'surat', name: 'Surat', region: 'Gujarat', type: 'relay', seatsLeft: 20, totalSeats: 50, fillingFast: false },
  { id: 'kerala', name: 'Kerala', region: 'Kerala', type: 'relay', seatsLeft: 13, totalSeats: 40, fillingFast: false },
  { id: 'bangalore', name: 'Bangalore', region: 'Karnataka', type: 'relay', seatsLeft: 7, totalSeats: 35, fillingFast: false },
  { id: 'newyork', name: 'New york', region: 'USA', type: 'relay', seatsLeft: 11, totalSeats: 40, fillingFast: false },
  { id: 'london', name: 'London', region: 'UK', type: 'relay', seatsLeft: 6, totalSeats: 35, fillingFast: false },
  { id: 'manchester', name: 'Manchester', region: 'UK', type: 'relay', seatsLeft: 8, totalSeats: 30, fillingFast: false },
  { id: 'berlin', name: 'Berlin', region: 'Germany', type: 'relay', seatsLeft: 9, totalSeats: 30, fillingFast: false },
  { id: 'frankfurt', name: 'Frankfurt', region: 'Germany', type: 'relay', seatsLeft: 7, totalSeats: 25, fillingFast: false },
  { id: 'toronto', name: 'Toronto', region: 'Canada', type: 'relay', seatsLeft: 12, totalSeats: 40, fillingFast: false },
  { id: 'vancouver', name: 'Vancouver', region: 'Canada', type: 'relay', seatsLeft: 10, totalSeats: 35, fillingFast: false },
  { id: 'losangeles', name: 'Los angels', region: 'USA', type: 'relay', seatsLeft: 5, totalSeats: 30, fillingFast: false },
  { id: 'noida', name: 'Noida', region: 'Uttar Pradesh', type: 'relay', seatsLeft: 15, totalSeats: 40, fillingFast: false },
  { id: 'pune', name: 'Pune', region: 'Maharashtra', type: 'relay', seatsLeft: 17, totalSeats: 45, fillingFast: false },
  { id: 'nagpur', name: 'Nagpur', region: 'Maharashtra', type: 'relay', seatsLeft: 12, totalSeats: 40, fillingFast: false },
  { id: 'dubai', name: 'Dubai', region: 'UAE', type: 'relay', seatsLeft: 1, totalSeats: 50, fillingFast: false },
  { id: 'abudhabi', name: 'Abu Dhabi', region: 'UAE', type: 'relay', seatsLeft: 5, totalSeats: 40, fillingFast: false },
  { id: 'ahmedabad', name: 'Ahmedabad', region: 'Gujarat', type: 'relay', seatsLeft: 14, totalSeats: 40, fillingFast: false },
  { id: 'chicago', name: 'Chicago', region: 'USA', type: 'relay', seatsLeft: 8, totalSeats: 35, fillingFast: false },
  // ── More cities per country, added on request to fill out each accordion group ──
  { id: 'jaipur', name: 'Jaipur', region: 'Rajasthan', type: 'relay', seatsLeft: 11, totalSeats: 40, fillingFast: false },
  { id: 'lucknow', name: 'Lucknow', region: 'Uttar Pradesh', type: 'relay', seatsLeft: 9, totalSeats: 35, fillingFast: false },
  { id: 'sanfrancisco', name: 'San Francisco', region: 'USA', type: 'relay', seatsLeft: 10, totalSeats: 40, fillingFast: false },
  { id: 'houston', name: 'Houston', region: 'USA', type: 'relay', seatsLeft: 13, totalSeats: 40, fillingFast: false },
  { id: 'miami', name: 'Miami', region: 'USA', type: 'relay', seatsLeft: 6, totalSeats: 35, fillingFast: false },
  { id: 'seattle', name: 'Seattle', region: 'USA', type: 'relay', seatsLeft: 8, totalSeats: 30, fillingFast: false },
  { id: 'birmingham', name: 'Birmingham', region: 'UK', type: 'relay', seatsLeft: 7, totalSeats: 30, fillingFast: false },
  { id: 'leeds', name: 'Leeds', region: 'UK', type: 'relay', seatsLeft: 9, totalSeats: 30, fillingFast: false },
  { id: 'glasgow', name: 'Glasgow', region: 'UK', type: 'relay', seatsLeft: 5, totalSeats: 25, fillingFast: false },
  { id: 'liverpool', name: 'Liverpool', region: 'UK', type: 'relay', seatsLeft: 8, totalSeats: 30, fillingFast: false },
  { id: 'munich', name: 'Munich', region: 'Germany', type: 'relay', seatsLeft: 10, totalSeats: 35, fillingFast: false },
  { id: 'hamburg', name: 'Hamburg', region: 'Germany', type: 'relay', seatsLeft: 8, totalSeats: 30, fillingFast: false },
  { id: 'cologne', name: 'Cologne', region: 'Germany', type: 'relay', seatsLeft: 6, totalSeats: 25, fillingFast: false },
  { id: 'stuttgart', name: 'Stuttgart', region: 'Germany', type: 'relay', seatsLeft: 9, totalSeats: 30, fillingFast: false },
  { id: 'montreal', name: 'Montreal', region: 'Canada', type: 'relay', seatsLeft: 11, totalSeats: 35, fillingFast: false },
  { id: 'calgary', name: 'Calgary', region: 'Canada', type: 'relay', seatsLeft: 7, totalSeats: 30, fillingFast: false },
  { id: 'ottawa', name: 'Ottawa', region: 'Canada', type: 'relay', seatsLeft: 9, totalSeats: 30, fillingFast: false },
  { id: 'sharjah', name: 'Sharjah', region: 'UAE', type: 'relay', seatsLeft: 4, totalSeats: 35, fillingFast: false },
  { id: 'ajman', name: 'Ajman', region: 'UAE', type: 'relay', seatsLeft: 6, totalSeats: 30, fillingFast: false },
  { id: 'alain', name: 'Al Ain', region: 'UAE', type: 'relay', seatsLeft: 5, totalSeats: 25, fillingFast: false },
]

// ─── Zone Selection Data ───────────────────────────────────────────────────────

export interface Zone {
  id: string
  name: string
  capacity: number
  filled: number
}

/** Zone-name suffixes used to generate a realistic, dense zone list per venue. */
const ZONE_SUFFIXES = [
  'Main Hall', 'East Wing', 'West Wing', 'South Wing', 'North Wing', 'Balcony',
  'Annexe', 'Courtyard', 'Gallery', 'Mezzanine', 'Terrace', 'Pavilion',
  'Saqifa', 'Sehan', 'Riwaq', 'Front Hall',
]

/**
 * Generate `count` distinct zones for a venue. Every zone is capacity 50; ~1 in 5 is already FULL
 * (filled === capacity → "Full" pill), the rest carry a varied fill so the list looks realistic.
 * Distinct letter per zone (A, B, C …) keeps names unique even when a suffix repeats.
 */
function genZones(prefix: string, count = 22): Zone[] {
  return Array.from({ length: count }, (_, i) => {
    const capacity = 50
    const full = i % 5 === 3 // ~20% of zones are full
    const filled = full ? capacity : 8 + ((i * 13) % 34) // else 8..41 filled → 9..42 left
    return {
      id: `${prefix}-${i}`,
      name: `Zone ${String.fromCharCode(65 + (i % 26))} - ${ZONE_SUFFIXES[i % ZONE_SUFFIXES.length]}`,
      capacity,
      filled,
    }
  })
}

/**
 * Zones keyed by city id — EVERY live city gets a dense list (22 zones, a few already full) so Zone
 * Selection is never empty regardless of which city the user allocated to.
 */
export const zonesByCityId: Record<string, Zone[]> = Object.fromEntries(
  liveCities.map((c) => [c.id, genZones(`z-${c.id}`, 22)]),
)

export const INVITE_QUOTA = 2
