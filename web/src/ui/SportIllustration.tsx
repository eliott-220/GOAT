import type { CSSProperties } from 'react'
import { sportById, sportColor, type SportCategory } from '../core/sports'

/**
 * Petites illustrations vectorielles originales, dessinées pour GOAT. Les sports proches partagent une silhouette
 * lisible à 20–40 px ; le catalogue garde ses noms et ses identifiants indépendamment de cette couche visuelle.
 * Tous les fragments sont statiques : aucune donnée de profil n'entre dans le SVG.
 */
type Motif = 'ski' | 'board' | 'wave' | 'skate' | 'run' | 'walk' | 'cycle' | 'football' | 'basket' | 'ball' | 'racket' | 'weights' | 'yoga' | 'dance' | 'mountain' | 'climb' | 'golf' | 'swim' | 'boat' | 'sail' | 'dive' | 'fight' | 'fence' | 'multi'

const ART: Record<Motif, string> = {
  ski: '<circle cx="19" cy="7" r="2.5"/><path d="m18 10-4 5 5 3 4 6m-5-12 6 2 2 4M12 15l-4 8m3 1 17 5M5 27l18 4"/>',
  board: '<circle cx="19" cy="7" r="2.5"/><path d="m18 10-4 5 6 3 4 5m-8-10 7 1 3 4M8 28c7 3 16 3 21-1"/>',
  wave: '<circle cx="18" cy="7" r="2.4"/><path d="m18 10-4 6 6 3 4 5m-8-11 7 1 3 4M4 26c5-3 8 3 13 0s8-3 12 0M5 30c4-2 7 2 11 0s8-2 12 0"/>',
  skate: '<path d="M5 20h21l-4 5H9zM8 18l3-8 7-2 5 8m-11 2 3-7"/><circle cx="12" cy="28" r="2"/><circle cx="22" cy="28" r="2"/>',
  run: '<circle cx="19" cy="6" r="2.5"/><path d="m18 10-4 6 6 3 4 7m-8-13 7 1 4 4m-10 2-6 3-4 7m13-10-2 7-7 4"/>',
  walk: '<circle cx="18" cy="6" r="2.5"/><path d="m17 10-2 8 5 2 3 10m-7-15 6 2 4 1m-11 1-5 11m6-11-4 5"/>',
  cycle: '<circle cx="8" cy="24" r="5"/><circle cx="25" cy="24" r="5"/><path d="m8 24 6-12 5 12h-11m6-12h5l6 12m-12-14h4m2-3 4 1"/>',
  football: '<circle cx="17" cy="17" r="12"/><path d="m17 11 5 4-2 6h-6l-2-6zm-11 3 6 1m-2 10 4-4m13 3-7-3m6-10-4 4"/>',
  basket: '<circle cx="17" cy="17" r="12"/><path d="M5 17h24M17 5v24M8 9c7 4 11 12 13 19m5-19c-7 4-11 12-13 19"/>',
  ball: '<circle cx="17" cy="17" r="12"/><path d="M6 12c6 4 16 4 22 0M8 24c6-4 12-4 18 0M17 5v24"/>',
  racket: '<ellipse cx="20" cy="12" rx="8" ry="10" transform="rotate(32 20 12)"/><path d="m14 20-8 10m-1-2 3 3M15 7l10 10M11 13l14 4m-6-14 3 18"/>',
  weights: '<path d="M5 13v8m4-11v14m16-11v8m-4-11v14M9 17h12M3 14h2m24 0h2M3 20h2m24 0h2"/>',
  yoga: '<circle cx="17" cy="7" r="2.5"/><path d="m17 11-2 8 2 3 2-3-2-8M9 14l6 5m10-5-6 5M4 27l8-5 5 3 5-3 8 5M9 29h16"/>',
  dance: '<circle cx="18" cy="6" r="2.5"/><path d="m18 10-3 8 5 3-1 8m-4-11-6 1-4-5m15 7 7-6m-7 8 6 5M9 29h4"/>',
  mountain: '<path d="M3 28 14 9l5 8 4-5 8 16H3zm7-9 4 3 3-3m5 2 2 2 2-2"/><path d="m14 9 3 4 2-2"/>',
  climb: '<path d="M4 30 16 4l14 26M10 22l5-2 3 4 4-2"/><circle cx="20" cy="8" r="2"/><path d="m19 11-4 5 4 3-2 6m-2-9-4 3"/>',
  golf: '<path d="M10 30h16M17 29V5l10 4-10 4M6 25c2-3 7-3 9 0m6 3h1"/>',
  swim: '<circle cx="21" cy="9" r="2.4"/><path d="m20 12-5 5 6 3 5-3M4 23c4-3 7 3 11 0s7-3 11 0 5 1 6 0M4 28c4-3 7 3 11 0s7-3 11 0 5 1 6 0"/>',
  boat: '<path d="M4 21h26l-5 7H9zM8 18l7-6 9 6m-7-7V5M4 30c4-2 7 2 11 0s7-2 11 0"/>',
  sail: '<path d="M17 4v19M15 7 6 22h9m4-14 9 14h-9M4 25h26l-4 5H8z"/>',
  dive: '<circle cx="18" cy="9" r="5"/><path d="M13 9h10m-7 5-4 6 7 4 6-4M5 28c4-2 7 2 11 0s7-2 11 0M6 11l4-2m-2 6 3-1"/>',
  fight: '<path d="m7 20 2-8 4-2 3 4 4-4 4 2 3 8-3 7H10zM9 18h6m4 0h7M13 10V6m8 4V6"/>',
  fence: '<circle cx="12" cy="8" r="3"/><path d="m12 11 2 8-5 9m5-9 7 2 4 7m-12-11 9-2 8-3M27 8v9M7 30h19"/>',
  multi: '<circle cx="17" cy="17" r="11"/><path d="M17 6v6m0 10v6M6 17h6m10 0h6m-15-5 8 10m0-10-8 10"/><circle cx="17" cy="17" r="3"/>',
}

const CATEGORY_MOTIF: Record<SportCategory, Motif> = {
  glisse: 'ski', course: 'run', velo: 'cycle', ballon: 'ball', raquette: 'racket',
  salle: 'weights', nature: 'mountain', eau: 'swim', combat: 'fight', multi: 'multi',
}

export function sportMotif(id: string): Motif {
  const sport = sportById(id)
  if (!sport) return 'multi'
  if (['ski', 'ski-fond', 'ski-rando', 'raquettes'].includes(id)) return 'ski'
  if (['snowboard', 'snowboard-rando', 'wakeboard'].includes(id)) return 'board'
  if (['surf', 'windsurf', 'kitesurf', 'speedsurf', 'wakesurf', 'ski-nautique', 'paddle'].includes(id)) return 'wave'
  if (['patinage', 'roller', 'skateboard'].includes(id)) return 'skate'
  if (['marche', 'marche-lestee', 'randonnee'].includes(id)) return 'walk'
  if (['football', 'futsal'].includes(id)) return 'football'
  if (id === 'basket') return 'basket'
  if (['yoga', 'pilates', 'mobilite', 'respiration', 'meditation'].includes(id)) return 'yoga'
  if (['danse', 'gymnastique'].includes(id)) return 'dance'
  if (['escalade', 'bloc', 'escalade-salle', 'alpinisme'].includes(id)) return 'climb'
  if (['golf', 'disc-golf', 'tir-arc'].includes(id)) return 'golf'
  if (['aviron', 'aviron-salle', 'kayak', 'eau-vive'].includes(id)) return 'boat'
  if (id === 'voile') return 'sail'
  if (['plongee', 'apnee', 'snorkeling'].includes(id)) return 'dive'
  if (id === 'escrime') return 'fence'
  return CATEGORY_MOTIF[sport.category]
}

function svg(motif: Motif): string {
  return `<svg viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ART[motif]}</svg>`
}

/** Pour les marqueurs créés directement par MapLibre, à partir d'une clé issue du catalogue. */
export function sportIllustrationMarkup(id: string): string {
  return svg(sportMotif(id))
}

export function categoryIllustrationMarkup(category: SportCategory): string {
  return svg(CATEGORY_MOTIF[category])
}

export function SportIllustration({ sportID, className = '' }: { sportID: string; className?: string }) {
  return <span className={`sport-art ${className}`.trim()} style={{ '--sport-color': sportColor(sportID) } as CSSProperties} aria-hidden="true" dangerouslySetInnerHTML={{ __html: sportIllustrationMarkup(sportID) }} />
}
