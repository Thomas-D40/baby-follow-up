// Pure medical-care logic (Épic 15, US15.2), extracted for unit testing. No network call here.
//
// ⛔ Same rule as `temperature.js`: this module must NEVER import `calendar.js` (cycle guard).
//
// Two vocabularies coexist and this module is the ONLY translation point between them:
//   - the RESOURCE speaks `careType` ∈ `eye | nose`   (table `medical_care`, `/medical-cares`)
//   - the RECAP speaks presentation types `eye_care | nose_care` (K1 / D15-F′): filter toggles,
//     tags, emojis, labels and delete clients all key on `type`.
// Mixing them up is a silent bug: `DELETE_CLIENT['eye']` is `undefined` → TypeError on delete.

/** FR labels by care type (D15-I). Extensible: add an entry when a type is added server-side. */
export const MEDICAL_CARE_LABEL = { eye: 'Yeux', nose: 'Nez' }

/** FR label of a care type; falls back on the raw code if unknown (soft degradation, cf. vitamin.js). */
export function medicalCareLabel(careType) {
  return MEDICAL_CARE_LABEL[careType] ?? careType
}

/** Resource `careType` → calendar presentation type. */
export const CARE_EVENT_TYPE = { eye: 'eye_care', nose: 'nose_care' }

/** `'eye'` → `'eye_care'`. Used wherever a `/medical-cares` item enters a mixed event list. */
export function careEventType(careType) {
  return CARE_EVENT_TYPE[careType] ?? careType
}

/** Calendar presentation type → resource `careType`. */
export const CARE_TYPE_BY_EVENT = { eye_care: 'eye', nose_care: 'nose' }

/** `'eye_care'` → `'eye'`. Used when editing a care row: the PATCH goes to the RESOURCE. */
export function careTypeOfEvent(eventType) {
  return CARE_TYPE_BY_EVENT[eventType] ?? eventType
}
