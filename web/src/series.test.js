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

describe('periodRange — vue → plage de dates + bucket', () => {
  it('semaine : lundi→dimanche, buckets jour', () => {
    // 2026-06-17 = mercredi → semaine du lundi 15 au dimanche 21.
    expect(periodRange('week', '2026-06-17')).toEqual({ from: '2026-06-15', to: '2026-06-21', bucket: 'day' })
  })

  it('mois : 1er→dernier jour, buckets jour (gère février)', () => {
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28', bucket: 'day' })
  })

  it('année : 1er janv.→31 déc., buckets mois', () => {
    expect(periodRange('year', '2026-06-17')).toEqual({ from: '2026-01-01', to: '2026-12-31', bucket: 'month' })
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

  it('année : avance/recule d’un an (ancre normalisée au 1er janv.)', () => {
    expect(shiftPeriod('year', '2026-06-17', 1)).toBe('2027-01-01')
    expect(shiftPeriod('year', '2026-06-17', -1)).toBe('2025-01-01')
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
    expect(formatPeriodLabel('year', '2026-06-17')).toBe('2026')
  })

  it('axe X : jour en JJ/MM, mois abrégé', () => {
    expect(formatPointLabel('2026-06-15', 'day')).toBe('15/06')
    expect(formatPointLabel('2026-01-01', 'month')).toBe('janv.')
  })
})

describe('toChartRows — points de série → lignes Recharts', () => {
  it('mappe chaque métrique et convertit le sommeil en heures', () => {
    const points = [
      { date: '2026-06-15', bottleCount: 3, totalMilkMl: 360, totalSleepMinutes: 90, stoolCount: 2 },
    ]
    const [row] = toChartRows(points, 'day')
    expect(row.label).toBe('15/06')
    expect(row.bottleCount).toBe(3)
    expect(row.totalMilkMl).toBe(360)
    expect(row.sleepHours).toBe(1.5) // 90 min → 1,5 h
    expect(row.stoolCount).toBe(2)
  })

  it('expose exactement les 4 courbes attendues', () => {
    expect(TREND_METRICS.map((m) => m.key)).toEqual(['bottleCount', 'totalMilkMl', 'sleepHours', 'stoolCount'])
  })
})
