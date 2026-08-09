# Preview verification — the things a local harness cannot prove

`vercel dev` is assumed unavailable, so the whole server surface is tested against an
in-memory store: 19 assertions drive the real handlers with real `Request` objects and cover
validation, status codes, the 409, the 422 and the disabled-flag path
(`api/_lib/api.test.ts`).

**What that suite does not and cannot claim: that two people see each other's work.** Shared
state, live propagation, and the offline queue all need two clients and a real deployment.
Reporting them as passing from a local harness would be asserting the mechanism instead of the
outcome — the failure mode this repo has already been bitten by three times
(`docs/assertion-discipline.md`).

So they are checks **you** run, once, on the Preview URL. Ten minutes.

## Before you start

| | |
|---|---|
| Env vars | `BLOB_READ_WRITE_TOKEN`, `REVIEW_API=true`, `VITE_REVIEW_TOOLS=true` on Preview |
| Redeploy | env changes apply at build time, never to an existing deployment |
| Devices | two browsers, or a laptop and a phone. Two profiles in one browser is enough — the store is per-browser, not per-tab |
| Names | give each device a **different** reviewer name when prompted. Attribution is the thing under test |

Call them **A** and **B** throughout.

---

## 1. A remark crosses the gap

1. On **A**, open the Remarks pill → enter remark mode → click any heading → type
   `verification 1` → save.
2. On **B**, open the Remarks panel. **Do not reload.**
3. ✅ `verification 1` appears within ~30s, showing **A**'s name.
4. On **B**, press **Resolve** on it.
5. ✅ On **A**, within ~30s, the remark leaves the default list.
6. On **A**, set the status filter to **Done**.
7. ✅ It is still there. Nothing was deleted.

> If step 7 fails, the soft delete is a hard delete and that is a stop-the-line bug — the store
> has no endpoint that removes a record, so a disappearance means the client filtered it out of
> existence.

## 2. A dictionary edit changes the app for everyone

1. On **A**, switch the app to **LSD**. Open the Dictionary tab, find a translated string, and
   edit its value to something obviously different.
2. ✅ **A**'s own UI shows the new value immediately, without a reload.
3. On **B**, in **LSD**, on a screen showing that string:
4. ✅ the new value appears within ~30s.
5. On **B**, open that key's history.
6. ✅ Two revisions, oldest first, each with an author and a timestamp. **A**'s name is on the
   newer one.
7. On **B**, press **Revert** on the older revision.
8. ✅ The value returns to the original, **and the history now has three entries** — the revert
   appended. If it has two, something deleted history and that is the one behaviour this design
   exists to prevent.

## 3. A conflict surfaces instead of disappearing

This is the load-bearing one. Both clients must edit **from the same base revision**, so open
the key on both *before* either saves.

1. On **A** and **B**, open the same key in the editor. Neither saves yet.
2. On **A**, type `AAA` and save.
3. On **B** — without refreshing — type `BBB` and save.
4. ✅ **B** is shown a conflict: both values, both names, and a choice. **B**'s edit was not
   rejected and **A**'s was not overwritten.
5. Open the key's history on either device.
6. ✅ **Both** `AAA` and `BBB` are in it. A 409 here means "yours is saved and so is theirs",
   not "yours was refused".
7. ✅ Exactly one of the two cards is marked **LIVE NOW** and the other **not applied**. A
   picker that shows two values without saying which is in effect is worse than no picker —
   you would choose, see no change, and have no way to tell whether the click worked.
8. Choose one.
9. ✅ A new revision is appended carrying the chosen value. Nothing was merged.
10. ✅ On **A** — which never saw the conflict — a refresh shows the chosen value, and the
    history holds all three revisions.

## 4. Losing the network does not lose the edit

1. On **A**, open DevTools → Network → **Offline** (on a phone, turn off wifi and data).
2. Write a remark, and make a dictionary edit.
3. ✅ The UI says both are **pending**, plainly, and shows a count. Neither silently succeeds
   and neither silently vanishes.
4. Go back online.
5. ✅ Both land within ~20s without you pressing anything, and the pending count clears.
6. On **B**, ✅ both appear.

### 4b. The failure that must be loud

1. On **A**, still online, edit the URL to a path that is not a function — or use a deployment
   where `REVIEW_API` is unset — and try to save.
2. ✅ You get a visible error naming the problem, **not** a spinner, and **not** a save that
   appears to work.

> The specific failure this guards: `vercel.json` rewrites `/(.*)` to `/index.html`. Functions
> win the filesystem check, so `/api/*` should never be swallowed — but if it ever is, every
> call returns `200 text/html` with the app shell in the body. A client that shrugs at that
> turns a total outage into a UI that quietly saves nothing. Deployment Protection's challenge
> page has exactly the same shape.

## 5. Mojibake is refused

1. Copy a broken value from `docs/lsd-gaps.md` — anything in the `Ø§Ù„` family, or containing `�`.
2. Paste it into the dictionary editor and save.
3. ✅ The save is blocked with an explanation of what is wrong with the value.
4. ✅ On **B**, the key's history is unchanged. Nothing reached the store.

> The client checks it for the good error message. The **server** returns 422 using the same
> detector, and that is the one a bad request cannot skip — which is what actually protects the
> corpus now that six people can type into it.

## 6. The disabled build really is disabled

On a deployment with `VITE_REVIEW_TOOLS` unset:

1. ✅ No Remarks pill, no Dictionary tab.
2. `curl https://<that-deployment>/api/remarks`
3. ✅ `404` — and JSON, not the app shell. A disabled endpoint is indistinguishable from one
   that was never deployed.

The bundle half of this is machine-checked and does not need you: `npm run check:gate` builds
both flag states and asserts the tool code, `BLOB_READ_WRITE_TOKEN`, `REVIEW_API` and the
`xlsx` internals are all absent with the flag off, against a control string that proves the
search works.

## 7. The export reaches the spreadsheet

1. With at least one override in place, press **Export patch** (or open
   `/api/dictionary-export`).
2. ✅ The .xlsx has one row per overridden key with **Key, Page, Old value, New value, Kind,
   Author, Changed at, Note, Revision id**.
3. ✅ The old value matches what the generated wordlist currently holds, so the row can be
   reconciled without going back to the app.

## 8. Revert adds to the record instead of erasing it

The property that makes "anyone can edit" safe. It only works if people can see it, so this
check is about what the screen says, not only about what the store does.

1. On **A**, edit a key. On **B**, edit the same key again (refresh first — this is not a
   conflict, it is a normal second edit).
2. On **A**, open the key's **history**.
3. ✅ Both revisions are listed, newest first, each with **author, time and kind**, and the
   current one is marked **LIVE**.
4. ✅ The panel says, in words, that nothing here is ever deleted — before you press anything.
5. Press **Revert — adds a revision** on the older one.
6. ✅ The history now has **three** entries. **B**'s edit is still there, still with **B**'s
   name on it. The new top entry is marked `revert` and its note names whose value it restored.
7. ✅ Nothing disappeared from the list.

## 9. A merged edit stops being pending

Only checkable once a sync has run — do this after the first `POST /api/sync-wordlist` and the
redeploy that follows it.

1. Note the footer count: *N edit(s) not yet in the wordlist*.
2. Run the sync, let the commit land, wait for the redeploy.
3. Reload the editor.
4. ✅ The synced keys now say **in the wordlist** rather than **not yet in the wordlist**, and
   the count has dropped by exactly that many.
5. ✅ Their revision history is **unchanged** — retirement is about what is applied and counted,
   never about what is recorded.
6. ✅ The app renders the same text before and after. A merged override is a no-op by
   definition; if the text moves, the comparison is wrong somewhere.

If the count never drops, the retirement comparison is not going through `bakedValue` — see
`docs/dictionary-editing.md`. That failure looks exactly like the feature working.

## 10. The sync writes cells, not a new workbook

The one that cannot be checked by looking at values, because the values would be right either way.

1. Make one dictionary edit. Press **Sync now** in the editor's footer.
2. ✅ The footer reports a commit, `N updated`, and the commit sha.
3. Open the commit on GitHub and download the .xlsx from it.
4. ✅ Open it in Excel: **column C is still Kanz-al-Lulu**, still right-aligned, still RTL. The
   sheet still reads right-to-left. Column widths are unchanged.
5. ✅ `F370` still contains **1448**.
6. ✅ Your edit is in column C of the row that already existed — no new row was added for a key
   that already had one.
7. ✅ The `Read me` sheet is untouched.
8. Press **Sync now** again without making an edit.
9. ✅ It reports *nothing to write* and **no second commit appears**. A no-op must not commit.

## 11. A new key lands at the end with an empty Page

1. Find a class **C** string in the editor (no wordlist row) and give it a value.
2. Sync.
3. ✅ The new row is the **last** row of the sheet, its Page cell is **empty**, and every
   existing row still has the row number it had before — the `Read me` cites rows 230, 231,
   312, 457 and 500 by number.
4. ✅ After the commit deploys, the string renders in LSD and the editor shows it as
   **in the wordlist** rather than pending.

---

## If something fails

Say which number. Every one of these is a specific claim about a specific mechanism, and the
numbers map onto the code:

| # | where it lives |
|---|---|
| 1 | `src/shared/remarksApi.ts`, `api/remarks/*` |
| 2 | `src/shared/dictionaryApi.ts`, `applySharedOverrides` in `src/i18n/index.tsx` |
| 3 | `appendRevision` in `api/_lib/records.ts` — appends first, reports the conflict second |
| 4 | `src/shared/outbox.ts`, `src/shared/transport.ts` |
| 5 | `api/dictionary/[key].ts` → `detectMojibake` |
| 6 | `apiEnabled` in `api/_lib/http.ts`, `scripts/check-dev-only.mjs` |
| 7 | `api/dictionary-export.ts` |
| 8 | `HistoryList` in `src/dev/DictionaryPanel.tsx`, `submit(kind:'revert')` |
| 9 | `isMerged`/`pendingOverrides` in `src/shared/dictionaryApi.ts`, `baselineValue` in `src/i18n/index.tsx` |
| 10 | `api/_lib/zip.ts`, `api/_lib/wordlistXlsx.ts` → `verifyPatch`, `api/_lib/runSync.ts` |
| 11 | `patchWordlist`'s append branch — empty Page, end of sheet |
