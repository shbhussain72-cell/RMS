/**
 * probe-dom.mjs — the two DOM predicates every geometry probe needs, in ONE place.
 *
 *   await ctx.addInitScript(installProbeDom)   // then, inside the page: window.__probe.*
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────────────
 *
 * `check-layout` had three tests that read `getBoundingClientRect`. Two of them
 * (OCCLUDED, and the clipping walk) honoured the fact that a rect reports GEOMETRY and not
 * PAINT. The third, OVERLAP, sat directly beneath a docblock naming that exact false-positive
 * class and did not honour it, for months. It cost a session: every OVERLAP on /araz and
 * /people was a table row scrolled out of the bottom of its panel, whose rect happens to land
 * in the sticky footer's band while nothing of the row is drawn there at all. Fourteen
 * findings, three proposed causes, one defect that did not exist.
 *
 * The same shape had already happened once with `layerOf`, which existed twice in that file
 * with two different meanings. The lesson both times is the same: a predicate copied is a
 * predicate that will diverge. So the predicates live here, they are installed identically in
 * every probe, and a fix to one is a fix to all of them.
 *
 * Both functions are stringified across the Playwright boundary, so this file must stay
 * self-contained: no imports, no closure over module scope, no optional chaining on `window`.
 */

/** Installs `window.__probe` = { isVisible, pointVisible }. Pass to `addInitScript`. */
export function installProbeDom() {
  /**
   * Visibility must be inherited, not read off the element alone.
   *
   * `opacity` does NOT inherit as a computed value: a `<p>` inside an `opacity-0` tooltip
   * still reports `opacity: 1`. Checking only the element itself therefore counted every
   * hover tooltip's contents as visible on-screen text — and since a real element is of
   * course painted where a hidden tooltip sits, the occlusion probe reported one finding per
   * line of hidden tooltip. That alone was 149 of 279 OCCLUDED hits, all on /timeline, all
   * from the EventJourney day-cell tooltip. Same reason `visibility: hidden` on a wrapper has
   * to be honoured for its descendants.
   */
  const isVisible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false
      if (s.contentVisibility === 'hidden') return false
    }
    return true
  }

  /**
   * Is the point (x,y) actually inside every clipping ancestor of `el`?
   *
   * `getBoundingClientRect` reports GEOMETRY, not what is painted. A table row scrolled past
   * the bottom of an `overflow-y: auto` panel — or a line inside a collapsed
   * `overflow-hidden` accordion — still reports an on-screen rect, but nothing of it is drawn
   * there. `elementFromPoint` at that rect's centre therefore returns whatever IS drawn there,
   * which is usually the sticky footer or the next card, and a naive probe calls it a
   * collision.
   *
   * That was the single largest false-positive class in `check-layout`: measured across
   * /araz, /city, /zone and /review at 768-1440, 51 of 53 OCCLUDED hits were text scrolled
   * out of a clipper, not text covered by anything. It also scaled with line-height, so any
   * typographic change looked like it had introduced dozens of collisions.
   *
   * Out-of-flow elements are exempted until their containing block is reached: `absolute`
   * escapes every static ancestor and `fixed` escapes everything that is not a
   * transform/filter/perspective containing block. Without that, a dropdown anchored inside
   * an `overflow-hidden` card would be judged unpainted while it is plainly on screen.
   *
   * NOT a full hit test. It answers "is this point inside every box that could clip it",
   * which is the question a rect comparison silently assumes the answer to. When you need
   * "what is on top here", that is `elementFromPoint`, and it needs this as its gate.
   */
  const pointVisible = (el, x, y) => {
    const pos = getComputedStyle(el).position
    let escaping = pos === 'absolute' || pos === 'fixed'
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (escaping) {
        const cb = pos === 'fixed'
          ? s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none'
          : s.position !== 'static' || s.transform !== 'none' || s.filter !== 'none'
        if (!cb) continue
        escaping = false
      }
      if (!/^(hidden|clip|auto|scroll)$/.test(s.overflowX) && !/^(hidden|clip|auto|scroll)$/.test(s.overflowY)) continue
      const pr = p.getBoundingClientRect()
      if (x < pr.left - 1 || x > pr.right + 1 || y < pr.top - 1 || y > pr.bottom + 1) return false
    }
    return true
  }

  /**
   * The part of `r` that survives every clipping ancestor of `el`, or null if none of it does.
   *
   * `pointVisible` answers a yes/no about one point, which leaves the CALLER to choose the
   * point — and the obvious choice, the rect's geometric centre, is wrong for anything sitting
   * at a clipper's edge. A 28px heading whose lower half is cut off by the bottom of a scroll
   * panel has its centre exactly ON the boundary, where the renderer paints whatever comes
   * next. Sampling there reports the next thing as an occluder while the heading's visible half
   * is uncovered and perfectly legible.
   *
   * So callers ask for the painted rect and sample the middle of THAT. A real occlusion is
   * unaffected: text genuinely covered by an in-flow element is fully inside its clipper, and
   * the painted rect is the whole rect.
   */
  const paintedRect = (el, r) => {
    const rect = r || el.getClientRects()[0] || el.getBoundingClientRect()
    if (!rect) return null
    let { left, top, right, bottom } = rect
    const pos = getComputedStyle(el).position
    let escaping = pos === 'absolute' || pos === 'fixed'
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (escaping) {
        const cb = pos === 'fixed'
          ? s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none'
          : s.position !== 'static' || s.transform !== 'none' || s.filter !== 'none'
        if (!cb) continue
        escaping = false
      }
      if (!/^(hidden|clip|auto|scroll)$/.test(s.overflowX) && !/^(hidden|clip|auto|scroll)$/.test(s.overflowY)) continue
      const pr = p.getBoundingClientRect()
      left = Math.max(left, pr.left); top = Math.max(top, pr.top)
      right = Math.min(right, pr.right); bottom = Math.min(bottom, pr.bottom)
    }
    if (right - left < 2 || bottom - top < 2) return null
    return { left, top, right, bottom, width: right - left, height: bottom - top }
  }

  /** Is any part of `el` painted where its own box says it is? Centre-sampled. */
  const selfPainted = (el) => {
    const r = el.getClientRects()[0] || el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    return pointVisible(el, r.left + r.width / 2, r.top + r.height / 2)
  }

  window.__probe = { isVisible, pointVisible, paintedRect, selfPainted }
}
