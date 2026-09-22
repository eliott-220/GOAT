import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AttributionControl, Map as MapLibreMap, Marker, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 déduit l'URL de son worker de sa propre URL de module : faux dès qu'un bundler déplace ou fusionne
// la librairie. On lui fournit donc explicitement un worker empaqueté par Vite (avec ses dépendances).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { clusterPins, type MapMarker } from '../core/clustering'
import type { GeoCoordinate } from '../core/geohash'
import type { PresencePin } from '../core/models'
import { CATEGORY_COLORS, CATEGORY_EMOJI, CATEGORY_LABELS, sportById, sportColor, sportName } from '../core/sports'
import { themeMapStyle } from './mapStyle'

setWorkerUrl(workerUrl)

/**
 * Fond de carte vectoriel libre (OpenStreetMap servi par OpenFreeMap, style clair « positron »), sans clé d'API.
 * On le récupère pour l'habiller aux couleurs de GOAT (voir `themeMapStyle`).
 * À remplacer par un fournisseur sous contrat (MapTiler, Stadia…) avant une vraie mise en production.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
/** Relief : tuiles d'altitude ouvertes (AWS Terrain Tiles, encodage « terrarium »). */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

/** Zone de lancement du MVP : la France métropolitaine (Corse comprise) en 3D, inclinée pour lire le relief. */
export const FRANCE_VIEW = { center: [3.0, 46.2] as [number, number], zoom: 4.7, pitch: 45, bearing: 0 }
const FRANCE_BOUNDS: [[number, number], [number, number]] = [
  [-12, 38],
  [17, 56],
]
/** Inclinaison de la vue « relief » (l'autre vue est à plat, vue du dessus). */
const RELIEF_PITCH = 55

export interface MapViewHandle {
  resetFrance(): void
  flyTo(coordinate: GeoCoordinate): void
  /** Remet le nord en haut de l'écran. */
  resetNorth(): void
  /** Bascule entre la vue à plat et la vue inclinée (relief). */
  togglePitch(): void
}

export interface CameraState {
  bearing: number
  pitch: number
}

interface Props {
  pins: PresencePin[]
  highlightedSport?: string
  /** Faux quand l'onglet Carte est masqué : la carte est redimensionnée au retour. */
  active: boolean
  onPinClick(pin: PresencePin): void
  /** Appelé à chaque rotation ou inclinaison (boussole, bouton de relief). */
  onCameraChange?(camera: CameraState): void
  /**
   * Point "ma position" affiché même hors session (undefined pour le masquer, ex. dès qu'un pin de session me
   * représente déjà). Purement local : cette position ne vient jamais du backend et n'est jamais envoyée à personne.
   */
  myCoordinate?: GeoCoordinate
}

interface MarkerRecord {
  marker: Marker
  item: MapMarker
}

/** À l'échelle du pays les pins de taille normale se chevauchent : on les réduit quand on est loin. */
const pinScale = (zoom: number): number => (zoom < 5.6 ? 0.62 : zoom < 8 ? 0.82 : 1)

/** Zoom arrondi au quart : sert à recalculer le regroupement sans le refaire à chaque pixel de zoom. */
const roundZoom = (zoom: number): number => Math.round(zoom * 4) / 4

/** Le style habillé ; à défaut (hors connexion, style illisible), l'URL brute pour que MapLibre fasse de son mieux. */
async function loadStyle(): Promise<StyleSpecification | string> {
  try {
    const response = await fetch(STYLE_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return themeMapStyle((await response.json()) as StyleSpecification, TERRAIN_TILES)
  } catch (error) {
    console.warn('[carte] style non habillé', error)
    return STYLE_URL
  }
}

/**
 * Dessine un pin : une tête ronde (couleur du sport) avec sa pointe, un point vert s'il est en direct, un « +N » s'il pratique
 * plusieurs sports. Mon propre pin est doré, pulse, et porte une étiquette.
 * Contenu généré uniquement à partir du catalogue de sports et de nombres (`textContent` pour le reste) : pas de texte utilisateur.
 */
function renderPin(root: HTMLElement, pin: PresencePin, highlighted?: string): void {
  const button = root.firstElementChild as HTMLButtonElement
  const sportID = highlighted && pin.sportIDs.includes(highlighted) ? highlighted : pin.sportIDs[0]!
  root.style.zIndex = pin.isMe ? '2' : pin.status === 'active' ? '1' : '0'
  button.style.setProperty('--pin-color', sportColor(sportID))
  button.dataset.me = String(pin.isMe)
  button.dataset.dim = String(pin.status === 'recentlyActive' || !pin.isVisibleToOthers)
  button.setAttribute(
    'aria-label',
    pin.isMe ? 'Ma position approximative' : `${pin.firstName}, ${pin.sportIDs.map(sportName).join(', ')}`,
  )
  const pulse = pin.isMe && pin.status === 'active' ? '<span class="pin-pulse"></span>' : ''
  const live = pin.status === 'active' ? '<span class="pin-live"></span>' : ''
  const more = pin.sportIDs.length > 1 ? `<span class="pin-more">+${pin.sportIDs.length - 1}</span>` : ''
  button.innerHTML = `${pulse}<span class="pin-head"><span class="pin-emoji">${sportById(sportID)?.emoji ?? '🏃'}</span></span>${live}${more}`

  root.querySelector('.pin-label')?.remove()
  if (pin.isMe) {
    const label = document.createElement('div')
    label.className = 'pin-label'
    const caption = document.createElement('small')
    caption.textContent = 'MA POSITION'
    const name = document.createElement('b')
    name.textContent = sportName(sportID)
    label.append(caption, name)
    root.appendChild(label)
  }
}

/**
 * Dessine un groupe de pins rassemblés (dézoomé) : une tête plus grande à la couleur de la catégorie, avec le
 * nombre de pratiquants rassemblés sur le badge (vert) qui porte un simple point sur un pin isolé.
 */
function renderCluster(root: HTMLElement, cluster: Extract<MapMarker, { kind: 'cluster' }>): void {
  const button = root.firstElementChild as HTMLButtonElement
  root.style.zIndex = cluster.hasActive ? '1' : '0'
  button.style.setProperty('--pin-color', CATEGORY_COLORS[cluster.category])
  button.dataset.me = 'false'
  button.dataset.dim = String(!cluster.hasActive)
  const categoryLabel = CATEGORY_LABELS[cluster.category].toLowerCase()
  button.setAttribute('aria-label', `${cluster.count} pratiquants de ${categoryLabel} rassemblés ici : toucher pour zoomer et les séparer`)
  button.innerHTML = `<span class="pin-head"><span class="pin-emoji">${CATEGORY_EMOJI[cluster.category]}</span></span><span class="pin-count">${cluster.count}</span>`
  root.querySelector('.pin-label')?.remove()
}

export const MapView = forwardRef<MapViewHandle, Props>(function MapView(
  { pins, highlightedSport, active, onPinClick, onCameraChange, myCoordinate },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, MarkerRecord>())
  const meMarkerRef = useRef<Marker | null>(null)
  /** La carte se crée une fois le style récupéré : les marqueurs attendent ce signal. */
  const [mapReady, setMapReady] = useState(false)
  /** Arrondi au quart de zoom : suffit à refaire le regroupement des pins sans le recalculer à chaque pixel. */
  const [clusterZoom, setClusterZoom] = useState(roundZoom(FRANCE_VIEW.zoom))
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick
  const onCameraChangeRef = useRef(onCameraChange)
  onCameraChangeRef.current = onCameraChange

  useImperativeHandle(
    ref,
    () => ({
      resetFrance: () => {
        mapRef.current?.easeTo({ ...FRANCE_VIEW, duration: 900 })
      },
      flyTo: (coordinate) => {
        mapRef.current?.flyTo({ center: [coordinate.longitude, coordinate.latitude], zoom: 12, pitch: RELIEF_PITCH, duration: 1500 })
      },
      resetNorth: () => {
        mapRef.current?.easeTo({ bearing: 0, duration: 400 })
      },
      togglePitch: () => {
        const map = mapRef.current
        if (map) map.easeTo({ pitch: map.getPitch() > 10 ? 0 : RELIEF_PITCH, duration: 500 })
      },
    }),
    [],
  )

  // Création de la carte (une seule fois, dès que le style habillé est prêt).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let map: MapLibreMap | undefined
    const markers = markersRef.current

    void loadStyle().then((style) => {
      if (cancelled) return
      map = new MapLibreMap({
        container,
        style,
        ...FRANCE_VIEW,
        minZoom: 3.5,
        maxZoom: 18,
        maxPitch: 75,
        maxBounds: FRANCE_BOUNDS,
        renderWorldCopies: false,
        attributionControl: false,
      })
      map.addControl(new AttributionControl({ compact: true }), 'bottom-left')
      // L'attribution s'ouvre d'office (et se rouvre à l'initialisation) : elle masquerait le bas de la carte. Une fois la carte chargée
      // on la replie en bouton « i » ; un toucher suffit à la lire, et MapLibre la replie de toute façon au premier geste.
      map.once('load', () => {
        const attribution = container.querySelector('.maplibregl-ctrl-attrib')
        attribution?.removeAttribute('open')
        attribution?.classList.remove('maplibregl-compact-show')
      })

      const created = map
      const applyScale = () => {
        const zoom = created.getZoom()
        container.style.setProperty('--pin-scale', String(pinScale(zoom)))
        setClusterZoom((current) => {
          const next = roundZoom(zoom)
          return next === current ? current : next
        })
      }
      applyScale()
      created.on('zoom', applyScale)
      const reportCamera = () => onCameraChangeRef.current?.({ bearing: created.getBearing(), pitch: created.getPitch() })
      created.on('rotate', reportCamera)
      created.on('pitch', reportCamera)
      created.on('error', (event) => console.warn('[carte]', event.error?.message ?? event))

      mapRef.current = created
      if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = created // débogage en développement
      setMapReady(true)
    })

    return () => {
      cancelled = true
      for (const { marker } of markers.values()) marker.remove()
      markers.clear()
      meMarkerRef.current?.remove()
      meMarkerRef.current = null
      map?.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // Synchronise les marqueurs avec les pins (créés / déplacés / retirés), regroupés par catégorie de sport une fois
  // dézoomé : voir core/clustering.ts. Recalculé à chaque cran de zoom (clusterZoom), pas seulement quand les pins changent.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const markers = markersRef.current
    const seen = new Set<string>()
    const items = clusterPins(pins, clusterZoom, highlightedSport)

    for (const item of items) {
      seen.add(item.id)
      let record = markers.get(item.id)
      if (!record) {
        // Le Marker de MapLibre pilote le `transform` de son élément racine : les styles vont sur l'enfant.
        const root = document.createElement('div')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = item.kind === 'cluster' ? 'pin pin-cluster' : 'pin'
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          const current = markers.get(item.id)?.item
          if (!current) return
          if (current.kind === 'pin') onPinClickRef.current(current.pin)
          // Cluster : on zoome dessus plutôt que d'ouvrir un profil, pour le séparer en pins individuels.
          else map.easeTo({ center: [current.coordinate.longitude, current.coordinate.latitude], zoom: Math.min(map.getZoom() + 3, 18), duration: 500 })
        })
        root.appendChild(button)
        const isMe = item.kind === 'pin' && item.pin.isMe
        const coordinate = item.kind === 'pin' ? item.pin.coordinate : item.coordinate
        // Ancré par sa pointe : la pointe du pin touche la position (approximative) du ou des pratiquants.
        const marker = new Marker({ element: root, anchor: 'bottom', opacityWhenCovered: isMe ? '1' : '0.25' }).setLngLat([coordinate.longitude, coordinate.latitude]).addTo(map)
        record = { marker, item }
        markers.set(item.id, record)
      }
      record.item = item
      const coordinate = item.kind === 'pin' ? item.pin.coordinate : item.coordinate
      record.marker.setLngLat([coordinate.longitude, coordinate.latitude])
      if (item.kind === 'pin') renderPin(record.marker.getElement(), item.pin, highlightedSport)
      else renderCluster(record.marker.getElement(), item)
    }

    for (const [id, record] of markers) {
      if (!seen.has(id)) {
        record.marker.remove()
        markers.delete(id)
      }
    }
  }, [pins, highlightedSport, mapReady, clusterZoom])

  // Point "ma position" (hors session) : créé/déplacé/retiré indépendamment des pins de session.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (!myCoordinate) {
      meMarkerRef.current?.remove()
      meMarkerRef.current = null
      return
    }

    if (!meMarkerRef.current) {
      const dot = document.createElement('div')
      dot.className = 'me-locator'
      dot.innerHTML = '<span class="me-locator-pulse"></span><span class="me-locator-dot"></span>'
      dot.setAttribute('role', 'img')
      dot.setAttribute('aria-label', 'Ta position actuelle (visible seulement par toi)')
      meMarkerRef.current = new Marker({ element: dot, anchor: 'center' }).setLngLat([myCoordinate.longitude, myCoordinate.latitude]).addTo(map)
    } else {
      meMarkerRef.current.setLngLat([myCoordinate.longitude, myCoordinate.latitude])
    }
  }, [myCoordinate, mapReady])

  useEffect(() => {
    if (active) mapRef.current?.resize()
  }, [active])

  return <div ref={containerRef} className="map" />
})
