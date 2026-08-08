import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import { fasalAnnouncement, importantNotices, miqaats, INVITE_QUOTA, type Miqaat } from '../data/seed'
import { EventTimelineButton, EventTimelineFooter } from '../components/figma/EventTimeline'
import { InviteMehmaanCard } from '../components/figma/InviteMehmaanCard'
import { ArazCard } from '../components/figma/ArazCard'
import { DemoProgressionControl } from '../components/figma/DemoProgressionControl'
import { RazaStatusCard } from '../components/figma/RazaStatusCard'
import { useStore, journeyFor, DEMO_PHASE_ORDER, type ReopenRequest, type RegistrationFlow } from '../store'
import { pendingNewQuestionKeys, isFormEditable, formatFormUpdated } from '../lib/registrationForm'
import AskHelpDock from '../chat/AskHelpDock'
import type { AskHelpInit } from '../chat/types'
import Toast, { useToast } from '../components/figma/Toast'
import { useT } from '../i18n'
import { DateLine, TimeLine } from '../components/DateLine'
import { Ltr, toArabicDigits } from '../components/Bidi'

const HERO_ARCH = '/figma/md-hero-arch.svg'
const HERO_PHOTO = '/figma/md-hero-photo.png'
/** Miqaat logo — replaces the old ITS crest (`/figma/event-emblem.svg`) beside event names. */
const EVENT_EMBLEM = '/miqaat-logo.png'
const VIDEO_PLAY = '/figma/md-video-play.svg'
const VIDEO_ORNAMENT = '/figma/md-video-ornament.svg'
const CHECK_CIRCLE = '/figma/md-check-circle.svg'
const CREST = '/miqaat-logo.png'

const MUL = 'Mulish, system-ui, sans-serif'

function useCountdown(initialSeconds: number) {
  const [secs, setSecs] = useState(initialSeconds)
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    days: pad(Math.floor(secs / 86400)),
    hours: pad(Math.floor((secs % 86400) / 3600)),
    min: pad(Math.floor((secs % 3600) / 60)),
    sec: pad(secs % 60),
  }
}

function SectionHeading({ label }: { label: string }) {
  const { tx } = useT()
  return (
    <div className="relative h-[18px] w-full">
      {/* Rule — LABEL — rule, gold at the outer edges and fading to nothing at the centre.
          The composition is symmetric, so under RTL it should look identical, mirrored.

          Both insets are logical AND the gradient direction flips with `rtl:`. Half-measures
          break it: `start-0` with a physical `right-1/2` resolves BOTH to the right edge in
          RTL (inset-inline-start === right), leaving `left` unset — so the rule computes to
          zero width and disappears entirely. Flipping the inset without flipping the gradient
          is the mirror image of that bug: the fade would run outward from the centre instead
          of into it. */}
      <div className="absolute start-0 end-1/2 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r rtl:bg-gradient-to-l from-[#e3cd96] to-[rgba(227,205,150,0)]" />
      <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
        style={{ fontFamily: MUL, fontWeight: 700 }}
        {...tx(label)}
      />
      <div className="absolute start-1/2 end-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r rtl:bg-gradient-to-l from-[rgba(227,205,150,0)] to-[#e3cd96]" />
    </div>
  )
}

function Hero({
  title,
  arabicName,
  dateLabel,
  timeLabel,
  image,
  newBadge = false,
  reg,
  endsText,
  cells,
  hideCountdown = false,
  onViewRaza,
  primaryLabel,
  onPrimary,
  onManage,
  demoControl,
}: {
  title: string
  /** Lisan al-Dawat (Arabic script) event name — same as the home event card's subtitle. */
  arabicName?: string
  dateLabel: string
  timeLabel: string
  /** This event's own photo (falls back to the shared placeholder when unset). */
  image?: string
  /** Show the gold "New Miqaat" badge (mirrors the home banner — only for events not yet registered). */
  newBadge?: boolean
  /** Registered-state pills (Raza status, City) — mirrors the home event card. Omit for events the
   *  user hasn't registered for. */
  reg?: {
    razaDone: boolean
    cityLabel: string
    cityValue: string
    cityAllocated: boolean
    showCityStatus: boolean
  }
  /** "Registration/City/Zone ends in …" — mirrors the home banner, shown in every state (not
   *  just once registered). A KEY plus its date rather than a finished sentence: gluing the
   *  date on with a template string compiles the word order into the literal, and the
   *  dictionary is then consulted after the only decision it needed to make. */
  endsText: { key: string; date?: string }
  cells: { value: string; unit: string }[]
  /** Once Raza is issued there's nothing left to count down to — hides the ends-in text + cells
   *  entirely instead of showing a stale line. */
  hideCountdown?: boolean
  /** Opens the in-app Raza page — passed through to the Raza status card's "View" pill. */
  onViewRaza?: () => void
  /** Primary CTA (e.g. "Select city") shown on the banner. */
  primaryLabel?: string
  onPrimary?: () => void
  /** Secondary "Modify reservation" — when set, shown side-by-side with the primary CTA. */
  onManage?: () => void
  /** Demo Progression Controls (ashara-1448 only) — rendered below the CTA row, on the same dark
   *  banner. `Hero` stays generic/unaware of ashara; the caller decides whether to pass it. */
  demoControl?: ReactNode
}) {
  const { t, tx, tdAuthored, isLsd, dirProps } = useT()
  // Both CTAs get exactly one equal width — a 2-col grid (`1fr 1fr`), capped on desktop so they
  // stay a sensible size instead of stretching. Single-CTA state stays natural width. Pulled into
  // its own variable so it can be positioned either beside the countdown (the normal case) or
  // below it (when a demo control takes that slot instead — see the row below).
  const ctaBlock = primaryLabel && (
    <div className={onManage ? 'grid grid-cols-2 gap-[10px] lg:w-[420px] lg:shrink-0' : 'lg:shrink-0'}>
      {onManage && (
        <button type="button" onClick={onManage} className="inline-flex h-[50px] w-full min-w-0 items-center justify-center gap-[5px] rounded-full border border-solid border-[rgba(255,255,255,0.7)] bg-[rgba(0,0,0,0.38)] px-[12px] backdrop-blur-[3px] transition-colors hover:bg-[rgba(0,0,0,0.5)]">
          <span className="text-[12px] leading-none text-white">✎</span>
          <span className="truncate text-[12px] font-bold text-white" style={{ fontFamily: MUL }} {...tx('Modify Reservation')} />
        </button>
      )}
      {/* When the primary IS "Modify Reservation" (no separate manage secondary), use the SAME dark
          frosted treatment as the secondary Modify-Reservation button for a consistent look — not the
          gold gradient reserved for forward actions (Select city / Register Now …). */}
      {/* Against the ENGLISH key, not `t(...)`. `primaryLabel` is a key — the lines below
          spread it through `tx()`. Comparing it to a translated value is false in LSD for
          every string in the app, so this branch never ran there. */}
      {primaryLabel === 'Modify Reservation' ? (
        <button type="button" onClick={onPrimary} className={`inline-flex h-[50px] min-w-0 items-center justify-center gap-[5px] rounded-full border border-solid border-[rgba(255,255,255,0.7)] bg-[rgba(0,0,0,0.38)] backdrop-blur-[3px] transition-colors hover:bg-[rgba(0,0,0,0.5)] ${onManage ? 'w-full px-[12px]' : 'w-full px-[24px] lg:w-auto lg:px-[48px]'}`}>
          <span className="text-[13px] leading-none text-white">✎</span>
          <span className="truncate text-[14px] font-bold text-white" style={{ fontFamily: MUL }} {...tx(primaryLabel ?? '')} />
        </button>
      ) : (
        <button type="button" onClick={onPrimary} data-tour={primaryLabel === 'Register Now' ? 'register-button' : undefined} className={`inline-flex h-[50px] min-w-0 items-center justify-center rounded-full bg-gradient-to-b from-[#E3CD96] to-[#C9A45C] shadow-[0px_8px_20px_-6px_rgba(0,0,0,0.35)] transition-transform active:scale-[0.98] ${onManage ? 'w-full px-[12px]' : 'w-full px-[24px] lg:w-auto lg:px-[48px]'}`}>
          <span className="truncate text-[14px] font-bold text-[#15402f]" style={{ fontFamily: MUL }} {...tx(primaryLabel ?? '')} />
        </button>
      )}
    </div>
  )
  return (
    <div className="relative w-full overflow-clip rounded-[20px] bg-gradient-to-b from-[#0e2d21] via-[#15402f] to-[#1f5a44] [--tw-gradient-via-position:50%] sm:rounded-[24px]">
      <div className="absolute bottom-[32.41%] left-[calc(50%-0.94px)] top-[5.51%] w-[320px] -translate-x-1/2 rounded-[9999px]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 320 320' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(22.627 0 0 22.627 160 160)'><stop stop-color='rgba(227,205,150,0.28)' offset='0'/><stop stop-color='rgba(227,205,150,0)' offset='0.62'/></radialGradient></defs></svg>\")",
        }}
      />
      <div className="absolute inset-[0_-0.11px_270.56px_0]">
        <img src={HERO_ARCH} alt="" className="absolute inset-0 block size-full max-w-none" />
      </div>

      {/* Image-backed hero — the photo fills behind the full event card (identity + details + CTAs),
          exactly like the home featured banner: same left-dark `.ashara-banner-gradient`, and sized to
          its content (no forced min-height → no empty image band above the content). */}
      <div className="relative overflow-clip px-[18px] py-[24px] sm:px-[32px] sm:py-[30px]">
        <img
          src={image ?? HERO_PHOTO}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = HERO_PHOTO }}
        />
        <div className="ashara-banner-gradient absolute inset-0" />

        <div className="relative z-[1] flex flex-col gap-[16px]">
          {/* Event identity — mirrors the home event card: "New Miqaat" badge, emblem + English title,
              Lisan al-Dawat name, then date/time. */}
          <div className="flex flex-col gap-[12px]">
            {newBadge && (
              <div className="flex w-fit items-center gap-[7px] rounded-full bg-[#a8843e] px-[13px] py-[5px]">
                <span className="size-[6px] shrink-0 rounded-full bg-white" />
                <span className="whitespace-nowrap text-[11px] font-bold uppercase leading-none tracking-[0.8px] text-white" style={{ fontFamily: MUL }} {...tx('New Miqaat')} />
              </div>
            )}
            {/* Logo leads from the right in LSD — the hero container above is already RTL,
                so no `flex-row-reverse` here (applying both would cancel out). */}
            <div className="flex items-center gap-[12px]">
              <img src={EVENT_EMBLEM} alt="" className="h-[46px] w-auto shrink-0 object-contain sm:h-[58px]" />
              <div className="min-w-0">
                {/* Same heading slot in both languages. LSD renders the name larger and in
                    gold — matching the event cards on the home screen; the gold that used
                    to carry the Arabic subtitle now carries the name itself. EN keeps its
                    original white at its original size. */}
                <p
                  className={
                    isLsd
                      ? 'text-[35px] leading-[44px] tracking-[0.2px] text-[#e3cd96] sm:text-[47px] sm:leading-[58px]'
                      : 'text-[27px] leading-[31px] tracking-[0.2px] text-white sm:text-[36px] sm:leading-[42px]'
                  }
                  style={{ fontFamily: 'Marcellus, serif' }}
                  {...tdAuthored(title, arabicName)}
                />
                {/* EN-only: in LSD this name is already the heading above. */}
                {!isLsd && arabicName && (
                  <p
                    className="mt-[5px] text-[15px] leading-[22px] text-[rgba(255,255,255,0.78)] sm:text-[18px] sm:leading-[26px]"
                    style={{ fontFamily: 'Amiri, serif' }}
                    dir="rtl"
                  >
                    {arabicName}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px]">
              <span className="flex items-center gap-[8px]">
                <img src="/figma/icon-date-range-gold.svg" alt="" className="size-[18px] shrink-0" />
                <span className="text-[14px] leading-[18px] text-white" style={{ fontFamily: MUL, fontWeight: 500 }} {...dirProps}>
                  <DateLine value={dateLabel} />
                </span>
              </span>
              <span className="h-[16px] w-px shrink-0 bg-[rgba(255,255,255,0.3)]" />
              <span className="flex items-center gap-[8px]">
                <img src="/figma/icon-schedule.svg" alt="" className="size-[18px] shrink-0" />
                <span className="text-[14px] leading-[18px] text-white" style={{ fontFamily: MUL, fontWeight: 500 }} {...dirProps}>
                  <TimeLine value={timeLabel} />
                </span>
              </span>
            </div>
          </div>

          {/* Status pills (registered only) + ends-in countdown on the left — always shown, mirrors
              the home event card — CTAs side-by-side on the right, now over the image. */}
          <div className="flex flex-col gap-[18px] lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-[8px] lg:max-w-[480px] lg:flex-1">
              {reg && (
                <>
                  <RazaStatusCard issued={reg.razaDone} onView={onViewRaza} />
                  {reg.showCityStatus && (
                    <div className="flex h-[40px] items-center justify-between rounded-[12px] px-[14px]" style={{ background: reg.cityAllocated ? '#e7f1ea' : '#ffffff' }}>
                      <span className="flex items-center gap-[8px]">
                        <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#1f5a44" /><circle cx="12" cy="9" r="2.6" fill="white" /></svg>
                        <span className="text-[14px] text-[#3d3d3a]" style={{ fontFamily: MUL, fontWeight: 600 }} {...tx(reg.cityLabel)} />
                      </span>
                      <span className="truncate text-[14px]" style={{ fontFamily: MUL, fontWeight: reg.cityAllocated ? 800 : 600, color: reg.cityAllocated ? '#1f5a44' : '#8a938e' }} {...(reg.cityAllocated ? { children: reg.cityValue } : tx(reg.cityValue))} />
                    </div>
                  )}
                </>
              )}
              {!hideCountdown && (
                <>
                  <div className="mt-[2px] flex items-center gap-[7px]">
                    <span className="size-[7px] shrink-0 rounded-full bg-[#d9a441]" />
                    <span className="text-[12px] leading-[16px] text-[rgba(255,255,255,0.85)]" style={{ fontFamily: MUL, fontWeight: 500 }} {...tx(endsText.key, endsText.date ? { date: endsText.date } : undefined)} />
                  </div>
                  <div className="flex gap-[8px]">
                    {cells.map((c) => (
                      <div key={c.unit} className="flex flex-1 flex-col items-center justify-center rounded-[12px] border border-solid border-[rgba(201,161,74,0.4)] bg-[rgba(255,255,255,0.1)] py-[8px]">
                        {/* A countdown is a COUNT, so its digits follow the language — Arabic-Indic
                            in LSD, matching the time rendered directly above it. Left as ASCII, the
                            hero showed an Arabic-Indic clock and a Latin `07 DAYS` side by side.
                            `toArabicDigits` and not `formatNumber` because the value arrives
                            pre-padded (`07`, `00`) and the pad is what stops the tiles resizing on
                            each tick — the same reason MiqaatList's CountdownValue picks it.
                            The <Ltr> wrapper is applied ONLY in LSD so the English DOM is
                            untouched. */}
                        <p className="text-[22px] leading-[26px] text-white sm:text-[26px]" style={{ fontFamily: MUL, fontWeight: 700 }}>{isLsd ? <Ltr>{toArabicDigits(c.value)}</Ltr> : c.value}</p>
                        <p className="mt-[2px] text-[9px] uppercase leading-none tracking-[0.6px] text-[#c8a84b] sm:text-[10px]" style={{ fontFamily: MUL, fontWeight: 700 }} {...tx(c.unit)} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Without a demo control this slot is the CTAs, exactly as before. With one (ashara-1448
                only), the CTAs move down to share a row with the demo control instead — see below —
                so this slot renders nothing, leaving the countdown alone on its own row. */}
            {!demoControl && ctaBlock}
              </div>
          {demoControl && (
            <div className="flex items-center justify-between gap-[12px]">
              {ctaBlock}
              {demoControl}
            </div>
          )}
          </div>
        </div>
      </div>
  )
}

/** Official Fasal Announcement — a separate rounded card below the Hero (own gap/margin, not
 *  nested inside it), matching the same dark-green gradient card treatment. */
function FasalAnnouncementCard({ arabic, hostCity, relayCenters }: { arabic: string; hostCity: string; relayCenters: string[] }) {
  const { tx, td } = useT()
  return (
    <div className="relative w-full overflow-clip rounded-[20px] bg-gradient-to-b from-[#0e2d21] via-[#15402f] to-[#1f5a44] px-[18px] pb-[16px] pt-[20px] sm:rounded-[24px]">
      <div className="flex w-full flex-col items-center rounded-[14px] border border-solid border-[rgba(227,205,150,0.25)] bg-[rgba(255,255,255,0.07)] px-[18px] py-[20px] sm:px-[48px] sm:py-[28px]">
        <p
          className="text-center text-[10px] uppercase leading-[15px] tracking-[1px] text-[#e3cd96]"
          style={{ fontFamily: MUL, fontWeight: 800 }} {...tx('Official Fasal Announcement')} />
        <p
          className="mt-[10px] text-center text-[18px] leading-[32px] text-white sm:mt-[14px] sm:text-[22px] sm:leading-[36px]"
          style={{ fontFamily: 'Amiri, serif' }}
          dir="auto"
        >
          {arabic}
        </p>
        <p
          className="mt-[8px] max-w-[640px] text-center text-[13px] italic leading-[20px] text-[rgba(248,244,234,0.8)] sm:mt-[10px]"
          style={{ fontFamily: MUL, fontWeight: 400 }} {...tx('Fasal declared. Mumineen are invited to seek Raza for Ashara Mubaraka 1448H. May Allah grant all the taufeeq of haziri.')} />
        <div className="mt-[14px] flex h-[35px] items-center gap-[8px] rounded-[999px] border border-solid border-[rgba(227,205,150,0.4)] bg-[rgba(255,255,255,0.1)] px-[20px] sm:mt-[18px]">
          {/* The pin stays OUTSIDE the translated node: it is an icon, not a word. Glued onto
              the front of the key it becomes part of a string the dictionary has to carry, and
              then sits on whichever end the bidi algorithm picks rather than the one it means. */}
          <span className="whitespace-nowrap text-[13px] text-[#e3cd96]" style={{ fontFamily: MUL, fontWeight: 700 }}>
            {'📍 '}<bdi {...tx('Host City')} />
          </span>
          <span className="whitespace-nowrap text-[13px] text-white" style={{ fontFamily: MUL, fontWeight: 700 }} {...td(hostCity)} />
        </div>
        <p
          className="mt-[14px] text-center text-[10px] uppercase leading-[15px] tracking-[1px] text-[#e3cd96] sm:mt-[18px]"
          style={{ fontFamily: MUL, fontWeight: 800 }} {...tx('Relay Centers')} />
        <div className="mt-[10px] flex flex-wrap justify-center gap-[8px] sm:mt-[12px]">
          {relayCenters.map((city, i) => (
            <div
              key={`${city}-${i}`}
              className="flex h-[37px] items-center gap-[7px] rounded-[10px] border border-solid border-[rgba(227,205,150,0.3)] bg-[rgba(255,255,255,0.06)] px-[14px]"
            >
              <span
                className="text-[11px] leading-[16.5px] text-[#e3cd96]"
                style={{ fontFamily: '"Segoe UI", system-ui, sans-serif', fontWeight: 700 }}
              >
                ۞
              </span>
              <span
                className="whitespace-nowrap text-[12px] leading-[18px] text-white"
                style={{ fontFamily: MUL, fontWeight: 700 }}
                {...td(city)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ImportantNoticeCard() {
  return (
    <div className="w-full rounded-[18px] border-2 border-solid border-[#e7dfc9] bg-[#fffdf8] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)]">
      <div className="flex flex-col gap-[16px] p-[14px]">
        {importantNotices.map((notice, i) => (
          <div key={i} className="flex items-start gap-[10px]">
            <div className="flex size-[32px] shrink-0 items-center justify-center overflow-clip rounded-[50px] bg-[#f8f8f8]">
              <span
                className="text-[14px] leading-[20px] text-[#15402f]"
                style={{ fontFamily: MUL, fontWeight: 700 }}
              >
                {i + 1}
              </span>
            </div>
            <p
              className="flex-1 text-[14px] leading-[24px] text-[#23302a]"
              style={{ fontFamily: MUL, fontWeight: 400 }}
            >
              {notice}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AboutVideoCard() {
                            const { tx } = useT()
  return (
    <div className="relative h-[200px] sm:h-[300px] w-full overflow-clip rounded-[18px] border-2 border-solid border-[#e7dfc9] bg-[#fffdf8] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)]">
      <div
        className="absolute inset-0 overflow-clip"
        style={{
          backgroundImage:
            'linear-gradient(134.99999925795356deg, rgb(14, 45, 33) 0%, rgb(31, 90, 68) 100%)',
        }}
      >
        <div className="absolute inset-[0_0_0.26px_0] overflow-clip opacity-40">
          <div className="absolute inset-[22.22%_41%_30.67%_41%]">
            <div className="absolute inset-[-0.47%_-0.69%]">
              <img src={VIDEO_ORNAMENT} alt="" className="block size-full max-w-none" />
            </div>
          </div>
        </div>
        <div className="absolute start-0 end-0 top-[65.44px] mx-auto size-[66px] rounded-[33px] bg-[rgba(248,244,234,0.92)] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.3)]">
          <div className="absolute start-[21.5px] top-[20px] size-[26px]">
            <img src={VIDEO_PLAY} alt="" className="absolute inset-0 block size-full max-w-none" />
          </div>
          <div className="absolute inset-[-8px] rounded-[41px] border-2 border-solid border-[rgba(255,255,255,0.4)]" />
        </div>
        <div className="absolute bottom-[0.25px] start-0 end-0 h-[49.69px] bg-gradient-to-b from-[rgba(0,0,0,0)] to-[rgba(0,0,0,0.55)]">
          <p
            className="absolute start-[16px] end-[16px] top-[23px] h-[18px] -translate-y-1/2 text-[14px] leading-[21.7px] text-white"
            style={{ fontFamily: MUL, fontWeight: 600 }} {...tx('Watch Introduction · Purpose & Travel Guidance')} />
        </div>
      </div>
    </div>
  )
}

// ── Visa upload (eligibility) + guidelines download ────────────────────────

function PdfFileIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} className="shrink-0">
      <path d="M6 2.5h8l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5Z" stroke="#c0392b" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 2.5V7h4.5" stroke="#c0392b" strokeWidth="1.6" strokeLinejoin="round" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#c0392b" fontFamily="Mulish, system-ui, sans-serif">PDF</text>
    </svg>
  )
}

/** Organiser-provided guidelines — written content rendered directly in the app (no PDF/iframe, so it
 *  never depends on the browser's PDF viewer or on the asset being served). A real backend would serve
 *  the admin's latest text/upload for the event. */
const GUIDELINES_INTRO =
  'Please read the following guidelines carefully before and during your Miqaat journey.'
/**
 * The organiser document's rules. Rows 2–5 are word-for-word `importantNotices` in
 * `src/data/seed.ts`, and until §4.7 both were rendered on this page at once — the notice list,
 * and again inside the Documents card's clipped preview.
 *
 * The notice list is canonical. Those five rows are the wordlist's sentinel entries: their cells
 * hold an instruction rather than a translation, they render English on purpose, and the standing
 * rule is that they are neither deleted nor translated. The section exists to carry them. This
 * card is a *preview of a document* — its job is to show one exists and to open it, which it can
 * do without restating the notices. So the rules stay here for the popup, which is where someone
 * has asked to read the document, and the collapsed card no longer repeats them.
 *
 * Kept as a separate array rather than pointed at `importantNotices`: these are the document's
 * words and those are the app's, and the fixture wording agreeing today is not a reason to fuse
 * them — the sentinel rows in particular must keep their own identity in the wordlist.
 */
const GUIDELINES_RULES = [
  'Registration closes on 5 June 2026 at 11:59 PM.',
  'Children below 10 years of age must be assigned to a parent or guardian before proceeding.',
  'Venue allocation is subject to availability and capacity limits.',
  'Host City registrations may close early once capacity is reached.',
  'Tickets will only be generated after all required approvals are completed.',
]
const GUIDELINES_NOTE =
  'Please carry a valid photo ID and this document (or a digital copy) during travel and at the venue.'

/** Guidelines & Rules card — view-only written guidelines: a small clipped text preview sits on the
 *  card, and tapping it opens a larger popup with the full text. There is no download affordance. */
function GuidelinesCard() {
                            const { tx } = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col overflow-hidden rounded-[18px] border-2 border-solid border-[#e7dfc9] bg-[#fffdf8] text-start shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)] transition-colors hover:border-[#c2a04e]"
      >
        <div className="flex items-center gap-[10px] p-[16px] pb-[12px]">
          <PdfFileIcon size={22} />
          <div className="min-w-0">
            <p className="text-[14px] leading-[20px] text-[#23302a]" style={{ fontFamily: MUL, fontWeight: 700 }} {...tx('Guidelines & Rules and Regulations')} />
            <p className="mt-[2px] text-[12px] leading-[17px] text-[#6a746e]" style={{ fontFamily: MUL }} {...tx('Provided by the organisers for this Miqaat — tap to view.')} />
          </div>
        </div>
        {/* Preview of the DOCUMENT, not a second copy of the notice list.
            §4.7: this box used to render `GUIDELINES_RULES` — the same five sentences as the
            `Important Notice` section three cards above it. Those five are the canonical ones
            (see the note on GUIDELINES_RULES), so what belongs here is what identifies the
            document: its title and its opening line. The full text is one tap away.
            §4.6: with no list to clip there is nothing for a gradient to fade, so rows 2–5 can
            no longer sit half-legible under it, and the "View document" pill moves to its own
            row below rather than resting on top of the text. Preferred over raising a collapsed
            height, which re-breaks every time a string changes length or language. */}
        <div className="relative mx-[16px] overflow-hidden rounded-[10px] border border-[#e7dfc9] bg-white px-[16px] py-[14px]">
          <p className="text-[13px] leading-[18px] text-[#15402f]" style={{ fontFamily: 'Marcellus, serif' }} {...tx('Miqaat Guidelines & Rules and Regulations')} />
          <p className="mt-[6px] text-[11.5px] leading-[17px] text-[#5a6660]" style={{ fontFamily: MUL }} {...tx(GUIDELINES_INTRO)} />
        </div>
        <div className="flex items-center justify-end px-[16px] pb-[16px] pt-[10px]">
          <span className="rounded-full bg-[#1f5a44] px-[12px] py-[4px] text-[11px] font-bold text-white" style={{ fontFamily: MUL }} {...tx('View document')} />
        </div>
      </button>
      {open && <GuidelinesPreviewPopup onClose={() => setOpen(false)} />}
    </>
  )
}

/** Larger view-only popup with the full written guidelines. Read-only text — no download/print. */
function GuidelinesPreviewPopup({ onClose }: { onClose: () => void }) {
                                                                        const { tx, t } = useT()
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-[16px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[85dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#e7dfc9] px-[16px] py-[12px]">
          <p className="text-[14px] font-bold text-[#23302a]" style={{ fontFamily: MUL }} {...tx('Guidelines & Rules and Regulations')} />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="flex size-[28px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#f6f4ef]"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-[14px]"><path d="M5 5l10 10M15 5L5 15" stroke="#5a6660" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[20px] py-[18px]">
          <h3 className="text-[20px] leading-[26px] text-[#15402f]" style={{ fontFamily: 'Marcellus, serif' }} {...tx('Miqaat Guidelines & Rules and Regulations')} />
          <p className="mt-[8px] text-[13.5px] leading-[20px] text-[#5a6660]" style={{ fontFamily: MUL }} {...tx(GUIDELINES_INTRO)} />
          <ol className="mt-[16px] list-decimal space-y-[12px] ps-[20px]">
            {GUIDELINES_RULES.map((r, i) => (
              <li key={i} className="ps-[4px] text-[14px] leading-[20px] text-[#23302a]" style={{ fontFamily: MUL }} {...tx(r)} />
            ))}
          </ol>
          <div className="mt-[18px] rounded-[12px] border border-[#e7dfc9] bg-[#faf8f2] px-[14px] py-[12px]">
            <p className="text-[13.5px] leading-[20px] text-[#5a6660]" style={{ fontFamily: MUL }}>
              <strong className="font-bold text-[#23302a]" {...tx('Note:')} /> <span {...tx(GUIDELINES_NOTE)} />
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Registration Form card — editable-until-City-Selection state, admin-added new questions ────

function LockIconSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[13px] shrink-0">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="#5a6660" strokeWidth="1.8" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="#5a6660" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function EyeIconSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[15px] shrink-0">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="#15402f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="#15402f" strokeWidth="1.7" />
    </svg>
  )
}

/** The Event Details page's "Registration Form" card. Three states:
 *  1. Admin added new questions the user hasn't answered → amber "Action Required" treatment.
 *  2. Registered, city not yet confirmed → editable, with a live countdown reused from the page's
 *     own `cd` (the same ticking value other CTAs show as "registration closes in" — once the user
 *     is registered nothing else on the page still shows it, so relabelling it "time left to edit"
 *     here doesn't conflict with anything else on screen).
 *  3. City confirmed → locked, view-only. */
function RegistrationFormCard({
  m,
  flow,
  cd,
  onOpen,
}: {
  m: Miqaat
  flow: RegistrationFlow
  cd: { days: string; hours: string; min: string; sec: string }
  onOpen: () => void
}) {
     const { t, tx } = useT()
  const pendingKeys = pendingNewQuestionKeys(m, flow)
  const editable = isFormEditable(flow)
  const lastUpdated = formatFormUpdated(flow.questionnaireUpdatedAt)

  if (pendingKeys.length > 0) {
    return (
      <div className="w-full rounded-[18px] border-2 border-solid border-[#f0d9a0] bg-[#fdf6e5] p-[18px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.12)]">
        <div className="flex items-center gap-[8px]">
          <span className="size-[9px] shrink-0 rounded-full bg-[#c8911f]" />
          <p className="text-[13px] font-bold uppercase tracking-[0.6px] text-[#a9740f]" style={{ fontFamily: MUL }} {...tx('New Questions Added')} />
        </div>
        <p className="mt-[10px] text-[14px] leading-[21px] text-[#6b5119]" style={{ fontFamily: MUL, fontWeight: 700 }}>
          Complete the newly added question{pendingKeys.length > 1 ? 's' : ''} before City Selection opens.
        </p>
        <p className="mt-[4px] text-[13px] leading-[18px] text-[#8a6a1e]" style={{ fontFamily: MUL }}>
          {pendingKeys.length} question{pendingKeys.length > 1 ? 's' : ''} need{pendingKeys.length > 1 ? '' : 's'} your attention.
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-[16px] flex h-[46px] w-full items-center justify-center gap-[6px] rounded-[12px] bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] text-[15px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-opacity active:opacity-90"
          style={{ fontFamily: MUL, fontWeight: 700, color: '#5a3d0a' }}
        >
          <span className="text-[15px] leading-none">✎</span> <span {...tx('Update Form')} />
        </button>
      </div>
    )
  }

  return (
    <div className="w-full rounded-[18px] border-2 border-solid border-[#e7dfc9] bg-[#fffdf8] p-[18px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)]">
      <div className="flex items-center justify-between gap-[10px]">
        <p className="text-[14px] font-bold leading-[20px] text-[#23302a]" style={{ fontFamily: MUL }} {...tx('Registration Form')} />
        {editable ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex h-[30px] shrink-0 items-center gap-[5px] rounded-full border border-[#e7dfc9] bg-white px-[12px] transition-colors hover:border-[#c2a04e]"
          >
            <span className="text-[13px] leading-none">✎</span>
            <span className="text-[12.5px]" style={{ fontFamily: MUL, fontWeight: 700, color: '#15402f' }} {...tx('Edit')} />
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-[5px] rounded-full bg-[#f2f1ed] px-[10px] py-[3px]">
            <LockIconSmall />
            <span className="text-[11px] font-bold text-[#5a6660]" style={{ fontFamily: MUL }} {...tx('Locked')} />
          </span>
        )}
      </div>
      <p className="mt-[4px] text-[12px] leading-[17px] text-[#8a938e]" style={{ fontFamily: MUL }}>
        
        {t('Last updated:')} {lastUpdated}
      </p>

      {editable ? (
        <div className="mt-[12px] flex items-center gap-[7px] rounded-[10px] bg-[#e4f1e9] px-[12px] py-[8px]">
          <span className="size-[7px] shrink-0 rounded-full bg-[#2e7d5b]" />
          <span className="text-[12.5px] font-bold leading-[17px] text-[#2e7d5b]" style={{ fontFamily: MUL }}>
            Editable until City Selection · {cd.days}d {cd.hours}h {cd.min}{t('m left')}
          </span>
        </div>
      ) : (
        <>
          <p className="mt-[12px] text-[13px] leading-[19px] text-[#8a938e]" style={{ fontFamily: MUL }} {...tx('City Selection has opened. Your responses can no longer be changed.')} />
          <button
            type="button"
            onClick={onOpen}
            className="mt-[14px] flex h-[44px] w-full items-center justify-center gap-[6px] rounded-[12px] border border-[#e7dfc9] bg-white text-[14px] transition-colors hover:border-[#c2a04e]"
            style={{ fontFamily: MUL, fontWeight: 700, color: '#15402f' }}
          >
            <EyeIconSmall />  {t('View Responses')}
          </button>
        </>
      )}
    </div>
  )
}

type StepState = 'done' | 'current' | 'pending' | 'requested'
interface StatusStep {
  key: string
  label: string
  state: StepState
  sub: string
  /** `sub` is composed from live data (a city name, a chosen destination, an opening date)
   *  rather than being fixed UI copy — so it is rendered as-is and never looked up. Without
   *  this the coverage report would fill with data values and the UI would star a city name. */
  subIsData?: boolean
  badge?: string
  view?: () => void
}

/** Builds the Your-Status timeline for a filed-but-unapproved request: the requested stage reads
 *  "Requested" (amber), earlier stages show as done, later ones as not-yet-opened. Mirrors the normal
 *  journey timeline so the detail page shows one consistent "Your Status" card either way. */
function buildRequestStatusSteps(request: ReopenRequest, confirmedCityName: string | null, goMembers: () => void): StatusStep[] {
  const steps: StatusStep[] = []

  // Registration — "Requested" for a registration request (its "View Members" opens the same roster
  // screen the normal timeline uses); already done for a city/zone request (those events were
  // registered before the window closed).
  steps.push(
    request.stage === 'register'
      ? { key: 'reg', label: 'Registration', state: 'requested', sub: 'Requested · Pending approval', view: goMembers }
      : { key: 'reg', label: 'Registration', state: 'done', sub: 'Registered', badge: 'Done' },
  )

  // City selection
  steps.push(
    request.stage === 'city'
      ? { key: 'city', label: 'City selection', state: 'requested', sub: `Requested: ${request.choiceLabel ?? 'a city'}`, subIsData: true, badge: 'Requested' }
      : request.stage === 'zone'
        ? { key: 'city', label: 'City selection', state: 'done', sub: confirmedCityName ?? 'Allocated', subIsData: !!confirmedCityName, badge: 'Done' }
        : { key: 'city', label: 'City selection', state: 'pending', sub: 'Not yet opened' },
  )

  // Zone selection
  steps.push(
    request.stage === 'zone'
      ? { key: 'zone', label: 'Zone selection', state: 'requested', sub: `Requested: ${request.choiceLabel ?? 'a zone'}`, subIsData: true, badge: 'Requested' }
      : { key: 'zone', label: 'Zone selection', state: 'pending', sub: 'Not yet opened' },
  )

  // Raza — never issued until the request is approved and the journey completes.
  steps.push({ key: 'raza', label: 'Raza', state: 'pending', sub: 'Not issued yet' })

  return steps
}

/** Builds the Your-Status timeline steps from the user's journey state (the 5 scenarios). */
function buildStatusSteps(
  flow: ReturnType<typeof useStore.getState>['flow'],
  belongsToThisMiqaat: boolean,
  cityOpens: string,
  zoneOpens: string,
  goRoster: () => void,
  goCityAlloc: () => void,
  goZoneAlloc: () => void,
  goRaza: () => void,
  /** Local events auto-allocate city & zone — the done sub-label reads "Auto-allocated" instead
   *  of "Allocated" so the user understands they never had to pick one. */
  isLocal = false,
): StatusStep[] {
  // Journey progress (city/zone/raza) lives in a single global flow — it only applies to the
  // miqaat the user actually acted on. For any other miqaat it must read as "not started yet",
  // otherwise selecting a city on one miqaat would mark City/Zone "Done" on every other one.
  const journeyCity = belongsToThisMiqaat ? flow.confirmedCity : null
  const journeyZoneDone = belongsToThisMiqaat && flow.confirmedZone !== null
  const razaIssued = belongsToThisMiqaat && flow.razaIssued === true

  // Done stages come only from the flow that owns this miqaat. For a local event the flow's
  // confirmedCity/Zone are what its auto-allocate-on-submit sets, so "done" here still means the
  // user actually registered — nothing shows as allocated before that (or after logout).
  const cityDone = journeyCity !== null
  const zoneDone = journeyZoneDone

  // "View Members" is available ONLY for the user's latest completed stage; as the journey
  // advances it moves forward (registration → city → zone → raza) and is removed from the
  // earlier stages. Each stage still shows its done/current/pending state regardless.
  const latest: 'reg' | 'city' | 'zone' | 'raza' = razaIssued ? 'raza' : zoneDone ? 'zone' : cityDone ? 'city' : 'reg'

  const steps: StatusStep[] = []

  // Registration — always complete; View Members only while it's the latest stage.
  steps.push({
    key: 'reg',
    label: 'Registration',
    state: 'done',
    sub: 'Registered',
    badge: 'Done',
    view: latest === 'reg' ? goRoster : undefined,
  })

  // City selection
  if (cityDone) {
    steps.push({
      key: 'city',
      label: 'City selection',
      state: 'done',
      sub: isLocal ? 'Auto-allocated' : 'Allocated',
      badge: 'Done',
      view: latest === 'city' ? goCityAlloc : undefined,
    })
  } else {
    steps.push({ key: 'city', label: 'City selection', state: 'current', sub: cityOpens, subIsData: true })
  }

  // Zone selection — always shown (fourth status card)
  if (zoneDone) {
    steps.push({
      key: 'zone',
      label: 'Zone selection',
      state: 'done',
      sub: isLocal ? 'Auto-allocated' : 'Allocated',
      badge: 'Done',
      view: latest === 'zone' ? goZoneAlloc : undefined,
    })
  } else if (cityDone) {
    steps.push({ key: 'zone', label: 'Zone selection', state: 'current', sub: zoneOpens, subIsData: true })
  } else {
    steps.push({ key: 'zone', label: 'Zone selection', state: 'pending', sub: 'Not yet opened' })
  }

  // Raza
  if (razaIssued) {
    steps.push({ key: 'raza', label: 'Raza', state: 'done', sub: 'Issued', badge: 'Done', view: latest === 'raza' ? goRaza : undefined })
  } else {
    steps.push({ key: 'raza', label: 'Raza', state: 'pending', sub: 'Not issued yet' })
  }

  return steps
}

function StatusTracker({ m, pendingRequest }: { m: Miqaat; pendingRequest?: ReopenRequest }) {
  const { tx, t } = useT()
  const nav = useNavigate()
  const { id } = useParams()
  // Read THIS event's journey (active or archived) so its timeline is correct even when a different
  // event is the one currently being edited.
  const flow = useStore((s) => journeyFor(s.flow, s.registrations, id ?? ''))
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)

  // City/Zone "opens" sub-text reads from THIS event's timeline so each event shows its own dates.
  // But once the deadline has passed (and no approved bypass), the window is CLOSED — showing an
  // "opens on…" future date would be a contradiction, so the current stage reads "… closed" instead.
  const request = useStore((s) => s.reopenRequests[id ?? ''])
  const closed = m.countdownSeconds <= 0 && !request?.approved
  const cityMs = m.timeline.milestones.find((x) => x.key === 'city')
  const zoneMs = m.timeline.milestones.find((x) => x.key === 'zone')
  const cityOpens = closed ? 'City selection closed' : cityMs?.range ? `City opens ${cityMs.range.startDate} · ${cityMs.range.startTime}` : 'City selection opening soon'
  const zoneOpens = closed ? 'Zone selection closed' : zoneMs?.range ? `Opens ${zoneMs.range.startDate} · ${zoneMs.range.startTime}` : 'Zone selection opening soon'

  // The requested party opens the same "Registered members" roster screen the normal timeline's
  // "View Members" uses — activate THIS event first so the roster reads its journey (not whatever
  // was active), then navigate. The roster reflects the pending state.
  const goRequestedMembers = () => {
    setActiveMiqaat(id ?? '')
    nav(`/miqaats/${id}/roster`)
  }

  // A pending (unapproved) request drives a "Requested" timeline; otherwise the normal journey one.
  const steps = pendingRequest
    ? buildRequestStatusSteps(pendingRequest, flow.miqaatId === id ? flow.confirmedCity?.name ?? null : null, goRequestedMembers)
    : buildStatusSteps(
        flow,
        flow.miqaatId === id,
        cityOpens,
        zoneOpens,
        () => nav(`/miqaats/${id}/roster`),
        () => nav(`/miqaats/${id}/city-allocation`),
        () => nav(`/miqaats/${id}/zone-allocation`),
        () => nav(`/miqaats/${id}/raza`),
        !!m.local,
      )

  const n = steps.length
  const STEP_GAP = 63
  const cardHeight = 81 + (n - 1) * STEP_GAP
  const lineHeight = Math.max(0, (n - 1) * STEP_GAP - 42)

  return (
    <div className="relative w-full" data-tour="status-cards">
      <SectionHeading label={t('Your Status')} />
      <div
        className="relative mt-[20px] rounded-[18px] border-2 border-[#e7dfc9] bg-[#fffdf8] px-[16px] py-[16px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)]"
        style={{ height: cardHeight }}
      >
        {n > 1 && <div className="absolute start-[37px] top-[58px] w-[2px] bg-[#f8f4ea]" style={{ height: lineHeight }} />}

        {steps.map((step, i) => {
          const base = 16 + i * STEP_GAP
          const labelColor = step.state === 'pending' ? '#8a938e' : '#23302a'
          const accent = step.state === 'done' ? '#2e7d5b' : step.state === 'current' ? '#2e6a7d' : step.state === 'requested' ? '#c8911f' : null
          const isRequested = step.state === 'requested'
          return (
            <div key={step.key}>
              {/* status circle */}
              {step.state === 'done' ? (
                <div className="absolute start-[16px] size-[42px]" style={{ top: base }}>
                  <img src={CHECK_CIRCLE} alt="" className="absolute inset-0 block size-full max-w-none" />
                </div>
              ) : isRequested ? (
                <div className="absolute start-[16px] flex size-[42px] items-center justify-center rounded-[74.118px] bg-[#fbeecb]" style={{ top: base }}>
                  <svg viewBox="0 0 24 24" fill="none" className="size-[22px]">
                    <circle cx="12" cy="12" r="8" stroke="#c8911f" strokeWidth="2" />
                    <path d="M12 8v4.2l2.8 1.7" stroke="#c8911f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : (
                <div className="absolute start-[16px] size-[42px] rounded-[74.118px] bg-[#f8f4ea]" style={{ top: base }}>
                  <p className="absolute left-[calc(50%+0.62px)] top-[calc(50%-1.23px)] w-[18.529px] -translate-x-1/2 -translate-y-1/2 text-center text-[19.765px] leading-[29.647px] text-[#1f5a44]"
                    style={{ fontFamily: '"Segoe UI Symbol", system-ui, sans-serif', fontWeight: 400 }}
                  >
                    ❖
                  </p>
                </div>
              )}

              {/* label */}
              <p
                className="absolute start-[68px] -translate-y-1/2 whitespace-nowrap text-[14px] leading-[20px]"
                style={{ top: base + 10, fontFamily: MUL, fontWeight: 700, color: labelColor }}
                {...tx(step.label)}
              />

              {/* status badge — green "Done" / amber "Requested" */}
              {step.badge && (
                <div
                  className={`absolute start-[162px] flex h-[20px] items-center justify-center rounded-[50px] px-[10px] ${isRequested ? 'bg-[#fdf1dc]' : 'bg-[#e4f1e9]'}`}
                  style={{ top: base }}
                >
                  <span className={`whitespace-nowrap text-[12px] leading-[20.25px] ${isRequested ? 'text-[#a9740f]' : 'text-[#2e7d5b]'}`} style={{ fontFamily: MUL, fontWeight: 700 }} {...tx(step.badge)} />
                </div>
              )}

              {/* View button — opens the roster/"Registered members" screen for the latest stage
                  (registered journey) or the requested party (pending request). */}
              {step.view && (
                <button
                  type="button"
                  onClick={step.view}
                  className="absolute end-[16px] flex h-[26px] items-center justify-center rounded-[14px] bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] px-[12px] transition-transform active:scale-[0.97]"
                  style={{ top: base + 4 }}
                >
                  <span className="whitespace-nowrap text-center text-[12px] leading-none text-[#1f5a44]" style={{ fontFamily: MUL, fontWeight: 700 }} {...tx('View Members')} />
                </button>
              )}

              {/* sub-status */}
              <div className="absolute start-[68px] flex items-center gap-[6px]" style={{ top: base + 22 }}>
                {accent && <span className="size-[7px] shrink-0 rounded-[3.5px]" style={{ background: accent }} />}
                <span
                  className="whitespace-nowrap text-[12px] leading-[20.25px]"
                  style={{ fontFamily: MUL, fontWeight: 700, color: accent ?? '#8a938e' }}
                  {...(step.subIsData ? { children: step.sub } : tx(step.sub))}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Desktop sticky right card ────────────────────────────────────────────────

function DesktopRightCard({
  m,
  cd,
  onAction,
  actionLabel,
  statusLabel,
  countdownStage,
  onManage,
  manageInline,
}: {
  m: Miqaat
  cd: { days: string; hours: string; min: string; sec: string }
  onAction: () => void
  actionLabel: string
  statusLabel: string
  /** When set, show an "opening soon" countdown for this stage instead of the action CTA. */
  countdownStage: string | null
  /** When set, a "Modify reservation" action shows below the primary CTA (confirmed reservation). */
  onManage?: () => void
  /** Raza issued → render Modify (left link) + primary button (right) in one row instead of stacked. */
  manageInline?: boolean
}) {
  const { t, tx, td } = useT()
  const showCountdown = countdownStage !== null

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#e7dfc9] bg-[#fffdf8] shadow-[0px_22px_50px_-18px_rgba(21,64,47,0.3),0px_8px_20px_-10px_rgba(21,64,47,0.16)]">
      {/* Date / time header row */}
      <div className="flex items-center gap-[10px] border-b border-[#e7dfc9] px-[18px] py-[14px]">
        <div className="flex items-center gap-[6px]">
          <svg viewBox="0 0 18 18" fill="none" className="size-[18px] shrink-0">
            <rect x="2" y="3.5" width="14" height="12" rx="2" stroke="#8a938e" strokeWidth="1.4" />
            <path d="M2 7.5h14M6 1.5v4M12 1.5v4" stroke="#8a938e" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] text-[#23302a]" style={{ fontFamily: MUL, fontWeight: 600 }}><DateLine value={m.dateLabel} /></span>
        </div>
        <div className="mx-[2px] h-[18px] w-px bg-[#d8d0c0]" />
        <div className="flex items-center gap-[6px]">
          <svg viewBox="0 0 18 18" fill="none" className="size-[18px] shrink-0">
            <circle cx="9" cy="9" r="7" stroke="#8a938e" strokeWidth="1.4" />
            <path d="M9 5.5V9l2.5 2" stroke="#8a938e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[13px] text-[#23302a]" style={{ fontFamily: MUL, fontWeight: 600 }} {...td(m.timeLabel)} />
        </div>
      </div>

      {/* CTA body */}
      <div className="px-[18px] py-[18px]">
        {showCountdown ? (
          <>
            <p
              className="text-[11px] uppercase tracking-[1px] text-[#a8843e]"
              style={{ fontFamily: MUL, fontWeight: 700 }} {...tx('Opening Soon')} />
            <p
              className="mt-[4px] text-[16px] text-[#15402f]"
              style={{ fontFamily: MUL, fontWeight: 800 }}
            >
              <span {...tx(countdownStage ?? '')} />
            </p>
            <div className="mt-[14px] flex gap-[6px]">
              {[
                { value: cd.days, unit: t('Days') },
                { value: cd.hours, unit: t('Hours') },
                { value: cd.min, unit: t('Min') },
                { value: cd.sec, unit: t('Sec') },
              ].map((c) => (
                <div
                  key={c.unit}
                  className="flex flex-1 flex-col items-center justify-center rounded-[8px] border border-[#e7dfc9] bg-white py-[10px]"
                >
                  <p
                    className="text-[20px] leading-none text-[#1f5a44]"
                    style={{ fontFamily: MUL, fontWeight: 700 }}
                  >
                    {c.value}
                  </p>
                  <p
                    className="mt-[3px] text-[9px] uppercase tracking-[0.5px] text-[#8a938e]"
                    style={{ fontFamily: MUL, fontWeight: 600 }}
                  >
                    {c.unit}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p
              className="text-[11px] uppercase tracking-[1px] text-[#a8843e]"
              style={{ fontFamily: MUL, fontWeight: 700 }}
            >
              {m.title}
            </p>
            <p
              className="mt-[4px] text-[16px] text-[#15402f]"
              style={{ fontFamily: MUL, fontWeight: 800 }}
            >
              <span {...tx(statusLabel)} />
            </p>
            {onManage && manageInline ? (
              // Raza issued → Modify reservation (secondary link, left) + primary button (right).
              <div className="mt-[14px] flex items-center justify-between gap-[12px]">
                <button
                  type="button"
                  onClick={onManage}
                  className="shrink-0 text-[14px] font-bold text-[#5a6660] underline-offset-[3px] transition-colors hover:text-[#1f5a44] hover:underline"
                  style={{ fontFamily: MUL }} {...tx('Modify Reservation')} />
                <button
                  type="button"
                  onClick={onAction}
                  className="h-[44px] shrink-0 rounded-[12px] bg-[#1f5a44] px-[24px] text-[15px] font-bold text-white shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-colors hover:bg-[#15402f]"
                  style={{ fontFamily: MUL }}
                >
                  <span {...tx(actionLabel)} />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onAction}
                  data-tour={actionLabel === 'Register Now' ? 'register-button' : undefined}
                  className="mt-[14px] h-[44px] w-full rounded-[12px] bg-[#1f5a44] text-[15px] text-white shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)] transition-colors hover:bg-[#15402f]"
                  style={{ fontFamily: MUL, fontWeight: 700 }}
                >
                  <span {...tx(actionLabel)} />
                </button>
                {onManage && (
                  <button
                    type="button"
                    onClick={onManage}
                    className="mt-[10px] flex h-[42px] w-full items-center justify-center gap-[6px] rounded-[12px] border border-[#e7dfc9] bg-white text-[14px] text-[#5a6660] transition-colors hover:border-[#c2a04e] hover:text-[#23302a]"
                    style={{ fontFamily: MUL, fontWeight: 700 }}
                  >
                    <span className="text-[15px] leading-none">✎</span> <span {...tx('Modify Reservation')} />
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Page footer ─────────────────────────────────────────────────────────────

function PageFooter() {
                        const { tx } = useT()
  return (
    <div
      className="relative mt-[40px] overflow-hidden sm-full-bleed"
      style={{ background: 'linear-gradient(215deg, #0E2D21 0%, #15402F 50%, #1F5A44 100%)' }}
    >
      <div className="relative z-10 flex flex-col items-center px-[24px] pb-[28px] pt-[48px]">
        <div className="mb-[20px] h-[68px] w-[44px]">
          <img
            src={CREST}
            alt=""
            className="size-full object-contain brightness-0 invert opacity-90"
          />
        </div>
        <p
          className="max-w-[340px] text-center text-[18px] leading-[1.7] text-white sm:max-w-[480px] sm:text-[22px]"
          style={{ fontFamily: 'serif', direction: 'rtl' }}
        >
          وَاعْتَصِمُوا بِحَبْلِ اللَّهِ جَمِيعًا وَلَا تَفَرَّقُوا
        </p>
      </div>
      <div className="relative z-10 border-t border-[rgba(255,255,255,0.1)] px-[24px] py-[14px]">
        <p
          className="text-center text-[11px] leading-[16px] text-[rgba(255,255,255,0.45)] sm:text-[12px]"
          style={{ fontFamily: MUL }} {...tx('ITS Productions | © 2003 - 2026 IDARAT AL-TA\'REEF AL-SHAKHSI TRUST | All Rights Reserved | Terms & Conditions')} />
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MiqaatDetail() {
                                         const { t } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const m = miqaats.find((x) => x.id === id) ?? miqaats[0]
  // Ask Help — same guided chat as Home, but scoped to THIS event only (see AskHelpDock below). A
  // closed-stage CTA opens it contextual to that stage; the floater opens the category picker locked
  // to this event.
  const [askHelp, setAskHelp] = useState<AskHelpInit | null>(null)
  const { toast: helpToast, showToast: showHelpToast } = useToast()
  // A request filed via Ask Help (City/Zone Selection) now returns HERE instead of Home — surface the
  // same confirmation as a toast, then clear the router state so it doesn't re-fire on the next render.
  const location = useLocation()
  useEffect(() => {
    const st = location.state as { requestSent?: string } | null
    if (st?.requestSent) {
      showHelpToast(st.requestSent)
      nav(location.pathname, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
  const cd = useCountdown(m.countdownSeconds)
  const cells = [
    { value: cd.days, unit: 'Days' },
    { value: cd.hours, unit: 'Hours' },
    { value: cd.min, unit: 'Min' },
    { value: cd.sec, unit: 'Sec' },
  ]

  // Read THIS event's journey (active or archived) — so a registered event shows its real CTA/status
  // even when the user is mid-registration on a different event.
  const flow = useStore((s) => journeyFor(s.flow, s.registrations, m.id))
  // A pending (unapproved) request for this event → show its status here so the detail page reflects
  // "Registration requested · Pending" / "Requested: Mumbai · Pending" (not a normal registerable state).
  const request = useStore((s) => s.reopenRequests[m.id])
  const pendingRequest = request && !request.approved ? request : undefined
  // Demo Progression Controls (ashara-1448 only): when a phase override exists for this miqaat,
  // it replaces the static countdownSeconds clock for gating below; every other event falls
  // through to the original expressions untouched.
  const demoPhase = useStore((s) => s.stageOverrides[m.id])
  // Same rule as the Home card (AsharaBanner/useCard): Arrange My Cities comes before Select City,
  // and — under a Demo Progression Controls override — stays "Arrange My Cities" until the demo has
  // actually opened City Selection, so the two surfaces never disagree on the next action.
  const cityArranged = !!flow.cityArrangement
  const cityStageActuallyOpen = !demoPhase || demoPhase === 'city_open'
  // Invite Mehmaan quota spent → the card's CTA reads "View" instead of "Invite now". Only Mehmaan
  // invites (not Add People "Others" group members) count against the quota.
  const inviteQuotaFull = flow.invites.filter((i) => !i.group).length >= INVITE_QUOTA
  // At least one Mehmaan invited → the card CTA flips to "Edit".
  const mehmaanInvited = flow.invites.some((i) => !i.group)
  // Show the status tracker when the seed status is registered/city_open OR the user has actually
  // progressed a journey for THIS miqaat (e.g. a 'live' miqaat the user registered → city → zone).
  // Previously this read only m.status (the seed), so a Zone-allocated 'live' miqaat showed no status.
  const hasJourney =
    flow.miqaatId === m.id &&
    (flow.submitted || flow.confirmedCity !== null || flow.confirmedZone !== null || flow.razaIssued)
  const isRegistered = m.status === 'registered' || m.status === 'city_open' || hasJourney

  // Demo Progression Controls: a confirmed city doesn't unlock "Select zone" until the demo has
  // actually reached the zone_open phase — while still city_open/city_closed, a confirmed city
  // reads as "waiting for zone" instead (mirrors deriveStatus's `city_done_waiting_zone`).
  const zoneStageReached = !demoPhase || DEMO_PHASE_ORDER.indexOf(demoPhase) >= DEMO_PHASE_ORDER.indexOf('zone_open')
  // Journey-aware CTA — mirrors the list card's deriveStatus so the detail page and the card
  // always show the SAME next action (and never falls back to "Register Now" after registering).
  const eff =
    flow.miqaatId !== m.id ? m.status
      : flow.confirmedZone ? (flow.razaIssued ? 'raza_issued' : 'zone_done')
      : flow.confirmedCity ? (zoneStageReached ? (flow.confirmedCity.type === 'host' ? 'host_allocated' : 'relay_allocated') : 'city_done_waiting_zone')
      : flow.submitted ? 'registered_select'
      : m.status
  // City/Zone deadline has passed with no approved bypass → the stage is CLOSED, not selectable. Mirror
  // the Home card: don't offer "Select city/zone" or an "opens on…" date; point the user to Ask Help
  // (Home-only) to request it, or reflect their pending request. Independent city/zone booleans (rather
  // than one shared `stageClosed`) so a Demo Progression Controls override can close one stage while
  // the other stays open — every other event has no override and both fall back to the same expression.
  // "Closed" means the window already came and went (missed it) — NOT simply "not open yet". Under
  // a Demo Progression Controls override that's only true once the phase has moved PAST the
  // relevant *_open step (e.g. reg_open/reg_closed, before city_open, is "not yet open", not
  // "closed" — there's nothing to Ask Help about).
  const demoPhaseIdx = demoPhase ? DEMO_PHASE_ORDER.indexOf(demoPhase) : -1
  const cityStageClosed = demoPhase
    ? demoPhaseIdx > DEMO_PHASE_ORDER.indexOf('city_open')
    : (m.countdownSeconds <= 0 && !request?.approved)
  const zoneStageClosed = demoPhase
    ? demoPhaseIdx > DEMO_PHASE_ORDER.indexOf('zone_open')
    : (m.countdownSeconds <= 0 && !request?.approved)
  const cta =
    // NOTE: a pending request never overrides the banner CTA — the banner always keeps its real flow
    // CTA (+ the demo control for Ashara) so the user can still move through the flow. Tracking a
    // filed request lives in Ask Help (Track My Requests), not here. The pending status is still
    // surfaced by the StatusTracker below.
    // City Selection has ended and the user is registered (but has no confirmed city — e.g. they
    // cancelled their own city): the hero's single action is to manage the reservation. Requesting a
    // city stays available via the Ask Help floater. (A non-registered event whose city stage closed
    // keeps the direct "Ask Help" CTA below.)
    cityStageClosed && eff === 'registered_select'
      ? { label: 'Modify Reservation', status: 'City selection closed', onClick: () => nav(`/miqaats/${m.id}/manage`) }
      : cityStageClosed && eff === 'city_open'
      ? { label: 'Ask Help', status: 'City selection closed', onClick: () => setAskHelp({ category: 'city', miqaatId: m.id, returnTo: `/miqaats/${m.id}` }) }
      : zoneStageClosed && (eff === 'host_allocated' || eff === 'relay_allocated')
        ? { label: 'Ask Help', status: 'Zone selection closed', onClick: () => setAskHelp({ category: 'zone', miqaatId: m.id, returnTo: `/miqaats/${m.id}` }) }
      : eff === 'city_open' || eff === 'registered_select'
      ? (cityArranged && cityStageActuallyOpen
          ? { label: 'Select city', status: 'City selection open', onClick: () => nav(`/miqaats/${m.id}/city`) }
          : { label: 'Manage City Layout', status: 'City selection open', onClick: () => nav(`/miqaats/${m.id}/arrange`) })
      : eff === 'host_allocated' || eff === 'relay_allocated'
        ? { label: 'Select zone', status: 'Zone selection open', onClick: () => nav(`/miqaats/${m.id}/zone`) }
        : eff === 'zone_done' || eff === 'city_done_waiting_zone'
          ? { label: 'Modify Reservation', status: 'Reservation confirmed', onClick: () => nav(`/miqaats/${m.id}/manage`) }
          : eff === 'raza_issued'
            // Once the Raza is issued the journey is complete → the primary action opens the in-app
            // Raza page (never a download/new tab), with "Modify reservation" demoted to a secondary
            // link beside it.
            ? { label: 'View Raza', status: 'Reservation confirmed', onClick: () => nav(`/miqaats/${m.id}/raza-letter`) }
            : { label: 'Register Now', status: 'Registration open', onClick: () => nav(`/miqaats/${m.id}/people`) }
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  // Any CTA that continues/resumes this event's journey must make it the active one first, so the
  // next screen (Add People / City / Zone / Manage) edits THIS event and not whatever was active.
  const handleAction = () => { setActiveMiqaat(m.id); cta.onClick() }
  // Once registered the reservation can always be managed — even before a city is picked (where the
  // only action is Cancel). Surface a secondary "Modify reservation" whenever the primary CTA isn't
  // already the manage action itself (city-only state → "Select zone"; registered → "Select city").
  // Demo Progression Controls: only before registration has ever opened is there truly nothing to
  // do — hide every CTA/action then. Once registration has been demo-closed (reg_closed), the user
  // IS registered and can still Modify Reservation while waiting for city selection to open.
  const demoCtaHidden = demoPhase === 'reg_not_open'
  const showManageSecondary = !demoCtaHidden && flow.miqaatId === m.id && flow.submitted && cta.label !== 'Modify Reservation'
  const onManage = () => { setActiveMiqaat(m.id); nav(`/miqaats/${m.id}/manage`) }
  // Raza issued → lay Modify (secondary, left) + Download Raza (primary, right) out in one row.
  const manageInline = eff === 'raza_issued'

  // When the user has an actionable next step we show a CTA; otherwise we're waiting on a stage to
  // open and show an "opening soon" countdown. 'registered' = registered but city not yet open
  // (countdown to City selection); 'opens_soon' = countdown to Registration. Both desktop and mobile
  // use this single decision so they never disagree (the desktop card used to ignore 'registered'
  // and wrongly render "Register Now").
  const showActionCard = demoCtaHidden ? false : (hasJourney || m.status === 'live' || m.status === 'city_open')
  const countdownStage = showActionCard
    ? null
    : demoPhase === 'reg_closed' ? 'City selection'
    : demoPhase === 'reg_not_open' ? 'Registration'
    : (m.status === 'registered' ? 'City selection' : 'Registration')

  // Registered-state details for the hero banner (mirrors the home event card).
  const thisJourney = flow.miqaatId === m.id
  const cityAllocated = thisJourney && flow.confirmedCity !== null
  const zoneAllocated = thisJourney && flow.confirmedZone !== null
  const razaDone = thisJourney && flow.razaIssued === true
  const endsDate = m.deadlineLabel.replace(/^.*?\bin\s+/i, '').replace(' - ', ' · ')
  const endsStage =
    eff === 'city_open' || eff === 'registered_select' ? 'City'
      : eff === 'host_allocated' || eff === 'relay_allocated' || eff === 'zone_done' ? 'Zone'
      : m.status === 'registered' ? 'City' : 'Registration'
  const heroReg = isRegistered
    ? {
        razaDone,
        cityLabel: zoneAllocated ? 'City & zone' : 'City',
        cityValue: cityAllocated ? flow.confirmedCity!.name : 'Not allocated',
        cityAllocated,
        // Demo Progression Controls: the City status row has nothing real to show until city
        // selection has actually opened (reg_open/reg_closed are both "not yet") — showing "Not
        // allocated" that early reads as if the city stage already started.
        showCityStatus: cityStageActuallyOpen || cityAllocated,
      }
    : undefined
  // Demo Progression Controls: before registration opens (or after it's been demo-closed and
  // city selection hasn't opened yet), nothing is actually "closing" — say what's next instead.
  // A confirmed city while the zone stage hasn't opened yet is its own case: still city_open →
  // the city stage itself is what's closing; already city_closed → the next thing is zone opening.
  // A confirmed zone while Raza hasn't been issued yet is the zone-stage twin of the same case:
  // still zone_open → the zone stage itself is what's closing; already zone_closed → nothing left
  // to open, just waiting on the dedicated Issue Raza control.
  // Each arm names a WHOLE key. The default arm used to interpolate the stage name as well
  // (`${endsStage} ends in ${endsDate}`), which is a second, worse concatenation: it splits a
  // sentence across two dictionary lookups whose agreement no translator can check. Three
  // explicit keys cost three rows and can each be read as a sentence.
  const heroEndsText: { key: string; date?: string } =
    demoPhase === 'reg_not_open' ? { key: 'Registration opens in {date}', date: endsDate }
      : demoPhase === 'reg_open' ? { key: 'Registration ends in {date}', date: endsDate }
      : demoPhase === 'reg_closed' ? { key: 'City opens in {date}', date: endsDate }
      : eff === 'city_done_waiting_zone' ? (demoPhase === 'city_closed' ? { key: 'Zone opens in {date}', date: endsDate } : { key: 'City closes in {date}', date: endsDate })
      : eff === 'zone_done' ? (demoPhase === 'zone_closed' ? { key: 'Raza issues on {date}', date: endsDate } : { key: 'Zone closes in {date}', date: endsDate })
      // Registered but no confirmed city and City Selection has demo-closed (e.g. the registrant
      // cancelled their own city) → the city stage is over, so the next thing is the zone opening.
      : (eff === 'registered_select' || eff === 'city_open') && demoPhase === 'city_closed' ? { key: 'Zone opens in {date}', date: endsDate }
      : endsStage === 'City' ? { key: 'City ends in {date}', date: endsDate }
      : endsStage === 'Zone' ? { key: 'Zone ends in {date}', date: endsDate }
      : { key: 'Registration ends in {date}', date: endsDate }
  // Once Raza is issued there's nothing left to count down to — hide the countdown row entirely
  // instead of showing a stale "Registration/Zone ends in" line.
  const hideCountdown = eff === 'raza_issued'

  // Mobile-only bottom footer — hidden on desktop (right sidebar handles CTA there). Always just the
  // Event timeline CTA (which also lets us drop the floating Event-timeline pill — the detail page
  // kept two floating elements, Event timeline + Ask Help; now only Ask Help floats).
  // ⚠️ The footer never duplicates the hero's own action card: `Hero` always renders the SAME
  // `cta.label`/`onClick` (+ the "Modify Reservation" secondary via `onManage`) as its own primary CTA
  // for every state (`primaryLabel={demoCtaHidden ? undefined : cta.label}` above) — Register Now,
  // Select city, Ask Help, Select zone, Modify Reservation, View Raza alike — so a second copy of the
  // same button in the footer is always redundant, not just for Modify Reservation/Register Now. This
  // keeps the footer consistent across the whole registration → city → zone → Raza continuation flow
  // instead of flipping between Event-timeline-only and a duplicate CTA card as the state changes.
  const mobileFooter = <EventTimelineFooter onClick={() => nav(`/miqaats/${m.id}/timeline`)} />

  return (
    <PhoneScreen footer={<div className="sm:hidden">{mobileFooter}</div>}>
      <div className="w-full bg-white">
        <div>
          <AppBar notificationCount={3} onBellClick={() => {}} />
        </div>
        <div className="ms-[16px] mt-[12px] sm:ms-0">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/miqaats' },
              { label: t('Miqaat detail page') },
            ]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
        </div>

        {/* Hero — a rounded, inset card matching the Home banner's exact treatment (not full-bleed). */}
        <div className="mt-[12px] mx-[16px] sm:mx-0">
          <Hero
            title={m.title}
            arabicName={m.titleArabic}
            dateLabel={m.dateLabel}
            timeLabel={m.timeLabel}
            image={m.image}
            newBadge={!isRegistered}
            reg={heroReg}
            endsText={heroEndsText}
            cells={cells}
            hideCountdown={hideCountdown}
            onViewRaza={() => { setActiveMiqaat(m.id); nav(`/miqaats/${m.id}/raza-letter`) }}
            primaryLabel={demoCtaHidden ? undefined : cta.label}
            onPrimary={handleAction}
            onManage={showManageSecondary ? onManage : undefined}
            demoControl={m.id === 'ashara-1448' ? <DemoProgressionControl miqaatId={m.id} className="mt-[4px]" /> : undefined}
          />
        </div>

        {/* Official Fasal Announcement — its own card below the hero, with a real gap between them. */}
        <div className="mt-[16px] mx-[16px] sm:mx-0">
          <FasalAnnouncementCard arabic={fasalAnnouncement.arabic} hostCity={m.hostCity} relayCenters={m.relayCenters} />
        </div>

        {/* Two-column layout below hero — no items-start so right column stretches for sticky */}
        <div className="mt-[32px] sm:flex sm:gap-[32px] pb-[24px] sm:pb-[48px]">

          {/* Left content column */}
          <div className="flex flex-col gap-[32px] px-[16px] sm:px-0 sm:flex-1 sm:min-w-0">
            {/* One "Your Status" card — a pending request shows a "Requested" timeline (with the
                requested members behind View Members); otherwise the normal journey timeline. */}
            {(isRegistered || pendingRequest) && <StatusTracker m={m} pendingRequest={pendingRequest} />}
            {/* Registration Form card — the registration itself is locked once submitted; only the
                questionnaire responses stay editable, until the user's city is confirmed. Desktop
                shows this in the right sticky column instead (above Event timeline). */}
            {flow.submitted && !pendingRequest && (
              <div className="sm:hidden">
                <SectionHeading label={t('Registration Form')} />
                <div className="mt-[20px]">
                  <RegistrationFormCard m={m} flow={flow} cd={cd} onOpen={() => { setActiveMiqaat(m.id); nav(`/miqaats/${m.id}/edit-form`) }} />
                </div>
              </div>
            )}
            {/* Hide Invite Mehmaan while a request is still pending approval — the user can't invite
                guests to an event they aren't registered for yet. */}
            {!m.hideInviteMehmaan && !pendingRequest && (
              <div className="sm:hidden">
                <InviteMehmaanCard onClick={() => nav(`/miqaats/${m.id}/invite`)} full={inviteQuotaFull} invited={mehmaanInvited} />
              </div>
            )}
            {/* Araz — replaces Invite Mehmaan on this event's detail page (preferred-city submission). */}
            {m.araz && !pendingRequest && (
              <div className="sm:hidden">
                <ArazCard
                  onClick={() => { setActiveMiqaat(m.id); nav(`/miqaats/${m.id}/araz`) }}
                  remainingLabel={flow.araz ? t('Preferences submitted') : `Host ${m.araz.hostQuota} · Relay ${m.araz.relayQuota} preferences available`}
                  submitted={!!flow.araz}
                />
              </div>
            )}
            <div>
              <SectionHeading label={t('Important Notice')} />
              <div className="mt-[20px]">
                <ImportantNoticeCard />
              </div>
            </div>
            <div>
              <SectionHeading label={t('About')} />
              <div className="mt-[20px]">
                <AboutVideoCard />
              </div>
            </div>
            <div>
              <SectionHeading label={t('Documents')} />
              <div className="mt-[20px]">
                <GuidelinesCard />
              </div>
            </div>
          </div>

          {/* Right sticky column — desktop only; stretches to left col height so sticky works */}
          <div className="hidden sm:block w-[380px] shrink-0">
            <div className="sticky top-[24px] flex flex-col gap-[14px]">
              <DesktopRightCard m={m} cd={cd} onAction={handleAction} actionLabel={cta.label} statusLabel={cta.status} countdownStage={countdownStage} onManage={showManageSecondary ? onManage : undefined} manageInline={manageInline} />
              {flow.submitted && !pendingRequest && (
                <RegistrationFormCard m={m} flow={flow} cd={cd} onOpen={() => { setActiveMiqaat(m.id); nav(`/miqaats/${m.id}/edit-form`) }} />
              )}
              <EventTimelineButton onClick={() => nav(`/miqaats/${m.id}/timeline`)} />
              {!m.hideInviteMehmaan && !pendingRequest && (
                <InviteMehmaanCard onClick={() => nav(`/miqaats/${m.id}/invite`)} full={inviteQuotaFull} invited={mehmaanInvited} />
              )}
              {m.araz && !pendingRequest && (
                <ArazCard
                  onClick={() => { setActiveMiqaat(m.id); nav(`/miqaats/${m.id}/araz`) }}
                  remainingLabel={flow.araz ? t('Preferences submitted') : `Host ${m.araz.hostQuota} · Relay ${m.araz.relayQuota} preferences available`}
                  submitted={!!flow.araz}
                />
              )}
            </div>
          </div>

        </div>

        {/* Page footer */}
        <PageFooter />
      </div>

      {/* Ask Help — scoped to THIS event only (unlike Home's floater, it never offers the all-events
          picker). The only floating element now: Event timeline moved into the mobile footer. */}
      <Toast toast={helpToast} />
      <AskHelpDock
        askHelp={askHelp}
        onConsumeAskHelp={() => setAskHelp(null)}
        onToast={showHelpToast}
        scopedMiqaatId={m.id}
        returnTo={`/miqaats/${m.id}`}
        floaterClassName="fixed z-[100] end-[16px] bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] sm:bottom-[24px] sm:end-[20px]"
      />
    </PhoneScreen>
  )
}
