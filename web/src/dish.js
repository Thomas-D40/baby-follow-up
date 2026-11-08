// Pure model of a dish label (Épic 18, US18.3-US18.4).

// Always offered, never stored in the shared list (D18-N).
export const FIXED_DISHES = ['Purée', 'Compote']

export const DISH_MAX_LENGTH = 60

// The one formatting rule of D18-AD, mirrored by the server (DishLabels.validate): edges stripped,
// repeated blanks collapsed, case and accents kept. The server recomputes it: the truth is there.
export function parseDishLabel(raw) {
  const label = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (label === '') return { ok: false, error: 'Indiquez le plat.' }
  if (label.length > DISH_MAX_LENGTH) return { ok: false, error: 'Le plat ne doit pas dépasser 60 caractères.' }
  return { ok: true, value: label }
}
