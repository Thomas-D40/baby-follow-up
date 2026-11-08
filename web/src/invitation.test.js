import { describe, it, expect } from 'vitest'
import { formatInvitationExpiry } from './invitation'

describe('formatInvitationExpiry — date d’expiration affichée à l’owner (Épic 17)', () => {
  it('heure d’hiver (UTC+1) : 13:05 UTC → 14:05 à Paris', () => {
    expect(formatInvitationExpiry('2026-11-11T13:05:00Z')).toBe('11/11/2026 à 14:05')
  })

  it('heure d’été (UTC+2) : 13:05 UTC → 15:05 à Paris', () => {
    expect(formatInvitationExpiry('2026-07-11T13:05:00Z')).toBe('11/07/2026 à 15:05')
  })

  it('bascule de jour à Paris : 23:30 UTC la veille → lendemain 00:30', () => {
    expect(formatInvitationExpiry('2026-11-11T23:30:00Z')).toBe('12/11/2026 à 00:30')
  })
})
