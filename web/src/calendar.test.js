import { describe, it, expect } from 'vitest'
import {
  EVENT_TYPE_LABEL,
  describeEvent,
  formatParisTime,
  formatSleepTotal,
  isLongNap,
  isOngoing,
  parisToday,
  shiftDate,
} from './calendar'

describe('formatParisTime — affichage Europe/Paris (D6-D, R5)', () => {
  it('rend la même heure quel que soit le fuseau du device', () => {
    // 21:30 UTC = 23:30 Paris en été (+02:00) — l'affichage doit rester Paris.
    expect(formatParisTime('2026-07-15T21:30:00.000Z')).toBe('23:30')
  })

  it('applique le bon offset en hiver (+01:00)', () => {
    // 22:30 UTC = 23:30 Paris en hiver (+01:00).
    expect(formatParisTime('2026-01-15T22:30:00.000Z')).toBe('23:30')
  })

  it('mappe un instant juste avant minuit Paris sur le bon affichage', () => {
    // 23:00 UTC le 14 = 01:00 Paris le 15 (été) — bucketing serveur cohérent avec le rendu.
    expect(formatParisTime('2026-07-14T23:00:00.000Z')).toBe('01:00')
  })
})

describe('parisToday / shiftDate — navigation jour (US6.1)', () => {
  it('parisToday renvoie la date Paris en YYYY-MM-DD', () => {
    // 23:30 UTC le 14/07 = déjà le 15/07 à Paris (été).
    expect(parisToday(new Date('2026-07-14T23:30:00.000Z'))).toBe('2026-07-15')
  })

  it('shiftDate avance et recule d’un jour', () => {
    expect(shiftDate('2026-07-15', 1)).toBe('2026-07-16')
    expect(shiftDate('2026-07-15', -1)).toBe('2026-07-14')
  })

  it('shiftDate franchit une frontière de mois', () => {
    expect(shiftDate('2026-07-31', 1)).toBe('2026-08-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('describeEvent — détail par type (US6.1)', () => {
  it('biberon : quantité + type de lait', () => {
    expect(describeEvent({ type: 'bottle_feeding', quantityMl: 120, milkType: 'breast' })).toBe('120 ml · Maternel')
    expect(describeEvent({ type: 'bottle_feeding', quantityMl: 90, milkType: null })).toBe('90 ml')
  })

  it('sieste terminée : durée brute', () => {
    expect(describeEvent({ type: 'nap', startAt: '2026-07-15T08:00:00.000Z', endAt: '2026-07-15T09:23:00.000Z' }))
      .toBe('1 h 23')
  })

  it('sieste en cours : « en cours · … » jusqu’à now', () => {
    const now = new Date('2026-07-15T08:12:00.000Z')
    expect(describeEvent({ type: 'nap', startAt: '2026-07-15T08:00:00.000Z', endAt: null }, now))
      .toBe('en cours · 12 min')
  })

  it('selle : libellé de consistance', () => {
    expect(describeEvent({ type: 'stool', consistency: 'liquid' })).toBe('Liquide')
    expect(describeEvent({ type: 'stool', consistency: null })).toBe('—')
  })

  it('urine : libellé fixe « Urine » (US13.2 Lot 3)', () => {
    expect(describeEvent({ type: 'urine' })).toBe('Urine')
  })
})

describe('isOngoing / isLongNap — états sieste (D6-G)', () => {
  it('isOngoing vrai uniquement pour une sieste sans fin', () => {
    expect(isOngoing({ type: 'nap', endAt: null })).toBe(true)
    expect(isOngoing({ type: 'nap', endAt: '2026-07-15T09:00:00.000Z' })).toBe(false)
    expect(isOngoing({ type: 'bottle_feeding', endAt: null })).toBe(false)
  })

  it('flag « sieste longue » au-delà de 10 h', () => {
    // 11 h → longue.
    expect(isLongNap({ type: 'nap', startAt: '2026-07-15T00:00:00.000Z', endAt: '2026-07-15T11:00:00.000Z' })).toBe(true)
    // 9 h → pas longue.
    expect(isLongNap({ type: 'nap', startAt: '2026-07-15T00:00:00.000Z', endAt: '2026-07-15T09:00:00.000Z' })).toBe(false)
  })

  it('sieste en cours longue : mesurée jusqu’à now', () => {
    const now = new Date('2026-07-15T11:00:00.000Z')
    expect(isLongNap({ type: 'nap', startAt: '2026-07-14T23:00:00.000Z', endAt: null }, now)).toBe(true)
  })
})

describe('formatSleepTotal — totaux (US6.3)', () => {
  it('formate heures + minutes', () => {
    expect(formatSleepTotal(480)).toBe('8 h 00')
    expect(formatSleepTotal(125)).toBe('2 h 05')
  })

  it('formate moins d’une heure', () => {
    expect(formatSleepTotal(45)).toBe('45 min')
    expect(formatSleepTotal(0)).toBe('0 min')
  })
})

describe('EVENT_TYPE_LABEL', () => {
  it('libellés FR par type (urine ajoutée — US13.2 Lot 3)', () => {
    expect(EVENT_TYPE_LABEL).toEqual({ bottle_feeding: 'Biberon', nap: 'Sieste', stool: 'Selle', urine: 'Urine' })
  })
})
