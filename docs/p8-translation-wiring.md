# P8 — translation wiring and bidi residue

Branch `fix/popovers-chrome`. Commits `e4a3ef9` … `7cd4de3`.

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

268 distinct English strings on screen in LSD, down to 155. Both columns are measured by
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

`artifacts/audit/wordlist-patch.xlsx` — **157 rows, every LSD cell empty.** Verified: zero rows
carry a non-empty LSD value. (`artifacts/` is gitignored, so the file is on disk, not in the
commit.)

Regenerate with `node scripts/emit-blank-rows.mjs`. The list is the union of two sources because
neither is sufficient: the route walk sees what actually painted but not what sits behind a modal
or an error state; the build gate reads source and sees those, but cannot know what renders.

**Three groups in it are not translation work** and should be deleted before pasting. They are
listed rather than silently filtered, because a filter that guesses wrong hides a real gap:

| count | what | why it is not a row |
|---:|---|---|
| 23 | date-shaped strings (`03 Jul 2026`, `Mon, 13 Jul · 11:59 PM`) | a formatter case; see the open items |
| 12 | avatar initials (`AB`, `MH`) and the `EN`/`LSD` switcher | not language |
| 1 | `4.0 MB` | digits plus an SI unit |

**121 rows are genuine copy.**

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

## Open items

**1. The `check:lsd` baseline — needs your decision, and no build can pass until it is made.**
Outstanding is 195 against a baseline of 170; 28 of the new entries are `NO_ROW` and 1 is
`INDIRECT`. The `INDIRECT` one is `RoleBadge`'s label, which is genuinely wired — the gate simply
cannot see through the variable. Either apply the patch and run `build:lsd`, or re-baseline. I
have not re-baselined.

**2. 23 date strings still reach the DOM raw.** `dateLabel` now goes through `DateLine`; these
come from deadline and calendar labels that do not. Routing them is a formatter change, not a
wiring one, and it is the remainder of the "every date through the formatters" objective.

**3. Two things I could not verify and am not claiming.** Wiring the weekday headers through
`tx()` appends a gap-marker `<sup>`, so those spans stopped being leaf text nodes and the probe
can no longer see them — **the desktop ordering at 1440 is unconfirmed**. And the breadcrumb
chevron flip uses two paths rather than a transform (deliberately: a transform would give each
16px box its own stacking context, the documented `/success` mechanism), so the old
`transform !== 'none'` test is now always 0 *by design* and proves nothing.

**4. The screenshot harness has not been run.** `npm run shoot` calls `npm run build`, which
fails at `check:lsd`. It unblocks with item 1.

**5. The static sweep still reports 202 unrouted literals** outside the route walk's reach
(modals, error states, capacity pills). 35 of the 237 raw hits are CSS values the sweep's
machinery filter does not catch. That set is P9's, not this session's.
