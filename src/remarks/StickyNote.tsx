/**
 * StickyNote — what is still open on THIS screen, pinned where you can read it while you fix it.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────────────────
 *
 * The Remarks panel is a tool: filters, statuses, exports, per-remark controls. Working through
 * a screen you do not want the tool, you want the list — and the panel is in the corner you keep
 * having to open, filter and close again. So: open remarks, this route, text only, always
 * visible, out of the way.
 *
 * ── IT IS THE PANEL'S QUERY, NOT A SECOND ONE ────────────────────────────────────────
 *
 * `filterRemarks` with the scope pinned to `route`, the status pinned to `open` and the language
 * taken from the two toggles below. There is deliberately no filtering logic in this file. A
 * second implementation of "which remarks are we talking about" is how the export came to
 * disagree with the panel it sat underneath, and that bug was invisible until the file arrived
 * somewhere else with the wrong contents in it.
 *
 * Resolved remarks are excluded and there is no control to bring them back: this is a list of
 * work left, and a done item on it is a line you read and dismiss every time.
 *
 * ── THE LANGUAGE TOGGLES FILTER BY THE LANGUAGE THE REMARK WAS MADE IN ───────────────
 *
 * Not the language the app is currently displaying. `r.lang` is recorded at capture, and most
 * findings in this app belong to one language — a clipped label in LSD is not a finding in EN.
 * Reading the screen in EN while checking what was reported in LSD is the normal case, so
 * switching the app's language must not change what this note lists.
 *
 * Both off is a real state and says so rather than showing an empty list, which would read as
 * "nothing open here".
 *
 * ── PLACEMENT ────────────────────────────────────────────────────────────────────────
 *
 * The reading-start corner — inline-start, so top-left in English and top-right in LSD, via
 * logical properties only. It is BELOW the AppBar (58px on mobile, 60px from `sm:`), because
 * the bar's identity block is the one piece of chrome a reviewer needs to see at all times to
 * know whose session they are looking at, and a note covering it turns a screenshot into an
 * unattributable one.
 *
 * `pointer-events` live on the note itself, never the wrapper: this floats over the app, and a
 * full-corner invisible catcher would swallow clicks meant for the UI underneath.
 *
 * DEV ONLY, behind `REVIEW_TOOLS`.
 */
import { useState, useSyncExternalStore } from 'react'
import { Iso } from '../components/Bidi'
import { SCANNER_IGNORE_ATTR } from '../i18n/domScan'
import { CHROME_ATTR } from './selector'
import { useRemarks } from './RemarksProvider'
import { filterRemarks, type LangFilter } from './filter'
import { notesSnapshot, subscribeNotes, writeNote } from './note'
import { useT } from '../i18n'
import { REVIEW_TOOLS } from '../reviewTools'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const chromeProps = { [CHROME_ATTR]: '', [SCANNER_IGNORE_ATTR]: '' }

/** Clears the AppBar on both breakpoints (58px / 60px) with room to spare. */
const BELOW_APPBAR = 'top-[72px]'

export function useNote() {
  const notes = useSyncExternalStore(subscribeNotes, notesSnapshot, notesSnapshot)
  return notes
}

export default function StickyNote() {
  if (!REVIEW_TOOLS) return null
  return <StickyNoteInner />
}

function StickyNoteInner() {
  const { remarks, resolutions, route, reload } = useRemarks()
  const notes = useNote()
  const { t } = useT()
  const [busy, setBusy] = useState(false)

  const note = notes[route]
  // No note on this route. Not hidden — absent, and the screen stays clean.
  if (!note) return null

  if (note.hidden) {
    return (
      <div {...chromeProps} className={`pointer-events-none fixed ${BELOW_APPBAR} start-[12px] z-[110]`}>
        {/* The way back, and the whole reason `hidden` is not the same as deleting the note. */}
        <button
          type="button"
          data-rmk-note="stub"
          onClick={() => writeNote(route, { hidden: false })}
          title={t('Show')}
          aria-label={t('Show')}
          className="pointer-events-auto flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#e0cf8a] bg-[#fff8cf] text-[11px] text-[#8a6a1e] shadow-[0_4px_12px_-4px_rgba(21,64,47,0.4)]"
        >
          ◉
        </button>
      </div>
    )
  }

  const lang: LangFilter | null = note.en && note.lsd ? 'all' : note.en ? 'en' : note.lsd ? 'lsd' : null
  const open = lang === null ? [] : filterRemarks(
    remarks, resolutions, { scope: 'route', status: 'open', lang, orphanOnly: false }, route,
  )

  return (
    <div {...chromeProps} className={`pointer-events-none fixed ${BELOW_APPBAR} start-[12px] z-[110]`}>
      <div
        data-rmk-note="note"
        className="pointer-events-auto flex max-h-[46vh] w-[min(300px,calc(100vw-24px))] flex-col rounded-[10px] border border-[#e0cf8a] bg-[#fff8cf] shadow-[0_10px_28px_-10px_rgba(21,64,47,0.45)]"
        style={{ fontFamily: FONT_SANS }}
      >
        <div className="flex items-center gap-[4px] border-b border-[#efe0a8] px-[8px] py-[6px]">
          <span className="me-auto text-[10px] font-bold uppercase tracking-[0.5px] text-[#8a6a1e]">
            {t('Sticky note')} <span data-rmk-note="count">({open.length})</span>
          </span>

          {/* Language of CAPTURE, not of display. Independent, so both can be on at once and
              both can be off — see the header. */}
          <Toggle on={note.en} label="EN" onClick={() => writeNote(route, { en: !note.en })} name="en" />
          <Toggle on={note.lsd} label="LSD" onClick={() => writeNote(route, { lsd: !note.lsd })} name="lsd" />

          <button
            type="button"
            data-rmk-note="refresh"
            disabled={busy}
            onClick={async () => {
              // Re-reads the SHARED store, so a remark someone else just filed on this screen
              // appears here without a reload. The list itself is derived, so nothing else has
              // to be told about it.
              setBusy(true)
              try { await reload() } finally { setBusy(false) }
            }}
            title={t('Refresh')}
            aria-label={t('Refresh')}
            className="rounded-[4px] border border-[#e0cf8a] bg-white/70 px-[4px] text-[10px] leading-[16px] text-[#8a6a1e] disabled:opacity-40"
          >
            ⟳
          </button>
          <button
            type="button"
            data-rmk-note="hide"
            onClick={() => writeNote(route, { hidden: true })}
            title={t('Hide')}
            aria-label={t('Hide')}
            className="rounded-[4px] border border-[#e0cf8a] bg-white/70 px-[4px] text-[10px] leading-[16px] text-[#8a6a1e]"
          >
            ⊘
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[10px] py-[8px]">
          {lang === null ? (
            // Both toggles off. Said out loud, because an empty list here would read as "this
            // screen is clear" — the opposite of what it means.
            <p data-rmk-note="no-lang" className="text-[11px] leading-[15px] text-[#8a6a1e]">
              {t('Turn on a language to see remarks')}
            </p>
          ) : open.length === 0 ? (
            <p data-rmk-note="empty" className="text-[11px] leading-[15px] text-[#8a6a1e]">
              {t('No open remarks on this screen')}
            </p>
          ) : (
            <ol className="ps-[16px] text-[11px] leading-[16px] text-[#3a3320]">
              {open.map((r) => (
                // Text and nothing else. Everything else about the remark is one click away in
                // the panel, and a note you have to read around is a note you stop reading.
                <li key={r.id} data-rmk-note-item={r.id} className="mb-[4px] list-decimal">
                  <Iso>{r.remark}</Iso>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, label, onClick, name }: { on: boolean; label: string; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      data-rmk-note-lang={name}
      data-rmk-note-lang-on={on ? '1' : '0'}
      onClick={onClick}
      // `dir="ltr"`: these are Latin language codes, not prose, and must not reorder in RTL.
      dir="ltr"
      className={`rounded-[4px] px-[4px] text-[9px] font-bold leading-[16px] ${on ? 'bg-[#8a6a1e] text-white' : 'border border-[#e0cf8a] bg-white/70 text-[#a89a6a]'}`}
    >
      {label}
    </button>
  )
}
