import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { TourProvider } from './tour/TourProvider'
import { LangProvider, registerAuthoredNames } from './i18n'
import CoveragePanel from './i18n/CoveragePanel'
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
        <TourProvider>
          <App />
        </TourProvider>
        {/* Dev-only; compiles away entirely in a production build. */}
        <CoveragePanel />
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
