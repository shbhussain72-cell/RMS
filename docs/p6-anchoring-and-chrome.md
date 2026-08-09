# P6 — anchoring and chrome

Branch `fix/popovers-chrome`. Opened 2026-08-09, immediately after P8's follow-ups.

## Session baseline — `check-layout`

Captured on a clean tree at `701013a`, after `npm run build`, so `dist/` matches source. (A
measurement taken against a stale `dist/` is the inherited methodological error in this repo:
it reports the layout of whatever was last built, not of what is being judged.)

    node scripts/check-layout.mjs        # 250 route visits — 25 routes x 2 languages x 5 widths

### The number moved three times, all for reasons that are not "fixes"

| | raw | failing | why |
|---|---:|---:|---|
| four widths, old rule | 136 | 58 | the session's opening baseline — and 1150 had never been measured |
| **five widths, old rule** | **151** | **64** | +15 raw / +6 failing, purely from adding 1150 |
| **five widths, new rule** | **151** | **44** | 20 raw moved from gating to log-only by the exemption fix; nothing dropped |
| after the EventJourney fix | 147 | **40** | the only real repair in this table |

**The five-width baseline for delta judging is 151 raw / 44 failing.**

#### What 1150 had been hiding: almost nothing

15 raw findings, 6 of them gating. But only **one distinct finding is seen at 1150 and nowhere
else**, and it is log-only: `span.ai-cta__pill over p.mt-[1px].font-bold.uppercase` on `/miqaats`
— the Ask Help pill over a card label. Every other 1150 finding is a recurrence at a new width of
something already reported at 768, 1024 or 1440.

So the four sessions of blindness cost one log-only finding. That is worth stating plainly
because the reasonable expectation was worse: the width was on the canonical list because
something was once reported clipped there, and the honest answer is that whatever it was is
either gone or is being caught at the neighbouring widths anyway.

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

All positive.

> **Do not add the ResizeObserver mechanism. This is a decision, not an omission.**
>
> Confirmed by the brief's author after the measurements above. `PhoneScreen` renders the footer
> as a sibling AFTER the content inside the flex column, so `position: sticky` keeps it in normal
> flow and it never overlays anything. Padding the scroll container would not close a gap —
> there is no gap — it would insert dead space above the footer on every screen in the app.
>
> A later session reading the original brief will find a prescribed fix that looks unimplemented.
> It was not skipped: it addresses a layout this app does not have. If the shell ever changes so
> the footer is `fixed`, or is lifted out of the flex column, the mechanism becomes correct again
> — and `check:overlap` is what will say so, by failing.
>
> **And do not propose moving the sticky positioning onto `StickyFooter` or onto the `.sticky-cta`
> class to "make it structural".** That was tried, and it unpinned every footer in the app. A
> sticky element is constrained by its parent's box; the footer's parent is a wrapper of exactly
> its own height — `w-full` from the shell, `sm:hidden` from the screens that dual-render — so it
> gets zero travel and behaves as static. On `/roster` at 390 the footer's bottom edge measured
> 1860px against an 833px viewport while `getComputedStyle` reported `sticky` throughout.
> Stickiness has to live on an element whose parent is the tall container, which makes it the
> shell's job and not the footer's. The instruction to make it structural was withdrawn by its
> author after the test. See `docs/assertion-discipline.md`.
>
> Scoped content-inset inside the two desktop panels was the next hypothesis and it was measured
> and rejected too — see §4.8-scoped below.

## §4.8-scoped — RESOLVED: there was no defect

**Four causes were proposed for one symptom. All four were wrong, and the symptom was a probe
artifact.** The sequence is worth keeping because the errors were not random — each one was
plausible from the previous one's evidence.

| # | proposed cause | by | how it died |
|---|---|---|---|
| 1 | footers overlap the last card on /roster, /raza, /city-allocation, /zone-allocation; add a ResizeObserver content-inset | brief | clearances measured positive on every route; the mechanism addresses a layout this app does not have |
| 2 | /araz and /people mount their footer outside the sticky wrapper, so move it inside | me, then confirmed as a session instruction | true, and not the cause — those footers are pinned in behaviour anyway. Implementing it unpinned every footer in the app |
| 3 | the two desktop panels do not reserve room for their footer; apply a scoped content-inset | brief | the overlapping table appeared to be outside the scroll region, so an inset would move nothing |
| 4 | the table is rendered outside the panel's `overflow-y-auto` region | me | **wrong, and my own probe's fault** — the ancestor walk was capped at 6 levels and stopped one short of the scroller. The table is inside it |

### What it actually was

`check-layout`'s OVERLAP test compared raw `getBoundingClientRect` values. Geometry is not paint:
a table row scrolled past the bottom of an `overflow-y: auto` panel still reports an on-screen
rect while nothing of it is drawn. On `/araz` at 768 the "Host City" button reports a rect at
y=779–800 that lands inside the footer's band, and `elementFromPoint` at its own centre returns
the footer's label — **the button is not painted anywhere at all.**

The occlusion test in the same file has honoured this since `pointVisible` was written; its
docblock records it as the single largest false-positive class here, 51 of 53 OCCLUDED hits on
these very routes. **OVERLAP never got the same treatment.** One `continue` closes it:

    if (!pointVisible(a, cx, cy) || !pointVisible(b, cx, cy)) continue

**14 OVERLAP findings gone, 0 new, all on /araz (9) and /people (5).** Failing 40 → 26. It does
not suppress the case the test exists for: two controls both painted, one covering the other,
still overlap and still fail.

### The registered acceptance test is withdrawn

The pending assertion — "`elementFromPoint` at the intersection must return the button" — is
deleted rather than satisfied. Its premise was that the button is on screen and unreachable. It is
not on screen. Adding it would have asserted something false about a screen that is working.

Registering it was still right: it is the reason this was revisited instead of being left as a
to-do that quietly aged out.

## The residue — closed

`check-layout` **exits 0**. Every number below is measured on the rendered page in both
languages at all five widths.

| | raw | failing | why |
|---|---:|---:|---|
| reference | 151 | 44 | five widths, exemption fixed |
| carried in | 133 | 26 | after the OVERLAP paint check |
| shared paint predicate | 133 | 26 | instrument unified; **no count moved** |
| miqaat card | 116 | 10 | `@container`, 488px measured |
| city grid + stat tile + divider | 111 | 5 | three measured constants |
| painted-rect sampling | 110 | 4 | one boundary artefact |
| members table split | **106** | **0** | 36% is the measured floor |

### The instrument sweep

Only `OVERLAP` ever compared raw rects wrongly, and it was already fixed. The other reads in
`check-layout` are scroll-invariant by construction — `CLIPPED` compares a descendant with its
own ancestor, `RTL-SCROLL` a container with its own first child, `TALL-ROW` reads a height.
Both members of those pairs translate together, so no stale-rect false positive is possible.

The sweep found the defect one file over: `check-overlap`'s STICKY compares a text rect with
the footer rect ungated. It reads clean only because it scrolls every scroller to the bottom
first, which happens to paint what it then measures — true only for content a vertical scroll
can reach. The predicates now live in `scripts/probe-dom.mjs`, installed identically in every
probe, guarded by `probe-dom.test.mjs`. That guard found a live offender on its first run:
`probe-stacking.mjs` hit-tested at a point taken from the victim's own rect.

### The three defects, and the two things that were not defects

| what | measured | fix |
|---|---|---|
| miqaat card, 16 findings | row needs 488px; got 341 at 768, 460 at 1024 | `@container`, media width alone decides |
| relay city grid, 6 sites | widest status "Not available" 74px + 24px padding | `auto-fill minmax(98px,1fr)` |
| StatTile | label 73px pinned inside `w-[64px]` at every width | span the tile, measured 85px min, row wraps |
| SectionDivider rule | gradient alpha 0 at the sample point — **nothing visible** | `pointer-events-none`; a hit-test artefact |
| /people "Other Details" | heading 772-800, panel ends 786 — **centre on the boundary** | probe now samples the painted rect |
| members table rows | U-shaped curve, floor at 36%; widening trades 95px scroll for 295px | 36% split |

Two of the six were instrument artefacts, not app defects. Both are recorded as such rather
than absorbed into a lower number.

### Found by eye, not by any assertion

The "Request all to Mumbai" pill on `/manage/relay` at 768 is sheared by the left pane's edge.
`CLIPPED` cannot see it — its clipper is not `overflow-x: hidden`. Not fixed.

## Verification

| check | result |
|---|---|
| `tsc -b` | clean |
| `vitest run` | **86 passed**, 10 files (+3 probe-dom guards) |
| `npm run build` | passes — build:lsd, check:lsd, tsc, vite build |
| dev-only dist grep | 13/13, route table in step (26 routes) |
| `check:lsd` | 199 outstanding, 199 baselined, no new |
| `check-centred` | off-centre >1.5px: 0 · actually clipped: 0 — **now including 1150** |
| `check-numerals` | nodes mixing both systems: 0 |
| `check-lsd-clip` | vertically clipped LSD: 0 |
| `check:mirror` / `check:anchor` / `check:chrome` / `check:devdock` / `check:dictionary` / `check:tour` | 0 failing each |
| `check:remarks` | 56/56 |
| `check:overlap` | 0 failing — sticky, reachable, once, appbar |
| `deliverables` / `widths` guards | pass |
| `check-layout` | **106 raw / 0 failing** against the 151 / 44 five-width baseline — exits 0 |
| `probe-dom` guards | 3 rules, incl. every hit test gated or explicitly exempted |
| `check:bidi` | **not re-run to completion** — exceeded a 500s cap; no bidi-related code changed |

Screenshots: **250** — 25 routes x 5 widths x 2 languages, one run, at the end.

---

## Transforms are never only transforms — and an identity transform still counts

Two findings in this repo have the same root, and both were invisible in a screenshot.

| | `-translate-x-1/2` on `Success.tsx` | `transition-transform` on `MiqaatList`'s sticky header |
|---|---|---|
| what the transform also did | created a **stacking context** | created a **containing block for `position: fixed`** |
| what broke | paint and hit-test order — the clipped ornament began hit-testing above the heading | the popovers' `fixed` coordinates resolved against the header, not the viewport |
| how it looked | pixel-identical, 8 new log-only OVERLAY findings | a panel 137px (account) and 40px (bell) from where the arithmetic said |
| what was measured and correct anyway | every box | every `getBoundingClientRect` that fed the placement |
| caught by | `check-layout.mjs` | `check-anchor.mjs` |

**The trap is that the transform does not have to do anything.** The sticky header's computed
transform is `matrix(1, 0, 0, 1, 0, 0)` — an identity. It moves nothing, and it establishes a
containing block exactly as a real translation would, because the spec keys off *any value other
than `none`* (CSS Transforms §3), not off whether the matrix is the identity. Reading a computed
style, seeing `matrix(1, 0, 0, 1, 0, 0)` and concluding "no transform here" is the specific
mistake; the only value that means no transform is `none`.

`transform` is not the only property that does this. `filter`, `backdrop-filter`,
`will-change` naming either of them, `contain: paint` / `contain: layout` and `perspective` all
establish a containing block for fixed descendants too, and most of them establish a stacking
context as well.

**Why the popover is portalled.** `components/Popover.tsx` renders through `createPortal` to
`document.body` so that no consumer's wrapper can reach it. That is not a stylistic choice and it
should not be "simplified" back to an in-place render — the next person to wrap a trigger in a
sticky, animated or filtered container will reintroduce this, and the failure will look like a
placement bug in the popover rather than a containing block in their wrapper. The mechanism is
recorded beside the portal in `Popover.tsx` as well, so it is found from the code and not only
from here.

## Suites that pass because they never looked

`check:anchor` was green for months while driving exactly one consumer of `Popover` — the `/araz`
relay dropdown — and reporting on the contract in general. Both AppBar popovers were broken the
whole time. Two more instances of the same shape are open, found by audit rather than by failure:

**1. `check-anchor.mjs` covers 3 of 6 `<Popover>` call sites.** Exercised: `Araz.tsx:232`,
`AppBar.tsx:218`, `NotificationPanel.tsx:275`. Never opened: `CitySelection.tsx:363` and
`:1163` (the zone and relay pickers on `/city`) and `ArrangeCities.tsx:300` (`/arrange`). The
suite visits `/miqaats` and `/miqaats/:id/araz` and no other route.

  §4.9 above states that CitySelection "already routes both info popovers through
  `components/Popover` (lines 363, 1163). `check:anchor` 0 failing at 390 and 1440, both
  languages." **The first half is true and the second does not follow** — the suite never loads
  that route, so its zero says nothing about those two consumers. Routing through the primitive
  is not the same as being exercised, and this is what that distinction looks like written down
  as though it had been measured.

  The fix is not more cases. It is deriving the consumer list from source — count `<Popover`
  call sites in `src/`, require every one to be claimed by an exercised case, fail on any that
  is not — so a new consumer cannot be added without either covering it or failing the check.
  `check-dev-only.mjs` already does this shape for the route table.

**2. `check-mirror.mjs` skips its third section silently.** The bidi census reads
`artifacts/audit/bidi.json` and, when the file is absent, calls `skip()` and exits 0.
`artifacts/` is gitignored, so on a fresh clone — and on any CI runner — that file never exists
unless `check:bidi` happened to run first in the same job. The check reports success having run
two of its three sections. `skip()` for "this route has no sticky footer, nothing to reserve" is
a legitimate skip; `skip()` for "my input is missing" is a failure wearing a skip's clothes.

The general rule these keep re-teaching: **a suite must assert what it covered, not only what it
found.** `check-anchor.mjs` and `check-brackets.mjs` both now end with a coverage assertion that
fails on zero exercised cases, which is the cheapest version of it.
