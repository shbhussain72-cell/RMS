# P6 — anchoring and chrome

Branch `fix/popovers-chrome`. Opened 2026-08-09, immediately after P8's follow-ups.

## Session baseline — `check-layout`

Captured on a clean tree at `701013a`, after `npm run build`, so `dist/` matches source. (A
measurement taken against a stale `dist/` is the inherited methodological error in this repo:
it reports the layout of whatever was last built, not of what is being judged.)

    node scripts/check-layout.mjs        # 200 route visits — 25 routes x 2 languages x 4 widths

**136 raw findings / 63 distinct route+element. 58 failing, 78 log-only.** OVERLAY is the
log-only class; OVERLAP, CLIPPED, TALL-ROW, OCCLUDED, PAGE-OVERFLOW and RTL-SCROLL gate.

The suite exits 1 on a clean tree because that backlog predates the session. Judge by delta
against **136 / 58**, not by exit status — a run that ends 1 having removed findings and one
that ends 1 having added some are indistinguishable by exit code.

## Reproduce-first pass

Run once, at the start, across every §4 item. **Four of the seven no longer reproduce** and were
left alone.

| item | reproduces? | evidence |
|---|---|---|
| §4.4 AppBar identity overflow | **no** | `check:overlap` measures the identity element on all 25 routes x 5 widths x 2 languages: 0 overflowing, 0 escaping the bar, `title` present everywhere. `check:chrome` also 0. |
| §4.6 Documents card gradient | **yes** | fixed |
| §4.7 Duplicate instruction rows | **yes** — 4 of the 5 rows twice, in 10 of 10 views | fixed |
| §4.8 Sticky footers cover content | **no** | measured below |
| §4.9 `مرحلو 1 · LIVE` info popover | **no** | `CitySelection.tsx` already routes both info popovers through `components/Popover` (lines 363, 1163). `check:anchor` 0 failing at 390 and 1440, both languages. |
| §4.10 Ask Help dock | **no** | `AskHelpChat.tsx` is a `fixed inset-0` drawer with `min-h-0 flex-1 overflow-y-auto`. `inset-0` plus padding bounds it to the viewport more strictly than `max-h-[85dvh]` would, and it already scrolls internally. Nothing runs off the bottom at 833px. |
| §4.11 Success has no AppBar | **yes** | fixed |

### §4.8 in detail — why the mechanism was not landed

The brief specifies measuring the footer height into a CSS variable and padding the scroll
container. That fix is for a footer that *overlays* content. This one does not: `PhoneScreen`
renders it as `<div class="sticky bottom-0 z-20">` — a **sibling after the content, inside the
flex column**. A `position: sticky` box participates in normal flow, so at the end of the scroll
it sits below the last card rather than on top of it.

Measured clearance between the last content element and the footer's top edge, LSD, scrolled to
the bottom:

| route | 390 | 1440 |
|---|---:|---:|
| /roster | 19px | 133px |
| /raza | 119px | 123px |
| /city-allocation | 119px | 123px |
| /zone-allocation | 119px | 123px |
| /preferred-city | 54px | 63px |

All positive. Adding `padding-bottom` to the content column would not close a gap — there is no
gap — it would insert dead space above the footer on every screen in the app, which is a design
change the fix does not require.

What the class gets instead is an assertion, which also covers the `/preferred-city` clipped-
buttons variant that padding would not have caught: `npm run check:overlap` walks **every route
that has a sticky footer** (not a hand-listed set), scrolls every scroller to its end, and fails
if any text box intersects the footer block or if any footer control lands outside the viewport.
5 widths, 2 languages. Currently 0.

Two probe defects were found and fixed before that zero was believed:

- It read `document.querySelector('.sticky-cta')`. Screens with separate mobile and desktop
  markup render two, and the `sm:hidden` one comes first and measures 0x0 — so the probe was
  intersecting against an empty rect and reporting a clean sweep by construction.
- It skipped any element with a `position: sticky` ancestor as "an overlay of its own". The
  desktop two-pane layouts put page content inside sticky panels, so the content a footer would
  cover was being filtered out. Narrowed to `fixed` only; the footer's own wrapper is already
  excluded by containment.

A third, in the other direction: an early hand-probe compared only the Y axis and reported the
last city row 56px under the footer on `/city` at 1440. It is not — the two boxes are side by
side in the two-pane layout. Both axes are compared now.

## §4.6 + §4.7 — one edit, because the duplicate render was what the gradient was fading

**Canonical: the `Important Notice` section.** Those five rows are the wordlist's sentinel
entries — their cells carry an instruction rather than a translation, they render English on
purpose, and the standing rule is that they are neither deleted nor translated. The section
exists to carry them. The Documents card is a preview of an organiser-supplied document: its job
is to show one exists and to open it, which it can do without restating the notices.

So the card's 150px clipped box now shows what identifies the *document* — its title and opening
line — and the "View document" pill moved to its own row underneath. With no list in the box
there is nothing for a gradient to fade, so rows 2–5 can no longer sit half-legible under it.
Preferred over raising the collapsed height, which re-breaks whenever a string changes length,
i.e. every time this app switches language.

`GUIDELINES_RULES` stays a separate array rather than being pointed at `importantNotices`: these
are the document's words and those are the app's, the fixture wording agreeing today is not a
reason to fuse them, and the sentinel rows have to keep their own wordlist identity.

## §4.11 — Success chrome

It was the only route with no AppBar. It is also not a page: an opaque `z-40` full-viewport
scrim with a `z-50` card and nothing underneath. In normal flow the AppBar would have rendered
*behind* the scrim — chrome nobody can see. It renders at `z-45` instead, above the scrim and
below the card, reading as the header of a dimmed page.

Additive only. No existing z-index, transform or centring is touched — this file carries a
documented centring exemption and a 4398x4271px clipped ornament whose stacking is sensitive.
`check-layout` on `/success`: **0 findings before, 0 after**; repo-wide the findings diff key by
key with **0 new and 0 gone**.

## The layout residue — all 58 accounted for, 0 fixed

58 raw across 18 distinct route+element pairs.

| bucket | raw | distinct | verdict |
|---|---:|---:|---|
| occluder is fixed/sticky | **33** | 11 | intentional overlay — and mis-bucketed, see below |
| clipped horizontally | 21 | 4 | genuine |
| tall row | 4 | 1 | genuine |
| occluder is in-flow | 3 | 2 | genuine |

### The fixed/sticky 33 are a probe inconsistency, not defects

Nine of the ten distinct OVERLAP findings are `<something> ∩ button.flex.h-[52px].min-w-[120px]`
— that button is the **StickyFooter primary CTA**, inside `div.sticky.bottom-0.z-20`. The tenth
is `div.ix-card-lg ∩ button.ai-cta.fixed.bottom-[24px]`, the Ask Help FAB, `position: fixed`.
The one OCCLUDED entry on `/people` names `div.sticky-cta` as its occluder while its `detail`
field says "in-flow".

`check-layout` already exempts a fixed/sticky occluder under OVERLAY and logs it rather than
failing. Applying a different rule to the same occluder under OVERLAP and OCCLUDED is an
inconsistency in the instrument. **I have not changed the classification**: reclassifying is
indistinguishable from moving the goalposts when the graded number is the failing count, and it
is the kind of change that should be made deliberately rather than at the end of a long session.
Flagging it as the single highest-value next edit to `check-layout`, worth 33 of the 58.

The strong form of that contract is asserted independently and does not depend on the
classification: `check:overlap` fails if *anything* is under a sticky footer at the end of a
scroll, on 5 widths in both languages.

### The genuine 25

| kind | raw | route | what | widths |
|---|---:|---|---|---|
| CLIPPED | 16 | `/miqaats` | `div.ix-card-lg` scrollWidth 488 > clientWidth 341, `overflow-x: clip`, on "06:30 AM IST" | en/lsd @768,1024 |
| CLIPPED | 3 | `/miqaats/:id/timeline` | `div[AppScreen]` scrollWidth 812 > clientWidth 768 — a page-level overflow, the worst of the four | en/lsd @768,1024 |
| CLIPPED | 1 | `/miqaats/:id/manage/relay` | 189 > 180 on "Available" | en @768 |
| CLIPPED | 1 | `/miqaats/:id/review` | 69 > 65 on "Headcount" | en @768 |
| TALL-ROW | 4 | `/miqaats/:id/people` | member `tr` 149px tall | en @768,1024 |
| OCCLUDED | 2 | `/miqaats/:id` | `div.absolute.start-1/2.end-0` over "Important Notice" | en @1024,1440 |
| OCCLUDED | 1 | `/miqaats/:id/timeline` | `div.group.relative.min-h-[92px]` over a `bdi`, "Registration" | lsd @768 |

**None of these were fixed.** The session ran well past its budget on the reproduce-first pass
and the three §4 fixes, and the instruction is to stop at a section boundary fully committed
rather than start work that cannot be finished and verified. They are a clean next section: four
CLIPPED (all "fixed-width container meets longer text", exactly the predicted shape), one row
height, and two genuine in-flow occlusions.

## Verification

| check | result |
|---|---|
| `tsc -b` | clean |
| `vitest run` | 80 passed, 8 files |
| `npm run build` | passes — build:lsd, check:lsd, tsc, vite build |
| dev-only dist grep | 13/13, route table in step (26 routes) |
| `check:lsd` | 199 outstanding, 199 baselined, no new |
| `check-centred` | off-centre >1.5px: 0 · actually clipped: 0 |
| `check-numerals` | nodes mixing both systems: 0 |
| `check-lsd-clip` | vertically clipped LSD: 0 |
| `check:mirror` | 0 failing |
| `check:anchor` | 0 failing |
| `check:chrome` | 0 failing |
| `check:devdock` | 0 failing |
| `check:dictionary` | 0 failing |
| `check:tour` | 0 failing, overlay class A 0 |
| `check:remarks` | 56/56 |
| `deliverables` | 3 passed |
| **`check:overlap`** (new) | **0 failing** — sticky, reachable, once, appbar |
| `check-layout` | **136 raw / 58 failing — unchanged**, 0 new, 0 gone |

Screenshots: **250** — 25 routes x 5 widths x 2 languages.

The first run of the harness produced 200, because `shoot.mjs` defaulted to `[390, 768, 1024,
1440]`. **1150 was missing**, so every "full harness, five widths" this repo has recorded was
four; the run's own tally (`200/200, no missing routes`) was self-consistent and said nothing
about which widths it had covered. Fixed and re-run, which is why the harness ran twice.

`check-layout` has the same four-width default. It is **left alone deliberately** — adding 1150
mid-session would change what the 58 baseline counts and make the delta meaningless. It belongs
at the start of the next session, with a fresh baseline taken at five widths.
