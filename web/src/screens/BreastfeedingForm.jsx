import { useState } from 'react'
import { toLocalInputValue, toOccurredAtIso } from '../bottleFeeding'
import { BREAST_SIDE_LABEL, parseDuration } from '../breastfeeding'

const SIDES = ['left', 'right']

export default function BreastfeedingForm({ onSubmit, initial = null, time, onTimeChange }) {
  const isEdit = initial != null
  const [ownOccurredAt, setOwnOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  // The meal sheet owns the time when it passes one (D18-AL); alone (edit from the recap) the form keeps its own.
  const occurredAt = time ?? ownOccurredAt
  const setOccurredAt = onTimeChange ?? setOwnOccurredAt
  const [side, setSide] = useState(() => initial?.side ?? null)
  const [duration, setDuration] = useState(() => (initial?.durationMinutes != null ? String(initial.durationMinutes) : ''))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Pressing the pressed side releases it: back to "unspecified" (D18-K).
  const toggleSide = (value) => setSide((current) => (current === value ? null : value))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const d = parseDuration(duration)
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
      // Every field is always sent: null clears it on the server (D18-AC).
      await onSubmit({ occurredAt: iso, side, durationMinutes: d.value })
      if (!isEdit) {
        setSide(null)
        setDuration('')
      }
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="toggle-row" role="group" aria-label="Côté">
        {SIDES.map((s) => (
          <button
            key={s}
            type="button"
            className={`toggle-chip ${side === s ? 'toggle-chip--breast-on' : ''}`}
            aria-pressed={side === s}
            onClick={() => toggleSide(s)}
          >
            {BREAST_SIDE_LABEL[s]}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Durée (min)</span>
        {/* Text, never type="number": the bounds are governed by parseDuration, and a native number
            input would swallow "7,5" before the message could show. */}
        <input
          type="text"
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
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
      <button type="submit" disabled={busy} className="btn btn--milk btn--block btn--lg">{busy ? '…' : 'Enregistrer'}</button>
    </form>
  )
}
