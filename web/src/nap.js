// Logique pure du suivi sieste (Épic 4), extraite pour test unitaire (cf. parseQuantity, Épic 3).

/**
 * Formate la durée d'une sieste. `endAtIso` null ⇒ sieste **en cours** (durée jusqu'à `now`).
 * Renvoie p.ex. « 1 h 23 », « 45 min », ou « en cours · 12 min ». `now` injectable pour le test.
 */
export function formatDuration(startAtIso, endAtIso, now = new Date()) {
  const start = new Date(startAtIso)
  const end = endAtIso ? new Date(endAtIso) : now
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const text = h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
  return endAtIso ? text : `en cours · ${text}`
}
