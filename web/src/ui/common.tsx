import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { sportById, sportColor } from '../core/sports'
import { Icon } from './Icon'
import { SportIllustration } from './SportIllustration'

export function Avatar({ name, photo, size = 44, ring = false }: { name: string; photo?: string; size?: number; ring?: boolean }) {
  const className = `avatar${ring ? ' avatar-ring' : ''}`
  if (photo) {
    return <img className={className} src={photo} width={size} height={size} alt={`Photo de ${name}`} />
  }
  return (
    <div className={`${className} avatar-fallback`} style={{ width: size, height: size, fontSize: size * 0.45 }} role="img" aria-label={`Avatar de ${name}`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function SportBadge({ sportID }: { sportID: string }) {
  const sport = sportById(sportID)
  if (!sport) return null
  return (
    <span className="badge" style={{ '--c': sportColor(sportID) } as CSSProperties}>
      <SportIllustration sportID={sportID} className="sport-art-inline" /> {sport.name}
    </span>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

/** Feuille modale ancrée en bas d'écran (fermeture : fond, Échap ou bouton). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <span className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

export function PageHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {action}
    </header>
  )
}

/** Carte sombre à en-tête : titre en majuscules (avec un compteur facultatif) et, à droite, un lien d'action bleu. */
export function Panel({ title, count, action, children, className = '' }: { title: string; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`.trim()}>
      <header className="card-head">
        <h3>
          {title}
          {count !== undefined && <span className="card-count"> ({count})</span>}
        </h3>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Marque GOAT : un sommet avec son fanion. Prend la couleur du texte (`currentColor`). */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M4.5 40 20 12l8.2 14.2L33 19l10.5 21z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M13.6 27.4l3.6-3.2 2.8 2.6 3.4-3.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <path d="M20 12V3.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 4l8 2.7-8 2.8z" fill="var(--gold)" />
    </svg>
  )
}

/** Logo complet : marque, « GOAT » en capitales espacées et « MÉTAVERS » entre deux filets. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo${compact ? ' compact' : ''}`} role="img" aria-label="GOAT Métavers">
      <LogoMark size={compact ? 24 : 46} />
      <span className="logo-word">GOAT</span>
      <span className="logo-sub">MÉTAVERS</span>
    </div>
  )
}

/** Rangée défilante de sports en badges hexagonaux (couleur de la catégorie), avec une ligne de détail facultative sous le nom. */
export function SportHexes({ items }: { items: { sportID: string; sub?: ReactNode }[] }) {
  return (
    <div className="hex-row">
      {items.map(({ sportID, sub }) => {
        const sport = sportById(sportID)
        if (!sport) return null
        return (
          <div className="hex-item" key={sportID}>
            <HexBadge color={sportColor(sportID)}>
              <SportIllustration sportID={sportID} className="sport-art-hex" />
            </HexBadge>
            <span className="hex-name">{sport.name}</span>
            {sub && <span className="hex-sub">{sub}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** Badge hexagonal (comme les badges de la maquette) : contour et halo de la couleur donnée, contenu centré. */
export function HexBadge({ color, size = 64, children }: { color: string; size?: number; children: ReactNode }) {
  return (
    <span className="hex" style={{ '--hex': color, width: size, height: size * 1.125 } as CSSProperties}>
      <svg viewBox="0 0 64 72" aria-hidden="true" focusable="false">
        <path d="M32 4 59.7 20v32L32 68 4.3 52V20z" />
      </svg>
      <span className="hex-content" style={{ fontSize: size * 0.42 }}>
        {children}
      </span>
    </span>
  )
}
