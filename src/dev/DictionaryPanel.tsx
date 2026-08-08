import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DevDock from './DevDock'
import { detectMojibake, isNfc, type MojibakeFinding } from './mojibake'
import { clearAllOverrides, getOverrides, loadOverrides, overrideCount, setOverride, subscribeOverrides } from './overrides'
import { allEntries, inspectKey, normKey, useLang } from '../i18n'
import { SCANNER_IGNORE_ATTR, classifyDetail, scanDom, type HitClassDetail, type ScanHit } from '../i18n/domScan'

/**
 * Dictionary editor — dev-only.
 *
 * Two views of the same wordlist. MASTER is the whole dictionary, for finding a string you
 * know exists. PAGE is only what is rendered on the route you are looking at, which is the
 * view that actually gets used: it is the difference between "search 1078 rows" and "here are
 * the eleven strings on this screen that still need you".
 *
 * ── IT STAGES, IT DOES NOT TRANSLATE ─────────────────────────────────────────────────
 *
 * Nothing here authors, suggests, autocompletes or repairs a Lisan al-Dawat value. An edit is
 * stored exactly as typed, or refused. It goes to `wordlist-overrides.json`, never to
 * `src/i18n/lsd.json` (generated) and never to the .xlsx (the source of truth) — the way an
 * edit becomes real is that a human exports the patch and pastes it into the spreadsheet.
 * The build refuses to run while anything is still staged, so that step cannot be skipped.
 *
 * ── THE CLASSES ──────────────────────────────────────────────────────────────────────
 *
 * Same A/B/C as the coverage scanner, because a second taxonomy would drift from the first:
 *
 *   A  the dictionary has a translation, and English is on screen anyway — a WIRING bug.
 *      Nothing to type; the string is not going through `t()`/`tx()`.
 *   B1 the row exists and its value is blank — awaiting translation. The queue.
 *   B2 the row exists and its value is the English word — loanword identity, per
 *      `src/i18n/loanword-policy.json`. Already correct; needs nothing.
 *   C  no row at all. Cannot be fixed here: a row has to be added to the .xlsx, which is
 *      what the exported patch is for.
 *
 * Sentinel rows (the wordlist's `remove` marker) are shown as their own state and left alone.
 * They fall back to English on purpose and are the wordlist owner's to resolve.
 */

const FONT = 'Mulish, system-ui, sans-serif'

type Tab = 'page' | 'master'
type Cls = HitClassDetail

const CLS_STYLE: Record<Cls, string> = {
  A: 'bg-[#f7ecec] text-[#b23b3b]',
  B1: 'bg-[#fdf3e2] text-[#a8721e]',
  B2: 'bg-[#eef3f0] text-[#5a6660]',
  C: 'bg-[#f0ecf7] text-[#5a4ba3]',
  sentinel: 'bg-[#f0ece1] text-[#8a6a1e]',
}

/**
 * Imported, not re-derived. This split used to live here and in the scanner both; two copies
 * of a classification is two answers to "what is this string", and the per-route report reads
 * one of them while these badges read the other.
 */
const classify = classifyDetail

/**
 * Renders nothing in a production build: `import.meta.env.DEV` is statically false, so the
 * bundler drops this component, the override client and the mojibake module together. Same
 * gate as `CoveragePanel`, and `wordlist-overrides` is on `check-dev-only.mjs`'s forbidden
 * list so a leak fails the build rather than shipping quietly.
 */
export default function DictionaryPanel() {
  if (!import.meta.env.DEV) return null
  return <DictionaryPanelInner />
}

function DictionaryPanelInner() {
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('page')
  const [q, setQ] = useState('')
  const [needsOnly, setNeedsOnly] = useState(true)
  const [hits, setHits] = useState<ScanHit[]>([])
  const [, force] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [refused, setRefused] = useState<MojibakeFinding[]>([])
  const highlighted = useRef<HTMLElement | null>(null)

  useEffect(() => { void loadOverrides() }, [])
  useEffect(() => subscribeOverrides(() => force((n) => n + 1)), [])

  // Rescan when the panel opens and whenever the route changes under it. `scanDom` reads the
  // rendered DOM, so it can only ever report what is actually on screen right now — which is
  // also why the static sweep in `check-lsd-coverage.mjs` exists alongside it.
  const rescan = useCallback(() => { if (open) setHits(scanDom().hits) }, [open])
  useEffect(() => { rescan() }, [rescan, lang])
  useEffect(() => {
    if (!open) return
    const t = setInterval(rescan, 1200)
    return () => clearInterval(t)
  }, [open, rescan])

  const staged = getOverrides()

  const rows = useMemo(() => {
    const base = tab === 'page'
      ? hits.map((h) => ({ english: h.text, where: h.where, count: h.count }))
      : allEntries().map((e) => ({ english: e.english, where: e.page ? `p.${e.page}` : '', count: 0 }))
    const needle = q.trim().toLowerCase()
    return base
      .map((r) => ({ ...r, cls: classify(r.english), value: inspectKey(r.english).value }))
      .filter((r) => (!needsOnly || r.cls === 'A' || r.cls === 'B1' || r.cls === 'C'))
      .filter((r) => !needle || r.english.toLowerCase().includes(needle) || r.value.includes(q.trim()))
      .slice(0, 400)
  }, [tab, hits, q, needsOnly, staged])

  const counts = useMemo(() => {
    const c: Record<Cls, number> = { A: 0, B1: 0, B2: 0, C: 0, sentinel: 0 }
    for (const h of hits) c[classify(h.text)]++
    return c
  }, [hits, staged])

  /** Outline the live element a row came from, and scroll it into view. */
  const highlight = (english: string) => {
    if (highlighted.current) { highlighted.current.style.outline = ''; highlighted.current = null }
    const key = normKey(english)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (normKey(n.nodeValue ?? '') !== key) continue
      const el = (n as Text).parentElement
      if (!el || el.closest(`[${SCANNER_IGNORE_ATTR}]`)) continue
      el.style.outline = '2px solid #b23b3b'
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      highlighted.current = el
      return
    }
  }

  const commit = async (english: string) => {
    const found = detectMojibake(draft)
    if (found.length) { setRefused(found); return }
    // NFC is a normalisation difference, not damage — normalise rather than refuse, and say so.
    const value = isNfc(draft) ? draft : draft.normalize('NFC')
    setRefused([])
    await setOverride(english, value)
    setEditing(null)
    setDraft('')
  }

  const pending = overrideCount()

  return (
    <DevDock
      id="dictionary"
      {...{ [SCANNER_IGNORE_ATTR]: '' }}
      dir="ltr"
      className="pointer-events-none fixed bottom-[16px] end-[16px] z-[125] flex flex-col items-end gap-[6px]"
    >
      {open && (
        <div className="pointer-events-auto flex max-h-[70vh] w-[min(460px,calc(100vw-32px))] flex-col rounded-[12px] border border-[#d8cfb8] bg-white shadow-[0_16px_44px_-12px_rgba(21,64,47,0.45)]" style={{ fontFamily: FONT }}>
          <div className="flex items-center gap-[6px] border-b border-[#eee6d4] p-[10px]">
            {(['page', 'master'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`rounded-[6px] px-[8px] py-[3px] text-[11px] font-bold ${tab === k ? 'bg-[#1f5a44] text-white' : 'bg-[#f0ece1] text-[#5a6660]'}`}>
                {k === 'page' ? 'This page' : 'Master'}
              </button>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…"
              className="min-w-0 flex-1 rounded-[6px] border border-[#e7dfc9] bg-[#faf8f2] px-[8px] py-[3px] text-[11px] outline-none" />
            <label className="flex shrink-0 items-center gap-[4px] text-[10px] font-bold text-[#5a6660]">
              <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} />
              needs work
            </label>
          </div>

          {tab === 'page' && (
            <div className="flex flex-wrap gap-[5px] border-b border-[#eee6d4] px-[10px] py-[6px] text-[10px] font-bold">
              {(['A', 'B1', 'B2', 'C', 'sentinel'] as const).map((c) => (
                <span key={c} className={`rounded-[5px] px-[6px] py-[2px] ${CLS_STYLE[c]}`}>{c} {counts[c]}</span>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 && (
              <p className="p-[12px] text-[11px] text-[#8a938e]">
                {tab === 'page' ? 'Nothing on this route needs attention.' : 'No matches.'}
              </p>
            )}
            {rows.map((r) => {
              const isEditing = editing === r.english
              const stagedVal = staged[normKey(r.english)]?.lsd
              return (
                <div key={r.english} className="border-b border-[#f2eee2] px-[10px] py-[7px]"
                  onMouseEnter={() => tab === 'page' && highlight(r.english)}>
                  <div className="flex items-start gap-[6px]">
                    <span className={`mt-[1px] shrink-0 rounded-[4px] px-[5px] py-[1px] text-[9px] font-bold ${CLS_STYLE[r.cls]}`}>{r.cls}</span>
                    <span className="min-w-0 flex-1 break-words text-[11px] text-[#23302a]">{r.english}</span>
                    {r.where && <span className="shrink-0 text-[9px] text-[#a9b1ab]">{r.where}</span>}
                  </div>
                  <div className="mt-[4px] flex items-center gap-[6px]">
                    {r.cls === 'C' ? (
                      <span className="text-[10px] text-[#5a4ba3]">no wordlist row — add via the exported patch</span>
                    ) : r.cls === 'sentinel' ? (
                      <span className="text-[10px] text-[#8a6a1e]">sentinel in the wordlist — falls back to English by design</span>
                    ) : isEditing ? (
                      <>
                        <input autoFocus dir="rtl" value={draft} onChange={(e) => { setDraft(e.target.value); setRefused([]) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') void commit(r.english); if (e.key === 'Escape') { setEditing(null); setRefused([]) } }}
                          className="min-w-0 flex-1 rounded-[6px] border border-[#c2a04e] bg-white px-[8px] py-[3px] text-[13px] outline-none" />
                        <button type="button" onClick={() => void commit(r.english)} className="shrink-0 rounded-[5px] bg-[#1f5a44] px-[7px] py-[3px] text-[10px] font-bold text-white">Stage</button>
                      </>
                    ) : (
                      <>
                        <span dir="rtl" className={`min-w-0 flex-1 truncate text-[13px] ${stagedVal ? 'text-[#a8721e]' : 'text-[#23302a]'}`}>
                          {stagedVal ?? inspectKey(r.english).value ?? ''}
                        </span>
                        <button type="button" onClick={() => { setEditing(r.english); setDraft(stagedVal ?? ''); setRefused([]) }}
                          className="shrink-0 rounded-[5px] bg-[#f0ece1] px-[7px] py-[3px] text-[10px] font-bold text-[#23302a]">
                          {stagedVal ? 'staged' : 'Add'}
                        </button>
                      </>
                    )}
                  </div>
                  {isEditing && refused.map((f, i) => (
                    <p key={i} className="mt-[4px] rounded-[5px] bg-[#f7ecec] px-[6px] py-[4px] text-[10px] text-[#b23b3b]">
                      Refused ({f.kind}): {f.detail} — near <code>{f.sample}</code>
                    </p>
                  ))}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-[6px] border-t border-[#eee6d4] p-[8px]">
            <span className="flex-1 text-[10px] font-bold text-[#5a6660]">{pending} staged</span>
            <a href="/__lsd/patch.xlsx" className={`rounded-[5px] px-[7px] py-[3px] text-[10px] font-bold ${pending ? 'bg-[#1f5a44] text-white' : 'pointer-events-none bg-[#f0ece1] text-[#a9b1ab]'}`}>
              Export patch
            </a>
            <button type="button" disabled={!pending} onClick={() => void clearAllOverrides()}
              className="rounded-[5px] bg-[#f7ecec] px-[7px] py-[3px] text-[10px] font-bold text-[#b23b3b] disabled:opacity-40">
              Clear
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex items-center gap-[5px] rounded-[7px] border border-[#d8cfb8] bg-white px-[8px] py-[4px] text-[11px] font-bold shadow-[0_4px_14px_-4px_rgba(21,64,47,0.4)]"
        style={{ fontFamily: FONT }} title="Dictionary editor">
        <span className="text-[#1f5a44]">◧ Dict</span>
        {pending > 0 && <span className="text-[#a8721e]">{pending}</span>}
      </button>
    </DevDock>
  )
}
