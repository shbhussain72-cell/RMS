import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { TourProvider } from './tour/TourProvider'
import { LangProvider, registerAuthoredNames } from './i18n'
import CoveragePanel from './i18n/CoveragePanel'
import DictionaryPanel from './dev/DictionaryPanel'
import { RemarksProvider } from './remarks/RemarksProvider'
import RemarksLayer from './remarks/RemarksLayer'
import RemarksPanel from './remarks/RemarksPanel'
import RemarksFixture from './remarks/RemarksFixture'
import { miqaats } from './data/seed'
import './index.css'

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
        {/* Remarks wraps the app so its layer can anchor to anything the app renders, and
            sits inside LangProvider because every remark records the language it was made
            in. Dev-only: `import.meta.env.DEV` is statically false in a production build, so
            the provider renders its children unchanged and the whole tool is tree-shaken. */}
        <RemarksProvider>
          <TourProvider>
            <App />
          </TourProvider>
          <RemarksLayer />
          <RemarksPanel />
          <RemarksFixture />
        </RemarksProvider>
        {/* Dev-only; both compile away entirely in a production build. The dictionary editor
            sits inside LangProvider because it layers staged edits into that very dictionary. */}
        <CoveragePanel />
        <DictionaryPanel />
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
