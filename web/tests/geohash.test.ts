import { describe, expect, it } from 'vitest'
import { decode, distance, encode, PUBLIC_PRECISION } from '../src/core/geohash'

describe('geohash', () => {
  it('encode des vecteurs de référence (Wikipedia)', () => {
    expect(encode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj')
    expect(encode(42.6, -5.6, 5)).toBe('ezs42')
  })

  it('decode renvoie le centre de la cellule', () => {
    const center = decode('ezs42')!
    expect(center.latitude).toBeCloseTo(42.605, 3)
    expect(center.longitude).toBeCloseTo(-5.603, 3)
  })

  it('decode rejette les caractères invalides', () => {
    expect(decode('ezs4a')).toBeUndefined() // 'a' n'existe pas dans l'alphabet geohash
  })

  it('la précision publique garde la position à quelques centaines de mètres', () => {
    const exact = { latitude: 45.9237, longitude: 6.8694 }
    const hash = encode(exact.latitude, exact.longitude)
    expect(hash).toHaveLength(PUBLIC_PRECISION)
    const rounded = decode(hash)!
    expect(distance(exact, rounded)).toBeLessThan(150)
    expect(rounded).not.toEqual(exact) // la position diffusée ne doit pas être la position exacte
  })
})
