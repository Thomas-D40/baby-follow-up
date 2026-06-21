import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBabies, useCurrentBaby } from '../useBabies'
import { createBaby, updateBaby, deleteBaby } from '../api'
import BabyForm from './BabyForm'
import BottleFeedingPanel from './BottleFeedingPanel'
import NapPanel from './NapPanel'
import StoolPanel from './StoolPanel'

const SEX_LABEL = { female: 'Fille', male: 'Garçon' }

/**
 * Baby management (US2.1 create, US2.2 select, D2-E edit/delete). Membership-filtered list, implicit
 * selection when a single baby, picker beyond. Deletion requires explicit confirmation and shows a
 * notification (D2-H). Navigation is local state (shallow, no router).
 */
export default function BabiesScreen({ me, onLogout }) {
  const qc = useQueryClient()
  const { data: babies = [], isLoading } = useBabies()
  const { currentBaby, currentBabyId, selectBaby } = useCurrentBaby(babies)
  const [view, setView] = useState('list') // list | add | edit
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [notice, setNotice] = useState(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['babies'] })

  const createMut = useMutation({
    mutationFn: createBaby,
    onSuccess: () => { refresh(); setView('list'); setNotice('Bébé ajouté.') },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, patch }) => updateBaby(id, patch),
    onSuccess: () => { refresh(); setView('list'); setNotice('Fiche mise à jour.') },
  })
  const deleteMut = useMutation({
    mutationFn: deleteBaby,
    onSuccess: () => { refresh(); setConfirmingDelete(false); setNotice('Bébé supprimé.') },
  })

  if (isLoading) return <p style={styles.center}>…</p>

  if (view === 'add') {
    return (
      <main style={styles.main}>
        <h1>Ajouter un bébé</h1>
        <BabyForm submitLabel="Ajouter" onSubmit={(v) => createMut.mutateAsync(v)} onCancel={() => setView('list')} />
      </main>
    )
  }

  if (view === 'edit' && currentBaby) {
    return (
      <main style={styles.main}>
        <h1>Modifier la fiche</h1>
        <BabyForm
          initial={currentBaby}
          submitLabel="Enregistrer"
          onSubmit={(v) => updateMut.mutateAsync({ id: currentBaby.id, patch: v })}
          onCancel={() => setView('list')}
        />
      </main>
    )
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1>Suivi Baby</h1>
        <span style={styles.user}>{me.firstName || me.email} · <button onClick={onLogout} style={styles.link}>se déconnecter</button></span>
      </header>

      {notice && <p role="status" style={styles.notice}>{notice}</p>}

      {babies.length === 0 && (
        <p>Aucun bébé enregistré. <button onClick={() => { setNotice(null); setView('add') }} style={styles.button}>Ajouter un bébé</button></p>
      )}

      {babies.length > 1 && (
        <label style={styles.label}>
          Bébé suivi
          <select
            aria-label="Bébé suivi"
            value={currentBabyId ?? ''}
            onChange={(e) => selectBaby(e.target.value)}
            style={styles.input}
          >
            <option value="" disabled>Choisir un bébé…</option>
            {babies.map((b) => <option key={b.id} value={b.id}>{b.firstName}</option>)}
          </select>
        </label>
      )}

      {currentBaby && (
        <section style={styles.card}>
          <h2 style={{ margin: 0 }}>{currentBaby.firstName}</h2>
          <p style={styles.meta}>
            {currentBaby.birthDate ? `Né(e) le ${currentBaby.birthDate}` : 'Date de naissance non renseignée'}
            {currentBaby.sex ? ` · ${SEX_LABEL[currentBaby.sex]}` : ''}
          </p>

          {!confirmingDelete ? (
            <div style={styles.row}>
              <button onClick={() => { setNotice(null); setView('edit') }} style={styles.button}>Modifier</button>
              <button onClick={() => { setNotice(null); setConfirmingDelete(true) }} style={styles.danger}>Supprimer</button>
            </div>
          ) : (
            <div style={styles.confirm}>
              <p style={{ margin: 0 }}>
                Supprimer <strong>{currentBaby.firstName}</strong> ? Cette action efface
                définitivement toutes ses informations et est irréversible.
              </p>
              <div style={styles.row}>
                <button onClick={() => deleteMut.mutate(currentBaby.id)} disabled={deleteMut.isPending} style={styles.danger}>
                  {deleteMut.isPending ? '…' : 'Oui, supprimer'}
                </button>
                <button onClick={() => setConfirmingDelete(false)} style={styles.cancel}>Annuler</button>
              </div>
            </div>
          )}
        </section>
      )}

      {babies.length >= 1 && (
        <p><button onClick={() => { setNotice(null); setView('add') }} style={styles.link}>+ Ajouter un autre bébé</button></p>
      )}

      {currentBaby && <BottleFeedingPanel babyId={currentBaby.id} />}
      {currentBaby && <NapPanel babyId={currentBaby.id} />}
      {currentBaby && <StoolPanel babyId={currentBaby.id} />}

      <p style={styles.todo}>La vue calendrier unifiée arrive à l'épic suivant.</p>
    </main>
  )
}

const styles = {
  main: { fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' },
  user: { color: '#666', fontSize: '.9rem' },
  notice: { background: '#ecfdf5', color: '#065f46', padding: '.6rem .8rem', borderRadius: 6, margin: '0 0 1rem' },
  label: { display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.9rem', maxWidth: 280 },
  input: { padding: '.6rem', fontSize: '1rem', borderRadius: 6, border: '1px solid #ccc' },
  card: { border: '1px solid #eee', borderRadius: 10, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '.8rem', marginTop: '1rem' },
  meta: { color: '#666', margin: 0 },
  row: { display: 'flex', gap: '.75rem' },
  confirm: { display: 'flex', flexDirection: 'column', gap: '.8rem', background: '#fef2f2', padding: '.9rem', borderRadius: 8 },
  button: { padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' },
  danger: { padding: '.5rem 1rem', borderRadius: 6, border: 0, background: '#dc2626', color: '#fff', cursor: 'pointer' },
  cancel: { padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' },
  link: { background: 'none', border: 0, color: '#3b82f6', cursor: 'pointer', padding: 0, font: 'inherit' },
  center: { textAlign: 'center', marginTop: '4rem', fontFamily: 'system-ui, sans-serif' },
  todo: { color: '#aaa', fontSize: '.85rem', marginTop: '2rem' },
}
