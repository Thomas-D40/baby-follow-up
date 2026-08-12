// Moteur de bandes OMS (poids-pour-âge), Épic 12 — Lot B. Importe les gros JSON de référence et
// applique la formule LMS. À N'IMPORTER QUE depuis le chart lazy (`WeightChart`), jamais depuis une
// surface toujours montée : sinon les tables OMS fuient dans le bundle principal (D12-G′).
import boys from './who-wfa-boys.json'
import girls from './who-wfa-girls.json'

const MAX_AGE_MONTHS = 60

// Bandes tracées (choix carnet de santé) avec le quantile normal Z du percentile. Z vérifiés :
// la formule LMS reproduit les colonnes P* tabulées à ±0,05 kg.
export const WHO_BANDS = [
  { key: 'p3', z: -1.88079, label: 'P3' },
  { key: 'p15', z: -1.03643, label: 'P15' },
  { key: 'p50', z: 0, label: 'P50' },
  { key: 'p85', z: 1.03643, label: 'P85' },
  { key: 'p97', z: 1.88079, label: 'P97' },
]

function rowsForSex(sex) {
  if (sex === 'female') return girls.rows
  if (sex === 'male') return boys.rows
  return null // sexe inconnu → pas de bande (jamais de rabat silencieux, cohérent avec le gate D12-G′)
}

/** L/M/S interpolés linéairement à un âge (mois) ; `null` hors table [0, 60] ou sexe inconnu. */
function lmsAt(rows, month) {
  if (!rows || month < 0 || month > MAX_AGE_MONTHS) return null
  const lo = Math.floor(month)
  const hi = Math.ceil(month)
  const a = rows[lo]
  if (lo === hi) return { L: a.L, M: a.M, S: a.S }
  const b = rows[hi]
  const t = month - lo
  return {
    L: a.L + (b.L - a.L) * t,
    M: a.M + (b.M - a.M) * t,
    S: a.S + (b.S - a.S) * t,
  }
}

/** Poids (kg) du percentile de quantile `z` via LMS : w = M·(1+L·S·Z)^(1/L) ; L≈0 → w = M·e^(S·Z). */
function weightKg(lms, z) {
  const { L, M, S } = lms
  if (Math.abs(L) < 1e-7) return M * Math.exp(S * z)
  return M * Math.pow(1 + L * S * z, 1 / L)
}

/** Poids (grammes entiers) d'un percentile à un âge, ou `null` hors [0,60] mois. L'app stocke des grammes. */
export function bandGrams(sex, month, z) {
  const lms = lmsAt(rowsForSex(sex), month)
  if (!lms) return null
  return Math.round(weightKg(lms, z) * 1000)
}

/**
 * Données fusionnées pour le `LineChart` : une ligne par âge échantillonné, portant les 5 bandes OMS
 * (grammes) ET, aux âges des pesées, le poids de l'enfant (`child`). Bandes et points partagent ainsi
 * le même axe âge. Les âges > 60 mois portent des bandes `null` (points de l'enfant tracés seuls).
 *
 * @param sex 'female' | 'male'
 * @param childPoints [{ ageMonths, weightGrams }] (issu de `toChartPoints`)
 * @param window { minMonths, maxMonths }
 */
export function buildGrowthData(sex, childPoints, window) {
  const { minMonths, maxMonths } = window
  const ages = new Set()
  // Échantillonnage mensuel des bandes sur la fenêtre (clampé à la table OMS pour la partie bandes).
  const from = Math.floor(minMonths)
  const to = Math.ceil(maxMonths)
  for (let m = from; m <= to; m++) {
    if (m >= 0) ages.add(m)
  }
  ages.add(minMonths)
  ages.add(maxMonths)
  // Âges réels des pesées (dans la fenêtre) → points de l'enfant exactement placés.
  for (const p of childPoints) {
    if (p.ageMonths >= minMonths && p.ageMonths <= maxMonths) ages.add(p.ageMonths)
  }

  const childByAge = new Map(childPoints.map((p) => [p.ageMonths, p.weightGrams]))

  return [...ages]
    .filter((m) => m >= 0)
    .sort((a, b) => a - b)
    .map((ageMonths) => {
      const row = { ageMonths }
      for (const band of WHO_BANDS) {
        row[band.key] = bandGrams(sex, ageMonths, band.z)
      }
      if (childByAge.has(ageMonths)) row.child = childByAge.get(ageMonths)
      return row
    })
}
