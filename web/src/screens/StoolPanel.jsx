import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createStool, deleteStool, listStools } from '../api'
import { CONSISTENCY_LABEL } from '../stool'
import StoolForm from './StoolForm'

/**
 * Saisie + liste des dernières selles sur la fiche bébé (US5.1, D5-B). La liste (keyset, D3-J/D5-I)
 * alimente la fiche et est invalidée après chaque mutation. Mutations d'écriture en `retry: 0`
 * (D5-J/D3-G : pas de rejeu auto qui dupliquerait en réponse-perdue) ; la lecture garde le retry par
 * défaut. La correction passe par supprimer + re-saisir (édition non câblée en UI v1, D5-J).
 */
export default function StoolPanel({ babyId }) {
  const qc = useQueryClient()
  const key = ['babies', babyId, 'stools']
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listStools(babyId) })
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  const createMut = useMutation({
    mutationFn: (body) => createStool(babyId, body),
    retry: 0,
    onSuccess: refresh,
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteStool(babyId, id),
    retry: 0,
    onSuccess: refresh,
  })

  const items = data?.items ?? []

  return (
    <section style={styles.card}>
      <h3 style={{ margin: 0 }}>Selle</h3>
      <StoolForm onSubmit={(body) => createMut.mutateAsync(body)} />

      <h4 style={styles.subtitle}>Dernières selles</h4>
      {isLoading ? (
        <p style={styles.muted}>…</p>
      ) : items.length === 0 ? (
        <p style={styles.muted}>Aucune selle enregistrée.</p>
      ) : (
        <ul style={styles.list}>
          {items.map((s) => (
            <li key={s.id} style={styles.item}>
              <span>
                {formatWhen(s.occurredAt)}
                {s.consistency ? ` · ${CONSISTENCY_LABEL[s.consistency]}` : ''}
              </span>
              <button
                onClick={() => deleteMut.mutate(s.id)}
                disabled={deleteMut.isPending}
                style={styles.delete}
                aria-label={`Supprimer la selle du ${formatWhen(s.occurredAt)}`}
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
  subtitle: { margin: '.4rem 0 0', fontSize: '.95rem' },
  muted: { color: '#888', margin: 0 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', fontSize: '.9rem' },
  delete: { background: 'none', border: 0, color: '#dc2626', cursor: 'pointer', padding: 0, font: 'inherit' },
}
