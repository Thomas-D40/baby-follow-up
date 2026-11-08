// Pure model of the "Repas" sheet mode selector (Épic 18, US18.1). The last mode a feed was SAVED in
// is remembered per device.

export const FEEDING_MODES = ['bottle', 'breast', 'solid']
export const FEEDING_MODE_LABEL = { bottle: 'Biberon', breast: 'Sein', solid: 'Diversification' }

// localStorage on purpose (D18-AK): the memory must survive closing the app. Do not clone the
// sessionStorage of the recap day filter.
export const FEEDING_MODE_KEY = 'suivibaby.feedingMode'

// Absent, unknown or unreadable storage all fall back to the bottle, the historical default.
export function loadFeedingMode() {
  try {
    const stored = localStorage.getItem(FEEDING_MODE_KEY)
    return FEEDING_MODES.includes(stored) ? stored : 'bottle'
  } catch {
    return 'bottle'
  }
}

export function saveFeedingMode(mode) {
  try {
    localStorage.setItem(FEEDING_MODE_KEY, mode)
  } catch { /* storage unavailable: the memory is a convenience only */ }
}
