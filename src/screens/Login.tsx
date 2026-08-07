import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import PhoneScreen from '../components/figma/PhoneScreen'
import { useT } from '../i18n'
import LanguageToggle from '../i18n/LanguageToggle'

const imgItsCrest = '/miqaat-logo.png'
const LEFT_BG = '/figma/left-bg.svg'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

export default function Login() {
  const login = useStore((s) => s.login)
  const nav = useNavigate()
  // `tx` spreads translated text + dir/lang onto an element that already exists; `t`
  // returns a bare string for attributes (placeholder) that can't carry direction.
  const { t, tx, dirProps, isLsd } = useT()
  const [its, setIts] = useState('')
  const [pwd, setPwd] = useState('')
  const [remember, setRemember] = useState(false)

  // Demo mode: accept ANY 8-digit ITS ID + ANY non-empty password (no fixed credentials).
  const itsError = its.length > 8 ? 'ITS ID must be exactly 8 digits' : ''
  const pwdError = ''
  const canSubmit = its.length === 8 && pwd.length > 0

  const submit = () => {
    if (!canSubmit) return
    login()
    nav('/miqaats')
  }

  /* ── shared form fields ── */
  const formFields = (
    <div className="mt-[4px]">
      {/* ITS id */}
      <p className="mt-[24px] text-[14px] font-bold uppercase tracking-[0.6px] text-[#a8843e]" style={{ fontFamily: FONT_SANS }} {...tx('ITS id')} />
      <div className={`mt-[8px] h-[48px] overflow-clip rounded-[8px] border border-solid bg-white ${itsError ? 'border-[#c0392b]' : 'border-[#e7dfc9]'}`}>
        <input
          type="text"
          inputMode="numeric"
          value={its}
          onChange={(e) => setIts(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder={t('Enter your 8-digit ITS ID')}
          className="h-full w-full bg-transparent px-[15px] text-[16px] font-normal leading-normal text-[#23302a] outline-none placeholder:text-[#8a938e]"
          style={{ fontFamily: FONT_SANS }}
          {...dirProps}
        />
      </div>
      {itsError && (
        <p className="mt-[4px] text-[12px] font-medium leading-[16px] text-[#c0392b]" style={{ fontFamily: FONT_SANS }} {...tx(itsError)} />
      )}

      {/* Password */}
      <p className="mt-[16px] text-[14px] font-bold tracking-[0.6px] text-[#a8843e]" style={{ fontFamily: FONT_SANS }} {...tx('Password')} />
      <div className={`mt-[8px] h-[48px] overflow-clip rounded-[8px] border border-solid bg-white ${pwdError ? 'border-[#c0392b]' : 'border-[#e7dfc9]'}`}>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder={t('Enter your password')}
          className="h-full w-full bg-transparent px-[15px] text-[16px] font-normal leading-normal text-[#23302a] outline-none placeholder:text-[#8a938e]"
          style={{ fontFamily: FONT_SANS }}
          {...dirProps}
        />
      </div>
      {pwdError && (
        <p className="mt-[4px] text-[12px] font-medium leading-[16px] text-[#c0392b]" style={{ fontFamily: FONT_SANS }}>
          {pwdError}
        </p>
      )}

      {/* Remember Me */}
      <button type="button" onClick={() => setRemember((v) => !v)} className="mt-[16px] flex h-[44px] items-center gap-[8px]">
        <span className={`flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border border-solid border-[#c9a45c] ${remember ? 'bg-[#1f5a44]' : ''}`}>
          {remember && (
            <svg viewBox="0 0 12 12" fill="none" className="h-[12px] w-[12px]">
              <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fffdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="text-[14px] font-semibold leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }} {...tx('Remember Me')} />
      </button>

      {/* Login button */}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-[16px] h-[48px] w-full rounded-[9999px] shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.18),0px_2px_6px_0px_rgba(21,64,47,0.06)] transition-opacity ${
          canSubmit ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'
        }`}
        style={{ backgroundImage: 'linear-gradient(172deg, rgb(31,90,68) 0%, rgb(21,64,47) 100%)' }}
      >
        <span className="text-[16px] font-bold leading-[24px] tracking-[0.4px] text-[#f8f4ea]" style={{ fontFamily: FONT_SANS }} {...tx('Login')} />
      </button>
    </div>
  )

  return (
    // Cream shell so the area below the login panel (and the side gutters on wide
    // phones) matches the panel's #fffdf8 instead of showing a white gap.
    <PhoneScreen statusTone="light" showHomeIndicator={false} frameClassName="bg-[#fffdf8]">

      {/* ===== MOBILE layout — fills the viewport so the cream never bottoms out early ===== */}
      <div className="flex min-h-[100dvh] flex-col sm:hidden">
        {/* Hero (green gradient) — kept compact so the login form sits above the fold */}
        <div className="relative h-[240px] w-full bg-gradient-to-b from-[#0e2d21] via-[#15402f] to-[#1f5a44] [--tw-gradient-via-position:50%]">
          {/* Login renders no AppBar, so the language control lives on the screen itself —
              the user must be able to switch before signing in. */}
          {/* Physical `right`, not logical `end` — the toggle must not change corner
              when the language does. Same for the desktop panel below. */}
          <LanguageToggle className="absolute end-[16px] top-[14px] z-20" />
          <div className="absolute start-0 end-0 top-[-3.47%] bottom-[7.95%] mx-auto w-[320px] rounded-[9999px]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 320 320' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(22.627 0 0 22.627 160 160)'><stop stop-color='rgba(227,205,150,0.28)' offset='0'/><stop stop-color='rgba(227,205,150,0)' offset='0.62'/></radialGradient></defs></svg>\")",
            }}
          />
          <div className="absolute start-0 end-0 top-[30px] mx-auto flex w-[215px] flex-col items-center gap-[7px]">
            <img alt="" className="block h-[89px] w-[56.434px] object-cover" src={imgItsCrest} />
            <div className="flex w-full flex-col items-center gap-[8px]">
              <div className="flex w-full flex-col items-center text-center" style={{ fontFamily: FONT_SERIF }}>
                <p className="mb-0 text-[24px] leading-[28px] text-[#f8f4ea]" {...tx('Welcome to')} />
                {/* LSD greeting stands alone — the product name is dropped in LSD only. */}
                {!isLsd && <p className="text-[24px] leading-[28px] text-[#e3cd96]" {...tx('Miqaat Registration')} />}
              </div>
              <div className="flex h-[20px] w-[192px] shrink-0 items-center gap-[12px]">
                <div className="h-px w-[76.95px] shrink-0 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
                <p className="text-[13px] leading-[19.5px] text-[#e3cd96]">۞</p>
                <div className="h-px w-[76.95px] shrink-0 bg-gradient-to-l from-[rgba(227,205,150,0)] to-[#e3cd96]" />
              </div>
            </div>
          </div>
        </div>

        {/* Login panel */}
        <div className="relative mx-auto -mt-[22px] w-full max-w-[390px] overflow-clip rounded-tl-[16px] rounded-tr-[16px] border border-solid border-[rgba(255,255,255,0.6)] bg-[#fffdf8] pb-[24px]">
          <p className="mt-[24px] text-center text-[22px] leading-[33px] text-[#1f5a44]" style={{ fontFamily: FONT_SERIF }} {...tx('Login to Continue')} />
          <p className="mt-[6px] text-center text-[13.5px] font-normal leading-[20.25px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }} {...tx('Use your ITS credentials to access the portal')} />
          <div className="px-[15px]">{formFields}</div>
        </div>
      </div>

      {/* ===== DESKTOP split layout ===== */}
      <div className="hidden sm:flex sm:min-h-[100dvh] sm-full-bleed">
        {/* Left green panel */}
        <div className="relative flex-[0_0_55%] overflow-hidden">
          <img
            src={LEFT_BG}
            alt=""
            className="pointer-events-none absolute inset-0 block h-full w-full object-cover"
          />
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-[28px] px-[48px] py-[48px]">
            <img alt="" className="h-[110px] w-auto" src={imgItsCrest} />
            <div className="flex flex-col items-center gap-[12px] text-center">
              <div style={{ fontFamily: FONT_SERIF }}>
                <p className="text-[34px] leading-[42px] text-[#f8f4ea]" {...tx('Welcome to')} />
                {!isLsd && <p className="text-[34px] leading-[42px] text-[#e3cd96]" {...tx('Miqaat Registration')} />}
              </div>
              <div className="flex h-[20px] w-[240px] items-center gap-[14px]">
                <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
                <p className="text-[16px] leading-none text-[#e3cd96]">۞</p>
                <div className="h-px flex-1 bg-gradient-to-l from-[rgba(227,205,150,0)] to-[#e3cd96]" />
              </div>
            </div>
          </div>
        </div>

        {/* Right white form panel */}
        <div className="relative flex flex-1 flex-col items-center justify-center bg-[#fffdf8] px-[48px] py-[48px]">
          <LanguageToggle variant="light" className="absolute end-[24px] top-[20px]" />
          <div className="w-full max-w-[420px]">
            <p className="text-center text-[26px] leading-[36px] text-[#1f5a44]" style={{ fontFamily: FONT_SERIF }} {...tx('Login to Continue')} />
            <p className="mt-[8px] text-center text-[13.5px] font-normal leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }} {...tx('Use your ITS credentials to access the portal')} />
            {formFields}
          </div>
        </div>
      </div>

    </PhoneScreen>
  )
}
