export type NotifCategory = 'Invitation' | 'Raza' | 'Zone selection' | 'City selection' | 'Registration' | 'System'
export type NotifGroup = 'Today' | 'Yesterday' | 'Earlier'

export interface Notification {
  id: string
  title: string
  body: string
  category: NotifCategory
  timeLabel: string
  group: NotifGroup
  read: boolean
  icon: 'envelope' | 'document' | 'pin' | 'person' | 'calendar'
  attachment?: { name: string; meta: string }
  hasChevron?: boolean
  /** If set, tapping the card navigates to this route */
  actionRoute?: string
  /** If set, tapping the card opens an inline popup instead of navigating. */
  popup?: 'invitation'
}

export const NOTIF_FILTERS = ['All', 'Invitations', 'Raza', 'Slot', 'Requests'] as const
export type NotifFilter = (typeof NOTIF_FILTERS)[number]

export const notifications: Notification[] = [
  {
    id: 'n1',
    title: 'Invitation received',
    body: 'Mufaddal bhai has invited you to join their group for Eid-e-Ghadeer 1447H.',
    category: 'Invitation',
    timeLabel: '2 min ago',
    group: 'Today',
    read: false,
    icon: 'envelope',
    hasChevron: true,
    popup: 'invitation',
  },
  {
    id: 'n10',
    title: 'Registration Form Updated',
    body: 'New questions have been added to your registration form. Please complete them before City Selection opens.',
    category: 'Registration',
    timeLabel: 'Just now',
    group: 'Today',
    read: false,
    icon: 'document',
    hasChevron: true,
    actionRoute: '/miqaats/ashara-1448/edit-form',
  },
  {
    id: 'n9',
    title: 'Guardian assigned',
    body: 'Murtaza bhai Moiz bhai Gheewala has been assigned as your guardian. Please accept the request to continue.',
    category: 'Invitation',
    timeLabel: '5 min ago',
    group: 'Today',
    read: false,
    icon: 'person',
    hasChevron: true,
    actionRoute: '/join-group?type=guardian',
  },
  {
    id: 'n2',
    title: 'Raza issued',
    body: 'Your Raza for Eid-e-Ghadeer 1447H has been issued. View and download your letter below.',
    category: 'Raza',
    timeLabel: '1 hr ago',
    group: 'Today',
    read: true,
    icon: 'document',
    attachment: { name: 'Raza letter — Eid-e-Ghadeer 1447H', meta: 'PDF · 248 KB' },
  },
  {
    id: 'n3',
    title: 'Zone selection active',
    body: 'Zone selection is now open for Colombo. Pick your zone before it closes on 21 Jun.',
    category: 'Zone selection',
    timeLabel: '2 min ago',
    group: 'Today',
    read: false,
    icon: 'pin',
  },
  {
    id: 'n4',
    title: 'City confirmed',
    body: 'Your city selection is confirmed: Colombo. This applies to you and your dependents.',
    category: 'City selection',
    timeLabel: '1 day ago',
    group: 'Yesterday',
    read: true,
    icon: 'pin',
  },
  {
    id: 'n5',
    title: 'City selection window open',
    body: 'Your Phase 1 slot is active from 19 Jun 09:00 AM to 20 Jun 09:00 AM IST.',
    category: 'City selection',
    timeLabel: '1 day ago',
    group: 'Yesterday',
    read: true,
    icon: 'pin',
  },
  {
    id: 'n6',
    title: 'Registration confirmed',
    body: 'Your registration for Eid-e-Ghadeer 1447H was submitted successfully.',
    category: 'Registration',
    timeLabel: '1 day ago',
    group: 'Earlier',
    read: true,
    icon: 'person',
  },
  {
    id: 'n7',
    title: 'Admin registered on your behalf',
    body: 'An Idaratul Miqaat admin registered you for Eid-e-Ghadeer 1447H.',
    category: 'Registration',
    timeLabel: '1 day ago',
    group: 'Earlier',
    read: true,
    icon: 'person',
  },
  {
    id: 'n8',
    title: 'Slot reminder',
    body: 'Your Phase 1 city selection slot opens in 1 hour. Be ready to pick your city.',
    category: 'System',
    timeLabel: '1 day ago',
    group: 'Earlier',
    read: true,
    icon: 'calendar',
  },
]

/** The Eid-e-Ghadeer group invitation (n1) only "arrives" after the user has registered for that
 *  event — before that there is no invitation to receive, so it's hidden everywhere (list + badge).
 *  n10 ("Registration Form Updated") only shows while the user has an admin-added registration-form
 *  question left to answer — see `lib/registrationForm.ts`'s `formNotificationPending`. */
export function visibleNotifications(invitationReceived: boolean, formQuestionsPending = false): Notification[] {
  return notifications.filter((n) => {
    if (n.id === 'n1') return invitationReceived
    if (n.id === 'n10') return formQuestionsPending
    return true
  })
}

/** How many notifications are still unread, given the set/list of read ids. Pass the visible list
 *  (from `visibleNotifications`) so a hidden notification never inflates the badge. */
export function unreadCount(readIds: Set<string> | string[], list: Notification[] = notifications): number {
  const set = Array.isArray(readIds) ? new Set(readIds) : readIds
  return list.filter((n) => !set.has(n.id)).length
}

export function filterNotifications(notifs: Notification[], filter: NotifFilter): Notification[] {
  switch (filter) {
    case 'Invitations': return notifs.filter((n) => n.category === 'Invitation')
    case 'Raza': return notifs.filter((n) => n.category === 'Raza')
    case 'Slot': return notifs.filter((n) => n.category === 'City selection' || n.category === 'Zone selection')
    case 'Requests': return notifs.filter((n) => !!n.actionRoute || !!n.popup)
    default: return notifs
  }
}

export const CATEGORY_STYLE: Record<NotifCategory, { iconBg: string; iconColor: string; labelColor: string }> = {
  Invitation:        { iconBg: '#EBF2FC', iconColor: '#3b82f6', labelColor: '#3b82f6' },
  Raza:              { iconBg: '#FEF0D3', iconColor: '#d97706', labelColor: '#d97706' },
  'Zone selection':  { iconBg: '#E6EEF1', iconColor: '#2a7a92', labelColor: '#1f5a44' },
  'City selection':  { iconBg: '#E6EEF1', iconColor: '#2a7a92', labelColor: '#1f5a44' },
  Registration:      { iconBg: '#E6F0EC', iconColor: '#1f5a44', labelColor: '#1f5a44' },
  System:            { iconBg: '#F0F0F0', iconColor: '#757575', labelColor: '#757575' },
}
