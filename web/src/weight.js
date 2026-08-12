// Logique pure du poids (Épic 12), extraite pour test unitaire. Aucun appel réseau ici, et
// SURTOUT aucun import des gros JSON OMS ni de Recharts : ce module reste léger, importable
// partout sans alourdir le bundle. Le moteur de bandes OMS vit dans `growth/whoBands.js`,
// importé uniquement par le chart lazy (D12-G′).

import { parisToday } from './calendar'

// Nombre de jours moyens dans un mois (année julienne / 12) — conversion âge jours → mois pour
// coïncider avec l'axe des tables OMS (poids-pour-âge en mois).
const DAYS_PER_MONTH = 365.25 / 12

/** Différence en jours entiers entre deux dates YYYY-MM-DD (calcul en UTC pur, indépendant du fuseau). */
function daysBetween(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const [ty, tm, td] = toYmd.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

/**
 * Âge (en mois, décimal) d'une pesée `givenOn` par rapport à `birthDate` (deux YYYY-MM-DD).
 * Naissance = 0. Interpolation continue → un âge non entier tombe entre deux points OMS mensuels.
 * Renvoie `null` si une des dates manque/est invalide (le gate garantit `birthDate` côté vue).
 */
export function ageInMonths(givenOn, birthDate) {
  if (!givenOn || !birthDate) return null
  const days = daysBetween(birthDate, givenOn)
  if (Number.isNaN(days)) return null
  return days / DAYS_PER_MONTH
}

/**
 * Transforme l'historique (`{ points: [{ givenOn, weightGrams }] }`) en points de courbe sur l'axe
 * âge : `[{ ageMonths, weightGrams, givenOn }]`, triés par âge croissant. Les pesées antérieures à la
 * naissance (âge négatif) ou sans âge calculable sont écartées.
 */
export function toChartPoints(history, birthDate) {
  const points = history?.points ?? []
  return points
    .map((p) => ({ ageMonths: ageInMonths(p.givenOn, birthDate), weightGrams: p.weightGrams, givenOn: p.givenOn }))
    .filter((p) => p.ageMonths != null && p.ageMonths >= 0)
    .sort((a, b) => a.ageMonths - b.ageMonths)
}

/**
 * Fenêtre d'âge affichée (en mois) selon la vue, exprimée en termes d'ÂGE (D12-I′) :
 * - `all`   : naissance → âge actuel (0 → aujourd'hui).
 * - `year`  : 12 derniers mois d'âge.
 * - `month` : ~30 derniers jours d'âge (1 mois).
 * `latest` = âge (mois) de la dernière pesée ; on borne au max de l'âge courant et de `latest` pour
 * qu'un point futur (jour saisi = aujourd'hui) reste visible. Renvoie `{ minMonths, maxMonths }`.
 */
export function growthWindow(view, birthDate, latest = 0, today = parisToday()) {
  const currentAge = birthDate ? Math.max(0, ageInMonths(today, birthDate) ?? 0) : 0
  const maxMonths = Math.max(currentAge, latest ?? 0, 1)
  let minMonths
  if (view === 'month') {
    minMonths = Math.max(0, maxMonths - 1)
  } else if (view === 'year') {
    minMonths = Math.max(0, maxMonths - 12)
  } else {
    minMonths = 0 // 'all'
  }
  return { minMonths, maxMonths }
}
