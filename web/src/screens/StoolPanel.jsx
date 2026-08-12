import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createStool, listStools, updateStool } from '../api'
import { CONSISTENCY_LABEL } from '../stool'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import StoolForm from './StoolForm'
import BottomSheet from './BottomSheet'

/**
 * Saisie + liste + édition des dernières selles sur la fiche bébé (US5.1, D5-B, Épic 8). La liste
 * (keyset, D3-J/D5-I) alimente la fiche et est invalidée après chaque mutation. Mutations d'écriture
 * en `retry: 0` (D5-J/D3-G/DA-4 : pas de rejeu auto qui dupliquerait en réponse-perdue) ; la lecture
 * garde le retry par défaut. La suppression exige une **confirmation inline** (Épic 7, D7-B) sur
 * `useDeleteEvent` (D7-C).
 *
 * L'**édition** (Épic 8, DA-1/DA-2) — qui remplace le « supprimer + re-saisir » de la v1 — ouvre le
 * MÊME `StoolForm` (prop `initial`, détails dépliés) dans un `BottomSheet` depuis un bouton ✏️ sur
 * chaque ligne. Au succès : invalidation par **préfixe** `['babies', babyId]` (DA-4).
 */
export default function StoolPanel({ babyId }) {
  const qc = useQueryClient()
  const key = ['babies', babyId, 'stools']
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listStools(babyId) })
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null) // l'event en cours d'édition, ou null

  const createMut = useMutation({
    mutationFn: (body) => createStool(babyId, body),
    retry: 0,
    // Invalidation par **préfixe** `['babies', babyId]` (DA-4/US11.3) : rafraîchit aussi le récap
    // calendrier (events + daily-totals) qui dérive du même event, pas seulement la liste locale.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['babies', babyId] }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, patch }) => updateStool(babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] }) // invalidation préfixe (DA-4)
      setEditing(null)
      setNotice('Selle mise à jour.')
    },
  })
  const deleteMut = useDeleteEvent(babyId)

  const items = data?.items ?? []

  return (
    <>
      <StoolForm onSubmit={(body) => createMut.mutateAsync(body)} />

      {notice && <p role="status" className="notice notice--success">{notice}</p>}

      <h4 className="subtitle">Dernières selles</h4>
      {isLoading ? (
        <p className="empty">…</p>
      ) : items.length === 0 ? (
        <p className="empty">Aucune selle enregistrée.</p>
      ) : (
        <ul className="event-list">
          {items.map((s) => (
            <li key={s.id} className="event-row">
              <span className="grow">
                <span className="event-time">{formatWhen(s.occurredAt)}</span>
                {s.consistency ? ` · ${CONSISTENCY_LABEL[s.consistency]}` : ''}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--edit"
                aria-label={`Modifier la selle du ${formatWhen(s.occurredAt)}`}
                title="Modifier"
                onClick={() => setEditing(s)}
              >
                ✏️
              </button>
              <InlineDeleteConfirm
                prompt="Supprimer cette selle ?"
                triggerAriaLabel={`Supprimer la selle du ${formatWhen(s.occurredAt)}`}
                onDelete={() => deleteMut.mutateAsync({ type: 'stool', id: s.id })}
                onDeleted={() => setNotice('Selle supprimée.')}
              />
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editing != null}
        title={<>✏️ Modifier la selle</>}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <StoolForm
            initial={editing}
            onSubmit={(body) => updateMut.mutateAsync({ id: editing.id, patch: body })}
          />
        )}
      </BottomSheet>
    </>
  )
}

// Affichage local simple ; le formatage Europe/Paris dédié arrive à l'Épic 6.
function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
