export interface GeoCoordinate {
  latitude: number
  longitude: number
}

const ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz'

/**
 * Précision utilisée pour toute position diffusée aux autres utilisateurs :
 * cellule d'environ 150 m × 150 m (spec MVP : arrondi ~200 m).
 */
export const PUBLIC_PRECISION = 7

export function encode(latitude: number, longitude: number, precision = PUBLIC_PRECISION): string {
  let latMin = -90
  let latMax = 90
  let lonMin = -180
  let lonMax = 180
  let hash = ''
  let bit = 0
  let value = 0
  let isLongitudeBit = true

  while (hash.length < precision) {
    if (isLongitudeBit) {
      const mid = (lonMin + lonMax) / 2
      if (longitude >= mid) {
        value = (value << 1) | 1
        lonMin = mid
      } else {
        value <<= 1
        lonMax = mid
      }
    } else {
      const mid = (latMin + latMax) / 2
      if (latitude >= mid) {
        value = (value << 1) | 1
        latMin = mid
      } else {
        value <<= 1
        latMax = mid
      }
    }
    isLongitudeBit = !isLongitudeBit
    bit += 1
    if (bit === 5) {
      hash += ALPHABET[value]
      bit = 0
      value = 0
    }
  }
  return hash
}

/** Centre de la cellule, ou undefined si le hash contient un caractère invalide. */
export function decode(hash: string): GeoCoordinate | undefined {
  let latMin = -90
  let latMax = 90
  let lonMin = -180
  let lonMax = 180
  let isLongitudeBit = true

  for (const char of hash) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) return undefined
    for (let shift = 4; shift >= 0; shift--) {
      const bit = (index >> shift) & 1
      if (isLongitudeBit) {
        const mid = (lonMin + lonMax) / 2
        if (bit === 1) lonMin = mid
        else lonMax = mid
      } else {
        const mid = (latMin + latMax) / 2
        if (bit === 1) latMin = mid
        else latMax = mid
      }
      isLongitudeBit = !isLongitudeBit
    }
  }
  return { latitude: (latMin + latMax) / 2, longitude: (lonMin + lonMax) / 2 }
}

/** Distance en mètres (haversine). */
export function distance(a: GeoCoordinate, b: GeoCoordinate): number {
  const r = 6_371_000
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}
