# Assert the outcome, never the mechanism

An assertion must observe the behaviour a user would notice. It must not observe the declaration
that is supposed to produce that behaviour.

The two agree right up until the moment they don't, and the moment they don't is the moment you
needed the test. A test that reads the mechanism cannot fail in the one situation it exists for,
because the mechanism is exactly what you just changed.

This has now happened eleven times in this repo, in eleven different places, to eleven
different kinds of claim. It is not a coincidence and it is not carelessness — asserting the mechanism is
always the easier thing to write, and it always passes first try, which feels like success.

The last four are variants worth naming separately, because none is fixed by watching what you
assert:

- **7 — the wrong subject.** The assertion was about the outcome, it was correct, and it was
  pointed at the wrong page. *A probe must prove it reached the thing it is testing, not merely
  that the thing it looked at was healthy.*
- **8 — no subject at all.** The assertion did not run, said so in a line nobody reads, and the
  suite exited 0. *A probe must prove it ran, not merely that nothing it ran failed.*
- **9 — the wrong world.** The assertion was about the outcome, it ran, it was pointed at the
  right file, and it was evaluated under settings production does not use. *A probe must run in
  the configuration that ships, not in the one the repo would prefer.*
- **10 — the wrong verb.** Same file, same settings, and the check performed a WEAKER operation
  than production does. Resolving is not importing. *A probe must do the thing that fails, not
  the thing next to it.*
- **11 — the wrong unit.** The assertion was true, every measurement under it was exact, and the
  subject had been mis-divided one layer upstream, so all of it was about something that was not
  a word. *When a check consults a corpus, the tokenisation of that corpus is part of the check.*

## The eleven worked examples

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

### 7. Twenty-four assertions passed on a page none of them were about

**Asserted:** that the page it looked at was healthy.
**Should have asserted:** that the page it looked at was the page it asked for.

`check-cold-load` seeds a saved session into `localStorage` before boot and walks three routes in
two languages at every narrow width, asserting on each that the error boundary did not render and
that the body holds more than forty characters. It reported **24 passes out of 24**. Every one of
those visits was sitting on `/login`.

The cause was one line away: `PERSIST_VERSION` had been set to 1 with no `migrate`, so zustand
discarded the seeded session, the app booted logged out, and `RequireAuth` sent all three routes
to the login page. And the login page renders cleanly. It has no error boundary, it throws
nothing, it is 137 characters of perfectly healthy content. **Every assertion was true.** The
suite was not wrong about what it measured; it was wrong about what it was measuring.

That is what makes this one different from the six above. Those substituted something *upstream*
of the user-visible effect — a CSS property for a rendered position, a build for a source tree.
This one asserted the effect, correctly, **on the wrong subject**. Nothing about the assertion
needed fixing. Its reach did.

**Why it will recur in any suite that navigates.** Almost every probe here asserts a negative:
no boundary, no overlap, no clipping, no mixed-script text node, no Latin numeral. A negative is
satisfied *most thoroughly* by a page with nothing on it. The better the assertion sounds — "no
element in the entire document occludes any other" — the more completely a blank or wrong page
satisfies it. Arriving is a precondition of every one of them and is asserted by none of them.

**The tell was in the output the whole time:** three different routes, each reporting exactly 137
characters. A threshold cannot see that. Only a comparison can, and there was no comparison,
because each route was judged alone.

**The fix, and which third of it generalises.** Three checks now stand between the suite and a
green run on the wrong page:

| check | catches | misses |
|---|---|---|
| `location.pathname` is still the route asked for | a redirect — `<Navigate to="/login" replace>` changes the URL | a fallback rendered *in place*, which keeps the URL |
| the body clears a floor measured from the real login page (137 → 400) | a blank mount, a shell with no route in it | a wrong page that happens to be long |
| **the three routes render different text from one another** | any case where the routes are not distinct pages, whatever the reason | a genuine bug that breaks all three identically |

The third is the one that would have caught this, and it is the one to copy. Note what it does
*not* require: a per-route marker string. That matters more here than in most codebases — every
visible string on these pages is translated into Lisan al-Dawat, so a marker-string assertion
either has to be authored in a language nobody on this side may write, or the suite can only run
in English, which is the half where the bugs aren't. Distinctness needs no copy at all and works
in both languages unchanged.

**The rule:** *a navigating probe must be capable of failing on a page that is not the page it
asked for.* If you cannot describe the assertion that would fail, the suite is reporting on
whatever it happened to land on. See the arrival audit at the end of this file for what happened
when every suite in `scripts/` was pointed at a build where all routes redirect to `/login`.

### 8. A skipped assertion is indistinguishable from a passing one

**Asserted:** nothing. It printed a line and moved on.
**Should have asserted:** that it ran at all.

`check-anchor` exercises the AppBar account dropdown and notification bell. Neither exists at
390px — they are desktop chrome — so when the trigger is not found the suite logs

    skip  account dropdown: trigger not found at 390

and continues. **That decision is correct.** Counting a legitimately absent element as a failure
would make the suite permanently red at half its widths, and a permanently red suite is one
everybody learns to ignore. The reasoning is sound and it should stay.

The consequence is not sound. `skip` prints a line that scrolls past in a column of `ok` lines,
adds nothing to `fails`, and a run in which **every** assertion skipped exits 0 and reports
`0 failing assertion(s)`. The suite cannot distinguish "the thing I test is correct" from "the
thing I test was not there."

And the file already knew. The comment above that line reads:

> Coverage is asserted at the end instead, so "skipped everywhere" cannot masquerade as "passed".

`exercised[name]` is incremented on the line below it and **is never read anywhere in the file**.
The floor the comment describes does not exist. So this is example 5 as well as example 8: a
sentence that was true of an intention, and stayed on the page after the intention went unbuilt.

**Why arrival checking does not cover this.** A skip happens on exactly the right page. The route
loaded, the URL matches, the content is real — the element is genuinely absent at this width, or
the artefact the assertion consumes was never generated. Every arrival check passes. There is
simply nothing being tested, and nothing anywhere says so.

**Where it is reachable today:**

| site | what goes untested when it fires |
|---|---|
| `check-anchor:190` | one AppBar popover at one width |
| `check-chrome:146` | the footer-reservation assertion at that width |
| `check-mirror:181` | the back-arrow direction on that route |
| `check-mirror:193` | **the entire bidi census** — its input is another suite's artefact |

The last is the dangerous one. It is not one assertion opting out, it is a whole section, and its
precondition is that somebody ran `npm run check:bidi` first. Miss that and `check-mirror` still
prints `0 failing assertion(s)`.

**The fix is a coverage floor, not an arrival check.** Each suite states how many assertions it
expects to actually run and fails when fewer do. The weak form is a declared constant. The strong
form — and the one that matches example 2's rule about measured numbers — is an **expected-absence
table**: write down that the chip and bell are absent at 390 and present at 1440, and let any
*unexpected* skip fail. Then the day the bell stops rendering at 1440, the suite goes red instead
of quietly dropping to half coverage.

**The rule:** *a suite must report how many assertions ran, and fail if that number is not the
number it expected.* A count of failures is only meaningful beside a count of attempts.

### 9. `tsc -p tsconfig.api.json` type-checked a build Vercel never runs

**Mechanism asserted:** "api/ compiles under the config we wrote for it."
**Outcome wanted:** "api/ compiles under the config the deployment applies."

`api/_lib/records.ts` used `Array.prototype.at(-1)` twice. `.at()` is ES2022, `tsconfig.api.json`
sets lib ES2022, and a hand-typed `tsc -p tsconfig.api.json` passed cleanly. Vercel's Node builder
does not read that file. It resolves the tsconfig at the PROJECT ROOT — lib ES2020 — and compiled
the function graph against it, so both lines were `TS2550` on every deploy.

Nothing disagreed. The local pass and the build log were both correct, about different compilers.

Two things made it survive. `tsconfig.api.json` was referenced by no npm script and no config, so
the "local pass" was a thing someone typed once, not a check. And the deployment reported SUCCESS
with the functions unbuilt, so the only visible symptom was `/api` answering
FUNCTION_INVOCATION_FAILED — which reads as the shared store being down, the exact symptom
`check:api` exists for, arrived at by a completely different road.

**Fix:** `check:api-target` compiles api/ under `tsconfig.api.vercel.json`, which *extends the
root tsconfig* rather than naming a target. Move the root and the check moves with it. It runs
inside `npm run build`, so Vercel runs it too and the deploy fails instead of shipping dead
functions. It carries three controls, because a clean compile proves nothing on its own: every
shipped api file is in the program (an empty program compiles clean), the effective target equals
the root's as tsc resolves it (pinning ES2022 here is the one edit that restores the hole), and an
API one lib-level above the root's must be rejected (a check that cannot fail is not a check).

Grepping api/ for `.at(` was the tempting fix and is example 3 again: it passes on `Object.hasOwn`,
`findLast`, `toSorted`, error `cause`, and whatever ES2025 adds next. The compiler already knows
the whole list. Ask it.

### 10. Three green checks and every Function dead at module load

**Mechanism asserted:** "the modules resolve."
**Outcome wanted:** "Node can import the Function."

Every route answered FUNCTION_INVOCATION_FAILED. The runtime log said the same thing seven
times: `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_lib/…'`. `package.json` says
`"type": "module"`, so what Vercel emits is ESM, and ESM will not guess an extension —
`'../_lib/http'` is not a path. Vercel does not bundle these files, it transpiles each one in
place and hands the result to Node's loader, so the specifier is used verbatim.

Three checks were green over it, and none of them was wrong:

- `tsc` **resolves** modules. It does not import them, and under `moduleResolution: "bundler"`
  it is explicitly resolving the way a bundler would.
- `check:api-target` **compiles**. Example 9 fixed which compiler; a compile is still not a load.
- `routes.test.ts` **imports every route and passes** — through vitest, whose resolver is Vite's,
  which fills in the extension, maps `.js` onto `.ts`, and inlines JSON. It is the bundler the
  tsconfig is named after.

That third one is the sharp bit. It really does call `import()` on all seven routes, which reads
exactly like the assertion that was missing. The verb was right and the runtime was not.

Two more failures were behind the first, and only the load found them: a Function importing
`src/dev/mojibake.ts`, a TypeScript file outside `api/` that nothing was going to compile for it,
and `import generated from '../src/i18n/lsd.json'`, which Node refuses in ESM without
`with { type: 'json' }`. Fixing only the extensions would have moved the error, not removed it.

**Fix:** `check:api-load` builds the deployment's layout — `api/**` transpiled in place, `src/**`
copied verbatim, the real `package.json` — and imports each route with Node's own loader,
requiring a callable `fetch` back. `mojibake` became plain `.mjs` with hand-written `.d.mts`
types, the shape `src/i18n/wordlistNorm.mjs` already had for the same reason.

Two details worth keeping. The model refuses to compile anything under `src/`, because whether
Vercel's TypeScript handling reaches outside `api/` is not observable from here — assuming it
does not is the only assumption that cannot fail in the direction that matters. And the staging
transpiler is `typescript`, not `esbuild`: the esbuild in `node_modules` is Vite's transitive
0.21.5, which silently drops `with { type: 'json' }`, so the model would have contradicted the
source in exactly the construct under test, on a version this repo does not pin.

**The rule:** *perform the operation that fails.* A check that resolves where production
imports, or reads where production parses, is not a weaker version of the right check — it is a
check of something else that happens to be nearby.

### 11. The attestation check that looked up the wrong word

**Asserted:** that a corpus lookup succeeded.
**Should have asserted:** that the thing looked up was a word.

The Kanz repair (`scripts/repair-kanz.ts`, `docs/kanz-digraphs.md`) may only rewrite a cell in
the wordlist when the converted form is *attested elsewhere in the same sheet*. That rule is
the entire safety design: it is what separates "corrupt" from "coincidentally doubled", and
without it the repair is a blanket find-and-replace on the owner's only copy of the corpus.

The rule was implemented correctly. The check ran. It reported `ثث → پ`, **attested 3 times**,
and applied it to 50 of the 150 occurrences it converted.

There is no such word. `پ` is a single letter.

The tokeniser's letter class was `[ؠ-ي]` plus the Urdu-extended ranges — and
**U+0652, the sukun, was in none of them.** It occurs 286 times in this column. So every word
carrying one was split in half: `اْثثنا` tokenised as `ا` + `ثثنا`, and `اْثث` — the real word,
which converts to `اْپ` — tokenised as `ا` + `ثث`. The three "attestations" for `پ` were the
tails of three `اْپ`s, cut at the same place.

**Everything downstream of the split was working perfectly.** The corpus was built correctly
from the tokens it was given. The lookups were real lookups. The counts were true counts. The
attestation rule was applied exactly as specified. The check could not have caught this,
because the check's subject — do these tokens appear in the corpus — was true. The defect was
one layer up, in what had been handed to it as a token.

**This is the family the `identity` class in `audit-lsd.mjs` belongs to: a value that looks
like absence and is not.** There, an LSD value equal to its English key looks like a missing
translation and may be a deliberate loanword. Here, a fragment looks like a word and is not.
In both, the thing under inspection is well-formed and the *category* is wrong, so every
measurement taken of it is precise and about the wrong subject.

And it failed green, as all of these do. A tokeniser that splits too eagerly produces MORE
short tokens, short tokens collide with each other more often, and collisions read as
attestations. The bug did not suppress applications — it manufactured justification for them.

**What caught it** was not a test. It was that `پ`, as a standalone dictionary word, is
implausible, and asking the same question a second way disagreed: searching for `پ` bounded by
non-letters returned 0 rows where the tokeniser reported 3. Two ways of asking must agree.

**The rule:** *when a check consults a corpus, the tokenisation of that corpus is part of the
check.* Assert the tokens, not only the lookups. A one-character attestation, a corpus whose
distinct-word count moves when an unrelated character class changes, or an answer that survives
only under one way of asking, are all the same signal. And if a combining mark, a joiner, or a
mark you did not think about can fall outside your character class, it will — write the class
from the codepoints the data actually contains, not from the ones the script is named after.

### Related: source that is load-bearing and invisible

Not an assertion failure, but the same family as the stale notice in example 5 — correct today,
undetectably fragile — and worth one line because it is cheap to avoid and impossible to review.

While adding the reload assertion above I wrote a right-to-left mark, U+200F, as a **literal
character inside a regex**. It worked. It also renders as
`replace(//g, '')` to anyone reading the diff, deleting the character changes what the program
matches and changes nothing a reader can see, and no review catches either. This codebase is
full of RLM-bearing strings, so the temptation recurs.

The general form: **if removing a character would change behaviour but not appearance, it should
not be in the source.** Write the escape (`\u200f`), or restructure so the character is not
needed — the marker here is arbitrary test text, so the fix was to stop putting an RLM in it at
all rather than to escape one.

Same shape as the specificity comment: a property of the code that is real, load-bearing, and
invisible at the point somebody would have to notice it.

**The strongest evidence that this class is real is how this entry was written.** Drafting the
paragraph above — the one warning against literal U+200F in source — I typed a literal U+200F
into it, inside the code sample demonstrating the danger, where it rendered as
`replace(//g, '')`: an empty regex, in a sentence about how an empty-looking regex is the tell.
It was caught by an assertion that no U+200F survives anywhere in the file, not by reading.

So the character is invisible to the person most alert to it, in the moment they are most alert,
in the text they are writing about it. That is not a lapse of attention that more attention
fixes. It is why the rule is "do not put it in the source" rather than "be careful with it" —
and why the fixed-delay rule two doors down is a failing test rather than a paragraph.

A note on enforcement, since the two are the same argument: `scripts/source-hygiene.test.mjs`
bans `page.waitForTimeout` outright unless the line carries a `\`// sleep: <reason>`\`
justification. Three fixed-delay false findings landed in one session, the third inside the fix
for the first, one step after writing the shared helper meant to prevent it. Documentation does
not reach a reflex; a failing build does. The escape hatch exists because some sleeps are
legitimate — a CSS transition has no completion event, and in `check-cold-load` waiting for
content would beg the question, because whether content arrives is the subject. Where the honest
justification would be "for the thing I am about to assert", writing it down is what makes the
bug obvious.

### Related: the forward reference to something not yet written

Example 5 is a sentence made false by a change somewhere else. This is the same class with the
change removed — a sentence that was **never** true of the artefact, only of the plan.

Writing example 7 I ended it with:

> See the arrival audit at the end of this file for what happened when every suite in `scripts/`
> was pointed at a build where all routes redirect to `/login`.

There was no arrival audit at the end of this file. I intended to write one, wrote the reference
first, and moved on. The sentence was true of what I was going to do and false of the document it
was in — sitting two screens below the entry describing exactly that failure, in the document
about it.

**A forward reference is the purest form of the class**, because the gap between claim and
artefact is not caused by drift, distance or time. It is there the moment the sentence is
written, and nothing anywhere fails: prose does not compile, a broken cross-reference in Markdown
renders as ordinary text, and the only reader who could catch it is one who goes looking for a
section they have no reason to doubt exists.

The audit section exists now. The general form is worth more than the fix: **do not write a
reference to something you have not written.** If it needs a placeholder, the placeholder should
say so in a way a reader cannot mistake for a citation — and if a tool can check the link, that
is better than either.

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
| the login-page pass | that the page was healthy | that the page was the one asked for |
| the silent skip | nothing, in a line that reads like output | that the assertion ran at all |
| the sukun tokeniser | that the lookup succeeded | that the token looked up was a word |

And each failed in the same direction: **silently, in the green direction, at the moment of the
change it was written to police.** None produced an error. Two produced an apparent improvement.
The fifth is the limit case: there was no assertion to fail, so the only thing that could catch it
was somebody reading the sentence and remembering what had changed underneath it. The seventh is
the other limit case: twenty-four assertions fired, all of them true, none of them about the
subject — a probe can be entirely correct and still tell you nothing.

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

And for anything that navigates, a third: **if this probe were served a completely different page,
would any assertion in it fail?** If no, it is not testing the route named in its own output.

And for anything that can decline to run, a fourth: **if every assertion in this suite skipped,
what would it print?** If the answer is `0 failing assertion(s)`, the suite has no floor.

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

---

# The arrival audit

Run 2026-08-10. Every browser suite in `scripts/` was pointed at a build with the auth gate
forced shut — `RequireAuth` returns `<Navigate to="/login" replace>` for every route — in an
isolated git worktree pinned at `2901258`. **A suite that passed could not tell it never
arrived.**

The control was `check-cold-load`, which had just been given arrival assertions for a different
reason. It failed all 24 combinations on both of them. Without a control that goes red, a table
of green results proves only that the probe build was wrong.

## The rule the table is evidence for

> **A positive assertion proves arrival for free. A negative assertion never does.**

"The account dropdown opens and its panel is inline-start aligned" cannot pass on a page with no
account dropdown. "No text node mixes scripts without isolation" is *most* true of a page with no
text on it.

That is the whole split below. It is not by author, age or care — every suite that noticed asserts
that something specific EXISTS, and every suite that did not asserts that something bad is ABSENT
and gets its answer for free from an empty page.

**Which means you can classify a suite before running it.** Read your own assertions and ask what
each one does on a blank page. If they are all negatives, arrival is a precondition none of them
check, and the suite needs `scripts/arrival.mjs` whatever else it does. The table is how this was
found; the rule is how the next one is predicted.

## The result

| suite | verdict | why |
|---|---|---|
| `check-anchor` | noticed | positive assertions — a named trigger must exist and be clickable |
| `check-chrome` | noticed | same |
| `check-cold-load` | noticed | **control**; URL + distinctness, added in the fix that started this |
| `check-deeplink` | noticed | the only suite that already asserted `location.pathname` |
| `check-devdock` | noticed | positive assertions |
| `check-mirror` | noticed | positive — "no 7-column weekday row found" is a failure, not a skip |
| `check-remarks` | noticed | positive assertions |
| `check-review-tools` | noticed | positive assertions |
| `check-tour` | noticed | 18 failures, and 1716s against 563s on the real app |
| `check-bidi` | **hole** | *and* it never terminated — see below |
| `check-centred` | **hole** | `off.length ? 1 : 0` |
| `check-dictionary` | **hole** | 13/13 green; asserted through module imports, never the DOM |
| `check-font-fallback` | **hole** | walked `document.body` and measured the login page's Arabic |
| `check-layout` | **hole** | `failures.length === 0 ? 0 : 1` — and the suite others deferred to |
| `check-lsd-clip` | **hole** | `clips.length ? 1 : 0` |
| `check-numerals` | **hole** | `mixed.length ? 1 : 0` |
| `check-overlap` | **hole** | every assertion a negative |

**Nine noticed, eight holes.**

## Two shapes the rule does not cover

Two of the holes were not sweeps at all. `check-dictionary` asserted `i18n.resolve(key)` — what
the module would return, never what the page showed — so the route was irrelevant to it.
`check-font-fallback` did measure rendered text, and measured whatever page it happened to be on.

Three of the sweeps had a `catch` that swallowed render failures, two of them deferring
explicitly to `check-layout`, which had the same hole. **A hand-off to a suite that cannot
receive it is a swallow with a citation.**

## What each suite needed

| need | suites | state |
|---|---|---|
| arrival assertions | `numerals`, `lsd-clip`, `overlap`, `layout`, `centred`, `dictionary` | **done** — all use `scripts/arrival.mjs` |
| arrival assertions | `font-fallback`, `bidi` | **outstanding** |
| a distinct-site floor | `centred` | **done** — 11 declared sites, 8 reached, 3 declared unreachable |
| a hard failure on a missing artefact | `mirror` (bidi census) | **done** |
| a skip floor | `anchor`, `chrome`, `mirror` (back arrow) | **outstanding** — `scripts/coverage-floor.mjs` exists, not yet wired |
| nothing | `deeplink`, `cold-load`, `devdock`, `remarks`, `review-tools`, `tour` | sound as written |

## Three things the audit found by opening gates

**`check-bidi` never terminated.** It completed its measurement in 86 seconds and then held the
process open forever: vite is spawned with `shell: true`, so `proc.kill()` killed the shell and
orphaned the server, whose piped stdout kept the event loop alive. `freePort()` was written to
work around the orphan without naming it as the cause. Anything running the suite under a timeout
reported a timeout *after the work was done*; anyone running it by hand gave up at a blank prompt.
It had been the unrun suite for several sessions.

**The census it gates was therefore never run, and it fails.** Of 26 findings, 24 are an
untranslated key beside a converted numeral and clear when those rows land. Two carry a Latin word
INSIDE the LSD value, where no row landing can reach them. The claim attached to those findings had
been "they are all an untranslated key beside a converted numeral" — false, and unfalsifiable while
the gate was shut. `artifacts/` is gitignored, so on a fresh clone the census had *never* run.

**A site the probe matched and then dropped.** `check-centred` filtered out-of-flow children and
required exactly one in-flow child, so the Review screen's avatar — one absolutely-positioned span,
centred by the physical `left-1/2 -translate-x-1/2` idiom, the only remaining one in the app — hit
`continue` and vanished from a suite counting it as covered. Measured once the filter reported
instead of skipping: **0 off-centre at 10/10 cells. Not wrong, unseen.**

## Three defects in the audit itself

Recorded because they are the same failures this document is about, committed by someone holding
the document open.

**`MIN_CHARS = 400`** was reasoned off the login page being 137 characters. Run against a real
build it failed 48 of 250 visits, every one a correct page — five real routes render under 400
characters. That is example 2 exactly: a round number that makes the case in front of you pass.
Worse, a floor failure also skipped the route, so it cost `check-centred` both `/login` centring
sites. Now 40, measured off the smallest real route (87) and a blank mount (0).

**A missing `VITE_REVIEW_TOOLS`** made the panel's override path look completely broken.
`applySharedOverrides` returns on its first line without the flag. The probe was measuring its own
harness and reporting it as a finding about the app.

**A fixed delay inside the fix for the fixed-delay problem.** The assertion added to prove live
editing works used `waitForTimeout(1200)` and failed under load while the behaviour was correct —
written one step after the shared `waitForApp` helper, by the author of that helper. This is why
`source-hygiene.test.mjs` now bans `waitForTimeout` outright rather than discouraging it.

## Known and deliberately not chased

`api/_lib/api.test.ts` fails intermittently under load — a different subset each run, always a
5000ms timeout, and its sibling tests legitimately take 2.8s and 6.2s against that default. It
reproduces on an unmodified tree and three sessions have now hit it independently, so it is real
and it is not any one session's. Recorded rather than fixed: chasing an order-dependent timeout
in the middle of a user-facing defect costs more than it returns, and an undiagnosed flake that
everyone knows about is cheaper than a wrong fix nobody revisits. The thing to resist is treating
a red run as noise WITHOUT checking it is this one.

Two suites still do not prove arrival — `check-font-fallback` and `check-bidi` — and three still
have unfloored skips — `check-anchor`, `check-chrome`, `check-mirror`'s back arrow. All five carry
a `KNOWN GAP` block in their own header naming the fix, because the person who needs it is
whoever next edits that file, not whoever next reads this one.
