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

## The layout residue

### The exemption is now identical across overlap and occlusion

Taken as an explicit decision by the brief's author, so it is not a probe change made by the
person being measured by it. A sticky footer's CTA passing over the buttons beneath it is that
footer working — the same situation `OVERLAY` already exempted when the covered thing was text.
The ancestor walk existed twice, in one of the two places; it is now one helper, `layerOf`, used
by both. Overlaps with a fixed/sticky side become `OVERLAP-OVERLAY` and join `OVERLAY` in
`LOG_ONLY`. **Raw is unchanged at 151** — nothing was dropped, 20 entries moved.

**My "33" from the previous report was wrong.** I read the `where` strings and assumed every
`∩ button.flex.h-[52px].min-w-[120px]` was the sticky footer's CTA. Walking the ancestors says
20. The other 14 have no fixed or sticky ancestor on either side, because `/araz` and `/people`
render their footer outside `PhoneScreen`'s `sticky bottom-0` wrapper — so it overlaps instead
of sitting after the content. Those are genuine and are in the list below.

### Fixed: EventJourney's desktop columns

The left rail is a fixed 420px, the calendar needs 560px for its month grid, and with the 28px
gap that is 1008px of demand against 707px of content at the 768 breakpoint. `min-w-0 flex-1`
let the calendar shrink to whatever was left instead of wrapping, so it was pushed past the edge
and clipped by the shell's `overflow-x: clip`. Now `flex-wrap` + `min-w-[560px]`: the calendar
takes its own line at narrow desktop sizes and the side-by-side layout is untouched from 1150 up.

Two things worth recording:

- It removed **three** findings, not two. The third was the in-flow `OCCLUDED` on the same route
  — a milestone card painting over a `bdi` in LSD at 768. Filed as a separate defect, same cause.
- The first attempt used `min-w-[320px]`, which was a guess. At 1024 the calendar fitted that
  test, declined to wrap, took the 496px on offer and overflowed by 58px. One width passing is
  not the constraint being right; 560 is measured. `/timeline` now has zero findings at any
  width in either language.

### Remaining: 40 raw / 12 distinct — with a diagnosis each

| kind | raw | route | widths | diagnosed cause |
|---|---:|---|---|---|
| CLIPPED | 16 | `/miqaats` | en/lsd @768,1024 | `div.ix-card-lg` 488 > 341. The countdown block ("00 SEC" unit boxes) is 240px inside a `min-w-0` chain whose content box is 73px — it overflows by 167px and is clipped. Needs the countdown to shrink or wrap, not the card to widen. |
| OVERLAP | 12 | `/miqaats/:id/araz`, `/people` | en/lsd @768–1440 | the StickyFooter CTA over page buttons, with **no** sticky ancestor — these two screens render the footer outside `PhoneScreen`'s `sticky bottom-0` wrapper. Fixing the wrapper fixes the whole group and is the single highest-value item here. |
| TALL-ROW | 4 | `/miqaats/:id/people` | en @768,1024 | member `tr` 149px tall — the classic missing `min-width` on the name column, every word wrapping onto its own line. |
| OCCLUDED | 3 | `/miqaats/:id` | en @1024,1150,1440 | `div.absolute.start-1/2.end-0` painted over the "Important Notice" heading. |
| CLIPPED | 1 | `/miqaats/:id/manage/relay` | en @768 | 189 > 180 on "Available"; the neighbouring "Request all to Mumbai" pill is 188px in a 180px `shrink-0` box. |
| CLIPPED | 1 | `/miqaats/:id/review` | en @768 | 69 > 65 on "Headcount". `StatTile`'s label is pinned to `w-[64px]` with `whitespace-nowrap`; the word is 73px. 4px, EN only. |
| OCCLUDED | 1 | `/miqaats/:id/people` | en @1024 | `div.sticky-cta` over the "Other Details" heading — the same footer-wrapper cause as the OVERLAP group. |

**Stopped here at a section boundary, fully committed.** The diagnoses above are measured, not
guessed: each names the element, the numbers, and what has to give. The footer-wrapper group is
the next thing to do — 13 of the 40 in one edit.

## Verification

| check | result |
|---|---|
| `tsc -b` | clean |
| `vitest run` | **83 passed**, 9 files (+3 width guards) |
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
| `check-layout` | **147 raw / 40 failing** against the 151 / 44 five-width baseline |

Screenshots: **250** — 25 routes x 5 widths x 2 languages, one run, at the end.
