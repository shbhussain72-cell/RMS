import type { CSSProperties, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppBar from '../components/figma/AppBar'
import { memberMeta } from '../components/MemberMeta'
import Breadcrumb from '../components/figma/Breadcrumb'
import PhoneScreen from '../components/figma/PhoneScreen'
import RoleBadge from '../components/figma/RoleBadge'
import type { BadgeKind } from '../lib/group'
import { useT } from '../i18n'
import { DateLine, TimeLine } from '../components/DateLine'
import { notLanguage } from '../components/NotLanguage'

function Overlay({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="max-h-[90dvh] w-full max-w-[390px] overflow-y-auto overscroll-contain rounded-t-[24px] bg-white px-[20px] pb-[32px] pt-[10px] shadow-[0_-8px_40px_rgba(0,0,0,0.2)] sm:max-h-[85vh] sm:max-w-[420px] sm:rounded-[24px] sm:pt-[24px] sm:pb-[28px]">
        {/* drag handle — mobile only */}
        <div className="mb-[18px] flex justify-center sm:hidden">
          <div className="h-[4px] w-[36px] rounded-full bg-[#d9d2c2]" />
        </div>
        {children}
      </div>
    </div>
  )
}

const CARD_BG = '/figma/miqaat-card-bg.png'
const FM: CSSProperties = { fontFamily: 'Marcellus, serif' }
const FMU: CSSProperties = { fontFamily: 'Mulish, system-ui, sans-serif' }

type Member = { name: string; relation: string; gender: 'Male' | 'Female'; age: number; its: string; roleTag?: 'Registrant' | 'Dependent' }

const GROUP_MEMBERS: Member[] = [
  { name: 'Murtaza bhai Moiz bhai Gheewala', relation: '(You)',    gender: 'Male',   roleTag: 'Registrant', age: 31, its: '30412786' },
  { name: 'Sakina Husain',    relation: 'Spouse',   gender: 'Female',                       age: 28, its: '30412790' },
  { name: 'Syed Nazia',       relation: 'Daughter', gender: 'Female', roleTag: 'Dependent',  age: 9,  its: '30412791' },
  { name: 'Amatullah Bhen',   relation: 'Mother',   gender: 'Female', roleTag: 'Dependent',  age: 58, its: '30412793' },
  { name: 'Mohammed Husain',  relation: 'Father',   gender: 'Male',                          age: 62, its: '30412792' },
]

/** Map the display role tag → the shared RoleBadge kind (canonical colours/sizing). */
const KIND: Record<'Registrant' | 'Dependent', Exclude<BadgeKind, null>> = {
  Registrant: 'registrant',
  Dependent: 'dependent',
}

const SCENARIOS = {
  invitation: {
    cardTitle: 'Request received',
    cardBody:  'Murtaza bhai Moiz bhai Gheewala has invited you to join their group',
    primaryBtn: 'Join group',
    otpDesc:    "A 4-digit code was sent to your registered mobile number. Enter it to join Murtaza bhai Moiz bhai Gheewala's group.",
    otpBtn:     'Join group',
    declineDesc: 'You declined the invitation. Murtaza bhai Moiz bhai Gheewala will be notified.',
    successTitle: 'Group Joined Successfully',
    successBody:  "You're now part of Murtaza bhai Moiz bhai Gheewala's group for Eid-e-Ghadeer 1447H.",
  },
  guardian: {
    cardTitle: 'Guardian assigned',
    cardBody:  'Murtaza bhai Moiz bhai Gheewala has been assigned as your guardian. Please accept the request to continue.',
    primaryBtn: 'Accept Guardian',
    otpDesc:    "A 4-digit code was sent to your registered mobile number. Enter it to confirm Murtaza bhai Moiz bhai Gheewala as your guardian.",
    otpBtn:     'Confirm',
    declineDesc: 'You declined the guardian request. Murtaza bhai Moiz bhai Gheewala will be notified.',
    successTitle: 'Guardian Assigned Successfully',
    successBody:  'You are now linked to Murtaza bhai Moiz bhai Gheewala as your guardian for Eid-e-Ghadeer 1447H.',
  },
}

/** The pending-request label shown in the bottom CTA bar — identical for both scenarios. */
const FOOTER_TITLE = 'Request received'

function inits(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

/** Dark event banner (image + date/time) — shared by the mobile column and the desktop sidebar. */
function EventBanner() {
  const { tx } = useT()
  return (
    <div className="relative h-[180px] w-full overflow-hidden rounded-[16px]">
      <img src={CARD_BG} alt="" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(10,45,33,0.25)] to-[rgba(10,45,33,0.78)]" />
      <div className="absolute inset-x-0 bottom-0 p-[20px]">
        <h2 className="text-[22px] leading-[28px] text-white" style={FM} {...tx('Eid-e-Ghadeer 1447H')} />
        <div className="mt-[6px] flex flex-wrap items-center gap-x-[14px] gap-y-[3px]">
          <div className="flex items-center gap-[5px]">
            <svg viewBox="0 0 16 16" fill="none" className="size-[13px] text-[rgba(255,255,255,0.8)]">
              <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.25"/>
              <path d="M2 7h12M5.5 1.5V4M10.5 1.5V4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
            <span className="text-[12px] text-[rgba(255,255,255,0.9)]" style={FMU}>Sat, 21 Jun, 2026</span>
          </div>
          <div className="flex items-center gap-[5px]">
            <svg viewBox="0 0 16 16" fill="none" className="size-[13px] text-[rgba(255,255,255,0.8)]">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25"/>
              <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
            <span className="text-[12px] text-[rgba(255,255,255,0.9)]" style={FMU}><TimeLine value="06:30 AM IST" /></span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Invitation / guardian callout card — shared by the mobile column and the desktop sidebar. */
function InfoCard({ type, title, body }: { type: 'invitation' | 'guardian'; title: string; body: string }) {
  return (
    <div className="flex items-start gap-[12px] rounded-[12px] border border-[#e7dabd] bg-[#fef9f0] p-[14px]">
      <div className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[#d4a857]">
        {type === 'invitation' ? (
          <svg viewBox="0 0 22 22" fill="none" className="size-[20px] text-white">
            <path d="M14.667 19.25v-1.833A3.667 3.667 0 0011 13.75H4.583a3.667 3.667 0 00-3.666 3.667v1.833" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7.792 10.083a3.667 3.667 0 100-7.333 3.667 3.667 0 000 7.333z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18.333 7.333v5.5M15.583 10.083h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg viewBox="0 0 22 22" fill="none" className="size-[20px] text-white">
            <path d="M14.667 19.25v-1.833A3.667 3.667 0 0011 13.75H4.583a3.667 3.667 0 00-3.666 3.667v1.833" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7.792 10.083a3.667 3.667 0 100-7.333 3.667 3.667 0 000 7.333z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="17.417" cy="6.417" r="2.75" stroke="currentColor" strokeWidth="1.6"/>
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-[20px] text-[#1a2a23]" style={FMU}>{title}</p>
        <p className="mt-[3px] text-[13px] leading-[18px] text-[#5a6660]" style={FMU}>{body}</p>
      </div>
    </div>
  )
}

/** Read-only "Group members" list shown in the desktop right panel. Matches the
 *  standardized member-table spec exactly: avatar 36, name 14/leading-18, meta
 *  12/leading-16, header py-10 / body py-9 (→ ~54px rows), shared RoleBadge. */
function MemberList() {
  const { tx, t, td, tdText } = useT()
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white">
      <div className="bg-[#faf8f2] px-[16px] py-[10px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#8a938e]" style={FMU} {...tx('Member')} />
      </div>
      {GROUP_MEMBERS.map((m) => (
        <div
          key={m.its}
          className="flex items-center gap-[10px] border-t border-[#e7dfc9] px-[16px] py-[9px]"
        >
          <div className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44]">
            <span className="text-[13px] font-bold leading-none text-white" style={FMU} {...notLanguage}>{inits(m.name)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold leading-[18px] text-[#23302a]" style={FMU} {...td(m.name)} />
            {/* Built as ONE string then isolated, not as separate JSX expressions: each expression
                is its own text node, so `ITS` and the id landed in the RTL paragraph as bare runs
                with nothing declaring their boundaries. */}
            <p className="text-[12px] leading-[16px] text-[#8a938e]" style={FMU}>
              {memberMeta({ relation: tdText(m.relation), gender: tdText(m.gender), age: String(m.age).padStart(2, '0'), its: m.its }, t)}
            </p>
          </div>
          {m.roleTag && <RoleBadge kind={KIND[m.roleTag]} />}
        </div>
      ))}
    </div>
  )
}

function OtpInput({ otp, onChange }: { otp: string[]; onChange: (v: string[]) => void }) {
  const r0 = useRef<HTMLInputElement>(null)
  const r1 = useRef<HTMLInputElement>(null)
  const r2 = useRef<HTMLInputElement>(null)
  const r3 = useRef<HTMLInputElement>(null)
  const refs = [r0, r1, r2, r3]

  const handleChange = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]; next[i] = val.slice(-1); onChange(next)
    if (val && i < 3) refs[i + 1].current?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs[i - 1].current?.focus()
  }

  return (
    <div className="flex justify-center gap-[12px]">
      {refs.map((ref, i) => (
        <input
          key={i}
          ref={ref}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={otp[i]}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="size-[64px] rounded-[12px] border-2 bg-[#fffdf8] text-center text-[24px] font-bold text-[#1a2a23] outline-none transition-colors focus:border-[#c9a45c]"
          style={{ ...FMU, borderColor: otp[i] ? '#c9a45c' : '#e7dfc9' }}
        />
      ))}
    </div>
  )
}

export default function JoinGroup() {
  const { tx, t, td, tdText } = useT()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const type = params.get('type') === 'guardian' ? 'guardian' : 'invitation'
  const s = SCENARIOS[type]

  const [showOtp,     setShowOtp]     = useState(false)
  const [otp,         setOtp]         = useState(['', '', '', ''])
  const [showDecline, setShowDecline] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const otpFull = otp.every(d => d !== '')

  const handleAccept = () => { setOtp(['', '', '', '']); setShowOtp(true) }

  const handleOtpConfirm = () => {
    if (!otpFull) return
    setShowOtp(false)
    setShowSuccess(true)
  }

  const handleSuccessDone = () => {
    setShowSuccess(false)
    nav('/notifications')
  }

  const handleDeclineDone = () => {
    setShowDecline(false)
    nav('/notifications')
  }

  const breadcrumbItems = [
    { label: t('Home'), to: '/miqaats' },
    { label: t('Join group') },
  ]

  const footer = (
    <div className="sticky-cta w-full px-[16px] py-3 sm:px-[var(--content-px)] sm:pt-6 sm:pb-4">
      <div className="flex items-center gap-[10px] rounded-[18px] border border-[#e7dfc9] bg-[#fffdf8] px-[14px] py-[14px] shadow-[0px_22px_50px_-18px_rgba(21,64,47,0.3),0px_8px_20px_-10px_rgba(21,64,47,0.16)]">
        {/* Desktop-only context label */}
        <div className="hidden sm:flex sm:min-w-0 sm:flex-1 sm:flex-col sm:gap-[2px]">
          <p className="text-[11px] font-bold uppercase leading-[15px] tracking-[0.5px] text-[#8a938e]" style={FMU} {...tx('Eid-e-Ghadeer 1447H')} />
          <p className="text-[15px] font-bold leading-[20px] text-[#1a2a23]" style={FMU}>{FOOTER_TITLE}</p>
        </div>
        {/* Decline */}
        <button
          type="button"
          onClick={() => setShowDecline(true)}
          className="flex-1 rounded-[12px] border border-[#b23b3b] py-[13px] text-[14px] font-semibold text-[#b23b3b] transition-colors hover:bg-[#fdf3f3] sm:flex-none sm:px-[28px]"
          style={FMU} {...tx('Decline Request')} />
        {/* Accept */}
        <button
          type="button"
          onClick={handleAccept}
          className="flex-1 rounded-[12px] bg-[#1f5a44] py-[13px] text-[14px] font-semibold text-white transition-colors hover:bg-[#17472f] sm:flex-none sm:px-[28px]"
          style={FMU}
        >
          {t(s.primaryBtn)}
        </button>
      </div>
    </div>
  )

  return (
    <PhoneScreen footer={<div className="sm:hidden">{footer}</div>}>
      {/* AppBar */}
      <div>
        <AppBar />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE — single column (unchanged responsive layout).
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="contents sm:hidden">
        {/* Breadcrumb */}
        <div className="ms-[16px] mt-[10px]">
          <Breadcrumb items={breadcrumbItems} onNavigate={nav} onBack={() => nav(-1)} />
        </div>

        <div className="px-[16px] pb-[32px]">
          {/* Event banner */}
          <div className="mt-[16px]"><EventBanner /></div>

          {/* Invitation / guardian info card */}
          <div className="mt-[16px]"><InfoCard type={type} title={s.cardTitle} body={s.cardBody} /></div>

          {/* GROUP MEMBERS divider */}
          <div className="mt-[24px] flex items-center gap-[12px]">
            <div className="h-px flex-1 bg-[#e7dabd]" />
            <p className="shrink-0 text-[11px] font-bold uppercase tracking-[1.5px] text-[#c9a45c]" style={FMU} {...tx('Group Members')} />
            <div className="h-px flex-1 bg-[#e7dabd]" />
          </div>

          {/* Member cards */}
          <div className="mt-[12px] flex flex-col gap-[8px]">
            {GROUP_MEMBERS.map(m => (
              <div
                key={m.its}
                className="flex items-center gap-[12px] rounded-[12px] border border-[#ede8df] bg-white px-[14px] py-[12px]"
              >
                <div className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44]">
                  <span className="text-[13px] font-bold leading-none text-white" style={FMU} {...notLanguage}>{inits(m.name)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold leading-[18px] text-[#1a2a23]" style={FMU} {...td(m.name)} />
                  <p className="text-[12px] leading-[16px] text-[#8a938e]" style={FMU}>
                    {memberMeta({ relation: tdText(m.relation), gender: tdText(m.gender), age: String(m.age).padStart(2, '0'), its: m.its }, t)}
                  </p>
                </div>
                {m.roleTag && (
                  <span
                    // The comparison is against the ENGLISH tag, which is what the data holds.
                    // It used to compare against `t('Registrant')`, so in LSD it never matched and
                    // every registrant wore the dependent's amber styling.
                    className={`shrink-0 rounded-full px-[10px] py-[3px] text-[11px] font-semibold ${
                      m.roleTag === 'Registrant' ? 'bg-[#e8f3ed] text-[#1f5a44]' : 'bg-[#fef3dd] text-[#b07a1f]'
                    }`}
                    style={FMU}
                    {...tx(m.roleTag)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP — two-panel layout (cream sidebar + white group panel).
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden sm:block sm-full-bleed">
        <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden">

          {/* ───────── LEFT sidebar ───────── */}
          <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col overflow-y-auto border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">
            {/* breadcrumb header — Go back merged in as the leading item */}
            <Breadcrumb items={breadcrumbItems} onNavigate={nav} onBack={() => nav(-1)} activeColor="#a8843e" dense />

            {/* Event banner */}
            <div className="mt-[22px]"><EventBanner /></div>

            {/* Invitation / guardian info card */}
            <div className="mt-[14px]"><InfoCard type={type} title={s.cardTitle} body={s.cardBody} /></div>
          </aside>

          {/* ───────── RIGHT group panel ───────── */}
          <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">
              <h1 className="text-[30px] leading-[36px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Group members')} />
              <div className="mt-[20px]"><MemberList /></div>
            </div>

            {/* sticky footer CTA */}
            <div className="shrink-0">{footer}</div>
          </section>
        </div>
      </div>

      {/* ── OTP overlay ── */}
      {showOtp && (
        <Overlay onClose={() => setShowOtp(false)}>
          <h2 className="text-[20px] leading-[26px] text-[#15402f]" style={FM} {...tx('Confirm it\'s you')} />
          <p className="mt-[8px] text-[13px] leading-[19px] text-[#5a6660]" style={FMU}>{s.otpDesc}</p>
          <div className="mt-[24px]">
            <OtpInput otp={otp} onChange={setOtp} />
          </div>
          <div className="mt-[14px] text-center">
            <span className="text-[13px] text-[#8a938e]" style={FMU} {...tx('Didn\'t get it?')} />
            <button type="button" className="text-[13px] font-semibold text-[#1f5a44]" style={FMU} {...tx('Resend code')} />
          </div>
          <button
            type="button"
            onClick={handleOtpConfirm}
            disabled={!otpFull}
            className={`mt-[20px] w-full rounded-[12px] py-[13px] text-[14px] font-bold text-white shadow-[0px_4px_12px_rgba(21,64,47,0.25)] transition-colors ${
              otpFull ? 'bg-[#1f5a44] hover:bg-[#17472f]' : 'cursor-not-allowed bg-[#a0bcb2]'
            }`}
            style={FMU}
          >
            {t(s.otpBtn)}
          </button>
        </Overlay>
      )}

      {/* ── Decline overlay ── */}
      {showDecline && (
        <Overlay onClose={() => setShowDecline(false)}>
          <div className="flex flex-col items-center text-center">
            <div className="flex size-[56px] items-center justify-center rounded-full bg-[#fde8e8]">
              <svg viewBox="0 0 24 24" fill="none" className="size-[24px] text-[#b23b3b]">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="mt-[14px] text-[20px] leading-[26px] text-[#15402f]" style={FM} {...tx('Request cancelled')} />
            <p className="mt-[8px] text-[13px] leading-[19px] text-[#5a6660]" style={FMU}>{s.declineDesc}</p>
            <button
              type="button"
              onClick={handleDeclineDone}
              className="mt-[24px] w-full rounded-[12px] bg-[#1f5a44] py-[13px] text-[14px] font-bold text-white shadow-[0px_4px_12px_rgba(21,64,47,0.25)] hover:bg-[#17472f]"
              style={FMU} {...tx('Done')} />
          </div>
        </Overlay>
      )}

      {/* ── Success overlay (after Join / Confirm) ── */}
      {showSuccess && (
        <Overlay onClose={handleSuccessDone}>
          <div className="flex flex-col items-center text-center">
            <div className="flex size-[64px] items-center justify-center rounded-full bg-[#1f5a44]">
              <svg viewBox="0 0 24 24" fill="none" className="size-[30px] text-white">
                <path d="M5 12.5l4.4 4.4L19 7.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="mt-[16px] text-[22px] leading-[28px] text-[#15402f]" style={FM}>{s.successTitle}</h2>
            <p className="mt-[8px] text-[14px] leading-[20px] text-[#5a6660]" style={FMU}>{s.successBody}</p>
            <button
              type="button"
              onClick={handleSuccessDone}
              className="mt-[24px] w-full rounded-[12px] bg-[#1f5a44] py-[14px] text-[15px] font-bold text-white shadow-[0px_4px_12px_rgba(21,64,47,0.25)] transition-colors hover:bg-[#17472f]"
              style={FMU} {...tx('Done')} />
          </div>
        </Overlay>
      )}
    </PhoneScreen>
  )
}
