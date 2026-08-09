import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { headcount, useStore } from '../store'
import { useT } from '../i18n'
import { DateLine, TimeLine } from '../components/DateLine'
import AppBar from '../components/figma/AppBar'

const SUPERVISOR = '/figma/success-supervisor-account.svg'
const INFO_FILLED = '/figma/success-info-filled.svg'
const STATUS_DOT = '/figma/success-status-dot.svg'
const HEADER_ORNAMENT = '/figma/success-header-ornament.png'
const HEADER_MASK = '/figma/success-header-mask.svg'
/** The exact same deep-green gradient as the City Selection queue loader (`LOADER_BG` in
 *  CitySelection.tsx) — solid, not a translucent tint, so it reads identically to that screen. */
const LOADER_BG = 'linear-gradient(160deg,#0a2318 0%,#15402f 55%,#1f5a44 100%)'

export default function Success() {
                                    const { t, tx } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // Carried through from the Modify Reservation "Edit registration" flow so "Done" continues to the
  // Post Registration Details form still tagged as an edit (which then returns to Modify Reservation).
  const fromModify = (location.state as { fromModify?: boolean } | null)?.fromModify === true
  const flow = useStore((s) => s.flow)
  const members = headcount(flow) || 10

  // Lock the page behind the modal so it can't be scrolled while the "Registration successful" popup
  // is open (a modal should freeze its backdrop). The viewport scroller here is <html>, so overflow
  // must be locked on documentElement — body alone doesn't stop it. Restored on unmount / tap Done.
  useEffect(() => {
    const html = document.documentElement
    const prevHtml = html.style.overflow
    const prevBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => { html.style.overflow = prevHtml; document.body.style.overflow = prevBody }
  }, [])

  return (
    <>
      {/* ============ Overlay ============ */}
      {/* fixed inset-0 → a uniform full-viewport backdrop (z-40 covers the page chrome below) using
          the same deep-green loader gradient as City Selection's queue screens, solid — not a black
          scrim, and not a translucent tint of the form underneath. */}
      <div className="fixed inset-0 z-40" style={{ background: LOADER_BG }} />

      {/* ============ AppBar ============ */}
      {/* §4.11 — this was the one route in the app with no AppBar.
          It sits at z-45: ABOVE the scrim, below the card. Rendering it in normal flow, as every
          other screen does, would place it behind an opaque full-viewport backdrop, which is
          adding chrome nobody can see. Placed here it reads as the page header of a dimmed page,
          which is what it is.
          Nothing about the modal card, the ornament or the centring below is touched — this file
          carries a documented centring exemption and a 4398x4271px clipped ornament whose
          stacking is sensitive, so the change is additive and leaves every existing z-index and
          transform exactly as it was. */}
      <div className="fixed inset-x-0 top-0 z-[45]">
        <AppBar notificationCount={3} onBellClick={() => {}} />
      </div>

      {/* ============ Modal card ============ */}
      <div className="fixed left-1/2 top-1/2 z-50 h-[440px] w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-clip rounded-[30px] bg-white">
        {/* Green header */}
        <div className="absolute start-0 top-0 h-[125px] w-full overflow-clip bg-[#1d543f]">
          {/* ornament texture */}
          <div className="absolute start-[-480px] top-[-71px]">
            <div className="flex h-[4270.95px] w-[4398.656px] items-center justify-center">
              <div className="rotate-[38.31deg]">
                <div
                  className="relative h-[2698.578px] w-[3473.78px] opacity-10"
                  style={{
                    WebkitMaskImage: `url("${HEADER_MASK}")`,
                    maskImage: `url("${HEADER_MASK}")`,
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskSize: '1317.46px 785px',
                    maskSize: '1317.46px 785px',
                    WebkitMaskPosition: '1934.318px 1870.467px',
                    maskPosition: '1934.318px 1870.467px',
                  }}
                >
                  <img src={HEADER_ORNAMENT} alt="" className="absolute inset-0 block size-full max-w-none object-cover" />
                </div>
              </div>
            </div>
          </div>

          {/* supervisor icon in white circle */}
          <div className="absolute start-[154px] top-[14px] size-[50px] overflow-clip rounded-[59.524px] bg-white">
            <div className="absolute start-[10.71px] top-[10.71px] size-[28.571px]">
              <img src={SUPERVISOR} alt="" className="absolute inset-0 block size-full max-w-none" />
            </div>
          </div>

          {/* title */}
          <p
            // `left-1/2` + `-translate-x-1/2` is the CENTRING idiom and is deliberately
            // physical: it must produce the same result in both directions. Writing it as
            // `start-[50%]` makes it `right: 50%` under RTL while the translate still moves
            // left, which throws the title off-centre by its own width.
            // `whitespace-nowrap` is gone because the LSD title is longer than the card.
            className="absolute left-1/2 top-[94px] flex w-[calc(100%-28px)] -translate-x-1/2 -translate-y-1/2 flex-col justify-center text-center text-[24px] tracking-[0.2px] text-white"
            style={{ fontFamily: 'Marcellus, serif' }}
          >
            {/* `text-center` is on THIS span and not only on the <p> above, because this span
                is the block that actually lays the text out. `flex flex-col` on the parent
                blockifies its children, so the span is a full-width block box, and `tx()` puts
                `dir="rtl"` on it — which the LSD alignment reset in src/index.css then matches,
                setting `text-align: start` and overriding the centre INHERITED from the <p>.
                That reset is right to override an inherited alignment; the fix is to let this
                element ask for its own. English was unaffected either way: with no `dir`
                attribute the reset never matched, so EN centred correctly and LSD did not.

                Nothing above is touched. The <p>'s `left-1/2` + `-translate-x-1/2` is a
                DOCUMENTED centring exemption (docs/centring-exceptions.md) whose translate also
                carries this subtree's stacking context — removing it once produced 8 new OVERLAY
                findings against the clipped header ornament while every box stayed pixel-
                identical. A text-align class on a child creates no stacking context and moves
                no box. */}
            <span className="text-center leading-[32px]" {...tx('Registration successful')} />
          </p>
        </div>

        {/* Row: Registration status */}
        {/* Flex, not absolute: the label was a 122px clip box holding a 177px paragraph, so the
            English text was already 55px over and every translation was worse. A flex row with
            `min-w-0` on the label lets it take the space it needs and shrink when it cannot. */}
        <div className="absolute start-[14px] top-[141px] flex h-[48px] end-[14px] items-center justify-between gap-[12px] border-b border-solid border-[#e7dfc9] bg-white">
          <p
            className="min-w-0 flex-1 text-[14px] leading-[normal] text-[#757e78]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 500 }} {...tx('Registration status')} />
          <div className="shrink-0 rounded-[60px] bg-[#e4f1e9] px-[12px] py-[7px]">
            <div className="flex items-center gap-[4px]">
              <div className="relative size-[8px] shrink-0">
                <img src={STATUS_DOT} alt="" className="absolute inset-0 block size-full max-w-none" />
              </div>
              <p
                className="whitespace-nowrap text-[12px] tracking-[0.6px] text-[#1f5a44]"
                style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 600 }}
              >
                <span className="leading-[18px]" {...tx('Registered')} />
              </p>
            </div>
          </div>
        </div>

        {/* Row: City selection open on */}
        <div className="absolute start-[14px] top-[189px] flex h-[48px] end-[14px] items-center justify-between gap-[12px] border-b border-solid border-[#e7dfc9] bg-white">
          <p
            className="min-w-0 flex-1 text-[14px] leading-[normal] text-[#757e78]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 500 }}
          >
            {t('City selection open on')}
          </p>
          <p
            className="shrink-0 text-end text-[12px] tracking-[0.6px] text-[#23302a]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 800 }}
          >
            <span className="leading-[18px]"><DateLine value="15 June 2026" hijri={false} />{', '}<TimeLine value="09:00 AM IST" /></span>
          </p>
        </div>

        {/* Row: Members included */}
        <div className="absolute start-[14px] top-[237px] flex h-[48px] end-[14px] items-center justify-between gap-[12px] border-b border-solid border-[#e7dfc9] bg-white">
          <p
            className="min-w-0 flex-1 text-[14px] leading-[normal] text-[#757e78]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 500 }} {...tx('Members included')} />

          <p
            className="shrink-0 text-end text-[12px] tracking-[0.6px] text-[#23302a]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 800 }}
          >
            <span className="leading-[18px]">{members}</span>
          </p>
        </div>

        {/* Blue info banner */}
        {/* Flex row rather than two absolutely-positioned boxes: the text box was a fixed
            309px starting 36.74px in, which needs 346px inside a card that is 330px wide at
            390px viewport — 16px of copy clipped before translation even enters into it. */}
        <div className="absolute start-[14px] end-[14px] top-[296px] flex min-h-[52px] items-start gap-[8px] rounded-[13px] bg-[#e1eef1] px-[12px] py-[8px]">
          <img src={INFO_FILLED} alt="" className="mt-[2px] size-[16.245px] shrink-0" />
          <p
            className="min-w-0 flex-1 text-[12px] leading-[18px] text-[#8a938e]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 400 }} {...tx('You will be notified once city allocation begins. No further action is needed for now')} />
        </div>

        {/* Done button */}
        <button
          type="button"
          onClick={() => nav(`/miqaats/${id}/preferred-city`, fromModify ? { state: { fromModify: true } } : undefined)}
          className="absolute start-[14px] end-[14px] top-[375px] block h-[48px] cursor-pointer rounded-[9999px]"
          style={{ backgroundImage: 'linear-gradient(171.7241071729248deg, rgb(31, 90, 68) 0%, rgb(21, 64, 47) 100%)' }}
        >
          <div className="absolute inset-[0_0.33px_0_0] rounded-[9999px] shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.18),0px_2px_6px_0px_rgba(21,64,47,0.06)]" />
          <div className="absolute left-1/2 top-[10px] flex -translate-x-1/2 items-center">
            <p
              className="whitespace-nowrap text-center text-[16px] tracking-[0.4px] text-[#f8f4ea]"
              style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }}
            >
              <span className="leading-[24px]" {...tx('Done')} />
            </p>
          </div>
        </button>
      </div>
    </>
  )
}
