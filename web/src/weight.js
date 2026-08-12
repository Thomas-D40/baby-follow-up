// Pure weight logic (Épic 12), extracted for unit testing. No network calls here, and
// ABOVE ALL no import of the large WHO JSON files nor Recharts: this module stays light, importable
// anywhere without bloating the bundle. The WHO band engine lives in `growth/whoBands.js`,
// imported only by the lazy chart (D12-G′).

import { parisToday } from './calendar'

// Average number of days in a month (Julian year / 12) — converts age days → months to
// match the axis of the WHO tables (weight-for-age in months).
const DAYS_PER_MONTH = 365.25 / 12

// Whole-day difference between two YYYY-MM-DD dates (pure UTC computation, timezone-independent).
function daysBetween(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const [ty, tm, td] = toYmd.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86400000)
}

// Age (in decimal months) of a weigh-in `givenOn` relative to `birthDate` (both YYYY-MM-DD).
// Birth = 0. Continuous interpolation → a non-integer age falls between two monthly WHO points.
// Returns `null` if one of the dates is missing/invalid (the gate guarantees `birthDate` on the view side).
export function ageInMonths(givenOn, birthDate) {
  if (!givenOn || !birthDate) return null
  const days = daysBetween(birthDate, givenOn)
  if (Number.isNaN(days)) return null
  return days / DAYS_PER_MONTH
}

// Transforms the history (`{ points: [{ givenOn, weightGrams }] }`) into curve points on the age
// axis: `[{ ageMonths, weightGrams, givenOn }]`, sorted by increasing age. Weigh-ins before
// birth (negative age) or without a computable age are discarded.
export function toChartPoints(history, birthDate) {
  const points = history?.points ?? []
  return points
    .map((p) => ({ ageMonths: ageInMonths(p.givenOn, birthDate), weightGrams: p.weightGrams, givenOn: p.givenOn }))
    .filter((p) => p.ageMonths != null && p.ageMonths >= 0)
    .sort((a, b) => a.ageMonths - b.ageMonths)
}

// Displayed age window (in months) depending on the view, expressed in terms of AGE (D12-I′):
// - `all`   : birth → current age (0 → today).
// - `year`  : last 12 months of age.
// - `month` : ~last 30 days of age (1 month).
// `latest` = age (months) of the last weigh-in; we cap at the max of the current age and `latest` so
// that a future point (day entered = today) stays visible. Returns `{ minMonths, maxMonths }`.
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
