import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import StickyFooter from '../components/figma/StickyFooter'
import { cityDirectory, family, miqaats } from '../data/seed'
import { useStore, type RankedCity, type QuestionnaireAnswers } from '../store'
import { QuestionnaireSections, validateQuestionnaire } from '../components/questionnaire/QuestionnaireFields'
import { useT } from '../i18n'

const MAX_CITIES = 5
const CARD_H = 60
const CARD_GAP = 12
const STRIDE = CARD_H + CARD_GAP

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const FM: React.CSSProperties = { fontFamily: 'Marcellus, serif' }
const FMU: React.CSSProperties = { fontFamily: 'Mulish, system-ui, sans-serif' }

/* Host / Relay pill — driven by the city's real type, never its list position. */
function CityTypeTag({ type }: { type?: 'host' | 'relay' }) {
  const isHost = type === 'host'
  return (
    <span
      className="shrink-0 rounded-full px-[8px] py-[2px] text-[10px] font-bold uppercase tracking-[0.4px]"
      style={{
        fontFamily: 'Mulish, system-ui, sans-serif',
        background: isHost ? '#e4efe7' : '#e1eef1',
        color: isHost ? '#276245' : '#2e6a7d',
      }}
    >
      {isHost ? 'Host City' : 'Relay City'}
    </span>
  )
}

/* ── icons ─────────────────────────────────────────────────────── */

function InfoFilled() {
  return (
    <svg viewBox="0 0 16.245 16.245" fill="none" preserveAspectRatio="none" className="block size-full">
      <path
        d="M8.12252 1.01562C10.0075 1.01562 11.8152 1.76442 13.1481 3.09728C14.4809 4.43014 15.2297 6.23788 15.2297 8.12283C15.2297 10.0078 14.4809 11.8155 13.1481 13.1484C11.8152 14.4812 10.0075 15.23 8.12252 15.23C6.23757 15.23 4.42983 14.4812 3.09697 13.1484C1.76411 11.8155 1.01532 10.0078 1.01532 8.12283C1.01532 6.23788 1.76411 4.43014 3.09697 3.09728C4.42983 1.76442 6.23757 1.01563 8.12252 1.01562ZM9.1886 5.37831C9.71688 5.37831 10.1452 5.01343 10.1452 4.46928C10.1452 3.92514 9.71688 3.56026 9.1886 3.56026C8.66032 3.56026 8.23357 3.92514 8.23357 4.46928C8.23357 5.01343 8.66191 5.37989 9.1886 5.37989M9.37421 11.0926C9.37421 10.9847 9.41229 10.7024 9.39008 10.5405L8.55561 11.5019C8.38269 11.6828 8.16694 11.8097 8.06541 11.7764C8.01959 11.7592 7.98135 11.7264 7.95753 11.6837C7.9337 11.641 7.92583 11.5912 7.93532 11.5432L9.32503 7.14876C9.43926 6.59034 9.12673 6.08268 8.4636 6.01764C7.76557 6.01764 6.73439 6.72677 6.10775 7.62786C6.10775 7.73574 6.08713 8.00226 6.10775 8.16408L6.94222 7.2027C7.11672 7.02185 7.31661 6.89493 7.41815 6.92983C7.46755 6.94847 7.50792 6.98535 7.53094 7.03287C7.55396 7.08039 7.55788 7.13493 7.54189 7.18525L6.16169 11.559C6.00305 12.0699 6.30447 12.5712 7.03582 12.6854C8.113 12.6854 8.74916 11.9937 9.3758 11.0926H9.37421Z"
        fill="#2e6a7d"
      />
    </svg>
  )
}

function LocationPin() {
  return (
    <svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="block size-full">
      <rect width="50" height="50" rx="25" fill="#F5ECD8"/>
      <mask id="loc-mask" style={{ maskType: 'alpha' } as React.CSSProperties} maskUnits="userSpaceOnUse" x="10" y="11" width="29" height="28">
        <rect x="10.7148" y="11" width="28" height="28" fill="#D9D9D9"/>
      </mask>
      <g mask="url(#loc-mask)">
        <path d="M24.7155 36.6663C22.6544 36.6663 20.9724 36.3406 19.6697 35.6893C18.3669 35.0379 17.7155 34.1969 17.7155 33.1663C17.7155 32.7969 17.7981 32.4566 17.9634 32.1455C18.1287 31.8344 18.3766 31.5427 18.7072 31.2705C18.9794 31.0761 19.2759 30.9983 19.5967 31.0372C19.9176 31.0761 20.1752 31.2316 20.3697 31.5038C20.5641 31.7761 20.637 32.0726 20.5884 32.3934C20.5398 32.7143 20.3794 32.9719 20.1072 33.1663C20.3599 33.4775 20.9433 33.7497 21.8572 33.983C22.7711 34.2163 23.7238 34.333 24.7155 34.333C25.7072 34.333 26.6599 34.2163 27.5738 33.983C28.4877 33.7497 29.0711 33.4775 29.3238 33.1663C29.0516 32.9719 28.8912 32.7143 28.8426 32.3934C28.794 32.0726 28.8669 31.7761 29.0613 31.5038C29.2558 31.2316 29.5134 31.0761 29.8342 31.0372C30.1551 30.9983 30.4516 31.0761 30.7238 31.2705C31.0544 31.5427 31.3023 31.8344 31.4676 32.1455C31.6329 32.4566 31.7155 32.7969 31.7155 33.1663C31.7155 34.1969 31.0641 35.0379 29.7613 35.6893C28.4586 36.3406 26.7766 36.6663 24.7155 36.6663ZM24.7447 30.2497C26.6697 28.8302 28.1183 27.4059 29.0905 25.9768C30.0627 24.5476 30.5488 23.1136 30.5488 21.6747C30.5488 19.6913 29.9169 18.1941 28.653 17.183C27.3891 16.1719 26.0766 15.6663 24.7155 15.6663C23.3544 15.6663 22.0419 16.1719 20.778 17.183C19.5141 18.1941 18.8822 19.6913 18.8822 21.6747C18.8822 22.9775 19.3586 24.3337 20.3113 25.7434C21.2641 27.1531 22.7419 28.6552 24.7447 30.2497ZM24.0155 32.4955C23.7822 32.4177 23.5683 32.3011 23.3738 32.1455C21.0794 30.3177 19.3683 28.5337 18.2405 26.7934C17.1127 25.0531 16.5488 23.3469 16.5488 21.6747C16.5488 20.2941 16.7967 19.0837 17.2926 18.0434C17.7884 17.0031 18.4252 16.133 19.203 15.433C19.9808 14.733 20.8558 14.208 21.828 13.858C22.8002 13.508 23.7627 13.333 24.7155 13.333C25.6683 13.333 26.6308 13.508 27.603 13.858C28.5752 14.208 29.4502 14.733 30.228 15.433C31.0058 16.133 31.6426 17.0031 32.1384 18.0434C32.6342 19.0837 32.8822 20.2941 32.8822 21.6747C32.8822 23.3469 32.3183 25.0531 31.1905 26.7934C30.0627 28.5337 28.3516 30.3177 26.0572 32.1455C25.8627 32.3011 25.6488 32.4177 25.4155 32.4955C25.1822 32.5733 24.9488 32.6122 24.7155 32.6122C24.4822 32.6122 24.2488 32.5733 24.0155 32.4955ZM24.7155 23.833C25.3572 23.833 25.9065 23.6045 26.3634 23.1476C26.8204 22.6906 27.0488 22.1413 27.0488 21.4997C27.0488 20.858 26.8204 20.3087 26.3634 19.8518C25.9065 19.3948 25.3572 19.1663 24.7155 19.1663C24.0738 19.1663 23.5245 19.3948 23.0676 19.8518C22.6106 20.3087 22.3822 20.858 22.3822 21.4997C22.3822 22.1413 22.6106 22.6906 23.0676 23.1476C23.5245 23.6045 24.0738 23.833 24.7155 23.833Z" fill="#1F5A44"/>
      </g>
    </svg>
  )
}

function ArrowForward() {
  return (
    <svg viewBox="0 0 12 12" fill="none" preserveAspectRatio="none" className="block size-full">
      <path
        d="M8.08752 6.49999H2.50002C2.35835 6.49999 2.2396 6.45207 2.14377 6.35624C2.04793 6.2604 2.00002 6.14165 2.00002 5.99999C2.00002 5.85832 2.04793 5.73957 2.14377 5.64374C2.2396 5.5479 2.35835 5.49999 2.50002 5.49999H8.08752L5.63752 3.04999C5.53752 2.94999 5.4896 2.83332 5.49377 2.69999C5.49793 2.56665 5.55002 2.44999 5.65002 2.34999C5.75002 2.25832 5.86668 2.2104 6.00002 2.20624C6.13335 2.20207 6.25002 2.24999 6.35002 2.34999L9.65002 5.64999C9.70002 5.69999 9.73543 5.75415 9.75627 5.81249C9.7771 5.87082 9.78752 5.93332 9.78752 5.99999C9.78752 6.06665 9.7771 6.12915 9.75627 6.18749C9.73543 6.24582 9.70002 6.29999 9.65002 6.34999L6.35002 9.64999C6.25835 9.74165 6.14377 9.78749 6.00627 9.78749C5.86877 9.78749 5.75002 9.74165 5.65002 9.64999C5.55002 9.54999 5.50002 9.43124 5.50002 9.29374C5.50002 9.15624 5.55002 9.03749 5.65002 8.93749L8.08752 6.49999Z"
        fill="#0c3d22"
      />
    </svg>
  )
}

/* 6-dot grip icon — 2 columns × 3 rows */
function DragHandle({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 8 14" fill="none" aria-hidden="true" className="block size-full">
      <circle cx="2" cy="2"  r="1.5" fill={active ? '#1f5a44' : 'currentColor'} />
      <circle cx="6" cy="2"  r="1.5" fill={active ? '#1f5a44' : 'currentColor'} />
      <circle cx="2" cy="7"  r="1.5" fill={active ? '#1f5a44' : 'currentColor'} />
      <circle cx="6" cy="7"  r="1.5" fill={active ? '#1f5a44' : 'currentColor'} />
      <circle cx="2" cy="12" r="1.5" fill={active ? '#1f5a44' : 'currentColor'} />
      <circle cx="6" cy="12" r="1.5" fill={active ? '#1f5a44' : 'currentColor'} />
    </svg>
  )
}

/* ── drag state ─────────────────────────────────────────────────── */

type DS = {
  idx: number       // card being dragged
  over: number      // insertion point 0..n
  ghostTop: number  // fixed CSS top for ghost
  cardLeft: number  // fixed CSS left for ghost
  cardWidth: number
  offsetY: number   // pointer Y within the card when grab started
}

/* ── ranked, drag-to-reorder city list ───────────────────────────
   Self-contained so it can be rendered in BOTH the mobile and desktop
   trees without sharing refs (each instance owns its own drag state). */
function RankList({ cities, onReorder, onRemove }: {
  cities: RankedCity[]
  onReorder: (from: number, to: number) => void
  onRemove: (id: string) => void
}) {
     const { t } = useT()
  const dsRef = useRef<DS | null>(null)
  const [ds, setDSRaw] = useState<DS | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const setDS = (s: DS | null) => { dsRef.current = s; setDSRaw(s) }

  const onHandleDown = (e: React.PointerEvent, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    const card = (e.currentTarget as HTMLElement).closest('[data-city-card]') as HTMLElement
    const list = listRef.current
    if (!card || !list) return
    const cr = card.getBoundingClientRect()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDS({ idx, over: idx, ghostTop: cr.top, cardLeft: cr.left, cardWidth: cr.width, offsetY: e.clientY - cr.top })
  }

  const onHandleMove = (e: React.PointerEvent) => {
    const s = dsRef.current
    if (!s || !listRef.current) return
    const lr = listRef.current.getBoundingClientRect()
    const relY = e.clientY - lr.top
    let over = 0
    const n = cities.length
    for (let i = 0; i < n; i++) {
      if (relY > i * STRIDE + CARD_H / 2) over = i + 1
    }
    over = Math.max(0, Math.min(over, n))
    setDS({ ...s, over, ghostTop: e.clientY - s.offsetY })
  }

  const onHandleUp = () => {
    const s = dsRef.current
    if (!s) return
    const target = s.over > s.idx ? s.over - 1 : s.over
    if (target !== s.idx) onReorder(s.idx, target)
    setDS(null)
  }

  const getTransY = (i: number): number => {
    if (!ds) return 0
    const { idx, over } = ds
    if (i === idx) return 0
    if (idx < over && i > idx && i < over) return -STRIDE
    if (idx > over && i >= over && i < idx) return STRIDE
    return 0
  }

  const insertPos = ds ? (ds.over > ds.idx ? ds.over - 1 : ds.over) : -1

  const getLiveRank = (i: number): number => {
    if (!ds) return i + 1
    const { idx, over } = ds
    if (i === idx) return insertPos + 1
    if (idx < over && i > idx && i < over) return i
    if (idx > over && i >= over && i < idx) return i + 2
    return i + 1
  }

  return (
    <>
      <div ref={listRef} className="relative flex w-full flex-col gap-[12px]">
        {cities.map((c, i) => {
          const isDragging = ds?.idx === i
          const liveRank = getLiveRank(i)
          return (
            <div
              key={c.id}
              data-city-card={i}
              className={`relative h-[60px] select-none overflow-hidden rounded-[12px] border border-solid will-change-transform ${
                isDragging ? 'border-dashed border-[#a8843e] bg-[#fffdf8] opacity-25' : 'border-[#e7dfc9] bg-[#fffdf8]'
              }`}
              style={{
                transform: isDragging ? 'scale(0.97)' : `translateY(${getTransY(i)}px)`,
                transition: isDragging ? 'opacity 120ms ease, transform 120ms ease' : 'transform 200ms cubic-bezier(0.2,0,0,1)',
                boxShadow: isDragging ? 'none' : undefined,
              }}
            >
              <div className="pointer-events-none absolute inset-0 flex items-center gap-[13px] ps-[14px] pe-[77px]">
                <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44] transition-transform duration-200">
                  <span className="text-[15px] font-extrabold leading-none text-white" style={FMU}>{liveRank}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[8px]">
                    <div className="text-[11px] font-bold uppercase leading-[15px] tracking-[1px] text-[#a8843e] transition-all duration-200" style={FMU}>
                      {ordinal(liveRank)} choice
                    </div>
                    <CityTypeTag type={c.type} />
                  </div>
                  <div className="truncate text-[17px] leading-[24px] tracking-[0.2px] text-[#15402f]" style={FM}>
                    {c.name}, {c.region}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemove(c.id)}
                aria-label={t('Remove city')}
                className="absolute end-[43px] top-1/2 flex size-[28px] -translate-y-1/2 items-center justify-center rounded-full text-[#b0bbb6] transition-colors hover:bg-[#fde8e8] hover:text-[#b23b3b]"
              >
                <svg viewBox="0 0 14 14" fill="none" className="size-[12px]">
                  <path d="M13 1L1 13M1 1l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>

              <div
                className="absolute end-[-5px] top-1/2 flex size-[38px] -translate-y-1/2 touch-none select-none items-center justify-center rounded-full transition-colors hover:bg-[#ede5c8]"
                style={{ background: isDragging ? '#d4eddf' : '#FBF1D8', cursor: isDragging ? 'grabbing' : 'grab' }}
                onPointerDown={(e) => onHandleDown(e, i)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                <span className="block size-[12px] -translate-x-[3px]" style={{ color: isDragging ? '#1f5a44' : '#b0943a' }}>
                  <DragHandle active={isDragging} />
                </span>
              </div>
            </div>
          )
        })}

        {ds && insertPos >= 0 && (
          <div className="pointer-events-none absolute start-0 end-0 z-20 flex items-center gap-[5px] px-[3px]" style={{ top: insertPos * STRIDE - 6 }}>
            <div className="size-[7px] shrink-0 rounded-full bg-[#1f5a44] shadow-[0_0_0_2px_rgba(31,90,68,0.2)]" />
            <div className="h-[2px] flex-1 rounded-full bg-[#1f5a44] opacity-80" />
            <div className="size-[7px] shrink-0 rounded-full bg-[#1f5a44] shadow-[0_0_0_2px_rgba(31,90,68,0.2)]" />
          </div>
        )}
      </div>

      {ds && cities[ds.idx] && (
        <div
          className="pointer-events-none fixed z-[9999] overflow-hidden rounded-[12px] border border-[#a8843e] bg-[#fffdf8]"
          style={{
            top: ds.ghostTop, left: ds.cardLeft, width: ds.cardWidth, height: CARD_H,
            transform: 'rotate(1.5deg) scale(1.04)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.16), 0 6px 20px rgba(0,0,0,0.1)', opacity: 0.96,
          }}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center gap-[13px] ps-[14px] pe-[77px]">
            <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#1f5a44]">
              <span className="text-[15px] font-extrabold leading-none text-white" style={FMU}>{ds.idx + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[8px]">
                <div className="text-[11px] font-bold uppercase leading-[15px] tracking-[1px] text-[#a8843e]" style={FMU}>
                  {ordinal(ds.idx + 1)} choice
                </div>
                <CityTypeTag type={cities[ds.idx].type} />
              </div>
              <div className="truncate text-[17px] leading-[24px] tracking-[0.2px] text-[#15402f]" style={FM}>
                {cities[ds.idx].name}, {cities[ds.idx].region}
              </div>
            </div>
          </div>
          <div className="absolute end-[-5px] top-1/2 flex size-[38px] -translate-y-1/2 items-center justify-center rounded-full" style={{ background: '#d4eddf' }}>
            <span className="block size-[12px] -translate-x-[3px] text-[#1f5a44]"><DragHandle active /></span>
          </div>
        </div>
      )}
    </>
  )
}

/* ── searchable city dropdown (Add button lives INSIDE each result row) ───
   Mirrors the AddPeople / Invite-Mehmaan search: the CTA sits on the result
   itself, so tapping "Add" on a row commits that city directly (no separate
   select-then-Add step, no standalone button beside the input). */
function CitySearch({
  q, onQuery, suggestions, onAddCity, atMax, showDropdown, setShowDropdown, variant,
}: {
  q: string
  onQuery: (v: string) => void
  suggestions: typeof cityDirectory
  onAddCity: (c: (typeof cityDirectory)[number]) => void
  atMax: boolean
  showDropdown: boolean
  setShowDropdown: (v: boolean) => void
  variant: 'mobile' | 'desktop'
}) {
     const { tx, td } = useT()
  const isDesktop = variant === 'desktop'
  return (
    <div className="relative">
      <div data-tour="preferred-search" className={`h-[48px] overflow-clip rounded-[12px] border border-solid transition-all duration-200 ${isDesktop ? 'focus-within:border-[#1f5a44] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#1f5a44]/12' : ''} border-[#e7dfc9] bg-[#fbfbfb]`}>
        <input
          value={q}
          onChange={(e) => { onQuery(e.target.value); setShowDropdown(true) }}
          onFocus={() => setShowDropdown(true)}
          onClick={(e) => { e.stopPropagation(); setShowDropdown(true) }}
          placeholder={isDesktop ? 'Search cities' : 'Search a city to add'}
          className="h-full w-full bg-transparent ps-[11px] pe-[8px] text-[16px] font-normal leading-normal text-[#15402f] placeholder:text-[#757575] focus:outline-none"
          style={FMU}
        />
      </div>
      {showDropdown && suggestions.length > 0 && (
        <div
          data-tour="preferred-dropdown"
          className="absolute start-0 end-0 top-[52px] z-50 max-h-[300px] overflow-y-auto rounded-[12px] border border-solid border-[#e7dfc9] bg-[#fffdf8] shadow-[0px_8px_24px_-4px_rgba(21,64,47,0.14)]"
          onClick={(e) => e.stopPropagation()}
        >
          {suggestions.map((city) => {
            return (
              <div
                key={city.id}
                className="flex w-full items-center gap-[10px] border-b border-solid border-[#f0e9d8] px-[14px] py-[10px] text-start transition-colors last:border-b-0 hover:bg-[#f5ecd8]"
              >
                {/* Badge on top, full city name + region below — so the city name is never clipped */}
                <span className="flex min-w-0 flex-1 flex-col items-start gap-[4px]">
                  <CityTypeTag type={city.type} />
                  <span className="truncate text-[16px] font-bold leading-[20px] text-[#15402f]" style={FMU} {...td(city.name)} />
                  <span className="truncate text-[12px] font-normal leading-[16px] text-[#8a938e]" style={FMU} {...td(city.region)} />
                </span>
                <button
                  type="button"
                  disabled={atMax}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onAddCity(city)}
                  className={`relative ms-auto h-[36px] shrink-0 rounded-[10px] bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] px-[18px] transition-all duration-200 ${atMax ? 'cursor-not-allowed opacity-50' : 'hover:from-[#e7d3a2] hover:to-[#cfab65] active:scale-[0.97]'}`}
                >
                  <span className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)]" />
                  <span className="relative whitespace-nowrap text-center text-[14px] font-bold leading-[24px] text-[#194a37]" style={FMU} {...tx('Add')} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── info banner ─────────────────────────────────────────────────── */
function InfoBanner() {
  const { tx } = useT()
  return (
    <div className="overflow-clip rounded-[14px] bg-[#e1eef1] px-[16px] py-[12px]">
      <div className="flex items-start gap-[10px]">
        <span className="mt-[2px] block size-[18px] shrink-0"><InfoFilled /></span>
        <div className="flex flex-col gap-[2px]">
          <p className="text-[15px] font-bold leading-[20px] text-[#23302a]" style={FMU} {...tx('Allocation depends on availability')} />
          <p className="text-[13px] font-normal leading-[18px] text-[#8a938e]" style={FMU} {...tx('We\'ll try to assign your highest available preference.')} />
        </div>
      </div>
    </div>
  )
}

/* ── component ──────────────────────────────────────────────────── */

export default function PreferredCity({ backdrop = false }: { backdrop?: boolean } = {}) {
  const { tx } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // Carried through from the Modify Reservation "Edit registration" flow: on submit this form returns
  // to Modify Reservation (with a success popup) instead of continuing into the fresh-registration roster.
  const fromModify = (location.state as { fromModify?: boolean } | null)?.fromModify === true
  const flow = useStore((s) => s.flow)
  const { addCity, removeCity, reorderCity } = useStore()
  const setQuestionnaire = useStore((s) => s.setQuestionnaire)
  const [q, setQ] = useState('')
  // Open the city-search dropdown as soon as the screen is entered, so the full pickable list is
  // visible up front (and the walkthrough's "dropdown" step has something to point at). When this
  // screen is rendered only as the dimmed backdrop behind the Success modal (`backdrop`), keep it
  // closed — an open dropdown poking out from behind the modal reads as a glitch.
  const [showDropdown, setShowDropdown] = useState(!backdrop)
  // Set once Confirm has been pressed and the questionnaire failed validation — from then on every
  // still-empty required field shows its own red border/error text, clearing itself as each is answered.
  const [showQErrors, setShowQErrors] = useState(false)

  // ── inline "Other Details" questionnaire (same as the Add People variation) ──
  const registrant = family.find((f) => f.role === 'registrant') ?? family[0]
  const setQuestionnaireField = (patch: Partial<QuestionnaireAnswers>) => setQuestionnaire(patch)
  const [err, setErr] = useState<string | null>(null)
  const errTimer = useRef<number | undefined>(undefined)
  const showErr = (m: string) => {
    window.clearTimeout(errTimer.current)
    setErr(m)
    errTimer.current = window.setTimeout(() => setErr(null), 5000)
  }
  const renderOtherDetails = (idPrefix: string) => (
    <>
      <div className="mb-[24px] h-px w-full bg-[#e7dfc9]" />
      <h2 className="text-[22px] leading-[28px] tracking-[0.2px] text-[#15402f] sm:text-[28px]" style={FM} {...tx('Other Details')} />
      <p className="mt-[6px] text-[14px] leading-[20px] text-[#5a6660]" style={FMU} {...tx('Share your requirements so we can make your Miqaat journey comfortable, safe, and well organized.')} />
      <div className="mt-[20px]">
        <QuestionnaireSections q={flow.questionnaire} onChange={setQuestionnaireField} registrant={registrant} idPrefix={idPrefix} hideIntro miqaatId={id} showErrors={showQErrors} />
      </div>
    </>
  )

  // All not-yet-chosen cities; filtered live by the query. Empty query → full list
  // (so clicking the desktop search opens the whole pickable list, per the design).
  const suggestions = useMemo(() => {
    const term = q.trim().toLowerCase()
    const chosen = new Set(flow.cities.map((c) => c.id))
    const available = cityDirectory.filter((c) => !chosen.has(c.id))
    if (!term) return available
    return available.filter((c) => `${c.name} ${c.region}`.toLowerCase().includes(term))
  }, [q, flow.cities])

  const atMax = flow.cities.length >= MAX_CITIES

  // Add straight from the result row's own "Add" button. The dropdown stays
  // open so several cities can be added in a row — each added city drops out
  // of `suggestions` automatically (it's now in `flow.cities`).
  const addCityDirect = (city: (typeof cityDirectory)[number]) => {
    if (flow.cities.length >= MAX_CITIES) return
    addCity(city)
  }

  const onQuery = (v: string) => setQ(v)

  const cities = flow.cities
  const empty = cities.length === 0

  // Where the Post Registration Details form goes once submitted. The Modify Reservation edit flow
  // lands back on that screen with a one-shot success popup; a fresh registration continues to the roster.
  const goRoster = () => nav(fromModify ? `/miqaats/${id}/manage` : `/miqaats/${id}/roster`, fromModify ? { state: { registrationEdited: true } } : undefined)

  // Per-event: some events (e.g. Ashara Mubaraka 1448H) collect the Other Details form here but take
  // no preferred-city ranking — the whole city-selection section is hidden and the form is shown
  // full-screen on its own. Validate the questionnaire only (no city requirement).
  const miqaat = miqaats.find((m) => m.id === id)
  const formOnly = !!miqaat?.preferredCityFormOnly
  const handleConfirmFormOnly = () => {
    const problem = validateQuestionnaire(flow.questionnaire, 'pc-', true)
    if (problem) {
      setShowQErrors(true)
      showErr(problem.message)
      document.getElementById(problem.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    goRoster()
  }

  // Confirm requires the inline "Other Details" questionnaire; on a gap, scroll the visible
  // instance into view (intro sections are hidden here, so skip them in validation).
  const handleConfirm = () => {
    if (cities.length === 0) {
      showErr('Please select your preferred city.')
      return
    }
    const qPrefix = window.matchMedia('(min-width: 640px)').matches ? 'pc-' : 'pcm-'
    const problem = validateQuestionnaire(flow.questionnaire, qPrefix, true)
    if (problem) {
      setShowQErrors(true)
      showErr(problem.message)
      document.getElementById(problem.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    goRoster()
  }

  /* ── footer (mobile only — desktop has the footer inside the panel) ── */
  const footer = !empty ? (
    <div className="sm:hidden">
      <StickyFooter
        caption={`${cities.length} cities selected`}
        title={`1st choice ${cities[0]?.name ?? ''}`}
        button="Confirm"
        onButton={handleConfirm}
      />
    </div>
  ) : undefined

  /* ── render ──────────────────────────────────────────────────── */

  // Form-only events (e.g. Ashara): no city section — the Other Details form fills the width as an
  // "application form". The whole page scrolls normally (no inner scroll box); the CTAs (Skip +
  // Continue) are a sticky footer (PhoneScreen's `footer` prop pins it via `sticky bottom-0`) so
  // they're always on screen without scrolling to the end of the form. Section cards stack full-width.
  if (formOnly) {
    const formOnlyFooter = (
      <div className="sticky-cta w-full px-[16px] py-3 sm:px-[var(--content-px)] sm:pt-6 sm:pb-4">
        <div className="flex items-center gap-[12px] sm:justify-end">
          <button
            type="button"
            onClick={() => nav(fromModify ? `/miqaats/${id}/manage` : '/miqaats')}
            className="inline-flex h-[48px] shrink-0 items-center justify-center rounded-[12px] border border-[#e7dfc9] bg-white px-[20px] text-[15px] font-bold text-[#5a6660] shadow-[0_6px_22px_-8px_rgba(21,64,47,0.12)] transition-colors hover:bg-[#faf8f2]"
            style={FMU} {...tx('Skip')} />
          <button
            type="button"
            onClick={handleConfirmFormOnly}
            className="flex h-[48px] flex-1 items-center justify-center rounded-[12px] bg-[#1f5a44] px-[32px] text-[15px] font-bold text-white shadow-[0_6px_22px_-8px_rgba(21,64,47,0.18)] transition-colors hover:bg-[#194a38] sm:flex-none"
            style={FMU}
          >
            {fromModify ? 'Submit' : 'Continue'}
          </button>
        </div>
      </div>
    )
    return (
      <PhoneScreen statusTone="dark" footer={formOnlyFooter}>
        <div>
          <AppBar notificationCount={3} onBellClick={() => {}} />
        </div>

        <div className="px-[16px] pb-[24px] pt-[13px] sm:px-0 sm:pt-6">
          <Breadcrumb
            items={[{ label: 'Home', to: '/miqaats' }, { label: 'Post Registration Details' }]}
            onNavigate={(to) => nav(to)}
            onBack={() => nav(-1)}
          />
          <h2 className="mt-[22px] text-[22px] leading-[28px] tracking-[0.2px] text-[#15402f] sm:text-[26px]" style={FM} {...tx('Post Registration Details')} />
          <p className="mt-[10px] pe-[90px] text-[14px] leading-[20px] text-[#5a6660] sm:pr-0" style={FMU} {...tx('Share your requirements so we can make your Miqaat journey comfortable, safe, and well organized.')} />

          {/* full-width stacked section cards (application-form layout) */}
          <div className="mt-[18px]">
            <QuestionnaireSections q={flow.questionnaire} onChange={setQuestionnaireField} registrant={registrant} idPrefix="pc-" hideIntro miqaatId={id} showErrors={showQErrors} grid />
          </div>
        </div>

        {/* validation error toast (same as the standard screen) */}
        {err && (
          <div className="fixed bottom-[24px] start-[16px] end-[16px] z-50 animate-[noticeIn_320ms_ease-out] sm:left-auto sm:right-[var(--content-px)] sm:w-[380px]">
            <div className="flex items-start gap-[10px] rounded-[14px] bg-[#c53030] px-[14px] py-[12px] shadow-[0_8px_24px_-8px_rgba(165,42,42,0.35)]">
              <svg viewBox="0 0 24 24" className="mt-[1px] size-[16px] shrink-0" fill="none">
                <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.2)" />
                <rect x="11" y="6.5" width="2" height="8" rx="1" fill="#fff" />
                <circle cx="12" cy="17" r="1.2" fill="#fff" />
              </svg>
              <p className="text-[13px] leading-[18px] text-white" style={{ ...FMU, fontWeight: 500 }}>{err}</p>
            </div>
          </div>
        )}
      </PhoneScreen>
    )
  }

  return (
    <PhoneScreen statusTone="dark" footer={footer}>
      {/* AppBar (shared) */}
      <div>
        <AppBar notificationCount={3} onBellClick={() => {}} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE — unchanged single-column flow.
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="contents sm:hidden">
        <div className="px-[16px] pb-[24px]" onClick={() => setShowDropdown(false)}>
          {/* Nav row */}
          <div className="mt-[12px] flex items-center justify-between">
            <button type="button" onClick={() => nav(-1)} className="group flex cursor-pointer items-center gap-[6px] text-[#5a6660] transition-colors hover:text-[#15402f]">
              <svg viewBox="0 0 24 24" className="size-[16px] shrink-0 transition-transform duration-200 group-hover:-translate-x-[2px]" fill="none" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="whitespace-nowrap text-[14px] font-semibold leading-[1.5]" style={FMU} {...tx('Go back')} />
            </button>
            <button type="button" onClick={() => nav('/miqaats')}
              className="flex h-[24px] w-[66px] cursor-pointer items-center justify-center gap-[4px] rounded-[12px] border border-solid border-[rgba(12,61,34,0.2)] bg-[#fffdf8]">
              <span className="text-[12px] leading-[16px] text-[#0c3d22]" style={{ ...FMU, fontWeight: 600 }} {...tx('Skip')} />
              <span className="block size-[12px]"><ArrowForward /></span>
            </button>
          </div>

          {/* Title */}
          <div className="mt-[12px] text-[20px] not-italic tracking-[0.2px] text-[#15402f]" style={FM}>
            <p className="leading-[24px]" {...tx('Select Your Preferred Cities')} />
          </div>

          {/* Info banner */}
          <div className="mt-[12px]"><InfoBanner /></div>

          {/* Search + Add */}
          <div className="mt-[16px]">
            <CitySearch
              q={q} onQuery={onQuery} suggestions={suggestions} onAddCity={addCityDirect} atMax={atMax}
              showDropdown={showDropdown} setShowDropdown={setShowDropdown} variant="mobile"
            />
          </div>

          {/* "Your city choices" header */}
          <div className="mt-[16px] flex items-center justify-between">
            <p className="whitespace-nowrap text-[16px] font-bold leading-[18px] tracking-[2.5px] text-[#a8843e]" style={FMU} {...tx('Your city choices')} />
            <p className="whitespace-nowrap text-[14px] font-bold leading-[18px] tracking-[2.5px] text-[#8a938e]" style={FMU}>{cities.length} / {MAX_CITIES} cities</p>
          </div>

          {/* Ranking hint */}
          {!empty && cities.length >= 2 && (
            <div className="mt-[8px] flex items-center gap-[6px]">
              <span className="block size-[12px] text-[#b0943a]"><DragHandle /></span>
              <p className="text-[12px] leading-[16px] text-[#8a938e]" style={FMU} {...tx('Drag the handle to reorder — your highest available choice is honored first.')} />
            </div>
          )}

          {/* City list / empty state */}
          {empty ? (
            <div className="mt-[12px] flex flex-col items-center gap-[16px] overflow-clip rounded-[12px] border-2 border-dashed border-[#e7dfc9] bg-[#fffdf8] px-[24px] py-[32px] text-center">
              <div className="size-[50px]"><LocationPin /></div>
              <div className="text-center text-[20px] font-normal tracking-[0.2px] text-[#15402f]" style={FM}>
                <p className="leading-[28px]" {...tx('No cities added yet')} />
              </div>
              <p className="max-w-[300px] text-center text-[14px] font-normal leading-[18px] text-[#5a6660]" style={FMU} {...tx('Add the cities you\'d prefer to attend in. You can rank them after adding — your highest available choice is honored first.')} />
            </div>
          ) : (
            <div className="mt-[12px]">
              <RankList cities={cities} onReorder={reorderCity} onRemove={removeCity} />
            </div>
          )}

          {/* Other Details questionnaire (mobile) */}
          <div className="mt-[24px]">
            {renderOtherDetails('pcm-')}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP — two-panel layout (cream sidebar + white choices panel).
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden sm:block sm-full-bleed">
        <div className="flex h-[calc(100dvh-60px)] items-stretch overflow-hidden" onClick={() => setShowDropdown(false)}>

          {/* ───────── LEFT sidebar ───────── */}
          <aside className="flex w-[37%] max-w-[580px] shrink-0 flex-col gap-[24px] border-r border-[#e7ddc6] bg-[#f1ede3] py-[24px] ps-[var(--content-px)] pe-[28px]">

            {/* breadcrumb header — Go back merged in as the leading item */}
            <Breadcrumb
              items={[
                { label: 'Home', to: '/miqaats' },
                { label: 'Preferred city' },
              ]}
              onNavigate={(to) => nav(to)}
              onBack={() => nav(-1)}
              activeColor="#a8843e"
              dense
            />

            {/* Select Your Preferred Cities card */}
            <div className="rounded-[16px] border border-[#e7dfc9] bg-white p-[20px] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]">
              <p className="text-[22px] leading-[26px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('Select Your Preferred Cities')} />
              <div className="mt-[16px]">
                <CitySearch
                  q={q} onQuery={onQuery} suggestions={suggestions} onAddCity={addCityDirect} atMax={atMax}
                  showDropdown={showDropdown} setShowDropdown={setShowDropdown} variant="desktop"
                />
              </div>
            </div>
          </aside>

          {/* ───────── RIGHT choices panel ───────── */}
          <section className="flex h-[calc(100dvh-60px)] min-w-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto pt-[24px] pb-[36px] ps-[28px] pe-[var(--content-px)]">

              {/* Info banner */}
              <InfoBanner />

              {/* "Your city choices" header — Skip lives in the floating CTA below on web */}
              <div className="mt-[24px] flex items-baseline gap-[12px]">
                <p className="text-[16px] font-bold uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]" style={FMU} {...tx('Your city choices')} />
                <p className="text-[16px] font-bold leading-[18px] text-[#15402f]" style={FMU}>{cities.length}/{MAX_CITIES} cities</p>
              </div>

              {/* Ranking hint */}
              {!empty && cities.length >= 2 && (
                <div className="mt-[12px] flex items-center gap-[8px]">
                  <span className="block size-[14px] text-[#b0943a]"><DragHandle /></span>
                  <p className="text-[14px] leading-[18px] tracking-[1px] text-[#8a938e]" style={FMU} {...tx('Drag the handle to reorder — your highest available choice is honored first.')} />
                </div>
              )}

              {/* City list / empty state */}
              {empty ? (
                <div className="mt-[20px] flex flex-col items-center gap-[18px] rounded-[16px] border-2 border-dashed border-[#dcd3bd] bg-[#fdfbf5] px-[40px] py-[44px] text-center">
                  <div className="size-[68px]"><LocationPin /></div>
                  <p className="text-[28px] leading-[34px] tracking-[0.2px] text-[#15402f]" style={FM} {...tx('No cities added yet')} />
                  <p className="max-w-[460px] text-[16px] font-normal leading-[24px] text-[#5a6660]" style={FMU} {...tx('Add the cities you\'d prefer to attend in. You can rank them after adding — your highest available choice is honored first.')} />
                </div>
              ) : (
                <div className="mt-[16px]">
                  <RankList cities={cities} onReorder={reorderCity} onRemove={removeCity} />
                </div>
              )}

              {/* Other Details questionnaire (desktop) */}
              <div className="mt-[32px]">
                {renderOtherDetails('pc-')}
              </div>
            </div>

            {/* sticky footer CTA — Skip is always available; Confirm is always shown too, but
                clicking it while no city is picked just surfaces the validation toast below. */}
            <div className="shrink-0">
              <StickyFooter
                caption={empty ? 'No cities added yet' : `${cities.length} cities selected`}
                title={empty ? 'Add a city, or skip to continue' : `1st choice ${cities[0]?.name ?? ''}`}
                button="Confirm"
                onButton={handleConfirm}
                secondary={{ label: 'Skip', onClick: () => nav('/miqaats') }}
              />
            </div>
          </section>
        </div>
      </div>

      {/* ── validation error toast ── */}
      {err && (
        <div className="fixed bottom-[110px] start-[16px] end-[16px] z-50 animate-[noticeIn_320ms_ease-out] sm:left-auto sm:right-[var(--content-px)] sm:w-[380px]">
          <div className="flex items-start gap-[10px] rounded-[14px] bg-[#c53030] px-[14px] py-[12px] shadow-[0_8px_24px_-8px_rgba(165,42,42,0.35)]">
            <svg viewBox="0 0 24 24" className="mt-[1px] size-[16px] shrink-0" fill="none">
              <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.2)"/>
              <rect x="11" y="6.5" width="2" height="8" rx="1" fill="#fff"/>
              <circle cx="12" cy="17" r="1.2" fill="#fff"/>
            </svg>
            <p className="text-[13px] leading-[18px] text-white" style={{ ...FMU, fontWeight: 500 }}>
              {err}
            </p>
          </div>
        </div>
      )}
    </PhoneScreen>
  )
}
