import { describe, it, expect } from 'vitest'
import {
  MEDICAL_CARE_LABEL,
  RECENT_CARES_LIMIT,
  careEventType,
  careTypeOfEvent,
  medicalCareLabel,
  recentCareRows,
} from './medicalCare'

describe('medicalCareLabel — libellés FR (US15.2)', () => {
  it('les deux types de soin', () => {
    expect(MEDICAL_CARE_LABEL).toEqual({ eye: 'Yeux', nose: 'Nez' })
    expect(medicalCareLabel('eye')).toBe('Yeux')
    expect(medicalCareLabel('nose')).toBe('Nez')
  })

  it('repli doux sur le code brut si le type est inconnu', () => {
    expect(medicalCareLabel('ear')).toBe('ear')
  })
})

describe('traduction ressource ↔ présentation (K1 / D15-F′)', () => {
  it('careEventType : « eye » → « eye_care », « nose » → « nose_care »', () => {
    expect(careEventType('eye')).toBe('eye_care')
    expect(careEventType('nose')).toBe('nose_care')
  })

  it('careTypeOfEvent : « eye_care » → « eye », « nose_care » → « nose »', () => {
    expect(careTypeOfEvent('eye_care')).toBe('eye')
    expect(careTypeOfEvent('nose_care')).toBe('nose')
  })

  it('repli doux dans les deux sens', () => {
    expect(careEventType('ear')).toBe('ear')
    expect(careTypeOfEvent('ear_care')).toBe('ear_care')
  })
})

describe('recentCareRows — « Derniers soins » de la feuille Soins (Épic 22, US22.1)', () => {
  // Care items as the server returns them: newest first (occurredAt desc, id desc).
  const careAt = (i, careType) => ({
    id: `c${i}`, occurredAt: `2026-06-21T${String(20 - i).padStart(2, '0')}:00:00.000Z`, careType, authorId: 'a1',
  })

  it('le plafond est de 5', () => {
    expect(RECENT_CARES_LIMIT).toBe(5)
  })

  it('aucun soin : aucune ligne', () => {
    expect(recentCareRows([])).toEqual([])
  })

  it('3 soins : 3 lignes dans l’ordre reçu, type de présentation traduit, champs d’origine conservés', () => {
    const cares = [careAt(0, 'eye'), careAt(1, 'nose'), careAt(2, 'eye')]

    const rows = recentCareRows(cares)

    expect(rows.map((r) => r.id)).toEqual(['c0', 'c1', 'c2'])
    expect(rows.map((r) => r.type)).toEqual(['eye_care', 'nose_care', 'eye_care'])
    expect(rows[1]).toMatchObject({
      id: 'c1', occurredAt: cares[1].occurredAt, careType: 'nose', authorId: 'a1',
    })
  })

  it('7 soins du nez : seuls les 5 premiers, dans l’ordre reçu', () => {
    const cares = Array.from({ length: 7 }, (_, i) => careAt(i, 'nose'))

    const rows = recentCareRows(cares)

    expect(rows.map((r) => r.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
    expect(rows.every((r) => r.type === 'nose_care')).toBe(true)
  })

  it('l’ordre reçu est conservé même s’il n’est pas chronologique (aucun tri côté client)', () => {
    const cares = [careAt(3, 'eye'), careAt(0, 'nose')]

    expect(recentCareRows(cares).map((r) => r.id)).toEqual(['c3', 'c0'])
  })
})
