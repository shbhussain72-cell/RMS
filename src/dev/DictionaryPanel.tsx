import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DevDock from './DevDock'
import { detectByteDamage, isNfc, type ByteDamageFinding } from './mojibake.mjs'
import { describeKanzChanges, normaliseKanz, type KanzChange } from '../i18n/kanzNorm.mjs'
import { allEntries, inspectKey, normKey, useLang } from '../i18n'
import { SCANNER_IGNORE_ATTR, classifyDetail, inventoryDom, type HitClassDetail, type InventoryResult } from '../i18n/domScan'
import { REVIEW_TOOLS } from '../reviewTools'
import {
  chooseConflict, dismissConflict, headFor, historyFor, isMerged, mergedOverrides,
  openConflicts, pendingOverrides, refresh, submit, subscribeDictionary,
  type Conflict, type Revision,
} from '../shared/dictionaryApi'
import { IdentityPrompt, IdentityRow } from '../shared/IdentityPrompt'
import { hasAuthor } from '../shared/identity'
import { fetchSyncStatus, isForceable, runSyncNow, type SyncStatus } from '../shared/syncApi'

/**
 * Dictionary editor.
 *
 * Two views of the same wordlist. MASTER is the whole dictionary, for finding a string you
 * know exists. PAGE is only what is rendered on the route you are looking at, which is the
 * view that actually gets used: it is the difference between "search 1078 rows" and "here are
 * the eleven strings on this screen that still need you".
 *
 * ── IT STAGES, IT DOES NOT TRANSLATE ─────────────────────────────────────────────────
 *
 * Nothing here authors, suggests, autocompletes or repairs a Lisan al-Dawat value. An edit is
 * stored exactly as typed, or refused. It becomes a revision in the shared store, and the sync
 * later writes it into the .xlsx cell by cell; it never touches `src/i18n/lsd.json`, which is
 * generated. See `docs/dictionary-editing.md` for the whole route and the sheet's constraints.
 *
 * ── EVERY WRITE IS AN APPEND ─────────────────────────────────────────────────────────
 *
 * Six people share this store and none of them is authenticated — the name on a revision is a
 * label, not a login. Overwrite-in-place would let one reviewer erase another's work with no
 * trace, so nothing is ever replaced: an edit appends, a revert appends, and resolving a
 * conflict appends the chosen value on top of both. The UI has to make that visible or the
 * safety is theoretical, which is why the history panel says it in words and the revert button
 * says what it will do rather than what it undoes.
 *
 * ── THE STATUS LINE IS DERIVED, NOT WRITTEN ──────────────────────────────────────────
 *
 * `storeLine()` reads the store's actual reachability rather than stating a fact about it. A
 * hard-coded "saved to the shared store" would have been true when written and false the first
 * time the API went down — the fifth worked example in `docs/assertion-discipline.md`, and the
 * reason the remarks panel spent a release telling reviewers their notes were private.
 *
 * ── THE CLASSES ──────────────────────────────────────────────────────────────────────
 *
 * Same A/B/C as the coverage scanner, because a second taxonomy would drift from the first:
 *
 *   A  the dictionary has a translation, and English is on screen anyway — a WIRING bug.
 *      Nothing to type; the string is not going through `t()`/`tx()`.
 *   ok the dictionary has a translation and the page is showing it. Nothing to do.
 *      This used to be reported as A, because the class was computed from the wordlist row and
 *      never from what was painted — 62 of the 63 "wiring bugs" on /miqaats were this.
 *   B1 the row exists and its value is blank — awaiting translation. The queue.
 *   B2 the row exists and its value is the English word — loanword identity, per
 *      `src/i18n/loanword-policy.json`. Already correct; needs nothing.
 *   C  no row at all. The sync appends a new row at the end of the sheet.
 *
 * Sentinel rows (the wordlist's `remove` marker) are shown as their own state.
 *
 * ── THE CLASS IS INFORMATION. IT IS NOT A PERMISSION ─────────────────────────────────
 *
 * Every row on the Page tab is editable and opens prefilled, whatever its class. It used to be
 * the other way round: class C opened an empty box (there is no wordlist row, so there was no
 * value to prefill with) and a sentinel row had no edit control at all. Both are rows a
 * reviewer can READ on screen — the string is rendered, it is right there — and could not
 * correct, which is the one thing this tab exists to let them do.
 *
 * `prefill()` is the whole rule, and it never consults the class: the wordlist's value if
 * there is one, otherwise the text this page is actually showing. See its own comment for the
 * two cases where the screen's text is not a value and the box therefore opens empty.
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
  ok: 'bg-[#eaf3ed] text-[#1f7a4d]',
}

/**
 * Imported, not re-derived. This split used to live here and in the scanner both; two copies
 * of a classification is two answers to "what is this string", and the per-route report reads
 * one of them while these badges read the other.
 */
const classify = classifyDetail

/**
 * What the edit box opens with, and where that text came from.
 *
 * ── WHY THE SCREEN IS A LEGITIMATE SOURCE ────────────────────────────────────────────
 *
 * A class-C row has no wordlist row, so `inspectKey().value` is `''` and the box opened
 * empty — on a string the reviewer is looking at, in a tab whose entire purpose is correcting
 * what is on the page. The same was true of every blank B1 row. The text IS available: the
 * inventory pass already carries what each row rendered, which for an untranslated string is
 * the English the page put on screen. Opening with it costs nothing and is what "correct what
 * I can see" means.
 *
 * The wordlist wins when it has a value, and that is not a hedge. On a class-A row the screen
 * shows English while the wordlist holds a real translation — the string simply is not wired
 * to the lookup. Prefilling the screen's English there would invite a reviewer to save English
 * over a finished translation, which is a worse failure than an empty box.
 *
 * ── THE TWO CASES THAT OPEN EMPTY, AND WHY ───────────────────────────────────────────
 *
 * `interpolated`  the row renders with its variables filled in — `Close in 00:42:11` for the
 *                key `Close in {time}`. That text is a value of the string at one instant, not
 *                a translation of it; saving it would write a timestamp into the wordlist and
 *                the placeholder would be gone. The row stays editable — the reviewer types the
 *                pattern — but there is nothing honest to prefill it with.
 * `source:none`  nothing rendered and nothing in the wordlist. Only reachable from the Master
 *                tab, which lists rows regardless of whether this page shows them.
 */
type Prefill = { value: string; draft: string; source: 'wordlist' | 'screen' | 'none' }

const prefill = (r: { english: string; rendered: string; interpolated: boolean }): Prefill => {
  const value = inspectKey(r.english).value
  if (value) return { value, draft: value, source: 'wordlist' }
  if (r.rendered && !r.interpolated) return { value, draft: r.rendered, source: 'screen' }
  return { value, draft: '', source: 'none' }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Absolute, never "2 hours ago" — two revisions a minute apart both read "just now" otherwise. */
const when = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const KIND_LABEL: Record<Revision['kind'], string> = {
  edit: 'edit',
  revert: 'revert',
  'new-row': 'new row',
}

/**
 * Renders nothing unless VITE_REVIEW_TOOLS is set: the constant folds to `false` and Rollup
 * drops this component, the mojibake module and the shared dictionary client with it. Same
 * gate as Remarks and Coverage, and `check-dev-only.mjs` measures both flag states — the
 * theory that this tree-shakes is not the same as the evidence that it did.
 */
export default function DictionaryPanel() {
  if (!REVIEW_TOOLS) return null
  return <DictionaryPanelInner />
}

function DictionaryPanelInner() {
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('page')
  const [q, setQ] = useState('')
  // Defaults OFF now that the Page tab is an inventory rather than a gap list. With it on, the
  // tab hides every translated string — which is most of a well-translated page, and is the
  // defect this pass exists to fix. It stays available: "show me only what needs work" is a
  // useful view, it is just not what "the strings on this page" means.
  const [needsOnly, setNeedsOnly] = useState(false)
  /**
   * The INVENTORY of this page, not the gap list.
   *
   * This was `scanDom().hits`, which rejects any node containing Arabic — so in LSD the Page tab
   * listed only the strings that were still English. A page showing 142 strings offered three.
   * `inventoryDom` keeps translated nodes and attributes each back to its English key, which is
   * what "the tab lists what is on the page" requires.
   */
  const [scan, setScan] = useState<InventoryResult | null>(null)
  const hits = scan?.hits ?? []
  const [, force] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [refused, setRefused] = useState<ByteDamageFinding[]>([])
  /**
   * What the last Kanz conversion changed, so the author can SEE it.
   *
   * Silently correcting somebody's text is not acceptable even when the correction is
   * right — and the odd-run rule in kanzNorm resolves an ambiguity by convention, so
   * "right" is doing some work in that sentence. Cleared whenever the draft is retyped.
   */
  const [converted, setConverted] = useState<readonly KanzChange[]>([])
  const [problem, setProblem] = useState('')
  const [queued, setQueued] = useState<string[]>([])
  const [named, setNamed] = useState(() => hasAuthor())
  const [storeError, setStoreError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const [history, setHistory] = useState<Revision[]>([])
  const highlighted = useRef<HTMLElement | null>(null)

  const pull = useCallback(async () => {
    setLoading(true)
    try { await refresh(); setStoreError('') }
    catch (err) { setStoreError(err instanceof Error ? err.message : String(err)) }
    finally { setLoading(false) }
    // Separately, and never fatal: a sync that has never run is a legitimate state, and the
    // editor still works without knowing what the last one did.
    try { setSync(await fetchSyncStatus()) } catch { /* status unavailable */ }
  }, [])

  // Only while the panel is open. A closed panel polling a shared store is six browsers of
  // traffic for a list nobody is looking at.
  useEffect(() => { if (open) void pull() }, [open, pull])
  useEffect(() => subscribeDictionary(() => force((n) => n + 1)), [])

  // Rescan when the panel opens and whenever the route changes under it. `scanDom` reads the
  // rendered DOM, so it can only ever report what is actually on screen right now — which is
  // also why the static sweep in `check-lsd-coverage.mjs` exists alongside it.
  const rescan = useCallback(() => { if (open) setScan(inventoryDom()) }, [open])
  useEffect(() => { rescan() }, [rescan, lang])
  useEffect(() => {
    if (!open) return
    const t = setInterval(rescan, 1200)
    return () => clearInterval(t)
  }, [open, rescan])

  const pending = pendingOverrides()
  const merged = mergedOverrides()
  const conflicts = openConflicts()

  const rows = useMemo(() => {
    // `rendered` is carried through rather than dropped. It was dropped, and that is why a
    // class-C row had nothing to open with: the inventory knew what the page was showing and
    // the row threw it away one line later.
    const base = tab === 'page'
      ? hits.map((h) => ({
          english: h.english, where: h.where, count: h.count, rendered: h.rendered,
          // `tx()` stamps `data-lsd-key` only when interpolation changed the string, so this is
          // exactly "the screen shows this key with its variables filled in". See `prefill`.
          interpolated: h.via === 'data-lsd-key' && h.rendered !== h.english,
        }))
      : allEntries().map((e) => ({ english: e.english, where: e.page ? `p.${e.page}` : '', count: 0, rendered: '', interpolated: false }))
    const needle = q.trim().toLowerCase()
    return base
      .map((r) => ({ ...r, cls: classify(r.english), ...prefill(r) }))
      .filter((r) => (!needsOnly || r.cls === 'A' || r.cls === 'B1' || r.cls === 'C'))
      .filter((r) => !needle || r.english.toLowerCase().includes(needle) || r.value.includes(q.trim()))
      .slice(0, 400)
  }, [tab, hits, q, needsOnly, pending.length, merged.length])

  const counts = useMemo(() => {
    const c: Record<Cls, number> = { A: 0, B1: 0, B2: 0, C: 0, sentinel: 0, ok: 0 }
    for (const h of hits) c[h.detail]++
    return c
  }, [hits, pending.length])

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

  const send = async (english: string, value: string, opts: Parameters<typeof submit>[2] = {}) => {
    setProblem('')
    try {
      await submit(english, value, opts)
      // OUTCOME, not mechanism: `submit` queues an unreachable write silently, so the only way
      // to know whether this landed is to ask the store what it now holds. A 201 is not proof
      // either — see the read-back in the remarks push, for the same reason.
      const landed = headFor(english)?.value === value
      setQueued((prev) => (landed ? prev.filter((k) => k !== english) : [...new Set([...prev, english])]))
      if (historyKey === english) void openHistory(english)
      return true
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  const commit = async (english: string) => {
    const found = detectByteDamage(draft)
    if (found.length) { setRefused(found); return }
    // NFC is a normalisation difference, not damage — normalise rather than refuse, and say so.
    const value = isNfc(draft) ? draft : draft.normalize('NFC')
    setRefused([])
    const kind: Revision['kind'] = inspectKey(english).exists ? 'edit' : 'new-row'
    if (await send(english, value, { kind })) { setEditing(null); setDraft('') }
  }

  const openHistory = async (english: string) => {
    setHistoryKey(english)
    setHistory([])
    try {
      const revs = await historyFor(english)
      setHistory([...revs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)))
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * The store's reachability, stated by reading it rather than by asserting it. Three states,
   * and the reviewer needs to be able to tell them apart: a store that is down is a very
   * different claim from a store that is empty.
   */
  const storeLine = (): { text: string; tone: string } => {
    if (storeError) return { text: `Shared store unreachable — ${storeError}. Edits are queued locally and will be sent when it comes back.`, tone: 'bg-[#f7ecec] text-[#b23b3b]' }
    if (queued.length) return { text: `${queued.length} edit(s) queued locally — not in the shared store yet.`, tone: 'bg-[#fdf3e2] text-[#a8721e]' }
    return { text: 'Edits are saved to the shared store and visible to everyone with the link.', tone: 'bg-[#eef3f0] text-[#5a6660]' }
  }
  const status = storeLine()

  return (
    <DevDock
      id="dictionary"
      {...{ [SCANNER_IGNORE_ATTR]: '' }}
      dir="ltr"
      className="pointer-events-none fixed bottom-[16px] end-[16px] z-[125] flex flex-col items-end gap-[6px]"
    >
      {open && (
        <div className="pointer-events-auto flex max-h-[74vh] w-[min(460px,calc(100vw-32px))] flex-col rounded-[12px] border border-[#d8cfb8] bg-white shadow-[0_16px_44px_-12px_rgba(21,64,47,0.45)]" style={{ fontFamily: FONT }}>
          <div className="flex items-center gap-[6px] border-b border-[#eee6d4] p-[10px]">
            {(['page', 'master'] as const).map((k) => (
              <button key={k} type="button" data-dict-tab={k} onClick={() => setTab(k)}
                className={`rounded-[6px] px-[8px] py-[3px] text-[11px] font-bold ${tab === k ? 'bg-[#1f5a44] text-white' : 'bg-[#f0ece1] text-[#5a6660]'}`}>
                {k === 'page' ? 'This page' : 'Master'}
              </button>
            ))}
            <input value={q} data-dict-filter onChange={(e) => setQ(e.target.value)} placeholder="filter…"
              className="min-w-0 flex-1 rounded-[6px] border border-[#e7dfc9] bg-[#faf8f2] px-[8px] py-[3px] text-[11px] outline-none" />
            <button type="button" onClick={() => void pull()} disabled={loading}
              className="shrink-0 rounded-[6px] bg-[#f0ece1] px-[7px] py-[3px] text-[10px] font-bold text-[#23302a] disabled:opacity-40">
              {loading ? '…' : 'Refresh'}
            </button>
            <label className="flex shrink-0 items-center gap-[4px] text-[10px] font-bold text-[#5a6660]">
              <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} />
              needs work
            </label>
          </div>

          <p className={`px-[10px] py-[5px] text-[10px] font-bold ${status.tone}`}>{status.text}</p>

          {!named && <div className="border-b border-[#eee6d4] p-[10px]"><IdentityPrompt onDone={() => setNamed(true)} /></div>}

          {problem && (
            <p className="border-b border-[#eee6d4] bg-[#f7ecec] px-[10px] py-[5px] text-[10px] font-bold text-[#b23b3b]">{problem}</p>
          )}

          {conflicts.map((c) => <ConflictCard key={c.key} conflict={c} onKeep={(w) => void keep(c, w)} />)}

          {tab === 'page' && (
            <div className="flex flex-wrap gap-[5px] border-b border-[#eee6d4] px-[10px] py-[6px] text-[10px] font-bold">
              {(['A', 'B1', 'B2', 'C', 'sentinel', 'ok'] as const).map((c) => (
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
              const head = headFor(r.english)
              const isPending = !!head && !isMerged(head)
              const isQueued = queued.includes(r.english)
              // No `editable` flag any more. There was one, it was `r.cls !== 'sentinel'`, and a
              // class is a description of a string rather than a statement about who may type.
              // What a sentinel row needs is the WARNING below, which the missing button was
              // standing in for — and standing in badly, because a disabled control explains
              // nothing and this row is the wordlist owner's to resolve either way.
              return (
                // `data-dict-*` are handles for `scripts/check-dictionary.mjs`, which drives these
                // rows the way a reviewer does — clicks the control, reads the box. Addressing them
                // by Tailwind class was the alternative and it makes the check a test of the
                // stylesheet. Free of charge: the panel's whole subtree is `data-lsd-scanner-ignore`,
                // so nothing here is ever inventoried as a string on the page.
                <div key={r.english} data-dict-row={r.english} data-dict-cls={r.cls}
                  className="border-b border-[#f2eee2] px-[10px] py-[7px]"
                  onMouseEnter={() => tab === 'page' && highlight(r.english)}>
                  <div className="flex items-start gap-[6px]">
                    <span className={`mt-[1px] shrink-0 rounded-[4px] px-[5px] py-[1px] text-[9px] font-bold ${CLS_STYLE[r.cls]}`}>{r.cls}</span>
                    <span className="min-w-0 flex-1 break-words text-[11px] text-[#23302a]">{r.english}</span>
                    {r.where && <span className="shrink-0 text-[9px] text-[#a9b1ab]">{r.where}</span>}
                  </div>
                  <div className="mt-[4px] flex items-center gap-[6px]">
                    {isEditing ? (
                      <>
                        <input autoFocus dir="rtl" data-dict-input value={draft}
                          onChange={(e) => { setDraft(e.target.value); setRefused([]); setConverted([]) }}
                          onPaste={(e) => {
                            // Convert Kanz keyboard output AT THE PASTE, not at save: the author
                            // is looking at the field now, and a conversion they can see is one
                            // they can reject. Class A is left to commit() — pasted damage should
                            // be refused with its explanation, not quietly half-fixed here.
                            const pasted = e.clipboardData.getData('text')
                            const kanz = normaliseKanz(pasted)
                            if (!kanz.changed) return
                            e.preventDefault()
                            const el = e.currentTarget
                            const next = draft.slice(0, el.selectionStart ?? draft.length) + kanz.value + draft.slice(el.selectionEnd ?? draft.length)
                            setDraft(next); setRefused([]); setConverted(kanz.changes)
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') void commit(r.english); if (e.key === 'Escape') { setEditing(null); setRefused([]); setConverted([]) } }}
                          className="min-w-0 flex-1 rounded-[6px] border border-[#c2a04e] bg-white px-[8px] py-[3px] text-[13px] outline-none" />
                        <button type="button" onClick={() => void commit(r.english)} className="shrink-0 rounded-[5px] bg-[#1f5a44] px-[7px] py-[3px] text-[10px] font-bold text-white">Save</button>
                      </>
                    ) : (
                      <>
                        {/* The wordlist's value, or — when it has none — the text this page is
                            showing, muted and labelled. A row that renders something must never
                            look blank here: blank is what "there is nothing to work with" looks
                            like, and it was wrong on every class-C string on the screen. */}
                        <span dir="rtl" className={`min-w-0 flex-1 truncate text-[13px] ${
                          r.source === 'screen' ? 'text-[#8a938e] italic' : isPending ? 'text-[#a8721e]' : 'text-[#23302a]'}`}>
                          {r.draft}
                        </span>
                        {r.source === 'screen' && <span className="shrink-0 text-[9px] text-[#a9b1ab]">on screen</span>}
                        <button type="button" disabled={!named} data-dict-edit
                          onClick={() => { setEditing(r.english); setDraft(r.draft); setRefused([]); setConverted([]); setProblem('') }}
                          className="shrink-0 rounded-[5px] bg-[#f0ece1] px-[7px] py-[3px] text-[10px] font-bold text-[#23302a] disabled:opacity-40">
                          {r.cls === 'C' && !head ? 'Add row' : 'Edit'}
                        </button>
                      </>
                    )}
                  </div>

                  {/* SAID, not enforced. Both of these are rows a reviewer can type into and
                      should be able to; what they cannot do is silently succeed. A control that
                      is simply absent teaches nothing, and the reviewer finds out what the tool
                      refuses to do by their edit never appearing in the sheet. */}
                  {r.cls === 'sentinel' && (
                    <p data-dict-sentinel-note className="mt-[3px] text-[10px] text-[#8a6a1e]">
                      Sentinel in the wordlist — the row holds an instruction, not a translation, and the
                      string falls back to English by design. You can stage an edit here, but the sync will
                      not overwrite a sentinel: the wordlist owner has to clear it first.
                    </p>
                  )}
                  {r.interpolated && (
                    <p className="mt-[3px] text-[10px] text-[#8a6a1e]">
                      Interpolated — the screen shows <code>{r.rendered}</code>, which is this string with its
                      variables filled in at render. Type the pattern with its <code>{'{…}'}</code> placeholders,
                      not what is on screen; the filled-in text would be stale the moment it was saved.
                    </p>
                  )}

                  {head && (
                    <div className="mt-[3px] flex flex-wrap items-center gap-[6px] text-[9px] text-[#8a938e]">
                      <span>{head.author} · {when(head.createdAt)} · {KIND_LABEL[head.kind]}</span>
                      {isQueued && <span className="rounded-[4px] bg-[#fdf3e2] px-[4px] py-[1px] font-bold text-[#a8721e]">queued locally</span>}
                      {isPending
                        ? <span className="rounded-[4px] bg-[#fdf3e2] px-[4px] py-[1px] font-bold text-[#a8721e]">not yet in the wordlist</span>
                        : <span className="rounded-[4px] bg-[#eef3f0] px-[4px] py-[1px] font-bold text-[#5a6660]">in the wordlist</span>}
                      <button type="button" onClick={() => void (historyKey === r.english ? setHistoryKey(null) : openHistory(r.english))}
                        className="font-bold text-[#1f5a44] underline">
                        {historyKey === r.english ? 'hide history' : 'history'}
                      </button>
                    </div>
                  )}

                  {historyKey === r.english && (
                    <HistoryList revisions={history} liveId={head?.revisionId} onRevert={(rev) => void revert(r.english, rev)} disabled={!named} />
                  )}

                  {isEditing && converted.length > 0 && (
                    <p className="mt-[4px] rounded-[5px] bg-[#eef3f0] px-[6px] py-[4px] text-[10px] text-[#1f5a44]">
                      Kanz input converted to Unicode: <code>{describeKanzChanges(converted)}</code>
                    </p>
                  )}
                  {isEditing && refused.map((f, i) => (
                    <p key={i} className="mt-[4px] rounded-[5px] bg-[#f7ecec] px-[6px] py-[4px] text-[10px] text-[#b23b3b]">
                      Refused ({f.kind}): {f.detail} — near <code>{f.sample}</code>
                    </p>
                  ))}
                </div>
              )
            })}
          </div>

          <div className="border-t border-[#eee6d4] p-[8px]">
            <SyncRow
              status={sync}
              busy={syncing}
              pending={pending.length}
              onRun={(force) => void runSync(force)}
            />
            <div className="mb-[6px]"><IdentityRow /></div>
            <div className="flex items-center gap-[6px]">
              <span className="flex-1 text-[10px] font-bold text-[#5a6660]">
                {/* Both numbers are COMPUTED from the retirement comparison, not narrated. A
                    hard-coded "some edits are pending" is the stale-notice failure waiting to
                    happen; a count cannot drift from the thing it counts. */}
                {pending.length} edit(s) not yet in the wordlist
                {merged.length > 0 && <span className="font-normal text-[#8a938e]"> · {merged.length} already merged</span>}
              </span>
              <a href="/api/dictionary-export" className={`rounded-[5px] px-[7px] py-[3px] text-[10px] font-bold ${pending.length ? 'bg-[#1f5a44] text-white' : 'pointer-events-none bg-[#f0ece1] text-[#a9b1ab]'}`}>
                Export patch
              </a>
            </div>
          </div>
        </div>
      )}

      <button type="button" data-dict-open onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex items-center gap-[5px] rounded-[7px] border border-[#d8cfb8] bg-white px-[8px] py-[4px] text-[11px] font-bold shadow-[0_4px_14px_-4px_rgba(21,64,47,0.4)]"
        style={{ fontFamily: FONT }} title="Dictionary editor">
        <span className="text-[#1f5a44]">◧ Dict</span>
        {pending.length > 0 && <span className="text-[#a8721e]">{pending.length}</span>}
        {conflicts.length > 0 && <span className="text-[#b23b3b]">⚠{conflicts.length}</span>}
      </button>
    </DevDock>
  )

  async function runSync(force: boolean) {
    setProblem('')
    setSyncing(true)
    try {
      const result = await runSyncNow(force)
      setSync(result)
      // A successful sync makes overrides merged, which is only visible once the COMMIT has
      // been built and deployed. Pulling now still matters: it picks up anything other
      // reviewers wrote while this was running.
      await pull()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }

  async function keep(c: Conflict, winner: Revision) {
    setProblem('')
    try { await chooseConflict(c.key, winner) }
    catch (err) { setProblem(err instanceof Error ? err.message : String(err)) }
  }

  async function revert(english: string, rev: Revision) {
    await send(english, rev.value, {
      kind: 'revert',
      revertOf: rev.revisionId,
      note: `reverted to ${rev.author}'s value of ${when(rev.createdAt)}`,
    })
  }
}

/**
 * Two values, two authors, two timestamps — and which one the app is rendering right now.
 *
 * A picker that shows two options without saying which is in effect is worse than no picker:
 * the reviewer picks the one they prefer, sees no change, and cannot tell whether the click
 * worked. The live marker is read from the store's own head, so it stays right even when the
 * answer is "neither" — someone else has edited again since the conflict was raised.
 */
function ConflictCard({ conflict, onKeep }: { conflict: Conflict; onKeep: (winner: Revision) => void }) {
  const liveId = headFor(conflict.key)?.revisionId
  const both = [conflict.mine, conflict.theirs]
  const neitherIsLive = !both.some((r) => r.revisionId === liveId)

  return (
    <div className="border-b border-[#eee6d4] bg-[#fdf8ee] px-[10px] py-[8px]">
      <p className="text-[10px] font-bold text-[#b23b3b]">
        ⚠ Two people edited this at the same time. Both are saved — pick the one that should be live.
      </p>
      <p className="mt-[2px] break-words text-[10px] text-[#5a6660]">{conflict.key}</p>

      {both.map((r) => {
        const live = r.revisionId === liveId
        return (
          <div key={r.revisionId} className={`mt-[6px] rounded-[6px] border p-[6px] ${live ? 'border-[#1f5a44] bg-white' : 'border-[#e7dfc9] bg-[#faf8f2]'}`}>
            <div className="flex items-center gap-[5px]">
              <span className={`rounded-[4px] px-[5px] py-[1px] text-[9px] font-bold ${live ? 'bg-[#1f5a44] text-white' : 'bg-[#f0ece1] text-[#5a6660]'}`}>
                {live ? 'LIVE NOW' : 'not applied'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-[#8a938e]">{r.author} · {when(r.createdAt)}</span>
            </div>
            <p dir="rtl" className="mt-[3px] break-words text-[13px] text-[#23302a]">{r.value || <span dir="ltr" className="text-[10px] text-[#a9b1ab]">(empty)</span>}</p>
            <button type="button" onClick={() => onKeep(r)}
              className="mt-[4px] rounded-[5px] bg-[#1f5a44] px-[7px] py-[3px] text-[10px] font-bold text-white">
              Keep this one
            </button>
          </div>
        )
      })}

      {neitherIsLive && (
        <p className="mt-[5px] text-[10px] font-bold text-[#a8721e]">
          Neither of these is live — the key has been edited again since. Open its history before choosing.
        </p>
      )}
      <p className="mt-[5px] text-[9px] text-[#8a938e]">
        Keeping one appends it as a new revision. The other stays in the history with its author's name on it —
        nothing is deleted, and nothing is merged.
      </p>
      <button type="button" onClick={() => dismissConflict(conflict.key)}
        className="mt-[4px] text-[9px] font-bold text-[#5a6660] underline">Decide later</button>
    </div>
  )
}

/**
 * Revision history, newest first.
 *
 * The wording is the feature. "Anyone can edit" is only safe if reverting a colleague's work is
 * visibly additive — someone who thinks they are erasing an edit behaves differently from
 * someone who knows they are adding to a record that keeps the other person's name. So the
 * button says what it does ("Revert — adds a revision") rather than what it undoes, and the
 * footer states the property outright.
 */
function HistoryList({ revisions, liveId, onRevert, disabled }: {
  revisions: Revision[]
  liveId?: string
  onRevert: (rev: Revision) => void
  disabled: boolean
}) {
  if (!revisions.length) return <p className="mt-[5px] text-[10px] text-[#a9b1ab]">Loading history…</p>

  return (
    <div className="mt-[5px] rounded-[6px] border border-[#e7dfc9] bg-[#faf8f2] p-[6px]">
      <p className="text-[9px] font-bold text-[#5a6660]">
        {revisions.length} revision{revisions.length === 1 ? '' : 's'}, newest first. Nothing here is ever deleted.
      </p>
      {revisions.map((r) => {
        const live = r.revisionId === liveId
        return (
          <div key={r.revisionId} className="mt-[5px] border-t border-[#eee6d4] pt-[5px] first:border-t-0 first:pt-0">
            <div className="flex items-center gap-[5px]">
              {live && <span className="rounded-[4px] bg-[#1f5a44] px-[4px] py-[1px] text-[9px] font-bold text-white">LIVE</span>}
              <span className="min-w-0 flex-1 truncate text-[9px] text-[#8a938e]">
                {r.author} · {when(r.createdAt)} · {KIND_LABEL[r.kind]}
                {r.revertOf && ' of an earlier revision'}
              </span>
              {!live && (
                <button type="button" disabled={disabled} onClick={() => onRevert(r)}
                  className="shrink-0 rounded-[5px] bg-[#f0ece1] px-[6px] py-[2px] text-[9px] font-bold text-[#23302a] disabled:opacity-40">
                  Revert — adds a revision
                </button>
              )}
            </div>
            <p dir="rtl" className="mt-[2px] break-words text-[12px] text-[#23302a]">
              {r.value || <span dir="ltr" className="text-[10px] text-[#a9b1ab]">(empty)</span>}
            </p>
            {r.note && <p className="text-[9px] italic text-[#a9b1ab]">{r.note}</p>}
          </div>
        )
      })}
      <p className="mt-[6px] border-t border-[#eee6d4] pt-[4px] text-[9px] text-[#8a938e]">
        Reverting appends a new revision on top. The edit you revert stays in the record, with its
        author's name and time — you are adding to the history, not erasing anyone's work.
      </p>
    </div>
  )
}

/**
 * What the last sync did, and the button that runs another one.
 *
 * Every abort the sync can produce is something a person has to act on — a value that arrived
 * as mojibake, a run that would have rewritten a fifth of the sheet, a spreadsheet edited by
 * hand while the cron was mid-flight. So aborts are rendered in full here rather than
 * summarised: "the sync failed" tells a reviewer nothing they can do, and the pending count
 * would otherwise climb with no explanation attached to it.
 *
 * `force` appears only when the change-share rail is what stopped the run, because that is the
 * only abort it overrides. A force button next to a mojibake abort would invite someone to
 * push damaged text into the corpus.
 */
function SyncRow({ status, busy, pending, onRun }: {
  status: SyncStatus | null
  busy: boolean
  pending: number
  onRun: (force: boolean) => void
}) {
  const wrote = status ? status.updated.length + status.appended.length : 0
  const line = !status
    ? 'The wordlist sync has not run yet.'
    : status.ok
      ? wrote === 0
        ? `Last sync ${when(status.at)} (${status.trigger}): nothing to write.`
        : `Last sync ${when(status.at)} (${status.trigger}): ${status.updated.length} updated, ${status.appended.length} appended.`
      : `Last sync ${when(status.at)} (${status.trigger}) was refused. Nothing was committed.`

  return (
    <div className="mb-[6px] rounded-[6px] border border-[#e7dfc9] bg-[#faf8f2] p-[6px]">
      <div className="flex items-center gap-[6px]">
        <span className={`min-w-0 flex-1 text-[9px] font-bold ${status && !status.ok ? 'text-[#b23b3b]' : 'text-[#5a6660]'}`}>
          {line}
        </span>
        <button type="button" disabled={busy} onClick={() => onRun(false)}
          className="shrink-0 rounded-[5px] bg-[#1f5a44] px-[7px] py-[3px] text-[10px] font-bold text-white disabled:opacity-40">
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {status?.commit && (
        <p className="mt-[2px] text-[9px] text-[#8a938e]">
          Commit {status.commit.slice(0, 7)}. The new text appears once that commit is built and deployed.
        </p>
      )}

      {status?.aborts.map((a, i) => (
        <p key={i} className="mt-[3px] rounded-[5px] bg-[#f7ecec] px-[6px] py-[4px] text-[9px] text-[#b23b3b]">{a}</p>
      ))}

      {isForceable(status) && (
        <button type="button" disabled={busy} onClick={() => onRun(true)}
          className="mt-[3px] rounded-[5px] border border-[#b23b3b] px-[6px] py-[2px] text-[9px] font-bold text-[#b23b3b] disabled:opacity-40">
          Run it anyway — I have seen how many rows change
        </button>
      )}

      {!!status?.skipped.length && (
        <details className="mt-[3px]">
          <summary className="cursor-pointer text-[9px] text-[#8a938e]">{status.skipped.length} skipped</summary>
          {status.skipped.map((s) => (
            <p key={s.key} className="text-[9px] text-[#8a938e]"><span className="font-bold">{s.key}</span> — {s.why}</p>
          ))}
        </details>
      )}

      {pending > 0 && status?.ok && wrote === 0 && (
        // The one combination that reads as a contradiction and is not: everything pending is
        // waiting on something the sync will not do — a blank value, a sentinel row, or a
        // deploy that has not happened yet.
        <p className="mt-[2px] text-[9px] text-[#a8721e]">
          {pending} edit(s) are still pending but none were eligible — open the skipped list, or wait for the last commit to deploy.
        </p>
      )}
    </div>
  )
}
