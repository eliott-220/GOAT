import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { assertPublicKey } from './src/auth/keys.ts'

export default defineConfig(({ mode }) => {
  // Refuse de construire l'app si la clé Supabase fournie est une clé SECRÈTE (elle finirait dans le JavaScript public).
  const publicKey = loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_ANON_KEY
  if (publicKey) assertPublicKey(publicKey)

  return {
    // Chemins relatifs : l'app peut être servie à la racine d'un domaine comme dans un sous-dossier.
    base: './',
    plugins: [react()],
    // Le worker de MapLibre est un module ES (voir MapView.tsx).
    worker: { format: 'es' as const },
    // `host: true` expose le serveur de dev sur le réseau local (test depuis un téléphone sur le même Wi-Fi).
    server: { port: 5173, strictPort: true, host: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
    test: { environment: 'node' as const, include: ['tests/**/*.test.ts'] },
  }
})
