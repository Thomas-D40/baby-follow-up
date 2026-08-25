import { describe, it, expect } from 'vitest'
import {
  MEDICAL_CARE_LABEL,
  careEventType,
  careTypeOfEvent,
  medicalCareLabel,
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
