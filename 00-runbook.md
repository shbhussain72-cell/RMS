# RMS Miqaat Registration — remediation runbook

Five Claude Code sessions. Serial where marked; P0 and P4 can run in a separate worktree.

| Session | File | Branch | Depends on | Nature |
|---|---|---|---|---|
| P0 | `p0-instrumentation.md` | `chore/audit-tooling` | — | Measurement. No behaviour change. |
| P1 | `p1-bidi-and-dates.md` | `fix/bidi-isolation` | P0 | Primitives + global text policy. |
| P2 | `p2-dictionary-and-wiring.md` | `fix/lsd-wiring` | P1 | Data source → regenerate → wiring. |
| P3 | `p3-layout-rtl-and-responsive.md` | `fix/rtl-layout` | P1 | CSS/geometry only. |
| P4 | `p4-remarks-feature.md` | `feat/remarks` | — | Greenfield feature. |

P2 and P3 both touch screen files. Land P2 first, or keep them in separate worktrees and expect a merge pass.

## Decisions to make before you paste

Each is marked `[DECIDE]` inside the prompt. Fill them in or the agent will guess.

1. **Loanword policy (P2)** — transliterate the 264 Latin-embedded values into Arabic script, or keep Latin and always wrap in `<Iso>`. Linguistic/house-style call, not the agent's.
2. **Excel access (P2)** — is `RMS_Mumineen_LSD_wordlist_v4.xlsx` in the repo and is `npm run build:lsd` runnable by the agent? If not, the agent emits a patch spec for the wordlist owner instead of editing.
3. **Login-path empties (P2)** — Password / Remember Me / both placeholders have no LSD value. Ship English fallback, or block LSD login until the wordlist owner delivers?
4. **Hijri source (P1)** — is there an existing Hijri conversion utility in the repo, or does the agent add one? Fatimid/Misri calendar, not the tabular Umm al-Qura default.
5. **P4 scope** — your source text truncated mid-5a. I inferred 5b onward (persistence, export, activation, selector strategy). Read that section before running.

## Assumptions I made

- Node + npm, Playwright installable, app runs on a local dev server.
- No test suite exists; P0 creates the verification harness the other four depend on.
- `docs/` and `scripts/` are writable and not generated.
- You own the wordlist file; the agent never invents LSD translations.
