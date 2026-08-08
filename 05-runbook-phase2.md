# RMS Miqaat Registration — phase 2 runbook (P5–P9)

Repo: `C:/Users/Dell/Downloads/Miqaat-registration-v2` · dev server `http://localhost:3000`

| Session | File | Branch | Depends on | Nature |
|---|---|---|---|---|
| P5 | `p5-typography.md` | `fix/lsd-typography` | — | Font pipeline + optical scale. Self-contained. |
| P6 | `p6-anchoring-and-chrome.md` | `fix/popovers-chrome` | — | One anchoring primitive, one dev toolbar, one AppBar. |
| P7 | `p7-dictionary-editor.md` | `feat/dictionary-editor` | P6 (toolbar) | Master + page dictionary, live edit, Excel patch export. |
| P8 | `p8-translation-wiring.md` | `fix/lsd-wiring-2` | P7 | §5 wiring + §4 bidi residue. |
| P9 | `p9-functional-resilience.md` | `fix/flow-resilience` | — | Error boundaries, deep links, timers. |

P5 and P9 are independent — run either in a parallel worktree. P6 → P7 → P8 is serial.

## Why P7 moved ahead of P8

You own the LSD wordlist. Under the old plan the agent wires strings, files gaps in a
markdown report, and you translate them out-of-band and wait for a regeneration cycle.
With the editor built first, P8's wiring surfaces gaps directly in the page dictionary
and you fill them in context, in the running app, with the element highlighted.

## Settled constraints — carried into every prompt

1. **The agent never authors Lisan al-Dawat.** It wires strings, adds English fallbacks
   and reports gaps. You author LSD through the editor. This survives the fact that you
   own the wordlist — an agent guessing at Dawat register in registration copy is the one
   failure mode with no reviewer downstream.
2. **The Excel wordlist stays source of truth.** `src/i18n/lsd.json` is generated and never
   hand-edited. The editor writes a staged override file and exports an Excel patch.
3. **Coverage target: A = 0, C = 0, B enumerated and shrinking.** B is not zero-able —
   loanword identity values (`zone`, `registration`, `reservation`, `reserve`, `register`)
   are the *correct* end state under the P2 loanword policy, class B2.
4. **Canonical widths: 390 / 768 / 1024 / 1150 / 1440.** Both languages. Every assertion
   suite and the screenshot harness use this set.
5. **§4 items are verify-before-fix.** P1 and P3 already fixed several. Confirm each
   reproduces on current `main` before touching it, and report which were already correct.
6. **StatusBar is deleted** (P6), not fixed. Its P3 exemption retires with it.
7. **Mojibake is never corrected in code.** Doubled consonants ث/س/ط/ض/ص/ظ get flagged
   with their page number for re-keying.

## Decisions taken from your answers

| Question | Answer | Effect |
|---|---|---|
| §4 stale or regressed? | Correct, but some words still on the wrong side | Verify-before-fix; residue is real |
| Font licensing | Allowed, personal | P5 takes the self-hosting path |
| Widths | 390/768/1024/1150/1440 | Canonical everywhere |
| Which gap list | Your §5 list is authoritative; merge anything from `docs/lsd-gaps.md` it misses | P8 reconciles, nothing dropped |
| StatusBar | Remove | P6 deletes it |
| Editor environment | Local dev server | Real write-back + HMR, not browser-storage-only |

## Open assumptions

- The Kanz al-Lulu file you can supply is a webfont-convertible format (otf/ttf).
- Nobody else is holding these branches open.
- `lsdWordlistWatcher` can be extended with a dev-only write endpoint.
