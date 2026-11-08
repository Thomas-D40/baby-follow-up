import { useState } from 'react'
import { parseDishLabel } from '../dish'
import { useDeleteDish, useManageableDishes, useRenameDish } from '../services/dishes'
import { InlineDeleteConfirm } from './DeleteConfirm'

function DishRenameForm({ dish, onSubmit, onCancel }) {
  const [label, setLabel] = useState(dish.label)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const parsed = parseDishLabel(label)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    try {
      await onSubmit(parsed.value)
    } catch (err) {
      setError(err?.status === 409 ? 'Ce plat existe déjà.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label className="field">
        <span className="field-label">Nouveau nom</span>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className="input" />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="modal-row">
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn--ghost btn--sm">Annuler</button>
        <button type="submit" disabled={busy} className="btn btn--milk btn--sm">{busy ? '…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

export default function DishesPanel() {
  const { dishes, isLoading } = useManageableDishes()
  const renameMut = useRenameDish()
  const deleteMut = useDeleteDish()
  const [renamingId, setRenamingId] = useState(null)
  const [notice, setNotice] = useState(null)

  async function rename(dish, label) {
    await renameMut.mutateAsync({ id: dish.id, label })
    setRenamingId(null)
    setNotice('Plat renommé.')
  }

  return (
    <>
      {notice && <p role="status" className="notice notice--success">{notice}</p>}
      {isLoading ? (
        <p className="empty">…</p>
      ) : dishes.length === 0 ? (
        <p className="empty">Vous n'avez encore ajouté aucun plat.</p>
      ) : (
        <ul className="event-list" aria-label="Mes plats">
          {dishes.map((d) => (
            <li key={d.id} className="event-row">
              {renamingId === d.id ? (
                <div className="grow">
                  <DishRenameForm dish={d} onSubmit={(label) => rename(d, label)} onCancel={() => setRenamingId(null)} />
                </div>
              ) : (
                <>
                  <span className="grow">{d.label}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--edit"
                    aria-label={`Renommer ${d.label}`}
                    title="Renommer"
                    onClick={() => { setNotice(null); setRenamingId(d.id) }}
                  >
                    ✏️
                  </button>
                  <InlineDeleteConfirm
                    prompt="Supprimer ce plat ?"
                    triggerAriaLabel={`Supprimer ${d.label}`}
                    onDelete={() => deleteMut.mutateAsync(d.id)}
                    onDeleted={() => setNotice('Plat supprimé.')}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
