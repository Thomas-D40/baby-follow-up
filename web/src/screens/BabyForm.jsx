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
    <form onSubmit={handleSubmit} style={styles.card}>
      <label style={styles.label}>
        Prénom
        <input value={firstName} required onChange={(e) => setFirstName(e.target.value)} style={styles.input} />
      </label>
      <label style={styles.label}>
        Date de naissance (optionnelle)
        <input type="date" value={birthDate ?? ''} onChange={(e) => setBirthDate(e.target.value)} style={styles.input} />
      </label>
      <label style={styles.label}>
        Sexe (optionnel)
        <select value={sex ?? ''} onChange={(e) => setSex(e.target.value)} style={styles.input}>
          <option value="">Non renseigné</option>
          <option value="female">Fille</option>
          <option value="male">Garçon</option>
        </select>
      </label>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.row}>
        <button type="submit" disabled={busy} style={styles.button}>{busy ? '…' : submitLabel}</button>
        <button type="button" onClick={onCancel} style={styles.cancel}>Annuler</button>
      </div>
    </form>
  )
}

const styles = {
  card: { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 360, margin: '2rem auto', fontFamily: 'system-ui, sans-serif' },
  label: { display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.9rem' },
  input: { padding: '.6rem', fontSize: '1rem', borderRadius: 6, border: '1px solid #ccc' },
  row: { display: 'flex', gap: '.75rem' },
  button: { flex: 1, padding: '.7rem', fontSize: '1rem', borderRadius: 6, border: 0, background: '#3b82f6', color: '#fff', cursor: 'pointer' },
  cancel: { padding: '.7rem 1rem', fontSize: '1rem', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' },
  error: { color: '#dc2626', fontSize: '.9rem', margin: 0 },
}
