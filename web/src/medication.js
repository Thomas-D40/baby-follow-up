// Pure model of a medication intake (Épic 19, US19.1). Never imports calendar.js (calendar.js
// imports this module for the recap row detail).

import { tidyLabel } from './textLabel'

// The six names offered by the front; the server ignores this list (D19-L).
export const DEFAULT_MEDICATIONS = ['Doliprane', 'Advil', 'Ventoline', 'Célestène', 'Amoxicilline', 'Smecta']
export const OTHER_MEDICATION = 'other'
export const OTHER_MEDICATION_LABEL = 'Autre'
export const MEDICATION_TEXT_MAX_LENGTH = 60

// Same formatting rule as the server (TextLabels.tidy), then the required / length checks.
export function parseMedicationName(raw) {
  const name = tidyLabel(raw)
  if (name === '') return { ok: false, error: 'Indiquez le médicament.' }
  if (name.length > MEDICATION_TEXT_MAX_LENGTH) {
    return { ok: false, error: 'Le médicament ne doit pas dépasser 60 caractères.' }
  }
  return { ok: true, value: name }
}

// The name to send for the chosen option: a default is sent as is, "Autre" sends the tidied free text.
export function resolveMedicationName(choice, freeText) {
  if (choice == null) return { ok: false, error: 'Choisissez un médicament.' }
  if (choice === OTHER_MEDICATION) return parseMedicationName(freeText)
  return { ok: true, value: choice }
}

// The dosage is optional: blank means none (null), which also clears it on a PATCH.
export function parseDosage(raw) {
  const dosage = tidyLabel(raw)
  if (dosage === '') return { ok: true, value: null }
  if (dosage.length > MEDICATION_TEXT_MAX_LENGTH) {
    return { ok: false, error: 'La posologie ne doit pas dépasser 60 caractères.' }
  }
  return { ok: true, value: dosage }
}

// Reopening a stored name: a STRICT match with a default selects it, anything else is "Autre" with
// the stored text (D19-M) — no conversion of "doliprane" into "Doliprane".
export function medicationChoiceOf(medicationName) {
  if (!medicationName) return { choice: null, freeText: '' }
  if (DEFAULT_MEDICATIONS.includes(medicationName)) return { choice: medicationName, freeText: '' }
  return { choice: OTHER_MEDICATION, freeText: medicationName }
}

// Recap / list detail: the name, followed by the dosage when there is one (D19-F).
export function describeMedication({ medicationName, dosage }) {
  return dosage ? `${medicationName} · ${dosage}` : medicationName
}
