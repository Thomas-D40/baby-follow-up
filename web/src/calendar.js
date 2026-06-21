// Logique pure du calendrier (Épic 6), extraite pour test unitaire (cf. formatDuration Épic 4).
// Tout l'affichage des heures et le découpage du jour sont pinnés sur Europe/Paris (D6-D),
// JAMAIS le fuseau du device : le bucketing serveur (Paris) et le rendu front doivent coïncider (R5).

const PARIS = 'Europe/Paris'
const LONG_NAP_MINUTES = 10 * 60 // signalement « sieste longue » (D6-G), pur affichage

export const EVENT_TYPE_LABEL = { bottle_feeding: 'Biberon', nap: 'Sieste', stool: 'Selle' }

/** Heure d'un instant ISO rendue en Europe/Paris ("HH:mm"), quel que soit le fuseau du device (D6-D). */
export function formatParisTime(iso) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS })
    .format(new Date(iso))
}

/** Date courante (YYYY-MM-DD) en Europe/Paris — borne « aujourd'hui » côté front (D6-D). */
export function parisToday(now = new Date()) {
  // en-CA produit le format ISO YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: PARIS }).format(now)
}

/** Décale une date calendaire YYYY-MM-DD de `delta` jours (navigation jour −/+). Calcul en UTC pur. */
export function shiftDate(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

/** Libellé long et lisible d'une date YYYY-MM-DD (ex. « lundi 15 juin 2026 »), en français. */
export function formatDayLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

/** Durée d'un événement sieste en minutes ; `endAt` null ⇒ en cours, mesuré jusqu'à `now`. */
function napMinutes(event, now) {
  const start = new Date(event.startAt).getTime()
  const end = event.endAt ? new Date(event.endAt).getTime() : now.getTime()
  return Math.max(0, (end - start) / 60000)
}

/** Une sieste en cours (`endAt` null) ? Détermine le rendu « en cours » côté UI (D6-G). */
export function isOngoing(event) {
  return event.type === 'nap' && event.endAt == null
}

/** Sieste « longue » (> 10 h) → signalement non bloquant (D6-G). Dérivé de start/end/maintenant. */
export function isLongNap(event, now = new Date()) {
  if (event.type !== 'nap') return false
  return napMinutes(event, now) > LONG_NAP_MINUTES
}

/**
 * Texte court décrivant un événement pour la liste du jour (US6.1). Heure Paris + détail par type :
 * biberon → « 120 ml [· Maternel] » ; sieste → durée (« 1 h 23 » / « en cours · 12 min ») ;
 * selle → consistance éventuelle. `now` injectable pour le test de la sieste en cours.
 */
export function describeEvent(event, now = new Date()) {
  if (event.type === 'bottle_feeding') {
    const milk = event.milkType === 'breast' ? ' · Maternel' : event.milkType === 'formula' ? ' · Artificiel' : ''
    return `${event.quantityMl} ml${milk}`
  }
  if (event.type === 'nap') {
    const mins = Math.round(napMinutes(event, now))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    const text = h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
    return isOngoing(event) ? `en cours · ${text}` : text
  }
  if (event.type === 'stool') {
    const label = { hard: 'Dure', soft: 'Molle', liquid: 'Liquide' }[event.consistency]
    return label ?? '—'
  }
  return ''
}

/** Formate une durée de sommeil (minutes) en « X h YY » / « Y min » pour les totaux (US6.3). */
export function formatSleepTotal(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}
