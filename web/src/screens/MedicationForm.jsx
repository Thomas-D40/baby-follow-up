import { useState } from 'react'
import {
  DEFAULT_MEDICATIONS,
  OTHER_MEDICATION,
  OTHER_MEDICATION_LABEL,
  medicationChoiceOf,
  parseDosage,
  resolveMedicationName,
} from '../medication'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

// Creation and edit of a medication intake (US19.1). Pure controlled form: `onSubmit` returns a
// promise and the button is disabled until it settles (anti double-submit). The body ALWAYS carries
// the three fields, on creation and on edit: the server clears the dosage on null (D19-P).
export default function MedicationForm({ onSubmit, initial = null }) {
  const isEdit = initial != null
  const initialChoice = medicationChoiceOf(initial?.medicationName)

  const [choice, setChoice] = useState(initialChoice.choice)
  const [freeText, setFreeText] = useState(initialChoice.freeText)
  const [dosage, setDosage] = useState(initial?.dosage ?? '')
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // The options are exclusive and never released; leaving "Autre" drops its free text.
  function pick(option) {
    setChoice(option)
    if (option !== OTHER_MEDICATION) setFreeText('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    // Order of the checks: medication, dosage, time. Only the first failure is shown.
    const name = resolveMedicationName(choice, freeText)
    if (!name.ok) {
      setError(name.error)
      return
    }
    const parsedDosage = parseDosage(dosage)
    if (!parsedDosage.ok) {
      setError(parsedDosage.error)
      return
    }
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ occurredAt: iso, medicationName: name.value, dosage: parsedDosage.value })
      if (!isEdit) {
        setChoice(null)
        setFreeText('')
        setDosage('')
        setOccurredAt(toLocalInputValue(new Date()))
      }
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  const options = [
    ...DEFAULT_MEDICATIONS.map((name) => ({ value: name, label: name })),
    { value: OTHER_MEDICATION, label: OTHER_MEDICATION_LABEL },
  ]

  return (
    <form
      onSubmit={handleSubmit}
      className="form"
      aria-label={isEdit ? 'Modifier le médicament' : 'Prise de médicament'}
    >
      <div className="toggle-row toggle-row--wrap" role="group" aria-label="Choix du médicament">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`toggle-chip ${choice === option.value ? 'toggle-chip--care-on' : ''}`}
            aria-pressed={choice === option.value}
            onClick={() => pick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {choice === OTHER_MEDICATION && (
        <label className="field">
          <span className="field-label">Médicament</span>
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            className="input"
          />
        </label>
      )}

      <label className="field">
        <span className="field-label">Posologie</span>
        <input
          type="text"
          value={dosage}
          onChange={(e) => setDosage(e.target.value)}
          className="input"
        />
      </label>

      <label className="field">
        <span className="field-label">Quand</span>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="input"
        />
      </label>

      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn--care btn--block btn--lg">
        {busy ? '…' : 'Enregistrer'}
      </button>
    </form>
  )
}
