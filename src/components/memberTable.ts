/**
 * Shared geometry for the members tables.
 *
 * ── THE BUG THIS EXISTS TO PREVENT ───────────────────────────────────────────────
 *
 * Every members table in this app is `table-layout: fixed` with a `<colgroup>` in which the
 * member-name column is the ONE unsized `<col />` and every other column has an explicit
 * width. Under fixed layout the unsized column absorbs whatever space is left over — and
 * when the fixed columns already exceed the container, "left over" is negative, so the
 * member column computes to **zero**.
 *
 * That failure is silent and it is not subtle once you measure it. The rendered table
 * `scrollWidth` came out exactly equal to the sum of the fixed columns on every affected
 * screen — 514 on Araz, 608 on Host/Relay move, 660 on City selection — which is only
 * possible if the name column contributed nothing at all. Visually the name still appeared,
 * because a zero-width cell overflows rather than disappearing, but it wrapped one word per
 * line into a 257px-tall row and the wrapper's `overflow: hidden` clipped whatever hung past
 * the edge.
 *
 * The fix has to be a MINIMUM WIDTH ON THE TABLE, not on the column. `min-width` on a `<col>`
 * is ignored under `table-layout: fixed` — the spec only honours `width` there. Forcing the
 * table itself to be at least (fixed columns + a readable name column) is what actually
 * reserves the space, and the wrapper then scrolls instead of clipping.
 *
 * CitySelection's zone-column branch already did exactly this with a hardcoded `840px`;
 * this generalises that one working case rather than inventing a new approach.
 */

/**
 * Smallest width at which a member name stays readable.
 *
 * `Murtaza bhai Moiz bhai Gheewala` is the longest name in the fixture and the one that was
 * breaking; 220px holds it on two lines at 15px, which is what keeps rows near their natural
 * height instead of ballooning.
 */
export const MEMBER_COL_MIN = 220

/**
 * Minimum table width given the widths of every OTHER (fixed) column.
 *
 * Pass the same numbers that appear in the `<colgroup>`; keeping them in one expression is
 * what stops the two drifting apart when a column is added.
 */
export function memberTableMinWidth(...fixedColumnWidths: number[]): string {
  return `${fixedColumnWidths.reduce((a, b) => a + b, 0) + MEMBER_COL_MIN}px`
}

/**
 * Wrapper classes for a members table.
 *
 * `overflow-x-auto` rather than `overflow-hidden`: the table is allowed to be wider than the
 * viewport on a narrow screen — that is a deliberate scroll with an affordance, not lost
 * content. Under `dir="rtl"` the browser starts a scroll container at its inline-start edge,
 * so the member column is the one visible at rest in both languages, with no scroll-position
 * fixup needed in JS.
 */
export const MEMBER_TABLE_WRAPPER = 'overflow-x-auto rounded-[14px] border bg-white'
