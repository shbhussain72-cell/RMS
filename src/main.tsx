import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { TourProvider } from './tour/TourProvider'
import { LangProvider, registerAuthoredNames } from './i18n'
import CoveragePanel from './i18n/CoveragePanel'
import DictionaryPanel from './dev/DictionaryPanel'
import NotesBoard from './notes/NotesBoard'
import { miqaats } from './data/seed'
import { REVIEW_TOOLS } from './reviewTools'
import './index.css'

// Re-apply stored dictionary edits before the app settles. Without this an edit changed the
// running page and disappeared on the next load — see src/dev/bootOverrides.ts, which also
// explains why the two override stores share this moment and nothing else.
//
// Dynamic import inside the guard: `REVIEW_TOOLS` compiles to a literal `false` in a production
// build, so Rollup drops this branch and the dev-only modules it reaches with it. A static
// import would keep them alive and `check-dev-only.mjs` would fail on the shipped bundle.
if (REVIEW_TOOLS) {
  void import('./dev/bootOverrides').then((m) => m.applyStoredOverridesAtBoot())
}

// Every miqaat ships an authored LSD name (`titleArabic`) next to its English `title`.
// Registering the pairs here lets any screen render the LSD name from the English string
// alone, and is what makes the English name disappear entirely in LSD instead of sitting
// above an Arabic subtitle. Done before the first render so no frame shows the English.
registerAuthoredNames(miqaats.map((m) => [m.title, m.titleArabic] as const))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* LangProvider owns the app-wide English/LSD choice: it persists to localStorage and
          sets dir/lang/data-lang on <html>, so the setting applies everywhere, not per page.
          Outside TourProvider so the walkthrough's own copy can be translated later too. */}
      <LangProvider>
        {/*
          ── REMARKS IS RETIRED. IT IS NOT DELETED, AND IT IS NOT MOUNTED. ──────────────

          `RemarksProvider`, `RemarksLayer`, `RemarksPanel`, `StickyNote` and `RemarksFixture`
          all still exist under `src/remarks`, still behind `VITE_REVIEW_TOOLS`. Nothing renders
          them. `src/notes` replaces them.

          WHY. Remarks pinned every note to a DOM ELEMENT, and about two thirds of that
          subsystem exists to answer "is the thing I was pointing at still on the page":
          structural selectors, capture strategies, degradation levels, orphan states, an
          ambiguity rule, and a recovery fixture to test the recovery. The notes people actually
          wrote did not need the answer — "add a popup", "change alignment", "remove this box"
          are about the SCREEN. The precision cost a whole class of failure and was not being
          used.

          WHY NOT DELETED. The shared-store machinery underneath it — `src/shared/transport.ts`,
          the outbox, the poll, the identity prompt, `api/remarks` — is the only working example
          in this repo of a client that survives its backend being down, and it may well be
          wanted again. Notes are deliberately local-only; the day they are not, that code is
          what gets picked back up. Deleting it to make the tree tidy would mean rewriting it
          from the same first principles later.

          ONE CONSEQUENCE, STATED. `check-remarks.mjs` drives a tool that nothing mounts, so it
          is retired with it rather than left to fail as if the app had regressed — see the note
          at the top of that file.
        */}
        <TourProvider>
          <App />
        </TourProvider>
        {/* Page-level review notes. Inside LangProvider because every note records the language
            it was written in. Dev-only and tree-shaken with the flag off. */}
        <NotesBoard />
        {/* Dev-only; both compile away entirely in a production build. The dictionary editor
            sits inside LangProvider because it layers staged edits into that very dictionary. */}
        <CoveragePanel />
        <DictionaryPanel />
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
