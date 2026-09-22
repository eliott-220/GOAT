import { describe, expect, it } from 'vitest'
import type { FeedItem } from '../src/core/models'
import { describeFeedItem } from '../src/ui/feedFormat'

describe('describeFeedItem', () => {
  it('record "longestSession" nomme le sport et affiche la durée', () => {
    const item: FeedItem = { id: '1', kind: 'record', at: 0, userID: 'u', firstName: 'Léa', sportID: 'ski', recordType: 'longestSession', durationMs: 90 * 60_000 }
    const d = describeFeedItem(item)
    expect(d.icon).toBe('trophy')
    expect(d.tone).toBe('gold')
    expect(d.title).toBe('Léa bat son record de Ski')
    expect(d.subtitle).toBe('1 h 30')
  })

  it('record "milestone" annonce le nombre de sessions', () => {
    const item: FeedItem = { id: '2', kind: 'record', at: 0, userID: 'u', firstName: 'Théo', sportID: 'running', recordType: 'milestone', sessionCount: 25 }
    const d = describeFeedItem(item)
    expect(d.title).toBe('Théo passe la barre des 25 sessions')
    expect(d.subtitle).toBe('Course à pied')
  })

  it('newSession nomme la personne et le sport, ton vert', () => {
    const item: FeedItem = { id: '3', kind: 'newSession', at: 0, userID: 'u', firstName: 'Sam', sportID: 'surf' }
    const d = describeFeedItem(item)
    expect(d.tone).toBe('green')
    expect(d.title).toContain('Sam')
    expect(d.title).toContain('Surf')
  })

  it('allianceFormed nomme les deux personnes', () => {
    const item: FeedItem = { id: '4', kind: 'allianceFormed', at: 0, userAID: 'a', userAName: 'A', userBID: 'b', userBName: 'B' }
    expect(describeFeedItem(item).title).toBe('A et B sont maintenant Alliés')
  })

  it('tribuCreated nomme la tribu et son créateur', () => {
    const item: FeedItem = { id: '5', kind: 'tribuCreated', at: 0, tribuID: 't', tribuName: 'Poudreuse', creatorID: 'c', creatorName: 'Léa' }
    expect(describeFeedItem(item).title).toBe('Léa a créé la tribu « Poudreuse »')
  })
})
