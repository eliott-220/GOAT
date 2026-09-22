import { useMemo, useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, searchSports, sportById, type Sport, type SportCategory } from '../core/sports'
import { makePrimary, toggleSport, type UserSport } from '../core/models'
import { Icon } from './Icon'
import { SportIllustration } from './SportIllustration'

/**
 * Choix des sports pratiqués + sport principal. Utilisé à l'inscription et dans le profil.
 * Le catalogue en compte une centaine : une recherche, des catégories repliables, et « Ta sélection » en haut.
 */
export function SportSelection({ value, onChange }: { value: UserSport[]; onChange: (next: UserSport[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<SportCategory>>(new Set())
  const searching = query.trim() !== ''
  const matches = useMemo(() => searchSports(query), [query])
  const selected = useMemo(() => new Map(value.map((entry) => [entry.sportID, entry])), [value])

  const toggleCategory = (category: SportCategory) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(category)) next.add(category)
      return next
    })

  const renderRow = (sport: Sport) => (
    <SportRow
      key={sport.id}
      sport={sport}
      entry={selected.get(sport.id)}
      onToggle={() => onChange(toggleSport(value, sport.id))}
      onPrimary={() => onChange(makePrimary(value, sport.id))}
    />
  )

  // Ta sélection : le sport principal d'abord.
  const chosen = [...value]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((entry) => sportById(entry.sportID))
    .filter((sport): sport is Sport => sport !== undefined)

  return (
    <div className="sport-selection">
      <div className="sport-search">
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            className="input"
            type="search"
            aria-label="Rechercher un sport"
            placeholder="Rechercher un sport (ski, padel, yoga…)"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {chosen.length > 0 && !searching && (
        <section>
          <h3 className="section-title">Ta sélection · {chosen.length}</h3>
          <div className="card">{chosen.map(renderRow)}</div>
        </section>
      )}

      {CATEGORIES.map((category) => {
        const sports = matches.filter((sport) => sport.category === category)
        if (sports.length === 0) return null
        const expanded = searching || open.has(category)
        const count = sports.filter((sport) => selected.has(sport.id)).length
        return (
          <section key={category}>
            <button type="button" className="category-head" aria-expanded={expanded} disabled={searching} onClick={() => toggleCategory(category)}>
              <span className="category-title">{CATEGORY_LABELS[category]}</span>
              <span className="category-meta">
                {count > 0 ? `${count} choisi${count > 1 ? 's' : ''} · ` : ''}
                {sports.length}
              </span>
              <Icon name="chevronRight" size={16} />
            </button>
            {expanded && <div className="card">{sports.map(renderRow)}</div>}
          </section>
        )
      })}

      {searching && matches.length === 0 && <p className="row-empty">Aucun sport ne correspond à « {query.trim()} ».</p>}
    </div>
  )
}

function SportRow({ sport, entry, onToggle, onPrimary }: { sport: Sport; entry?: UserSport; onToggle: () => void; onPrimary: () => void }) {
  return (
    <div className="row">
      <button className="row-button" aria-pressed={entry !== undefined} onClick={onToggle}>
        <SportIllustration sportID={sport.id} />
        <span className="row-title">{sport.name}</span>
        <span className={`check ${entry ? 'on' : ''}`} aria-hidden="true">
          {entry && <Icon name="check" size={14} />}
        </span>
      </button>
      {entry && (
        <button
          className={`star ${entry.isPrimary ? 'on' : ''}`}
          aria-label={entry.isPrimary ? 'Sport principal' : 'Définir comme sport principal'}
          onClick={onPrimary}
        >
          <Icon name="star" size={22} filled={entry.isPrimary} />
        </button>
      )}
    </div>
  )
}
