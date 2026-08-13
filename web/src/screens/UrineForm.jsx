import { useState } from 'react'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

/**
 * Formulaire d'édition d'une urine (US13.2, Lot 4) : correction de l'heure d'un événement existant.
 * La création passe par le formulaire unique « Couche » (`DiaperChangeForm`) ; ce form ne sert donc
 * qu'en **édition** (prop `initial`), en miroir de `StoolForm` mais sans consistance (l'urine n'a
 * qu'une heure). `onSubmit` renvoie une promesse ; le bouton est désactivé jusqu'au *settled* de la
 * mutation → anti double-saisie. Le sheet appelant se ferme au succès.
 */
export default function UrineForm({ onSubmit, initial = null }) {
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ occurredAt: iso })
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
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
      <button type="submit" disabled={busy} className="btn btn--stool btn--block btn--lg">{busy ? '…' : 'Enregistrer'}</button>
    </form>
  )
}
