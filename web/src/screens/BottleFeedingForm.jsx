import { useState } from 'react'
import { parseQuantity, toLocalInputValue, toOccurredAtIso } from '../bottleFeeding'

/**
 * Formulaire rapide de saisie d'un biberon (US3.1). `occurredAt` prérempli sur « maintenant »,
 * focus d'emblée sur la quantité (saisie en un geste). `onSubmit` renvoie une promesse ; le bouton
 * est désactivé jusqu'au *settled* de la mutation → anti double-saisie (D3-G). Sur succès, on vide
 * la quantité pour enchaîner ; échec apparent → message clair + resoumission manuelle.
 */
export default function BottleFeedingForm({ onSubmit }) {
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()))
  const [quantity, setQuantity] = useState('')
  const [milkType, setMilkType] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const q = parseQuantity(quantity)
    if (!q.ok) {
      setError(q.error)
      return
    }
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ occurredAt: iso, quantityMl: q.value, milkType: milkType || null })
      setQuantity('') // prêt pour une saisie suivante (le formulaire reste monté)
      setMilkType('')
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label className="field">
        <span className="field-label">Quantité (ml)</span>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        {/* Bornes gouvernées par parseQuantity + le serveur (D3-E), pas par la validation native
            (un rangeOverflow bloquerait le submit avant le message JS). */}
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="input"
        />
      </label>
      <label className="field">
        <span className="field-label">Type de lait</span>
        <select value={milkType} onChange={(e) => setMilkType(e.target.value)} className="select">
          <option value="">—</option>
          <option value="breast">Maternel</option>
          <option value="formula">Artificiel</option>
        </select>
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
