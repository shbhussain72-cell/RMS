# P7 amendment — the dictionary editor must run on the deployed build too

**Not a plan. This is the brief's own amendment, recorded here so it survives to the session
that needs it.** It was issued alongside the review-tools work and changes P7's persistence
design, so it has to be read before planning, not after.

## Two environments, one UI

| | persistence | how edits reach the running app |
|---|---|---|
| local dev server | write endpoint → `src/i18n/wordlist-overrides.json` | `lsdWordlistWatcher` HMR |
| deployed (Vercel) | `localStorage`, versioned key | same merge into `resolve()` |

One persistence adapter, two implementations behind the same interface, chosen at runtime by
whether the write endpoint is reachable. **Do not fork the UI** — the editor must look and
behave identically in both, or nobody can tell which one they are using.

## The data-loss risk

On the deployed build an edit lives in one browser until exported, and it cannot reach the
xlsx by any other route. Thirty translations plus a cleared cache is thirty translations gone.

- Unexported override count in the tab badge, **persistently** — not on hover.
- `beforeunload` warning while unexported overrides exist.
- A permanent line naming the active environment — "editing locally, saved to disk" vs
  "editing in this browser, export to keep". Not a dismissible toast.
- Export stays the Excel patch format: key, page, old value, new value, class, timestamp.

## Gating

Same `VITE_REVIEW_TOOLS` flag as Remarks — the editor is a tab in the same toolbar and shares
its visibility. **Already in place**: `src/reviewTools.ts` exists and `check-dev-only.mjs`
asserts both flag states.

`DictionaryPanel` is deliberately still on `import.meta.env.DEV`, because it writes through a
dev-server endpoint that does not exist on Vercel. Moving it onto the flag is P7's job, and it
means moving these four strings from that script's always-forbidden list to its `REVIEW_ONLY`
list at the same time:

    wordlist-overrides   __lsdOverrides   __lsd/patch   detectMojibake

Flipping the gate without moving them will fail the build, which is the intended order.

## The build gate stands, with a narrower scope

The build still fails if `src/i18n/wordlist-overrides.json` is non-empty. That covers the
file-based path only. It cannot see browser-stored overrides and **must not try** — the fix
for that gap is not to ship override data into the bundle.

## Still true

Never author Lisan al-Dawat. Never write `lsd.json`. Never correct mojibake — report with the
page number. Reject legacy-font paste at the input, in both environments.
