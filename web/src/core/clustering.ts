import type { GeoCoordinate } from './geohash'
import type { PresencePin } from './models'
import { sportById, type SportCategory } from './sports'

const TILE_SIZE = 256

/** Projection Web Mercator standard (celle de tous les fonds de carte "tuilés") vers des pixels "monde" à un zoom
 * donné. Sert uniquement à mesurer une distance à l'écran entre deux pins ; jamais affichée telle quelle. */
function project(coordinate: GeoCoordinate, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom
  const sin = Math.sin((coordinate.latitude * Math.PI) / 180)
  const x = ((coordinate.longitude + 180) / 360) * scale
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  return { x, y }
}

/** Sport qui représente le pin : celui mis en avant par le filtre s'il est pratiqué, sinon le premier
 * (même règle que l'affichage d'un pin isolé, voir MapView.renderPin). */
function representativeSportID(pin: PresencePin, highlighted?: string): string {
  return highlighted && pin.sportIDs.includes(highlighted) ? highlighted : pin.sportIDs[0]!
}

function categoryOf(pin: PresencePin, highlighted?: string): SportCategory {
  return sportById(representativeSportID(pin, highlighted))?.category ?? 'multi'
}

export type MapMarker =
  | { kind: 'pin'; id: string; pin: PresencePin }
  | { kind: 'cluster'; id: string; category: SportCategory; coordinate: GeoCoordinate; count: number; hasActive: boolean }

/** Distance à l'écran (en pixels, au zoom donné) en dessous de laquelle deux pins d'une même catégorie fusionnent. */
export const DEFAULT_CLUSTER_RADIUS_PX = 46

/**
 * Regroupe les pins visuellement proches et de même catégorie de sport en un seul marqueur, pour qu'ils ne se
 * chevauchent plus une fois dézoomé (la France entière ne laisse que quelques centaines de pixels par région).
 * Ne modifie jamais mon propre pin (toujours affiché seul, jamais fondu dans un groupe).
 *
 * "Proches" au sens des composantes connexes : par chaînage, deux pins peuvent finir dans le même groupe sans être
 * directement à moins de `radiusPx` l'un de l'autre, tant qu'une suite de voisins de proche en proche les relie
 * (comme des points qui se touchent). Suffisant et bon marché à l'échelle d'une station (pas de structure spatiale).
 */
export function clusterPins(pins: readonly PresencePin[], zoom: number, highlighted?: string, radiusPx = DEFAULT_CLUSTER_RADIUS_PX): MapMarker[] {
  const markers: MapMarker[] = []
  const byCategory = new Map<SportCategory, PresencePin[]>()

  for (const pin of pins) {
    if (pin.isMe) {
      markers.push({ kind: 'pin', id: pin.userID, pin })
      continue
    }
    const category = categoryOf(pin, highlighted)
    const list = byCategory.get(category)
    if (list) list.push(pin)
    else byCategory.set(category, [pin])
  }

  for (const [category, group] of byCategory) {
    const points = group.map((pin) => ({ pin, px: project(pin.coordinate, zoom) }))
    const used = new Array(points.length).fill(false)

    for (let i = 0; i < points.length; i++) {
      if (used[i]) continue
      used[i] = true
      const members = [points[i]!.pin]
      // Propagation en largeur : on absorbe tout pin non affecté à moins de `radiusPx` d'un membre déjà dans le
      // groupe (pas seulement de la graine de départ), ce qui chaîne naturellement une suite de voisins proches.
      const frontier = [points[i]!.px]
      while (frontier.length > 0) {
        const from = frontier.pop()!
        for (let j = 0; j < points.length; j++) {
          if (used[j]) continue
          const dx = points[j]!.px.x - from.x
          const dy = points[j]!.px.y - from.y
          if (Math.hypot(dx, dy) > radiusPx) continue
          used[j] = true
          members.push(points[j]!.pin)
          frontier.push(points[j]!.px)
        }
      }

      if (members.length === 1) {
        markers.push({ kind: 'pin', id: members[0]!.userID, pin: members[0]! })
        continue
      }
      const ids = members.map((m) => m.userID).sort()
      markers.push({
        kind: 'cluster',
        id: `cluster:${category}:${ids.join(',')}`,
        category,
        coordinate: {
          latitude: members.reduce((sum, m) => sum + m.coordinate.latitude, 0) / members.length,
          longitude: members.reduce((sum, m) => sum + m.coordinate.longitude, 0) / members.length,
        },
        count: members.length,
        hasActive: members.some((m) => m.status === 'active'),
      })
    }
  }

  return markers
}
