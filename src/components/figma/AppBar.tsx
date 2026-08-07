import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { account } from '../../data/seed'
import { unreadCount, visibleNotifications } from '../../data/notifications'
import { useStore } from '../../store'
import { formNotificationPending } from '../../lib/registrationForm'
import NotificationPanel from './NotificationPanel'
import LogoutConfirmSheet from './LogoutConfirmSheet'
import TourHelpButton from '../../tour/TourHelpButton'
import LanguageToggle from '../../i18n/LanguageToggle'
import { useT } from '../../i18n'

const CREST = '/miqaat-logo.png'
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
  const { t, tx, td, tdText, isLsd } = useT()
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

  /* Signed-in identity — one definition, used by both breakpoints and by both positions
     of the mobile cluster. The ITS ID label is translated; the digits are not (an ID is
     not language), so they stay LTR via `data-numeric`. The account NAME goes through
     `td` because LSD must show no Latin script, data values included.

     The two breakpoints use slightly different type scales in the English design
     (15/19 + 1px gap on mobile, 14/18 + 2px on desktop); those are passed in rather than
     unified, so English renders exactly as before. */
  const renderIdentity = (nameClass: string, gapClass: string) => (
    <div className={`flex min-w-0 flex-col ${gapClass}`}>
      <p
        className="truncate text-[11px] font-bold uppercase leading-[14px] tracking-[0.5px] text-[rgba(255,255,255,0.65)]"
        style={{ fontFamily: FONT_SANS }}
        {...(isLsd ? { dir: 'rtl' as const, lang: 'gu-Arab' } : {})}
      >
        {tdText('ITS ID')} <span data-numeric>{account.its}</span>
      </p>
      <p className={`truncate ${nameClass}`} style={{ fontFamily: FONT_SANS }} {...td(account.name)} />
    </div>
  )
  const identity = renderIdentity('text-[15px] font-semibold leading-[19px] text-white', 'gap-[1px]')
  const identityDesktop = renderIdentity('text-[14px] font-semibold leading-[18px] text-white', 'gap-[2px]')

  return (
    <>
      {/* ── Mobile: green identity header (Figma 1.3.1) — logo · ITS ID/name · bell · logout ── */}
      <div
        className="relative z-20 flex h-[58px] w-full shrink-0 items-center rounded-bl-[14px] rounded-br-[14px] px-[14px] sm:hidden"
        style={{ background: 'linear-gradient(220deg, #0E2D21 0%, #15402F 50%, #1F5A44 100%)' }}
        data-name="AppBar"
      >
        <button type="button" onClick={() => nav('/miqaats')} aria-label={t('Home')} className="h-[26px] w-[52px] shrink-0">
          <img src={CREST} alt="" className="block h-full w-full object-contain" />
        </button>
        {/* EN: identity sits beside the crest. LSD: it joins the control cluster on the
            right — the one deliberate placement change in the app, so that name, ITS ID,
            language, help, bell and logout read as a single group instead of being split
            across the bar. Both branches render the same `identity` node, so the two
            languages cannot drift apart. */}
        {!isLsd && <div className="ms-[12px] min-w-0">{identity}</div>}
        <div className="min-w-[12px] flex-1" />
        {isLsd && <div className="me-[10px] min-w-0">{identity}</div>}
        <LanguageToggle className="me-[8px]" />
        <TourHelpButton className="me-[2px]" />
        <button
          type="button"
          onClick={() => { onBellClick?.(); nav('/notifications') }}
          className="relative flex size-[36px] shrink-0 items-center justify-center"
          aria-label={t('Notifications')}
        >
          <BellIcon className="size-[26px] text-white" />
          {notificationCount > 0 && (
            <span className="absolute end-[2px] top-[2px] flex size-[17px] items-center justify-center rounded-full bg-[#b23b3b] text-[10px] font-bold leading-none text-white" style={{ fontFamily: FONT_SANS }} data-numeric>
              {notificationCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowLogout(true)}
          className="ms-[6px] flex size-[28px] shrink-0 items-center justify-center"
          aria-label={t('Logout')}
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
        <button type="button" onClick={() => nav('/miqaats')} aria-label={t('Home')} className="relative z-10 h-[24px] w-[48px] shrink-0">
          <img src={CREST} alt="" className="block h-full w-full object-contain" />
        </button>
        <div className="relative z-10 flex-1" />

        {/* Language */}
        <LanguageToggle className="relative z-10 me-[12px]" />

        {/* Take a tour */}
        <TourHelpButton className="ix-hdr relative z-10 me-[10px]" />

        {/* Bell */}
        <button
          type="button"
          onClick={() => { onBellClick?.(); setNotifOpen((v) => !v); setDropdownOpen(false) }}
          className="ix-hdr ix-bell relative z-10 me-[14px] flex size-[38px] shrink-0 items-center justify-center rounded-[11px]"
          aria-label={t('Notifications')}
        >
          <BellIcon className="size-[24px] text-white" />
          {notificationCount > 0 && (
            <span className="absolute end-[-4px] top-[-4px] flex size-[18px] items-center justify-center rounded-full bg-[#b23b3b] text-[10px] font-bold leading-none text-white" style={{ fontFamily: FONT_SANS }} data-numeric>
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
          {identityDesktop}
          <button
            type="button"
            onClick={() => { setDropdownOpen((v) => !v); setNotifOpen(false) }}
            aria-label={t('Account menu')}
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
              className="flex w-full items-center gap-[10px] px-[16px] py-[13px] text-start transition-colors hover:bg-[#fdf9f4]"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-[16px] shrink-0 text-[#b23b3b]">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[14px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT_SANS }} {...tx('Logout')} />
            </button>
          </div>
        )}
      </div>

      <LogoutConfirmSheet open={showLogout} onClose={() => setShowLogout(false)} onConfirm={confirmLogout} />
    </>
  )
}
