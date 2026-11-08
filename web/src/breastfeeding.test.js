import { describe, it, expect } from 'vitest'
import {
  BREAST_SIDE_LABEL,
  describeBreastfeeding,
  formatLastBreastfeeding,
  parseDuration,
} from './breastfeeding'

const DURATION_ERROR = 'Durée invalide (nombre entier de 1 à 120 min).'

describe('BREAST_SIDE_LABEL', () => {
  it('libellés des deux côtés', () => {
    expect(BREAST_SIDE_LABEL).toEqual({ left: 'Gauche', right: 'Droit' })
  })
})

describe('parseDuration — durée optionnelle de 1 à 120 min (US18.2, D18-M)', () => {
  it.each(['0', '121', '7,5', '7.5', 'abc', '-3'])('refuse « %s »', (raw) => {
    expect(parseDuration(raw)).toEqual({ ok: false, error: DURATION_ERROR })
  })

  it('vide → null (durée non précisée), blanc compris', () => {
    expect(parseDuration('')).toEqual({ ok: true, value: null })
    expect(parseDuration('   ')).toEqual({ ok: true, value: null })
  })

  it('accepte un entier dans les bornes, bornes incluses', () => {
    expect(parseDuration('12')).toEqual({ ok: true, value: 12 })
    expect(parseDuration('1')).toEqual({ ok: true, value: 1 })
    expect(parseDuration('120')).toEqual({ ok: true, value: 120 })
  })
})

describe('describeBreastfeeding — détail d’une ligne du récap (US18.2, D18-V)', () => {
  it('côté et durée → « Gauche · 12 min »', () => {
    expect(describeBreastfeeding({ side: 'left', durationMinutes: 12 })).toBe('Gauche · 12 min')
  })

  it('durée seule → « 12 min »', () => {
    expect(describeBreastfeeding({ side: null, durationMinutes: 12 })).toBe('12 min')
  })

  it('côté seul → « Gauche »', () => {
    expect(describeBreastfeeding({ side: 'left', durationMinutes: null })).toBe('Gauche')
    expect(describeBreastfeeding({ side: 'right', durationMinutes: null })).toBe('Droit')
  })

  it('ni côté ni durée → « — »', () => {
    expect(describeBreastfeeding({ side: null, durationMinutes: null })).toBe('—')
  })
})

describe('formatLastBreastfeeding — rappel de la dernière tétée (US18.2, D18-W/D18-AM)', () => {
  const NOW = new Date('2026-11-08T16:00:00.000Z')

  it('aucune tétée → null', () => {
    expect(formatLastBreastfeeding(null, NOW)).toBeNull()
  })

  it('avec côté, le jour même : heure Europe/Paris', () => {
    expect(formatLastBreastfeeding({ side: 'left', occurredAt: '2026-11-08T13:05:00.000Z' }, NOW))
      .toBe('Dernière tétée : gauche, à 14:05')
  })

  it('côté droit : le côté est rendu en minuscules', () => {
    expect(formatLastBreastfeeding({ side: 'right', occurredAt: '2026-11-08T13:05:00.000Z' }, NOW))
      .toMatch(/Dernière tétée : droit, à 14:05/)
  })

  it('sans côté : « côté non précisé »', () => {
    expect(formatLastBreastfeeding({ side: null, occurredAt: '2026-11-08T13:05:00.000Z' }, NOW))
      .toBe('Dernière tétée : côté non précisé, à 14:05')
  })

  it('un autre jour (Paris) : « le jj/mm à hh:mm »', () => {
    expect(formatLastBreastfeeding(
      { side: 'left', occurredAt: '2026-11-07T21:10:00.000Z' },
      new Date('2026-11-08T09:00:00.000Z'),
    )).toBe('Dernière tétée : gauche, le 07/11 à 22:10')
  })

  it('cas de bord minuit : 23:30 UTC la veille est 00:30 Paris, donc le même jour que now', () => {
    expect(formatLastBreastfeeding(
      { side: 'left', occurredAt: '2026-11-07T23:30:00.000Z' },
      new Date('2026-11-08T09:00:00.000Z'),
    )).toBe('Dernière tétée : gauche, à 00:30')
  })

  it('l’heure suit l’heure d’été : 12:05 UTC en juillet est 14:05 Paris', () => {
    expect(formatLastBreastfeeding(
      { side: 'left', occurredAt: '2026-07-08T12:05:00.000Z' },
      new Date('2026-07-08T16:00:00.000Z'),
    )).toBe('Dernière tétée : gauche, à 14:05')
  })
})
