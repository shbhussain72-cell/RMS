import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { account } from '../../data/seed'
import { unreadCount, visibleNotifications } from '../../data/notifications'
import { useStore } from '../../store'
import { formNotificationPending } from '../../lib/registrationForm'
import NotificationPanel from './NotificationPanel'
import LogoutConfirmSheet from './LogoutConfirmSheet'
import TourHelpButton from '../../tour/TourHelpButton'

const CREST = '/figma/its-crest-header.png'
const FONT_SANS = 'Mulish, system-ui, sans-serif'

const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// Bell glyph from the provided NOTIFY ICON.svg (cropped to the bell bounds).
function BellIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="8 9 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M18.1738 29.8903H22.1738C22.1738 30.9903 21.2738 31.8903 20.1738 31.8903C19.0738 31.8903 18.1738 30.9903 18.1738 29.8903ZM29.1738 27.8903V28.8903H11.1738V27.8903L13.1738 25.8903V19.8903C13.1738 16.7903 15.1738 14.0903 18.1738 13.1903V12.8903C18.1738 11.7903 19.0738 10.8903 20.1738 10.8903C21.2738 10.8903 22.1738 11.7903 22.1738 12.8903V13.1903C25.1738 14.0903 27.1738 16.7903 27.1738 19.8903V25.8903L29.1738 27.8903ZM25.1738 19.8903C25.1738 17.0903 22.9738 14.8903 20.1738 14.8903C17.3738 14.8903 15.1738 17.0903 15.1738 19.8903V26.8903H25.1738V19.8903Z"
        fill="currentColor"
      />
    </svg>
  )
}

function LogoutIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

export default function AppBar({
  onBellClick,
}: {
  /** Accepted for call-site compatibility; the badge count is derived from the store. */
  notificationCount?: number
  onBellClick?: () => void
}) {
  const nav = useNavigate()
  const logout = useStore((s) => s.logout)
  const readNotifIds = useStore((s) => s.readNotifIds)
  const flow = useStore((s) => s.flow)
  const registrations = useStore((s) => s.registrations)
  const invitationReceived = flow.invitationReceived
  const notificationCount = unreadCount(readNotifIds, visibleNotifications(invitationReceived, formNotificationPending(flow, registrations)))
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const confirmLogout = () => { setShowLogout(false); logout(); nav('/login') }

  useEffect(() => {
    if (!dropdownOpen && !notifOpen) return
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [dropdownOpen, notifOpen])

  return (
    <>
      {/* ── Mobile: green identity header (Figma 1.3.1) — logo · ITS ID/name · bell · logout ── */}
      <div
        className="relative z-20 flex h-[58px] w-full shrink-0 items-center rounded-bl-[14px] rounded-br-[14px] px-[14px] sm:hidden"
        style={{ background: 'linear-gradient(220deg, #0E2D21 0%, #15402F 50%, #1F5A44 100%)' }}
        data-name="AppBar"
      >
        <button type="button" onClick={() => nav('/miqaats')} aria-label="Home" className="h-[42px] w-[27px] shrink-0">
          <img src={CREST} alt="ITS" className="block h-full w-full object-contain" />
        </button>
        <div className="ml-[12px] flex min-w-0 flex-col gap-[1px]">
          <p className="truncate text-[11px] font-bold uppercase leading-[14px] tracking-[0.5px] text-[rgba(255,255,255,0.65)]" style={{ fontFamily: FONT_SANS }}>
            ITS ID {account.its}
          </p>
          <p className="truncate text-[15px] font-semibold leading-[19px] text-white" style={{ fontFamily: FONT_SANS }}>
            {account.name}
          </p>
        </div>
        <div className="min-w-[12px] flex-1" />
        <TourHelpButton className="mr-[2px]" />
        <button
          type="button"
          onClick={() => { onBellClick?.(); nav('/notifications') }}
          className="relative flex size-[36px] shrink-0 items-center justify-center"
          aria-label="Notifications"
        >
          <BellIcon className="size-[26px] text-white" />
          {notificationCount > 0 && (
            <span className="absolute right-[2px] top-[2px] flex size-[17px] items-center justify-center rounded-full bg-[#b23b3b] text-[10px] font-bold leading-none text-white" style={{ fontFamily: FONT_SANS }}>
              {notificationCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowLogout(true)}
          className="ml-[6px] flex size-[28px] shrink-0 items-center justify-center"
          aria-label="Logout"
        >
          <LogoutIcon className="size-[24px] text-white" />
        </button>
      </div>

      {/* ── Desktop: green identity header — crest · bell · avatar + identity + account menu ── */}
      <div
        ref={dropdownRef}
        className="relative hidden h-[60px] w-full shrink-0 sm:flex sm:items-center sm-full-bleed"
        style={{ paddingLeft: 'var(--content-px)', paddingRight: 'var(--content-px)', background: 'linear-gradient(220deg, #0E2D21 0%, #15402F 50%, #1F5A44 100%)' }}
        data-name="AppBar-desktop"
      >
        {/* Crest → Home */}
        <button type="button" onClick={() => nav('/miqaats')} aria-label="Home" className="relative z-10 h-[38px] w-[24px] shrink-0">
          <img src={CREST} alt="ITS" className="block h-full w-full object-contain" />
        </button>
        <div className="relative z-10 flex-1" />

        {/* Take a tour */}
        <TourHelpButton className="ix-hdr relative z-10 mr-[10px]" />

        {/* Bell */}
        <button
          type="button"
          onClick={() => { onBellClick?.(); setNotifOpen((v) => !v); setDropdownOpen(false) }}
          className="ix-hdr ix-bell relative z-10 mr-[14px] flex size-[38px] shrink-0 items-center justify-center rounded-[11px]"
          aria-label="Notifications"
        >
          <BellIcon className="absolute left-1/2 top-1/2 size-[24px] -translate-x-1/2 -translate-y-1/2 text-white" />
          {notificationCount > 0 && (
            <span className="absolute right-[-4px] top-[-4px] flex size-[18px] items-center justify-center rounded-full bg-[#b23b3b] text-[10px] font-bold leading-none text-white" style={{ fontFamily: FONT_SANS }}>
              {notificationCount}
            </span>
          )}
        </button>

        {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}

        {/* Avatar + identity text + chevron */}
        <div className="ix-hdr ix-chip relative z-10 flex min-w-0 items-center gap-[10px] rounded-[12px] px-[8px] py-[4px]">
          <div className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-white">
            <span className="text-[14px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT_SANS }}>
              {initials(account.name)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-[2px]">
            <p className="truncate text-[11px] font-bold uppercase leading-[14px] tracking-[0.5px] text-[rgba(255,255,255,0.65)]" style={{ fontFamily: FONT_SANS }}>
              ITS ID {account.its}
            </p>
            <p className="truncate text-[14px] font-semibold leading-[18px] text-white" style={{ fontFamily: FONT_SANS }}>
              {account.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setDropdownOpen((v) => !v); setNotifOpen(false) }}
            aria-label="Account menu"
            className="relative z-10 flex size-[28px] items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.15)]"
          >
            <svg viewBox="0 0 24 24" fill="none" className={`size-[16px] text-white transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Account dropdown */}
        {dropdownOpen && (
          <div className="absolute top-full z-50 mt-[6px] w-[180px] overflow-hidden rounded-[12px] border border-[#e7dfc9] bg-white shadow-[0_8px_24px_rgba(15,77,60,0.12)]" style={{ right: 'var(--content-px)' }}>
            <button
              type="button"
              onClick={() => { setDropdownOpen(false); setShowLogout(true) }}
              className="flex w-full items-center gap-[10px] px-[16px] py-[13px] text-left transition-colors hover:bg-[#fdf9f4]"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-[16px] shrink-0 text-[#b23b3b]">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[14px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT_SANS }}>Logout</span>
            </button>
          </div>
        )}
      </div>

      <LogoutConfirmSheet open={showLogout} onClose={() => setShowLogout(false)} onConfirm={confirmLogout} />
    </>
  )
}
