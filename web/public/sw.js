// Service worker minimal : l'app démarre hors connexion (coquille en cache).
// Les tuiles de carte et l'API ne sont jamais mises en cache ici : le fond de carte demande du réseau.
const CACHE = 'goat-shell-v3'

self.addEventListener('install', (event) => {
  // Précharge la coquille : la page d'accueil et les fichiers qu'elle référence (JS, CSS, manifeste, icônes),
  // pour que l'app démarre hors connexion dès la première visite.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE)
        const response = await fetch('./', { cache: 'reload' })
        const html = await response.clone().text()
        const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((match) => match[1])
        await cache.put('./', response)
        await Promise.all(assets.map((url) => cache.add(url).catch(() => undefined)))
      } catch {
        // Pas de réseau pendant l'installation : le cache se remplira à l'usage.
      }
    })(),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // tuiles, styles cartographiques… : réseau uniquement

  // Pages : réseau d'abord (pour recevoir les mises à jour), cache en secours hors connexion.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./', copy))
          return response
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  // Fichiers de l'app (noms hachés par le build) : cache d'abord, rafraîchi en arrière-plan.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone())
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
