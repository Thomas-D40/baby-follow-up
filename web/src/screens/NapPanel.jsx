import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startNap, endNap, reopenNap, getCurrentNap, listNaps, deleteNap } from '../api'
import { formatDuration } from '../nap'

/**
 * Suivi de sieste sur la fiche bébé (US4.1/4.2/4.3). Bouton **contextuel** piloté par
 * `GET /naps/current` : « Début de sieste » si aucune ouverte, « Fin de sieste » sinon (D4-L).
 * Toutes les mutations d'écriture sont en `retry: 0` (D4-K, pas de rejeu auto) et désactivées au submit.
 * Un **409** use-case (déjà / aucune en cours) est affiché en **info neutre**, pas en erreur (D4-K).
 * `reopen` annule une fin erronée (D4-E) ; la liste alimente l'historique d'où l'on supprime.
 */
export default function NapPanel({ babyId }) {
  const qc = useQueryClient()
  const currentKey = ['babies', babyId, 'nap-current']
  const listKey = ['babies', babyId, 'naps']
  const [info, setInfo] = useState(null)

  const { data: current, isLoading } = useQuery({ queryKey: currentKey, queryFn: () => getCurrentNap(babyId) })
  const { data: history } = useQuery({ queryKey: listKey, queryFn: () => listNaps(babyId) })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: currentKey })
    qc.invalidateQueries({ queryKey: listKey })
  }
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
  const deleteMut = useMutation({
    mutationFn: (id) => deleteNap(babyId, id), retry: 0, onSuccess: onDone,
    onError: neutralOr('Action impossible.'),
  })

  const isNapping = !!current
  const items = history?.items ?? []

  return (
    <section style={styles.card}>
      <h3 style={{ margin: 0 }}>Sieste</h3>

      {isLoading ? (
        <p style={styles.muted}>…</p>
      ) : isNapping ? (
        <div style={styles.state}>
          <p style={{ margin: 0 }}>Sieste en cours · <strong>{formatDuration(current.startAt, null)}</strong></p>
          <button onClick={() => endMut.mutate()} disabled={endMut.isPending} style={styles.primary}>
            {endMut.isPending ? '…' : 'Fin de sieste'}
          </button>
        </div>
      ) : (
        <div style={styles.state}>
          <button onClick={() => startMut.mutate()} disabled={startMut.isPending} style={styles.primary}>
            {startMut.isPending ? '…' : 'Début de sieste'}
          </button>
          <button onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending} style={styles.link}>
            Reprendre la dernière sieste
          </button>
        </div>
      )}

      {info && <p role="status" style={styles.info}>{info}</p>}

      <h4 style={styles.subtitle}>Dernières siestes</h4>
      {items.length === 0 ? (
        <p style={styles.muted}>Aucune sieste enregistrée.</p>
      ) : (
        <ul style={styles.list}>
          {items.map((n) => (
            <li key={n.id} style={styles.item}>
              <span>{formatWhen(n.startAt)} · <strong>{formatDuration(n.startAt, n.endAt)}</strong></span>
              <button
                onClick={() => deleteMut.mutate(n.id)}
                disabled={deleteMut.isPending}
                style={styles.delete}
                aria-label={`Supprimer la sieste du ${formatWhen(n.startAt)}`}
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Affichage local simple ; le formatage Europe/Paris dédié arrive à l'Épic 6.
function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const styles = {
  card: { border: '1px solid #eee', borderRadius: 10, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '.8rem', marginTop: '1rem' },
  state: { display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'flex-start' },
  primary: { padding: '.7rem 1.2rem', fontSize: '1rem', borderRadius: 6, border: 0, background: '#3b82f6', color: '#fff', cursor: 'pointer' },
  subtitle: { margin: '.4rem 0 0', fontSize: '.95rem' },
  muted: { color: '#888', margin: 0 },
  info: { background: '#eff6ff', color: '#1e40af', padding: '.5rem .7rem', borderRadius: 6, margin: 0, fontSize: '.9rem' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', fontSize: '.9rem' },
  delete: { background: 'none', border: 0, color: '#dc2626', cursor: 'pointer', padding: 0, font: 'inherit' },
  link: { background: 'none', border: 0, color: '#3b82f6', cursor: 'pointer', padding: 0, font: 'inherit' },
}
