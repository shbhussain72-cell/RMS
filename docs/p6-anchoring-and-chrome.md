# P6 — anchoring and chrome

Branch `fix/popovers-chrome`. Session opened on 2026-08-09, immediately after P8's follow-ups.

> **Status: opened, not started.** The session baseline below is captured and the two carry-in
> items are recorded. The numbered sections are not — the brief (`p6-anchoring-and-chrome.md`)
> has never existed in this repo, and §4.8 is referenced by name in the instruction that opened
> the session, so guessing at its contents would produce the wrong work. Everything below is
> what could be established without it.

## Session baseline — `check-layout`

Captured on a clean tree at `701013a`, after `npm run build`, so `dist/` matches source. (A
measurement taken against a stale `dist/` is the inherited methodological error in this repo:
it reports the layout of whatever was last built, not of what is being judged.)

    node scripts/check-layout.mjs        # 200 route visits — 25 routes x 2 languages x 4 widths

| | raw | distinct route+element |
|---|---:|---:|
| **total** | **136** | **63** |
| OVERLAY | 78 | 45 | 
| OVERLAP | 29 | 10 |
| CLIPPED | 21 | 4 |
| TALL-ROW | 4 | 1 |
| OCCLUDED | 4 | 3 |
| PAGE-OVERFLOW | 0 | 0 |
| RTL-SCROLL | 0 | 0 |

**58 failing, 78 log-only.** OVERLAY is the log-only class; the other five gate.

### The exit code is not the signal

`check-layout` exits 1 on a clean tree, because the backlog above predates this session. Judge
by **delta against 136 / 58**, not by exit status. A run that ends 1 having removed findings is
a good run; a run that ends 1 having added one is not, and the exit code cannot tell them apart.

For scale, `docs/layout-baseline-pre-askhelp.md` holds the pre-anchoring picture: OCCLUDED was
**124 raw / 73 distinct** there and is **4 / 3** now. The class P6 exists to address is nearly
closed already; what remains is concentrated in OVERLAY and OVERLAP.

## Carried in

### 1. The 32 revealed findings → §4.8

The leading change did not create these; it made them measurable. They are §4.8's charter, and
the sticky-footer measurement lands there **once** — not repeated per finding.

*The list of 32 is not in this repo and is not reconstructible from the current report: the
136 findings above are the post-change state, and nothing here records which of them the change
revealed. It needs to come in with the brief.*

### 2. Verification budget

| when | what |
|---|---|
| after each numbered section | assertion suites only |
| mid-session screenshots | mechanical sweeps only, **LSD at 390 and 1440** |
| end of session | full harness, once |

## What P6's headline deliverables look like today

Checked because the runbook line for P6 reads "one anchoring primitive, one dev toolbar, one
AppBar", and three of the four appear to have landed already in earlier work:

| | state |
|---|---|
| Anchoring primitive | `src/components/Popover.tsx` exists; `npm run check:anchor` 0 failing at 390 and 1440, both languages |
| Dev toolbar | `src/dev/DevDock.tsx` + `DictionaryPanel`; `check:devdock` 0 failing; dev-only dist grep 13/13 |
| AppBar | single `src/components/figma/AppBar.tsx`; `check:chrome` 0 failing |
| StatusBar deleted | yes — only surviving mention is the note in `PhoneScreen.tsx` recording that it went |

So the remaining P6 work is the §4 items, which is exactly the part that needs the brief.
