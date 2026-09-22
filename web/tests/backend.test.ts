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

describe('suivi', () => {
  it('asymétrique : suivre ne demande aucune acceptation, contrairement à une Alliance', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await backend.follow(a.id, b.id)

    expect((await backend.followOverview(a.id)).following.map((u) => u.firstName)).toEqual(['B'])
    expect((await backend.followOverview(b.id)).followers.map((u) => u.firstName)).toEqual(['A'])
    expect((await backend.followOverview(b.id)).following).toEqual([]) // B ne suit pas A en retour
    expect((await backend.profile(b.id, a.id))!.isFollowing).toBe(true)
    expect((await backend.profile(a.id, b.id))!.isFollowing).toBe(false)
  })

  it('se suivre soi-même est refusé ; suivre deux fois ne duplique rien', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await rejectsWith(backend.follow(a.id, a.id), 'invalid')
    await backend.follow(a.id, b.id)
    await backend.follow(a.id, b.id)
    expect((await backend.followOverview(a.id)).following).toHaveLength(1)
  })

  it('ne plus suivre retire le lien, sans toucher aux autres', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    const c = await register(backend, 'C')
    await backend.follow(a.id, b.id)
    await backend.follow(a.id, c.id)
    await backend.unfollow(a.id, b.id)
    expect((await backend.followOverview(a.id)).following.map((u) => u.firstName)).toEqual(['C'])
  })

  it('un blocage rompt aussi le suivi, dans les deux sens', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await backend.follow(a.id, b.id)
    await backend.follow(b.id, a.id)
    await backend.block(b.id, a.id)
    expect((await backend.followOverview(a.id)).following).toEqual([])
    expect((await backend.followOverview(a.id)).followers).toEqual([])
  })

  it('suggère en priorité les profils qui partagent un sport, jamais soi-même ni déjà suivi', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const me = await register(backend, 'Moi', ['ski'])
    const shared = await register(backend, 'PartageLeSki', ['ski', 'yoga'])
    const other = await register(backend, 'AutreSport', ['yoga'])
    await backend.follow(me.id, other.id) // déjà suivi : ne doit plus être suggéré

    const suggestions = await backend.suggestedPeople(me.id)
    const names = suggestions.map((s) => s.user.firstName)
    expect(names).toContain('PartageLeSki')
    expect(names).not.toContain('AutreSport')
    expect(names).not.toContain('Moi')
    expect(suggestions.find((s) => s.user.id === shared.id)!.sharedSportID).toBe('ski')
  })

  it("ne suggère jamais un profil bloqué, ni un profil \"mes Alliances\" à un inconnu", async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const me = await register(backend, 'Moi')
    const blocked = await register(backend, 'Bloqué')
    await register(backend, 'Fermé', ['ski'], 'myAlliances')
    await backend.block(blocked.id, me.id)

    const names = (await backend.suggestedPeople(me.id)).map((s) => s.user.firstName)
    expect(names).not.toContain('Bloqué')
    expect(names).not.toContain('Fermé')
  })

  it('la recherche trouve par prénom, insensible à la casse et aux accents, jamais soi-même', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const me = await register(backend, 'Moi')
    await register(backend, 'Léa')
    await register(backend, 'Théo')

    expect((await backend.searchPeople(me.id, 'lea')).map((u) => u.firstName)).toEqual(['Léa'])
    expect((await backend.searchPeople(me.id, 'THÉO')).map((u) => u.firstName)).toEqual(['Théo'])
    expect(await backend.searchPeople(me.id, 'oi')).toEqual([]) // "Moi" ne se trouve pas soi-même
    expect(await backend.searchPeople(me.id, '')).toEqual([])
  })
})

describe('actualité', () => {
  it("une première session n'est jamais un record : il en faut au moins deux pour comparer", async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A')
    const s = await backend.startSession(a.id, 'ski')
    clock.advance(30)
    await backend.stopSession(s.id)

    expect(await backend.feed(a.id)).toEqual([])
  })

  it('une session plus longue que toutes les précédentes du même sport devient un record ; une plus courte non', async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A', ['ski'])

    const first = await backend.startSession(a.id, 'ski')
    clock.advance(30)
    await backend.stopSession(first.id) // 30 min, pas encore de record possible

    const second = await backend.startSession(a.id, 'ski')
    clock.advance(45)
    await backend.stopSession(second.id) // 45 min > 30 min : record

    const third = await backend.startSession(a.id, 'ski')
    clock.advance(10)
    await backend.stopSession(third.id) // 10 min < 45 min : pas un record

    const records = (await backend.feed(a.id)).filter((i) => i.kind === 'record' && i.recordType === 'longestSession')
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ durationMs: 45 * 60_000, sportID: 'ski' })
  })

  it('une étape (10 sessions terminées, tous sports confondus) déclenche un évènement "milestone"', async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A', ['ski', 'running'])
    for (let i = 0; i < 10; i++) {
      const s = await backend.startSession(a.id, i % 2 === 0 ? 'ski' : 'running') // sports variés, comptés tous ensemble
      clock.advance(5)
      await backend.stopSession(s.id)
    }
    const milestones = (await backend.feed(a.id)).filter((i) => i.kind === 'record' && i.recordType === 'milestone')
    expect(milestones).toHaveLength(1)
    expect(milestones[0]).toMatchObject({ sessionCount: 10 })
  })

  it('une session en cours apparaît, mais pas la mienne, et jamais une session déjà terminée', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const me = await register(backend, 'Moi', ['ski'])
    const other = await register(backend, 'Autre', ['ski', 'running'])
    const mine = await backend.startSession(me.id, 'ski')
    await backend.startSession(other.id, 'ski')
    const finished = await backend.startSession(other.id, 'running')
    await backend.stopSession(finished.id)

    const news = (await backend.feed(me.id)).filter((i) => i.kind === 'newSession')
    expect(news).toHaveLength(1)
    expect(news[0]).toMatchObject({ firstName: 'Autre', sportID: 'ski' })
    await backend.stopSession(mine.id) // nettoyage, non vérifié
  })

  it('une rafale de départs simultanés ne noie pas les autres évènements : les sessions sont plafonnées à un tiers du fil', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const viewer = await register(backend, 'Moi')
    await backend.createTribu('Poudreuse', viewer.id) // un évènement plus rare, mais qui doit rester visible

    for (let i = 0; i < 20; i++) {
      const bot = await register(backend, `Bot${i}`, ['ski'])
      await backend.startSession(bot.id, 'ski') // 20 départs "en même temps"
    }

    const feed = await backend.feed(viewer.id, 30)
    const news = feed.filter((i) => i.kind === 'newSession')
    const tribu = feed.filter((i) => i.kind === 'tribuCreated')
    expect(news.length).toBeLessThan(20) // pas les 20, même si tous plus "récents"
    expect(news.length).toBeLessThanOrEqual(10) // un tiers de 30
    expect(tribu).toHaveLength(1) // survit malgré la rafale
  })

  it('une Alliance formée devient un évènement, daté de son acceptation, pas de la demande', async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    const alliance = await backend.requestAlliance(a.id, b.id)
    clock.advance(120)
    await backend.respondToAlliance(alliance.id, b.id, true)

    const events = (await backend.feed(a.id)).filter((i) => i.kind === 'allianceFormed')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ userAName: 'A', userBName: 'B', at: T0 + 120 * 60_000 })
  })

  it("une demande d'Alliance en attente n'apparaît pas : seule l'acceptation est un évènement", async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    const b = await register(backend, 'B')
    await backend.requestAlliance(a.id, b.id)
    expect((await backend.feed(a.id)).filter((i) => i.kind === 'allianceFormed')).toEqual([])
  })

  it('une tribu créée devient un évènement', async () => {
    const backend = new InMemoryBackend({ now: () => T0 })
    const a = await register(backend, 'A')
    await backend.createTribu('Poudreuse', a.id)
    const events = (await backend.feed(a.id)).filter((i) => i.kind === 'tribuCreated')
    expect(events).toMatchObject([{ tribuName: 'Poudreuse', creatorName: 'A' }])
  })

  it('respecte la visibilité : rien pour un profil "mes Alliances" tant qu\'on n\'est pas alliés, rien pour un profil bloqué', async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const viewer = await register(backend, 'Moi')
    const closed = await register(backend, 'Fermé', ['ski'], 'myAlliances')
    const blocked = await register(backend, 'Bloqué', ['ski'])
    await backend.block(blocked.id, viewer.id)

    for (const user of [closed, blocked]) {
      const first = await backend.startSession(user.id, 'ski')
      clock.advance(10)
      await backend.stopSession(first.id)
      const second = await backend.startSession(user.id, 'ski')
      clock.advance(20)
      await backend.stopSession(second.id)
    }

    expect(await backend.feed(viewer.id)).toEqual([])
  })

  it('trie du plus récent au plus ancien et respecte la limite', async () => {
    const clock = makeClock()
    const backend = new InMemoryBackend({ now: clock.now })
    const a = await register(backend, 'A')
    for (let i = 0; i < 5; i++) {
      await backend.createTribu(`Tribu ${i}`, a.id)
      clock.advance(10)
    }
    const feed = await backend.feed(a.id, 3)
    expect(feed).toHaveLength(3)
    expect(feed.map((i) => i.at)).toEqual([...feed.map((i) => i.at)].sort((x, y) => y - x))
    expect(feed[0]).toMatchObject({ tribuName: 'Tribu 4' }) // le plus récent en premier
  })
})
