import type { LayerSpecification, RasterDEMSourceSpecification, StyleSpecification } from 'maplibre-gl'

/**
 * Palette « neige » de la carte : blanc-gris froid et relief ombré, textes discrets. Le fond reste clair pour que les pins
 * et l'interface sombre (cartes, barre d'onglets) ressortent, comme sur la maquette.
 */
export const MAP_COLORS = {
  land: '#eceff3',
  water: '#d2dae5',
  green: '#e2e6eb',
  building: '#e1e5ea',
  border: '#8f99a8',
  shadow: '#6f7a8b',
  accent: '#98a3b3',
  halo: 'rgba(246,248,251,0.92)',
} as const

/** MapLibre recommande deux sources distinctes (mêmes tuiles) pour le terrain 3D et pour l'ombrage : meilleure qualité de rendu. */
const TERRAIN_SOURCE = 'terrain-dem'
const HILLSHADE_SOURCE = 'hillshade-dem'

/** Couleur du texte selon le type d'étiquette (les identifiants sont ceux du style « positron » d'OpenFreeMap). */
function labelColor(id: string): string {
  if (id.startsWith('label_country')) return '#4b5566'
  if (id === 'label_city_capital') return '#3f4958'
  if (id.startsWith('label_city') || id === 'label_town') return '#566071'
  if (id === 'label_state') return '#8a94a3'
  if (id.includes('water') || id.startsWith('waterway')) return '#8a9bb3'
  if (id.startsWith('highway')) return '#8a94a3'
  return '#7d8797'
}

/** Tuiles d'altitude au format « terrarium » (AWS Terrain Tiles). */
const demSource = (tiles: string, attribution?: string): RasterDEMSourceSpecification => ({
  type: 'raster-dem',
  tiles: [tiles],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  ...(attribution ? { attribution } : {}),
})

function recolor(layer: LayerSpecification): void {
  // Selon le type de couche, les propriétés de `paint` diffèrent : on les traite comme un simple dictionnaire.
  const paint = (layer.paint ??= {}) as Record<string, unknown>
  const { id } = layer

  if (layer.type === 'background') paint['background-color'] = MAP_COLORS.land
  else if (layer.type === 'fill') {
    if (id === 'water') paint['fill-color'] = MAP_COLORS.water
    else if (id === 'building') Object.assign(paint, { 'fill-color': MAP_COLORS.building, 'fill-outline-color': '#d3d8df' })
    else if (id.includes('glacier') || id.includes('ice')) paint['fill-color'] = '#ffffff'
    else if (id === 'park' || id.startsWith('landcover') || id.startsWith('landuse')) paint['fill-color'] = MAP_COLORS.green
  } else if (layer.type === 'line') {
    if (id.startsWith('boundary')) paint['line-color'] = MAP_COLORS.border
  } else if (layer.type === 'symbol') {
    paint['text-color'] = labelColor(id)
    paint['text-halo-color'] = MAP_COLORS.halo
    // Noms de pays : majuscules espacées en graisse normale plutôt qu'en gras, pour ne pas écraser la carte.
    if (id.startsWith('label_country')) {
      const layout = (layer.layout ??= {}) as Record<string, unknown>
      Object.assign(layout, { 'text-font': ['Noto Sans Regular'], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12 })
    }
  }
}

/**
 * Habille un style OpenFreeMap (positron) aux couleurs de GOAT et y ajoute le relief : ombrage des reliefs (`hillshade`)
 * et terrain 3D à partir de tuiles d'altitude au format « terrarium ». Ne modifie pas le style reçu.
 *
 * Le relief est inséré sous les routes, frontières et étiquettes (mais sur l'eau, dont les fonds marins sont ombrés aussi).
 */
export function themeMapStyle(source: StyleSpecification, terrainTiles: string): StyleSpecification {
  const style = structuredClone(source)
  for (const layer of style.layers) recolor(layer)

  style.sources[TERRAIN_SOURCE] = demSource(terrainTiles, 'Terrain Tiles (Mapzen, USGS, NASA SRTM)')
  style.sources[HILLSHADE_SOURCE] = demSource(terrainTiles) // sans attribution : celle du terrain suffit (pas de doublon)
  const firstOverlay = style.layers.findIndex((layer) => layer.type === 'line' || layer.type === 'symbol' || layer.id === 'building')
  style.layers.splice(firstOverlay < 0 ? style.layers.length : firstOverlay, 0, {
    id: 'hillshade',
    type: 'hillshade',
    source: HILLSHADE_SOURCE,
    paint: {
      'hillshade-exaggeration': 0.75,
      'hillshade-shadow-color': MAP_COLORS.shadow,
      'hillshade-highlight-color': '#ffffff',
      'hillshade-accent-color': MAP_COLORS.accent,
    },
  })
  style.terrain = { source: TERRAIN_SOURCE, exaggeration: 2 }
  return style
}
