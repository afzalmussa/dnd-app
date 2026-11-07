import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Cinzel is bundled with the app (no internet needed). Used for headings only.
import '@fontsource/cinzel/400.css'
import '@fontsource/cinzel/700.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
