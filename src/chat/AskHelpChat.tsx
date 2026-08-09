import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ChatMessageBubble from './ChatMessageBubble'
import QuickReplyRow from './QuickReplyRow'
import ChatMemberSelect from './ChatMemberSelect'
import ChatItsEntry from './ChatItsEntry'
import ChatDestinationPicker from './ChatDestinationPicker'
import RoleBadge from '../components/figma/RoleBadge'
import { useAskHelpChat } from './useAskHelpChat'
import { useStore } from '@/store'
import { RegisterGlyph, CityGlyph, ZoneGlyph, TrackGlyph, SparkleGlyph } from './icons'
import type { AskHelpInit, ChatOption } from './types'
import { useT } from '../i18n'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

const CATEGORY_OPTIONS: ChatOption[] = [
  { value: 'register', label: 'Register for an event', sublabel: 'Sign up yourself or your family', icon: <RegisterGlyph className="size-[19px]" />, color: 'blue' },
  { value: 'city', label: 'City selection', sublabel: 'Request or change your allocated city', icon: <CityGlyph className="size-[19px]" />, color: 'pink' },
  { value: 'zone', label: 'Zone selection', sublabel: 'Request or change your allocated zone', icon: <ZoneGlyph className="size-[19px]" />, color: 'green' },
  { value: 'track', label: 'Track My Requests', sublabel: 'See status of submitted requests', icon: <TrackGlyph className="size-[19px]" />, color: 'amber' },
]

// The request lifecycle shown on the Track My Requests detail card. A pending request sits at
// "Under Review"; a (demo-)approved one has reached "Approved".
const TRACK_STEPS = ['Submitted', 'Under Review', 'Approved'] as const

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4.2l2.8 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Horizontal 4-step progress rail (Submitted → Under Review → Approved → Completed). `currentIndex`
 *  is the step the request is sitting at; earlier steps read as done, later ones as upcoming. */
function TrackStepper({ currentIndex, approved }: { currentIndex: number; approved: boolean }) {
  const last = TRACK_STEPS.length - 1
  const frac = currentIndex / last
  return (
    <div className="relative">
      {/* Connector rail behind the nodes: full gray track + a green overlay up to the current step. */}
      <div className="pointer-events-none absolute start-[31px] end-[31px] top-[11px] h-[2px] rounded-full bg-[#e6e0d2]" />
      <div className="pointer-events-none absolute start-[31px] top-[11px] h-[2px] rounded-full bg-[#2e7d5b]" style={{ width: `calc((100% - 62px) * ${frac})` }} />
      <div className="relative flex items-start justify-between">
        {TRACK_STEPS.map((label, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          const currentGreen = approved // once approved, the "current" node (Completed) is a green check
          return (
            <div key={label} className="flex w-[62px] flex-col items-center gap-[6px]">
              <span
                className={`flex size-[22px] items-center justify-center rounded-full ${
                  done
                    ? 'bg-[#2e7d5b] text-white'
                    : current
                      ? currentGreen
                        ? 'bg-[#2e7d5b] text-white'
                        : 'bg-[#6b4fc4] text-white'
                      : 'border-[1.5px] border-[#d8d2c2] bg-white text-transparent'
                }`}
              >
                {done ? <CheckIcon className="size-[12px]" /> : current ? (currentGreen ? <CheckIcon className="size-[12px]" /> : <ClockIcon className="size-[13px]" />) : null}
              </span>
              <span
                className={`text-center text-[9.5px] font-bold leading-[12px] ${done || current ? 'text-[#23302a]' : 'text-[#9aa1a8]'}`}
                style={{ fontFamily: FONT_SANS }}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type TrackedRequest = ReturnType<typeof useAskHelpChat>['trackedRequests'][number]

/** A single Track My Requests entry: a compact tappable row that expands into a full status card
 *  (REQ id + date, category badge, progress stepper, and From → To). */
function TrackRequestRow({ r, expanded, onToggle }: { r: TrackedRequest; expanded: boolean; onToggle: () => void }) {
  const { t, tx, td } = useT()
  // Whether the register request's member list is revealed (tap "View members" to expand it inline).
  const [showMembers, setShowMembers] = useState(false)
  // Demo-only: flip this request to "Approved" so the presenter can advance to the post-approval step.
  const approveReopenRequest = useStore((s) => s.approveReopenRequest)
  return (
    <div className="overflow-hidden rounded-[14px] border border-solid border-[#e7dfc9] bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-[8px] px-[13px] py-[11px] text-start transition-colors hover:bg-[#faf7ef]">
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="min-w-0 truncate text-[13.5px] font-bold text-[#23302a]" style={{ fontFamily: FONT_SANS }}>{r.title}</span>
          <span className="text-[11.5px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>{r.summary}</span>
        </div>
        <span
          className={`shrink-0 rounded-full px-[8px] py-[2px] text-[10px] font-bold ${r.approved ? 'bg-[#eaf3ed] text-[#1f5a44]' : 'bg-[#fdf1dc] text-[#a9740f]'}`}
          style={{ fontFamily: FONT_SANS }}
        >
          {r.approved ? t('Approved') : t('Pending approval')}
        </span>
        <svg viewBox="0 0 24 24" fill="none" className={`size-[16px] shrink-0 text-[#9aa1a8] transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[#efe8d6] px-[14px] pb-[14px] pt-[12px]">
          <div className="flex items-center justify-between gap-[8px]">
            <p className="min-w-0 truncate text-[11px] font-semibold text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }}>
              {r.reqNo}{r.dateLabel ? ` · ${r.dateLabel}` : ''}
            </p>
            <span className="shrink-0 rounded-full bg-[#f0ecfb] px-[9px] py-[3px] text-[9.5px] font-bold uppercase tracking-[0.5px] text-[#6b4fc4]" style={{ fontFamily: FONT_SANS }}>
              {r.categoryLabel}
            </span>
          </div>

          <div className="mt-[14px]">
            <TrackStepper currentIndex={r.approved ? 2 : 1} approved={r.approved} />
          </div>

          {r.stage === 'register' ? (
            <div className="mt-[16px]">
              <div className="flex items-start justify-between gap-[8px]">
                <div>
                  <p className="text-[11px] font-semibold text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }} {...tx('Members')} />
                  <p className="mt-[2px] text-[13px] font-bold text-[#23302a]" style={{ fontFamily: FONT_SANS }}>
                    {r.memberCount ? `${r.memberCount} member${r.memberCount === 1 ? '' : 's'}` : '—'}
                  </p>
                </div>
                {r.requestMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowMembers((v) => !v)}
                    className="shrink-0 rounded-full border border-solid border-[#e7dfc9] bg-white px-[12px] py-[6px] text-[11.5px] font-bold text-[#1f5a44] transition-colors hover:bg-[#f7f4ec]"
                    style={{ fontFamily: FONT_SANS }}
                  >
                    {showMembers ? 'Hide members' : 'View members'}
                  </button>
                )}
              </div>
              {showMembers && r.requestMembers.length > 0 && (
                <ul className="mt-[10px] flex flex-col gap-[6px]">
                  {r.requestMembers.map((mem, i) => (
                    <li key={`${mem.name}-${i}`} className="flex flex-col gap-[4px] rounded-[9px] bg-[#f7f4ec] px-[10px] py-[8px]">
                      <div className="flex items-center justify-between gap-[8px]">
                        <span className="min-w-0 truncate text-[12.5px] font-semibold text-[#23302a]" style={{ fontFamily: FONT_SANS }} {...td(mem.name)} />
                        <RoleBadge kind={mem.badge} />
                      </div>
                      {mem.linkedToName && (
                        <span className="text-[11px] leading-[15px] text-[#7a827c]" style={{ fontFamily: FONT_SANS }}>
                          Reserves with {mem.linkedToName} · {mem.linkedRole === 'caregiver' ? t('Caregiver') : t('Guardian')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-[16px] grid grid-cols-2 gap-[12px]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }} {...tx('From')} />
                <p className="mt-[2px] text-[13px] font-bold text-[#23302a]" style={{ fontFamily: FONT_SANS }}>{r.fromLabel || '—'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }}>To</p>
                <p className="mt-[2px] text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT_SANS }}>{r.toLabel || '—'}</p>
              </div>
            </div>
          )}

          {/* Demo-only control — approve the request in place so the flow can continue to the
              post-approval step (the stepper advances to "Approved"). */}
          {!r.approved && (
            <button
              type="button"
              onClick={() => approveReopenRequest(r.id)}
              className="mt-[16px] flex h-[40px] w-full items-center justify-center gap-[7px] rounded-full border border-dashed border-[#bcd8c6] bg-[#f2f9f4] text-[13px] font-bold text-[#1f7a4d] transition-colors hover:bg-[#e7f3ec]"
              style={{ fontFamily: FONT_SANS }}
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-[15px]"><path d="M4 10.5l3.5 3.5L16 5.5" stroke="#1f7a4d" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
              (Demo) Approve request
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The chat surface — portaled to <body> (the sticky header's inline transform makes it a
 *  containing block that breaks naive `position: fixed` descendants, same reason BottomSheet /
 *  InvitationPopup / InvitationBanner all portal). Mobile: full-screen takeover. Desktop: a tall
 *  right-docked panel (ClickUp-Brain style) floating over Home without blocking the page. */
export default function AskHelpChat({ init, onToast, onClose }: { init: AskHelpInit; onToast: (msg: string) => void; onClose: () => void }) {
  const { tx, t } = useT()
  const chat = useAskHelpChat(init, onToast, onClose)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Which Track My Requests row is expanded into its full status card (null = all collapsed).
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.transcript.length, chat.step, chat.itsEntryOpen])

  // The opening "How can I help?" hero only shows for the general floater's first screen. Once a
  // category is chosen (or on a contextual entry that skips straight to members) it becomes a chat.
  const showHero = chat.step === 'category'

  // "Track My Requests" and (when the user is registered for this event) "Cancel reservation" aren't
  // ChatCategories — they're distinct steps, so route them separately from the register/city/zone picker.
  const handleCategoryPick = (value: string) =>
    value === 'track' ? chat.pickTrack() : value === 'cancel' ? chat.pickCancel() : chat.pickCategory(value)
  // Cancel is offered only when there's a reservation to cancel (scoped, registered event).
  const categoryOptions: ChatOption[] = chat.canCancel
    ? [...CATEGORY_OPTIONS, {
        value: 'cancel', label: 'Cancel reservation', sublabel: 'Cancel your registration for this event', color: 'pink',
        icon: (
          <svg viewBox="0 0 20 20" fill="none" className="size-[19px]"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" /><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        ),
      }]
    : CATEGORY_OPTIONS

  return createPortal(
    <div className="fixed inset-0 z-[120] flex bg-[rgba(14,45,33,0.45)] sm:pointer-events-none sm:items-stretch sm:justify-end sm:bg-transparent sm:p-[16px] sm:pt-[64px]">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_28px_80px_-18px_rgba(21,64,47,0.4)] sm:pointer-events-auto sm:w-[440px] sm:rounded-[20px] sm:border sm:border-[#ece7da]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece7da] px-[18px] py-[14px]">
          <div className="flex items-center gap-[10px]">
            {chat.canGoBack && (
              <button
                type="button"
                onClick={chat.goBack}
                aria-label={t('Back')}
                className="flex size-[30px] items-center justify-center rounded-full text-[#5a6660] transition-colors hover:bg-[#f0ece1]"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-[17px]">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-gradient-to-br from-[#1f5a44] to-[#2e7d5b] text-white">
              <SparkleGlyph className="size-[17px]" />
            </span>
            <div className="leading-tight">
              <p className="text-[15px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Miqaat Assistant')} />
              <p className="text-[11px] text-[#8a938e]" style={{ fontFamily: FONT_SANS }} {...tx('Ask about registration, city & zone')} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="flex size-[30px] items-center justify-center rounded-full text-[#5a6660] transition-colors hover:bg-[#f0ece1]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[16px]">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-[18px] py-[18px]">
          {showHero ? (
            <div className="flex flex-col">
              <div className="flex flex-col items-center pt-[18px] pb-[8px] text-center">
                <span className="flex size-[56px] items-center justify-center rounded-[18px] bg-gradient-to-br from-[#eaf3ed] to-[#dcefe3] text-[#1f5a44]">
                  <SparkleGlyph className="size-[30px]" />
                </span>
                <h2 className="mt-[16px] text-[22px] leading-[28px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('How can I help?')} />
                <p className="mt-[8px] max-w-[300px] text-[13.5px] leading-[19px] text-[#7a827c]" style={{ fontFamily: FONT_SANS }} {...tx('Get help registering for a Miqaat, or request a change to your allocated city or zone.')} />
              </div>
              <p className="mb-[10px] mt-[22px] text-[11px] font-bold uppercase tracking-[0.7px] text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }} {...tx('What would you like help with?')} />
              <QuickReplyRow options={categoryOptions} onPick={handleCategoryPick} variant="grid" />
            </div>
          ) : (
            <div className="flex flex-col gap-[12px]">
              {chat.transcript.map((m) => (
                <ChatMessageBubble key={m.id} message={m} />
              ))}

              {/* Answer controls render inline, right under the latest bot question — part of the
               *  conversation flow, not a detached footer (mirrors the category hero above). */}
              {chat.step === 'event' && <QuickReplyRow options={chat.eventOptions} onPick={chat.pickEvent} variant="list" />}

              {chat.step === 'members' && !chat.itsEntryOpen && (
                <div className="flex flex-col gap-[14px]">
                  <ChatMemberSelect
                    options={chat.memberOptions}
                    selectedIds={chat.selectedMemberIds}
                    onToggle={chat.toggleChatMember}
                    addedNames={chat.addedMembers.map((m) => m.name)}
                    onAddIts={chat.showAddIts ? chat.openItsEntry : undefined}
                  />
                  <button
                    type="button"
                    onClick={chat.membersContinue}
                    disabled={chat.selectedMemberIds.length === 0 && chat.addedMembers.length === 0}
                    className="h-[46px] rounded-full bg-[#1f5a44] text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(21,64,47,0.5)] transition-opacity disabled:opacity-40"
                    style={{ fontFamily: FONT_SANS }} {...tx('Continue')} />
                </div>
              )}

              {chat.step === 'members' && chat.itsEntryOpen && (
                <ChatItsEntry value={chat.itsDraft} onChange={chat.setItsDraftValue} error={chat.itsError} result={chat.itsResult} onConfirm={chat.confirmItsMember} onCancel={chat.cancelItsEntry} />
              )}

              {chat.step === 'destination' && <ChatDestinationPicker options={chat.destinationOptions} onPick={chat.pickDestination} />}

              {(chat.step === 'handoff-preview' || chat.step === 'handoff') && (
                <div className="flex flex-col gap-[14px]">
                  {chat.memberOptions.length > 0 && (
                    (chat.category === 'city' || chat.category === 'zone') ? (
                      // City/Zone: split the party so it's clear WHO already has a city and who doesn't
                      // (e.g. the registrant after cancelling their own city). Each allocated member
                      // shows their city; the rest sit under "Not allocated yet".
                      (() => {
                        const notAllocated = chat.memberOptions.filter((o) => !o.allocated)
                        const allocated = chat.memberOptions.filter((o) => o.allocated)
                        const allocatedLabel = chat.category === 'zone' ? 'Zone allocated' : t('City allocated')
                        return (
                          <div className="flex flex-col gap-[14px]">
                            {notAllocated.length > 0 && (
                              <div className="flex flex-col gap-[10px]">
                                <p className="text-[11px] font-bold uppercase tracking-[0.7px] text-[#b0791f]" style={{ fontFamily: FONT_SANS }}>
                                  Not allocated yet · {notAllocated.length}
                                </p>
                                <ChatMemberSelect readOnly options={notAllocated} selectedIds={[]} onToggle={() => {}} />
                              </div>
                            )}
                            {allocated.length > 0 && (
                              <div className="flex flex-col gap-[10px]">
                                <p className="text-[11px] font-bold uppercase tracking-[0.7px] text-[#1f7a4d]" style={{ fontFamily: FONT_SANS }}>
                                  {allocatedLabel} · {allocated.length}
                                </p>
                                <ChatMemberSelect readOnly options={allocated} selectedIds={[]} onToggle={() => {}} />
                              </div>
                            )}
                          </div>
                        )
                      })()
                    ) : (
                      <div className="flex flex-col gap-[10px]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.7px] text-[#9aa1a8]" style={{ fontFamily: FONT_SANS }}>
                          {chat.memberListLabel}
                        </p>
                        <ChatMemberSelect readOnly options={chat.memberOptions} selectedIds={[]} onToggle={() => {}} />
                      </div>
                    )
                  )}

                  {chat.step === 'handoff-preview' && (
                    <button
                      type="button"
                      onClick={chat.confirmHandoffPreview}
                      className="h-[46px] rounded-full bg-[#1f5a44] text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(21,64,47,0.5)]"
                      style={{ fontFamily: FONT_SANS }} {...tx('Continue')} />
                  )}

                  {chat.step === 'handoff' && (
                    <>
                      <ChatMessageBubble message={{ id: 'handoff-msg', from: 'bot', text: chat.handoffMessage }} />
                      <button type="button" onClick={chat.proceedToScreen} className="mt-[2px] flex h-[46px] w-full items-center justify-center gap-[7px] rounded-full bg-[#1f5a44] text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(21,64,47,0.5)]" style={{ fontFamily: FONT_SANS }}>
                        {chat.handoffLabel}
                        <svg viewBox="0 0 16 16" fill="none" className="size-[15px]"><path d="M3 8h9M9 5l3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </>
                  )}
                </div>
              )}

              {chat.step === 'track' && (
                <div className="flex flex-col gap-[14px]">
                  {chat.trackedRequests.length > 0 && (
                    <div className="flex flex-col gap-[8px]">
                      {chat.trackedRequests.map((r) => (
                        <TrackRequestRow
                          key={r.id}
                          r={r}
                          expanded={expandedTrackId === r.id}
                          onToggle={() => setExpandedTrackId((cur) => (cur === r.id ? null : r.id))}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-[46px] rounded-full bg-[#1f5a44] text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(21,64,47,0.5)]"
                    style={{ fontFamily: FONT_SANS }} {...tx('Done')} />
                </div>
              )}

              {chat.step === 'cancel' && (
                <div className="mt-[2px] flex flex-col gap-[8px]">
                  {chat.cancelTagged ? (
                    // Tagged → can't cancel here; send them to Modify Reservation to change it first.
                    <>
                      <button type="button" onClick={chat.goModifyReservation} className="flex h-[46px] w-full items-center justify-center gap-[7px] rounded-full bg-[#1f5a44] text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(21,64,47,0.5)]" style={{ fontFamily: FONT_SANS }}>
                        <span {...tx('Modify Reservation')} />
                        <svg viewBox="0 0 16 16" fill="none" className="size-[15px]"><path d="M3 8h9M9 5l3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <button type="button" onClick={onClose} className="h-[46px] w-full rounded-full border border-[#d8e0da] bg-white text-[14px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT_SANS }} {...tx('Done')} />
                    </>
                  ) : (
                    // Untagged → confirm the cancellation right here.
                    <>
                      <button type="button" onClick={chat.confirmCancel} className="h-[46px] w-full rounded-full bg-[#c0392b] text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(192,57,43,0.5)]" style={{ fontFamily: FONT_SANS }} {...tx('Yes, cancel reservation')} />
                      <button type="button" onClick={onClose} className="h-[46px] w-full rounded-full border border-[#d8e0da] bg-white text-[14px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT_SANS }} {...tx('Keep reservation')} />
                    </>
                  )}
                </div>
              )}

              {chat.step === 'confirm' && (
                <div className="mt-[2px] flex flex-col gap-[8px]">
                  {/* When the submission is a trackable (reopen) request, offer to view its status
                      right here in the chat via Track My Requests — no need to leave for Home. */}
                  {chat.trackedRequests.length > 0 && (
                    <button type="button" onClick={chat.pickTrack} className="flex h-[46px] w-full items-center justify-center gap-[7px] rounded-full bg-[#1f5a44] text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(21,64,47,0.5)]" style={{ fontFamily: FONT_SANS }}>
                      <TrackGlyph className="size-[17px]" />
                      <span {...tx('Track my request')} />
                    </button>
                  )}
                  <button type="button" onClick={onClose} className={`h-[46px] w-full rounded-full text-[14px] font-bold ${chat.trackedRequests.length > 0 ? 'border border-[#d8e0da] bg-white text-[#1f5a44]' : 'bg-[#1f5a44] text-white shadow-[0_8px_20px_-8px_rgba(21,64,47,0.5)]'}`} style={{ fontFamily: FONT_SANS }} {...tx('Done')} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
