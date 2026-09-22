import { ATHLETE_STYLES } from '../core/athleteStyles'
import type { AthleteStyleID } from '../core/models'
import { Icon, type IconName } from './Icon'

export const STYLE_ICONS: Record<AthleteStyleID, IconName> = {
  adventurer: 'mountain', competitor: 'trophy', fun: 'star', team: 'people', wellbeing: 'activity', regular: 'clock',
}

/** Grille de badges « style de sportif » : un seul choix. Utilisée à l'inscription et dans le profil. */
export function AthleteStylePicker({ value, onChange }: { value?: AthleteStyleID; onChange: (id: AthleteStyleID) => void }) {
  return (
    <div className="style-grid" role="radiogroup" aria-label="Style de sportif">
      {ATHLETE_STYLES.map((style) => (
        <button
          key={style.id}
          type="button"
          role="radio"
          aria-checked={value === style.id}
          className="style-card"
          onClick={() => onChange(style.id)}
        >
          <span className="style-emoji" aria-hidden="true">
            <Icon name={STYLE_ICONS[style.id]} size={25} />
          </span>
          <span className="style-name">{style.name}</span>
          <span className="style-tagline">{style.tagline}</span>
        </button>
      ))}
    </div>
  )
}
