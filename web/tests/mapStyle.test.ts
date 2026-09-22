import type { StyleSpecification } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { MAP_COLORS, themeMapStyle } from '../src/ui/mapStyle'

const TILES = 'https://tiles.example/{z}/{x}/{y}.png'

/** Un style réduit à ce qui compte : même ordre de couches que « positron » (fonds, puis lignes, bâtiments, étiquettes). */
const positron = (): StyleSpecification => ({
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'rgb(242,243,240)' } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': 'rgb(230, 233, 229)' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': 'rgb(194, 200, 202)' } },
    { id: 'landcover_glacier', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', paint: { 'fill-color': '#eee' } },
    { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': '#aaa' } },
    { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', paint: { 'fill-color': 'rgb(234, 234, 229)' } },
    { id: 'boundary_2', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', paint: { 'line-color': 'hsl(0,0%,70%)' } },
    {
      id: 'label_country_1',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      layout: { 'text-font': ['Noto Sans Bold'], 'text-field': '{name}' },
      paint: { 'text-color': '#000', 'text-halo-color': '#fff' },
    },
    { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-field': '{name}' } },
  ],
})

describe('themeMapStyle', () => {
  it('ne modifie pas le style reçu', () => {
    const original = positron()
    const before = JSON.stringify(original)
    themeMapStyle(original, TILES)
    expect(JSON.stringify(original)).toBe(before)
  })

  it('recolore le fond, l\'eau, la verdure, la glace et les bâtiments', () => {
    const themed = themeMapStyle(positron(), TILES)
    const paint = (id: string) => (themed.layers.find((layer) => layer.id === id) as { paint: Record<string, unknown> }).paint
    expect(paint('background')['background-color']).toBe(MAP_COLORS.land)
    expect(paint('water')['fill-color']).toBe(MAP_COLORS.water)
    expect(paint('park')['fill-color']).toBe(MAP_COLORS.green)
    expect(paint('landcover_glacier')['fill-color']).toBe('#ffffff')
    expect(paint('building')['fill-color']).toBe(MAP_COLORS.building)
    expect(paint('boundary_2')['line-color']).toBe(MAP_COLORS.border)
  })

  it('adoucit les étiquettes, même celles qui n\'avaient aucune peinture', () => {
    const themed = themeMapStyle(positron(), TILES)
    const country = themed.layers.find((layer) => layer.id === 'label_country_1') as { paint: Record<string, unknown>; layout: Record<string, unknown> }
    const city = themed.layers.find((layer) => layer.id === 'label_city') as { paint: Record<string, unknown> }
    expect(country.paint['text-color']).not.toBe('#000')
    expect(country.paint['text-halo-color']).toBe(MAP_COLORS.halo)
    expect(country.layout['text-transform']).toBe('uppercase')
    expect(country.layout['text-field']).toBe('{name}') // le reste de la mise en page est conservé
    expect(city.paint['text-color']).toBeTruthy()
  })

  it('ajoute le relief sous les lignes et les étiquettes, et le terrain 3D', () => {
    const themed = themeMapStyle(positron(), TILES)
    const ids = themed.layers.map((layer) => layer.id)
    const hillshade = ids.indexOf('hillshade')
    expect(hillshade).toBeGreaterThan(ids.indexOf('water')) // par-dessus l'eau : les fonds marins sont ombrés
    expect(hillshade).toBeLessThan(ids.indexOf('waterway'))
    expect(hillshade).toBeLessThan(ids.indexOf('building'))
    expect(hillshade).toBeLessThan(ids.indexOf('label_country_1'))
    expect(themed.sources['terrain-dem']).toMatchObject({ type: 'raster-dem', encoding: 'terrarium', tiles: [TILES] })
    expect(themed.terrain).toEqual({ source: 'terrain-dem', exaggeration: 2 })
  })

  it("utilise deux sources d'altitude distinctes (mêmes tuiles) pour l'ombrage et le terrain 3D, avec une seule attribution", () => {
    const themed = themeMapStyle(positron(), TILES)
    const hillshade = themed.layers.find((layer) => layer.id === 'hillshade') as { source: string }
    expect(hillshade.source).toBe('hillshade-dem')
    expect(hillshade.source).not.toBe(themed.terrain?.source)
    expect(themed.sources['hillshade-dem']).toMatchObject({ type: 'raster-dem', encoding: 'terrarium', tiles: [TILES] })
    const attributions = ['terrain-dem', 'hillshade-dem'].filter((id) => (themed.sources[id] as { attribution?: string }).attribution)
    expect(attributions).toEqual(['terrain-dem'])
  })

  it('range le relief en dernier quand le style n\'a ni ligne, ni bâtiment, ni étiquette', () => {
    const themed = themeMapStyle({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background' }] }, TILES)
    expect(themed.layers.map((layer) => layer.id)).toEqual(['background', 'hillshade'])
    expect((themed.layers[0] as { paint: Record<string, unknown> }).paint['background-color']).toBe(MAP_COLORS.land)
  })
})
