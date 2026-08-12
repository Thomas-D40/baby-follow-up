// Logique pure des vitamines (Épic 9), extraite pour test unitaire. Aucun appel réseau ici.

// Libellés FR par type (D9-D). Extensible : ajouter une entrée quand un type est ajouté côté back.
export const VITAMIN_LABEL = { d: 'Vitamine D', k: 'Vitamine K' }

/** Libellé FR d'un type de vitamine ; repli sur le code brut si type inconnu (dégradation douce). */
export function vitaminLabel(type) {
  return VITAMIN_LABEL[type] ?? type
}

/** Items d'un `VitaminDayResponse` (ou tableau vide si non chargé) — le back garantit l'ordre d/k. */
export function vitaminItems(dayResponse) {
  return dayResponse?.items ?? []
}
