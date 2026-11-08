import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NotInApp } from './NotInApp'
// Cinzel is bundled with the app (no internet needed). Used for headings only.
import '@fontsource/cinzel/400.css'
import '@fontsource/cinzel/700.css'
import './styles.css'
import { applyTheme, loadTheme } from './themes'

applyTheme(loadTheme()) // before anything is drawn, so there is no flash of the wrong colours

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* window.api only exists inside the app window (see src/preload). */}
    {window.api ? <App /> : <NotInApp />}
  </StrictMode>
)
