import { describe, expect, it } from 'vitest'
import { BackendError } from '../src/core/backend'
import { populate } from '../src/core/demo'
import { distance } from '../src/core/geohash'
import { InMemoryBackend } from '../src/core/memoryBackend'
import type { User, VisibilityScope } from '../src/core/models'
import { PUBLIC_PRECISION } from '../src/core/geohash'

const T0 = 1_800_000_000_000

function makeClock(start = T0) {
  let current = start
  return { now: () => current, advance: (minutes: number) => void (current += minutes * 60_000) }
}

let counter = 0
async function register(backend: InMemoryBackend, name: string, sports = ['ski'], scope: VisibilityScope = 'everyone'): Promise<User> {
  const user: User = {
    id: `u-${name}-${counter++}`,
    firstName: name,
    bio: '',
    sports: sports.map((sportID) => ({ sportID, isPrimary: false })),
    visibility: { scope, isInvisible: false, lingerMinutes: 15 },
    joinedAt: T0,
  }
  await backend.upsert(user)
  return user
}

async function startWithPosition(backend: InMemoryBackend, user: User, sport = 'ski') {
  const session = await backend.startSession(user.id, sport)
  await backend.updatePosition(session.id, 45.9, 6.8)
  return session
}

const rejectsWith = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(() => undefined, (e: unknown) => e)
  expect(error).toBeInstanceOf(BackendError)
  expect((error as BackendError).code).toBe(code)
}

describe('sessions & position', () => {
  it('arrondit la position côté serveur', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    const session = await backend.startSession(a.id, 'ski')
    await backend.updatePosition(session.id, 45.923712, 6.869433)

    const [pin] = await backend.pins(b.id)
    const exact = { latitude: 45.923712, longitude: 6.869433 }
    expect(pin!.coordinate).not.toEqual(exact)
    expect(distance(pin!.coordinate, exact)).toBeLessThan(150)
    expect((await backend.activeSessions(a.id))[0]!.geohash).toHaveLength(PUBLIC_PRECISION)
  })

  it("une session sans position n'affiche aucun pin", async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await backend.startSession(a.id, 'ski')
    expect(await backend.pins(b.id)).toEqual([])
  })

  it('plusieurs sports en même temps, mais pas deux fois le même', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A', ['ski', 'trail'])
    const ski = await backend.startSession(a.id, 'ski')
    await backend.startSession(a.id, 'trail')
    expect((await backend.startSession(a.id, 'ski')).id).toBe(ski.id)
    expect(await backend.activeSessions(a.id)).toHaveLength(2)
  })

  it('refuse un sport hors profil', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A', ['ski'])
    await rejectsWith(backend.startSession(a.id, 'surf'), 'invalid')
  })

  it('un seul pin par utilisateur même avec plusieurs sessions', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A', ['ski', 'trail'])
    const b = await register(backend, 'B')
    await startWithPosition(backend, a, 'ski')
    await startWithPosition(backend, a, 'trail')
    const pins = await backend.pins(b.id)
    expect(pins).toHaveLength(1)
    expect(new Set(pins[0]!.sportIDs)).toEqual(new Set(['ski', 'trail']))
  })

  it("un sport n'apparaît qu'une fois sur un pin (session récente + nouvelle session du même sport)", async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A', ['ski', 'trail'])
    const b = await register(backend, 'B')
    const first = await startWithPosition(backend, a, 'ski')
    await backend.stopSession(first.id)
    clock.advance(5)
    await startWithPosition(backend, a, 'ski') // nouvelle session pendant que la précédente est encore "récemment active"
    await startWithPosition(backend, a, 'trail')
    const [pin] = await backend.pins(b.id)
    expect(pin!.sportIDs).toHaveLength(2)
    expect(new Set(pin!.sportIDs)).toEqual(new Set(['ski', 'trail']))
  })

  it('une session arrêtée reste visible le temps du délai puis disparaît', async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    const session = await startWithPosition(backend, a)
    await backend.stopSession(session.id)

    expect((await backend.pins(b.id))[0]!.status).toBe('recentlyActive')
    clock.advance(16)
    expect(await backend.pins(b.id)).toEqual([])
  })

  it("mon propre pin disparaît après le délai et l'ancien historique ne crée pas de pin", async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A')
    backend.backfillHistory(a.id, 'ski', 'u0h4s5p', 3)
    expect(await backend.pins(a.id)).toEqual([])

    const session = await startWithPosition(backend, a)
    expect((await backend.pins(a.id))[0]!.status).toBe('active')
    await backend.stopSession(session.id)
    expect((await backend.pins(a.id))[0]!.status).toBe('recentlyActive')
    clock.advance(16)
    expect(await backend.pins(a.id)).toEqual([])
  })

  it('la bascule invisible s\'applique pendant une session active', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await startWithPosition(backend, a)
    expect(await backend.pins(b.id)).toHaveLength(1)

    await backend.upsert({ ...a, visibility: { ...a.visibility, isInvisible: true } })
    expect(await backend.pins(b.id)).toEqual([])
    expect((await backend.pins(a.id))[0]!.isVisibleToOthers).toBe(false) // je me vois toujours, en grisé
  })
})

describe('alliances', () => {
  it("exige l'acceptation du destinataire", async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    const alliance = await backend.requestAlliance(a.id, b.id)

    await rejectsWith(backend.respondToAlliance(alliance.id, a.id, true), 'notAllowed') // le demandeur ne peut pas accepter
    let overview = await backend.allianceOverview(b.id)
    expect(overview.incoming).toHaveLength(1)
    expect(overview.allies).toEqual([])

    await backend.respondToAlliance(alliance.id, b.id, true)
    overview = await backend.allianceOverview(b.id)
    expect(overview.allies.map((e) => e.other.firstName)).toEqual(['A'])
  })

  it('une demande refusée disparaît et les doublons sont rejetés', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    const alliance = await backend.requestAlliance(a.id, b.id)
    await rejectsWith(backend.requestAlliance(b.id, a.id), 'alreadyExists')
    await backend.respondToAlliance(alliance.id, b.id, false)
    const overview = await backend.allianceOverview(a.id)
    expect(overview.outgoing).toEqual([])
    expect(overview.allies).toEqual([])
  })

  it('"mes Alliances" : le pin n\'est vu que par les alliés', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A', ['ski'], 'myAlliances')
    const friend = await register(backend, 'Ami')
    const stranger = await register(backend, 'Inconnu')
    await startWithPosition(backend, a)

    const request = await backend.requestAlliance(friend.id, a.id)
    await backend.respondToAlliance(request.id, a.id, true)

    expect(await backend.pins(friend.id)).toHaveLength(1)
    expect(await backend.pins(stranger.id)).toEqual([])
  })
})

describe('modération', () => {
  it('un blocage retire les deux profils partout et rompt les Alliances', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await startWithPosition(backend, a)
    await startWithPosition(backend, b)
    const request = await backend.requestAlliance(a.id, b.id)
    await backend.respondToAlliance(request.id, b.id, true)

    await backend.block(b.id, a.id)

    expect((await backend.pins(a.id)).map((p) => p.userID)).toEqual([a.id])
    expect((await backend.pins(b.id)).map((p) => p.userID)).toEqual([b.id])
    expect(await backend.profile(b.id, a.id)).toBeUndefined()
    expect(await backend.profile(a.id, b.id)).toBeUndefined()
    expect((await backend.allianceOverview(a.id)).allies).toEqual([])

    await backend.unblock(b.id, a.id)
    expect(await backend.pins(a.id)).toHaveLength(2)
  })

  it('un profil bloqué n\'apparaît jamais dans les Echos', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    backend.backfillHistory(a.id, 'ski', 'u0h4s5p', 3)
    backend.backfillHistory(b.id, 'ski', 'u0h4s5p', 3)

    const echoes = await backend.echoes(a.id)
    expect(echoes.map((e) => e.user.firstName)).toEqual(['B'])
    expect(echoes[0]!.sportID).toBe('ski')

    await backend.block(b.id, a.id)
    expect(await backend.echoes(a.id)).toEqual([])
    expect(await backend.echoes(b.id)).toEqual([])
  })

  it('les Echos sautent les profils déjà liés et ceux réglés sur "mes Alliances"', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const linked = await register(backend, 'Lié')
    const closed = await register(backend, 'Fermé', ['ski'], 'myAlliances')
    for (const u of [a, linked, closed]) backend.backfillHistory(u.id, 'ski', 'u0h4s5p', 3)

    expect((await backend.echoes(a.id)).map((e) => e.user.firstName)).toEqual(['Lié'])
    await backend.requestAlliance(a.id, linked.id)
    expect(await backend.echoes(a.id)).toEqual([])
  })

  it('enregistre les signalements', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await backend.report(b.id, a.id, 'Spam')
    expect(backend.reportCount).toBe(1)
  })
})

describe('tribus', () => {
  it('cycle de vie : créer, rejoindre, quitter, disparaître quand vide', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    const tribu = await backend.createTribu('  Poudreuse  ', a.id)
    expect(tribu.name).toBe('Poudreuse')

    expect((await backend.tribus(b.id)).discover.map((t) => t.name)).toEqual(['Poudreuse'])
    await backend.joinTribu(tribu.id, b.id)
    expect((await backend.tribus(b.id)).mine[0]!.memberIDs).toHaveLength(2)

    await backend.leaveTribu(tribu.id, b.id)
    await backend.leaveTribu(tribu.id, a.id)
    const overview = await backend.tribus(a.id)
    expect(overview.mine).toEqual([])
    expect(overview.discover).toEqual([])
  })
})

describe('démo', () => {
  it('produit une carte vivante et des demandes de bienvenue', async () => {
    const backend = new InMemoryBackend({ botReplyDelayMs: 1000, welcomeRequestCount: 2 })
    const simulator = await populate(backend, { botCount: 60, seed: 7 })
    for (let i = 0; i < 20; i++) await simulator.tick()

    const me = await register(backend, 'Moi', ['ski', 'running'])
    const pins = await backend.pins(me.id)
    expect(pins.length).toBeGreaterThan(5)
    expect(pins.every((p) => p.coordinate.latitude > 40 && p.coordinate.latitude < 52 && p.coordinate.longitude > -6 && p.coordinate.longitude < 10)).toBe(true)
    expect((await backend.allianceOverview(me.id)).incoming).toHaveLength(2)
  })

  it('un utilisateur de démo accepte la demande après le délai', async () => {
    const backend = new InMemoryBackend({ botReplyDelayMs: 50 })
    await populate(backend, { botCount: 5, seed: 1 })
    const me = await register(backend, 'Moi')
    const botID = (await backend.pins(me.id))[0]!.userID
    await backend.requestAlliance(me.id, botID)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect((await backend.allianceOverview(me.id)).allies).toHaveLength(1)
  })
})
