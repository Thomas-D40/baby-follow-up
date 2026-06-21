import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBottleFeeding, deleteBottleFeeding, listBottleFeedings } from '../api'
import { MILK_TYPE_LABEL } from '../bottleFeeding'
import BottleFeedingForm from './BottleFeedingForm'

/**
 * Saisie + liste des derniers biberons sur la fiche bébé (US3.1, D3-B). La liste (keyset, D3-J)
 * alimente la fiche (anti create-aveugle) et est invalidée après chaque mutation. Mutations
 * d'écriture en `retry: 0` (D3-G : pas de rejeu auto qui dupliquerait en réponse-perdue) ; la lecture
 * garde le retry par défaut.
 */
export default function BottleFeedingPanel({ babyId }) {
  const qc = useQueryClient()
  const key = ['babies', babyId, 'bottle-feedings']
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => listBottleFeedings(babyId) })
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  const createMut = useMutation({
    mutationFn: (body) => createBottleFeeding(babyId, body),
    retry: 0,
    onSuccess: refresh,
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteBottleFeeding(babyId, id),
    retry: 0,
    onSuccess: refresh,
  })

  const items = data?.items ?? []

  return (
    <section style={styles.card}>
      <h3 style={{ margin: 0 }}>Biberon</h3>
      <BottleFeedingForm onSubmit={(body) => createMut.mutateAsync(body)} />

      <h4 style={styles.subtitle}>Derniers biberons</h4>
      {isLoading ? (
        <p style={styles.muted}>…</p>
      ) : items.length === 0 ? (
        <p style={styles.muted}>Aucun biberon enregistré.</p>
      ) : (
        <ul style={styles.list}>
          {items.map((b) => (
            <li key={b.id} style={styles.item}>
              <span>
                {formatWhen(b.occurredAt)} · <strong>{b.quantityMl} ml</strong>
                {b.milkType ? ` · ${MILK_TYPE_LABEL[b.milkType]}` : ''}
              </span>
              <button
                onClick={() => deleteMut.mutate(b.id)}
                disabled={deleteMut.isPending}
                style={styles.delete}
                aria-label={`Supprimer le biberon de ${b.quantityMl} ml`}
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
