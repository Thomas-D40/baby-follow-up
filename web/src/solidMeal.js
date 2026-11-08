// Pure model of a diversification meal (Épic 18, US18.3).

export const PORTIONS = ['tasted', 'half', 'all']
export const PORTION_LABEL = { tasted: 'Goûté', half: 'La moitié', all: 'Tout' }

// Recap row detail: the dish, followed by the portion when there is one (D18-V).
export function describeSolidMeal({ dish, portion }) {
  return portion ? `${dish} · ${PORTION_LABEL[portion]}` : dish
}
