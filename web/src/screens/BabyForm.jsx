import { useState } from 'react'

/**
 * Shared create/edit form (US2.1, D2-E). `initial` prefills for editing; `onSubmit` returns a
 * promise. The submit button is disabled while in flight → anti double-click (D2-G).
 */
export default function BabyForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '')
  const [sex, setSex] = useState(initial?.sex ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim()) {
      setError('Le prénom est requis.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ firstName: firstName.trim(), birthDate: birthDate || null, sex: sex || null })
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false) // on success the parent unmounts this form
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card form">
      <label className="field">
        <span className="field-label">Prénom</span>
        <input value={firstName} required onChange={(e) => setFirstName(e.target.value)} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Date de naissance (optionnelle)</span>
        <input type="date" value={birthDate ?? ''} onChange={(e) => setBirthDate(e.target.value)} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Sexe (optionnel)</span>
        <select value={sex ?? ''} onChange={(e) => setSex(e.target.value)} className="select">
          <option value="">Non renseigné</option>
          <option value="female">Fille</option>
          <option value="male">Garçon</option>
        </select>
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="modal-row" style={{ justifyContent: 'stretch' }}>
        <button type="submit" disabled={busy} className="btn btn--primary btn--lg" style={{ flex: 1 }}>{busy ? '…' : submitLabel}</button>
        <button type="button" onClick={onCancel} className="btn btn--ghost btn--lg">Annuler</button>
      </div>
    </form>
  )
}
