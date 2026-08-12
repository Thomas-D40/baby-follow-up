import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBottleFeeding, listBottleFeedings, updateBottleFeeding } from '../api'
import { MILK_TYPE_LABEL } from '../bottleFeeding'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import BottleFeedingForm from './BottleFeedingForm'
import BottomSheet from './BottomSheet'

/**
 * Saisie + liste + édition des derniers biberons sur la fiche bébé (US3.1, D3-B, Épic 8). La liste
 * (keyset, D3-J) alimente la fiche (anti create-aveugle) et est invalidée après chaque mutation.
 * Mutations d'écriture en `retry: 0` (D3-G/DA-4 : pas de rejeu auto qui dupliquerait en réponse-perdue) ;
 * la lecture garde le retry par défaut. La suppression passe par une **confirmation inline** (Épic 7,
 * D7-B) sur le hook mutualisé `useDeleteEvent` (404 idempotent + invalidation préfixe, D7-C).
 *
 * L'**édition** (Épic 8, DA-1/DA-2) ouvre le MÊME `BottleFeedingForm` (prop `initial`) dans un
 * `BottomSheet` depuis un bouton ✏️ sur chaque ligne. Au succès : invalidation par **préfixe**
 * `['babies', babyId]` (DA-4) pour rafraîchir aussi le calendrier/tendances qui dérivent du même event.
 */
export default function BottleFeedingPanel({ babyId }) {
  const qc = useQueryClient()
  const key = ['babies', babyId, 'bottle-feedings']
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listBottleFeedings(babyId) })
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null) // l'event en cours d'édition, ou null

  const createMut = useMutation({
    mutationFn: (body) => createBottleFeeding(babyId, body),
    retry: 0,
    // Invalidation par **préfixe** `['babies', babyId]` (DA-4/US11.3) : rafraîchit aussi le récap
    // calendrier (events + daily-totals) qui dérive du même event, pas seulement la liste locale.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['babies', babyId] }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, patch }) => updateBottleFeeding(babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] }) // invalidation préfixe (DA-4)
      setEditing(null)
      setNotice('Biberon mis à jour.')
    },
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
              <button
                type="button"
                className="icon-btn icon-btn--edit"
                aria-label={`Modifier le biberon de ${b.quantityMl} ml`}
                title="Modifier"
                onClick={() => setEditing(b)}
              >
                ✏️
              </button>
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

      <BottomSheet
        open={editing != null}
        title={<>✏️ Modifier le biberon</>}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <BottleFeedingForm
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
