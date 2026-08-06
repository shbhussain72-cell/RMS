import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store'
import { TOUR_SCREENS, TOUR_SEEN_KEY, screensForPath, type TourScreen, type TourStep } from './steps'
import TourOverlay from './TourOverlay'

interface TourContextValue {
  /** A screen walkthrough is currently running. */
  active: boolean
  screen: TourScreen | null
  step: TourStep | null
  stepIndex: number
  /** Number of steps in the active screen's walkthrough. */
  stepCount: number
  /** Whether to render the "Step X of N" progress indicator (per-screen; on for City & Zone only). */
  showProgress: boolean
  next: () => void
  prev: () => void
  /** Dismiss the current screen's walkthrough (marks it seen). */
  skip: () => void
  /** Finish the current screen's walkthrough from its last step (marks it seen). */
  finish: () => void
  /** Replay the walkthrough for the page the user is currently on (from the Help button). */
  replayCurrent: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within <TourProvider>')
  return ctx
}

/** Never-throwing accessor for components that may render outside the provider. */
export function useTourActive(): boolean {
  return useContext(TourContext)?.active ?? false
}

function getSeen(): string[] {
  try {
    const raw = localStorage.getItem(TOUR_SEEN_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function markSeen(key: string) {
  try {
    const set = new Set(getSeen())
    set.add(key)
    localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore storage failures */
  }
}

/** Is a `data-tour` anchor currently rendered and laid out? (Mirrors the overlay's finder.) */
function anchorVisible(anchor: string): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)).some((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  })
}

export function TourProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const loggedIn = useStore((s) => s.loggedIn)

  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  // The steps actually shown for the active walkthrough — its screen's steps filtered to those whose
  // element is present (so e.g. the Invite Mehmaan step is dropped on events that don't accept guests).
  const [resolvedSteps, setResolvedSteps] = useState<TourStep[]>([])
  const poll = useRef<number>()

  const screen = activeKey ? TOUR_SCREENS.find((s) => s.key === activeKey) ?? null : null
  const active = !!screen
  const stepCount = resolvedSteps.length
  const step = resolvedSteps[stepIndex] ?? null
  const showProgress = !!screen?.progress && stepCount > 1

  /** Close the active walkthrough. `remember` marks the screen seen (explicit dismiss/finish); a
   *  navigation-away close leaves it unseen so it can still introduce itself on a later visit. */
  const close = useCallback((remember: boolean) => {
    setActiveKey((key) => {
      if (key && remember) markSeen(key)
      return null
    })
    setStepIndex(0)
  }, [])

  // Auto-open a screen's walkthrough the first time the user lands on it. A route can host several
  // walkthroughs (e.g. the detail page's `detail` vs `detail-status`); we arm the first unseen one
  // whose opening anchor is actually on the page. Polling lets an anchor that appears late — the City
  // cards after the queue loader, or the status tracker after registering — trigger its tip when it
  // shows, without ever forcing an element to render early.
  useEffect(() => {
    if (!loggedIn || activeKey) return
    const candidates = screensForPath(location.pathname).filter((s) => !getSeen().includes(s.key))
    if (candidates.length === 0) return
    let cancelled = false
    const tryArm = () => {
      if (cancelled) return false
      // Prefer a screen whose opening step is on the page; otherwise take one where a LATER step's
      // anchor is present (e.g. Modify Reservation whose leading linked-transfer tip only exists for
      // linked reservations — a plain reservation still arms on its `modify-options` step).
      const sc =
        candidates.find((s) => anchorVisible(s.steps[0].anchor)) ??
        candidates.find((s) => s.steps.some((st) => anchorVisible(st.anchor)))
      if (sc) {
        setResolvedSteps(sc.steps.filter((s) => anchorVisible(s.anchor)))
        setStepIndex(0)
        setActiveKey(sc.key)
        return true
      }
      return false
    }
    const start = window.setTimeout(() => {
      if (tryArm()) return
      const iv = window.setInterval(() => {
        if (cancelled || tryArm()) window.clearInterval(iv)
      }, 250)
      poll.current = iv
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(start)
      if (poll.current) window.clearInterval(poll.current)
    }
  }, [location.pathname, loggedIn, activeKey])

  // If the user leaves the active screen, close its walkthrough (without marking seen, so it can
  // still appear on a later visit — e.g. leaving City Selection before finishing the queue).
  useEffect(() => {
    if (!activeKey) return
    const sc = TOUR_SCREENS.find((s) => s.key === activeKey)
    if (sc && !sc.test.test(location.pathname)) close(false)
  }, [location.pathname, activeKey, close])

  // Close on logout.
  useEffect(() => {
    if (!loggedIn && activeKey) setActiveKey(null)
  }, [loggedIn, activeKey])

  const next = useCallback(() => {
    if (stepIndex < resolvedSteps.length - 1) setStepIndex(stepIndex + 1)
    else close(true)
  }, [resolvedSteps, stepIndex, close])

  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), [])
  const skip = useCallback(() => close(true), [close])
  const finish = useCallback(() => close(true), [close])

  const replayCurrent = useCallback(() => {
    const matches = screensForPath(location.pathname)
    if (matches.length === 0) return
    // Prefer the walkthrough whose anchor is on the page right now (e.g. status vs register on the
    // detail route); fall back to the first match.
    const sc = matches.find((s) => anchorVisible(s.steps[0].anchor)) ?? matches[0]
    const steps = sc.steps.filter((s) => anchorVisible(s.anchor))
    setResolvedSteps(steps.length ? steps : sc.steps)
    setStepIndex(0)
    setActiveKey(sc.key)
  }, [location.pathname])

  return (
    <TourContext.Provider
      value={{ active, screen, step, stepIndex, stepCount, showProgress, next, prev, skip, finish, replayCurrent }}
    >
      {children}
      <TourOverlay />
    </TourContext.Provider>
  )
}
