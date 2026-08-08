/**
 * Route-level error boundary — the guarantee that a thrown render can never blank the screen.
 *
 * ── WHY A BOUNDARY AND NOT MORE GUARDS ───────────────────────────────────────────
 *
 * The guards elsewhere in this session fix the unguarded reads we FOUND. This exists for the
 * ones we did not. A React render error with no boundary above it unmounts the whole tree and
 * leaves an empty <div id="root">, which is indistinguishable from a hung load and gives the
 * user no way forward — the exact symptom that was reported and that neither of us could
 * reproduce. With a boundary in place the same unknown cause produces a message and two
 * working actions instead of a white page, whether or not we ever find it.
 *
 * ── WHY IT IS A CLASS ────────────────────────────────────────────────────────────
 *
 * `getDerivedStateFromError` / `componentDidCatch` have no hook equivalent; a boundary must be
 * a class. The class stays deliberately thin — it catches, logs and delegates — because the
 * fallback needs `useT()` for its copy and hooks cannot run in a class. All the rendering
 * lives in the function component below it.
 *
 * ── LOGGING ──────────────────────────────────────────────────────────────────────
 *
 * It logs and does not swallow. Route, language, direction and viewport width are recorded
 * with the error because this class of bug is conditional on exactly those: an RTL-only
 * mirroring fault, a width-specific layout throw, or a state that only exists on one route.
 * An error report without them cannot be reproduced from.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'

/** Everything about WHERE a failure happened, captured at throw time. */
export interface RouteErrorContext {
  route: string
  lang: string
  dir: string
  width: number
}

function readContext(route: string): RouteErrorContext {
  const el = typeof document !== 'undefined' ? document.documentElement : null
  return {
    route,
    lang: el?.getAttribute('data-lang') ?? 'unknown',
    dir: el?.getAttribute('dir') ?? 'unknown',
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
  }
}

/**
 * The visible fallback. English source strings routed through `t()` so they resolve from the
 * wordlist once the owner authors them; until then they render in English rather than in a
 * guessed translation. Failure copy is the worst possible place to invent Lisan al-Dawat — a
 * user who cannot read the recovery instructions is stuck exactly where the boundary was
 * supposed to help.
 */
function RouteErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t, tx } = useT()
  const nav = useNavigate()
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-cream-50 px-[24px] py-[32px]">
      <div className="w-full max-w-[420px] rounded-[18px] border border-solid border-[#e7dfc9] bg-[#fffdf8] p-[24px] text-center shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)]">
        <p
          className="text-[20px] leading-[28px] text-[#15402f]"
          style={{ fontFamily: 'Marcellus, Georgia, serif' }}
          {...tx('Something went wrong on this page')}
        />
        <p
          className="mt-[10px] text-[14px] leading-[20px] text-[#5a6660]"
          style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}
          {...tx('You can try loading it again, or go back to your Miqaats.')}
        />
        <div className="mt-[20px] flex flex-col gap-[10px]">
          <button
            type="button"
            onClick={onRetry}
            className="h-[44px] w-full rounded-[12px] bg-[#15402f] text-[15px] font-bold text-white"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}
          >
            {t('Try again')}
          </button>
          <button
            type="button"
            onClick={() => nav('/miqaats')}
            className="h-[44px] w-full rounded-[12px] border border-solid border-[#15402f] text-[15px] font-bold text-[#15402f]"
            style={{ fontFamily: 'Mulish, system-ui, sans-serif' }}
          >
            {t('Go to my Miqaats')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  children: ReactNode
  /** Changing this clears a caught error — see the wrapper below. */
  resetKey: string
  route: string
}
interface State {
  failed: boolean
}

class Boundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  /**
   * Clearing on `resetKey` change is what makes navigation a recovery path.
   *
   * Without it a caught error is sticky: the boundary keeps rendering the fallback for the
   * REST OF THE SESSION, so "Go to my Miqaats" would change the URL and still show the error
   * screen. Comparing the previous key here resets on every route change, which also covers
   * the case where the user navigates away using the browser's own back button.
   */
  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const ctx = readContext(this.props.route)
    // Logged, never swallowed. `console.error` keeps the stack clickable in the dev overlay and
    // visible to whatever collects console output in a deployed build.
    console.error(
      `[route-error] ${ctx.route} lang=${ctx.lang} dir=${ctx.dir} width=${ctx.width}`,
      error,
      info.componentStack,
    )
  }

  render() {
    if (this.state.failed) return <RouteErrorFallback onRetry={() => this.setState({ failed: false })} />
    return this.props.children
  }
}

/**
 * Wraps the class so it can read the current route from the router.
 *
 * The pathname does double duty: it is the reset key AND the route recorded in the log.
 */
export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <Boundary resetKey={pathname} route={pathname}>
      {children}
    </Boundary>
  )
}
