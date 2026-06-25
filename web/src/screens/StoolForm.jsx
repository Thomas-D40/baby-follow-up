import { useState } from 'react'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

/**
 * Formulaire de saisie/édition d'une selle (US5.1 création, Épic 8 édition).
 *
 * Mode **création** (par défaut) : saisie en 1 tap, `occurredAt` prérempli sur « maintenant », champs
 * optionnels (consistance, heure) repliés derrière « Préciser… ». Sur succès, on réinitialise pour
 * enchaîner.
 *
 * Mode **édition** (DA-1) : passe `initial` (valeurs pré-remplies). Les détails sont dépliés d'emblée
 * (on édite des champs déjà renseignés). Le bouton affiche « Enregistrer » ; le sheet appelant se ferme
 * au succès. On réutilise le MÊME formulaire (pas de `*FormEdit` dupliqué).
 *
 * `onSubmit` renvoie une promesse ; le bouton est désactivé jusqu'au *settled* de la mutation → anti
 * double-saisie (D5-J / D3-G / DA-4). Échec apparent → message clair. La couleur est hors périmètre (D5-F).
 */
export default function StoolForm({ onSubmit, initial = null }) {
  const isEdit = initial != null
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  const [consistency, setConsistency] = useState(() => initial?.consistency ?? '')
  const [showDetails, setShowDetails] = useState(isEdit) // édition : détails dépliés d'emblée
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
      await onSubmit({ occurredAt: iso, consistency: consistency || null })
      if (!isEdit) {
        setConsistency('') // prêt pour une saisie suivante (le formulaire reste monté)
        setOccurredAt(toLocalInputValue(new Date()))
        setShowDetails(false)
      }
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      {!isEdit && (
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="linkbtn"
          style={{ alignSelf: 'flex-start' }}
          aria-expanded={showDetails}
        >
          {showDetails ? '− Masquer les détails' : '+ Préciser (consistance, heure)'}
        </button>
      )}

      {showDetails && (
        <>
          <label className="field">
            <span className="field-label">Consistance</span>
            <select value={consistency} onChange={(e) => setConsistency(e.target.value)} className="select">
              <option value="">—</option>
              <option value="hard">Dure</option>
              <option value="soft">Molle</option>
              <option value="liquid">Liquide</option>
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
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn--stool btn--block btn--lg">{busy ? '…' : 'Enregistrer'}</button>
    </form>
  )
}
