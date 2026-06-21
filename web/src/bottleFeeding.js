// Logique pure du suivi biberon (Épic 3), extraite pour test unitaire (cf. reconcileSelection D2).

export const MILK_TYPE_LABEL = { breast: 'Maternel', formula: 'Artificiel' }

/**
 * Formate une Date en valeur d'input `datetime-local` (heure LOCALE, "YYYY-MM-DDThh:mm").
 * Sert à préremplir le champ avec « maintenant » (D3-D : occurredAt pré-rempli).
 */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Convertit une valeur `datetime-local` (heure locale) en instant ISO-8601 (D3-D). Vide ⇒ maintenant.
 * Le serveur normalise en UTC (l'offset n'est pas conservé). Renvoie null si la date est invalide.
 */
export function toOccurredAtIso(localValue) {
  const d = localValue ? new Date(localValue) : new Date()
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * Valide une saisie de quantité (ml). Garde-fou client miroir des bornes serveur (D3-E) :
 * entier strictement positif, ≤ 2000. Renvoie { ok:true, value } ou { ok:false, error }.
 */
export function parseQuantity(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return { ok: false, error: 'La quantité est requise.' }
  const n = Number(s)
  if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'Quantité invalide (ml entier > 0).' }
  if (n > 2000) return { ok: false, error: 'Quantité trop élevée (max 2000 ml).' }
  return { ok: true, value: n }
}
