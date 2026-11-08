import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MEDICATIONS,
  MEDICATION_TEXT_MAX_LENGTH,
  OTHER_MEDICATION,
  OTHER_MEDICATION_LABEL,
  describeMedication,
  medicationChoiceOf,
  parseDosage,
  parseMedicationName,
  resolveMedicationName,
} from './medication'

const EMPTY_ERROR = 'Indiquez le médicament.'
const LONG_ERROR = 'Le médicament ne doit pas dépasser 60 caractères.'
const NONE_ERROR = 'Choisissez un médicament.'
const DOSAGE_LONG_ERROR = 'La posologie ne doit pas dépasser 60 caractères.'

describe('constantes (Épic 19, D19-L)', () => {
  it('six médicaments par défaut, dans l’ordre', () => {
    expect(DEFAULT_MEDICATIONS).toEqual(['Doliprane', 'Advil', 'Ventoline', 'Célestène', 'Amoxicilline', 'Smecta'])
  })

  it('« Autre » : valeur interne, libellé et plafond de 60', () => {
    expect(OTHER_MEDICATION).toBe('other')
    expect(OTHER_MEDICATION_LABEL).toBe('Autre')
    expect(MEDICATION_TEXT_MAX_LENGTH).toBe(60)
  })
})

describe('parseMedicationName — médicament libre : obligatoire, 60 caractères, mis en forme', () => {
  it.each(['', '   ', ' \t '])('« %s » → « Indiquez le médicament. »', (raw) => {
    expect(parseMedicationName(raw)).toEqual({ ok: false, error: EMPTY_ERROR })
  })

  it('61 caractères → « Le médicament ne doit pas dépasser 60 caractères. »', () => {
    expect(parseMedicationName('x'.repeat(61))).toEqual({ ok: false, error: LONG_ERROR })
  })

  it('60 caractères sont acceptés, bords non comptés', () => {
    expect(parseMedicationName('x'.repeat(60))).toEqual({ ok: true, value: 'x'.repeat(60) })
    expect(parseMedicationName('   ' + 'x'.repeat(60) + '   ')).toEqual({ ok: true, value: 'x'.repeat(60) })
  })

  it('bords retirés, blancs répétés réduits, casse et accents conservés', () => {
    expect(parseMedicationName('  Gaviscon   nourrisson  ')).toEqual({ ok: true, value: 'Gaviscon nourrisson' })
    expect(parseMedicationName('Célestène')).toEqual({ ok: true, value: 'Célestène' })
  })

  it('un texte égal à un défaut reste tel que tapé (D19-M)', () => {
    expect(parseMedicationName('doliprane')).toEqual({ ok: true, value: 'doliprane' })
  })
})

describe('resolveMedicationName — choix + texte libre', () => {
  it.each([null, undefined])('aucune option (%s) → « Choisissez un médicament. »', (choice) => {
    expect(resolveMedicationName(choice, '')).toEqual({ ok: false, error: NONE_ERROR })
  })

  it('un défaut donne son libellé exact, le texte libre est ignoré', () => {
    expect(resolveMedicationName('Smecta', 'résidu')).toEqual({ ok: true, value: 'Smecta' })
  })

  it('« Autre » applique les règles du médicament libre au texte', () => {
    expect(resolveMedicationName(OTHER_MEDICATION, '  Gaviscon ')).toEqual({ ok: true, value: 'Gaviscon' })
    expect(resolveMedicationName(OTHER_MEDICATION, '   ')).toEqual({ ok: false, error: EMPTY_ERROR })
    expect(resolveMedicationName(OTHER_MEDICATION, 'x'.repeat(61))).toEqual({ ok: false, error: LONG_ERROR })
  })
})

describe('parseDosage — posologie optionnelle (D19-K)', () => {
  it.each(['', '   ', null, undefined])('« %s » → pas de posologie (null)', (raw) => {
    expect(parseDosage(raw)).toEqual({ ok: true, value: null })
  })

  it('mise en forme : bords retirés, blancs réduits', () => {
    expect(parseDosage('  2  ml')).toEqual({ ok: true, value: '2 ml' })
    expect(parseDosage('1 dose 6 kg')).toEqual({ ok: true, value: '1 dose 6 kg' })
  })

  it('60 caractères passent, 61 sont refusés (après mise en forme)', () => {
    expect(parseDosage('x'.repeat(60))).toEqual({ ok: true, value: 'x'.repeat(60) })
    expect(parseDosage('  ' + 'x'.repeat(60) + '  ')).toEqual({ ok: true, value: 'x'.repeat(60) })
    expect(parseDosage('x'.repeat(61))).toEqual({ ok: false, error: DOSAGE_LONG_ERROR })
  })
})

describe('medicationChoiceOf — réouverture à l’édition (D19-M)', () => {
  it.each([null, undefined, ''])('nom absent (%s) → aucun choix', (name) => {
    expect(medicationChoiceOf(name)).toEqual({ choice: null, freeText: '' })
  })

  it.each(DEFAULT_MEDICATIONS)('« %s » → ce défaut, champ libre vide', (name) => {
    expect(medicationChoiceOf(name)).toEqual({ choice: name, freeText: '' })
  })

  it('un nom libre → « Autre » + texte', () => {
    expect(medicationChoiceOf('Gaviscon')).toEqual({ choice: OTHER_MEDICATION, freeText: 'Gaviscon' })
  })

  it('égalité stricte : « doliprane » (casse) et « Celestene » (accent) restent des textes libres', () => {
    expect(medicationChoiceOf('doliprane')).toEqual({ choice: OTHER_MEDICATION, freeText: 'doliprane' })
    expect(medicationChoiceOf('Celestene')).toEqual({ choice: OTHER_MEDICATION, freeText: 'Celestene' })
    expect(medicationChoiceOf('Célestène')).toEqual({ choice: 'Célestène', freeText: '' })
  })
})

describe('describeMedication — ligne d’une prise', () => {
  it('nom seul quand il n’y a pas de posologie', () => {
    expect(describeMedication({ medicationName: 'Doliprane', dosage: null })).toBe('Doliprane')
  })

  it('nom · posologie', () => {
    expect(describeMedication({ medicationName: 'Doliprane', dosage: '1 dose 6 kg' })).toBe('Doliprane · 1 dose 6 kg')
  })
})
