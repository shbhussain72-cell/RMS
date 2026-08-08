/**
 * Remarks — activation chip and list panel.
 *
 * Top-INLINE-END, because both bottom corners are taken: `CoveragePanel` owns bottom-start and
 * the app's Ask Help dock owns bottom-end. z-[130] puts it above CoveragePanel's z-[120].
 *
 * Follows CoveragePanel's activation pattern — a compact always-visible chip that expands into
 * a panel — but NOT its `dir="ltr"`. CoveragePanel opts out of mirroring because it is a report
 * with no spatial relationship to the page. This panel lists remarks that point AT page
 * elements and sits beside a mirrored layer, so it uses logical properties and mirrors with the
 * app. Individual metadata rows are still forced LTR where they are Latin data (`390px`,
 * timestamps, selectors) rather than prose.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Iso } from '../components/Bidi'
import { SCANNER_IGNORE_ATTR } from '../i18n/domScan'
import { CHROME_ATTR } from './selector'
import { useRemarks } from './RemarksProvider'
import { download, toJson, toMarkdown } from './export'
import type { Remark } from './types'
import DevDock from '../dev/DevDock'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const chromeProps = { [CHROME_ATTR]: '', [SCANNER_IGNORE_ATTR]: '' }

type Scope = 'route' | 'all'
type StatusFilter = 'all' | 'open' | 'resolved'
type LangFilter = 'all' | 'en' | 'lsd'

export default function RemarksPanel() {
  if (!import.meta.env.DEV) return null
  return <RemarksPanelInner />
}

function RemarksPanelInner() {
  const {
    enabled, setEnabled, panelOpen, setPanelOpen,
    remarks, resolutions, route, updateRemark, removeRemark, author, setAuthor,
    fixtureOn, setFixtureOn,
  } = useRemarks()
  const navigate = useNavigate()

  const [scope, setScope] = useState<Scope>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [langF, setLangF] = useState<LangFilter>('all')
  const [orphanOnly, setOrphanOnly] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)

  /**
   * Scroll a remark's element into view once it resolves.
   *
   * Runs off `resolutions` rather than immediately after navigate(), because the target does
   * not exist until the new route has mounted and settled. Clearing `focusId` afterwards stops
   * the effect re-scrolling on every subsequent resolution pass.
   */
  useEffect(() => {
    if (!focusId) return
    const el = resolutions.get(focusId)?.el
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    const prev = el.style.outline
    el.style.outline = '3px solid #b23b3b'
    const t = window.setTimeout(() => { el.style.outline = prev }, 1400)
    setFocusId(null)
    return () => window.clearTimeout(t)
  }, [focusId, resolutions])

  const filtered = useMemo(() => remarks.filter((r) => {
    if (scope === 'route' && r.route !== route) return false
    if (status !== 'all' && r.status !== status) return false
    if (langF !== 'all' && r.lang !== langF) return false
    if (orphanOnly && !resolutions.get(r.id)?.orphaned) return false
    return true
  }), [remarks, resolutions, scope, status, langF, orphanOnly, route])

  const counts = useMemo(() => ({
    open: remarks.filter((r) => r.status === 'open').length,
    orphaned: remarks.filter((r) => resolutions.get(r.id)?.orphaned).length,
    degraded: remarks.filter((r) => resolutions.get(r.id)?.degraded).length,
  }), [remarks, resolutions])

  const go = (r: Remark) => {
    if (r.route !== route) navigate(r.route)
    setFocusId(r.id)
    setPanelOpen(false)
  }

  return (
    <DevDock
      id="remarks"
      {...chromeProps}
      className="pointer-events-none fixed top-[16px] end-[16px] z-[130] flex flex-col items-end gap-[6px]"
    >
      {panelOpen && (
        <div data-rmk="panel" className="pointer-events-auto flex max-h-[70vh] w-[min(380px,calc(100vw-32px))] flex-col rounded-[12px] border border-[#d8cfb8] bg-white shadow-[0_16px_44px_-12px_rgba(21,64,47,0.45)]">
          <div className="border-b border-[#eee6d4] p-[10px]">
            <div className="flex items-center gap-[6px]">
              <button
                type="button" onClick={() => setEnabled(!enabled)}
                className={`rounded-[6px] px-[8px] py-[4px] text-[11px] font-bold ${enabled ? 'bg-[#b23b3b] text-white' : 'bg-[#1f5a44] text-white'}`}
                style={{ fontFamily: FONT_SANS }}
              >
                {enabled ? 'Exit remark mode' : 'Enter remark mode'}
              </button>
              <input
                value={author} onChange={(e) => setAuthor(e.target.value)}
                placeholder="your name"
                className="min-w-0 flex-1 rounded-[6px] border border-[#e7dfc9] px-[6px] py-[4px] text-[11px] outline-none focus:border-[#1f5a44]"
                style={{ fontFamily: FONT_SANS }}
                dir="auto"
              />
            </div>

            <div className="mt-[8px] flex flex-wrap gap-[4px]" style={{ fontFamily: FONT_SANS }}>
              <Seg value={scope} set={setScope} opts={[['route', 'This route'], ['all', 'All']]} />
              <Seg value={status} set={setStatus} opts={[['all', 'All'], ['open', 'Open'], ['resolved', 'Done']]} />
              <Seg value={langF} set={setLangF} opts={[['all', 'Any'], ['en', 'EN'], ['lsd', 'LSD']]} />
              <button
                type="button" onClick={() => setOrphanOnly(!orphanOnly)}
                className={`rounded-[5px] px-[6px] py-[2px] text-[10px] font-bold ${orphanOnly ? 'bg-[#b23b3b] text-white' : 'bg-[#f0ece1] text-[#5a6660]'}`}
              >
                Orphaned {counts.orphaned ? `(${counts.orphaned})` : ''}
              </button>
            </div>

            {counts.degraded > 0 && (
              // Early warning: still anchored, but by a weaker identifier than at capture.
              // Surfaced here so it can be fixed before it becomes an orphan.
              <p className="mt-[6px] text-[10px] leading-[14px] text-[#b9842e]" style={{ fontFamily: FONT_SANS }} dir="ltr">
                {counts.degraded} remark{counts.degraded === 1 ? '' : 's'} now resolving by a weaker
                selector than when captured — one edit from orphaning.
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-[8px]">
            {filtered.length === 0 ? (
              <p className="p-[10px] text-[11px] text-[#8a938e]" style={{ fontFamily: FONT_SANS }}>
                No remarks match. {remarks.length === 0 ? 'Enter remark mode and click any element.' : ''}
              </p>
            ) : filtered.map((r) => (
              <Row key={r.id} r={r} onGo={() => go(r)} onToggle={() => updateRemark(r.id, { status: r.status === 'open' ? 'resolved' : 'open' })} onDelete={() => removeRemark(r.id)} />
            ))}
          </div>

          <div className="flex gap-[6px] border-t border-[#eee6d4] p-[8px]" style={{ fontFamily: FONT_SANS }}>
            <button
              type="button"
              onClick={() => download('remarks.md', toMarkdown(remarks, resolutions), 'text/markdown')}
              className="rounded-[6px] bg-[#f0ece1] px-[8px] py-[4px] text-[11px] font-bold text-[#23302a]"
            >
              Export Markdown
            </button>
            <button
              type="button"
              onClick={() => download('remarks.json', toJson(remarks), 'application/json')}
              className="rounded-[6px] bg-[#f0ece1] px-[8px] py-[4px] text-[11px] font-bold text-[#23302a]"
            >
              Export JSON
            </button>
            {/* Opens the orphan-recovery board. Lives here rather than on its own chip so the
                dev chrome stays to one corner. */}
            <button
              type="button" data-rmk="fixture-toggle" onClick={() => setFixtureOn(!fixtureOn)}
              className={`ms-auto rounded-[6px] px-[8px] py-[4px] text-[11px] font-bold ${fixtureOn ? 'bg-[#b23b3b] text-white' : 'bg-[#f0ece1] text-[#23302a]'}`}
              title="Synthetic targets for testing orphan recovery"
            >
              Fixture
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        data-rmk="chip"
        onClick={() => setPanelOpen(!panelOpen)}
        className="pointer-events-auto flex items-center gap-[6px] rounded-full border border-[#d8cfb8] bg-white px-[10px] py-[5px] text-[11px] font-bold shadow-[0_8px_24px_-10px_rgba(21,64,47,0.5)]"
        style={{ fontFamily: FONT_SANS }}
        dir="ltr"
        title="Remarks — Ctrl/Cmd+Shift+M toggles remark mode"
      >
        <span className={enabled ? 'text-[#b23b3b]' : 'text-[#1f5a44]'}>◉ Remarks</span>
        <span className="text-[#23302a]">{counts.open}</span>
        {counts.orphaned > 0 && <span className="text-[#b23b3b]">⚠{counts.orphaned}</span>}
      </button>
    </DevDock>
  )
}

function Seg<T extends string>({ value, set, opts }: { value: T; set: (v: T) => void; opts: [T, string][] }) {
  return (
    <div className="flex overflow-hidden rounded-[5px] border border-[#e7dfc9]">
      {opts.map(([v, label]) => (
        <button
          key={v} type="button" onClick={() => set(v)}
          className={`px-[6px] py-[2px] text-[10px] font-bold ${value === v ? 'bg-[#1f5a44] text-white' : 'bg-white text-[#5a6660]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Row({ r, onGo, onToggle, onDelete }: { r: Remark; onGo: () => void; onToggle: () => void; onDelete: () => void }) {
  const { resolutions } = useRemarks()
  const res = resolutions.get(r.id)
  const tone = res?.orphaned ? 'border-[#e8b4b4] bg-[#fdf6f6]' : res?.degraded ? 'border-[#ecd9a8] bg-[#fffaf0]' : 'border-[#eee6d4] bg-white'

  return (
    <div data-rmk="row" data-rmk-id={r.id} data-rmk-orphaned={res?.orphaned ? "1" : "0"} data-rmk-degraded={res?.degraded ? "1" : "0"} data-rmk-by={res?.resolvedBy ?? ""}
      className={`mb-[6px] rounded-[8px] border p-[8px] ${tone}`} style={{ fontFamily: FONT_SANS }}>
      <button type="button" onClick={onGo} className="block w-full text-start">
        <p className={`text-[12px] leading-[16px] ${r.status === 'resolved' ? 'text-[#8a938e] line-through' : 'text-[#23302a]'}`}>
          {/* Mixed-script remark text — isolated so a Latin tail cannot reorder across Arabic. */}
          <Iso>{r.remark}</Iso>
        </p>
        <p className="mt-[3px] text-[10px] text-[#8a938e]" dir="ltr">
          {r.route} · {r.lang}/{r.dir} · {r.viewportWidth}px · {r.author}
        </p>
        {res?.orphaned && (
          <p className="mt-[3px] text-[10px] font-bold text-[#b23b3b]" dir="ltr">
            ORPHANED — anchor not found. Last seen {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : 'never'}.
            {r.identifiers.text ? ` Was on: "${r.identifiers.text.slice(0, 48)}"` : ''}
          </p>
        )}
        {res?.degraded && !res.orphaned && (
          <p className="mt-[3px] text-[10px] font-bold text-[#b9842e]" dir="ltr">
            Anchor degraded: captured by `{r.capturedStrategy}`, now resolving by `{res.resolvedBy}`.
          </p>
        )}
      </button>
      <div className="mt-[6px] flex gap-[4px]">
        <button type="button" onClick={onToggle} className="rounded-[5px] bg-[#f0ece1] px-[6px] py-[2px] text-[10px] font-bold text-[#23302a]">
          {r.status === 'open' ? 'Resolve' : 'Reopen'}
        </button>
        <button type="button" onClick={onDelete} className="rounded-[5px] bg-[#f7ecec] px-[6px] py-[2px] text-[10px] font-bold text-[#b23b3b]">
          Delete
        </button>
      </div>
    </div>
  )
}
