import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import './styles.css'
import { createAccounts } from './auth/config'
import { registerServiceWorker } from './pwa'
import { AppState } from './state/appState'
import { App } from './ui/App'

// Vrais comptes si Supabase est configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), sinon mode démo local.
let accounts: ReturnType<typeof createAccounts>
try {
  accounts = createAccounts()
} catch (error) {
  // Ex. clé secrète collée par erreur dans la configuration : on refuse de démarrer plutôt que de la manipuler.
  document.getElementById('root')!.textContent = error instanceof Error ? error.message : String(error)
  throw error
}
const app = new AppState({ accounts })
// Poignée de débogage en développement (ex. `__goat.demoSetPosition('Chamonix')` dans la console).
if (import.meta.env.DEV) {
  Object.assign(window, { __goat: app, __accounts: accounts })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App app={app} />
  </StrictMode>,
)
registerServiceWorker()
