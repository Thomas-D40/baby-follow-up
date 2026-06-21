// Logique pure du suivi selle (Épic 5), extraite pour test unitaire (cf. bottleFeeding.js).
// La couleur est hors périmètre v1 (D5-F) : seule la consistance est saisissable.

export const CONSISTENCY_LABEL = { hard: 'Dure', soft: 'Molle', liquid: 'Liquide' }

/**
 * Formate une Date en valeur d'input `datetime-local` (heure LOCALE, "YYYY-MM-DDThh:mm").
 * Sert à préremplir le champ avec « maintenant » (D5-D : occurredAt pré-rempli).
 */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Convertit une valeur `datetime-local` (heure locale) en instant ISO-8601 (D5-D). Vide ⇒ maintenant.
 * Le serveur normalise en UTC (l'offset n'est pas conservé). Renvoie null si la date est invalide.
 */
export function toOccurredAtIso(localValue) {
  const d = localValue ? new Date(localValue) : new Date()
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
