import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  visibleNotifications,
  filterNotifications,
  unreadCount,
  NOTIF_FILTERS,
  CATEGORY_STYLE,
  type Notification,
  type NotifFilter,
  type NotifGroup,
  type RelTime,
} from '../../data/notifications'
import { useStore } from '../../store'
import { InvitationPopup } from './InvitationPopup'
import { formNotificationPending } from '../../lib/registrationForm'
import { plural, useT } from '../../i18n'

const FM: React.CSSProperties = { fontFamily: 'Marcellus, serif' }
const FMU: React.CSSProperties = { fontFamily: 'Mulish, system-ui, sans-serif' }

const GROUPS: NotifGroup[] = ['Today', 'Yesterday', 'Earlier']

/**
 * The key for a relative time, chosen from the unit and the count.
 *
 * Two keys per unit rather than one with an embedded rule: the singular and the plural are not
 * the same sentence in Lisan al-Dawat, and a pipe-separated variant would make the wordlist
 * owner edit a mini-format instead of a sentence. `{n}` is filled AFTER the lookup, so the
 * numeral lands wherever the translation puts it.
 */
function agoKey(ago: RelTime): [string, { n: number }?] {
  if (ago === 'now') return ['Just now']
  const { n, unit } = ago
  if (unit === 'min') return [plural(n, '{n} min ago', '{n} mins ago'), { n }]
  if (unit === 'hr') return [plural(n, '{n} hr ago', '{n} hrs ago'), { n }]
  return [plural(n, '{n} day ago', '{n} days ago'), { n }]
}

// ─── icons ────────────────────────────────────────────────────────────────────

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
      <path d="M2.5 5.833A1.667 1.667 0 014.167 4.167h11.666A1.667 1.667 0 0117.5 5.833v8.334a1.667 1.667 0 01-1.667 1.666H4.167A1.667 1.667 0 012.5 14.167V5.833z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 5.833L10 10.833l7.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
      <path d="M11.667 2.5H5.833A1.667 1.667 0 004.167 4.167v11.666A1.667 1.667 0 005.833 17.5h8.334a1.667 1.667 0 001.666-1.667V7.5l-4.166-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.667 2.5V7.5h5M13.333 10.833H6.667M13.333 13.333H6.667M8.333 8.333H6.667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
      <path d="M10 10.833a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 1.667A6.667 6.667 0 003.333 8.333c0 4.167 6.667 10 6.667 10s6.667-5.833 6.667-10A6.667 6.667 0 0010 1.667z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
      <path d="M16.667 17.5v-1.667A3.333 3.333 0 0013.333 12.5H6.667a3.333 3.333 0 00-3.334 3.333V17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 9.167a3.333 3.333 0 100-6.667 3.333 3.333 0 000 6.667z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
      <path d="M15.833 3.333H4.167A1.667 1.667 0 002.5 5v11.667a1.667 1.667 0 001.667 1.666h11.666a1.667 1.667 0 001.667-1.666V5a1.667 1.667 0 00-1.667-1.667z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.333 1.667V5M6.667 1.667V5M2.5 8.333h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function renderIcon(icon: Notification['icon']) {
  switch (icon) {
    case 'envelope': return <EnvelopeIcon />
    case 'document': return <DocumentIcon />
    case 'pin': return <PinIcon />
    case 'person': return <PersonIcon />
    case 'calendar': return <CalendarIcon />
  }
}

// ─── shared notification card ─────────────────────────────────────────────────

export function NotifCard({ notif, isRead, onClick }: { notif: Notification; isRead: boolean; onClick?: () => void }) {
  const { td } = useT()
  const cfg = CATEGORY_STYLE[notif.category]
  return (
    <div onClick={onClick} className="flex cursor-pointer items-start gap-[12px] px-[16px] py-[13px] transition-colors hover:bg-[#faf8f4]">
      {/* Icon — dimmed once read */}
      <div
        className="flex size-[40px] shrink-0 items-center justify-center rounded-[10px] transition-opacity duration-300"
        style={{ background: cfg.iconBg, color: cfg.iconColor, opacity: isRead ? 0.55 : 1 }}
      >
        {renderIcon(notif.icon)}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        {/* Title row */}
        <div className="flex items-center">
          {/* Unread dot — animates away (width + fade) when marked read */}
          <span
            className="block shrink-0 overflow-hidden rounded-full bg-[#ef4444] transition-all duration-300"
            style={{ height: 7, width: isRead ? 0 : 7, marginRight: isRead ? 0 : 6, opacity: isRead ? 0 : 1 }}
          />
          <p
            className={`flex-1 truncate text-[14px] leading-[20px] transition-colors duration-300 ${isRead ? 'font-semibold text-[#6b746f]' : 'font-bold text-[#1a2a23]'}`}
            style={FMU}
            {...td(notif.title)}
          />
          {notif.hasChevron && (
            <svg viewBox="0 0 20 20" fill="none" className="ms-[6px] size-[14px] shrink-0 text-[#c0bdb6]">
              <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {/* Body */}
        <p
          className={`line-clamp-2 text-[13px] leading-[18px] transition-colors duration-300 ${isRead ? 'text-[#9aa39d]' : 'text-[#5a6660]'}`}
          style={FMU}
          {...td(notif.body)}
        />

        {/* Attachment */}
        {notif.attachment && (
          <div className="mt-[6px] flex items-center gap-[10px] rounded-[10px] bg-[#f3f0e8] px-[12px] py-[9px]">
            <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px] bg-[#c0392b]">
              <span className="text-[7.5px] font-black tracking-tight text-white" style={FMU}>PDF</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-[16px] text-[#1a2a23]" style={FMU} {...td(notif.attachment.name)} />
              <p className="text-[11px] leading-[15px] text-[#8a938e]" style={FMU} {...td(notif.attachment.meta)} />
            </div>
          </div>
        )}

        {/* Category + time — muted once read */}
        <div className="mt-[1px] flex items-center gap-[4px]">
          <span
            className="text-[12px] font-semibold leading-[16px] transition-colors duration-300"
            style={{ ...FMU, color: isRead ? '#a3aaa5' : cfg.labelColor }}
            {...td(notif.category)}
          />
          <span
            className="text-[12px] leading-[16px] transition-colors duration-300"
            style={{ ...FMU, color: isRead ? '#b8beba' : '#9ca3af' }}
          >
            {'· '}
            <bdi {...td(...agoKey(notif.ago))} />
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── group header ─────────────────────────────────────────────────────────────

export function GroupHeader({ label }: { label: NotifGroup }) {
  const { td } = useT()
  return (
    <div className="px-[16px] pb-[4px] pt-[14px]">
      <p
        className="text-[11px] font-bold uppercase tracking-[1px] text-[#b0b8b4]"
        style={FMU}
        {...td(label)}
      />
    </div>
  )
}

// ─── filter chips ─────────────────────────────────────────────────────────────

export function FilterChips({
  active,
  onChange,
}: {
  active: NotifFilter
  onChange: (f: NotifFilter) => void
}) {
  const { td } = useT()
  return (
    <div className="flex gap-[6px] overflow-x-auto no-scrollbar">
      {NOTIF_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`h-[28px] whitespace-nowrap rounded-full px-[12px] text-[12px] font-semibold transition-colors ${
            active === f
              ? 'bg-[#1f5a44] text-white'
              : 'border border-[#e7dfc9] bg-[#fafaf7] text-[#5a6660] hover:bg-[#f5f0e8]'
          }`}
          style={FMU}
          {...td(f)}
        />
      ))}
    </div>
  )
}

// ─── desktop dropdown panel ───────────────────────────────────────────────────

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
                                                                                  const { tx } = useT()
  const nav = useNavigate()
  const [filter, setFilter] = useState<NotifFilter>('All')
  const readNotifIds = useStore((s) => s.readNotifIds)
  const flow = useStore((s) => s.flow)
  const registrations = useStore((s) => s.registrations)
  const invitationReceived = flow.invitationReceived
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const acceptGroupInvite = useStore((s) => s.acceptGroupInvite)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [showInvitePopup, setShowInvitePopup] = useState(false)

  const visible = visibleNotifications(invitationReceived, formNotificationPending(flow, registrations))
  const readIds = new Set(readNotifIds)
  const filtered = filterNotifications(visible, filter)
  const unread = unreadCount(readNotifIds, visible)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }
  const handleMarkAll = () => {
    if (unread === 0) return
    markAll()
    showToast('All notifications marked as read')
  }
  const handleAcceptInvite = () => {
    acceptGroupInvite()
    setShowInvitePopup(false)
    showToast('Invitation accepted successfully')
  }
  const handleDeclineInvite = () => {
    setShowInvitePopup(false)
    showToast('Invitation declined')
  }

  return (
    <>
      {/* Backdrop — invisible, catches outside clicks */}
      <div className="fixed inset-0 z-[55]" onClick={onClose} />

      {/* Panel */}
      <div
        className="absolute z-[60] flex flex-col overflow-hidden rounded-[16px] border border-[#ede8df] bg-white notif-panel-in"
        style={{
          top: 'calc(100% + 8px)',
          right: 'var(--content-px)',
          width: 'clamp(360px, 34vw, 460px)',
          maxHeight: '78vh',
          boxShadow: '0 12px 48px rgba(0,0,0,0.14), 0 2px 12px rgba(0,0,0,0.07)',
        }}
      >
        {/* ── Sticky header ── */}
        <div className="flex items-center justify-between border-b border-[#f0ece4] px-[20px] pb-[12px] pt-[18px]">
          <div className="flex items-center gap-[8px]">
            <h3 className="text-[17px] text-[#15402f]" style={FM} {...tx('Notifications')} />
            {unread > 0 && (
              <span
                className="flex size-[20px] items-center justify-center rounded-full bg-[#ef4444] text-[11px] font-bold text-white transition-transform"
                style={FMU}
              >
                {unread}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unread === 0}
            className="text-[13px] font-semibold text-[#1f5a44] transition-opacity enabled:hover:opacity-70 disabled:cursor-default disabled:text-[#b6beb9]"
            style={FMU} {...tx('Mark all read')} />
        </div>

        {/* ── Sticky filters ── */}
        <div className="border-b border-[#f0ece4] px-[16px] py-[10px]">
          <FilterChips active={filter} onChange={setFilter} />
        </div>

        {/* ── Scrollable list ── */}
        <div className="flex-1 overflow-y-auto">
          {GROUPS.map((group) => {
            const items = filtered.filter((n) => n.group === group)
            if (!items.length) return null
            return (
              <div key={group}>
                <GroupHeader label={group} />
                {items.map((n) => (
                  <NotifCard
                    key={n.id}
                    notif={n}
                    isRead={readIds.has(n.id)}
                    onClick={
                      n.popup === 'invitation' ? () => setShowInvitePopup(true)
                        : n.actionRoute ? () => { onClose(); nav(n.actionRoute!) }
                        : undefined
                    }
                  />
                ))}
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-[8px] px-[20px] py-[48px] text-center">
              <div className="flex size-[48px] items-center justify-center rounded-full bg-[#f3f0e8]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[22px] text-[#b8c4be]">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-[#5a6660]" style={FMU} {...tx('No notifications')} />
            </div>
          )}
        </div>
      </div>

      {/* Success toast */}
      {toastMsg && (
        <div className="fixed bottom-[40px] start-0 end-0 z-[80] mx-auto flex w-fit items-center gap-[8px] rounded-full bg-[#1f5a44] px-[18px] py-[11px] shadow-[0_10px_30px_-8px_rgba(21,64,47,0.5)]">
          <svg viewBox="0 0 20 20" fill="none" className="size-[16px]">
            <path d="M4 10.5l3.5 3.5L16 5.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="whitespace-nowrap text-[14px] font-bold text-white" style={FMU}>
            {toastMsg}
          </span>
        </div>
      )}

      {/* Invitation popup */}
      {showInvitePopup && (
        <InvitationPopup
          onClose={() => setShowInvitePopup(false)}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />
      )}
    </>
  )
}
