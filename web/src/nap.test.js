import { describe, it, expect } from 'vitest'
import { formatDuration } from './nap'

describe('formatDuration (Épic 4)', () => {
  const start = '2026-06-21T10:00:00.000Z'

  it('formate une sieste terminée de plus d’une heure', () => {
    expect(formatDuration(start, '2026-06-21T11:23:00.000Z')).toBe('1 h 23')
  })

  it('formate une sieste terminée de moins d’une heure', () => {
    expect(formatDuration(start, '2026-06-21T10:45:00.000Z')).toBe('45 min')
  })

  it('marque une sieste en cours (end null) jusqu’à now', () => {
    const now = new Date('2026-06-21T10:12:00.000Z')
    expect(formatDuration(start, null, now)).toBe('en cours · 12 min')
  })

  it('ne renvoie jamais de durée négative', () => {
    const now = new Date('2026-06-21T09:50:00.000Z') // now avant le début
    expect(formatDuration(start, null, now)).toBe('en cours · 0 min')
  })
})
