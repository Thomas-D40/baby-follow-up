import { Suspense, lazy, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useBabies, useCurrentBaby } from '../useBabies'
import { createBaby, updateBaby, deleteBaby, getCurrentNap } from '../api'
import BabyForm from './BabyForm'
import BottomSheet from './BottomSheet'
import BottleFeedingPanel from './BottleFeedingPanel'
import NapPanel from './NapPanel'
import StoolPanel from './StoolPanel'
import CalendarPanel from './CalendarPanel'
import SharePanel from './SharePanel'
import WeightPanel from './WeightPanel'

// Recharts est lourd (~430 kB) : on ne le charge qu'à l'ouverture d'une vue graphique (PWA mobile).
const TrendsPanel = lazy(() => import('./TrendsPanel'))
// La courbe OMS embarque Recharts ET les tables LMS : chunk lazy isolé, jamais importé par une
// surface toujours montée (WeightPanel / quick-bar) — cf. D12-G′.
const WeightChart = lazy(() => import('./WeightChart'))

const SEX_LABEL = { female: 'Fille', male: 'Garçon' }
const SEX_EMOJI = { female: '👧', male: '👦' }
const CAL_VIEWS = ['day', 'week', 'month', 'year', 'growth']
const CAL_VIEW_LABEL = { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année', growth: 'Croissance' }

/**
 * Fiche bébé (US2.1 create, US2.2 select, D2-E edit/delete). Design « pastel doux & rond » : une
 * **barre d'actions rapides** (🍼/😴/💩) ouvre la saisie en **feuille modale** ([[BottomSheet]]), et le
 * **récap central** ([[CalendarPanel]], totaux + frise du jour) reste à l'écran. Sélection implicite
 * quand un seul bébé, sélecteur au-delà. Suppression bébé confirmée + notifiée (D2-H).
 */
export default function BabiesScreen({ me, onLogout }) {
  const qc = useQueryClient()
  const { data: babies = [], isLoading } = useBabies()
  const { currentBaby, currentBabyId, selectBaby } = useCurrentBaby(babies)
  const [view, setView] = useState('list') // list | add | edit
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [notice, setNotice] = useState(null)
  const [sheet, setSheet] = useState(null) // null | 'bottle' | 'nap' | 'stool' | 'weight'
  const [calView, setCalView] = useState('day') // day = liste du jour ; week|month|year = tendances

  const refresh = () => qc.invalidateQueries({ queryKey: ['babies'] })

  // Badge « en cours » sur l'action Sieste (lecture seule ; la saisie reste dans la feuille).
  const { data: currentNap } = useQuery({
    queryKey: ['babies', currentBabyId, 'nap-current'],
    queryFn: () => getCurrentNap(currentBabyId),
    enabled: !!currentBabyId,
  })

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

  if (isLoading) return <p className="center">…</p>

  if (view === 'add') {
    return (
      <main className="app">
        <h1 className="app-title">Ajouter un bébé</h1>
        <BabyForm submitLabel="Ajouter" onSubmit={(v) => createMut.mutateAsync(v)} onCancel={() => setView('list')} />
      </main>
    )
  }

  if (view === 'edit' && currentBaby) {
    return (
      <main className="app">
        <h1 className="app-title">Modifier la fiche</h1>
        <BabyForm
          initial={currentBaby}
          submitLabel="Enregistrer"
          onSubmit={(v) => updateMut.mutateAsync({ id: currentBaby.id, patch: v })}
          onCancel={() => setView('list')}
        />
      </main>
    )
  }

  const openSheet = (name) => { setNotice(null); setSheet(name) }
  const closeSheet = () => setSheet(null)

  return (
    <main className="app">
      <header className="app-bar">
        <h1 className="app-title"><span className="logo">🍼</span>Suivi Baby</h1>
        <span className="app-user">
          {me.firstName || me.email}<br />
          <button onClick={onLogout} className="linkbtn linkbtn--muted">se déconnecter</button>
        </span>
      </header>

      {notice && <p role="status" className="notice notice--success">{notice}</p>}

      {babies.length === 0 && (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p className="muted">Aucun bébé enregistré pour le moment.</p>
          <button onClick={() => { setNotice(null); setView('add') }} className="btn btn--primary btn--lg">+ Ajouter un bébé</button>
        </div>
      )}

      {babies.length > 1 && (
        <label className="field">
          <span className="field-label">Bébé suivi</span>
          <select
            aria-label="Bébé suivi"
            value={currentBabyId ?? ''}
            onChange={(e) => selectBaby(e.target.value)}
            className="select"
          >
            <option value="" disabled>Choisir un bébé…</option>
            {babies.map((b) => <option key={b.id} value={b.id}>{b.firstName}</option>)}
          </select>
        </label>
      )}

      {currentBaby && (
        <section className="baby-card">
          <div className={`avatar avatar--${currentBaby.sex || 'male'}`} aria-hidden="true">
            {SEX_EMOJI[currentBaby.sex] || '👶'}
          </div>
          <div className="baby-id">
            <h2 className="baby-name">{currentBaby.firstName}</h2>
            <p className="baby-meta">
              {currentBaby.birthDate ? `Né(e) le ${currentBaby.birthDate}` : 'Date de naissance non renseignée'}
              {currentBaby.sex ? ` · ${SEX_LABEL[currentBaby.sex]}` : ''}
            </p>
          </div>
          {!confirmingDelete && (
            <div className="baby-actions">
              <button onClick={() => { setNotice(null); setView('edit') }} className="btn btn--ghost btn--sm">Modifier</button>
              <button onClick={() => { setNotice(null); setConfirmingDelete(true) }} className="btn btn--danger btn--sm">Supprimer</button>
            </div>
          )}
        </section>
      )}

      {currentBaby && confirmingDelete && (
        <div className="card" style={{ background: 'var(--danger-bg)' }}>
          <p style={{ margin: 0 }}>
            Supprimer <strong>{currentBaby.firstName}</strong> ? Cette action efface
            définitivement toutes ses informations et est irréversible.
          </p>
          <div className="modal-row">
            <button onClick={() => setConfirmingDelete(false)} className="btn btn--ghost">Annuler</button>
            <button onClick={() => deleteMut.mutate(currentBaby.id)} disabled={deleteMut.isPending} className="btn btn--danger">
              {deleteMut.isPending ? '…' : 'Oui, supprimer'}
            </button>
          </div>
        </div>
      )}

      {currentBaby && (
        <div className="quick-bar">
          <button className="quick-btn quick-btn--milk" onClick={() => openSheet('bottle')}>
            <span className="emoji" aria-hidden="true">🍼</span>
            <span className="label">Biberon</span>
          </button>
          <button className="quick-btn quick-btn--sleep" onClick={() => openSheet('nap')}>
            {currentNap && <span className="quick-badge"><span className="dot" />en cours</span>}
            <span className="emoji" aria-hidden="true">😴</span>
            <span className="label">Sieste</span>
          </button>
          <button className="quick-btn quick-btn--stool" onClick={() => openSheet('stool')}>
            <span className="emoji" aria-hidden="true">💩</span>
            <span className="label">Selle</span>
          </button>
          <button className="quick-btn quick-btn--weight" onClick={() => openSheet('weight')}>
            <span className="emoji" aria-hidden="true">⚖️</span>
            <span className="label">Poids</span>
          </button>
        </div>
      )}

      {currentBaby && (
        <div className="seg" role="tablist" aria-label="Vue calendrier">
          {CAL_VIEWS.map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={calView === v}
              className={`seg-btn ${calView === v ? 'seg-btn--active' : ''}`}
              onClick={() => setCalView(v)}
            >
              {CAL_VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      )}

      {currentBaby && calView === 'day' && <CalendarPanel babyId={currentBaby.id} />}

      {currentBaby && (calView === 'week' || calView === 'month' || calView === 'year') && (
        <Suspense fallback={<section className="card"><p className="empty">…</p></section>}>
          <TrendsPanel babyId={currentBaby.id} view={calView} />
        </Suspense>
      )}

      {currentBaby && calView === 'growth' && (
        currentBaby.birthDate && currentBaby.sex ? (
          <Suspense fallback={<section className="card"><p className="empty">…</p></section>}>
            <WeightChart babyId={currentBaby.id} sex={currentBaby.sex} birthDate={currentBaby.birthDate} />
          </Suspense>
        ) : (
          <section className="card">
            <p className="empty">
              Pour comparer aux courbes de croissance OMS, renseignez la date de naissance et le sexe de {currentBaby.firstName}.
            </p>
            <button onClick={() => { setNotice(null); setView('edit') }} className="btn btn--primary" style={{ alignSelf: 'center' }}>
              Compléter la fiche
            </button>
          </section>
        )
      )}

      {currentBaby && <SharePanel babyId={currentBaby.id} me={me} />}

      {babies.length >= 1 && (
        <button onClick={() => { setNotice(null); setView('add') }} className="linkbtn" style={{ alignSelf: 'center' }}>
          + Ajouter un autre bébé
        </button>
      )}

      {currentBaby && (
        <>
          <BottomSheet open={sheet === 'bottle'} onClose={closeSheet} title={<><span aria-hidden="true">🍼</span> Biberon</>}>
            <BottleFeedingPanel babyId={currentBaby.id} />
          </BottomSheet>
          <BottomSheet open={sheet === 'nap'} onClose={closeSheet} title={<><span aria-hidden="true">😴</span> Sieste</>}>
            <NapPanel babyId={currentBaby.id} />
          </BottomSheet>
          <BottomSheet open={sheet === 'stool'} onClose={closeSheet} title={<><span aria-hidden="true">💩</span> Selle</>}>
            <StoolPanel babyId={currentBaby.id} />
          </BottomSheet>
          <BottomSheet open={sheet === 'weight'} onClose={closeSheet} title={<><span aria-hidden="true">⚖️</span> Poids</>}>
            <WeightPanel babyId={currentBaby.id} />
          </BottomSheet>
        </>
      )}
    </main>
  )
}
