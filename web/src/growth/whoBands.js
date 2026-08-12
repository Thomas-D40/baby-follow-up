// WHO band engine (weight-for-age), Épic 12 — Lot B. Imports the large reference JSON files and
// applies the LMS formula. IMPORT ONLY from the lazy chart (`WeightChart`), never from an
// always-mounted surface: otherwise the WHO tables leak into the main bundle (D12-G′).
import boys from './who-wfa-boys.json'
import girls from './who-wfa-girls.json'

const MAX_AGE_MONTHS = 60

// Plotted bands (health-record choice) with the normal quantile Z of the percentile. Z verified:
// the LMS formula reproduces the tabulated P* columns to within ±0.05 kg.
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
  return null // unknown sex → no band (never a silent fallback, consistent with the D12-G′ gate)
}

// L/M/S linearly interpolated at an age (months); `null` outside the [0, 60] table or unknown sex.
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

// Weight (kg) of the percentile with quantile `z` via LMS: w = M·(1+L·S·Z)^(1/L); L≈0 → w = M·e^(S·Z).
function weightKg(lms, z) {
  const { L, M, S } = lms
  if (Math.abs(L) < 1e-7) return M * Math.exp(S * z)
  return M * Math.pow(1 + L * S * z, 1 / L)
}

// Weight (whole grams) of a percentile at an age, or `null` outside [0,60] months. The app stores grams.
export function bandGrams(sex, month, z) {
  const lms = lmsAt(rowsForSex(sex), month)
  if (!lms) return null
  return Math.round(weightKg(lms, z) * 1000)
}

// Merged data for the `LineChart`: one row per sampled age, carrying the 5 WHO bands
// (grams) AND, at the weigh-in ages, the child's weight (`child`). Bands and points thus share
// the same age axis. Ages > 60 months carry `null` bands (child points drawn alone).
// sex: 'female' | 'male'; childPoints: [{ ageMonths, weightGrams }] (from `toChartPoints`);
// window: { minMonths, maxMonths }.
export function buildGrowthData(sex, childPoints, window) {
  const { minMonths, maxMonths } = window
  const ages = new Set()
  // Monthly sampling of the bands over the window (clamped to the WHO table for the band part).
  const from = Math.floor(minMonths)
  const to = Math.ceil(maxMonths)
  for (let m = from; m <= to; m++) {
    if (m >= 0) ages.add(m)
  }
  ages.add(minMonths)
  ages.add(maxMonths)
  // Real ages of the weigh-ins (within the window) → child points exactly placed.
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
