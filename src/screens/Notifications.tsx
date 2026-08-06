import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import { NotifCard, GroupHeader, FilterChips } from '../components/figma/NotificationPanel'
import { InvitationPopup } from '../components/figma/InvitationPopup'
import { useStore } from '../store'
import {
  visibleNotifications,
  filterNotifications,
  unreadCount,
  CATEGORY_STYLE,
  type NotifFilter,
  type NotifGroup,
} from '../data/notifications'
import { formNotificationPending } from '../lib/registrationForm'

// suppress unused import warning — CATEGORY_STYLE exported for completeness
void CATEGORY_STYLE

const FM: React.CSSProperties = { fontFamily: 'Marcellus, serif' }
const FMU: React.CSSProperties = { fontFamily: 'Mulish, system-ui, sans-serif' }
const GROUPS: NotifGroup[] = ['Today', 'Yesterday', 'Earlier']

export default function Notifications() {
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
  const unread = unreadCount(readNotifIds, visible)
  const filtered = filterNotifications(visible, filter)
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
    <PhoneScreen statusTone="light" showHomeIndicator>
      {/* AppBar */}
      <div>
        <AppBar />
      </div>

      {/* Breadcrumb */}
      <div className="ml-[16px] mt-[10px] sm:ml-0">
        <Breadcrumb
          items={[{ label: 'Home', to: '/miqaats' }, { label: 'Notification' }]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      <div className="px-[16px] pb-[32px] sm:px-0">
        {/* Page header */}
        <div className="mt-[16px] flex items-center justify-between">
          <h1 className="text-[24px] leading-[30px] text-[#15402f]" style={FM}>
            Notification
          </h1>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unread === 0}
            className="text-[14px] font-semibold text-[#1f5a44] transition-opacity enabled:active:opacity-60 disabled:cursor-default disabled:text-[#b6beb9]"
            style={FMU}
          >
            Mark all read
          </button>
        </div>

        {/* Filter chips */}
        <div className="mt-[16px]">
          <FilterChips active={filter} onChange={setFilter} />
        </div>

        {/* Notification groups */}
        <div className="mt-[8px]">
          {GROUPS.map((group) => {
            const items = filtered.filter((n) => n.group === group)
            if (!items.length) return null
            return (
              <div key={group} className="mt-[8px]">
                <GroupHeader label={group} />
                <div className="flex flex-col gap-[8px] mt-[4px]">
                  {items.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-[16px] border border-[#ede8df] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
                    >
                      <NotifCard
                        notif={n}
                        isRead={readIds.has(n.id)}
                        onClick={
                          n.popup === 'invitation' ? () => setShowInvitePopup(true)
                            : n.actionRoute ? () => nav(n.actionRoute!)
                            : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="mt-[48px] flex flex-col items-center gap-[10px] text-center">
              <div className="flex size-[56px] items-center justify-center rounded-full bg-[#f3f0e8]">
                <svg viewBox="0 0 24 24" fill="none" className="size-[24px] text-[#b8c4be]">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[16px] font-semibold text-[#5a6660]" style={FMU}>No notifications</p>
            </div>
          )}
        </div>
      </div>

      {/* Success toast */}
      {toastMsg && (
        <div className="fixed bottom-[40px] left-1/2 z-[80] flex -translate-x-1/2 items-center gap-[8px] rounded-full bg-[#1f5a44] px-[18px] py-[11px] shadow-[0_10px_30px_-8px_rgba(21,64,47,0.5)]">
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
    </PhoneScreen>
  )
}
