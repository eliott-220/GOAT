import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { AppSnapshot, AppState } from './appState'

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ app, children }: { app: AppState; children: ReactNode }) {
  return <AppContext.Provider value={app}>{children}</AppContext.Provider>
}

/** L'état applicatif et son instantané courant (les composants se re-rendent à chaque changement). */
export function useApp(): { app: AppState; snap: AppSnapshot } {
  const app = useContext(AppContext)
  if (!app) throw new Error('useApp doit être utilisé dans <AppProvider>')
  const snap = useSyncExternalStore(app.subscribe, app.getSnapshot)
  return { app, snap }
}

/** Horodatage qui se rafraîchit toutes les `intervalMs` (chronomètres de session). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
