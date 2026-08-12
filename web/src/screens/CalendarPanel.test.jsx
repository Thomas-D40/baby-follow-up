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
  // `useDeleteEvent` route vers les 3 clients : tous présents dans le mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
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
