/**
 * Orphan-recovery fixture — a synthetic target board with independently toggleable break modes.
 *
 * A scratch edit to a real screen would prove one case, once, and then have to be reverted.
 * This makes every break mode reproducible on demand, in both directions, without touching
 * `src/screens/`.
 *
 * ── THE NEAR-MISS MATTERS MORE THAN THE BREAK ────────────────────────────────────────
 *
 * Over-eager orphaning is the failure that makes reviewers abandon the tool: once correct
 * remarks start showing up flagged, the flag stops being read and the genuine orphans go
 * unnoticed with it. So `moved` is the case to watch — the element's structural path breaks
 * but the element is still there, and the remark MUST re-anchor silently rather than orphan.
 *
 * EXPECTED RESULTS (the point of the board — each target has different identifiers):
 *
 *   target        identifiers            deleted   reordered        unrendered   moved
 *   ──────────────────────────────────────────────────────────────────────────────────────
 *   #fx-id        id + text              ORPHAN    anchored (id)    ORPHAN       anchored (id)
 *   [data-tour]   data-tour + text       ORPHAN    anchored (tour)  ORPHAN       anchored (tour)
 *   plain         structural + text      ORPHAN    anchored (text)  ORPHAN       anchored (text)
 *
 * The `plain` row is the interesting one. Reordering siblings leaves its old `nth-child` path
 * pointing at a DIFFERENT element; corroboration rejects that match and resolution falls
 * through to a same-language text search, which finds the real element. Without corroboration
 * the pin would silently move to the wrong target and nothing would look wrong.
 *
 * Run the whole board in `en` and again in `lsd`. Orphan recovery that only works in LTR is a
 * bug that surfaces late, and the text matcher is language-gated by design — so LSD exercises
 * a genuinely different path, not just a mirrored rendering of the same one.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SCANNER_IGNORE_ATTR } from '../i18n/domScan'
import { CHROME_ATTR } from './selector'
import { useRemarks } from './RemarksProvider'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

export type BreakMode = 'deleted' | 'reordered' | 'unrendered' | 'moved'

export default function RemarksFixture() {
  if (!import.meta.env.DEV) return null
  return <RemarksFixtureInner />
}

function RemarksFixtureInner() {
  const { fixtureOn, setFixtureOn, refresh } = useRemarks()
  // Break modes live in the URL-free component state; each is independent so combinations
  // (deleted + reordered) can be exercised too.
  const [modes, setModes] = useModes()

  if (!fixtureOn) return null

  const toggle = (m: BreakMode) => {
    setModes({ ...modes, [m]: !modes[m] })
    // Re-resolve immediately rather than waiting out the 1s interval, so the effect of a
    // toggle is visible at the moment it is clicked.
    window.setTimeout(refresh, 60)
  }

  return createPortal(
    <div
      className="fixed bottom-[70px] start-[16px] z-[125] w-[min(340px,calc(100vw-32px))] rounded-[12px] border border-[#d8cfb8] bg-white p-[10px] shadow-[0_16px_44px_-12px_rgba(21,64,47,0.45)]"
      style={{ fontFamily: FONT_SANS }}
    >
      {/* Controls are CHROME — remarks must not attach to them. */}
      <div {...{ [CHROME_ATTR]: '', [SCANNER_IGNORE_ATTR]: '' }}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#5a6660]" dir="ltr">
            Orphan fixture
          </p>
          <button
            type="button" onClick={() => setFixtureOn(false)}
            className="rounded-[5px] bg-[#f0ece1] px-[6px] py-[2px] text-[10px] font-bold text-[#23302a]"
          >
            Close
          </button>
        </div>
        <div className="mt-[6px] flex flex-wrap gap-[4px]" dir="ltr">
          {(['deleted', 'reordered', 'unrendered', 'moved'] as BreakMode[]).map((m) => (
            <button
              key={m} type="button" data-rmk={`mode-${m}`} onClick={() => toggle(m)}
              className={`rounded-[5px] px-[6px] py-[2px] text-[10px] font-bold ${modes[m] ? 'bg-[#b23b3b] text-white' : 'bg-[#f0ece1] text-[#5a6660]'}`}
              title={m === 'moved' ? 'Must RE-ANCHOR, not orphan' : 'Should orphan'}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="mt-[5px] text-[10px] leading-[14px] text-[#8a938e]" dir="ltr">
          Add a remark to each target below, then toggle a mode. `moved` must stay anchored;
          the others should orphan. Change language to re-test in the other direction.
          For the route-param case, navigate to a different miqaat id: the remark goes
          off-route, so it must NOT be flagged — same pattern, different pathname.
        </p>
      </div>

      {/* TARGETS — deliberately NOT chrome, so remarks can attach to them. */}
      <div data-rmk="targets" className="mt-[8px] rounded-[8px] border border-[#eee6d4] bg-[#fffdf8] p-[8px]">
        <Targets modes={modes} />
      </div>
    </div>,
    document.body,
  )
}

/** The three targets, rendered under whatever break modes are active. */
function Targets({ modes }: { modes: Record<BreakMode, boolean> }) {
  if (modes.unrendered) {
    return <p className="text-[11px] text-[#8a938e]" dir="ltr">targets unrendered</p>
  }

  const withId = (
    <p key="id" id="fx-id" className="rounded-[6px] bg-[#eef4f1] px-[6px] py-[3px] text-[12px] text-[#23302a]">
      Target with id
    </p>
  )
  const withTour = (
    <p key="tour" data-tour="fx-tour" className="rounded-[6px] bg-[#f4f0e6] px-[6px] py-[3px] text-[12px] text-[#23302a]">
      Target with data-tour
    </p>
  )
  // No id, no data-tour, no data-name: structural path plus text is all it has. This is the
  // row that exercises corroboration and the text fall-through.
  const plain = modes.deleted ? null : (
    <p key="plain" className="rounded-[6px] bg-[#f7f2ea] px-[6px] py-[3px] text-[12px] text-[#23302a]">
      Plain target, structural only
    </p>
  )

  const rows = modes.reordered ? [plain, withTour, withId] : [withId, withTour, plain]
  const body = <div className="flex flex-col gap-[5px]">{rows}</div>

  // `moved` wraps the whole board in an extra element, which changes every descendant's
  // structural path without removing anything. Exactly the near-miss: still on screen, still
  // readable, still the same element — the path is simply no longer where it was.
  return modes.moved ? <div className="border-s-2 border-[#b23b3b] ps-[6px]">{body}</div> : body
}

/**
 * Break-mode state, kept module-local rather than in the provider.
 *
 * Threading test scaffolding through the app-wide context would put it in the same object the
 * real UI consumes, and every consumer would re-render whenever a fixture toggle changed.
 */
const EMPTY: Record<BreakMode, boolean> = { deleted: false, reordered: false, unrendered: false, moved: false }

function useModes() {
  return useState<Record<BreakMode, boolean>>(EMPTY)
}
