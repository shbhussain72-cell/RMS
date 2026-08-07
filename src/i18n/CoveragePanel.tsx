/**
 * Dev-only LSD coverage panel.
 *
 * Two independent measurements, deliberately shown side by side because they disagree and
 * the disagreement is the point:
 *
 *   DICTIONARY   how much of the wordlist the running app has resolved, and which
 *                on-screen strings went through `t()` and found nothing. This is the old
 *                number. It only ever sees strings someone already wired up.
 *
 *   DOM SCAN     what is actually painted. Walks rendered text nodes while the app is in
 *                LSD and flags any node holding a Latin word with no Arabic character.
 *                A hardcoded `<p>Register now</p>` never calls `t()`, so it never counts
 *                as a miss — which is how the panel could report "60 gaps" while a screen
 *                sat there almost entirely in English.
 *
 * Renders nothing in a production build: `import.meta.env.DEV` is statically false, so the
 * bundler drops this component, the scanner module and the tracking in ./index together.
 *
 * Bottom-LEFT on purpose — the app's Ask Help dock owns the bottom-right corner.
 * Equivalent data without the UI: `window.__lsdCoverage` and `window.__lsdScan`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { coverageReport, getCoverageVersion, subscribeCoverage, useLang } from './index'
import { SCANNER_IGNORE_ATTR, accumulate, cumulative, resetCumulative, scanDom, type ScanResult } from './domScan'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

export default function CoveragePanel() {
  if (!import.meta.env.DEV) return null
  return <CoveragePanelInner />
}

function CoveragePanelInner() {
  const { lang } = useLang()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'scan' | 'dict'>('scan')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [totals, setTotals] = useState(() => cumulative())
  const [, force] = useState(getCoverageVersion())
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => subscribeCoverage(() => force(getCoverageVersion())), [])

  const runScan = useCallback(() => {
    if (lang !== 'lsd') { setScan(null); return }
    const result = scanDom()
    accumulate(result)
    setScan(result)
    setTotals(cumulative())
  }, [lang])

  /**
   * Re-scan after navigation and after the DOM settles.
   *
   * Debounced and run from an effect (never during render) so the scan cannot itself
   * trigger a state update mid-render. 400ms is past React's commit and the font swap,
   * which otherwise produce a scan of a half-painted screen.
   */
  useEffect(() => {
    if (lang !== 'lsd') { setScan(null); return }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(runScan, 400)
    return () => window.clearTimeout(timer.current)
  }, [lang, location.pathname, runScan])

  // Console access, so a walk of the app can be exported without opening the panel.
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__lsdScan = {
      scan: () => scanDom(),
      totals: () => cumulative(),
      reset: () => { resetCumulative(); setTotals(cumulative()) },
      download: downloadTotals,
    }
  }, [])

  const r = coverageReport()
  const cls = { A: 'text-[#b23b3b]', B: 'text-[#b9842e]', C: 'text-[#5a4ba3]' } as const

  return (
    // `pointer-events-none` on the wrapper with `pointer-events-auto` on the controls: the
    // panel floats over the app and must never swallow a click meant for the UI beneath it.
    // SCANNER_IGNORE_ATTR keeps the scanner from reporting its own English chrome.
    <div
      {...{ [SCANNER_IGNORE_ATTR]: '' }}
      dir="ltr"
      className="pointer-events-none fixed bottom-[16px] left-[16px] z-[120] flex flex-col items-start gap-[6px]"
    >
      {open && (
        <div className="pointer-events-auto max-h-[60vh] w-[360px] overflow-y-auto rounded-[12px] border border-[#d8cfb8] bg-white p-[12px] shadow-[0_12px_36px_-10px_rgba(21,64,47,0.4)]">
          <div className="flex gap-[6px]">
            {(['scan', 'dict'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-[6px] px-[8px] py-[3px] text-[11px] font-bold ${tab === k ? 'bg-[#1f5a44] text-white' : 'bg-[#f0ece1] text-[#5a6660]'}`}
                style={{ fontFamily: FONT_SANS }}
              >
                {k === 'scan' ? 'DOM scan' : 'Dictionary'}
              </button>
            ))}
          </div>

          {tab === 'scan' ? (
            <div className="mt-[10px]">
              {lang !== 'lsd' ? (
                <p className="text-[11px] text-[#8a938e]" style={{ fontFamily: FONT_SANS }}>
                  Switch to LSD to scan. In English every string is Latin, so the scan means nothing.
                </p>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-x-[8px] gap-y-[3px] text-[11px]" style={{ fontFamily: FONT_SANS }}>
                    <dt className="text-[#5a6660]">This screen</dt>
                    <dd className="text-right font-bold text-[#23302a]">{scan?.total ?? '—'}</dd>
                    <dt className="text-[#5a6660]">Distinct, all routes</dt>
                    <dd className="text-right font-bold text-[#23302a]">{totals.distinctStrings}</dd>
                    <dt className="text-[#5a6660]">Routes walked</dt>
                    <dd className="text-right font-bold text-[#23302a]">{totals.routesVisited}</dd>
                  </dl>

                  <div className="mt-[8px] grid grid-cols-3 gap-[6px] text-center" style={{ fontFamily: FONT_SANS }}>
                    {(['A', 'B', 'C'] as const).map((k) => (
                      <div key={k} className="rounded-[8px] bg-[#f8f6f0] py-[6px]">
                        <p className={`text-[16px] font-bold ${cls[k]}`}>{totals[k]}</p>
                        <p className="text-[9px] font-bold text-[#8a938e]">{k}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-[6px] text-[9.5px] leading-[13px] text-[#8a938e]" style={{ fontFamily: FONT_SANS }}>
                    <b className="text-[#b23b3b]">A</b> translated, not wired (dev) ·{' '}
                    <b className="text-[#b9842e]">B</b> key exists, value empty/identity ·{' '}
                    <b className="text-[#5a4ba3]">C</b> no key (wordlist)
                  </p>

                  <ul className="mt-[8px] flex flex-col gap-[3px]">
                    {(scan?.hits ?? []).slice(0, 40).map((h) => (
                      <li key={h.text} className="flex gap-[6px] text-[11px] leading-[15px]" style={{ fontFamily: FONT_SANS }}>
                        <span className={`shrink-0 font-bold ${cls[h.cls]}`}>{h.cls}</span>
                        <span className="min-w-0 break-words text-[#3d3d3a]">{h.text}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-[10px] flex gap-[6px]">
                    <button type="button" onClick={runScan} className="flex-1 rounded-[8px] bg-[#1f5a44] py-[6px] text-[11px] font-bold text-white" style={{ fontFamily: FONT_SANS }}>
                      Re-scan
                    </button>
                    <button type="button" onClick={downloadTotals} className="flex-1 rounded-[8px] bg-[#a8843e] py-[6px] text-[11px] font-bold text-white" style={{ fontFamily: FONT_SANS }}>
                      Export JSON
                    </button>
                    <button type="button" onClick={() => { resetCumulative(); setTotals(cumulative()); runScan() }} className="rounded-[8px] border border-[#d8cfb8] px-[8px] text-[11px] font-bold text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
                      Reset
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mt-[10px]">
              <dl className="grid grid-cols-2 gap-x-[8px] gap-y-[3px] text-[11px]" style={{ fontFamily: FONT_SANS }}>
                <dt className="text-[#5a6660]">Dictionary entries</dt>
                <dd className="text-right font-bold text-[#23302a]">{r.dictionaryEntries}</dd>
                <dt className="text-[#5a6660]">Resolved in app</dt>
                <dd className="text-right font-bold text-[#1f5a44]">{r.resolvedInApp} ({r.resolvedPct}%)</dd>
                <dt className="text-[#5a6660]">Missed via t()</dt>
                <dd className="text-right font-bold text-[#b23b3b]">{r.missCount}</dd>
              </dl>
              <p className="mt-[6px] text-[9.5px] leading-[13px] text-[#8a938e]" style={{ fontFamily: FONT_SANS }}>
                Counts only strings that call <code>t()</code>. Hardcoded JSX is invisible here —
                use the DOM scan for the real number.
              </p>
              {r.missCount > 0 && (
                <ul className="mt-[8px] flex flex-col gap-[2px]">
                  {r.untranslated.slice(0, 40).map((u) => (
                    <li key={u.text} className="flex gap-[6px] text-[11px] leading-[15px]" style={{ fontFamily: FONT_SANS }}>
                      <span className="shrink-0 text-[#b9842e]">{u.seen}×</span>
                      <span className="min-w-0 break-words text-[#3d3d3a]">{u.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => (window as unknown as { __lsdCoverage: { download: () => void } }).__lsdCoverage.download()}
                className="mt-[10px] w-full rounded-[8px] bg-[#1f5a44] py-[6px] text-[11px] font-bold text-white"
                style={{ fontFamily: FONT_SANS }}
              >
                Download lsd-coverage.json
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex items-center gap-[6px] rounded-full border border-[#d8cfb8] bg-white px-[10px] py-[5px] text-[11px] font-bold shadow-[0_6px_18px_-8px_rgba(21,64,47,0.5)]"
        style={{ fontFamily: FONT_SANS }}
        title="LSD coverage (dev only)"
      >
        <span className={lang === 'lsd' ? 'text-[#1f5a44]' : 'text-[#8a938e]'}>LSD</span>
        {lang === 'lsd' ? (
          <>
            <span className="text-[#b23b3b]">A{totals.A}</span>
            <span className="text-[#b9842e]">B{totals.B}</span>
            <span className="text-[#5a4ba3]">C{totals.C}</span>
          </>
        ) : (
          <span className="text-[#23302a]">{r.resolvedInApp}/{r.dictionaryEntries}</span>
        )}
      </button>
    </div>
  )
}

/** Save the cumulative scan — the shape `docs/lsd-gaps.md`'s baseline is built from. */
function downloadTotals() {
  const blob = new Blob([JSON.stringify(cumulative(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'lsd-dom-scan.json'
  a.click()
  URL.revokeObjectURL(a.href)
}
