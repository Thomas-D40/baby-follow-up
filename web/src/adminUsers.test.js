import { describe, it, expect } from 'vitest'
import { ACCOUNT_ROLE_LABEL, ACCOUNT_STATUS_LABEL, formatAccountDate } from './adminUsers'

describe('adminUsers — libellés de l’écran Utilisateurs (Épic 20)', () => {
  it('libellés de rôle', () => {
    expect(ACCOUNT_ROLE_LABEL).toEqual({ admin: 'Admin', parent: 'Parent' })
  })

  it('libellés de statut', () => {
    expect(ACCOUNT_STATUS_LABEL).toEqual({ active: 'Actif', pending: "En attente d'activation" })
  })
})

describe('formatAccountDate — date de création en Europe/Paris', () => {
  it('créé à 23:30 UTC la veille (UTC+1) : la date de Paris est celle du lendemain', () => {
    expect(formatAccountDate('2026-11-07T23:30:00Z')).toBe('08/11/2026')
  })

  it('heure d’été (UTC+2) : 22:30 UTC bascule aussi sur le lendemain', () => {
    expect(formatAccountDate('2026-07-31T22:30:00Z')).toBe('01/08/2026')
  })

  it('heure d’hiver, milieu de journée : même jour', () => {
    expect(formatAccountDate('2026-11-06T10:00:00Z')).toBe('06/11/2026')
  })
})
