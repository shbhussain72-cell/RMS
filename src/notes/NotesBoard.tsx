/**
 * NotesBoard — the review notes for the page you are on.
 *
 * Top-inline-END, in a `DevDock`, with the same grip and the same eye as the other dev widgets.
 * That corner was the remarks panel's; remarks is retired (see `main.tsx`) and this takes it, so
 * the dev chrome still occupies three corners rather than four.
 *
 * ── WHAT IS ON A NOTE, AND WHAT IS NOT ───────────────────────────────────────────────
 *
 * Text, author, date, language. The recovered notes also carry the element they used to be
 * pinned to, and that is shown as a grey line of CONTEXT — nothing resolves it, nothing
 * highlights it, and it has no bearing on where the note lives. It is there because
 * ``` `p` — "ITS ID" ``` tells a reader which of four inputs somebody meant, and throwing it
 * away during the recovery would have lost that for nothing.
 *
 * ── LANGUAGE IS RECORDED, NEVER ASKED ────────────────────────────────────────────────
 *
 * A note is stamped with the language the app was in when it was written, because most findings
 * here belong to exactly one of the two — a clipped label in LSD is not a finding in English.
 * Asking would be one more field to get wrong; the app already knows.
 *
 * ── LOCAL, AND IT SAYS SO ────────────────────────────────────────────────────────────
 *
 * These notes are in this browser and nowhere else. That is stated on the board rather than
 * discovered, in the same place and the same tone as the identity disclaimer, because the
 * failure it prevents — writing twenty notes and assuming somebody received them — is silent,
 * and the reviewer has no way to notice it on their own.
 *
 * ── POINTING IS OPTIONAL, AND IT IS NOT AN ANCHOR ────────────────────────────────────
 *
 * "Point at something" enters pick mode: hover outlines, click captures. What is stored is the
 * element's visible text and its tag — never a selector — and it is resolved once, at capture
 * time, by `src/notes/target.ts`. A note with no target is an ordinary note; most of the 48
 * recovered ones are about the screen rather than about a control on it, and forcing those onto
 * an arbitrary element would make every marker on the image worth less.
 *
 * DEV ONLY, behind `REVIEW_TOOLS`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Iso } from '../components/Bidi'
import { SCANNER_IGNORE_ATTR } from '../i18n/domScan'
import { useT } from '../i18n'
import DevDock from '../dev/DevDock'
import { REVIEW_TOOLS } from '../reviewTools'
import { IdentityPrompt, IdentityRow } from '../shared/IdentityPrompt'
import { getAuthor, hasAuthor } from '../shared/identity'
import { addNote, newNoteId, readBoard, removeNote, updateNote, useBoard, writeBoard } from './store'
import { describeImport, planImport } from './import'
import { planSeed } from './seed'
import { DEFAULT_FILTER, filterNotes, type LangFilter, type NoteFilter, type Scope, type StatusFilter } from './filter'
import { download, exportName, MONTHS, toJson, toMarkdown } from './export'
import { useRoutePattern } from './useRoutePattern'
import { CHROME, labelOf, targetFrom } from './target'
import type { Note, NoteTarget } from './types'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const chromeProps = { [SCANNER_IGNORE_ATTR]: '' }

/**
 * The outline under the cursor in pick mode.
 *
 * `pointer-events: none` and portalled to <body>, so it neither eats the click it is describing
 * nor gets clipped by the dock it is rendered from. Carries the chrome attribute, which is what
 * keeps it out of the capture and out of its own label lookup.
 */
function PickOutline({ el }: { el: HTMLElement }) {
  const r = el.getBoundingClientRect()
  const label = labelOf(el)
  return createPortal(
    <div
      {...chromeProps}
      data-notes="pick-outline"
      className="pointer-events-none fixed z-[140] rounded-[3px]"
      style={{
        top: r.top, left: r.left, width: r.width, height: r.height,
        outline: '2px solid #1f5a44', background: 'rgba(31,90,68,0.10)',
      }}
    >
      {!!label && (
        <span
          className="absolute top-full mt-[2px] max-w-[240px] truncate rounded-[4px] bg-[#23302a] px-[5px] py-[2px] text-[10px] text-white"
          style={{ insetInlineStart: 0 }}
          dir="auto"
        >
          {label}
        </span>
      )}
    </div>,
    document.body,
  )
}

/**
 * `10 Aug` on a row — short because it sits in a metadata line that must not wrap at 390px.
 *
 * The month names come from `export.ts` rather than a second array here: two lists of twelve
 * strings is two things to get wrong, and they would drift in the direction of a note reading
 * `10 Aug` on the board and `10 August` in the file it exports to.
 */
const shortDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : `${d.getDate()} ${MONTHS[d.getMonth()]?.slice(0, 3)}`
}

export default function NotesBoard() {
  if (!REVIEW_TOOLS) return null
  return <NotesBoardInner />
}

function NotesBoardInner() {
  const route = useRoutePattern()
  const board = useBoard()
  const { t, lang } = useT()

  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>(DEFAULT_FILTER.scope)
  const [status, setStatus] = useState<StatusFilter>(DEFAULT_FILTER.status)
  const [langF, setLangF] = useState<LangFilter>(DEFAULT_FILTER.lang)
  const [draft, setDraft] = useState('')
  const [named, setNamed] = useState(() => hasAuthor())
  const [picking, setPicking] = useState(false)
  const [aim, setAim] = useState<NoteTarget | null>(null)

  const filter = useMemo<NoteFilter>(() => ({ scope, status, lang: langF }), [scope, status, langF])
  const shown = useMemo(() => filterNotes(board.notes, filter, route), [board.notes, filter, route])

  // The chip's number is THIS PAGE's outstanding work, whatever the board's filters are set to —
  // it has to mean the same thing on every screen you walk past.
  const openHere = board.notes.filter((n) => n.route === route && n.status === 'open').length

  const [busy, setBusy] = useState<string | null>(null)
  const [hover, setHover] = useState<HTMLElement | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [pngNote, setPngNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /**
   * SEEDING, ONCE, BEFORE THE BOARD IS EVER SHOWN.
   *
   * In an effect rather than during render because it writes to localStorage, and in THIS
   * component because it is the only thing that reads the board — a seed that ran from
   * `main.tsx` would run on every page of the app whether or not the tooling was ever opened.
   *
   * `readBoard()` and not the `board` from the hook: under StrictMode this effect runs twice on
   * mount, and the hook's value is a snapshot from before the first pass wrote. Reading through
   * gives the second pass the `seeded: true` the first one just set, so it does nothing —
   * without it, the seed would apply twice and 48 notes would arrive as 96.
   */
  useEffect(() => {
    const next = planSeed(readBoard())
    if (next) writeBoard(next)
  }, [])

  /**
   * PICK MODE — window listeners in the CAPTURE phase, not an overlay.
   *
   * Taken from the retired `RemarksLayer`, which got this right and paid for it first. A
   * full-screen catcher div is the obvious implementation and it breaks `elementFromPoint`, so
   * every hit test in the app — and in the harness — starts returning the catcher. Capture-phase
   * listeners leave the page exactly as it is; when pick mode is off there is nothing over it.
   *
   * mousedown and mouseup are swallowed as well as click. Blocking click alone still lets the app
   * SEE the press: a button shows its active state, an `onMouseDown` handler runs, and a reviewer
   * who only wanted to point at "Register now" has just submitted a registration.
   */
  useEffect(() => {
    if (!picking) return
    const mine = (t: EventTarget | null) => t instanceof HTMLElement && !t.closest(CHROME)

    const onMove = (e: MouseEvent) => setHover(mine(e.target) ? (e.target as HTMLElement) : null)
    const swallow = (e: MouseEvent) => {
      if (!mine(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type !== 'click') return
      const picked = targetFrom(e.target as HTMLElement)
      // An element with no text cannot be matched later, so pointing at one is refused rather
      // than stored as a target that can never resolve to anything.
      if (picked) { setAim(picked); setPicking(false) }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setPicking(false) }
    }
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mousedown', swallow, true)
    window.addEventListener('mouseup', swallow, true)
    window.addEventListener('click', swallow, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mousedown', swallow, true)
      window.removeEventListener('mouseup', swallow, true)
      window.removeEventListener('click', swallow, true)
      window.removeEventListener('keydown', onKey, true)
      setHover(null)
    }
  }, [picking])

  // Leaving the screen cancels the aim with it: a target captured on one route would be stored
  // against a note on another, and the label would then resolve on a page it was never about.
  useEffect(() => { setAim(null); setPicking(false) }, [route])

  const runImport = async (file: File) => {
    setBusy('import')
    setImportNote(null)
    try {
      const result = planImport(readBoard().notes, JSON.parse(await file.text()))
      const current = readBoard()
      writeBoard({ ...current, notes: [...current.notes, ...result.added] })
      setImportNote(describeImport(result))
    } catch (err) {
      // Shown, never swallowed. "0 added" for a file that was never a notes export is the one
      // outcome somebody would read as "the import works and the file was empty".
      setImportNote((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /**
   * WHAT THE BOARD SHOWS IS WHAT EXPORTS.
   *
   * Every one of these takes `shown` — the same array the list above renders and the same one
   * the button's count is the length of. There is no path here that reaches the store, which is
   * the only arrangement in which the three cannot disagree.
   *
   * `filenameRoute` is the route only when the export is pinned to one; an "all screens" file
   * named after whichever page you happened to be on when you pressed it is a file that lies in
   * the one place people read without opening.
   */
  const filenameRoute = scope === 'route' ? route : undefined
  const exportAs = async (kind: 'json' | 'md' | 'png') => {
    if (kind === 'json') {
      download(exportName('json', filenameRoute), toJson(shown), 'application/json')
      return
    }
    if (kind === 'md') {
      download(exportName('md', filenameRoute), toMarkdown(shown, { filter, route }), 'text/markdown')
      return
    }
    // The PNG rasterises the live page, so the board has to be out of the way first — and the
    // capture cannot start until the browser has actually painted without it.
    setBusy('png')
    setPngNote(null)
    setOpen(false)
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const { capturePage, describeCapture } = await import('./png')
      const { blob, summary } = await capturePage(shown, {
        route: scope === 'route' ? route : 'all screens',
        lang: lang === 'lsd' ? 'lsd' : 'en',
        t,
      })
      download(exportName('png', filenameRoute), blob)
      // WHAT THE IMAGE SAYS, IN THE DOM. The strip states its own caveats and nobody can read a
      // rasterised sentence back — including the person who just exported it, who is the one who
      // can still do something about a target that no longer resolves.
      setPngNote(describeCapture(summary, t))
    } catch (err) {
      // Said, not swallowed. A capture that fails silently leaves somebody waiting for a
      // download that is never coming, with a board that looks like it worked.
      setPngNote((err as Error).message || 'the capture failed')
    } finally {
      setBusy(null)
      setOpen(true)
    }
  }

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    addNote({
      id: newNoteId(),
      text,
      route,
      lang: lang === 'lsd' ? 'lsd' : 'en',
      status: 'open',
      createdAt: new Date().toISOString(),
      author: getAuthor() || 'unknown',
      source: 'typed',
      target: aim ?? undefined,
    })
    setDraft('')
    setAim(null)
  }

  return (
    <DevDock
      id="notes"
      {...chromeProps}
      className="pointer-events-none fixed top-[16px] end-[16px] z-[130] flex flex-col items-end gap-[6px]"
    >
      {open && (
        <div
          data-notes="board"
          className="pointer-events-auto flex max-h-[76vh] w-[min(360px,calc(100vw-32px))] flex-col rounded-[12px] border border-[#d8cfb8] bg-white shadow-[0_16px_44px_-12px_rgba(21,64,47,0.45)]"
          style={{ fontFamily: FONT_SANS }}
        >
          {!named && <IdentityPrompt onDone={() => setNamed(true)} />}

          <div className="border-b border-[#eee6d4] p-[10px]">
            {/* Said once, at the top, before anything is written. */}
            <p data-notes="local-notice" className="mb-[8px] rounded-[6px] bg-[#eef4f1] px-[8px] py-[6px] text-[10px] leading-[14px] text-[#2c5347]">
              {t('These notes are saved in this browser only. Nobody else can see them. Export to share.')}
            </p>

            <p className="mb-[6px] text-[10px] font-bold uppercase tracking-[0.5px] text-[#8a938e]" dir="ltr">
              {route}
            </p>

            <div className="flex flex-wrap gap-[4px]">
              <Seg group="scope" value={scope} set={setScope} opts={[['route', t('This page')], ['all', t('All')]]} />
              <Seg group="status" value={status} set={setStatus} opts={[['open', t('Open')], ['resolved', t('Done')], ['all', t('All')]]} />
              <Seg group="lang" value={langF} set={setLangF} opts={[['all', t('Any')], ['en', 'EN'], ['lsd', 'LSD']]} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-[8px]">
            {shown.length === 0 ? (
              <p data-notes="empty" className="p-[10px] text-[11px] leading-[15px] text-[#8a938e]">
                {board.notes.length === 0
                  ? t('No notes yet. Write one below.')
                  : t('No notes match these filters.')}
              </p>
            ) : shown.map((n) => (
              <Row key={n.id} n={n} showRoute={scope === 'all'} />
            ))}
          </div>

          {/* Export is the ONLY way one of these notes reaches another person, so it is a row
              of primary controls rather than a menu. Each count is `shown.length` — the same
              number as the rows above and the same number that lands in the file. */}
          <div className="border-t border-[#eee6d4] px-[8px] pt-[8px]">
            <div className="flex flex-wrap gap-[6px]">
              <button
                type="button" data-notes="export-md" disabled={shown.length === 0 || busy !== null}
                onClick={() => { void exportAs('md') }}
                className="flex-1 rounded-[6px] bg-[#1f5a44] px-[8px] py-[6px] text-[11px] font-bold text-white disabled:opacity-40"
                title={t('A numbered list you can paste into a message.')}
              >
                {t('Markdown')} <span data-notes="count-md">({shown.length})</span>
              </button>
              <button
                type="button" data-notes="export-png" disabled={shown.length === 0 || busy !== null}
                onClick={() => { void exportAs('png') }}
                className="flex-1 rounded-[6px] bg-[#8a6a1e] px-[8px] py-[6px] text-[11px] font-bold text-white disabled:opacity-40"
                title={t('The page itself, with these notes drawn on it.')}
              >
                {busy === 'png' ? t('Capturing…') : <>{t('PNG')} <span data-notes="count-png">({shown.length})</span></>}
              </button>
              <button
                type="button" data-notes="export-json" disabled={shown.length === 0 || busy !== null}
                onClick={() => { void exportAs('json') }}
                className="rounded-[6px] border border-[#d8cfb8] bg-white px-[8px] py-[6px] text-[11px] font-bold text-[#23302a] disabled:opacity-40"
                title={t('Everything, and it imports back.')}
              >
                {t('JSON')} <span data-notes="count-json">({shown.length})</span>
              </button>
            </div>

            <div className="mt-[6px] flex items-center gap-[6px]">
              {/* The counterpart to the JSON export, beside it rather than in a menu: a backup
                  you cannot restore is not a backup. */}
              <input
                ref={fileInput} data-notes="import-input" type="file" accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  // Cleared so choosing the SAME file twice fires change again — otherwise the
                  // second import silently does nothing and reads as "no duplicates found".
                  e.target.value = ''
                  if (f) void runImport(f)
                }}
              />
              <button
                type="button" data-notes="import" disabled={busy !== null}
                onClick={() => fileInput.current?.click()}
                className="rounded-[6px] border border-[#d8cfb8] bg-white px-[8px] py-[5px] text-[11px] font-bold text-[#23302a] disabled:opacity-40"
                title={t('Load a JSON export back. Nothing is replaced.')}
              >
                {busy === 'import' ? t('Reading…') : t('Import JSON')}
              </button>
              {pngNote && (
                <span data-notes="png-note" className="text-[10px] leading-[13px] text-[#5a6660]">
                  {pngNote}
                </span>
              )}
              {importNote && (
                <span data-notes="import-note" className="text-[10px] leading-[13px] text-[#5a6660]">
                  {importNote}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-[#eee6d4] p-[8px]">
            <textarea
              data-notes="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() } }}
              rows={2}
              placeholder={t('A note about this page…')}
              className="w-full resize-y rounded-[6px] border border-[#e7dfc9] bg-[#faf8f2] px-[8px] py-[6px] text-[12px] leading-[16px] outline-none"
            />
            <div className="mt-[6px] flex items-center gap-[6px]">
              <button
                type="button" data-notes="add" onClick={submit} disabled={!draft.trim()}
                className="rounded-[6px] bg-[#1f5a44] px-[10px] py-[5px] text-[11px] font-bold text-white disabled:opacity-40"
              >
                {t('Add note')}
              </button>
              <button
                type="button" data-notes="point" onClick={() => { setPicking((v) => !v); setAim(null) }}
                data-notes-picking={picking ? '1' : '0'}
                className={`rounded-[6px] border px-[8px] py-[5px] text-[11px] font-bold ${picking
                  ? 'border-[#1f5a44] bg-[#1f5a44] text-white'
                  : 'border-[#d8cfb8] bg-white text-[#1f5a44]'}`}
              >
                {picking ? t('Click something…') : t('Point at something')}
              </button>
              <span className="text-[10px] text-[#8a938e]" dir="ltr">Ctrl+Enter</span>
              <span className="ms-auto"><IdentityRow /></span>
            </div>
            {aim && (
              <div className="mt-[6px] flex items-center gap-[6px] rounded-[6px] bg-[#eef4f1] px-[8px] py-[5px]">
                <span className="text-[10px] text-[#2c5347]">{t('Points at')}</span>
                {/* The stored label, shown in full-ish so the reviewer can see they pointed at the
                    thing they meant — a container whose text is four labels run together is the
                    mistake worth catching here, before the note is saved rather than in the PNG. */}
                <Iso className="min-w-0 flex-1 truncate text-[10px] font-bold text-[#23302a]">
                  {aim.label}
                </Iso>
                <button
                  type="button" data-notes="unpoint" onClick={() => setAim(null)}
                  className="text-[11px] text-[#8a938e]" title={t('Remove the target')}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {picking && hover && <PickOutline el={hover} />}

      <button
        type="button"
        data-notes="chip"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex items-center gap-[6px] rounded-full border border-[#d8cfb8] bg-white px-[10px] py-[5px] text-[11px] font-bold shadow-[0_8px_24px_-10px_rgba(21,64,47,0.5)]"
        style={{ fontFamily: FONT_SANS }}
        dir="ltr"
        title={t('Review notes for this page')}
      >
        <span className="text-[#1f5a44]">✎ Notes</span>
        <span data-notes="chip-count" className="text-[#23302a]">{openHere}</span>
      </button>
    </DevDock>
  )
}

/**
 * `group` exists for the harness rather than for the UI: two of these segmented controls carry
 * an option labelled "All", so a test clicking by visible text picks whichever comes first in
 * the DOM and exercises the wrong filter — passing, on the wrong thing.
 */
function Seg<T extends string>({ group, value, set, opts }: {
  group: string; value: T; set: (v: T) => void; opts: [T, string][]
}) {
  return (
    <div className="flex overflow-hidden rounded-[5px] border border-[#e7dfc9]">
      {opts.map(([v, label]) => (
        <button
          key={v} type="button" onClick={() => set(v)}
          data-notes={`filter-${group}-${v}`} data-notes-on={value === v ? '1' : '0'}
          className={`px-[6px] py-[2px] text-[10px] font-bold ${value === v ? 'bg-[#1f5a44] text-white' : 'bg-white text-[#5a6660]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Row({ n, showRoute }: { n: Note; showRoute: boolean }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(n.text)
  const done = n.status === 'resolved'

  return (
    <div
      data-notes="row" data-notes-id={n.id} data-notes-route={n.route} data-notes-status={n.status}
      data-notes-lang={n.lang ?? ''}
      className={`mb-[6px] rounded-[8px] border p-[8px] ${done ? 'border-[#e3e8e5] bg-[#f7f9f8]' : 'border-[#eee6d4] bg-white'}`}
    >
      {editing ? (
        <>
          <textarea
            data-notes="edit-input" value={text} onChange={(e) => setText(e.target.value)} rows={3}
            className="w-full resize-y rounded-[6px] border border-[#e7dfc9] bg-[#faf8f2] px-[6px] py-[4px] text-[12px] leading-[16px] outline-none"
          />
          <div className="mt-[5px] flex gap-[4px]">
            <button
              type="button" data-notes="edit-save"
              onClick={() => { if (text.trim()) updateNote(n.id, { text: text.trim() }); setEditing(false) }}
              className="rounded-[5px] bg-[#1f5a44] px-[7px] py-[2px] text-[10px] font-bold text-white"
            >
              {t('Save')}
            </button>
            <button
              type="button" data-notes="edit-cancel" onClick={() => { setText(n.text); setEditing(false) }}
              className="rounded-[5px] bg-[#f0ece1] px-[7px] py-[2px] text-[10px] font-bold text-[#23302a]"
            >
              {t('Cancel')}
            </button>
          </div>
        </>
      ) : (
        <p className={`text-[12px] leading-[16px] ${done ? 'text-[#8a938e] line-through' : 'text-[#23302a]'}`}>
          {/* Mixed-script note text — isolated so a Latin tail cannot reorder across Arabic. */}
          <Iso>{n.text}</Iso>
        </p>
      )}

      {/* Where it used to be pinned. Context, never an anchor — see types.ts. */}
      {n.element && (
        <p data-notes="element" className="mt-[3px] text-[10px] leading-[13px] text-[#a9b1ab]" dir="ltr">
          {t('was on')} {n.element}
        </p>
      )}

      <p className="mt-[3px] text-[10px] text-[#8a938e]" dir="ltr">
        {showRoute ? `${n.route} · ` : ''}{n.author} · {shortDate(n.createdAt)}
        {n.lang ? ` · ${n.lang.toUpperCase()}` : ''}
        {n.duplicates && n.duplicates > 1 ? ` · ×${n.duplicates}` : ''}
      </p>

      {!editing && (
        <div className="mt-[6px] flex gap-[4px]">
          <button
            type="button" data-notes="resolve"
            onClick={() => updateNote(n.id, { status: done ? 'open' : 'resolved' })}
            className="rounded-[5px] bg-[#f0ece1] px-[6px] py-[2px] text-[10px] font-bold text-[#23302a]"
          >
            {done ? t('Reopen') : t('Resolve')}
          </button>
          <button
            type="button" data-notes="edit" onClick={() => setEditing(true)}
            className="rounded-[5px] bg-[#f0ece1] px-[6px] py-[2px] text-[10px] font-bold text-[#23302a]"
          >
            {t('Edit')}
          </button>
          <button
            type="button" data-notes="delete" onClick={() => removeNote(n.id)}
            className="rounded-[5px] bg-[#f7ecec] px-[6px] py-[2px] text-[10px] font-bold text-[#b23b3b]"
          >
            {t('Delete')}
          </button>
        </div>
      )}
    </div>
  )
}
