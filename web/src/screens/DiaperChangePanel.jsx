import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDiaperChange, listStools, listUrines, updateStool, updateUrine } from '../api'
import { CONSISTENCY_LABEL } from '../stool'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import DiaperChangeForm from './DiaperChangeForm'
import StoolForm from './StoolForm'
import UrineForm from './UrineForm'
import BottomSheet from './BottomSheet'

const RECENT_LIMIT = 10

/**
 * Panneau « Couche » (US13.2, Lot 4, D13-G) : chemin de création unique du front, à **parité** avec les
 * feuilles Biberon/Sieste — formulaire de saisie + liste des derniers changes avec édition/suppression
 * inline. La création poste l'endpoint atomique `POST /diaper-changes` (urine et/ou selle en une
 * transaction). Écriture en `retry: 0` (pas de rejeu auto qui dupliquerait en réponse-perdue) et
 * invalidation par **préfixe** `['babies', babyId]` au succès → rafraîchit la liste locale ET le récap
 * calendrier (events + daily-totals) qui dérivent des mêmes événements.
 *
 * La liste **fusionne** selles + urines (deux listes keyset distinctes côté API), triées par
 * `occurredAt` DESC et plafonnées. L'**édition** rouvre le MÊME form que le calendrier selon le type
 * (`StoolForm`/`UrineForm`, prop `initial`) ; la **suppression** passe par le hook mutualisé
 * `useDeleteEvent` (404 idempotent + invalidation préfixe), avec `{ type: 'stool'|'urine', id }`.
 */
export default function DiaperChangePanel({ babyId }) {
  const qc = useQueryClient()
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null) // { type, item } en cours d'édition, ou null

  const stoolsQuery = useQuery({ queryKey: ['babies', babyId, 'stools'], queryFn: () => listStools(babyId) })
  const urinesQuery = useQuery({ queryKey: ['babies', babyId, 'urines'], queryFn: () => listUrines(babyId) })

  const createMut = useMutation({
    mutationFn: (body) => createDiaperChange(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setNotice('Change enregistré.')
    },
  })
  const stoolUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateStool(babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setEditing(null)
      setNotice('Selle mise à jour.')
    },
  })
  const urineUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateUrine(babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setEditing(null)
      setNotice('Urine mise à jour.')
    },
  })
  const deleteMut = useDeleteEvent(babyId)

  const isLoading = stoolsQuery.isLoading || urinesQuery.isLoading
  // Fusion selles + urines → une seule frise triée DESC, plafonnée aux ~10 dernières lignes.
  const items = [
    ...(stoolsQuery.data?.items ?? []).map((s) => ({ ...s, type: 'stool' })),
    ...(urinesQuery.data?.items ?? []).map((u) => ({ ...u, type: 'urine' })),
  ]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, RECENT_LIMIT)

  return (
    <>
      <DiaperChangeForm onSubmit={(body) => createMut.mutateAsync(body)} />

      {notice && <p role="status" className="notice notice--success">{notice}</p>}

      <h4 className="subtitle">Derniers changes</h4>
      {isLoading ? (
        <p className="empty">…</p>
      ) : items.length === 0 ? (
        <p className="empty">Aucun change enregistré.</p>
      ) : (
        <ul className="event-list">
          {items.map((e) => (
            <li key={`${e.type}-${e.id}`} className="event-row">
              <span className="grow">
                <span className="event-time">{formatWhen(e.occurredAt)}</span>
                {e.type === 'stool'
                  ? ` · 💩 Selle${e.consistency ? ` · ${CONSISTENCY_LABEL[e.consistency]}` : ''}`
                  : ' · 💧 Urine'}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--edit"
                aria-label={`Modifier ${e.type === 'stool' ? 'la selle' : "l'urine"} du ${formatWhen(e.occurredAt)}`}
                title="Modifier"
                onClick={() => setEditing({ type: e.type, item: e })}
              >
                ✏️
              </button>
              <InlineDeleteConfirm
                prompt={e.type === 'stool' ? 'Supprimer cette selle ?' : 'Supprimer cette urine ?'}
                triggerAriaLabel={`Supprimer ${e.type === 'stool' ? 'la selle' : "l'urine"} du ${formatWhen(e.occurredAt)}`}
                onDelete={() => deleteMut.mutateAsync({ type: e.type, id: e.id })}
                onDeleted={() => setNotice(e.type === 'stool' ? 'Selle supprimée.' : 'Urine supprimée.')}
              />
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editing != null}
        title={editing?.type === 'stool' ? <>✏️ Modifier la selle</> : <>✏️ Modifier l’urine</>}
        onClose={() => setEditing(null)}
      >
        {editing?.type === 'stool' && (
          <StoolForm
            initial={editing.item}
            onSubmit={(body) => stoolUpdateMut.mutateAsync({ id: editing.item.id, patch: body })}
          />
        )}
        {editing?.type === 'urine' && (
          <UrineForm
            initial={editing.item}
            onSubmit={(body) => urineUpdateMut.mutateAsync({ id: editing.item.id, patch: body })}
          />
        )}
      </BottomSheet>
    </>
  )
}

// Affichage local simple ; le formatage Europe/Paris dédié vit dans le calendrier (Épic 6).
function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
