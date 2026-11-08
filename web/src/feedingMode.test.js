import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  FEEDING_MODES,
  FEEDING_MODE_LABEL,
  FEEDING_MODE_KEY,
  loadFeedingMode,
  saveFeedingMode,
} from './feedingMode'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('constantes du sélecteur de mode (Épic 18, US18.1)', () => {
  it('trois modes dans l’ordre Biberon, Sein, Diversification', () => {
    expect(FEEDING_MODES).toEqual(['bottle', 'breast', 'solid'])
    expect(FEEDING_MODE_LABEL).toEqual({ bottle: 'Biberon', breast: 'Sein', solid: 'Diversification' })
  })

  it('la clé de mémorisation est celle de l’appareil, sans suffixe bébé (D18-AK)', () => {
    expect(FEEDING_MODE_KEY).toBe('suivibaby.feedingMode')
  })
})

describe('loadFeedingMode — première ouverture sur Biberon', () => {
  it('clé absente → bottle', () => {
    expect(loadFeedingMode()).toBe('bottle')
  })

  it('valeur inconnue → bottle', () => {
    localStorage.setItem(FEEDING_MODE_KEY, 'x')
    expect(loadFeedingMode()).toBe('bottle')
  })

  it('stockage indisponible (getItem lève) → bottle, sans propager l’erreur', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadFeedingMode()).toBe('bottle')
  })

  it.each(['bottle', 'breast', 'solid'])('relit le mode mémorisé « %s »', (mode) => {
    localStorage.setItem(FEEDING_MODE_KEY, mode)
    expect(loadFeedingMode()).toBe(mode)
  })

  it('ne lit pas sessionStorage : une valeur de session est ignorée (la mémoire survit à la fermeture)', () => {
    sessionStorage.setItem(FEEDING_MODE_KEY, 'solid')
    expect(loadFeedingMode()).toBe('bottle')
  })
})

describe('saveFeedingMode — mémoire propre à l’appareil (D18-AK)', () => {
  it('écrit dans localStorage et pas dans sessionStorage', () => {
    saveFeedingMode('breast')

    expect(localStorage.getItem('suivibaby.feedingMode')).toBe('breast')
    expect(sessionStorage.getItem('suivibaby.feedingMode')).toBeNull()
  })

  it('aller-retour save → load', () => {
    saveFeedingMode('solid')
    expect(loadFeedingMode()).toBe('solid')
  })
})
