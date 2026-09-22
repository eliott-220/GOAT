/** Enregistre le service worker (build de production uniquement : en dev il gênerait le rechargement à chaud). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

/**
 * Force la récupération de la dernière version déployée, pour le bouton "Rafraîchir l'application" du profil.
 *
 * Le service worker sert déjà la coquille "réseau d'abord" (voir public/sw.js), mais les fichiers JS/CSS (noms
 * hachés) sont servis "cache d'abord, rafraîchi en arrière-plan" : sans ça, une mise à jour ne serait visible qu'au
 * chargement suivant. On vide donc explicitement le cache et on redemande au service worker de vérifier une
 * nouvelle version avant de recharger, plutôt que d'attendre.
 */
export async function refreshApp(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration?.update()
    }
  } catch {
    // Tant pis pour la vérification explicite : vider le cache ci-dessous suffit déjà à forcer la fraîcheur.
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // API caches absente (anciens navigateurs) : un rechargement réseau normal reste suffisant.
  }
  location.reload()
}
