/**
 * png.ts — the whole page, with numbered markers on it and a matching list beneath.
 *
 * ── THIS IS THE EXPORT SOMEBODY FORWARDS WITHOUT EXPLANATION ─────────────────────────
 *
 * So it has to be the PAGE, and the page has to say which note is about what. An image of the
 * board alone is a list of sentences about a screen nobody can see, which is what the reader
 * already had in the Markdown; an image of the page with a strip of text under it is better and
 * still leaves "which button?" to a reply. Numbered badges on the screenshot and the same numbers
 * in the list under it close that loop without a sentence of explanation.
 *
 * ── ONE SEQUENCE, MARKED FIRST ───────────────────────────────────────────────────────
 *
 * Numbering runs 1..N once, across the image and the list together. Notes that resolved to
 * something come first, so badge ② is line 2 and a reader never counts past entries that have no
 * badge. Notes with nowhere to point follow, still numbered, under a heading that says they are
 * about the screen as a whole — they are not lesser notes, and dropping their numbers would make
 * the list disagree with the Markdown export of the same selection.
 *
 * ── WHY THE BADGES ARE DRAWN ON THE CANVAS, NOT INSERTED INTO THE PAGE ───────────────
 *
 * The brief asked for an overlay inserted for the capture and removed immediately afterwards,
 * including if the capture throws. This does the same job with nothing to remove:
 *
 *   - There is no window in which the page differs from what the reviewer is looking at, so
 *     "restore it afterwards" has no failure mode to get right. A `finally` that runs while
 *     another export is mid-flight, or a component unmounting under it, cannot leave a badge
 *     behind, because no badge was ever in the DOM.
 *   - Inserted badges would be rasterised by html2canvas, which re-implements CSS painting — the
 *     one part of this image that MUST be legible would be the part drawn by the approximate
 *     renderer. Drawn straight onto the output canvas they are exact.
 *   - It cannot reflow the layout it is documenting. Absolutely-positioned badges would not, but
 *     "would not" is a claim about every screen in the app, and this way it is not a claim.
 *
 * The DOM-unchanged assertion is kept anyway — it now holds by construction rather than by a
 * teardown, and a future change that reaches for insertion will fail it.
 *
 * ── COORDINATES ARE RELATIVE TO THE BODY BOX, NOT THE VIEWPORT ──────────────────────
 *
 * The capture is full-page, so a marker for something below the fold must land where that thing
 * is in the DOCUMENT. `getBoundingClientRect()` is viewport-relative and the page may be scrolled
 * when the button is pressed, so every rect is taken relative to the body's own box — the
 * rectangle html2canvas is rasterising — which is correct whatever the scroll position is and
 * does not require scrolling the page to find out.
 *
 * ── WHY html2canvas, AND WHAT IT COSTS ───────────────────────────────────────────────
 *
 * It is the only maintained library that rasterises live DOM in the browser without a headless
 * one. The alternative shape — `html-to-image` — renders through an SVG `foreignObject`, which
 * the browser then paints; that is more faithful when it works and silently drops cross-origin
 * images and unloaded webfonts when it does not. This app has both a webfont pipeline and a PNG
 * crest, so the failure mode would be a blank-looking export that still succeeds.
 *
 * html2canvas re-implements CSS painting instead, which means it is PREDICTABLY approximate
 * rather than occasionally empty: gradients, shadows and some RTL text metrics come out close
 * rather than exact. For "send this to Siam so he can see what I mean", recognisable beats
 * pixel-perfect, and the alternative that IS pixel-perfect is Playwright — which cannot run from
 * a button inside the browser, which is where this has to be.
 *
 * IT IS A DYNAMIC IMPORT INSIDE A `REVIEW_TOOLS` BRANCH. That is not style: a static import
 * would keep ~200kB of library alive through tree-shaking and ship it to every visitor, which
 * is the exact shape of the default parameter that once shipped the whole remarks tool.
 * `check-dev-only.mjs` asserts `html2canvas` is absent from a production bundle.
 */
import { MONTHS } from './export'
import { CHROME, planLines, resolveOnPage, type PlannedLine } from './target'
import type { Note } from './types'

/**
 * What the capture drew, for the board to say out loud.
 *
 * The image states its own caveats in the strip, and a rasterised sentence cannot be read back
 * without OCR — by anything, including the person who exported it, if they are checking quickly.
 * So the same plan that drew the strip is also returned, and the board renders it as a line of
 * text. One plan, two renderings: they cannot disagree, and the one made of DOM can be asserted.
 */
export interface CaptureSummary {
  /** Notes that got a badge on the page. */
  marked: number
  /** Notes whose stored label is no longer anywhere on this screen. */
  missing: number
  /** Notes whose label matched more than one element; the first was marked. */
  ambiguous: number
  /** Notes that never pointed at anything. Not a problem — most notes are like this. */
  pageLevel: number
}

export interface PngResult {
  blob: Blob
  width: number
  height: number
  summary: CaptureSummary
}

/** What the header line needs that the notes do not carry. */
export interface CaptureMeta {
  route: string
  lang: 'en' | 'lsd'
  /** The app's translator. Passed in because this is a module, not a component. */
  t: (english: string, vars?: Record<string, string | number>) => string
  now?: Date
}

/** A badge to draw: a number, and where its centre goes in body-box CSS pixels. */
interface Marker { n: number; x: number; y: number }

const BADGE_R = 15

/**
 * Render the page plus `notes` to a PNG blob.
 *
 * Resolution happens HERE, once, before the rasteriser runs — against the page as it is at the
 * moment the button was pressed. Nothing is written back, so pressing it twice on two different
 * screens gives two answers and neither is wrong.
 */
export async function capturePage(notes: Note[], meta: CaptureMeta): Promise<PngResult> {
  const resolved = resolveOnPage(notes)
  const lines = planLines(resolved.map(({ note, target, el, matches }) => ({ note, target, matches, found: !!el })))

  // Body-box relative, so the numbers mean the same thing whatever the scroll position is.
  const body = document.body.getBoundingClientRect()
  const rtl = document.documentElement.getAttribute('dir') === 'rtl'
  const pageW = document.documentElement.clientWidth
  const pageH = document.documentElement.scrollHeight

  const byNote = new Map(resolved.map((r) => [r.note.id, r.el]))
  const markers: Marker[] = []
  for (const line of lines) {
    const el = line.marked ? byNote.get(line.note.id) : null
    if (!el) continue
    const r = el.getBoundingClientRect()
    const start = rtl ? r.right - body.left + BADGE_R + 6 : r.left - body.left - BADGE_R - 6
    markers.push({
      n: line.n,
      x: clamp(start, BADGE_R + 2, pageW - BADGE_R - 2),
      // Beside the top of the element rather than its middle: a tall card would put the badge
      // level with its own centre, which is nowhere near the thing being described.
      y: clamp(r.top - body.top + Math.min(r.height / 2, 20), BADGE_R + 2, pageH - BADGE_R - 2),
    })
  }

  const { default: html2canvas } = await import('html2canvas')
  const pageCanvas = await html2canvas(document.body, {
    backgroundColor: '#ffffff',
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
    // The board, the docks and their stubs are removed from the capture. A screenshot of the
    // tool on top of the page hides the part of the page the tool is about — and the notes are
    // drawn back on below, legibly, where they cannot cover anything.
    ignoreElements: (el) => !!(el instanceof HTMLElement && el.closest(CHROME)),
    windowWidth: pageW,
    windowHeight: pageH,
  })

  const blob = await compose(pageCanvas, lines, markers, meta, rtl)
  return {
    blob,
    width: pageCanvas.width,
    height: pageCanvas.height,
    summary: {
      marked: markers.length,
      missing: lines.filter((l) => l.caveat.kind === 'missing').length,
      ambiguous: lines.filter((l) => l.caveat.kind === 'ambiguous').length,
      pageLevel: lines.filter((l) => !l.marked && l.caveat.kind === 'none').length,
    },
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))



/**
 * The sentence a line adds about its own target, or ''.
 *
 * Both cases are disclosures, not errors: "the thing this pointed at is not here" and "several
 * things say this and I marked the first" are facts the reader needs in order to trust the
 * markers that ARE there. Silence on the second one is the failure the brief names — a marker
 * confidently pointing at the wrong control is worse than no marker.
 */
function caveatText(line: PlannedLine, t: CaptureMeta['t']): string {
  if (line.caveat.kind === 'missing') {
    return t('“{label}” is not on this screen', { label: line.caveat.label })
  }
  if (line.caveat.kind === 'ambiguous') {
    // `count` is passed as a STRING so it is not localised into Arabic-Indic digits in LSD. Every
    // numeral on this image belongs to one counting system, because the badge and the list line
    // have to be recognisably the same number at a glance.
    return t('{count} things read “{label}” — the first one is marked', {
      count: String(line.caveat.count), label: line.caveat.label,
    })
  }
  return ''
}

/** The page image, the badges, and the titled list under it. */
async function compose(
  page: HTMLCanvasElement,
  lines: PlannedLine[],
  markers: Marker[],
  meta: CaptureMeta,
  rtl: boolean,
): Promise<Blob> {
  const { t } = meta
  const scale = page.width / Math.max(1, document.documentElement.clientWidth)
  const width = page.width

  const PAD = 28
  const GUTTER = 40
  const LINE = 26
  const HEAD = 46
  const SECTION = 34
  const BODY_PX = 17

  const marked = lines.filter((l) => l.marked)
  const rest = lines.filter((l) => !l.marked)

  // Measured before the canvas is sized: a strip sized from a guessed line count either clips the
  // last note or leaves a band of white under it.
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = `${BODY_PX * scale}px Mulish, system-ui, sans-serif`
  const usable = width - (PAD * 2 + GUTTER) * scale

  const block = (group: PlannedLine[]) => group.map((l) => {
    const caveat = caveatText(l, t)
    const text = l.note.text.replace(/\s+/g, ' ').trim() + (caveat ? `  — ${caveat}` : '')
    return { line: l, rows: wrap(probe, text, usable) }
  })
  const markedBlock = block(marked)
  const restBlock = block(rest)

  const rows = (b: ReturnType<typeof block>) => b.reduce((n, x) => n + x.rows.length, 0)
  const stripHeight = lines.length
    ? (HEAD
      + (markedBlock.length ? SECTION + rows(markedBlock) * LINE + 8 : 0)
      + (restBlock.length ? SECTION + rows(restBlock) * LINE + 8 : 0)
      + PAD) * scale
    : 0

  const out = document.createElement('canvas')
  out.width = width
  out.height = page.height + stripHeight
  const ctx = out.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(page, 0, 0)

  for (const m of markers) drawBadge(ctx, m.x * scale, m.y * scale, m.n, BADGE_R * scale)

  if (!lines.length) {
    return toBlob(out)
  }

  const top = page.height
  ctx.fillStyle = '#fff8cf'
  ctx.fillRect(0, top, width, stripHeight)
  ctx.fillStyle = '#1f5a44'
  ctx.fillRect(0, top, width, 3 * scale)

  // The strip is drawn left-to-right in BOTH languages. Canvas has no bidi algorithm, and these
  // are numbered lines of mixed Latin and Arabic script; laying them out right-to-left by hand
  // would reorder the runs inside each sentence. The PAGE above keeps whatever direction it had,
  // and the badges above sit on the reading-start side, which is the part that has to follow the
  // language because it is attached to the layout.
  const d = meta.now ?? new Date()
  const head = [
    meta.route,
    `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    meta.lang === 'lsd' ? 'LSD' : 'EN',
    `${document.documentElement.clientWidth}px`,
    rtl ? 'RTL' : 'LTR',
  ].join('  ·  ')

  let y = top + (PAD + 6) * scale
  ctx.fillStyle = '#1f5a44'
  ctx.font = `bold ${20 * scale}px Mulish, system-ui, sans-serif`
  ctx.fillText(head, PAD * scale, y)
  y += 14 * scale
  ctx.fillStyle = '#dfd6b8'
  ctx.fillRect(PAD * scale, y, width - PAD * 2 * scale, 1 * scale)
  y += (HEAD - 20 - 14 + 6) * scale

  const section = (title: string, b: ReturnType<typeof block>) => {
    if (!b.length) return
    ctx.fillStyle = '#7a6a3a'
    ctx.font = `bold ${14 * scale}px Mulish, system-ui, sans-serif`
    y += SECTION * scale - 12 * scale
    ctx.fillText(title, PAD * scale, y)
    y += 12 * scale

    for (const { line, rows: text } of b) {
      const first = y + LINE * scale
      ctx.fillStyle = '#241f10'
      ctx.font = `${BODY_PX * scale}px Mulish, system-ui, sans-serif`
      for (const row of text) {
        y += LINE * scale
        ctx.fillText(row, (PAD + GUTTER) * scale, y)
      }
      // The number last, so it is drawn over nothing and can use the first row's baseline. A
      // marked line gets the SAME badge as the page, at list size — the correspondence is the
      // whole point, and two different renderings of "2" would make the reader check.
      if (line.marked) {
        drawBadge(ctx, (PAD + 13) * scale, first - 6 * scale, line.n, 12 * scale)
      } else {
        ctx.fillStyle = '#6b6350'
        ctx.font = `bold ${BODY_PX * scale}px Mulish, system-ui, sans-serif`
        ctx.fillText(`${line.n}.`, PAD * scale, first)
      }
    }
    y += 8 * scale
  }

  section(t('On the screen — numbered above'), markedBlock)
  section(t('About this screen as a whole'), restBlock)

  return toBlob(out)
}

/**
 * A numbered badge: black ring, white face, black numeral.
 *
 * Chosen to survive BOTH backgrounds this app puts behind it — the dark green app bar and the
 * cream cards — without a per-element brightness test. A single-colour badge has to lose against
 * one of them; a white face makes it a hole punched in the dark chrome, and the ring is what
 * keeps it a badge rather than a smudge on the cream.
 */
function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, n: number, r: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#000000'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r - Math.max(2, r * 0.22), 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.fillStyle = '#000000'
  ctx.font = `bold ${Math.round(r * 1.15)}px Mulish, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Plain Latin digits, never localised: this number's only job is to be found again in the list.
  ctx.fillText(String(n), cx, cy + r * 0.06)
  ctx.restore()
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((ok, fail) => {
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error('canvas produced no image'))), 'image/png')
  })
}

/**
 * The line the board shows after an export. English is assembled from translated fragments
 * rather than one long key, because the counts vary independently and a single sentence would
 * need eight keys to cover the combinations.
 */
export function describeCapture(s: CaptureSummary, t: CaptureMeta['t']): string {
  const parts = [t('{n} marked on the page', { n: String(s.marked) })]
  if (s.pageLevel) parts.push(t('{n} about the whole screen', { n: String(s.pageLevel) }))
  if (s.ambiguous) parts.push(t('{n} matched more than one thing', { n: String(s.ambiguous) }))
  if (s.missing) parts.push(t('{n} pointed at something no longer here', { n: String(s.missing) }))
  return parts.join(' · ')
}

/** Greedy word wrap against a measured width. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > max && line) { lines.push(line); line = w } else line = next
  }
  if (line) lines.push(line)
  return lines
}
