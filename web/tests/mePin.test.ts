import { describe, expect, it } from 'vitest'
import { hasMePin, type PresencePin } from '../src/core/models'

function pin(isMe: boolean): PresencePin {
  return {
    userID: isMe ? 'me' : `other-${Math.random()}`,
    firstName: 'X',
    sportIDs: ['ski'],
    coordinate: { latitude: 0, longitude: 0 },
    status: 'active',
    isMe,
    isVisibleToOthers: true,
  }
}

describe('hasMePin', () => {
  it('faux sans aucun pin', () => {
    expect(hasMePin([])).toBe(false)
  })

  it("faux quand seuls d'autres pins sont présents", () => {
    expect(hasMePin([pin(false), pin(false)])).toBe(false)
  })

  it('vrai dès que mon propre pin est présent, peu importe sa position dans la liste', () => {
    expect(hasMePin([pin(false), pin(true), pin(false)])).toBe(true)
  })
})
