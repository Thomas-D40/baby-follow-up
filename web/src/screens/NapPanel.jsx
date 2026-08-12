import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startNap, endNap, reopenNap, getCurrentNap, listNaps, updateNap } from '../api'
import { formatDuration } from '../nap'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import BottomSheet from './BottomSheet'
import NapEditForm from './NapEditForm'

/**
 * Suivi de sieste sur la fiche bébé (US4.1/4.2/4.3). Bouton **contextuel** piloté par
 * `GET /naps/current` : « Début de sieste » si aucune ouverte, « Fin de sieste » sinon (D4-L).
 * Toutes les mutations d'écriture sont en `retry: 0` (D4-K, pas de rejeu auto) et désactivées au submit.
 * Un **409** use-case (déjà / aucune en cours) est affiché en **info neutre**, pas en erreur (D4-K) :
 * `neutralOr` est réservé à `start`/`end`/`reopen`. `reopen` annule une fin erronée (D4-E).
 * La **suppression** (depuis l'historique) passe par le hook mutualisé `useDeleteEvent` (Épic 7) :
 * un `DELETE` ne renvoie **jamais** 409 et un 404 est un **succès idempotent** (D7-C/D7-D) — il ne
 * doit donc **pas** réutiliser `neutralOr` (« Action impossible. » était doublement faux).
 */
export default function NapPanel({ babyId }) {
  const qc = useQueryClient()
  const currentKey = ['babies', babyId, 'nap-current']
  const listKey = ['babies', babyId, 'naps']
  const [info, setInfo] = useState(null)
  const [editing, setEditing] = useState(null) // la sieste (fermée) en cours d'édition, ou null

  const { data: current, isLoading } = useQuery({ queryKey: currentKey, queryFn: () => getCurrentNap(babyId) })
  const { data: history } = useQuery({ queryKey: listKey, queryFn: () => listNaps(babyId) })

  // Invalidation par **préfixe** `['babies', babyId]` (DA-4/US11.3) : couvre `nap-current` + `naps`
  // ET rafraîchit le récap calendrier (events + daily-totals) qui dérive des mêmes siestes.
  const refresh = () => qc.invalidateQueries({ queryKey: ['babies', babyId] })
  // 409 use-case = info neutre (D4-K) ; autre échec = message d'erreur générique.
  const neutralOr = (msg) => (err) => setInfo(err?.status === 409 ? msg : "Échec de l'opération.")
  const onDone = () => { setInfo(null); refresh() }

  const startMut = useMutation({
    mutationFn: () => startNap(babyId), retry: 0, onSuccess: onDone,
    onError: neutralOr('Une sieste est déjà en cours.'),
  })
  const endMut = useMutation({
    mutationFn: () => endNap(babyId), retry: 0, onSuccess: onDone,
    onError: neutralOr('Aucune sieste en cours.'),
  })
  const reopenMut = useMutation({
    mutationFn: () => reopenNap(babyId), retry: 0, onSuccess: onDone,
    onError: neutralOr('Aucune sieste récente à reprendre.'),
  })
  // Suppression : mapping `delete` distinct du mapping use-case (D7-D). Pas de `neutralOr` ici.
  const deleteMut = useDeleteEvent(babyId)
  // Édition (Épic 8, DA-3) : exposée uniquement sur les siestes FERMÉES (endAt non null), donc on ne
  // tente jamais de fermer une sieste ouverte → le 409 est géré par le form mais ne survient pas en
  // usage normal. Succès : invalidation préfixe (DA-4) pour rafraîchir liste + calendrier + tendances.
  const updateMut = useMutation({
    mutationFn: ({ id, patch }) => updateNap(babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setEditing(null)
      setInfo('Sieste mise à jour.')
    },
  })

  const isNapping = !!current
  const items = history?.items ?? []

  return (
    <>
      {isLoading ? (
        <p className="empty">…</p>
      ) : isNapping ? (
        <div className="nap-state">
          <p className="nap-live"><span className="dot" aria-hidden="true" />Sieste en cours · <strong>{formatDuration(current.startAt, null)}</strong></p>
          <button onClick={() => endMut.mutate()} disabled={endMut.isPending} className="btn btn--sleep btn--block btn--lg">
            {endMut.isPending ? '…' : 'Fin de sieste'}
          </button>
        </div>
      ) : (
        <div className="nap-state">
          <button onClick={() => startMut.mutate()} disabled={startMut.isPending} className="btn btn--sleep btn--block btn--lg">
            {startMut.isPending ? '…' : 'Début de sieste'}
          </button>
          <button onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending} className="linkbtn" style={{ alignSelf: 'center' }}>
            Reprendre la dernière sieste
          </button>
        </div>
      )}

      {info && <p role="status" className="notice notice--info">{info}</p>}

      <h4 className="subtitle">Dernières siestes</h4>
      {items.length === 0 ? (
        <p className="empty">Aucune sieste enregistrée.</p>
      ) : (
        <ul className="event-list">
          {items.map((n) => (
            <li key={n.id} className="event-row">
              <span className="grow">
                <span className="event-time">{formatWhen(n.startAt)}</span>{' · '}
                <strong>{formatDuration(n.startAt, n.endAt)}</strong>
              </span>
              {/* Édition réservée aux siestes fermées (DA-3) : une sieste ouverte (endAt null) se
                  termine via « Fin de sieste », pas par le formulaire d'édition. */}
              {n.endAt && (
                <button
                  type="button"
                  className="icon-btn icon-btn--edit"
                  aria-label={`Modifier la sieste du ${formatWhen(n.startAt)}`}
                  title="Modifier"
                  onClick={() => setEditing(n)}
                >
                  ✏️
                </button>
              )}
              <InlineDeleteConfirm
                prompt="Supprimer cette sieste ?"
                triggerAriaLabel={`Supprimer la sieste du ${formatWhen(n.startAt)}`}
                onDelete={() => deleteMut.mutateAsync({ type: 'nap', id: n.id })}
                onDeleted={() => setInfo('Sieste supprimée.')}
              />
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editing != null}
        title={<>✏️ Modifier la sieste</>}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <NapEditForm
            initial={editing}
            onSubmit={(patch) => updateMut.mutateAsync({ id: editing.id, patch })}
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
