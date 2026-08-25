import { describe, it, expect } from 'vitest'
import { formatCelsius, parseTemperature } from './temperature'

describe('parseTemperature — saisie en °C → dixièmes (D15-J)', () => {
  it('accepte la virgule (clavier fr-FR) : « 37,8 » → 378', () => {
    expect(parseTemperature('37,8')).toEqual({ ok: true, value: 378 })
  })

  it('accepte le point (clavier physique) : « 37.8 » → 378', () => {
    expect(parseTemperature('37.8')).toEqual({ ok: true, value: 378 })
  })

  it('arrondit une saisie à deux décimales : « 37,85 » → 379 et « 37,84 » → 378', () => {
    // Seul comportement de Math.round réellement observable : 37.8 * 10 vaut déjà exactement 378.
    expect(parseTemperature('37,85')).toEqual({ ok: true, value: 379 })
    expect(parseTemperature('37,84')).toEqual({ ok: true, value: 378 })
  })

  it('borne basse : « 3,78 » (dixièmes saisis comme des °C) → erreur', () => {
    const r = parseTemperature('3,78')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Température invalide (attendue en °C, 30,0 ≤ t ≤ 43,0).')
  })

  it('borne haute : « 378 » (saisie en dixièmes) → erreur — la saisie est en °C, jamais en dixièmes', () => {
    const r = parseTemperature('378')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Température invalide (attendue en °C, 30,0 ≤ t ≤ 43,0).')
  })

  it('bornes miroir du serveur : 30,0 et 43,0 passent, 29,9 et 43,1 non', () => {
    expect(parseTemperature('30')).toEqual({ ok: true, value: 300 })
    expect(parseTemperature('43')).toEqual({ ok: true, value: 430 })
    expect(parseTemperature('29,9').ok).toBe(false)
    expect(parseTemperature('43,1').ok).toBe(false)
  })

  it('vide / absent → erreur explicite', () => {
    expect(parseTemperature('')).toEqual({ ok: false, error: 'La température est requise.' })
    expect(parseTemperature('   ')).toEqual({ ok: false, error: 'La température est requise.' })
    expect(parseTemperature(null).ok).toBe(false)
  })

  it('texte non numérique → erreur (jamais NaN renvoyé comme valeur)', () => {
    expect(parseTemperature('fièvre').ok).toBe(false)
  })
})

describe('formatCelsius — rendu fr-FR (virgule décimale)', () => {
  it('378 → « 37,8 °C »', () => {
    expect(formatCelsius(378)).toBe('37,8 °C')
  })

  it('garde toujours un dixième affiché (380 → « 38,0 °C »)', () => {
    expect(formatCelsius(380)).toBe('38,0 °C')
  })
})
