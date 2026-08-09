# Assert the outcome, never the mechanism

An assertion must observe the behaviour a user would notice. It must not observe the declaration
that is supposed to produce that behaviour.

The two agree right up until the moment they don't, and the moment they don't is the moment you
needed the test. A test that reads the mechanism cannot fail in the one situation it exists for,
because the mechanism is exactly what you just changed.

This has now happened seven times in this repo, in seven different places, to seven different
kinds of claim. It is not a coincidence and it is not carelessness — asserting the mechanism is
always the easier thing to write, and it always passes first try, which feels like success.

## The seven worked examples

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

### 4. `npm run build | tail -3` cannot report a failure

**Mechanism asserted:** "some text came out of the build."
**Outcome wanted:** "the build succeeded."

A shell pipeline exits with the status of its LAST command. `tail` always succeeds. So

    npm run build 2>&1 | tail -3 && git commit ...

commits whatever the build did, including failing. The `&&` looks like a guard and is not
one: it is guarding on `tail`.

This shipped a commit whose build was broken — `check:lsd` was failing on it the whole time,
and the three lines `tail` printed were the failure message, read as ordinary output.

It is the cheapest of these to reintroduce, because piping a long build into `tail` is
the obvious way to keep the transcript short, and the failure is invisible: the command exits
0 and prints something plausible.

**Fix:** capture the status of the command you care about, not of the formatter.

    npm run build > /tmp/build.txt 2>&1; echo "EXIT=$?"; tail -20 /tmp/build.txt

`set -o pipefail` also works where the shell supports it. Either way the rule is the same:
**never verify through a pipe.** If a command's exit code is the thing being checked, nothing
may come after it in the pipeline.

### 5. "Remarks are saved in this browser only" — true when written, false when read

**Mechanism asserted:** nothing. No test was involved.
**Outcome wanted:** the sentence in front of the reviewer describes where their remarks go.

This one is a different animal from the first four and it belongs here anyway, because it is the
same failure with the assertion removed: **a factual claim, correct on the day it was written,
made false by a change somewhere else, with nothing anywhere that fails.**

The remarks panel carried a notice: *remarks are saved in this browser only*. It was accurate for
as long as the adapter was `localStorage`. The day the default adapter became `sharedAdapter` the
sentence became a lie — and not a harmless one. It told a reviewer their notes were private on a
store six people can read. Nothing in the diff touched the notice. No test mentioned it. The build
passed, the feature worked, and the only thing wrong with the change was a paragraph it did not
edit.

The same shape is already latent elsewhere in this tooling. The dictionary editor's **"edited"
badge** reads `staged: true`, which is set by whatever applied an override. Apply a merged
override — one whose value is already in the committed wordlist — and the badge goes on claiming
an unsaved edit for a row that shipped a month ago. True when written, false after the sync
existed. See `docs/dictionary-editing.md`; the fix was to stop applying merged overrides at all,
so the badge's input can no longer say something the badge's words deny.

**Why it will recur:** review tooling is mostly claims. "This is only visible to you", "this is not
yet saved", "anyone with the link can edit this", "N edits not yet in the wordlist". Every one is a
statement about a property of the system, written once, rendered forever.

**The cheap guard, where one exists:** *derive the sentence from the property it describes.* Not

    <p>Remarks are saved in this browser only.</p>

but a notice whose text is a function of the adapter actually in use, so that changing the adapter
changes the sentence in the same edit. That converts an invisible staleness into an ordinary code
change — and if the new adapter has no branch, the notice fails to compile rather than lying. Same
for counts: "N edits not yet in the wordlist" is safe *because* N is computed from the comparison
it describes. A hard-coded "some edits are pending" would not be.

**Where no cheap guard exists, say so.** The identity disclaimer — *anyone with the link can type
any name* — is a claim about Vercel Deployment Protection, not about anything in this repository.
No property of the code can confirm or deny it. Nothing here can check it, so it does not get a
guard; it gets a comment at the claim naming what would falsify it (an auth system arriving), and
that is the whole of the defence. Pretending otherwise would be a third layer of the same mistake.

### 6. "This usually means /api is being served the app shell"

**Asserted:** a cause.
**Observed:** a content type.

The API client threw on any non-JSON response — correct, and the reason nothing was silently
lost. But the message it threw ended with a diagnosis:

> The API returned text/plain; charset=utf-8 instead of JSON. This usually means /api is being
> served the app shell — the request never reached a function, so nothing was saved.

It had checked the content type. It had not checked the body, the status, or anything else. The
actual response was:

    500  text/plain
    A server error has occurred
    FUNCTION_INVOCATION_FAILED

The request *had* reached a function; the function threw. Every word after "instead of JSON"
was invented, and it named a file — `vercel.json` — that had nothing wrong with it. Two people
went and read it. The rewrite was narrowed, which was harmless and irrelevant. The actual fault
sat untouched for as long as the guess was believed.

**This is the same defect as the five above, moved one layer out.** A test that asserts a
mechanism substitutes something it can see for something it cannot; a diagnostic that asserts a
cause does exactly that, and then says it out loud to the next person. Both fail confidently, in
a direction that feels like an answer.

**A wrong cause is worse than no cause,** because "not JSON" leaves the search open and "the
rewrite is matching /api" closes it. The cost is not the sentence — it is every minute spent in
the file the sentence named.

**Fix:** report the observation and stop.

    The API answered 500 text/plain; charset=utf-8, not JSON.
    The response began: "A server error has occurred FUNCTION_INVOCATION_FAILED bom1::abc"

Whitespace collapsed rather than first-line-only, because Vercel puts the generic half on line
1 and the identifying half on line 3 — a first-line report would have hidden the useful part,
which is how the message went wrong to begin with. Every case that reaches this throw now
identifies itself from the body alone: `<!doctype html>` is the rewrite or a protection
challenge, `FUNCTION_INVOCATION_FAILED` is a function that threw, an empty body is neither.

**The rule:** a diagnostic may state what it observed — status, content type, the bytes that
came back. It may not state why, unless it checked. If a cause is worth guessing at, put it in
the docs and let the reader apply it to the evidence; do not stamp it on the evidence.

### 7. A comment computed a specificity and nobody ever recomputed it

**Mechanism asserted:** "this selector weighs (0,0,1), so the utility class still wins."
**Outcome wanted:** "a centred translated node renders centred."

A new shape for this file. The first six were probes measuring the wrong subject. This one is not
a probe at all — it is a **comment stating a computed value, sitting directly above the rule it
describes, and wrong about it.** There was nothing to fail. It read:

```css
/* `:where()` contributes ZERO specificity, so the selector weighs (0,0,1) and any
   Tailwind alignment utility on the element (`text-center` on a hero heading)
   still wins. Centred copy stays centred in both languages. */
html[data-lang='lsd'] :where([dir]) {
  text-align: start;
}
```

Every clause of that is checkable and the conclusion is false. `:where()` zeroes only what it
*contains*. The two compounds outside it still count: the type selector `html` and — the one that
was overlooked — the **attribute** selector `[data-lang='lsd']`. The rule weighs **(0,1,1)**.
Tailwind's `.text-center` weighs (0,1,0). The rule wins, and had won since it was written.

The consequence: **every translated node in LSD carrying an explicit `text-center` was flushed to
the reading start, for as long as the rule existed.** It surfaced as two of the five defects in
one review brief — `/login`'s heading, reported as "small and off-centre", and `/success`'s
"Registration كامياب تهيو", reported as needing centring — filed as unrelated bugs on unrelated
screens by someone who could only see the symptoms. `/login`'s heading was also overflowing the
panel's right edge, which is what "off-centre" looked like on a narrow screen.

Two things made it durable. It is **self-certifying**: the sentence explains why the thing works,
so a reader checking "is this handled?" finds an answer and stops. And a specificity is
**arithmetic on a selector**, which reads like something already verified rather than something
someone did in their head once. Nobody re-derives a number that is already written down.

**Fix:** wrap the whole selector — `:where(html[data-lang='lsd']) :where([dir])` — which puts it
at (0,0,0) and matches what the comment always claimed. It still resets an alignment *inherited*
from a centred ancestor, which is the case it exists for, because any matching declaration beats
an inherited value at any specificity.

**Guard:** `scripts/check-centred.mjs` now asserts the **rendered** `text-align` of every element
that asks for one and carries a `dir` — 215 nodes across 25 routes, both languages, four widths.

Note what the guard deliberately does NOT do: **recompute the specificity.** A test asserting
`(0,0,0)` would be this very bug written a second time — the same arithmetic, by the same person,
with the same blind spot, now with a green tick on it. The browser already knows the answer; ask
it what it painted. Sabotage-tested by restoring the old selector: 120 of the 215 fail.

## The shape they share

Each one substituted something *upstream* of the user-visible effect:

| | asserted | should have asserted |
|---|---|---|
| stale dist | the artifact that was built | the source in hand |
| min-w | the constraint exists | the content is never clipped |
| PINNED | the CSS property | the rendered position while scrolling |
| piping to `tail` | that the command produced output | that the command succeeded |
| the stale notice | nothing — prose asserts itself | the storage the sentence names |
| the guessing diagnostic | a cause it had not checked | the status, type and body it had |
| the specificity comment | arithmetic done once, in prose | the alignment the browser painted |

And each failed in the same direction: **silently, in the green direction, at the moment of the
change it was written to police.** None produced an error. Two produced an apparent improvement.
The fifth is the limit case: there was no assertion to fail, so the only thing that could catch it
was somebody reading the sentence and remembering what had changed underneath it.

The seventh extends the fifth. A sentence asserts itself, and a sentence containing a COMPUTED
VALUE asserts itself hardest of all: it looks like the output of a check rather than the input to
one. Treat any number written in prose — a specificity, a threshold, a ratio, a count — as
unverified until something re-derives it from the running system. If it cannot be re-derived, it
is a claim, not a fact, and it should say so.

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
