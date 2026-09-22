import type { GeoCoordinate } from '../core/geohash'

export type Authorization = 'unknown' | 'granted' | 'denied' | 'unsupported'

export interface LocationSnapshot {
  authorization: Authorization
  coordinate?: GeoCoordinate
  /** Vrai quand une position de démonstration remplace la géolocalisation réelle. */
  simulated: boolean
}

/**
 * Enveloppe de la géolocalisation du navigateur pensée pour la batterie :
 * - précision réduite (la position diffusée est de toute façon arrondie à ~150 m) ;
 * - uniquement au premier plan, jamais en tâche de fond ;
 * - le suivi n'est démarré qu'avec une session active et coupé à la fin de la dernière.
 */
export class LocationProvider {
  authorization: Authorization
  coordinate?: GeoCoordinate
  simulated = false
  /** Appelé à chaque changement d'état (branché par `AppState`). */
  onChange: () => void = () => undefined

  private watchId?: number
  private permission?: PermissionStatus

  constructor() {
    this.authorization = typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'unknown' : 'unsupported'
    void this.observePermission()
  }

  snapshot(): LocationSnapshot {
    return { authorization: this.authorization, coordinate: this.coordinate, simulated: this.simulated }
  }

  get isAuthorized(): boolean {
    return this.authorization === 'granted'
  }

  get isDenied(): boolean {
    return this.authorization === 'denied'
  }

  private async observePermission(): Promise<void> {
    try {
      if (!this.permission) {
        this.permission = await navigator.permissions?.query({ name: 'geolocation' })
        this.permission?.addEventListener('change', () => this.syncPermission())
      }
      this.syncPermission()
    } catch {
      // API absente (anciens Safari) : l'état est appris au premier appel de géolocalisation.
    }
  }

  private syncPermission(): void {
    if (this.simulated || !this.permission) return
    const { state } = this.permission
    this.setAuthorization(state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'unknown')
  }

  private setAuthorization(value: Authorization): void {
    if (this.authorization === value) return
    this.authorization = value
    this.onChange()
  }

  /** Position ponctuelle (déclenche la demande d'autorisation du navigateur). Non conservée. */
  currentPosition(): Promise<GeoCoordinate | undefined> {
    if (this.simulated) return Promise.resolve(this.coordinate)
    if (this.authorization === 'unsupported') return Promise.resolve(undefined)
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.setAuthorization('granted')
          resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) this.setAuthorization('denied')
          resolve(undefined)
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
      )
    })
  }

  async requestPermission(): Promise<Authorization> {
    await this.currentPosition()
    return this.authorization
  }

  start(): void {
    if (this.simulated || !this.isAuthorized || this.watchId !== undefined) return
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        this.onChange()
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) this.setAuthorization('denied')
      },
      { enableHighAccuracy: false, maximumAge: 10_000, timeout: 30_000 },
    )
  }

  stop(): void {
    if (this.watchId !== undefined) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = undefined
    }
    if (!this.simulated && this.coordinate) {
      this.coordinate = undefined // ne jamais réutiliser une position périmée à la session suivante
      this.onChange()
    }
  }

  /** Outil de démo : impose une position (ou repasse sur la géolocalisation réelle avec `undefined`). */
  simulate(coordinate?: GeoCoordinate): void {
    this.stop()
    this.simulated = coordinate !== undefined
    this.coordinate = coordinate
    if (coordinate) this.authorization = 'granted'
    else void this.observePermission()
    this.onChange()
  }
}
