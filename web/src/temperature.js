// Pure temperature logic (Épic 15, D15-H), extracted for unit testing. No network call here.
//
// ⛔ This module must NEVER import `calendar.js`. The edge goes the other way: `calendar.js`
// imports `formatCelsius` from here to describe a temperature row. Adding the reverse edge would
// close a cycle, and under Vitest one of the two modules would then be read half-initialised —
// typically `EVENT_TYPE_LABEL` seen as `undefined`. If a date helper is ever needed here, duplicate
// it or take it as an argument.

// Client-side mirror of the server bounds (D15-J): °C only, 30.0 → 43.0, stored in tenths.
const MIN_X10 = 300
const MAX_X10 = 430
const OUT_OF_RANGE = 'Température invalide (attendue en °C, 30,0 ≤ t ≤ 43,0).'

/**
 * Validates a temperature typed in °C and converts it to tenths (the wire/storage unit).
 * Returns `{ ok: true, value }` or `{ ok: false, error }` — same shape as `parseQuantity`.
 *
 * The comma is normalised to a dot first: a fr-FR keyboard offers the comma, and `Number("37,8")`
 * is `NaN`. `Math.round` then rounds a TWO-DECIMAL entry to the nearest tenth (`37,85` → `379`);
 * it is not there to rescue a float — `37.8 * 10` is exactly `378`.
 */
export function parseTemperature(raw) {
  const s = String(raw ?? '').trim().replace(',', '.')
  if (s === '') return { ok: false, error: 'La température est requise.' }
  const n = Number(s)
  if (!Number.isFinite(n)) return { ok: false, error: OUT_OF_RANGE }
  const x10 = Math.round(n * 10)
  if (x10 < MIN_X10 || x10 > MAX_X10) return { ok: false, error: OUT_OF_RANGE }
  return { ok: true, value: x10 }
}

/** Renders tenths of a degree as « 37,8 °C » (fr-FR decimal comma). Division kept to the last moment. */
export function formatCelsius(x10) {
  const celsius = (x10 / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${celsius} °C`
}
