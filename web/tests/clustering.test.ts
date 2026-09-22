import { describe, expect, it } from 'vitest'
import { clusterPins, DEFAULT_CLUSTER_RADIUS_PX } from '../src/core/clustering'
import type { PresencePin } from '../src/core/models'

let counter = 0
function pin(overrides: Partial<PresencePin> & { coordinate: PresencePin['coordinate'] }): PresencePin {
  return {
    userID: `user-${counter++}`,
    firstName: 'X',
    sportIDs: ['ski'],
    status: 'recentlyActive',
    isMe: false,
    isVisibleToOthers: true,
    ...overrides,
  }
}

// Chamonix et un point à quelques mètres : quasi superposés à n'importe quel zoom raisonnable.
const CHAMONIX = { latitude: 45.9237, longitude: 6.8694 }
const CHAMONIX_NEARBY = { latitude: 45.9238, longitude: 6.8695 }
// Marseille : loin de Chamonix (~470 km), ne doit jamais fusionner avec elle.
const MARSEILLE = { latitude: 43.2965, longitude: 5.3698 }

describe('clusterPins', () => {
  it('renvoie un marqueur par pin sans rien fusionner quand la liste est vide ou clairsemée', () => {
    expect(clusterPins([], 5)).toEqual([])
    const a = pin({ coordinate: CHAMONIX })
    const b = pin({ coordinate: MARSEILLE })
    const markers = clusterPins([a, b], 6)
    expect(markers).toHaveLength(2)
    expect(markers.every((m) => m.kind === 'pin')).toBe(true)
  })

  it('fusionne deux pins très proches de la même catégorie, même à un zoom serré (ville)', () => {
    const a = pin({ coordinate: CHAMONIX, sportIDs: ['ski'] })
    const b = pin({ coordinate: CHAMONIX_NEARBY, sportIDs: ['snowboard'] }) // même catégorie "glisse", sport différent
    const markers = clusterPins([a, b], 14)
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ kind: 'cluster', category: 'glisse', count: 2 })
  })

  it("ne fusionne pas deux pins éloignés à un zoom encore régional", () => {
    const a = pin({ coordinate: CHAMONIX })
    const b = pin({ coordinate: MARSEILLE })
    const markers = clusterPins([a, b], 8)
    expect(markers).toHaveLength(2)
    expect(markers.every((m) => m.kind === 'pin')).toBe(true)
  })

  it("fusionne même des pins éloignés une fois assez dézoomé (vue de toute la France) : c'est le but de la fonction", () => {
    const a = pin({ coordinate: CHAMONIX })
    const b = pin({ coordinate: MARSEILLE })
    const markers = clusterPins([a, b], 3.5) // zoom minimal de la carte (voir MapView.FRANCE_VIEW)
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ kind: 'cluster', count: 2 })
  })

  it('ne fusionne pas deux pins proches mais de catégories différentes', () => {
    const a = pin({ coordinate: CHAMONIX, sportIDs: ['ski'] }) // glisse
    const b = pin({ coordinate: CHAMONIX_NEARBY, sportIDs: ['football'] }) // ballon
    const markers = clusterPins([a, b], 14)
    expect(markers).toHaveLength(2)
    expect(markers.every((m) => m.kind === 'pin')).toBe(true)
  })

  it('ne fusionne jamais mon propre pin, même collé à un autre de la même catégorie', () => {
    const me = pin({ coordinate: CHAMONIX, isMe: true, sportIDs: ['ski'] })
    const other = pin({ coordinate: CHAMONIX_NEARBY, sportIDs: ['ski'] })
    const markers = clusterPins([me, other], 14)
    expect(markers).toHaveLength(2)
    const mine = markers.find((m) => m.kind === 'pin' && m.pin.isMe)
    expect(mine).toMatchObject({ kind: 'pin' })
  })

  it('place le centre du groupe au centroïde de ses membres', () => {
    const a = pin({ coordinate: { latitude: 45.0, longitude: 6.0 } })
    const b = pin({ coordinate: { latitude: 45.0, longitude: 6.0002 } })
    const markers = clusterPins([a, b], 15)
    expect(markers).toHaveLength(1)
    const cluster = markers[0]!
    if (cluster.kind !== 'cluster') throw new Error('expected a cluster')
    expect(cluster.coordinate.latitude).toBeCloseTo(45.0, 5)
    expect(cluster.coordinate.longitude).toBeCloseTo(6.0001, 5)
  })

  it("porte hasActive à vrai dès qu'un membre est actif, même un seul parmi plusieurs", () => {
    const a = pin({ coordinate: CHAMONIX, status: 'recentlyActive' })
    const b = pin({ coordinate: CHAMONIX_NEARBY, status: 'active' })
    const c = pin({ coordinate: CHAMONIX, status: 'recentlyActive' })
    const markers = clusterPins([a, b, c], 14)
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ kind: 'cluster', count: 3, hasActive: true })
  })

  it('regroupe par la catégorie du sport mis en avant par le filtre, pas seulement le premier sport du pin', () => {
    // Deux pratiquants "ski + football" : sans filtre, la catégorie vient du premier sport (glisse) ; filtrés sur
    // football, ils doivent se regrouper sous "ballon" (même règle que le pin isolé affiché, voir renderPin).
    const a = pin({ coordinate: CHAMONIX, sportIDs: ['ski', 'football'] })
    const b = pin({ coordinate: CHAMONIX_NEARBY, sportIDs: ['ski', 'football'] })
    expect(clusterPins([a, b], 14)[0]).toMatchObject({ kind: 'cluster', category: 'glisse' })
    expect(clusterPins([a, b], 14, 'football')[0]).toMatchObject({ kind: 'cluster', category: 'ballon' })
  })

  it('chaîne les fusions : un pin peut rejoindre un groupe déjà formé même hors du rayon de sa toute première graine', () => {
    // Trois points alignés, chacun à radius*0.9 du suivant : le premier et le troisième sont à ~1.8×radius l'un de
    // l'autre (donc hors rayon direct), mais tous les trois doivent fusionner par transitivité via le second.
    const zoom = 10
    const step = DEFAULT_CLUSTER_RADIUS_PX * 0.9
    // ~111 320 m par degré de latitude à l'équateur, converti grossièrement en pixels via la projection elle-même :
    // plus simple de construire directement trois points à distance de pixels connue en réutilisant un delta de longitude fixe et petit.
    const base = { latitude: 46.0, longitude: 2.0 }
    const lngStep = (step * 360) / (256 * 2 ** zoom) // delta de longitude équivalent à `step` pixels à ce zoom (x = (lng+180)/360 * échelle)
    const a = pin({ coordinate: base })
    const b = pin({ coordinate: { ...base, longitude: base.longitude + lngStep } })
    const c = pin({ coordinate: { ...base, longitude: base.longitude + 2 * lngStep } })
    const markers = clusterPins([a, b, c], zoom)
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ kind: 'cluster', count: 3 })
  })
})
