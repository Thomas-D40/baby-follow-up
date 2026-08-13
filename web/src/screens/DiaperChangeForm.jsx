import { useState } from 'react'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

/**
 * Formulaire unique « Couche » (US13.2, Lot 4, D13-G) : chemin de création unique du front pour les 3
 * cas (urine seule, selle seule, les deux). Deux toggles « Urine 💧 » et « Selle 💩 » (au moins un
 * requis — le bouton de validation est désactivé si aucun coché). Le select de consistance n'apparaît
 * QUE si « Selle » est cochée. L'heure est préremplie sur « maintenant ».
 *
 * À la validation → un seul appel `createDiaperChange` (endpoint atomique : les deux ou aucun). Le
 * bouton est désactivé jusqu'au *settled* de la mutation → anti double-saisie (cohérent D5-J/D3-G).
 * L'édition/suppression d'une urine ou d'une selle existante reste par ressource (calendrier).
 */
export default function DiaperChangeForm({ onSubmit }) {
  const [withUrine, setWithUrine] = useState(true)
  const [withStool, setWithStool] = useState(false)
  const [consistency, setConsistency] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()))
  const [showTime, setShowTime] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const nothingSelected = !withUrine && !withStool

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (nothingSelected) {
      setError('Cochez au moins « Urine » ou « Selle ».')
      return
    }
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        occurredAt: iso,
        withUrine,
        withStool,
        // consistance envoyée uniquement si « Selle » cochée (le back rejette consistance sans selle).
        consistency: withStool ? (consistency || null) : null,
      })
      // Réinitialise pour enchaîner une saisie suivante (le formulaire reste monté).
      setWithUrine(true)
      setWithStool(false)
      setConsistency('')
      setOccurredAt(toLocalInputValue(new Date()))
      setShowTime(false)
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="toggle-row" role="group" aria-label="Type de couche">
        <button
          type="button"
          className={`toggle-chip ${withUrine ? 'toggle-chip--on' : ''}`}
          aria-pressed={withUrine}
          onClick={() => setWithUrine((v) => !v)}
        >
          <span aria-hidden="true">💧</span> Urine
        </button>
        <button
          type="button"
          className={`toggle-chip ${withStool ? 'toggle-chip--on' : ''}`}
          aria-pressed={withStool}
          onClick={() => setWithStool((v) => !v)}
        >
          <span aria-hidden="true">💩</span> Selle
        </button>
      </div>

      {withStool && (
        <label className="field">
          <span className="field-label">Consistance</span>
          <select value={consistency} onChange={(e) => setConsistency(e.target.value)} className="select">
            <option value="">—</option>
            <option value="hard">Dure</option>
            <option value="soft">Molle</option>
            <option value="liquid">Liquide</option>
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={() => setShowTime((v) => !v)}
        className="linkbtn"
        style={{ alignSelf: 'flex-start' }}
        aria-expanded={showTime}
      >
        {showTime ? '− Masquer l’heure' : '+ Préciser l’heure'}
      </button>

      {showTime && (
        <label className="field">
          <span className="field-label">Quand</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="input"
          />
        </label>
      )}

      {error && <p className="error-text">{error}</p>}
      <button
        type="submit"
        disabled={busy || nothingSelected}
        className="btn btn--stool btn--block btn--lg"
      >
        {busy ? '…' : 'Enregistrer'}
      </button>
    </form>
  )
}
