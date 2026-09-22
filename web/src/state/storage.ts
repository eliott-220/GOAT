import type { User } from '../core/models'

/** Persistance locale du profil, en attendant un vrai compte côté serveur. */
export interface ProfileStore {
  load(): User | undefined
  save(user: User): void
  clear(): void
}

const KEY = 'goat.me.v1'

export class LocalProfileStore implements ProfileStore {
  load(): User | undefined {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as User) : undefined
    } catch {
      return undefined // stockage indisponible (navigation privée…) ou données corrompues
    }
  }

  save(user: User): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(user))
    } catch {
      // quota dépassé ou stockage indisponible : le profil vivra le temps de la session
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // rien à faire
    }
  }
}

export class MemoryProfileStore implements ProfileStore {
  private user?: User

  load(): User | undefined {
    return this.user
  }

  save(user: User): void {
    this.user = user
  }

  clear(): void {
    this.user = undefined
  }
}
