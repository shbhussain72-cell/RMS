# Loanword policy — when English stays English

**For the wordlist owner.** No code knowledge needed.

Machine-readable version: [`src/i18n/loanword-policy.json`](../src/i18n/loanword-policy.json).
That file is what the audit and the build actually read, so the two can never drift apart.

---

## The policy in one line

**Keep the English word, and let the app isolate it.**

Certain English words are already in everyday spoken use among mumineen. Translating them
produces text that reads as stilted and, worse, is often *less* clear than the English —
nobody says anything other than "zone" for a zone. Those words stay in Latin script inside an
otherwise Lisan al-Dawat sentence.

## The words

| | | | |
|---|---|---|---|
| zone | registration | reservation | reserve |
| register | visa | airport | upload |
| wheelchair | form | slot | pass |

**You do not need to do anything special when you use these.** Write the sentence naturally:

> ‏اْثثنا گروپ نے zone ما reserve كرو

The app takes care of the rest — see below.

---

## What the app does automatically

A sentence mixing Arabic and Latin script is genuinely hard for a browser to lay out. Left
alone, it reorders the pieces and you get nonsense like this:

| What you typed | What the user used to see |
|---|---|
| `٠٥:٠٠ AM IST` | `AM IST ٠٥:٠٠` |
| `Requested host city كولبو — request members below` | the halves swapped around |

**This is now handled for you.** Every English run inside every dictionary value is wrapped
in an isolation marker automatically, at the moment the string is loaded. You will never need
to add a marker, a bracket, or a special character yourself — and you should not try to
"fix" the order by rearranging words in the spreadsheet. If a line still looks wrong,
that is a bug to report, not something to work around in the cell.

---

## "Identity" rows — when the two columns match

Sometimes the LSD cell ends up holding exactly the same text as the English cell. That is
**sometimes correct and sometimes a gap**, and the audit now separates the two so you are
never asked to translate something that is already right.

### Correct as-is — no action

Listed in [`docs/lsd-gaps.md` §4b](./lsd-gaps.md). These are acronyms, units and format masks:

| Entry | Why it stays English |
|---|---|
| `ITS`, `ITS ID` | The name of the identity system itself. |
| `PDF` | File-format acronym, printed on the file. |
| `AM`, `PM`, `IST` | Clock and timezone markers. |
| `mm/dd/yyyy` | An instruction about the literal characters to type. |
| `248 KB` | Digits plus a unit — neither half is language. |
| `Registration` | Loanword (see the table above). |

### Needs you — a real gap

Listed in [`docs/lsd-gaps.md` §4](./lsd-gaps.md). These read as English only because nobody
has translated them yet:

`Home` · `Registered` · `Soft Diet` · `Tap to upload visa (PDF)` · `d` · `h`

Two of those are judgement calls rather than clear gaps, and we would rather ask than guess:

- **`d` and `h`** are the abbreviations in a countdown (`6d 4h left`). They are abbreviations
  rather than loanwords, so they are not covered by the policy above. If they should stay as
  `d`/`h`, say so and they move to the "no action" list permanently.
- **`Tap to upload visa (PDF)`** is a whole sentence. `upload`, `visa` and `PDF` stay English
  inside it by policy; the instruction around them still needs translating.

---

## Changing this policy

Edit [`src/i18n/loanword-policy.json`](../src/i18n/loanword-policy.json) — add or remove a
word, or move an entry between `identityByPolicy` (correct as-is) and `needsOwnerDecision`
(needs translating). Every entry carries a short reason; please add one when you add a word,
so the next person can argue with the decision instead of just inheriting it.

The next `npm run build:lsd` picks the change up. Nothing else needs touching.
