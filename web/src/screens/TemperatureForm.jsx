import { useState } from 'react'
import { parseTemperature } from '../temperature'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

/**
 * Saisie / correction d'une température (US15.1). Formulaire **contrôlé pur** : il ne connaît aucun
 * client API, `onSubmit` renvoie une promesse et le bouton reste désactivé jusqu'au *settled* de la
 * mutation → anti double-saisie (D3-G/D15-J), en miroir de `UrineForm`/`BottleFeedingForm`.
 *
 * Mode **création** (défaut) : heure préremplie sur « maintenant », valeur vidée **et heure réarmée
 * sur « maintenant »** après succès pour enchaîner. Mode **édition** (`initial`) : valeur et heure
 * pré-remplies, rien n'est réarmé — le sheet appelant se ferme.
 */
export default function TemperatureForm({ onSubmit, initial = null }) {
  const isEdit = initial != null
  const [value, setValue] = useState(() =>
    // Tenths → °C for display, with the fr-FR comma the user typed in the first place.
    initial?.temperatureCelsiusX10 != null ? (initial.temperatureCelsiusX10 / 10).toFixed(1).replace('.', ',') : '',
  )
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const t = parseTemperature(value)
    if (!t.ok) {
      setError(t.error)
      return
    }
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ occurredAt: iso, temperatureCelsiusX10: t.value })
      if (!isEdit) {
        setValue('') // ready for a next reading (the form stays mounted)
        // Rearm the time too, NEVER on edit. The form stays mounted across a whole fever episode:
        // without this, two readings taken hours apart would both be stamped at the MOUNT time.
        setOccurredAt(toLocalInputValue(new Date()))
      }
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form" aria-label="Température">
      <label className="field">
        <span className="field-label">Température (°C)</span>
        {/* type="text" + inputMode="decimal", NEVER type="number" (D15-J). A number input would
            (1) let its NATIVE validation block the submit before parseTemperature's message is
            shown — the entry would be rejected silently — and (2) not even keep the comma a
            fr-FR keyboard produces. Bounds are enforced by parseTemperature and by the server. */}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
      <button type="submit" disabled={busy} className="btn btn--temp btn--block btn--lg">
        {busy ? '…' : 'Enregistrer'}
      </button>
    </form>
  )
}
