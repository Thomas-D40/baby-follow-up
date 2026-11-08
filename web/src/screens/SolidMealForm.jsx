import { useState } from 'react'
import { toLocalInputValue, toOccurredAtIso } from '../bottleFeeding'
import { FIXED_DISHES, parseDishLabel } from '../dish'
import { useDishSearch } from '../services/dishes'
import { PORTIONS, PORTION_LABEL } from '../solidMeal'

export default function SolidMealForm({ onSubmit, initial = null, time, onTimeChange }) {
  const isEdit = initial != null
  const [ownOccurredAt, setOwnOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  // The meal sheet owns the time when it passes one (D18-AL); alone (edit from the recap) the form keeps its own.
  const occurredAt = time ?? ownOccurredAt
  const setOccurredAt = onTimeChange ?? setOwnOccurredAt
  const [dish, setDish] = useState(() => initial?.dish ?? '')
  const [portion, setPortion] = useState(() => initial?.portion ?? null)
  const [addChecked, setAddChecked] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const { suggestions, canAddToDishes } = useDishSearch(dish)

  // Pressing the pressed portion releases it: back to "unspecified" (D18-O).
  const togglePortion = (value) => setPortion((current) => (current === value ? null : value))
  // Consent to share is given for one label: any new label shows the box unchecked again (D18-Y).
  const changeDish = (value) => {
    setDish(value)
    setAddChecked(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const d = parseDishLabel(dish)
    if (!d.ok) {
      setError(d.error)
      return
    }
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      // Every field is always sent: a null portion clears it on the server (D18-AC). The dish list
      // only grows at creation, and a hidden box never sends true (D18-AG).
      await onSubmit(
        isEdit
          ? { occurredAt: iso, dish: d.value, portion }
          : { occurredAt: iso, dish: d.value, portion, addToDishes: canAddToDishes && addChecked },
      )
      if (!isEdit) {
        setDish('')
        setPortion(null)
        setAddChecked(false)
      }
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label className="field">
        <span className="field-label">Plat</span>
        {/* No maxLength: the 60-character message must stay reachable (D18-AD). */}
        <input
          type="text"
          value={dish}
          onChange={(e) => changeDish(e.target.value)}
          className="input"
        />
      </label>
      <div className="toggle-row toggle-row--wrap" role="group" aria-label="Propositions de plats">
        {FIXED_DISHES.map((label) => (
          <button key={label} type="button" className="toggle-chip" onClick={() => changeDish(label)}>
            {label}
          </button>
        ))}
        {suggestions.map((s) => (
          <button key={s.id} type="button" className="toggle-chip" onClick={() => changeDish(s.label)}>
            {s.label}
          </button>
        ))}
      </div>
      {!isEdit && canAddToDishes && (
        <div className="field">
          <label className="check-row">
            <input
              type="checkbox"
              checked={addChecked}
              onChange={(e) => setAddChecked(e.target.checked)}
            />
            <span className="field-label">Ajouter à mes plats</span>
          </label>
          <span className="field-hint">Ce plat sera proposé à tous les utilisateurs</span>
        </div>
      )}
      <div className="toggle-row" role="group" aria-label="Portion">
        {PORTIONS.map((p) => (
          <button
            key={p}
            type="button"
            className={`toggle-chip ${portion === p ? 'toggle-chip--meal-on' : ''}`}
            aria-pressed={portion === p}
            onClick={() => togglePortion(p)}
          >
            {PORTION_LABEL[p]}
          </button>
        ))}
      </div>
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
      <button type="submit" disabled={busy} className="btn btn--milk btn--block btn--lg">{busy ? '…' : 'Enregistrer'}</button>
    </form>
  )
}
