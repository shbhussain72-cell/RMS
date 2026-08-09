# Assert the outcome, never the mechanism

An assertion must observe the behaviour a user would notice. It must not observe the declaration
that is supposed to produce that behaviour.

The two agree right up until the moment they don't, and the moment they don't is the moment you
needed the test. A test that reads the mechanism cannot fail in the one situation it exists for,
because the mechanism is exactly what you just changed.

This has now happened three times in this repo, in three different suites, to three different
kinds of claim. It is not a coincidence and it is not carelessness — asserting the mechanism is
always the easier thing to write, and it always passes first try, which feels like success.

## The three worked examples

### 1. `check-layout` read a stale `dist/`

**Mechanism asserted:** "the built bundle has this layout."
**Outcome wanted:** "the code in front of me has this layout."

The suite measured whatever was last built. Every run after a source change reported the layout of
the previous change, confidently and with exact pixel numbers. Nothing was wrong with the
measurement; it was measuring the wrong artifact.

**Fix:** build before measuring, every time. It is written into every session's method now.

### 2. `min-w-[320px]` passed at one width

**Mechanism asserted:** "the constraint I wrote is present and one width passes."
**Outcome wanted:** "the calendar is never clipped, at any width."

320px was a guess. At 768 the calendar wrapped and the finding cleared, so the fix looked right.
At 1024 the calendar *fitted* the 320 test, declined to wrap, took the 496px on offer and
overflowed its month grid by 58px. One width passing is not the constraint being correct. The
measured minimum was 560.

**Fix:** measure the subject and use the measured number. Never a round number that makes the
width in front of you pass.

### 3. `PINNED` checked `position === 'sticky'`

**Mechanism asserted:** "some ancestor has `position: sticky`."
**Outcome wanted:** "the footer stays at the bottom of the viewport while the page scrolls."

Moving `sticky bottom-0 z-20` onto the `.sticky-cta` class unpinned every footer in the app: a
sticky element is constrained by its parent's box, its parent was a wrapper of exactly its own
height, so it had zero travel and behaved as static. The computed value said `sticky` throughout.
On `/roster` at 390 the footer's bottom edge was 1860px against an 833px viewport — a thousand
pixels below the fold, mid-scroll — and the assertion said ok.

`check-layout` agreed: it fell from 147 findings to 55, because a footer that has stopped covering
anything stops generating occlusion findings. A 63% improvement, and it was pure regression.

**Fix:** scroll to the middle of the page and look at where the footer is.

## The shape they share

Each one substituted something *upstream* of the user-visible effect:

| | asserted | should have asserted |
|---|---|---|
| stale dist | the artifact that was built | the source in hand |
| min-w | the constraint exists | the content is never clipped |
| PINNED | the CSS property | the rendered position while scrolling |

And each failed in the same direction: **silently, in the green direction, at the moment of the
change it was written to police.** None produced an error. Two produced an apparent improvement.

If a probe's number moves a long way in the direction you were hoping for, that is a reason to
distrust it, not to write it up. Both of the improvements above — 147 → 55, and "the clipping is
fixed" — would have been reported as wins.

## The rule, stated for reuse

> Ask: **if the mechanism were replaced tomorrow with a different mechanism that produced the same
> result, would this assertion still pass?** If no, it is asserting the mechanism.
>
> Then ask: **if the mechanism stayed but silently stopped working, would this assertion fail?**
> If no, it is asserting the mechanism.

A good assertion survives the first question and fails the second one loudly.

## Where a declaration IS the right subject

Not every static rule is this mistake. Some rules exist to prevent a *pattern* from entering the
codebase, and the pattern itself is the subject:

- `widths.test.mjs` — "no script writes its own width array". The literal is the defect.
- `centring.test.mjs`, `logical-props.cjs`, `source-hygiene.test.mjs` — physical-property and
  LSD-in-source sweeps. The source is the subject.
- `deliverables.test.mjs` — "no script deletes a deliverable". Running every script to find out
  is not an option.
- `check-dev-only.mjs` — greps the built bundle for dev-only strings. The string's absence from
  the shipped bytes *is* the outcome.

The distinction: those assert a property of the code because the code is what the rule is about.
The three failures above asserted a property of the code as a **proxy** for a property of the
rendered page. Where a proxy is unavoidable, pair it with an outcome test — `centring.test.mjs`
(source) is paired with `check-centred` (geometry), and that pairing is why neither is trusted
alone.

---

# The audit

Every suite in `scripts/`, against the rule above. Run 2026-08-09.

## Sound — asserts the rendered outcome

| suite | what it observes |
|---|---|
| `check-layout` | geometry and `elementFromPoint`. Occlusion is decided by what is actually painted at a point, not by z-index arithmetic. |
| `check-anchor` | panel/trigger rects, and the delta between them after scrolling — a stale rect shows up as divergence. |
| `check-centred` | measured offset from centre, in pixels, plus real clipping. |
| `check-devdock` | drag the dock, measure where it lands and whether its width changed. |
| `check-chrome` | hit-tests the dimmed area to confirm it is the backdrop; measures reserved footer space against actual footer height. |
| `check-overlap` | intersection rects, viewport containment, and (now) footer position mid-scroll. |
| `check-tour` | spotlight/anchor overlap area and tooltip containment, after waiting for the transition to settle. |
| `check-numerals`, `check-lsd-clip`, `check-bidi` | rendered text content and rendered box geometry. |
| `check-mirror` (weekday, breadcrumb) | reading order from rects; which `<path>` is painted, compared between the two languages. |

## Asserts a declaration — three found, one since fixed

### 1. `check-remarks` — `unicode-bidi: isolate` (line 328)

```js
return { hasBdi: !!bdi, isolate: bdi ? getComputedStyle(bdi).unicodeBidi : null }
```

Asserts that the `<bdi>` exists and that `unicode-bidi` computes to `isolate`. That is the
mechanism. The outcome is that a Latin run inside an RTL sentence lands in the right *place* — and
a `<bdi>` with the declaration set can still order wrongly if something upstream has already
concatenated the runs into one text node.

**Mitigated, not fixed:** `check-bidi` asserts the outcome (no text node mixes scripts without
isolation) across every route. The pair is sound; the declaration test alone is not.

### 2. `check-layout`'s `layerOf` — FIXED

Was: the fixed/sticky **exemption** decided by `getComputedStyle(...).position`. Now: decided by
whether the occluder **stays put when the thing it lives in scrolls**, which is what "intentional
overlay" actually means. Scoped to elements already implicated in a finding and grouped by
scroller, so a page costs a handful of scroll operations rather than one per candidate.

**Result: 147 raw / 40 failing, unchanged. Zero kind flips.** 132 of the 147 are now decided by
measurement; 107 of those measure as anchored and are correctly log-only.

The 15 that could not be measured are the interesting part, and they are *exactly* the group I
claimed last session was misclassified — `/araz` and `/people` at 768–1440. Nothing on those pages
scrolls: the desktop layout pins page height, and the members table overflows its panel **without
being clipped**, so there is no scroller anywhere in the ancestry. They fall back to the
declaration, and the fallback is labelled in `detail` rather than hidden:

    ..., 90x21px overlap [declared, not measured — nothing scrollable here]

**And the fallback's verdict is right.** I had called these false failures. They are not: with no
scroll available anywhere, content under the footer is unreachable by any means, which is strictly
worse than a sticky overlay you can scroll out from under. `OVERLAP`, failing, is correct.

That is the third time a remote diagnosis of this symptom did not survive measurement — this time
it was mine.

### 3. `widths.test.mjs` — imports, not sweeps

Asserts that every sweeping script imports the shared list. It cannot tell whether a script that
imports `NARROW_WIDTHS` is entitled to. The outcome form is that each harness *reports* the widths
it covered, which `shoot.mjs` now does — and which is how the original four-vs-five gap would have
been visible without comparing two literals by hand.

**Partly mitigated.** The literal ban is sound; the entitlement is not checked.

## Also worth stating

`deliverables.test.mjs` is static by necessity, and was validated against the real bug rather than
against green: the patch was restored to `artifacts/audit/`, `shoot.mjs` reverted, and the test
confirmed to name the line. That validation is what a static proxy owes.
