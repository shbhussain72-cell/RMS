# P8 — translation wiring and bidi residue

Branch `fix/popovers-chrome`. Commits `e4a3ef9` … `8ada5da`.

Written in two passes. Everything down to "Verification" is the state at the end of the first;
**"Follow-up pass" below carries the final numbers** and supersedes the C column and the patch
contents here. The A column is unchanged: it was 0 then and it is 0 now.

## The headline

**Class A is 0 on all 25 routes.** It was 66.

A is the class this session owned: the wordlist already holds a translation and English
renders anyway. It is a developer defect by definition — nothing in the spreadsheet can fix it.

| route | A | B1 | B2 | C | sen |
|---|---|---|---|---|---|
| `/join-group` | 3 → 0 | 0 | 2 | 15 → 10 | 0 |
| `/login` | 1 → 0 | 2 | 2 → 1 | 3 → 2 | 0 |
| `/miqaats` | 7 → 0 | 0 | 1 | 41 → 33 | 0 |
| `/miqaats/ashara-1448` | 12 → 0 | 0 | 3 → 4 | 10 → 6 | 5 |
| `…/araz` | 5 → 0 | 0 | 2 | 31 → 20 | 0 |
| `…/arrange` | 3 → 0 | 0 | 2 | 16 → 10 | 0 |
| `…/city` | 7 → 0 | 0 | 2 | 49 → 43 | 0 |
| `…/city-allocation` | 2 → 0 | 0 | 2 | 7 → 6 | 0 |
| `…/edit-form` | 1 → 0 | 0 | 2 | 8 → 6 | 0 |
| `…/invite` | 1 → 0 | 0 | 2 | 6 → 5 | 0 |
| `…/manage` | 1 → 0 | 0 | 2 | 6 → 4 | 0 |
| `…/manage/host` | 9 → 0 | 0 | 2 | 23 → 17 | 0 |
| `…/manage/relay` | 14 → 0 | 0 | 2 | 50 → 42 | 0 |
| `…/people` | 2 → 0 | 0 | 4 → 3 | 21 → 12 | 0 |
| `…/preferred-city` | 1 → 0 | 0 | 4 → 3 | 10 → 6 | 0 |
| `…/questionnaire` | 1 → 0 | 0 | 4 → 3 | 10 → 6 | 0 |
| `…/raza` | 6 → 0 | 0 | 2 | 19 → 10 | 0 |
| `…/raza-letter` | 0 | 0 | 2 | 3 | 0 |
| `…/review` | 2 → 0 | 0 | 2 | 18 → 13 | 0 |
| `…/roster` | 6 → 0 | 0 | 3 | 16 → 11 | 0 |
| `…/success` | 1 → 0 | 0 | 1 → 0 | 1 | 0 |
| `…/timeline` | 4 → 0 | 0 | 2 | 5 → 4 | 0 |
| `…/zone` | 5 → 0 | 0 | 2 | 20 → 10 | 0 |
| `…/zone-allocation` | 6 → 0 | 0 | 2 | 18 → 8 | 0 |
| `/notifications` | 19 → 0 | 0 | 3 → 4 | 19 → 15 | 0 |
| **distinct across the app** | **66 → 0** | 2 | 6 → 7 | 189 → 141 | 5 |

(C reached 104 after the follow-up pass; the 141 here predates the `notLanguage` marker.)

268 distinct English strings on screen in LSD, down to 155 — and to 118 after the follow-up. Both columns are measured by
`scripts/scan-routes.mjs` at 390 and 1440 and unioned per route — two widths because ~87 blocks
in this app are gated behind `sm:hidden` / `hidden sm:flex`, so a one-width walk cannot see half
the UI.

C fell by 48 without a single wordlist row being added. That is not translation progress: those
strings stopped being *rendered as separate literals* because the sentences that contained them
were consolidated into single keys. One row now covers what used to be four.

## Three corrections to the probe, before any of the above means anything

Each of these made class A read high for a reason that had nothing to do with wiring. They are
reported separately because they change what the number measures, and the before-column above is
taken with all three already applied.

**1. Loanwords inside translated values.** The scanner reads text nodes. `isolateRuns()` splits a
mixed value like `‏Register كرنار` into per-run `<bdi>` elements, so the Latin half becomes a text
node with no Arabic in it — and got reported as untranslated English. Those runs are the loanword
policy working. `isolateRuns` now marks what it emits and the scanner skips it. Not a blanket
`<bdi>` exemption: a hand-authored `<bdi>` around genuine untranslated copy still counts.

**2. Interpolated keys.** `Close in 00:42:11` is what the DOM says; `Close in {time}` is the row
that can exist. The scanner looked up the former and filed a class-C gap against a string that
changes every second. `tx` now records the key when interpolation made the text differ from it,
and the scanner classifies by that.

**3. Case-sensitive identity.** The lookup is case-insensitive; the identity test was not. The
wordlist stores the agreed loanwords lower-cased (`Registration` → `registration`, `ITS ID` →
`ITS id`), so both came back as class A on nine routes — a defect no wiring could clear, because
the row was doing exactly what `loanword-policy.json` asks.

## What the wiring actually was

Mostly not a missing `t()` call. It was sentences assembled in code:

```js
isolateRuns(`${tdText(relation)} · ${tdText(gender)} · ${t('Age')} ${age} · ${t('ITS')} ${its}`)
```

Four lookups glued in an order the template literal has already chosen. A translator can change
what `Age` says; they cannot move the number, drop the separator, or lead with the relation — and
the sentence they would need to edit does not exist in the dictionary, only its crumbs do. That
exact line was hand-built in **sixteen** places. It is now `src/components/MemberMeta.tsx`: one
module, four keys, one per shape the parts take.

The same fault in other clothes, all replaced with parameterised keys:

- `` `${endsStage} ends in ${endsDate}` `` — a sentence split across two lookups whose agreement
  nobody can check. Three explicit keys instead.
- `` `Members ${done}/${total}` `` as a step label, which `StepIndicator` then took *apart* again
  with a regex — so the count animation worked only while the digits stayed last, an assumption
  about English word order. `count` is now its own field on `Step`.
- `` `${n} min ago` `` baked into the notification fixtures. Split into `{n, unit}`.
- `label.replace('registered together', t('reserve together'))` on six screens: translates one
  clause, leaves the rest English, and never finds the complete row already in the wordlist.
- `` `${d}d ${h}h left` `` — the one call site `formatDuration` was added for.
- `` `${who} selected in ${cityName}.` ``, `` `Swap all to ${city}` ``, `` `${verb} to ${city}` ``,
  `` `All ${city} zones` ``, `` `${city} zones (${n})` ``.

**Two real bugs surfaced on the way.** `JoinGroup` compared a data tag against `t('Registrant')`,
so in LSD it never matched and every registrant wore the dependent's amber pill. And
`LocationRow` held city and zone names back from the dictionary on the theory that data lookups
flood the coverage report — what it actually did was render `Colombo` in English on four screens
while its authored LSD value sat unused in the spreadsheet.

## The blank-row Excel patch

`artifacts/audit/wordlist-patch.xlsx` — **157 rows at this point, every LSD cell empty**; 104 after
the follow-up pass removed what is not language. Verified both times: zero rows carry a non-empty
LSD value. (`artifacts/` is gitignored, so the file is on disk, not in the
commit.)

Regenerate with `node scripts/emit-blank-rows.mjs`. The list is the union of two sources because
neither is sufficient: the route walk sees what actually painted but not what sits behind a modal
or an error state; the build gate reads source and sees those, but cannot know what renders.

**Three groups in it are not translation work.** Listed rather than silently filtered, because a
filter that guesses wrong hides a real gap — and in the follow-up pass they were reclassified at
the source instead of deleted, so they no longer reach the patch at all:

| count | what | why it is not a row |
|---:|---|---|
| 23 | date-shaped strings (`03 Jul 2026`, `Mon, 13 Jul · 11:59 PM`) | a formatter case — item 4 below |
| 12 | avatar initials (`AB`, `MH`) and the `EN`/`LSD` switcher | not language |
| 1 | `4.0 MB` | digits plus an SI unit |

**121 rows are genuine copy** (104 once the other three groups stopped being reported).

### Why the patch is generated in the vite plugin, not the React component

Because importing `xlsx` into a dev-only component is the same shape of leak that once put
Remarks into a production bundle: a single live reference defeats tree-shaking, and ~400 kB of
spreadsheet library is not worth betting on `import.meta.env.DEV` folding correctly through a
transitive import. The plugin runs server-side under `vite dev` only, so the dependency cannot
reach a bundle at all — it is not a matter of the bundler being clever enough.

It also puts the rails where they can be enforced against the filesystem rather than against
component state: the handler reads the wordlist to look up each row's existing Page value, refuses
to emit a blank row over a key that already exists, and aborts if the workbook would carry more
rows than were staged. `scripts/emit-blank-rows.mjs` drives that endpoint rather than building a
workbook of its own — two implementations of "what shape is a patch row" is one too many, and the
editor's own Export button uses the same path.

## Verification

| check | result |
|---|---|
| `tsc -b` | clean |
| `vitest run` | 77 passed (7 files) — includes `centring.test.mjs`, `source-hygiene.test.mjs`, the `1 members` regression |
| `npx vite build` | clean |
| `check-dev-only` (dist grep) | all 13 forbidden strings absent; 7 bundle files scanned |
| `check-layout` | 134 findings, 58 failing (pre-session 133/61, post-P6 138/59 — stable) |
| `check-centred` | off-centre by >1.5px: **0**; nowrap exemptions actually clipped: **0** |
| `check-numerals` | nodes mixing both numeral systems: **0** |
| `check-bidi` | 24 unisolated runs — see below |
| `check-anchor` / `check-chrome` / `check-devdock` / `check-dictionary` | 0 failing |
| `check-remarks` | 56/56 |
| `npm run build` | **fails at `check:lsd`** — see open items |

Sentinel rows: the five `اهم هدايات` instructions still render their English fallback and are
reported as their own state (`sentinel = 5` on `/miqaats/ashara-1448`), neither translated nor
counted as a gap.

### The 24 remaining bidi findings

All 24 are the same shape: an **untranslated key carrying a numeral**, e.g. `٣ Members`,
`Continue (٣)`, `١١ spots left`. The English fallback renders beside an Arabic-Indic digit, and
`splitBidiRuns` deliberately keeps a neutral digit in the same run as the text beside it, so the
node cannot be split. **Latin + Arabic-*letter* mixes are 0.** These clear when the wordlist rows
land, not by a code change.

Two genuine interpolation gaps were closed to get there: a missed key now still runs through
`isolateRuns` when variables were filled (`Request {city}` had no row while `Colombo` did, giving
`Request ‏كولمبو` in one unisolated node), and ten call sites used `t()` where the result is
rendered as a JSX child — `t` returns a bare string, and only the `tx` spread can isolate it.

## Follow-up pass — the six items

All six landed. `npm run build` passes end to end for the first time this session.

### 1. Baseline

Re-baselined to **198**, not the 195 quoted — three more arrived from work done after that
number was reported. Composition of the 32 new since the old baseline of 170:

| count | what | expected to |
|---:|---|---|
| 12 | parameterised keys this session introduced (`Confirm ({n})`, `Close in {time}`, `Swap all to {city}`, `This window closed on {date}…`) | fall as rows land — they exist because a sentence stopped being assembled in code |
| 18 | ordinary NO_ROW strings the wiring made visible for the first time | fall as rows land |
| 2 | INDIRECT — `RoleBadge`'s label, `MiqaatDetail`'s CTA. Both genuinely wired; the gate cannot see through a variable and says so rather than guessing | stay |

Counted, not estimated at 25.

### 2. The patch

Left in place at `artifacts/audit/wordlist-patch.xlsx` for the dictionary editor. Not pasted.

**It was destroyed mid-session and regenerated** — see item 7 below.

### 3. What is not language

`src/components/NotLanguage.tsx`. Marks the SITE, not a list of literals: a list would suppress
`MH` everywhere including a real untranslated one, would need editing whenever a fixture gains a
name, and says nothing at the call site about why the string is exempt. `rg notLanguage` lists
every exemption in the app with its context.

31 sites: 30 avatar-initial renders and the EN/LSD switcher — the one control that must NOT
follow the current language, because `EN` in LSD script is a door with no handle. Plus
`formatGregorian` and `DeadlineLine`'s compact branch, which is the same thing the date policy
already says: a civil reference that stays `26 Jun 2026` in both languages so it matches the
passport.

### 4. Dates

Of the 23 date rows, 19 were `DateLine` working correctly and being reported anyway — the marker
above removes them. Four were real: the miqaat list sliced `deadlineLabel` with a regex and handed
the result to the DOM, the last place in the app where a date reached the screen without passing a
formatter. In LSD it read as one Latin blob in an RTL paragraph, weekday untranslated, clock in
ASCII digits, run unisolated. `DeadlineLine` composes the three parts.

**0 date strings remain in the patch.** It went 157 rows → 104, all copy.

### 5. The three probes — `scripts/check-mirror.mjs`, `npm run check:mirror`

A test that passes by construction is worse than no test, because it reads as evidence. All three
were in that state.

| probe | was | now |
|---|---|---|
| weekday order | matched leaf text nodes; the `<sup>` gap marker made the span a non-leaf and it went **quiet**, not red | selector-driven on `grid-cols-7` + `textContent`. **Runs start→end at 390 AND 1440** — the claim P8 could not make |
| breadcrumb flip | `transform !== 'none'`, which the two-path fix made 0 forever | loads both languages and compares which path is painted: same count, different `d` in RTL, and that `d` is the mirrored twin |
| bidi census | "they clear when rows land" was believed | every finding printed and classified. **24/24 are Latin + Arabic-INDIC-DIGIT**; a Latin + Arabic-LETTER finding fails |

0 failing assertions.

### 6. `=== t(...)` — a bug class

Four comparisons found. **One is safe**: `CitySelection` compares a header against `t('Zone')` and
builds the header array with `t()`, so both sides are translated. Fragile, not wrong.

**Three are the bug**, all in `MiqaatDetail`. `primaryLabel`/`actionLabel` hold English keys — the
sibling lines spread them through `tx()` — and were compared against `t('Modify Reservation')` and
`t('Register Now')`. An English key never equals an LSD value, so in LSD:

- the Modify-Reservation button silently took the wrong branch, giving that CTA the wrong chrome;
- `data-tour="register-button"` was never set, so **the walkthrough lost its anchor** on both the
  hero and the desktop sidebar.

Neither throws. Neither shows in English. Both are invisible unless you run the tour in LSD.

### 7. The screenshot harness — and what it broke

250 shots: 25 routes × 5 widths (390/768/1024/1150/1440) × 2 languages, in
`artifacts/audit/en` and `artifacts/audit/lsd`.

`shoot.mjs` began with `rmSync(artifacts/audit)`. Taking screenshots therefore **deleted every
other artifact in that folder** — the layout, bidi, numerals and route-scan reports, and the
blank-row patch. It took mine out, along with the `shoot.txt` the run was writing its own log to:
the shell created the file, `rmSync` unlinked it, and the redirect kept writing to a dead inode.
The run reported success. Nothing in the output says the deliverable is gone.

Now clears only the per-language directories it owns. Everything destroyed has been regenerated
and re-verified: the patch is 104 rows with 0 non-empty LSD cells, byte-for-byte the same
contents it had before.

## Final numbers

| | A | B1 | B2 | C | sentinel | total |
|---|---|---|---|---|---|---|
| before | **66** | 2 | 6 | 189 | 5 | 268 |
| after | **0** | 2 | 7 | 104 | 5 | 118 |

## Verification

| check | result |
|---|---|
| `npm run build` | **passes** — build:lsd, check:lsd, tsc, vite build, dev-only dist grep |
| `vitest run` | 77 passed |
| `check-mirror` | 0 failing (13 assertions) |
| `check-layout` | 136 findings, 58 failing (pre-session 133/61) |
| `check-centred` | off-centre >1.5px: 0; nowrap exemptions clipped: 0 |
| `check-numerals` | nodes mixing both numeral systems: 0 |
| `check-bidi` | 24, all confirmed untranslated-key-plus-numeral |
| `check-anchor` / `check-chrome` / `check-devdock` / `check-dictionary` | 0 failing |
| `check-remarks` | 56/56 |
| screenshots | 250 written, both languages, five widths |

## Still open

- **104 rows await translation** in `artifacts/audit/wordlist-patch.xlsx`, plus 2 B1 blanks
  already in the wordlist. That is the whole remaining queue.
- **The static sweep reports ~200 unrouted literals** behind states a route walk cannot reach —
  modals, error states, capacity pills. P9's, not this session's.
- **`routes-before.json` is gone**, destroyed by the shoot run. The before-column above survives
  because it is written down here; the per-string JSON detail does not.
