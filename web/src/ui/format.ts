/** "45 min", "1 h 05"… */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/** Chronomètre "m:ss" ou "h:mm:ss". */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const monthYearShort = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' })
const dayTime = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export const formatMonthYear = (ms: number): string => monthYear.format(ms)
/** « sept. 2026 » : pour les lignes étroites (« Membre depuis … »). */
export const formatMonthYearShort = (ms: number): string => monthYearShort.format(ms)
export const formatDayTime = (ms: number): string => dayTime.format(ms)

/** « à l'instant », « il y a 2 h », « il y a 3 j » ; au-delà de 30 jours, la date (« 12 sept. »). */
export function formatRelative(ms: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `il y a ${days} j`
  return dayMonth.format(ms)
}

/** Durée de pratique pour un chiffre du profil : « 0 min », « 45 min », « 3 h 20 ». */
export const formatPractice = (ms: number): string => (ms < 60_000 ? '0 min' : formatDuration(ms))
