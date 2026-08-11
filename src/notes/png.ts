/**
 * png.ts — the whole page, with its notes drawn on it, as one image.
 *
 * ── THIS IS THE EXPORT SOMEBODY FORWARDS WITHOUT EXPLANATION ─────────────────────────
 *
 * So it has to be the PAGE. An image of the board alone is a list of sentences about a screen
 * nobody can see, which is what the reader already had in the Markdown. The notes are drawn ONTO
 * a capture of the app, numbered, in the reading-start margin — the numbers match the Markdown
 * export's numbering, so the two can be sent together and read against each other.
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
import type { Note } from './types'

/** Anything the capture must not contain: the dev chrome, including the board itself. */
const CHROME = '[data-devdock], [data-notes]'

export interface PngResult {
  blob: Blob
  width: number
  height: number
}

/**
 * Render the page plus `notes` to a PNG blob.
 *
 * The notes are painted onto the canvas AFTER the page is captured rather than being injected
 * into the DOM first. Injecting would reflow the very layout the image is supposed to document —
 * a 320px column added to the page moves everything the reviewer is pointing at, and the
 * screenshot would then be of a screen that never existed.
 */
export async function capturePage(notes: Note[], route: string): Promise<PngResult> {
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
    windowWidth: document.documentElement.clientWidth,
    windowHeight: document.documentElement.scrollHeight,
  })

  return { blob: await compose(pageCanvas, notes, route), width: pageCanvas.width, height: pageCanvas.height }
}

/** The page image with a titled note strip under it. */
async function compose(page: HTMLCanvasElement, notes: Note[], route: string): Promise<Blob> {
  const PAD = 24
  const LINE = 22
  const TITLE = 34
  const scale = page.width / Math.max(1, document.documentElement.clientWidth)
  const width = page.width

  // Measured before the canvas is sized, because a strip sized by a guessed line count either
  // clips the last notes or leaves a band of white under them.
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = `${14 * scale}px Mulish, system-ui, sans-serif`
  const usable = width - PAD * 2 * scale
  const wrapped: string[] = []
  notes.forEach((n, i) => wrapped.push(...wrap(probe, `${i + 1}. ${n.text.replace(/\s+/g, ' ').trim()}`, usable)))

  const stripHeight = notes.length
    ? TITLE * scale + wrapped.length * LINE * scale + PAD * 2 * scale
    : 0

  const out = document.createElement('canvas')
  out.width = width
  out.height = page.height + stripHeight
  const ctx = out.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(page, 0, 0)

  if (notes.length) {
    ctx.fillStyle = '#fff8cf'
    ctx.fillRect(0, page.height, width, stripHeight)
    ctx.fillStyle = '#e0cf8a'
    ctx.fillRect(0, page.height, width, 2 * scale)

    let y = page.height + PAD * scale + 16 * scale
    ctx.fillStyle = '#8a6a1e'
    ctx.font = `bold ${13 * scale}px Mulish, system-ui, sans-serif`
    // `dir` is not set on a canvas fill: the strip is drawn left-to-right in both languages
    // because it is a numbered list of mixed-script sentences, and canvas has no bidi algorithm
    // to reorder them with. The PAGE above it is captured with whatever direction it had.
    ctx.fillText(`${route}  ·  ${notes.length} note${notes.length === 1 ? '' : 's'}`, PAD * scale, y)
    y += TITLE * scale - 16 * scale

    ctx.fillStyle = '#3a3320'
    ctx.font = `${14 * scale}px Mulish, system-ui, sans-serif`
    for (const line of wrapped) {
      y += LINE * scale
      ctx.fillText(line, PAD * scale, y)
    }
  }

  return new Promise<Blob>((ok, fail) => {
    out.toBlob((b) => (b ? ok(b) : fail(new Error('canvas produced no image'))), 'image/png')
  })
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
