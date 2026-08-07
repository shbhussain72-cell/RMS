/**
 * Remarks — context, CRUD and live anchor resolution.
 *
 * Dev-only, gated exactly like `src/i18n/CoveragePanel.tsx`: `import.meta.env.DEV` is
 * statically false in a production build, so this module, the layer, the panel, the selector
 * engine and the fixture are all dropped by the bundler.
 *
 * ── RESOLUTION IS RECOMPUTED, NEVER PERSISTED ────────────────────────────────────────
 *
 * `orphaned` and `degraded` are derived on every pass. Writing them to storage would freeze a
 * transient condition — a remark that failed to resolve once because the screen had not
 * finished mounting would stay orphaned forever, which is exactly the over-eager behaviour
 * that makes the flag worthless.
 *
 * The pass runs after a settle delay following navigation or a language change, then on an
 * interval. The interval is what catches an element that mounts late (a lazy list, a fetch,
 * a collapsed section being opened) and lets a remark come BACK from orphaned. Orphaning has
 * to be reversible or it is just deletion with extra steps.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useLang } from '../i18n'
import { localStorageAdapter, newId } from './storage'
import { bestStrategy, captureIdentifiers, resolveRemark } from './selector'
import { patternFor } from './routes'
import type { Remark, RemarksAdapter, Resolution, RemarkStatus } from './types'

/** How long after a navigation/lang change before anchors are judged. */
const SETTLE_MS = 500
/** Re-check cadence. Cheap: a handful of querySelector calls over a few dozen remarks. */
const RECHECK_MS = 1000

const AUTHOR_KEY = 'rms-remark-author'

export interface RemarksContextValue {
  /** Remark mode. When false the layer is inert: no pointer events, no key capture. */
  enabled: boolean
  setEnabled: (v: boolean) => void
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
  /** Orphan-recovery test fixture. Dev-only within a dev-only tool. */
  fixtureOn: boolean
  setFixtureOn: (v: boolean) => void

  remarks: Remark[]
  /** Live resolution per remark id. Recomputed, never stored. */
  resolutions: Map<string, Resolution>

  route: string
  routePattern: string

  author: string
  setAuthor: (v: string) => void

  addRemark: (el: HTMLElement, text: string) => Promise<void>
  updateRemark: (id: string, patch: Partial<Pick<Remark, 'remark' | 'status'>>) => Promise<void>
  removeRemark: (id: string) => Promise<void>
  /** Force an immediate re-resolve — used after the fixture toggles a break mode. */
  refresh: () => void
}

const Ctx = createContext<RemarksContextValue | null>(null)

export function useRemarks(): RemarksContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRemarks must be used within <RemarksProvider>')
  return ctx
}

/** Never-throwing accessor for components that may render outside the provider (prod). */
export function useRemarksSafe(): RemarksContextValue | null {
  return useContext(Ctx)
}

export function RemarksProvider({
  children,
  adapter,
}: {
  children: ReactNode
  adapter?: RemarksAdapter
}) {
  // The dev gate must come BEFORE any reference to the storage module, and the default
  // adapter must NOT be a default parameter.
  //
  // `adapter = localStorageAdapter` in the signature is evaluated on every call, and this
  // component IS called in production (it renders the app's children). That single reference
  // kept `storage.ts` alive through tree-shaking and shipped `rms-remarks` plus the whole
  // localStorage adapter into the production bundle — verified by grepping dist/.
  //
  // Behind the early return, the reference is unreachable once `import.meta.env.DEV` folds to
  // false, so the bundler drops the module with it.
  if (!import.meta.env.DEV) return <>{children}</>
  return <RemarksProviderInner adapter={adapter ?? localStorageAdapter}>{children}</RemarksProviderInner>
}

function RemarksProviderInner({ children, adapter }: { children: ReactNode; adapter: RemarksAdapter }) {
  const { lang } = useLang()
  const location = useLocation()
  const [enabled, setEnabled] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [fixtureOn, setFixtureOn] = useState(false)
  const [remarks, setRemarks] = useState<Remark[]>([])
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map())
  const [author, setAuthorState] = useState<string>(() => {
    try { return localStorage.getItem(AUTHOR_KEY) || 'reviewer' } catch { return 'reviewer' }
  })
  const [tick, setTick] = useState(0)

  const route = location.pathname
  const routePattern = useMemo(() => patternFor(route), [route])

  // Initial load. StrictMode double-invokes this in dev; `list()` is idempotent so the second
  // pass simply sets the same array.
  useEffect(() => {
    let cancelled = false
    adapter.list().then((all) => { if (!cancelled) setRemarks(all) })
    return () => { cancelled = true }
  }, [adapter])

  const setAuthor = useCallback((v: string) => {
    setAuthorState(v)
    try { localStorage.setItem(AUTHOR_KEY, v) } catch { /* private mode */ }
  }, [])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  /**
   * Resolve every remark against the live DOM.
   *
   * `onRoute` is the pathname match, not the pattern match. A remark left on
   * `/miqaats/ashara-1448/city` is not orphaned just because you are now looking at
   * `/miqaats/other-miqaat/city` — the element it names may genuinely not be on THIS page,
   * and calling that an orphan would flag half the list every time the id changed.
   */
  const runResolution = useCallback(() => {
    setResolutions((prev) => {
      const next = new Map<string, Resolution>()
      let changed = prev.size !== remarks.length
      for (const r of remarks) {
        const res = resolveRemark(r, lang, r.route === route)
        next.set(r.id, res)
        const before = prev.get(r.id)
        if (!before || before.el !== res.el || before.resolvedBy !== res.resolvedBy
          || before.orphaned !== res.orphaned || before.degraded !== res.degraded) changed = true
      }
      return changed ? next : prev
    })
  }, [remarks, lang, route])

  // Settle, then judge; then keep re-checking so a late mount can un-orphan a remark.
  useEffect(() => {
    const settle = window.setTimeout(runResolution, SETTLE_MS)
    const iv = window.setInterval(runResolution, RECHECK_MS)
    return () => { window.clearTimeout(settle); window.clearInterval(iv) }
  }, [runResolution, tick])

  /**
   * Record a successful anchor.
   *
   * `lastSeenAt` is the honest answer to "is this remark still real?" for an orphan sitting
   * in the list — it says when the element was last actually found, which is far more useful
   * than a boolean. Written at most once a minute so a reviewer sitting on one screen does
   * not rewrite storage every second.
   */
  const lastPersist = useRef(0)
  useEffect(() => {
    const now = Date.now()
    if (now - lastPersist.current < 60_000) return
    const seen = remarks.filter((r) => resolutions.get(r.id)?.el)
    if (!seen.length) return
    lastPersist.current = now
    const stamp = new Date(now).toISOString()
    for (const r of seen) void adapter.save({ ...r, lastSeenAt: stamp })
  }, [resolutions, remarks, adapter])

  const addRemark = useCallback(async (el: HTMLElement, text: string) => {
    const identifiers = captureIdentifiers(el, lang)
    const now = new Date().toISOString()
    const remark: Remark = {
      id: newId(),
      route,
      routePattern: patternFor(route),
      identifiers,
      capturedStrategy: bestStrategy(identifiers),
      remark: text,
      author,
      status: 'open',
      lang,
      // Read from <html> rather than inferred from lang: LangProvider owns that attribute,
      // and reading the authoritative value keeps the two from ever disagreeing.
      dir: (document.documentElement.getAttribute('dir') as 'ltr' | 'rtl') || 'ltr',
      viewportWidth: window.innerWidth,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    }
    await adapter.save(remark)
    setRemarks((prev) => [...prev, remark])
    refresh()
  }, [adapter, author, lang, route, refresh])

  const updateRemark = useCallback(async (id: string, patch: Partial<Pick<Remark, 'remark' | 'status'>>) => {
    setRemarks((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r))
      const hit = next.find((r) => r.id === id)
      if (hit) void adapter.save(hit)
      return next
    })
  }, [adapter])

  const removeRemark = useCallback(async (id: string) => {
    await adapter.remove(id)
    setRemarks((prev) => prev.filter((r) => r.id !== id))
  }, [adapter])

  /**
   * Keyboard shortcut. Ctrl/Cmd+Shift+M toggles remark mode.
   *
   * Bound unconditionally — it is the only way IN — but every other key is left alone, and
   * the handler exits immediately when the user is typing so the shortcut cannot fire from
   * inside a form field. `TourOverlay` is the only other global keydown listener and it binds
   * Escape while active, so there is no collision.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === 'M' || e.key === 'm') || !e.shiftKey || !(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      setEnabled((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Leaving remark mode with Escape, only while it is on — so Escape keeps working elsewhere.
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEnabled(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  const value = useMemo<RemarksContextValue>(() => ({
    enabled, setEnabled, panelOpen, setPanelOpen, fixtureOn, setFixtureOn,
    remarks, resolutions, route, routePattern,
    author, setAuthor,
    addRemark, updateRemark, removeRemark, refresh,
  }), [enabled, panelOpen, fixtureOn, remarks, resolutions, route, routePattern, author, setAuthor,
    addRemark, updateRemark, removeRemark, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export type { Remark, RemarkStatus, Resolution }
