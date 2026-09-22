import type { FeedItem } from '../core/models'
import { sportName } from '../core/sports'
import { formatDuration } from './format'
import type { IconName } from './Icon'

export type FeedTone = 'gold' | 'green' | 'purple' | 'blue'

export interface FeedDescription {
  icon: IconName
  tone: FeedTone
  title: string
  subtitle?: string
}

/**
 * Traduit un évènement d'actualité en texte affichable. Fonction pure : ne lit rien d'autre que l'évènement (et le
 * catalogue de sports, lui aussi statique), pour rester facile à tester sans backend ni horloge.
 */
export function describeFeedItem(item: FeedItem): FeedDescription {
  switch (item.kind) {
    case 'record':
      if (item.recordType === 'longestSession') {
        return {
          icon: 'trophy',
          tone: 'gold',
          title: `${item.firstName} bat son record de ${sportName(item.sportID)}`,
          subtitle: formatDuration(item.durationMs),
        }
      }
      return {
        icon: 'star',
        tone: 'gold',
        title: `${item.firstName} passe la barre des ${item.sessionCount} sessions`,
        subtitle: sportName(item.sportID),
      }
    case 'newSession':
      return { icon: 'play', tone: 'green', title: `${item.firstName} démarre une session de ${sportName(item.sportID)}` }
    case 'allianceFormed':
      return { icon: 'people', tone: 'purple', title: `${item.userAName} et ${item.userBName} sont maintenant Alliés` }
    case 'tribuCreated':
      return { icon: 'flag', tone: 'blue', title: `${item.creatorName} a créé la tribu « ${item.tribuName} »` }
  }
}
