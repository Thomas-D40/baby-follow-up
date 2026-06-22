import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createStool, listStools } from '../api'
import { CONSISTENCY_LABEL } from '../stool'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import StoolForm from './StoolForm'

/**
 * Saisie + liste des dernières selles sur la fiche bébé (US5.1, D5-B). La liste (keyset, D3-J/D5-I)
 * alimente la fiche et est invalidée après chaque mutation. Mutations d'écriture en `retry: 0`
 * (D5-J/D3-G : pas de rejeu auto qui dupliquerait en réponse-perdue) ; la lecture garde le retry par
 * défaut. La correction passe par supprimer + re-saisir (édition non câblée en UI v1, D5-J) : la
 * suppression exige une **confirmation inline** (Épic 7, D7-B) sur `useDeleteEvent` (D7-C).
 */
export default function StoolPanel({ babyId }) {
  const qc = useQueryClient()
  const key = ['babies', babyId, 'stools']
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listStools(babyId) })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const [notice, setNotice] = useState(null)

  const createMut = useMutation({
    mutationFn: (body) => createStool(babyId, body),
    retry: 0,
    onSuccess: refresh,
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
    </>
  )
}

// Affichage local simple ; le formatage Europe/Paris dédié arrive à l'Épic 6.
function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
