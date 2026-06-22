import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBottleFeeding, listBottleFeedings } from '../api'
import { MILK_TYPE_LABEL } from '../bottleFeeding'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import BottleFeedingForm from './BottleFeedingForm'

/**
 * Saisie + liste des derniers biberons sur la fiche bébé (US3.1, D3-B). La liste (keyset, D3-J)
 * alimente la fiche (anti create-aveugle) et est invalidée après chaque mutation. Mutations
 * d'écriture en `retry: 0` (D3-G : pas de rejeu auto qui dupliquerait en réponse-perdue) ; la lecture
 * garde le retry par défaut. La suppression passe par une **confirmation inline** (Épic 7, D7-B) sur
 * le hook mutualisé `useDeleteEvent` (404 idempotent + invalidation préfixe, D7-C).
 */
export default function BottleFeedingPanel({ babyId }) {
  const qc = useQueryClient()
  const key = ['babies', babyId, 'bottle-feedings']
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listBottleFeedings(babyId) })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const [notice, setNotice] = useState(null)

  const createMut = useMutation({
    mutationFn: (body) => createBottleFeeding(babyId, body),
    retry: 0,
    onSuccess: refresh,
  })
  const deleteMut = useDeleteEvent(babyId)

  const items = data?.items ?? []

  return (
    <>
      <BottleFeedingForm onSubmit={(body) => createMut.mutateAsync(body)} />

      {notice && <p role="status" className="notice notice--success">{notice}</p>}

      <h4 className="subtitle">Derniers biberons</h4>
      {isLoading ? (
        <p className="empty">…</p>
      ) : items.length === 0 ? (
        <p className="empty">Aucun biberon enregistré.</p>
      ) : (
        <ul className="event-list">
          {items.map((b) => (
            <li key={b.id} className="event-row">
              <span className="grow">
                <span className="event-time">{formatWhen(b.occurredAt)}</span>{' · '}
                <strong>{b.quantityMl} ml</strong>
                {b.milkType ? ` · ${MILK_TYPE_LABEL[b.milkType]}` : ''}
              </span>
              <InlineDeleteConfirm
                prompt="Supprimer ce biberon ?"
                triggerAriaLabel={`Supprimer le biberon de ${b.quantityMl} ml`}
                onDelete={() => deleteMut.mutateAsync({ type: 'bottle_feeding', id: b.id })}
                onDeleted={() => setNotice('Biberon supprimé.')}
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
