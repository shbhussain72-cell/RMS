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
import { markExported, readExported, unexportedOf } from './storage'
import { IdentityPrompt, IdentityRow } from '../shared/IdentityPrompt'
import { hasAuthor } from '../shared/identity'
import { pushLocalRemarks, readLocalRemarks, unpushedLocal } from '../shared/remarksApi'
import { useT } from '../i18n'
import type { Remark } from './types'
import DevDock from '../dev/DevDock'
import { REVIEW_TOOLS, REVIEW_TOOLS_DEPLOYED } from '../reviewTools'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const chromeProps = { [CHROME_ATTR]: '', [SCANNER_IGNORE_ATTR]: '' }

type Scope = 'route' | 'all'
type StatusFilter = 'all' | 'open' | 'resolved'
type LangFilter = 'all' | 'en' | 'lsd'

export default function RemarksPanel() {
  if (!REVIEW_TOOLS) return null
  return <RemarksPanelInner />
}

function RemarksPanelInner() {
  const {
    enabled, setEnabled, panelOpen, setPanelOpen,
    remarks, resolutions, route, updateRemark, removeRemark,
    fixtureOn, setFixtureOn,
    reload, pendingWrites, storeError,
  } = useRemarks()
  const navigate = useNavigate()

  const [scope, setScope] = useState<Scope>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [langF, setLangF] = useState<LangFilter>('all')
  const [orphanOnly, setOrphanOnly] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const { t, tx } = useT()

  /**
   * Which remarks have reached me, keyed by the revision that did.
   *
   * Held in state rather than read on every render so that exporting updates the badge
   * immediately; `readExported()` seeds it once from the same store the export writes to.
   */
  const [named, setNamed] = useState(() => hasAuthor())
  const [busy, setBusy] = useState(false)
  const [pushNote, setPushNote] = useState<string | null>(null)
  const [localToPush, setLocalToPush] = useState(() => unpushedLocal(readLocalRemarks()).length)
  const [exported, setExported] = useState<Record<string, string>>(() => readExported())
  const unexported = useMemo(() => unexportedOf(remarks, exported), [remarks, exported])

  const exportAs = (kind: 'md' | 'json') => {
    if (kind === 'md') download('remarks.md', toMarkdown(remarks, resolutions), 'text/markdown')
    else download('remarks.json', toJson(remarks), 'application/json')
    setExported(markExported(remarks))
  }

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
          {/* Asked once, before anything can be written. Every remark and every dictionary
              revision carries this name, and it is the only attribution the shared store has. */}
          {!named && <IdentityPrompt onDone={() => setNamed(true)} />}

          <div className="border-b border-[#eee6d4] p-[10px]">
            <div className="flex items-center gap-[6px]">
              <button
                type="button" onClick={() => setEnabled(!enabled)}
                className={`rounded-[6px] px-[8px] py-[4px] text-[11px] font-bold ${enabled ? 'bg-[#b23b3b] text-white' : 'bg-[#1f5a44] text-white'}`}
                style={{ fontFamily: FONT_SANS }}
              >
                {enabled ? 'Exit remark mode' : 'Enter remark mode'}
              </button>
              <button
                type="button" data-rmk="refresh" onClick={() => { void reload() }}
                className="rounded-[6px] border border-[#d8cfb8] bg-white px-[8px] py-[4px] text-[11px] font-bold text-[#23302a]"
                title="Fetch everyone else's remarks now"
              >
                {t('Refresh')}
              </button>
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

          {/* Shared-store status. Every one of these is a statement the reviewer needs and
              would otherwise have to infer from an empty list. */}
          {(storeError || pendingWrites > 0 || localToPush > 0 || pushNote) && (
            <div className="border-b border-[#eee6d4] px-[10px] py-[8px] text-[10px] leading-[14px]" style={{ fontFamily: FONT_SANS }} dir="ltr">
              {storeError && (
                <p data-rmk="store-error" className="rounded-[6px] bg-[#fdf1f1] px-[8px] py-[6px] font-bold text-[#b23b3b]">
                  {storeError}
                </p>
              )}
              {pendingWrites > 0 && (
                <p data-rmk="pending" className="mt-[6px] rounded-[6px] bg-[#fdf6e7] px-[8px] py-[6px] font-bold text-[#8a6a1e]">
                  {t('{n} change(s) queued in this browser — not yet sent.', { n: pendingWrites })}
                </p>
              )}
              {localToPush > 0 && (
                <div className="mt-[6px] rounded-[6px] bg-[#f4f7f5] px-[8px] py-[6px]">
                  <p className="text-[#5a6660]">
                    {t('{n} remark(s) from before the shared store was set up are only in this browser.', { n: localToPush })}
                  </p>
                  <button
                    type="button" data-rmk="push-local" disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        const res = await pushLocalRemarks(readLocalRemarks())
                        // Reads back what actually landed. Says so honestly when some did not.
                        setPushNote(res.failed
                          ? t('Pushed {n} of {total}. {failed} did not arrive and are still here — try again.', { n: res.pushed, total: res.total, failed: res.failed })
                          : t('Pushed {n}. Your local copy is untouched.', { n: res.pushed }))
                        setLocalToPush(unpushedLocal(readLocalRemarks()).length)
                      } catch (err) {
                        setPushNote((err as Error).message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                    className="mt-[5px] rounded-[6px] bg-[#1f5a44] px-[8px] py-[4px] text-[10px] font-bold text-white disabled:opacity-40"
                  >
                    {busy ? t('Pushing…') : t('Push them to the shared store')}
                  </button>
                </div>
              )}
              {pushNote && <p data-rmk="push-note" className="mt-[6px] text-[#5a6660]">{pushNote}</p>}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-[8px]">
            {filtered.length === 0 ? (
              <p className="p-[10px] text-[11px] text-[#8a938e]" style={{ fontFamily: FONT_SANS }}>
                No remarks match. {remarks.length === 0 ? 'Enter remark mode and click any element.' : ''}
              </p>
            ) : filtered.map((r) => (
              <Row key={r.id} r={r} onGo={() => go(r)} onToggle={() => updateRemark(r.id, { status: r.status === 'open' ? 'resolved' : 'open' })} onDelete={() => removeRemark(r.id)} />
            ))}
          </div>

          {/* Export is the ONLY route out of this browser, so it is the panel's primary action
              rather than a line in a menu: full-width, first in the footer, and carrying the
              unexported count. A reviewer who never presses it has written nothing anybody
              else will ever read. */}
          <div className="border-t border-[#eee6d4] p-[8px]" style={{ fontFamily: FONT_SANS }}>
            <div className="mb-[8px]"><IdentityRow /></div>
            {/* The store is shared now, so the old "this browser only" line would be false —
                and a stale warning is worse than none: it tells a reviewer their work is
                private when six people can read it. */}
            {REVIEW_TOOLS_DEPLOYED && (
              <p className="mb-[8px] rounded-[6px] bg-[#eef4f1] px-[8px] py-[6px] text-[10px] leading-[14px] text-[#2c5347]"
                {...tx('Remarks are shared with every reviewer on this link. Export is for getting them into the tracker, not for sharing them.')} />
            )}
            <div className="flex gap-[6px]">
              <button
                type="button"
                data-rmk="export-md"
                onClick={() => exportAs('md')}
                disabled={remarks.length === 0}
                className="flex-1 rounded-[6px] bg-[#1f5a44] px-[8px] py-[6px] text-[11px] font-bold text-white disabled:opacity-40"
                title={t('Readable as-is — paste it straight into a message.')}
              >
                {t('Export Markdown')}{unexported.length > 0 ? ` (${unexported.length})` : ''}
              </button>
              <button
                type="button"
                data-rmk="export-json"
                onClick={() => exportAs('json')}
                disabled={remarks.length === 0}
                className="rounded-[6px] border border-[#d8cfb8] bg-white px-[8px] py-[6px] text-[11px] font-bold text-[#23302a] disabled:opacity-40"
                title={t('Round-trips back into the tool.')}
              >
                {t('JSON')}
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
        {/* Unexported is the count that matters on a shared URL: an open remark is work to do,
            an unexported one is work nobody else can see. Amber, and always shown when > 0. */}
        {unexported.length > 0 && (
          <span data-rmk="unexported" className="rounded-full bg-[#fdf6e7] px-[5px] text-[#8a6a1e]" title={t('Not yet exported')}>
            ↑{unexported.length}
          </span>
        )}
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
