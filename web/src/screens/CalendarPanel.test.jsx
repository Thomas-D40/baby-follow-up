import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CalendarPanel from './CalendarPanel'
import { EVENT_TYPE_LABEL } from '../calendar'
import { toLocalInputValue } from '../bottleFeeding'
import { toLocalInputValue as toLocalInputValueStool } from '../stool'

vi.mock('../api', () => ({
  getDayEvents: vi.fn(),
  getDailyTotals: vi.fn(),
  // `useDeleteEvent` route vers les 8 clients : tous présents dans le mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  deleteTemperature: vi.fn(),
  deleteMedicalCare: vi.fn(),
  deleteBreastfeeding: vi.fn(),
  deleteSolidMeal: vi.fn(),
  // Édition depuis le récap (US11.2) : les 8 clients d'update.
  updateBottleFeeding: vi.fn(),
  updateNap: vi.fn(),
  updateStool: vi.fn(),
  updateUrine: vi.fn(),
  updateTemperature: vi.fn(),
  updateMedicalCare: vi.fn(),
  updateBreastfeeding: vi.fn(),
  updateSolidMeal: vi.fn(),
  // L'édition d'un repas monte SolidMealForm, qui cherche dans le référentiel (Épic 18).
  searchDishes: vi.fn(),
  // Section Vitamines (Épic 9) rendue par CalendarPanel.
  getVitamins: vi.fn(),
  setVitamin: vi.fn(),
  unsetVitamin: vi.fn(),
}))
import {
  getDayEvents,
  getDailyTotals,
  deleteBottleFeeding,
  deleteBreastfeeding,
  deleteNap,
  deleteSolidMeal,
  getVitamins,
  searchDishes,
  updateBottleFeeding,
  updateBreastfeeding,
  updateMedicalCare,
  updateNap,
  updateSolidMeal,
  updateStool,
  updateTemperature,
  updateUrine,
} from '../api'

const PREFIX = { queryKey: ['babies', 'b1'] }

// A meal edit opens SolidMealForm, which searches the dish list as soon as the text is non-empty.
beforeEach(() => {
  searchDishes.mockResolvedValue({ items: [], exactMatch: false })
})

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

// ── Épic 16 (US16.1) : repères de la rangée unifiée « totaux ↔ filtre » ──────────────────────────
// La rangée est un <ul> NOMMÉ (D16-T) : le panel monte TROIS listes (totaux, vitamines, liste du
// jour), le nom accessible est ce qui lève l'ambiguïté d'un `getByRole('list')` nu.
const chipRow = () => screen.getByRole('list', { name: 'Totaux du jour — filtrer la liste' })
// Une pastille se repère par son TYPE : son nom accessible contient le libellé du type dans les DEUX
// régimes (« Urine » sans valeur au premier rendu, « Urine · 3 urines » une fois les totaux là,
// D16-K/D16-P) — donc un sélecteur stable pendant toute la durée du test, ce qui permet de séparer
// « trouver la pastille » (synchrone) de « attendre sa valeur » (waitFor).
// ⚠️ `queryByRole` et NON `getByRole` : chip('temperature') doit pouvoir valoir `null` (D16-H).
// `chipRow()` reste un `getByRole` : une assertion négative sur une pastille échoue donc bel et bien
// si la rangée entière a disparu, au lieu de passer au vert sur un `null` de complaisance.
const chip = (type) => within(chipRow()).queryByRole('button', { name: new RegExp(EVENT_TYPE_LABEL[type]) })

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

  it('pastille 💧 : affiche urineCount avec le PLURIEL au-delà de 1 (« 3 urines »)', async () => {
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 3 })
    renderPanel()

    // ⚠️ D16-J : la pastille existe DÈS le premier rendu, sans valeur. C'est donc la VALEUR qu'il
    // faut attendre — un `getByRole` synchrone la trouverait vide et l'assertion échouerait.
    await waitFor(() => expect(chip('urine')).toHaveTextContent('3 urines'))
    expect(chip('urine')).toHaveTextContent('💧')
    expect(chip('urine')).toHaveAttribute('aria-label', 'Urine · 3 urines')
  })

  it('pastille 💧 : SINGULIER pour exactement 1 (« 1 urine »), et 0 reste singulier', async () => {
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 1 })
    const { unmount } = renderPanel()
    await waitFor(() => expect(chip('urine')).toHaveTextContent('1 urine'))
    expect(chip('urine')).not.toHaveTextContent('urines')
    unmount()

    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0 })
    renderPanel()
    await waitFor(() => expect(chip('urine')).toHaveTextContent('0 urine'))
    expect(chip('urine')).not.toHaveTextContent('urines')
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
  // Épic 16 : les NEUF champs sont renseignés. Sans `maxTemperatureCelsiusX10`, D16-H retirerait la
  // pastille 🌡 et le compte de la rangée tomberait silencieusement de 9 à 8 ; sans `eyeCareCount` /
  // `noseCareCount`, les pastilles 👁 et 👃 seraient rendues SANS valeur (D16-Q), ce qui rendrait
  // infalsifiable l'AC « tout masqué → les neuf pastilles restent valuées ».
  const TOTALS = {
    date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 2, urineCount: 3,
    maxTemperatureCelsiusX10: 384, eyeCareCount: 2, noseCareCount: 8,
    breastfeedingCount: 3, solidMealCount: 2,
  }

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

    // ⚠️ Attendre une VALEUR avant de compter : sans totaux, la rangée vaut 7 par D16-P — le compte
    // ne prouverait alors rien de D16-H. La 🌡 valuée atteste que les totaux sont bien arrivés.
    await waitFor(() => expect(chip('temperature')).toHaveTextContent('38,4 °C'))

    // Les 9 pastilles sont « enfoncées » (rien de masqué au montage).
    const toggles = within(chipRow()).getAllByRole('button')
    expect(toggles).toHaveLength(9)
    toggles.forEach((btn) => expect(btn).toHaveAttribute('aria-pressed', 'true'))
  })

  it('éteindre un type retire ses lignes MAIS le MÊME bouton garde sa valeur (D16-C/D16-M)', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer selle/ }) // liste rendue

    // Valeur de la pastille 💩 AVANT extinction — attendue, pas supposée (D16-J : elle naît vide).
    await waitFor(() => expect(chip('stool')).toHaveTextContent('2 selles'))
    expect(chip('stool')).toHaveTextContent('💩')

    // Clic sur la pastille « Selle » : c'est elle, désormais, le contrôle de filtre (D16-A).
    await userEvent.click(chip('stool'))

    // La ligne selle disparaît…
    expect(screen.queryByRole('button', { name: /Supprimer selle/ })).not.toBeInTheDocument()
    // …la pastille passe à aria-pressed="false"…
    expect(chip('stool')).toHaveAttribute('aria-pressed', 'false')
    // …mais les autres lignes restent…
    expect(screen.getByRole('button', { name: /Supprimer biberon/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer urine/ })).toBeInTheDocument()
    // …et le MÊME bouton, éteint, affiche toujours « 2 selles » : la valeur survit à l'extinction,
    // l'état est porté par aria-pressed et non par une valeur effacée ou illisible (D16-M).
    expect(chip('stool')).toHaveTextContent('💩')
    expect(chip('stool')).toHaveTextContent('2 selles')
    expect(chip('stool')).toHaveAttribute('aria-label', 'Selle · 2 selles')
  })

  it('AC « aucune requête relancée » : éteindre puis rallumer ne refait ni events ni daily-totals', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer selle/ })
    await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(1))
    expect(getDayEvents).toHaveBeenCalledTimes(1)

    await userEvent.click(chip('stool'))
    await userEvent.click(chip('stool'))

    // Le filtre est un prédicat d'affichage : il ne touche NI les requêtes NI les agrégats (D16-C).
    expect(getDayEvents).toHaveBeenCalledTimes(1)
    expect(getDailyTotals).toHaveBeenCalledTimes(1)
    expect(chip('stool')).toHaveTextContent('2 selles')
  })

  it('recliquer la pastille réaffiche les lignes du type', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer urine/ })

    await userEvent.click(chip('urine')) // masque
    expect(screen.queryByRole('button', { name: /Supprimer urine/ })).not.toBeInTheDocument()

    await userEvent.click(chip('urine')) // ré-affiche
    expect(screen.getByRole('button', { name: /Supprimer urine/ })).toBeInTheDocument()
    expect(chip('urine')).toHaveAttribute('aria-pressed', 'true')
  })

  it('tout masqué → message « Aucun événement pour les types affichés. » et 9 pastilles valuées', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer biberon/ })
    // Les valeurs doivent être là AVANT de tout éteindre : c'est ce qu'on veut voir survivre.
    await waitFor(() => expect(chip('temperature')).toHaveTextContent('38,4 °C'))

    // L'AC dit « les NEUF types sont éteints » : la rangée fusionnée les rend tous cliquables, même
    // ceux qui n'ont aucune ligne ce jour-là.
    for (const type of ['bottle_feeding', 'breastfeeding', 'solid_meal', 'nap', 'stool', 'urine', 'temperature', 'eye_care', 'nose_care']) {
      await userEvent.click(chip(type))
    }

    expect(screen.getByText('Aucun événement pour les types affichés.')).toBeInTheDocument()
    // Plus aucune ligne (aucun 🗑).
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument()

    // Les 9 pastilles restent affichées, VALUÉES et cliquables : aucun état irrécupérable (D16-O).
    const toggles = within(chipRow()).getAllByRole('button')
    expect(toggles).toHaveLength(9)
    toggles.forEach((btn) => expect(btn).toHaveAttribute('aria-pressed', 'false'))
    expect(chip('bottle_feeding')).toHaveTextContent('120 ml')
    expect(chip('nap')).toHaveTextContent('1 h 00')
    expect(chip('stool')).toHaveTextContent('2 selles')
    expect(chip('urine')).toHaveTextContent('3 urines')
    expect(chip('temperature')).toHaveTextContent('38,4 °C')
    expect(chip('eye_care')).toHaveTextContent('2 soins des yeux')
    expect(chip('nose_care')).toHaveTextContent('8 soins du nez')
    expect(chip('breastfeeding')).toHaveTextContent('3 tétées')
    expect(chip('solid_meal')).toHaveTextContent('2 repas')

    // …et rallumer un type ramène bien ses lignes : la sortie de l'état « tout masqué » existe.
    await userEvent.click(chip('urine'))
    expect(screen.getByRole('button', { name: /Supprimer urine/ })).toBeInTheDocument()
  })

  it('persistance sessionStorage : le type masqué est stocké, un remontage conserve l’état (PAS localStorage)', async () => {
    const { unmount } = renderPanel()
    await screen.findByRole('button', { name: /Supprimer selle/ })
    await userEvent.click(chip('stool'))

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
    expect(chip('stool')).toHaveAttribute('aria-pressed', 'false')
    // La pastille 💩 retrouve sa valeur après remontage (filtre ≠ totaux).
    await waitFor(() => expect(chip('stool')).toHaveTextContent('2 selles'))
  })
})

describe('CalendarPanel — température et soins au récap (Épic 15, US15.1/US15.2)', () => {
  const VITAMINS = { date: '2026-06-21', items: [
    { vitaminType: 'd', given: false, authorId: null },
    { vitaminType: 'k', given: false, authorId: null },
  ] }
  const BASE_TOTALS = {
    date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0,
    maxTemperatureCelsiusX10: null, eyeCareCount: 0, noseCareCount: 0,
    breastfeedingCount: 0, solidMealCount: 0,
  }
  const TEMP_PAST = { type: 'temperature', id: 't1', startAt: '2020-03-15T09:30:00.000Z', temperatureCelsiusX10: 384 }
  const EYE_PAST = { type: 'eye_care', id: 'e1', startAt: '2020-03-15T08:00:00.000Z' }
  const NOSE_PAST = { type: 'nose_care', id: 'n1', startAt: '2020-03-15T07:00:00.000Z' }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    getVitamins.mockResolvedValue(VITAMINS)
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue(BASE_TOTALS)
  })

  it('pastille 🌡 : rend le MAXIMUM du jour en °C (384 → « 38,4 °C »)', async () => {
    getDailyTotals.mockResolvedValue({ ...BASE_TOTALS, maxTemperatureCelsiusX10: 384 })
    renderPanel()

    await waitFor(() => expect(chip('temperature')).toHaveTextContent('38,4 °C'))
    expect(chip('temperature')).toHaveTextContent('🌡')
  })

  it('pastille 🌡 : `null` (aucune mesure) → AUCUNE pastille rendue, la rangée tombe à 8 (D15-K/D16-H)', async () => {
    getDailyTotals.mockResolvedValue({ ...BASE_TOTALS, maxTemperatureCelsiusX10: null })
    renderPanel()

    // ⚠️ Attendre une VALEUR, pas un nœud : depuis D16-J, chip('milk') est présent dès le premier
    // rendu — un `waitFor` sur sa seule présence n'attendrait plus rien et les assertions
    // tomberaient sur la rangée encore à 9 pastilles (D16-P), 🌡 comprise.
    await waitFor(() => expect(chip('bottle_feeding')).toHaveTextContent('0 ml'))
    expect(chip('temperature')).toBeNull()
    expect(within(chipRow()).getAllByRole('button')).toHaveLength(8)
    expect(screen.queryByText(/🌡/)).not.toBeInTheDocument()
  })

  it('pastille 🌡 : `0` N’EST PAS `null` → la pastille reste VISIBLE (garde `!= null`, jamais falsy)', async () => {
    // Sans ce cas, le test `null` ci-dessus passerait à l'identique avec une garde falsy
    // (`{totals.max… && …}`), qui masquerait aussi un 0 — une valeur pourtant transmise par le serveur.
    getDailyTotals.mockResolvedValue({ ...BASE_TOTALS, maxTemperatureCelsiusX10: 0 })
    renderPanel()

    await waitFor(() => expect(chip('temperature')).toHaveTextContent('0,0 °C'))
    expect(chip('temperature')).toHaveTextContent('🌡')
    expect(within(chipRow()).getAllByRole('button')).toHaveLength(9)
  })

  it('pastilles 👁 et 👃 : comptages distincts l’un de l’autre ET de 🌡', async () => {
    getDailyTotals.mockResolvedValue({
      ...BASE_TOTALS, maxTemperatureCelsiusX10: 372, eyeCareCount: 2, noseCareCount: 3,
    })
    renderPanel()

    await waitFor(() => expect(chip('eye_care')).toHaveTextContent('2 soins des yeux'))
    const eye = chip('eye_care')
    const nose = chip('nose_care')
    const temp = chip('temperature')

    expect(eye).toHaveTextContent('👁')
    expect(nose).toHaveTextContent('👃')
    expect(nose).toHaveTextContent('3 soins du nez')
    expect(temp).toHaveTextContent('37,2 °C')
    // Trois nœuds distincts : ni fusion, ni doublon.
    expect(new Set([eye, nose, temp]).size).toBe(3)
  })

  it('ligne de frise température : heure + tag 🌡 + valeur formatée', async () => {
    getDayEvents.mockResolvedValue([TEMP_PAST])
    renderPanel()

    const tag = await screen.findByText((_, node) => node?.className === 'event-tag event-tag--temperature')
    expect(tag).toHaveTextContent('🌡')
    expect(tag).toHaveTextContent('Température')
    expect(screen.getByText('38,4 °C', { selector: '.event-detail' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer température/ })).toBeInTheDocument()
  })

  it('lignes de frise soins : tags 👁 / 👃 distincts et détail explicite', async () => {
    getDayEvents.mockResolvedValue([EYE_PAST, NOSE_PAST])
    renderPanel()

    const eyeTag = await screen.findByText((_, node) => node?.className === 'event-tag event-tag--eye-care')
    const noseTag = screen.getByText((_, node) => node?.className === 'event-tag event-tag--nose-care')
    expect(eyeTag).toHaveTextContent('👁')
    expect(noseTag).toHaveTextContent('👃')
    expect(screen.getByText('Soin des yeux', { selector: '.event-detail' })).toBeInTheDocument()
    expect(screen.getByText('Soin du nez', { selector: '.event-detail' })).toBeInTheDocument()
  })

  it('VIABILITÉ DU MODÈLE (D15-I) : 8 soins du nez masqués → 8 lignes disparaissent, chips inchangées, défaut = tout affiché', async () => {
    const NOSES = Array.from({ length: 8 }, (_, i) => ({
      type: 'nose_care', id: `n${i}`, startAt: `2026-06-21T0${i}:15:00.000Z`,
    }))
    getDayEvents.mockResolvedValue([TEMP_PAST, ...NOSES])
    getDailyTotals.mockResolvedValue({ ...BASE_TOTALS, maxTemperatureCelsiusX10: 384, noseCareCount: 8 })
    const { unmount } = renderPanel()

    // Défaut : tout affiché — les 8 lignes 👃 + la ligne 🌡.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Supprimer nez/ })).toHaveLength(8))
    expect(screen.getByRole('button', { name: /Supprimer température/ })).toBeInTheDocument()

    // Les valeurs doivent être arrivées AVANT le clic : c'est leur survie qu'on veut prouver.
    await waitFor(() => expect(chip('nose_care')).toHaveTextContent('8 soins du nez'))
    await userEvent.click(chip('nose_care'))

    // Les 8 lignes disparaissent, la température reste, les pastilles ne bougent pas.
    expect(screen.queryByRole('button', { name: /Supprimer nez/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer température/ })).toBeInTheDocument()
    expect(chip('nose_care')).toHaveTextContent('8 soins du nez')
    expect(chip('temperature')).toHaveTextContent('38,4 °C')

    // Défaut au rechargement (session vide) = tout affiché.
    unmount()
    sessionStorage.clear()
    renderPanel()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Supprimer nez/ })).toHaveLength(8))
  })

  it('NON-RÉGRESSION K1 : ✏️ sur une ligne 👁 puis sur une ligne 👃 ouvre le form sans erreur, avec le bon titre', async () => {
    getDayEvents.mockResolvedValue([EYE_PAST, NOSE_PAST])
    const { unmount } = renderPanel()

    // Sans les deux types de calendrier, EVENT_TYPE_LABEL[editing.type] serait undefined
    // → `undefined.toLowerCase()` → TypeError démontant tout CalendarPanel.
    await userEvent.click(await screen.findByRole('button', { name: /Modifier yeux/ }))
    let dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modifier yeux')
    expect(within(dialog).getByText('Soin : Yeux')).toBeInTheDocument()
    unmount()

    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Modifier nez/ }))
    dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modifier nez')
    expect(within(dialog).getByText('Soin : Nez')).toBeInTheDocument()
  })

  it('GARDE-FOU température : « Quand » prérempli depuis startAt (remap), PAS « maintenant »', async () => {
    getDayEvents.mockResolvedValue([TEMP_PAST])
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Modifier température/ }))

    const dialog = screen.getByRole('dialog')
    const when = within(dialog).getByLabelText('Quand')
    expect(when).toHaveValue(toLocalInputValueStool(new Date(TEMP_PAST.startAt)))
    expect(when.value).not.toBe(toLocalInputValueStool(new Date()))
    // La valeur est pré-remplie en °C avec la virgule fr-FR.
    expect(within(dialog).getByLabelText('Température (°C)')).toHaveValue('38,4')
  })

  it('soumission température : updateTemperature(b1, id, patch) une fois, sheet fermé, préfixe invalidé', async () => {
    getDayEvents.mockResolvedValue([TEMP_PAST])
    updateTemperature.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: /Modifier température/ }))
    const dialog = screen.getByRole('dialog')
    const value = within(dialog).getByLabelText('Température (°C)')
    await userEvent.clear(value)
    await userEvent.type(value, '37,2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateTemperature).toHaveBeenCalledTimes(1))
    expect(updateTemperature.mock.calls[0][0]).toBe('b1')
    expect(updateTemperature.mock.calls[0][1]).toBe('t1')
    expect(updateTemperature.mock.calls[0][2].temperatureCelsiusX10).toBe(372)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('soumission soin : PATCH par RESSOURCE (updateMedicalCare) réduit à l’heure, jamais l’acte composite', async () => {
    getDayEvents.mockResolvedValue([EYE_PAST])
    updateMedicalCare.mockResolvedValue({})
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier yeux/ }))
    const dialog = screen.getByRole('dialog')
    // Heure préremplie depuis startAt (remap), pas « maintenant ».
    const when = within(dialog).getByLabelText('Quand')
    expect(when).toHaveValue(toLocalInputValueStool(new Date(EYE_PAST.startAt)))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateMedicalCare).toHaveBeenCalledTimes(1))
    expect(updateMedicalCare.mock.calls[0][0]).toBe('b1')
    expect(updateMedicalCare.mock.calls[0][1]).toBe('e1')
    // Le type de soin est immuable en édition : le patch ne porte QUE le champ corrigé.
    expect(updateMedicalCare.mock.calls[0][2]).toEqual({ occurredAt: expect.any(String) })
  })

  it('BUG LATENT FERMÉ : ✏️ sur une ligne 💧 ouvre UrineForm et poste updateUrine', async () => {
    // `updateUrine` était importé par CalendarPanel mais absent du mock : la suite ne tenait que
    // parce qu'aucun test n'ouvrait l'édition d'une urine.
    const URINE_PAST = { type: 'urine', id: 'u1', startAt: '2020-03-15T06:00:00.000Z', endAt: null }
    getDayEvents.mockResolvedValue([URINE_PAST])
    updateUrine.mockResolvedValue({})
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier urine/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modifier urine')
    const when = within(dialog).getByLabelText('Quand')
    expect(when).toHaveValue(toLocalInputValueStool(new Date(URINE_PAST.startAt)))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateUrine).toHaveBeenCalledTimes(1))
    expect(updateUrine.mock.calls[0][0]).toBe('b1')
    expect(updateUrine.mock.calls[0][1]).toBe('u1')
  })
})

describe('CalendarPanel — rangée unifiée totaux ↔ filtre (Épic 16, US16.1)', () => {
  const MIXED_EVENTS = [
    { type: 'bottle_feeding', id: 'bf1', startAt: '2026-06-21T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    { type: 'nap', id: 'n1', startAt: '2026-06-21T09:00:00.000Z', endAt: '2026-06-21T10:00:00.000Z' },
    { type: 'stool', id: 's1', startAt: '2026-06-21T11:00:00.000Z', consistency: 'soft' },
    { type: 'urine', id: 'u1', startAt: '2026-06-21T12:00:00.000Z', endAt: null },
  ]
  // Les NEUF champs renseignés : c'est la fixture des régimes « valués ».
  const FULL_TOTALS = {
    date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 2, urineCount: 3,
    maxTemperatureCelsiusX10: 384, eyeCareCount: 2, noseCareCount: 8,
    breastfeedingCount: 3, solidMealCount: 2,
  }
  // Journée réellement vide : aucun événement, donc AUCUNE mesure ⇒ maxTemperatureCelsiusX10 null.
  const EMPTY_TOTALS = {
    date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0,
    maxTemperatureCelsiusX10: null, eyeCareCount: 0, noseCareCount: 0,
    breastfeedingCount: 0, solidMealCount: 0,
  }
  const labelsOf = () => within(chipRow()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    getDayEvents.mockResolvedValue(MIXED_EVENTS)
    getDailyTotals.mockResolvedValue(FULL_TOTALS)
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  it('UNE SEULE rangée : le groupe « Filtrer la liste par type » a disparu du DOM (D16-A)', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer selle/ })

    expect(screen.queryByRole('group', { name: 'Filtrer la liste par type' })).not.toBeInTheDocument()

    // ⚠️ L'assertion ci-dessus est un `queryBy` : elle rendrait `null` quoi qu'il arrive. La preuve
    // POSITIVE est ici — il n'existe qu'UNE série de boutons à bascule dans tout le panneau, et
    // c'est exactement la rangée de totaux. Si le bloc `.day-filter` avait survécu, on en compterait
    // 14, et ce test tomberait.
    const pressables = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    expect(pressables).toHaveLength(9)
    expect(pressables).toEqual(within(chipRow()).getAllByRole('button'))
  })

  it('nom accessible (D16-K/D16-T) : les 9 pastilles sont nommées « <Type> · <valeur> », dans l’ordre', async () => {
    renderPanel()

    // ⚠️ Le relevé se fait derrière un waitFor : les libellés NAISSENT réduits au type (D16-P), et
    // un `getByRole` synchrone les capturerait sans leur valeur.
    await waitFor(() => expect(labelsOf()).toEqual([
      'Biberon · 120 ml',
      'Tétée · 3 tétées',
      'Diversification · 2 repas',
      'Sieste · 1 h 00',
      'Selle · 2 selles',
      'Urine · 3 urines',
      'Température · 38,4 °C',
      'Yeux · 2 soins des yeux',
      'Nez · 8 soins du nez',
    ]))

    // ⛔ D16-K : l'état est porté par aria-pressed SEUL, jamais écrit en toutes lettres.
    labelsOf().forEach((label) => {
      expect(label).not.toMatch(/affich|masqu/i)
    })
    within(chipRow()).getAllByRole('button').forEach((btn) => {
      expect(btn).toHaveAttribute('aria-pressed')
    })
  })

  it('journée sans événement (D16-J) : message vide MAIS rangée présente, 8 pastilles à 0 cliquables', async () => {
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue(EMPTY_TOTALS)
    renderPanel()

    expect(await screen.findByText('Aucun événement ce jour-là.')).toBeInTheDocument()

    // Attendre une VALEUR : c'est la seule preuve que les totaux sont arrivés (D16-J fait naître la
    // rangée avant eux, avec 9 pastilles — dont la 🌡 que D16-H retire ensuite).
    await waitFor(() => expect(chip('bottle_feeding')).toHaveTextContent('0 ml'))
    expect(within(chipRow()).getAllByRole('button')).toHaveLength(8)
    expect(chip('temperature')).toBeNull()
    expect(chip('stool')).toHaveTextContent('0 selle')
    expect(chip('urine')).toHaveTextContent('0 urine')

    // …et elles restent cliquables (aucun état figé sur une journée vide).
    await userEvent.click(chip('stool'))
    expect(chip('stool')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Aucun événement ce jour-là.')).toBeInTheDocument()
  })

  it('MODE DÉGRADÉ (D16-J/D16-P) : daily-totals en erreur ⇒ 9 pastilles sans valeur, filtre OPÉRANT', async () => {
    getDailyTotals.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    // `renderPanel` fixe retry:false : l'erreur se stabilise sans attente artificielle.
    await screen.findByRole('button', { name: /Supprimer urine/ })
    await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(1))

    // (1) Le filtre OPÈRE malgré la panne des totaux — c'est ce que le gating `{totals && …}`
    // emporterait s'il était conservé, et rien d'autre dans la suite ne l'attrape.
    await userEvent.click(chip('urine'))
    expect(screen.queryByRole('button', { name: /Supprimer urine/ })).not.toBeInTheDocument()
    expect(chip('urine')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Supprimer selle/ })).toBeInTheDocument()

    // (2) Les 9 pastilles sont là (la règle d'existence de 🌡 n'a rien à évaluer sans totaux) et
    // AUCUNE ne porte de valeur : chaque libellé est le type seul — jamais « Urine · undefined
    // urine » ni « Sieste · NaN min » (⛔ D16-K, porte de D16-Q). Relevé APRÈS le clic : toutes les
    // microtâches de la requête rejetée sont écoulées, l'absence de valeur est donc l'état stable.
    expect(labelsOf()).toEqual([
      'Biberon', 'Tétée', 'Diversification', 'Sieste', 'Selle', 'Urine', 'Température', 'Yeux', 'Nez',
    ])
    within(chipRow()).getAllByRole('button').forEach((btn) => {
      expect(btn.querySelector('strong')).toBeNull()
    })

    // (3) Aucun message d'erreur ajouté : la gestion d'erreur du récap reste silencieuse (⛔ D16-J).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('D16-Q : un DTO incomplet ne dégrade QUE ses propres pastilles, pas la rangée entière', async () => {
    // Payload d'une version antérieure du serveur : ni température, ni soins. Le repli se décide par
    // CHAMP — les quatre champs présents restent valués, les trois absents rendent l'emoji seul.
    getDailyTotals.mockResolvedValue({
      date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 2, urineCount: 3,
    })
    renderPanel()

    await waitFor(() => expect(chip('bottle_feeding')).toHaveTextContent('120 ml'))
    expect(labelsOf()).toEqual([
      'Biberon · 120 ml', 'Tétée', 'Diversification', 'Sieste · 1 h 00', 'Selle · 2 selles',
      'Urine · 3 urines', 'Yeux', 'Nez',
    ])
    // maxTemperatureCelsiusX10 absent ⇒ `!= null` faux ⇒ pas de pastille 🌡 du tout (D16-H).
    expect(chip('temperature')).toBeNull()
    expect(chip('eye_care')).not.toHaveTextContent('undefined')
    expect(chip('nap')).not.toHaveTextContent('NaN')
  })
})

describe('CalendarPanel — tétées au récap (Épic 18, US18.2)', () => {
  const VITAMINS = { date: '2026-06-21', items: [
    { vitaminType: 'd', given: false, authorId: null },
    { vitaminType: 'k', given: false, authorId: null },
  ] }
  const totalsWith = (breastfeedingCount) => ({
    date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0,
    maxTemperatureCelsiusX10: null, eyeCareCount: 0, noseCareCount: 0,
    breastfeedingCount, solidMealCount: 0,
  })
  // 09:30Z / 08:00Z / 07:00Z on a March day = 10:30 / 09:00 / 08:00 in Paris (CET).
  const BREAST_FULL = { type: 'breastfeeding', id: 'br1', startAt: '2020-03-15T09:30:00.000Z', endAt: null, side: 'left', durationMinutes: 12 }
  const BREAST_SIDE = { type: 'breastfeeding', id: 'br2', startAt: '2020-03-15T08:00:00.000Z', endAt: null, side: 'right', durationMinutes: null }
  const BREAST_BARE = { type: 'breastfeeding', id: 'br3', startAt: '2020-03-15T07:00:00.000Z', endAt: null, side: null, durationMinutes: null }
  const rowOf = (name) => screen.getByRole('button', { name }).closest('li')

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    getVitamins.mockResolvedValue(VITAMINS)
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue(totalsWith(0))
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
  })

  it('pastille Tétée : « Tétée · 3 tétées » au pluriel', async () => {
    getDailyTotals.mockResolvedValue(totalsWith(3))
    renderPanel()

    await waitFor(() => expect(chip('breastfeeding')).toHaveAttribute('aria-label', 'Tétée · 3 tétées'))
  })

  it('journée sans tétée : « Tétée · 0 tétée » (singulier)', async () => {
    renderPanel()

    await waitFor(() => expect(chip('breastfeeding')).toHaveAttribute('aria-label', 'Tétée · 0 tétée'))
  })

  it('une seule tétée : « Tétée · 1 tétée »', async () => {
    getDailyTotals.mockResolvedValue(totalsWith(1))
    renderPanel()

    await waitFor(() => expect(chip('breastfeeding')).toHaveAttribute('aria-label', 'Tétée · 1 tétée'))
  })

  it('lignes du récap : tag 🤱 Tétée et détail « Gauche · 12 min », « Droit », « — »', async () => {
    getDayEvents.mockResolvedValue([BREAST_FULL, BREAST_SIDE, BREAST_BARE])
    getDailyTotals.mockResolvedValue(totalsWith(3))
    renderPanel()

    const full = rowOf(await screen.findByRole('button', { name: 'Supprimer tétée de 10:30' }))
    expect(full).toHaveTextContent('🤱')
    expect(full).toHaveTextContent('Tétée')
    expect(full).toHaveTextContent('Gauche · 12 min')
    expect(rowOf('Supprimer tétée de 09:00')).toHaveTextContent('Droit')
    expect(rowOf('Supprimer tétée de 09:00')).not.toHaveTextContent('min')
    expect(rowOf('Supprimer tétée de 08:00')).toHaveTextContent('—')
  })

  it('filtrer : la pastille Tétée masque ses lignes, garde son nom et laisse les autres lignes', async () => {
    getDayEvents.mockResolvedValue([
      BREAST_FULL,
      { type: 'bottle_feeding', id: 'bf1', startAt: '2020-03-15T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    ])
    getDailyTotals.mockResolvedValue(totalsWith(3))
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer tétée/ })
    await waitFor(() => expect(chip('breastfeeding')).toHaveAttribute('aria-label', 'Tétée · 3 tétées'))

    await userEvent.click(chip('breastfeeding'))

    expect(screen.queryByRole('button', { name: /Supprimer tétée/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Supprimer biberon/ })).toBeInTheDocument()
    expect(chip('breastfeeding')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('breastfeeding')).toHaveAttribute('aria-label', 'Tétée · 3 tétées')
  })

  it('modifier : formulaire prérempli depuis l’événement (côté, durée, heure du début), sans sélecteur de mode', async () => {
    getDayEvents.mockResolvedValue([BREAST_FULL])
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier tétée de 10:30' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modifier tétée')
    const side = within(dialog).getByRole('group', { name: 'Côté' })
    expect(within(side).getByRole('button', { name: 'Gauche' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(side).getByRole('button', { name: 'Droit' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByLabelText('Durée (min)')).toHaveValue('12')
    const when = within(dialog).getByLabelText('Quand')
    expect(when).toHaveValue(toLocalInputValue(new Date(BREAST_FULL.startAt)))
    expect(when.value).not.toBe(toLocalInputValue(new Date()))
    // No mode selector, no bottle / meal field, no last-feed reminder in an edit.
    expect(within(dialog).queryByRole('tablist')).toBeNull()
    expect(within(dialog).queryByLabelText('Quantité (ml)')).toBeNull()
    expect(within(dialog).queryByLabelText('Plat')).toBeNull()
    expect(within(dialog).queryByText(/Dernière tétée/)).toBeNull()
  })

  it('soumission : updateBreastfeeding(b1, id, { occurredAt, side, durationMinutes }) une fois, feuille fermée, préfixe invalidé une fois', async () => {
    getDayEvents.mockResolvedValue([BREAST_FULL])
    updateBreastfeeding.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier tétée de 10:30' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Droit' }))
    const duration = within(dialog).getByLabelText('Durée (min)')
    await userEvent.clear(duration)
    await userEvent.type(duration, '15')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateBreastfeeding).toHaveBeenCalledTimes(1))
    expect(updateBreastfeeding.mock.calls[0]).toEqual(
      ['b1', 'br1', { occurredAt: expect.any(String), side: 'right', durationMinutes: 15 }],
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('effacer la durée à l’édition envoie durationMinutes: null', async () => {
    getDayEvents.mockResolvedValue([BREAST_FULL])
    updateBreastfeeding.mockResolvedValue({})
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier tétée de 10:30' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('Durée (min)'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateBreastfeeding).toHaveBeenCalledTimes(1))
    expect(updateBreastfeeding.mock.calls[0][2]).toEqual(
      { occurredAt: expect.any(String), side: 'left', durationMinutes: null },
    )
  })

  it('supprimer : modale de confirmation puis deleteBreastfeeding(b1, id)', async () => {
    getDayEvents.mockResolvedValue([BREAST_FULL])
    deleteBreastfeeding.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer tétée de 10:30' }))
    expect(deleteBreastfeeding).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteBreastfeeding).toHaveBeenCalledTimes(1))
    expect(deleteBreastfeeding.mock.calls[0]).toEqual(['b1', 'br1'])
  })
})
