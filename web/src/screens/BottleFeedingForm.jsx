import { useState } from 'react'
import { parseQuantity, toLocalInputValue, toOccurredAtIso } from '../bottleFeeding'

/**
 * Formulaire de saisie/édition d'un biberon (US3.1 création, Épic 8 édition).
 *
 * Mode **création** (par défaut) : `occurredAt` prérempli sur « maintenant », focus d'emblée sur la
 * quantité (saisie en un geste). Sur succès, on vide la quantité pour enchaîner.
 *
 * Mode **édition** (DA-1) : passe `initial` (valeurs pré-remplies, depuis l'event existant). Le bouton
 * affiche « Enregistrer », le formulaire reste tel quel après succès (le sheet appelant se ferme). On
 * réutilise le MÊME formulaire (pas de `*FormEdit` dupliqué).
 *
 * `onSubmit` renvoie une promesse ; le bouton est désactivé jusqu'au *settled* de la mutation → anti
 * double-saisie (D3-G/DA-4). Échec apparent → message clair + resoumission manuelle.
 */
export default function BottleFeedingForm({ onSubmit, initial = null }) {
  const isEdit = initial != null
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  const [quantity, setQuantity] = useState(() => (initial?.quantityMl != null ? String(initial.quantityMl) : ''))
  const [milkType, setMilkType] = useState(() => initial?.milkType ?? '')
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
      if (!isEdit) {
        setQuantity('') // prêt pour une saisie suivante (le formulaire reste monté)
        setMilkType('')
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
