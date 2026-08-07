# Physical centring — the 11 documented exceptions

`left-<x>` + `-translate-x-1/2` is the centring idiom: the inset puts one edge at the
midpoint, the translate pulls the element back by half its own width. It is
**direction-independent** — the same visual result is wanted in both languages — so the
physical property is not a bug here.

It is still worth eliminating where an equivalent direction-neutral mechanism exists, because
every remaining site is one careless codemod away from becoming `start-` + `-translate-x-`,
which lands the element off-centre by its own width under RTL. That bug has been introduced
twice in this repo.

The elimination pass took **23 sites → 11**. Enforced by `scripts/centring.test.mjs` against
`scripts/centring-exceptions.json`; regenerate with
`node scripts/centring-census.cjs --write-exceptions`.

## The replacement, and when it does not work

Eliminated sites use `start-0 end-0` + `mx-auto` (auto inline margins between two zero
insets), or push the centring up to a flex parent. Both are direction-neutral.

That substitution is **not** equivalent in three cases, which is what the list below records.

---

## 1. The element may be wider than its containing block — 5 sites

| Site | Element |
|---|---|
| `src/screens/CitySelection.tsx:1888` | "Capacity is full." tooltip |
| `src/screens/MiqaatDetail.tsx:61` | section heading label |
| `src/screens/Review.tsx:41` | step label |
| `src/screens/Review.tsx:101` | section divider label |
| `src/screens/Roster.tsx:30` | column header label |

All carry `whitespace-nowrap`, and all are centred on a container that can be narrower than
the text — a tooltip on a small trigger, an uppercase `tracking-[2.5px]` heading at 390px.

`left-1/2` + `-translate-x-1/2` centres on a **point**, so the overflow is symmetric: the text
spills equally past both edges and stays visually centred.

`start-0 end-0 mx-auto w-fit` centres within a **box**. When the content exceeds the available
width, `fit-content` is clamped to that width and the overflow becomes one-sided — the text
drifts off-centre exactly when it is longest, which is when it matters. Not a valid
substitution.

## 2. Deliberate sub-pixel optical offset — 3 sites

| Site | Offset |
|---|---|
| `src/screens/MiqaatDetail.tsx:153` | `left-[calc(50%-0.94px)]` |
| `src/screens/MiqaatDetail.tsx:833` | `left-[calc(50%+0.62px)]` |
| `src/screens/Review.tsx:101` | `left-[calc(50%+0.5px)]` (also nowrap) |

These are Figma export values: the design centres them optically, not geometrically. `mx-auto`
centres exactly and would silently discard the nudge.

Note this is the same `[calc(50%…)]` form that defeated the codemod's original guard, which
matched the literal token `left-1/2`. Three of the four sites it broke were these.

## 3. Success.tsx — reverted after measurement — 3 sites

| Site | Element |
|---|---|
| `src/screens/Success.tsx:48` | fixed modal card |
| `src/screens/Success.tsx:88` | heading block |
| `src/screens/Success.tsx:167` | "Done" button label |

These were converted, measured, and **reverted**.

Geometry was provably unchanged: all three were tagged and measured in both languages at
390px and 1440px, and every box was pixel-identical before and after. But the full layout pass
showed **8 new OVERLAY findings** on `/success` — the large clipped header ornament
(`4398×4271px` inside an `overflow-clip` card) hit-testing above the success heading, at every
width, in both languages. Isolated by reverting only this file and re-running: 4 findings with
the change, 0 without.

So the substitution altered paint/hit-test order without moving anything. The mechanism was
not established, and `Success.tsx` already carried a comment recording that the centring there
was a deliberate choice. Shipping an unexplained change to override a documented decision, on
the one screen with a giant clipped ornament, is not a good trade for removing three physical
utilities.

The findings were log-only (`OVERLAY` means the occluder sits in a fixed/sticky layer, which
is usually its job), so this would have been easy to wave through. It is recorded here so the
next person does not retry the same conversion and rediscover it.

---

## Verification used

- **`scripts/elim-tag.cjs`** tags each centring site with `data-elim="N"`, which survives the
  edit — class strings change, so they cannot key a before/after comparison.
- **`scripts/elim-measure.mjs`** records each tagged element's box in both languages at 390px
  and 1440px, against the dev server.
- Result across the eliminated sites: **60 measurements, 0 moved, 0 disappeared, 0 appeared.**
- Full `check-layout.mjs` pass afterwards is identical to the pre-pass baseline: 249 findings,
  177 failing, OVERLAY 72.

**Coverage limit, stated plainly:** 9 of the 12 eliminated sites were verified by measurement.
The other 3 — the AppBar bell icon and two avatar initial spans — sit behind states a plain
route visit does not reach, so their equivalence rests on construction rather than measurement:
each is a single child centred in a fixed-size box whose parent now carries
`flex items-center justify-center`. The AppBar case is the strongest of the three, since its
parent already had `flex items-center justify-center` and the absolute positioning was inert.
