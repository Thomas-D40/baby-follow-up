import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CalendarPanel from './CalendarPanel'
import { EVENT_TYPE_LABEL, parisToday, shiftDate } from '../calendar'
import { toLocalInputValue } from '../bottleFeeding'
import { toLocalInputValue as toLocalInputValueStool } from '../stool'

vi.mock('../api', () => ({
  getDayEvents: vi.fn(),
  getDailyTotals: vi.fn(),
  // `useDeleteEvent` routes to the 9 clients: all present in the mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  deleteTemperature: vi.fn(),
  deleteMedicalCare: vi.fn(),
  deleteBreastfeeding: vi.fn(),
  deleteSolidMeal: vi.fn(),
  deleteMedication: vi.fn(),
  // Editing from the recap (US11.2): the 9 update clients.
  updateBottleFeeding: vi.fn(),
  updateNap: vi.fn(),
  updateStool: vi.fn(),
  updateUrine: vi.fn(),
  updateTemperature: vi.fn(),
  updateMedicalCare: vi.fn(),
  updateBreastfeeding: vi.fn(),
  updateSolidMeal: vi.fn(),
  updateMedication: vi.fn(),
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
  deleteMedication,
  deleteNap,
  deleteSolidMeal,
  getVitamins,
  searchDishes,
  updateBottleFeeding,
  updateBreastfeeding,
  updateMedicalCare,
  updateMedication,
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

// ── Épics 16 and 21: helpers for the unified "totals = filter" chip row ────────────────────────────
// The row is a NAMED <ul> (D16-T): the panel mounts THREE lists (totals, vitamins, day list), so the
// accessible name is what disambiguates a bare `getByRole('list')`.
// The row is born with the day list and only exists when at least one type is present in it (D21-A,
// D21-C): `chipRow()` throws when the row is absent.
const CHIP_ROW_NAME = 'Totaux du jour — filtrer la liste'
const chipRow = () => screen.getByRole('list', { name: CHIP_ROW_NAME })
// A chip is found by its TYPE: its accessible name contains the type label in BOTH regimes
// ("Urine" without value, "Urine · 3 urines" once the totals are there, D16-K/D21-D) — a selector
// that stays stable for the whole test, which separates "find the chip" (synchronous) from "wait for
// its value" (waitFor).
// ⚠️ `queryByRole`, NOT `getByRole`: chip(type) must be able to return `null` for any type absent
// from the day list (D21-A). `chipRow()` stays a `getByRole`, so a negative assertion on a chip fails
// when the whole row is missing instead of passing on a complacent `null`.
const chip = (type) => within(chipRow()).queryByRole('button', { name: new RegExp(EVENT_TYPE_LABEL[type]) })
const labelsOf = () => within(chipRow()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
// Toggle buttons of the whole panel (the chips are the only ones carrying `aria-pressed` outside an
// open dialog).
const pressables = () => screen.queryAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
const queryChipRow = () => screen.queryByRole('list', { name: CHIP_ROW_NAME })

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
  const URINE_1 = { type: 'urine', id: 'u1', startAt: '2026-06-21T08:30:00.000Z', endAt: null }
  const URINE_2 = { type: 'urine', id: 'u2', startAt: '2026-06-21T09:30:00.000Z', endAt: null }
  const URINE_3 = { type: 'urine', id: 'u3', startAt: '2026-06-21T10:30:00.000Z', endAt: null }

  beforeEach(() => {
    vi.clearAllMocks()
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  it('pastille 💧 : affiche urineCount avec le PLURIEL au-delà de 1 (« 3 urines »)', async () => {
    // The chip exists only because the day list holds urines (D21-A): 3 of them here.
    getDayEvents.mockResolvedValue([URINE_1, URINE_2, URINE_3])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 3 })
    renderPanel()

    // ⚠️ The chip appears with the list but may still have no value (totals not there yet): it is the
    // VALUE to wait for — a synchronous `getByRole` could find it empty and the assertion would fail.
    await waitFor(() => expect(chip('urine')).toHaveTextContent('3 urines'))
    expect(chip('urine')).toHaveTextContent('💧')
    expect(chip('urine')).toHaveAttribute('aria-label', 'Urine · 3 urines')
  })

  it('pastille 💧 : SINGULIER pour exactement 1 (« 1 urine »), et sans urine dans la journée aucune pastille 💧', async () => {
    getDayEvents.mockResolvedValue([URINE_1])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 1 })
    const { unmount } = renderPanel()
    await waitFor(() => expect(chip('urine')).toHaveTextContent('1 urine'))
    expect(chip('urine')).not.toHaveTextContent('urines')
    unmount()

    // A day with a single stool and no urine: the 💧 chip is gone, there is no "0 urine" any more (D21-B).
    getDayEvents.mockResolvedValue([{ type: 'stool', id: 's1', startAt: '2026-06-21T08:00:00.000Z', consistency: 'soft' }])
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 1, urineCount: 0 })
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer selle/ })
    expect(chip('urine')).toBeNull()
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
  // Épic 21: only the four types of MIXED_EVENTS get a chip (D21-A). The other fields stay filled in
  // on purpose: they prove the chip composition comes from the day list, not from the totals.
  const TOTALS = {
    date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 2, urineCount: 3,
    maxTemperatureCelsiusX10: 384, eyeCareCount: 2, noseCareCount: 8,
    breastfeedingCount: 3, solidMealCount: 2, medicationCount: 2,
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

    // ⚠️ Wait for a VALUE before counting: a valued chip proves the totals have arrived, so the
    // assertions below run in the final state of the row.
    await waitFor(() => expect(chip('stool')).toHaveTextContent('2 selles'))

    // The 4 chips of the types present are "pressed" (nothing hidden on mount).
    const toggles = within(chipRow()).getAllByRole('button')
    expect(toggles).toHaveLength(4)
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

  it('tout masqué → message « Aucun événement pour les types affichés. » et 4 pastilles valuées', async () => {
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer biberon/ })
    // The values must be there BEFORE switching everything off: that is what we want to see survive.
    await waitFor(() => expect(chip('urine')).toHaveTextContent('3 urines'))

    // Switch off the 4 types present that day: the row keeps them all clickable.
    for (const type of ['bottle_feeding', 'nap', 'stool', 'urine']) {
      await userEvent.click(chip(type))
    }

    expect(screen.getByText('Aucun événement pour les types affichés.')).toBeInTheDocument()
    // Plus aucune ligne (aucun 🗑).
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument()

    // The 4 chips stay displayed, WITH VALUES and clickable: no unrecoverable state (D16-O, D21-A).
    const toggles = within(chipRow()).getAllByRole('button')
    expect(toggles).toHaveLength(4)
    toggles.forEach((btn) => expect(btn).toHaveAttribute('aria-pressed', 'false'))
    expect(chip('bottle_feeding')).toHaveTextContent('120 ml')
    expect(chip('nap')).toHaveTextContent('1 h 00')
    expect(chip('stool')).toHaveTextContent('2 selles')
    expect(chip('urine')).toHaveTextContent('3 urines')

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
    breastfeedingCount: 0, solidMealCount: 0, medicationCount: 0,
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
    getDayEvents.mockResolvedValue([TEMP_PAST])
    getDailyTotals.mockResolvedValue({ ...BASE_TOTALS, maxTemperatureCelsiusX10: 384 })
    renderPanel()

    await waitFor(() => expect(chip('temperature')).toHaveTextContent('38,4 °C'))
    expect(chip('temperature')).toHaveTextContent('🌡')
  })

  it('pastille 🌡 : aucune mesure dans la liste (`null`) → AUCUNE pastille rendue, la rangée tombe à 1 (D15-K/D21-F)', async () => {
    getDayEvents.mockResolvedValue([EYE_PAST])
    getDailyTotals.mockResolvedValue({ ...BASE_TOTALS, maxTemperatureCelsiusX10: null, eyeCareCount: 1 })
    renderPanel()

    // ⚠️ Wait for a VALUE, not a node: the chip row is there with the list, possibly before the
    // totals — a `waitFor` on the mere presence of a chip would not wait for the totals.
    await waitFor(() => expect(chip('eye_care')).toHaveTextContent('1 soin des yeux'))
    expect(chip('temperature')).toBeNull()
    expect(within(chipRow()).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByText(/🌡/)).not.toBeInTheDocument()
  })

  it('pastille 🌡 : `0` N’EST PAS `null` → la pastille reste VISIBLE (garde `!= null`, jamais falsy)', async () => {
    // Without this case, the `null` test above would pass identically with a falsy guard
    // (`{totals.max… && …}`), which would also hide a 0 — a value the server does transmit.
    getDayEvents.mockResolvedValue([TEMP_PAST])
    getDailyTotals.mockResolvedValue({ ...BASE_TOTALS, maxTemperatureCelsiusX10: 0 })
    renderPanel()

    await waitFor(() => expect(chip('temperature')).toHaveTextContent('0,0 °C'))
    expect(chip('temperature')).toHaveTextContent('🌡')
    expect(within(chipRow()).getAllByRole('button')).toHaveLength(1)
  })

  it('pastilles 👁 et 👃 : comptages distincts l’un de l’autre ET de 🌡', async () => {
    getDayEvents.mockResolvedValue([TEMP_PAST, EYE_PAST, NOSE_PAST])
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
  // All TEN fields filled in: this is the fixture for the "with values" regimes.
  const FULL_TOTALS = {
    date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 2, urineCount: 3,
    maxTemperatureCelsiusX10: 384, eyeCareCount: 2, noseCareCount: 8,
    breastfeedingCount: 3, solidMealCount: 2, medicationCount: 2,
  }

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

    // ⚠️ The assertion above is a `queryBy`: it would return `null` whatever happens. The POSITIVE
    // proof is here — there is only ONE series of toggle buttons in the whole panel, and it is
    // exactly the totals row (4 chips: the 4 types of the day list, D21-A). Had the `.day-filter`
    // block survived, there would be 8, and this test would fail.
    const pressables = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    expect(pressables).toHaveLength(4)
    expect(pressables).toEqual(within(chipRow()).getAllByRole('button'))
  })

  it('nom accessible (D16-K/D16-T) : les 10 pastilles sont nommées « <Type> · <valeur> », dans l’ordre', async () => {
    // One event of each of the 10 types, so that every chip exists (D21-A). Received newest first,
    // like the server; the chip order comes from FILTER_ORDER, not from the list order (D21-H).
    getDayEvents.mockResolvedValue([
      ...MIXED_EVENTS,
      { type: 'breastfeeding', id: 'br1', startAt: '2026-06-21T13:00:00.000Z', endAt: null, side: 'left', durationMinutes: 12 },
      { type: 'solid_meal', id: 'sm1', startAt: '2026-06-21T14:00:00.000Z', endAt: null, dish: 'Compote', portion: null },
      { type: 'temperature', id: 't1', startAt: '2026-06-21T15:00:00.000Z', temperatureCelsiusX10: 384 },
      { type: 'eye_care', id: 'e1', startAt: '2026-06-21T16:00:00.000Z' },
      { type: 'nose_care', id: 'n2', startAt: '2026-06-21T17:00:00.000Z' },
      { type: 'medication', id: 'm1', startAt: '2026-06-21T18:00:00.000Z', endAt: null, medicationName: 'Doliprane', dosage: null },
    ])
    renderPanel()

    // ⚠️ The reading is done behind a waitFor: the labels may first be born reduced to the type
    // (totals not there yet, D21-D), and a synchronous `getByRole` would capture them without value.
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
      'Médicament · 2 prises',
    ]))

    // ⛔ D16-K : l'état est porté par aria-pressed SEUL, jamais écrit en toutes lettres.
    labelsOf().forEach((label) => {
      expect(label).not.toMatch(/affich|masqu/i)
    })
    within(chipRow()).getAllByRole('button').forEach((btn) => {
      expect(btn).toHaveAttribute('aria-pressed')
    })
  })

  // The "empty day" (D16-J) and "degraded mode" (D16-P) scenarios of Épic 16 are replaced by the
  // Épic 21 ones (D21-C, D21-D): see the describe at the end of this file.

  it('D16-Q : un DTO incomplet ne dégrade QUE ses propres pastilles, pas la rangée entière', async () => {
    // Payload from an older server version: no temperature, no care fields. The fallback is decided
    // PER FIELD — the four fields present stay valued, the missing ones render the emoji alone. The
    // list also holds a temperature and an eye care, so their chips exist and fall back (D15-K, D21-D).
    getDayEvents.mockResolvedValue([
      ...MIXED_EVENTS,
      { type: 'temperature', id: 't1', startAt: '2026-06-21T13:00:00.000Z', temperatureCelsiusX10: 384 },
      { type: 'eye_care', id: 'e1', startAt: '2026-06-21T14:00:00.000Z' },
    ])
    getDailyTotals.mockResolvedValue({
      date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 2, urineCount: 3,
    })
    renderPanel()

    await waitFor(() => expect(chip('bottle_feeding')).toHaveTextContent('120 ml'))
    expect(labelsOf()).toEqual([
      'Biberon · 120 ml', 'Sieste · 1 h 00', 'Selle · 2 selles', 'Urine · 3 urines', 'Température', 'Yeux',
    ])
    // maxTemperatureCelsiusX10 absent ⇒ `!= null` false ⇒ the 🌡 chip is present WITHOUT value
    // (D15-K: never 0 nor a dash).
    expect(chip('temperature')).not.toBeNull()
    expect(chip('temperature').querySelector('strong')).toBeNull()
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
    breastfeedingCount, solidMealCount: 0, medicationCount: 0,
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
    getDayEvents.mockResolvedValue([BREAST_FULL, BREAST_SIDE, BREAST_BARE])
    getDailyTotals.mockResolvedValue(totalsWith(3))
    renderPanel()

    await waitFor(() => expect(chip('breastfeeding')).toHaveAttribute('aria-label', 'Tétée · 3 tétées'))
  })

  it('journée sans tétée : aucune pastille Tétée (D21-B)', async () => {
    getDayEvents.mockResolvedValue([
      { type: 'bottle_feeding', id: 'bf1', startAt: '2020-03-15T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    ])
    renderPanel()

    await screen.findByRole('button', { name: /Supprimer biberon/ })
    expect(chip('breastfeeding')).toBeNull()
  })

  it('une seule tétée : « Tétée · 1 tétée »', async () => {
    getDayEvents.mockResolvedValue([BREAST_FULL])
    getDailyTotals.mockResolvedValue(totalsWith(1))
    renderPanel()

    await waitFor(() => expect(chip('breastfeeding')).toHaveAttribute('aria-label', 'Tétée · 1 tétée'))
  })

  it('lignes du récap : tag 🤱 Tétée et détail « Gauche · 12 min », « Droit », « — »', async () => {
    getDayEvents.mockResolvedValue([BREAST_FULL, BREAST_SIDE, BREAST_BARE])
    getDailyTotals.mockResolvedValue(totalsWith(3))
    renderPanel()

    await screen.findByRole('button', { name: 'Supprimer tétée de 10:30' })
    const full = rowOf('Supprimer tétée de 10:30')
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

describe('CalendarPanel — repas de diversification au récap (Épic 18, US18.3)', () => {
  const VITAMINS = { date: '2026-06-21', items: [
    { vitaminType: 'd', given: false, authorId: null },
    { vitaminType: 'k', given: false, authorId: null },
  ] }
  const totalsWith = (solidMealCount) => ({
    date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0,
    maxTemperatureCelsiusX10: null, eyeCareCount: 0, noseCareCount: 0,
    breastfeedingCount: 0, solidMealCount, medicationCount: 0,
  })
  // 11:00Z / 08:00Z on a March day = 12:00 / 09:00 in Paris (CET).
  const MEAL_PORTION = { type: 'solid_meal', id: 'sm1', startAt: '2020-03-15T11:00:00.000Z', endAt: null, dish: 'Purée de carrotes', portion: 'all' }
  const MEAL_BARE = { type: 'solid_meal', id: 'sm2', startAt: '2020-03-15T08:00:00.000Z', endAt: null, dish: 'Compote', portion: null }
  const rowOf = (name) => screen.getByRole('button', { name }).closest('li')

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    getVitamins.mockResolvedValue(VITAMINS)
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue(totalsWith(0))
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
  })

  it('pastille Diversification : « Diversification · 2 repas » ; sans repas dans la journée, aucune pastille', async () => {
    getDayEvents.mockResolvedValue([MEAL_PORTION, MEAL_BARE])
    getDailyTotals.mockResolvedValue(totalsWith(2))
    const { unmount } = renderPanel()
    await waitFor(() => expect(chip('solid_meal')).toHaveAttribute('aria-label', 'Diversification · 2 repas'))
    unmount()

    // A bottle alone: no 🥄 chip (D21-B), where it used to read "Diversification · 0 repas".
    getDayEvents.mockResolvedValue([
      { type: 'bottle_feeding', id: 'bf1', startAt: '2020-03-15T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    ])
    getDailyTotals.mockResolvedValue(totalsWith(0))
    renderPanel()
    await screen.findByRole('button', { name: /Supprimer biberon/ })
    expect(chip('solid_meal')).toBeNull()
  })

  it('lignes du récap : tag 🥄 Diversification et détail « Compote », « Purée de carrotes · Tout »', async () => {
    getDayEvents.mockResolvedValue([MEAL_PORTION, MEAL_BARE])
    getDailyTotals.mockResolvedValue(totalsWith(2))
    renderPanel()

    await screen.findByRole('button', { name: 'Supprimer diversification de 12:00' })
    const withPortion = rowOf('Supprimer diversification de 12:00')
    expect(withPortion).toHaveTextContent('🥄')
    expect(withPortion).toHaveTextContent('Diversification')
    expect(withPortion).toHaveTextContent('Purée de carrotes · Tout')
    expect(rowOf('Supprimer diversification de 09:00')).toHaveTextContent('Compote')
    expect(rowOf('Supprimer diversification de 09:00')).not.toHaveTextContent('·')
  })

  it('filtrer : la pastille Diversification masque ses lignes et garde son nom « Diversification · 2 repas »', async () => {
    getDayEvents.mockResolvedValue([MEAL_PORTION, MEAL_BARE])
    getDailyTotals.mockResolvedValue(totalsWith(2))
    renderPanel()
    await screen.findAllByRole('button', { name: /Supprimer diversification/ })
    await waitFor(() => expect(chip('solid_meal')).toHaveAttribute('aria-label', 'Diversification · 2 repas'))

    await userEvent.click(chip('solid_meal'))

    expect(screen.queryByRole('button', { name: /Supprimer diversification/ })).not.toBeInTheDocument()
    expect(chip('solid_meal')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('solid_meal')).toHaveAttribute('aria-label', 'Diversification · 2 repas')
  })

  it('modifier : formulaire prérempli (plat, portion enfoncée, heure de l’événement), sans mode, côté, rappel ni case', async () => {
    getDayEvents.mockResolvedValue([MEAL_PORTION])
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier diversification de 12:00' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modifier diversification')
    expect(within(dialog).getByLabelText('Plat')).toHaveValue('Purée de carrotes')
    expect(within(within(dialog).getByRole('group', { name: 'Portion' })).getByRole('button', { name: 'Tout' }))
      .toHaveAttribute('aria-pressed', 'true')
    const when = within(dialog).getByLabelText('Quand')
    expect(when).toHaveValue(toLocalInputValue(new Date(MEAL_PORTION.startAt)))
    expect(when.value).not.toBe(toLocalInputValue(new Date()))
    expect(within(dialog).queryByRole('tablist')).toBeNull()
    expect(within(dialog).queryByLabelText('Quantité (ml)')).toBeNull()
    expect(within(dialog).queryByRole('group', { name: 'Côté' })).toBeNull()
    expect(within(dialog).queryByRole('checkbox', { name: 'Ajouter à mes plats' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Gérer mes plats' })).toBeNull()
  })

  it('soumission : plat corrigé et portion relâchée → updateSolidMeal(b1, id, { occurredAt, dish, portion: null })', async () => {
    getDayEvents.mockResolvedValue([MEAL_PORTION])
    updateSolidMeal.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier diversification de 12:00' }))
    const dialog = screen.getByRole('dialog')
    const field = within(dialog).getByLabelText('Plat')
    await userEvent.clear(field)
    await userEvent.type(field, 'Purée de carottes')
    await userEvent.click(within(within(dialog).getByRole('group', { name: 'Portion' })).getByRole('button', { name: 'Tout' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateSolidMeal).toHaveBeenCalledTimes(1))
    expect(updateSolidMeal.mock.calls[0]).toEqual(
      ['b1', 'sm1', { occurredAt: expect.any(String), dish: 'Purée de carottes', portion: null }],
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('supprimer : modale de confirmation puis deleteSolidMeal(b1, id)', async () => {
    getDayEvents.mockResolvedValue([MEAL_PORTION])
    deleteSolidMeal.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer diversification de 12:00' }))
    expect(deleteSolidMeal).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteSolidMeal).toHaveBeenCalledTimes(1))
    expect(deleteSolidMeal.mock.calls[0]).toEqual(['b1', 'sm1'])
  })

  it('modifier un repas ne propose pas d’ajouter le plat à « Mes plats » (US18.4, D18-AR)', async () => {
    getDayEvents.mockResolvedValue([MEAL_PORTION])
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier diversification de 12:00' }))
    const dialog = screen.getByRole('dialog')
    const field = within(dialog).getByLabelText('Plat')
    await userEvent.clear(field)
    await userEvent.type(field, 'Yaourt à la vanille')
    // Wait for the search of the NEW text to come back: the box would show up now if it ever did.
    await waitFor(() => expect(searchDishes).toHaveBeenCalledWith('Yaourt à la vanille'))

    expect(within(dialog).queryByRole('checkbox', { name: 'Ajouter à mes plats' })).toBeNull()
  })
})

describe('CalendarPanel — prises de médicament au récap (Épic 19, US19.1)', () => {
  const VITAMINS = { date: '2026-06-21', items: [
    { vitaminType: 'd', given: false, authorId: null },
    { vitaminType: 'k', given: false, authorId: null },
  ] }
  const totalsWith = (medicationCount) => ({
    date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0,
    maxTemperatureCelsiusX10: null, eyeCareCount: 0, noseCareCount: 0,
    breastfeedingCount: 0, solidMealCount: 0, medicationCount,
  })
  // 13:00Z / 07:10Z on a March day = 14:00 / 08:10 in Paris (CET). Received newest first, like the server.
  const MED_VENTOLINE = {
    type: 'medication', id: 'm2', startAt: '2020-03-15T13:00:00.000Z', endAt: null, medicationName: 'Ventoline', dosage: null,
  }
  const MED_DOLIPRANE = {
    type: 'medication', id: 'm1', startAt: '2020-03-15T07:10:00.000Z', endAt: null, medicationName: 'Doliprane', dosage: '1 dose 6 kg',
  }
  const rowOf = (name) => screen.getByRole('button', { name }).closest('li')
  const dosageField = (dialog) => within(dialog).getByRole('textbox', { name: 'Posologie' })
  const optionIn = (dialog, name) => within(within(dialog).getByRole('group', { name: 'Choix du médicament' }))
    .getByRole('button', { name })

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    getVitamins.mockResolvedValue(VITAMINS)
    getDayEvents.mockResolvedValue([])
    getDailyTotals.mockResolvedValue(totalsWith(0))
  })

  it('pastille 💊 : « Médicament · 2 prises », dernière de la rangée, avec le compte visible', async () => {
    // A bottle and an eye care come first in FILTER_ORDER: 💊 is last among SEVERAL chips, not
    // trivially the only one.
    getDayEvents.mockResolvedValue([
      MED_VENTOLINE,
      MED_DOLIPRANE,
      { type: 'eye_care', id: 'e1', startAt: '2020-03-15T09:00:00.000Z' },
      { type: 'bottle_feeding', id: 'bf1', startAt: '2020-03-15T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    ])
    getDailyTotals.mockResolvedValue({ ...totalsWith(2), totalMilkMl: 120, eyeCareCount: 1 })
    renderPanel()

    await waitFor(() => expect(chip('medication')).toHaveAttribute('aria-label', 'Médicament · 2 prises'))
    const buttons = within(chipRow()).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[buttons.length - 1]).toBe(chip('medication'))
    expect(chip('medication')).toHaveTextContent('💊')
    expect(chip('medication').querySelector('strong')).toHaveTextContent('2')
  })

  it('journée à 1 prise : « Médicament · 1 prise » (singulier)', async () => {
    getDayEvents.mockResolvedValue([MED_DOLIPRANE])
    getDailyTotals.mockResolvedValue(totalsWith(1))
    renderPanel()

    await waitFor(() => expect(chip('medication')).toHaveAttribute('aria-label', 'Médicament · 1 prise'))
  })

  it('journée sans prise : aucune pastille 💊 (D21-B)', async () => {
    getDayEvents.mockResolvedValue([
      { type: 'bottle_feeding', id: 'bf1', startAt: '2020-03-15T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
    ])
    renderPanel()

    await screen.findByRole('button', { name: /Supprimer biberon/ })
    expect(chip('medication')).toBeNull()
  })

  it('lignes du récap : tag 💊 Médicament, détail « Ventoline » puis « Doliprane · 1 dose 6 kg », heures Paris', async () => {
    getDayEvents.mockResolvedValue([MED_VENTOLINE, MED_DOLIPRANE])
    getDailyTotals.mockResolvedValue(totalsWith(2))
    renderPanel()

    await screen.findByRole('button', { name: 'Supprimer médicament de 14:00' })
    const names = screen.getAllByRole('button', { name: /^Supprimer/ }).map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Supprimer médicament de 14:00', 'Supprimer médicament de 08:10'])

    const ventoline = rowOf('Supprimer médicament de 14:00')
    expect(ventoline).toHaveTextContent('💊')
    expect(ventoline).toHaveTextContent('Médicament')
    expect(ventoline).toHaveTextContent('Ventoline')
    expect(ventoline).not.toHaveTextContent('·')
    const doliprane = rowOf('Supprimer médicament de 08:10')
    expect(doliprane).toHaveTextContent('💊')
    expect(doliprane).toHaveTextContent('Doliprane · 1 dose 6 kg')
  })

  it('filtrer : la pastille 💊 masque les lignes, garde son nom « Médicament · 2 prises » et se mémorise en session', async () => {
    getDayEvents.mockResolvedValue([MED_VENTOLINE, MED_DOLIPRANE])
    getDailyTotals.mockResolvedValue(totalsWith(2))
    renderPanel()
    await screen.findAllByRole('button', { name: /Supprimer médicament/ })
    await waitFor(() => expect(chip('medication')).toHaveAttribute('aria-label', 'Médicament · 2 prises'))

    await userEvent.click(chip('medication'))

    expect(screen.queryByRole('button', { name: /Supprimer médicament/ })).not.toBeInTheDocument()
    expect(chip('medication')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('medication')).toHaveAttribute('aria-label', 'Médicament · 2 prises')
    expect(JSON.parse(sessionStorage.getItem('calendar.dayFilter'))).toContain('medication')
  })

  it('modifier un défaut : Doliprane enfoncé, posologie et heure de la prise, aucun champ libre ni autre champ (D19-I)', async () => {
    getDayEvents.mockResolvedValue([MED_DOLIPRANE])
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier médicament de 08:10' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modifier médicament')
    expect(optionIn(dialog, 'Doliprane')).toHaveAttribute('aria-pressed', 'true')
    expect(optionIn(dialog, 'Advil')).toHaveAttribute('aria-pressed', 'false')
    expect(dosageField(dialog)).toHaveValue('1 dose 6 kg')
    const when = within(dialog).getByLabelText('Quand')
    expect(when).toHaveValue(toLocalInputValue(new Date(MED_DOLIPRANE.startAt)))
    expect(when.value).not.toBe(toLocalInputValue(new Date()))
    expect(within(dialog).queryByRole('textbox', { name: 'Médicament' })).toBeNull()
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(1)
    expect(within(dialog).queryByLabelText('Quantité (ml)')).toBeNull()
    expect(within(dialog).queryByRole('group', { name: 'Type de soin' })).toBeNull()
  })

  it.each(['Gaviscon', 'doliprane'])('modifier un libre « %s » : « Autre » enfoncé, champ libre rempli', async (name) => {
    getDayEvents.mockResolvedValue([{ ...MED_DOLIPRANE, medicationName: name, dosage: null }])
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier médicament de 08:10' }))

    const dialog = screen.getByRole('dialog')
    expect(optionIn(dialog, 'Autre')).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('textbox', { name: 'Médicament' })).toHaveValue(name)
  })

  it('corriger « Dolipran » → Doliprane, posologie effacée, heure changée → updateMedication(b1, id, { …, dosage: null })', async () => {
    getDayEvents.mockResolvedValue([{ ...MED_DOLIPRANE, medicationName: 'Dolipran' }])
    updateMedication.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier médicament de 08:10' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(optionIn(dialog, 'Doliprane'))
    await userEvent.clear(dosageField(dialog))
    const when = within(dialog).getByLabelText('Quand')
    await userEvent.clear(when)
    await userEvent.type(when, '2020-03-15T08:30')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateMedication).toHaveBeenCalledTimes(1))
    expect(updateMedication.mock.calls[0]).toEqual(
      ['b1', 'm1', { occurredAt: expect.any(String), medicationName: 'Doliprane', dosage: null }],
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('défaut → Autre : « Advil » devient « Nurofen »', async () => {
    getDayEvents.mockResolvedValue([{ ...MED_DOLIPRANE, medicationName: 'Advil', dosage: null }])
    updateMedication.mockResolvedValue({})
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier médicament de 08:10' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(optionIn(dialog, 'Autre'))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Médicament' }), 'Nurofen')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateMedication).toHaveBeenCalledTimes(1))
    expect(updateMedication.mock.calls[0][2].medicationName).toBe('Nurofen')
  })

  it('supprimer : modale générique « Supprimer cet événement ? » (Q19-4, option A) puis deleteMedication(b1, id)', async () => {
    getDayEvents.mockResolvedValue([MED_DOLIPRANE])
    deleteMedication.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer médicament de 08:10' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Supprimer cet événement ?')
    expect(deleteMedication).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteMedication).toHaveBeenCalledTimes(1))
    expect(deleteMedication.mock.calls[0]).toEqual(['b1', 'm1'])
  })
})

describe('CalendarPanel — pastilles limitées aux types présents (Épic 21, US21.1)', () => {
  const totalsOf = (over = {}) => ({
    date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0, urineCount: 0,
    maxTemperatureCelsiusX10: null, eyeCareCount: 0, noseCareCount: 0,
    breastfeedingCount: 0, solidMealCount: 0, medicationCount: 0, ...over,
  })
  const at = (hhmm) => `2026-06-21T${hhmm}:00.000Z`
  const bottle = (id, hhmm, quantityMl = 120) => ({ type: 'bottle_feeding', id, startAt: at(hhmm), quantityMl, milkType: 'breast' })
  const stool = (id, hhmm) => ({ type: 'stool', id, startAt: at(hhmm), consistency: 'soft' })
  const urine = (id, hhmm) => ({ type: 'urine', id, startAt: at(hhmm), endAt: null })
  const nap = (id, hhmm, endHhmm) => ({ type: 'nap', id, startAt: at(hhmm), endAt: at(endHhmm) })
  const breast = (id, hhmm) => ({ type: 'breastfeeding', id, startAt: at(hhmm), endAt: null, side: 'left', durationMinutes: 10 })
  const TEMP = { type: 'temperature', id: 't1', startAt: at('09:30'), temperatureCelsiusX10: 384 }
  const EYE = { type: 'eye_care', id: 'e1', startAt: at('08:00') }

  // 2 bottles, 1 stool, 3 urines and nothing else (scenario 1).
  const DAY_EVENTS = [
    urine('u3', '15:00'), urine('u2', '13:00'), stool('s1', '12:00'), urine('u1', '11:00'), bottle('bf2', '09:00'), bottle('bf1', '07:00'),
  ]
  const DAY_TOTALS = totalsOf({ totalMilkMl: 240, stoolCount: 1, urineCount: 3 })
  const ABSENT_AC1 = ['breastfeeding', 'solid_meal', 'nap', 'temperature', 'eye_care', 'nose_care', 'medication']
  const EMPTY_MESSAGE = 'Aucun événement ce jour-là.'

  // The three operations of the other describes of this file: without `getVitamins`, VitaminSection
  // would fall into error and render a `role="alert"` ("Vitamines indisponibles."), which would
  // break the "no error message added" assertions for the wrong reason; without `clearAllMocks`, the
  // call counters of the "no new request" scenario would leak from one test to the next.
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    getDayEvents.mockResolvedValue(DAY_EVENTS)
    getDailyTotals.mockResolvedValue(DAY_TOTALS)
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  describe('Scénario : seuls les types présents ont une pastille', () => {
    it('la rangée compte exactement trois pastilles 🍼 💩 💧, dans cet ordre, et aucune autre', async () => {
      renderPanel()

      await waitFor(() => expect(labelsOf()).toEqual(['Biberon · 240 ml', 'Selle · 1 selle', 'Urine · 3 urines']))
      expect(pressables()).toHaveLength(3)
      within(chipRow()).getAllByRole('button').forEach((btn) => expect(btn).not.toBeDisabled())
      // `chip()` throws when the row is missing: `null` here proves "row present, chip absent".
      ABSENT_AC1.forEach((type) => expect(chip(type)).toBeNull())
    })
  })

  describe('Scénario : la valeur d’une pastille présente ne change pas', () => {
    it('💩 affiche « 1 selle » (nom « Selle · 1 selle ») et 💧 affiche « 3 urines »', async () => {
      renderPanel()

      await waitFor(() => expect(chip('stool')).toHaveTextContent('1 selle'))
      expect(chip('stool')).toHaveAttribute('aria-label', 'Selle · 1 selle')
      expect(chip('urine')).toHaveTextContent('3 urines')
    })

    it('la valeur vient des totaux et n’est jamais recalculée depuis la liste (D21-G)', async () => {
      getDailyTotals.mockResolvedValue({ ...DAY_TOTALS, urineCount: 5 })
      renderPanel()

      // 3 urines in the list, 5 in the totals: the chip follows the totals.
      await waitFor(() => expect(chip('urine')).toHaveAttribute('aria-label', 'Urine · 5 urines'))
    })
  })

  describe('Scénario : journée sans événement', () => {
    it('affiche le message vide, aucune pastille, et Vitamines à sa place avant le message', async () => {
      getDayEvents.mockResolvedValue([])
      getDailyTotals.mockResolvedValue(totalsOf())
      renderPanel()

      const message = await screen.findByText(EMPTY_MESSAGE)
      // Asserted AFTER the list has arrived: while it loads the row is absent in every case.
      expect(queryChipRow()).toBeNull()
      expect(pressables()).toHaveLength(0)
      const vitamins = screen.getByText('Vitamines')
      expect(vitamins.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('Scénario : une pastille éteinte ne disparaît pas', () => {
    it('éteindre 💩 retire ses lignes mais garde la pastille (éteinte, « 2 selles ») ; un nouveau clic rallume tout', async () => {
      getDayEvents.mockResolvedValue([urine('u2', '14:00'), urine('u1', '13:00'), stool('s2', '12:00'), stool('s1', '11:00'), urine('u0', '10:00')])
      getDailyTotals.mockResolvedValue(totalsOf({ stoolCount: 2, urineCount: 3 }))
      renderPanel()
      await screen.findAllByRole('button', { name: /Supprimer selle/ })
      await waitFor(() => expect(chip('stool')).toHaveTextContent('2 selles'))

      await userEvent.click(chip('stool'))

      expect(screen.queryByRole('button', { name: /Supprimer selle/ })).not.toBeInTheDocument()
      // Presence is decided on the WHOLE day list, before the filter (D21-A).
      expect(chip('stool')).not.toBeNull()
      expect(chip('stool')).toHaveAttribute('aria-pressed', 'false')
      expect(chip('stool')).toHaveTextContent('2 selles')

      await userEvent.click(chip('stool'))

      expect(screen.getAllByRole('button', { name: /Supprimer selle/ })).toHaveLength(2)
      expect(chip('stool')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('Scénario : tout masqué', () => {
    it('éteindre 🍼 puis 😴 affiche le message des types affichés et garde les deux pastilles éteintes et cliquables', async () => {
      getDayEvents.mockResolvedValue([nap('n1', '13:00', '14:00'), bottle('bf1', '08:00')])
      getDailyTotals.mockResolvedValue(totalsOf({ totalMilkMl: 120, totalSleepMinutes: 60 }))
      renderPanel()
      await screen.findByRole('button', { name: /Supprimer biberon/ })
      await waitFor(() => expect(chip('nap')).toHaveTextContent('1 h 00'))

      await userEvent.click(chip('bottle_feeding'))
      await userEvent.click(chip('nap'))

      expect(screen.getByText('Aucun événement pour les types affichés.')).toBeInTheDocument()
      expect(labelsOf()).toHaveLength(2)
      within(chipRow()).getAllByRole('button').forEach((btn) => expect(btn).toHaveAttribute('aria-pressed', 'false'))

      await userEvent.click(chip('bottle_feeding'))
      expect(screen.getByRole('button', { name: /Supprimer biberon/ })).toBeInTheDocument()
    })
  })

  describe('Scénario : la rangée change d’un jour à l’autre', () => {
    it('🤱 est présente le premier jour et absente le suivant ; les autres pastilles gardent leur ordre', async () => {
      const today = parisToday()
      const tomorrow = shiftDate(today, 1)
      const byDate = {
        [today]: [stool('s1', '12:00'), breast('br1', '10:00'), bottle('bf1', '08:00')],
        [tomorrow]: [stool('s2', '13:00'), bottle('bf2', '09:00')],
      }
      getDayEvents.mockImplementation((_, date) => Promise.resolve(byDate[date] ?? []))
      getDailyTotals.mockResolvedValue(totalsOf({ totalMilkMl: 120, breastfeedingCount: 1, stoolCount: 1 }))
      renderPanel()

      await waitFor(() => expect(labelsOf()).toEqual(['Biberon · 120 ml', 'Tétée · 1 tétée', 'Selle · 1 selle']))

      await userEvent.click(screen.getByRole('button', { name: 'Jour suivant' }))

      // While the second day loads the row is absent (`chipRow()` throws, `waitFor` retries); it
      // can only come back without 🤱 once the second list is there.
      await waitFor(() => expect(chip('breastfeeding')).toBeNull())
      await waitFor(() => expect(labelsOf()).toEqual(['Biberon · 120 ml', 'Selle · 1 selle']))
    })
  })

  describe('Scénario : un type masqué revient éteint', () => {
    it('💧 éteinte un jour, absente le lendemain sans urine, puis éteinte au retour d’une urine', async () => {
      const today = parisToday()
      const day2 = shiftDate(today, 1)
      const day3 = shiftDate(today, 2)
      const byDate = {
        [today]: [urine('u1', '12:00'), stool('s1', '09:00')],
        [day2]: [stool('s2', '10:00')],
        [day3]: [urine('u3', '14:00'), stool('s3', '11:00')],
      }
      getDayEvents.mockImplementation((_, date) => Promise.resolve(byDate[date] ?? []))
      getDailyTotals.mockResolvedValue(totalsOf({ stoolCount: 1, urineCount: 1 }))
      renderPanel()
      await screen.findByRole('button', { name: /Supprimer urine/ })
      await userEvent.click(chip('urine'))

      await userEvent.click(screen.getByRole('button', { name: 'Jour suivant' }))
      await waitFor(() => expect(chip('urine')).toBeNull())
      expect(chip('stool')).not.toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Jour suivant' }))
      // The previous day has no 💧 chip, so `not.toBeNull()` can only succeed on the third day.
      await waitFor(() => expect(chip('urine')).not.toBeNull())
      expect(chip('urine')).toHaveAttribute('aria-pressed', 'false')
      await screen.findByRole('button', { name: /Supprimer selle/ })
      expect(screen.queryByRole('button', { name: /Supprimer urine/ })).not.toBeInTheDocument()
      // The type stays hidden in the session even on the day where it had no chip (D21-I).
      expect(JSON.parse(sessionStorage.getItem('calendar.dayFilter'))).toContain('urine')
    })
  })

  describe('Scénario : sieste commencée la veille', () => {
    it('😴 est présente avec le total de sommeil du jour', async () => {
      const yesterday = shiftDate(parisToday(), -1)
      getDayEvents.mockResolvedValue([
        { type: 'nap', id: 'n1', startAt: `${yesterday}T21:00:00.000Z`, endAt: `${parisToday()}T05:00:00.000Z` },
      ])
      getDailyTotals.mockResolvedValue(totalsOf({ totalSleepMinutes: 360 }))
      renderPanel()

      await waitFor(() => expect(chip('nap')).toHaveTextContent('6 h 00'))
    })
  })

  describe('Scénario : température', () => {
    it('sans mesure dans la journée, aucune pastille 🌡', async () => {
      getDayEvents.mockResolvedValue([EYE])
      getDailyTotals.mockResolvedValue(totalsOf({ eyeCareCount: 1 }))
      renderPanel()

      await screen.findByRole('button', { name: /Supprimer yeux/ })
      await waitFor(() => expect(chip('eye_care')).toHaveTextContent('1 soin des yeux'))
      expect(chip('temperature')).toBeNull()
      expect(screen.queryByText(/🌡/)).not.toBeInTheDocument()
    })

    it('avec une mesure à 38,4 °C, la pastille 🌡 affiche « 38,4 °C »', async () => {
      getDayEvents.mockResolvedValue([TEMP])
      getDailyTotals.mockResolvedValue(totalsOf({ maxTemperatureCelsiusX10: 384 }))
      renderPanel()

      await waitFor(() => expect(chip('temperature')).toHaveTextContent('38,4 °C'))
    })

    it('une mesure dans la liste mais un maximum `null` : 🌡 sans valeur, jamais 0 ni tiret (D15-K)', async () => {
      getDayEvents.mockResolvedValue([TEMP])
      getDailyTotals.mockResolvedValue(totalsOf({ maxTemperatureCelsiusX10: null }))
      renderPanel()

      await screen.findByRole('button', { name: /Supprimer température/ })
      await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(1))
      expect(chip('temperature')).toHaveAttribute('aria-label', 'Température')
      expect(chip('temperature').querySelector('strong')).toBeNull()
    })
  })

  describe('Scénario : totaux indisponibles', () => {
    const SELLES_URINES = [urine('u1', '12:00'), stool('s1', '09:00')]

    const expectPresentChipsWithoutValue = async () => {
      await screen.findByRole('button', { name: /Supprimer urine/ })

      expect(labelsOf()).toEqual(['Selle', 'Urine'])
      within(chipRow()).getAllByRole('button').forEach((btn) => {
        expect(btn.querySelector('strong')).toBeNull()
        expect(btn.getAttribute('aria-label')).not.toMatch(/undefined|NaN|·/)
      })

      // The filter keeps working without totals.
      await userEvent.click(chip('urine'))
      expect(screen.queryByRole('button', { name: /Supprimer urine/ })).not.toBeInTheDocument()
      expect(chip('urine')).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /Supprimer selle/ })).toBeInTheDocument()

      // No error message added by the recap.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    }

    it('daily-totals en erreur : les deux pastilles présentes sans valeur, filtre opérant, aucun message d’erreur', async () => {
      getDayEvents.mockResolvedValue(SELLES_URINES)
      getDailyTotals.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
      renderPanel()
      await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(1))

      await expectPresentChipsWithoutValue()
    })

    it('daily-totals en chargement : les deux pastilles présentes sans valeur, filtre opérant, aucun message d’erreur', async () => {
      getDayEvents.mockResolvedValue(SELLES_URINES)
      getDailyTotals.mockReturnValue(new Promise(() => {}))
      renderPanel()

      await expectPresentChipsWithoutValue()
    })
  })

  describe('Scénario : liste indisponible', () => {
    const totalsLoaded = (qc) => waitFor(() => expect(
      qc.getQueryState(['babies', 'b1', 'daily-totals', parisToday()])?.status,
    ).toBe('success'))

    it('events en chargement : « … » et aucune pastille, même une fois les totaux arrivés', async () => {
      getDayEvents.mockReturnValue(new Promise(() => {}))
      const { qc } = renderPanel()

      expect(await screen.findByText('…')).toBeInTheDocument()
      // Absence proven AFTER the totals arrived: the chips depend on the list only (D21-E).
      await totalsLoaded(qc)
      expect(queryChipRow()).toBeNull()
      expect(pressables()).toHaveLength(0)
      expect(screen.getByText('…')).toBeInTheDocument()
    })

    it('events en erreur : « Aucun événement ce jour-là. » et aucune pastille', async () => {
      getDayEvents.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
      const { qc } = renderPanel()

      expect(await screen.findByText(EMPTY_MESSAGE)).toBeInTheDocument()
      await totalsLoaded(qc)
      expect(queryChipRow()).toBeNull()
      expect(pressables()).toHaveLength(0)
    })
  })

  describe('Scénario : aucune requête nouvelle', () => {
    it('events et daily-totals sont appelées une fois chacune pour le jour affiché ; éteindre/rallumer ne relance rien', async () => {
      renderPanel()
      await waitFor(() => expect(chip('stool')).toHaveTextContent('1 selle'))

      // `getVitamins` (VitaminSection) is not counted: only the two recap requests are pinned.
      expect(getDayEvents).toHaveBeenCalledTimes(1)
      expect(getDayEvents).toHaveBeenCalledWith('b1', parisToday())
      expect(getDailyTotals).toHaveBeenCalledTimes(1)
      expect(getDailyTotals).toHaveBeenCalledWith('b1', parisToday())

      await userEvent.click(chip('stool'))
      await userEvent.click(chip('stool'))

      expect(getDayEvents).toHaveBeenCalledTimes(1)
      expect(getDailyTotals).toHaveBeenCalledTimes(1)
    })
  })

  describe('Complément : la présence se décide sur la liste, pas sur les totaux', () => {
    it('un biberon à 0 ml dans la liste donne une pastille 🍼 « 0 ml »', async () => {
      getDayEvents.mockResolvedValue([bottle('bf1', '08:00', 0)])
      getDailyTotals.mockResolvedValue(totalsOf({ totalMilkMl: 0 }))
      renderPanel()

      await waitFor(() => expect(chip('bottle_feeding')).toHaveTextContent('0 ml'))
    })

    it('un total de selles à 2 sans selle dans la liste ne crée pas de pastille 💩', async () => {
      getDayEvents.mockResolvedValue([urine('u1', '08:00')])
      getDailyTotals.mockResolvedValue(totalsOf({ urineCount: 1, stoolCount: 2 }))
      renderPanel()

      await waitFor(() => expect(chip('urine')).toHaveTextContent('1 urine'))
      expect(chip('stool')).toBeNull()
    })
  })
})
