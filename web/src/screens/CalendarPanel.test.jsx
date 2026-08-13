import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CalendarPanel from './CalendarPanel'
import { toLocalInputValue } from '../bottleFeeding'
import { toLocalInputValue as toLocalInputValueStool } from '../stool'

vi.mock('../api', () => ({
  getDayEvents: vi.fn(),
  getDailyTotals: vi.fn(),
  // `useDeleteEvent` route vers les 4 clients : tous présents dans le mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  // Édition depuis le récap (US11.2) : les 3 clients d'update.
  updateBottleFeeding: vi.fn(),
  updateNap: vi.fn(),
  updateStool: vi.fn(),
  // Section Vitamines (Épic 9) rendue par CalendarPanel.
  getVitamins: vi.fn(),
  setVitamin: vi.fn(),
  unsetVitamin: vi.fn(),
}))
import {
  getDayEvents,
  getDailyTotals,
  deleteBottleFeeding,
  deleteNap,
  getVitamins,
  updateBottleFeeding,
  updateNap,
  updateStool,
} from '../api'

const PREFIX = { queryKey: ['babies', 'b1'] }

const EVENTS = [
  { type: 'bottle_feeding', id: 'bf1', startAt: '2026-06-21T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
  { type: 'nap', id: 'n1', startAt: '2026-06-21T09:00:00.000Z', endAt: '2026-06-21T10:00:00.000Z' },
]

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(
    <QueryClientProvider client={qc}><CalendarPanel babyId="b1" /></QueryClientProvider>,
  ) }
}

describe('CalendarPanel — suppression depuis le calendrier (Épic 7, D7-E)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDayEvents.mockResolvedValue(EVENTS)
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 0 })
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  it('ouvre une modale de confirmation (pas de bloc inline) ; « Annuler » la referme sans appel', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(deleteBottleFeeding).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteBottleFeeding).not.toHaveBeenCalled()
  })

  it('route la suppression selon le type de la ligne (biberon → deleteBottleFeeding)', async () => {
    deleteBottleFeeding.mockResolvedValue(null)
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteBottleFeeding).toHaveBeenCalled())
    expect(deleteBottleFeeding.mock.calls[0]).toEqual(['b1', 'bf1'])
    expect(deleteNap).not.toHaveBeenCalled()
  })

  it('cohérence de cache (D7-C/R1) : rafraîchit events ET daily-totals (invalidation préfixe)', async () => {
    deleteBottleFeeding.mockResolvedValue(null)
    renderPanel()
    await waitFor(() => expect(getDayEvents).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(1))

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    // L'invalidation par préfixe ['babies','b1'] refait les DEUX requêtes du calendrier.
    await waitFor(() => expect(getDayEvents).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(2))
  })

  it('un 404 (double-vue) est un succès idempotent : la modale se ferme, aucune erreur (D7-C)', async () => {
    deleteNap.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer sieste/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un 500 garde la modale ouverte avec une erreur visible (R3)', async () => {
    deleteBottleFeeding.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la suppression.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('CalendarPanel — édition depuis le récap (US11.2) + ordre reçu (US11.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0 })
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  const BOTTLE_PAST = { type: 'bottle_feeding', id: 'bf1', startAt: '2020-03-15T09:30:00.000Z', quantityMl: 120, milkType: 'breast' }
  const STOOL_PAST = { type: 'stool', id: 's1', startAt: '2020-03-15T07:15:00.000Z', consistency: 'soft' }
  const NAP_CLOSED = { type: 'nap', id: 'n1', startAt: '2026-06-21T09:00:00.000Z', endAt: '2026-06-21T10:00:00.000Z' }
  const NAP_ONGOING = { type: 'nap', id: 'n2', startAt: '2026-06-21T09:00:00.000Z', endAt: null }

  it('✏️ ouvre le bon form par type : biberon → BottleFeedingForm', async () => {
    getDayEvents.mockResolvedValue([BOTTLE_PAST])
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Modifier biberon/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Quantité (ml)')).toBeInTheDocument()
  })

  it('✏️ ouvre le bon form par type : selle → StoolForm', async () => {
    getDayEvents.mockResolvedValue([STOOL_PAST])
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Modifier selle/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Consistance')).toBeInTheDocument()
  })

  it('✏️ ouvre le bon form par type : sieste fermée → NapEditForm', async () => {
    getDayEvents.mockResolvedValue([NAP_CLOSED])
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Modifier sieste/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Début')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Fin')).toBeInTheDocument()
  })

  it('GARDE-FOU biberon : « Quand » est prérempli depuis startAt de l’event, PAS « maintenant »', async () => {
    getDayEvents.mockResolvedValue([BOTTLE_PAST])
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Modifier biberon/ }))
    const when = within(screen.getByRole('dialog')).getByLabelText('Quand')
    // occurredAt: editing.startAt → l'input reflète le startAt passé, pas l'instant courant.
    expect(when).toHaveValue(toLocalInputValue(new Date(BOTTLE_PAST.startAt)))
    expect(when.value).not.toBe(toLocalInputValue(new Date()))
  })

  it('GARDE-FOU selle : « Quand » est prérempli depuis startAt de l’event, PAS « maintenant »', async () => {
    getDayEvents.mockResolvedValue([STOOL_PAST])
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Modifier selle/ }))
    const when = within(screen.getByRole('dialog')).getByLabelText('Quand')
    // StoolForm lit `../stool` → l'assertion utilise la même source (helpers identiques aujourd'hui).
    expect(when).toHaveValue(toLocalInputValueStool(new Date(STOOL_PAST.startAt)))
    expect(when.value).not.toBe(toLocalInputValueStool(new Date()))
  })

  it('soumission biberon : updateBottleFeeding(b1, id, patch) une fois, sheet fermé, préfixe invalidé', async () => {
    getDayEvents.mockResolvedValue([BOTTLE_PAST])
    updateBottleFeeding.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: /Modifier biberon/ }))
    const dialog = screen.getByRole('dialog')
    const qty = within(dialog).getByLabelText('Quantité (ml)')
    await userEvent.clear(qty)
    await userEvent.type(qty, '200')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateBottleFeeding).toHaveBeenCalledTimes(1))
    expect(updateBottleFeeding.mock.calls[0][0]).toBe('b1')
    expect(updateBottleFeeding.mock.calls[0][1]).toBe('bf1')
    expect(updateBottleFeeding.mock.calls[0][2].quantityMl).toBe(200)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('soumission selle : updateStool(b1, id, patch) une fois, sheet fermé, préfixe invalidé', async () => {
    getDayEvents.mockResolvedValue([STOOL_PAST])
    updateStool.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: /Modifier selle/ }))
    const dialog = screen.getByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Consistance'), 'liquid')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateStool).toHaveBeenCalledTimes(1))
    expect(updateStool.mock.calls[0][0]).toBe('b1')
    expect(updateStool.mock.calls[0][1]).toBe('s1')
    expect(updateStool.mock.calls[0][2].consistency).toBe('liquid')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('soumission sieste : updateNap(b1, id, patch) une fois, sheet fermé, préfixe invalidé', async () => {
    getDayEvents.mockResolvedValue([NAP_CLOSED])
    updateNap.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: /Modifier sieste/ }))
    const dialog = screen.getByRole('dialog')
    // Même pattern que NapEditForm.test.jsx (:35-36) : clear + type sur le datetime-local. Fin > début.
    const fin = within(dialog).getByLabelText('Fin')
    await userEvent.clear(fin)
    await userEvent.type(fin, '2026-06-21T23:30')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateNap).toHaveBeenCalledTimes(1))
    expect(updateNap.mock.calls[0][0]).toBe('b1')
    expect(updateNap.mock.calls[0][1]).toBe('n1')
    expect(typeof updateNap.mock.calls[0][2].endAt).toBe('string')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('sieste en cours : PAS de ✏️ (le 🗑 reste) ; sieste fermée : ✏️ présent', async () => {
    getDayEvents.mockResolvedValue([NAP_ONGOING])
    const { unmount } = renderPanel()
    await screen.findByRole('button', { name: /Supprimer sieste/ }) // ligne rendue
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument()
    unmount()

    getDayEvents.mockResolvedValue([NAP_CLOSED])
    renderPanel()
    expect(await screen.findByRole('button', { name: /Modifier sieste/ })).toBeInTheDocument()
  })

  it('409 à l’édition d’une sieste : message clair via NapEditForm, pas de crash, sheet ouvert, PAS d’invalidation', async () => {
    getDayEvents.mockResolvedValue([NAP_CLOSED])
    updateNap.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: /Modifier sieste/ }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Sieste en cours : terminez-la d’abord.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Échec 409 → onError, jamais onSuccess : le sheet reste ouvert et le récap n'est PAS invalidé.
    expect(spy).not.toHaveBeenCalled()
  })

  it('US11.1 (front) : rend les événements dans l’ordre reçu de getDayEvents, sans re-tri client', async () => {
    // Liste déjà anté-chronologique (DESC) : sieste 09:00Z puis biberon 08:00Z. Un re-tri ASC
    // les inverserait → ce test échoue si le composant re-triait par heure côté client.
    getDayEvents.mockResolvedValue([
      { type: 'nap', id: 'n1', startAt: '2026-06-21T09:00:00.000Z', endAt: '2026-06-21T10:00:00.000Z' },
      { type: 'bottle_feeding', id: 'bf1', startAt: '2026-06-21T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    ])
    renderPanel()
    const deleteButtons = await screen.findAllByRole('button', { name: /^Supprimer/ })
    const names = deleteButtons.map((b) => b.getAttribute('aria-label'))
    expect(names[0]).toMatch(/Supprimer sieste/)
    expect(names[1]).toMatch(/Supprimer biberon/)
  })
})

describe('CalendarPanel — urine dans le récap et le calendrier (US13.2 Lot 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  it('chip 💧 : affiche urineCount avec le PLURIEL au-delà de 1 (« 3 urines »)', async () => {
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 3 })
    renderPanel()

    // La chip porte l'emoji 💧 et la valeur ; texte pluralisé « urines ».
    const chip = await screen.findByText((_, node) => node?.className === 'chip chip--urine')
    expect(chip).toHaveTextContent('💧')
    expect(chip).toHaveTextContent('3')
    expect(chip).toHaveTextContent('urines')
  })

  it('chip 💧 : SINGULIER pour exactement 1 (« 1 urine »), et 0 reste singulier', async () => {
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 1 })
    const { unmount } = renderPanel()
    const chipOne = await screen.findByText((_, node) => node?.className === 'chip chip--urine')
    expect(chipOne).toHaveTextContent('1 urine')
    expect(chipOne).not.toHaveTextContent('urines')
    unmount()

    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0 })
    renderPanel()
    const chipZero = await screen.findByText((_, node) => node?.className === 'chip chip--urine')
    expect(chipZero).toHaveTextContent('0 urine')
    expect(chipZero).not.toHaveTextContent('urines')
  })

  it('ligne d’événement urine : emoji 💧, libellé « Urine », tag event-tag--urine', async () => {
    getDayEvents.mockResolvedValue([
      { type: 'urine', id: 'u1', startAt: '2026-06-21T08:30:00.000Z', endAt: null },
    ])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 1 })
    renderPanel()

    // Le tag de la ligne : emoji + libellé, classe dédiée urine.
    const tag = await screen.findByText((_, node) => node?.className === 'event-tag event-tag--urine')
    expect(tag).toHaveTextContent('💧')
    expect(tag).toHaveTextContent('Urine')
    // describeEvent(urine) → « Urine » rendu dans le détail de la ligne.
    expect(screen.getByText('Urine', { selector: '.event-detail' })).toBeInTheDocument()
    // La ligne reste supprimable (bouton 🗑 par type urine).
    expect(screen.getByRole('button', { name: /Supprimer urine/ })).toBeInTheDocument()
  })
})

describe('CalendarPanel — filtre d’affichage par type sur la liste du jour (US13.3, Lot 5)', () => {
  // Un event de CHAQUE type + des totaux non nuls pour chaque compteur : on veut prouver que le filtre
  // ne touche QUE la liste, jamais les chips totaux.
  const MIXED_EVENTS = [
    { type: 'bottle_feeding', id: 'bf1', startAt: '2026-06-21T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    { type: 'nap', id: 'n1', startAt: '2026-06-21T09:00:00.000Z', endAt: '2026-06-21T10:00:00.000Z' },
    { type: 'stool', id: 's1', startAt: '2026-06-21T11:00:00.000Z', consistency: 'soft' },
    { type: 'urine', id: 'u1', startAt: '2026-06-21T12:00:00.000Z', endAt: null },
  ]
  const TOTALS = { date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 2, urineCount: 3 }

  // Le groupe de toggles (aria-label) isole les boutons du filtre des boutons 🗑/✏️ des lignes.
  const filterGroup = () => screen.getByRole('group', { name: 'Filtrer la liste par type' })
  const chip = (cls) => screen.queryByText((_, node) => node?.className === `chip chip--${cls}`)

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    getDayEvents.mockResolvedValue(MIXED_EVENTS)
    getDailyTotals.mockResolvedValue(TOTALS)
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  it('défaut (sessionStorage vide) : toutes les lignes affichées, tous les toggles aria-pressed="true"', async () => {
    renderPanel()
    // Les 4 lignes sont là (une par type, repérée par son 🗑).
    expect(await screen.findByRole('button', { name: /Supprimer biberon/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer sieste/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer selle/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer urine/ })).toBeInTheDocument()

    // Les 4 toggles sont « enfoncés » (rien de masqué au montage).
    const toggles = within(filterGroup()).getAllByRole('button')
    expect(toggles).toHaveLength(4)
    toggles.forEach((btn) => expect(btn).toHaveAttribute('aria-pressed', 'true'))
  })

  it('masquer un type retire ses lignes MAIS laisse les chips totaux inchangées', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer selle/ }) // liste rendue

    // Repère la chip 💩 AVANT le toggle : valeur « 2 selles ».
    expect(chip('stool')).toHaveTextContent('💩')
    expect(chip('stool')).toHaveTextContent('2')

    // Clic sur le toggle « Selle » (dans le groupe de filtre → pas d'ambiguïté avec le 🗑).
    await userEvent.click(within(filterGroup()).getByRole('button', { name: /Selle/ }))

    // La ligne selle disparaît…
    expect(screen.queryByRole('button', { name: /Supprimer selle/ })).not.toBeInTheDocument()
    // …le toggle passe à aria-pressed="false"…
    expect(within(filterGroup()).getByRole('button', { name: /Selle/ })).toHaveAttribute('aria-pressed', 'false')
    // …mais les autres lignes restent…
    expect(screen.getByRole('button', { name: /Supprimer biberon/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer urine/ })).toBeInTheDocument()
    // …et surtout la chip 💩 est TOUJOURS là, inchangée (le filtre n'affecte pas les totaux).
    expect(chip('stool')).toBeInTheDocument()
    expect(chip('stool')).toHaveTextContent('💩')
    expect(chip('stool')).toHaveTextContent('2')
  })

  it('recliquer le toggle réaffiche les lignes du type', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer urine/ })

    await userEvent.click(within(filterGroup()).getByRole('button', { name: /Urine/ })) // masque
    expect(screen.queryByRole('button', { name: /Supprimer urine/ })).not.toBeInTheDocument()

    await userEvent.click(within(filterGroup()).getByRole('button', { name: /Urine/ })) // ré-affiche
    expect(screen.getByRole('button', { name: /Supprimer urine/ })).toBeInTheDocument()
    expect(within(filterGroup()).getByRole('button', { name: /Urine/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tout masqué → message « Aucun événement pour les types affichés. » et chips toujours présentes', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer biberon/ })

    // Masque les 4 types un à un.
    for (const name of [/Biberon/, /Sieste/, /Selle/, /Urine/]) {
      await userEvent.click(within(filterGroup()).getByRole('button', { name }))
    }

    expect(screen.getByText('Aucun événement pour les types affichés.')).toBeInTheDocument()
    // Plus aucune ligne (aucun 🗑).
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument()
    // Les chips totaux restent toutes affichées.
    expect(chip('milk')).toBeInTheDocument()
    expect(chip('sleep')).toBeInTheDocument()
    expect(chip('stool')).toBeInTheDocument()
    expect(chip('urine')).toBeInTheDocument()
    // Les toggles restent visibles pour pouvoir tout réafficher.
    expect(within(filterGroup()).getAllByRole('button')).toHaveLength(4)
  })

  it('persistance sessionStorage : le type masqué est stocké, un remontage conserve l’état (PAS localStorage)', async () => {
    const { unmount } = renderPanel()
    await screen.findByRole('button', { name: /Supprimer selle/ })
    await userEvent.click(within(filterGroup()).getByRole('button', { name: /Selle/ }))

    // C'est bien sessionStorage (clé calendar.dayFilter) qui porte le type masqué, PAS localStorage.
    const raw = sessionStorage.getItem('calendar.dayFilter')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw)).toContain('stool')
    expect(localStorage.getItem('calendar.dayFilter')).toBeNull()

    // Remontage dans la MÊME session (storage rempli) : l'état masqué est rechargé au montage.
    unmount()
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer biberon/ }) // liste rechargée
    expect(screen.queryByRole('button', { name: /Supprimer selle/ })).not.toBeInTheDocument()
    expect(within(filterGroup()).getByRole('button', { name: /Selle/ })).toHaveAttribute('aria-pressed', 'false')
    // La chip 💩 reste présente après remontage (filtre ≠ totaux).
    expect(chip('stool')).toBeInTheDocument()
  })
})
