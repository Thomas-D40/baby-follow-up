import { describe, it, expect } from 'vitest'
import {
  TREND_METRICS,
  formatPeriodLabel,
  formatPointLabel,
  periodRange,
  samePeriod,
  shiftPeriod,
  toChartRows,
} from './series'

describe('periodRange — vue → plage de dates', () => {
  it('semaine : lundi→dimanche', () => {
    // 2026-06-17 = mercredi → semaine du lundi 15 au dimanche 21.
    expect(periodRange('week', '2026-06-17')).toEqual({ from: '2026-06-15', to: '2026-06-21' })
  })

  it('mois : 1er→dernier jour (gère février)', () => {
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('D14-D — fonctions totales et défensives', () => {
  it('periodRange lève sur une vue inconnue (pas de plage par défaut)', () => {
    expect(() => periodRange('bogus', '2026-06-17')).toThrow()
  })

  it('shiftPeriod lève sur une vue inconnue (les flèches restent OK ailleurs)', () => {
    expect(() => shiftPeriod('bogus', '2026-06-17', 1)).toThrow()
    expect(shiftPeriod('week', '2026-06-17', 1)).toBe('2026-06-24') // sortie unique préservée
  })

  it('la garde se propage aux appelants de periodRange (samePeriod, formatPeriodLabel)', () => {
    // Ces deux-là ne portent pas de garde propre : elles lèvent parce qu'elles appellent periodRange.
    expect(() => samePeriod('bogus', '2026-06-15', '2026-06-21')).toThrow()
    expect(() => formatPeriodLabel('bogus', '2026-06-17')).toThrow()
  })

  it('la vue « année » retirée est désormais une vue inconnue comme une autre', () => {
    expect(() => periodRange('year', '2026-06-17')).toThrow()
  })
})

describe('shiftPeriod — navigation période ±', () => {
  it('semaine : avance/recule de 7 jours', () => {
    expect(shiftPeriod('week', '2026-06-17', 1)).toBe('2026-06-24')
    expect(shiftPeriod('week', '2026-06-17', -1)).toBe('2026-06-10')
  })

  it('mois : avance d’un mois sans déborder (31 mars +1 → avril)', () => {
    expect(periodRange('month', shiftPeriod('month', '2026-03-31', 1)).from).toBe('2026-04-01')
  })
})

describe('samePeriod', () => {
  it('deux dates de la même semaine → vrai', () => {
    expect(samePeriod('week', '2026-06-15', '2026-06-21')).toBe(true)
  })
  it('deux semaines différentes → faux', () => {
    expect(samePeriod('week', '2026-06-15', '2026-06-22')).toBe(false)
  })
})

describe('formatPeriodLabel / formatPointLabel', () => {
  it('libellés de période lisibles, indépendants du fuseau du device', () => {
    expect(formatPeriodLabel('week', '2026-06-17')).toBe('Semaine du 15 juin')
    expect(formatPeriodLabel('month', '2026-06-17')).toBe('juin 2026')
  })

  it('axe X : jour en JJ/MM', () => {
    expect(formatPointLabel('2026-06-15')).toBe('15/06')
    expect(formatPointLabel('2026-01-01')).toBe('01/01')
  })
})

describe('toChartRows — points de série → lignes Recharts', () => {
  it('mappe chaque métrique et convertit le sommeil en heures', () => {
    const points = [
      { date: '2026-06-15', totalMilkMl: 360, totalSleepMinutes: 90, stoolCount: 2 },
    ]
    const [row] = toChartRows(points)
    expect(row.label).toBe('15/06')
    expect(row.totalMilkMl).toBe(360)
    expect(row.sleepHours).toBe(1.5) // 90 min → 1,5 h
    expect(row.stoolCount).toBe(2)
  })

  it('expose exactement les 3 courbes attendues', () => {
    expect(TREND_METRICS.map((m) => m.key)).toEqual(['totalMilkMl', 'sleepHours', 'stoolCount'])
  })
})
