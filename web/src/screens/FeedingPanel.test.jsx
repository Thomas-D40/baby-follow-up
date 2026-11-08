import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FeedingPanel from './FeedingPanel'

// Every client the sheet can reach (services/feeding, services/dishes, DishesPanel) is declared:
// a vi.mock factory throws on access to an export it does not list.
vi.mock('../api', () => ({
  createBottleFeeding: vi.fn(),
  updateBottleFeeding: vi.fn(),
  deleteBottleFeeding: vi.fn(),
  createBreastfeeding: vi.fn(),
  listBreastfeedings: vi.fn(),
  updateBreastfeeding: vi.fn(),
  deleteBreastfeeding: vi.fn(),
  createSolidMeal: vi.fn(),
  updateSolidMeal: vi.fn(),
  deleteSolidMeal: vi.fn(),
  searchDishes: vi.fn(),
  listManageableDishes: vi.fn(),
  renameDish: vi.fn(),
  deleteDish: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  deleteTemperature: vi.fn(),
  deleteMedicalCare: vi.fn(),
}))
import {
  createBottleFeeding,
  createBreastfeeding,
  createSolidMeal,
  listBreastfeedings,
  searchDishes,
  listManageableDishes,
} from '../api'

const MODE_KEY = 'suivibaby.feedingMode'

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderPanel(qc = newClient()) {
  return { qc, ...render(<QueryClientProvider client={qc}><FeedingPanel babyId="b1" /></QueryClientProvider>) }
}

const tab = (name) => screen.getByRole('tab', { name })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  createBottleFeeding.mockResolvedValue({ id: 'bf1' })
  createBreastfeeding.mockResolvedValue({ id: 'br1' })
  createSolidMeal.mockResolvedValue({ id: 'sm1' })
  listBreastfeedings.mockResolvedValue({ items: [], nextCursor: null })
  searchDishes.mockResolvedValue({ items: [], exactMatch: false })
  listManageableDishes.mockResolvedValue([])
})

describe('FeedingPanel — trois modes (US18.1)', () => {
  it('expose un sélecteur « Mode d’alimentation » à trois onglets, un seul sélectionné', () => {
    renderPanel()

    const tablist = screen.getByRole('tablist', { name: 'Mode d\'alimentation' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Biberon', 'Sein', 'Diversification'])
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1)
  })

  it('un clic sélectionne l’onglet touché et relâche le précédent', async () => {
    renderPanel()

    await userEvent.click(tab('Sein'))
    expect(tab('Sein')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Biberon')).toHaveAttribute('aria-selected', 'false')

    await userEvent.click(tab('Diversification'))
    expect(tab('Diversification')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Sein')).toHaveAttribute('aria-selected', 'false')
  })

  it('chaque onglet est atteignable au clavier (Tab)', async () => {
    renderPanel()

    const reached = new Set()
    for (let i = 0; i < 20; i += 1) {
      await userEvent.tab()
      if (document.activeElement?.getAttribute('role') === 'tab') reached.add(document.activeElement.textContent)
    }
    expect([...reached].sort()).toEqual(['Biberon', 'Diversification', 'Sein'])
  })
})

describe('FeedingPanel — première ouverture sur Biberon (US18.1)', () => {
  it('sans mode mémorisé, « Biberon » est sélectionné et son formulaire affiché', () => {
    renderPanel()

    expect(tab('Biberon')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Quantité (ml)')).toBeInTheDocument()
  })
})

describe('FeedingPanel — mémoire du mode (US18.1, D18-AK)', () => {
  it('rouvre sur le dernier mode enregistré (Sein)', async () => {
    const first = renderPanel()
    await userEvent.click(tab('Sein'))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(createBreastfeeding).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(localStorage.getItem(MODE_KEY)).toBe('breast'))

    first.unmount()
    renderPanel()

    expect(tab('Sein')).toHaveAttribute('aria-selected', 'true')
  })

  it('changer de mode sans enregistrer ne le mémorise pas', async () => {
    const first = renderPanel()
    await userEvent.click(tab('Sein'))

    first.unmount()
    renderPanel()

    expect(tab('Biberon')).toHaveAttribute('aria-selected', 'true')
    expect(localStorage.getItem(MODE_KEY)).toBeNull()
  })

  it('une création en échec ne mémorise pas le mode', async () => {
    createBreastfeeding.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(tab('Sein'))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
    expect(localStorage.getItem(MODE_KEY)).toBeNull()
  })

  it('la mémoire est propre à l’appareil : le corps envoyé au serveur ne porte aucun mode', async () => {
    renderPanel()
    await userEvent.click(tab('Sein'))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(createBreastfeeding).toHaveBeenCalledTimes(1))

    expect(Object.keys(createBreastfeeding.mock.calls[0][1]).sort())
      .toEqual(['durationMinutes', 'occurredAt', 'side'])
  })

  it('la mémoire survit à la fermeture : nouveau client de requêtes, même mode, rien en sessionStorage', async () => {
    const first = renderPanel(newClient())
    await userEvent.click(tab('Sein'))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(localStorage.getItem(MODE_KEY)).toBe('breast'))

    first.unmount()
    renderPanel(newClient()) // simulates a relaunch of the app

    expect(tab('Sein')).toHaveAttribute('aria-selected', 'true')
    expect(sessionStorage.getItem(MODE_KEY)).toBeNull()
  })
})

describe('FeedingPanel — le rappel n’interroge le serveur qu’en mode Sein (contrat P-8)', () => {
  it('en Biberon puis Diversification, listBreastfeedings n’est pas appelé ; en Sein, une fois avec limit 1', async () => {
    renderPanel()
    await userEvent.click(tab('Diversification'))
    expect(listBreastfeedings).not.toHaveBeenCalled()

    await userEvent.click(tab('Sein'))
    await waitFor(() => expect(listBreastfeedings).toHaveBeenCalledTimes(1))
    expect(listBreastfeedings.mock.calls[0]).toEqual(['b1', { limit: 1 }])
  })
})

describe('FeedingPanel — le biberon se note comme avant (US18.1)', () => {
  it('envoie { occurredAt, quantityMl, milkType }, confirme, vide les champs et reste ouverte', async () => {
    renderPanel()
    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '120')
    await userEvent.selectOptions(screen.getByLabelText('Type de lait'), 'formula')
    const quand = screen.getByLabelText('Quand').value

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createBottleFeeding).toHaveBeenCalledTimes(1))
    expect(createBottleFeeding.mock.calls[0]).toEqual(
      ['b1', { occurredAt: expect.any(String), quantityMl: 120, milkType: 'formula' }],
    )
    // The sheet confirms (this text is new in Épic 18) and stays open.
    expect(await screen.findByRole('status')).toHaveTextContent('Biberon enregistré.')
    expect(screen.getByRole('tablist', { name: 'Mode d\'alimentation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Quantité (ml)')).toHaveValue(null)
    expect(screen.getByLabelText('Type de lait')).toHaveValue('')
    expect(screen.getByLabelText('Quand')).toHaveValue(quand)
  })

  it('une création réussie invalide le préfixe [babies, b1] une seule fois (retry 0), et mémorise Biberon', async () => {
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '90')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createBottleFeeding).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(spy.mock.calls[0][0]).toEqual({ queryKey: ['babies', 'b1'] })
    await waitFor(() => expect(localStorage.getItem(MODE_KEY)).toBe('bottle'))
  })

  it('une erreur serveur laisse la saisie et affiche « Échec de l’enregistrement. »', async () => {
    createBottleFeeding.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '90')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
    expect(screen.getByLabelText('Quantité (ml)')).toHaveValue(90)
    expect(screen.queryByText('Biberon enregistré.')).not.toBeInTheDocument()
  })
})

describe('FeedingPanel — changer de mode vide les champs, conserve l’heure (US18.1, D18-AL)', () => {
  it('quantité vide au retour sur Biberon, « Quand » inchangé', async () => {
    renderPanel()
    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '120')
    fireEvent.change(screen.getByLabelText('Quand'), { target: { value: '2026-11-08T14:00' } })

    await userEvent.click(tab('Sein'))
    expect(screen.getByLabelText('Quand')).toHaveValue('2026-11-08T14:00')

    await userEvent.click(tab('Biberon'))
    expect(screen.getByLabelText('Quantité (ml)')).toHaveValue(null)
    expect(screen.getByLabelText('Quand')).toHaveValue('2026-11-08T14:00')
  })

  it('la confirmation est effacée au changement de mode', async () => {
    renderPanel()
    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '120')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Biberon enregistré.')

    await userEvent.click(tab('Sein'))

    expect(screen.queryByText('Biberon enregistré.')).not.toBeInTheDocument()
  })
})

describe('FeedingPanel — aucune liste sous le formulaire (US18.1, D18-J)', () => {
  it.each(['Biberon', 'Sein', 'Diversification'])('mode %s : pas de liste ni de « Derniers biberons »', async (mode) => {
    const { container } = renderPanel()
    await userEvent.click(tab(mode))

    expect(within(container).queryByRole('list')).toBeNull()
    expect(within(container).queryByText(/Derniers biberons/)).toBeNull()
  })
})

describe('FeedingPanel — noter une tétée (US18.2)', () => {
  beforeEach(() => {
    localStorage.setItem(MODE_KEY, 'breast')
  })

  it('tétée complète : Gauche + 12 → createBreastfeeding, « Tétée enregistrée. », champs vidés', async () => {
    renderPanel()
    const side = screen.getByRole('group', { name: 'Côté' })
    await userEvent.click(within(side).getByRole('button', { name: 'Gauche' }))
    await userEvent.type(screen.getByLabelText('Durée (min)'), '12')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createBreastfeeding).toHaveBeenCalledTimes(1))
    expect(createBreastfeeding.mock.calls[0]).toEqual(
      ['b1', { occurredAt: expect.any(String), side: 'left', durationMinutes: 12 }],
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Tétée enregistrée.')
    expect(screen.getByLabelText('Durée (min)')).toHaveValue('')
    expect(within(side).getByRole('button', { name: 'Gauche' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sans côté ni durée : payload { occurredAt, side: null, durationMinutes: null }', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createBreastfeeding).toHaveBeenCalledTimes(1))
    expect(createBreastfeeding.mock.calls[0][1]).toEqual({ occurredAt: expect.any(String), side: null, durationMinutes: null })
  })

  it('une création réussie invalide le préfixe [babies, b1] une seule fois', async () => {
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(spy.mock.calls[0][0]).toEqual({ queryKey: ['babies', 'b1'] })
  })
})

describe('FeedingPanel — rappel de la dernière tétée (US18.2, D18-W/D18-AM)', () => {
  beforeEach(() => {
    localStorage.setItem(MODE_KEY, 'breast')
  })

  it('avec côté : « Dernière tétée : gauche… », une seule requête limit 1 au montage', async () => {
    listBreastfeedings.mockResolvedValue({
      items: [{ id: 'br1', occurredAt: new Date().toISOString(), side: 'left', durationMinutes: 10 }],
      nextCursor: null,
    })
    renderPanel()

    expect(await screen.findByText(/Dernière tétée : gauche/)).toBeInTheDocument()
    expect(listBreastfeedings).toHaveBeenCalledTimes(1)
    expect(listBreastfeedings.mock.calls[0]).toEqual(['b1', { limit: 1 }])
  })

  it('sans côté : « Dernière tétée : côté non précisé… »', async () => {
    listBreastfeedings.mockResolvedValue({
      items: [{ id: 'br1', occurredAt: new Date().toISOString(), side: null, durationMinutes: null }],
      nextCursor: null,
    })
    renderPanel()

    expect(await screen.findByText(/Dernière tétée : côté non précisé/)).toBeInTheDocument()
  })

  it('aucune tétée : aucun rappel affiché', async () => {
    renderPanel()
    await waitFor(() => expect(listBreastfeedings).toHaveBeenCalledTimes(1))

    expect(screen.queryByText(/Dernière tétée/)).not.toBeInTheDocument()
  })

  it('le rappel suit les saisies : après une création, deuxième requête et nouveau texte', async () => {
    listBreastfeedings
      .mockResolvedValueOnce({
        items: [{ id: 'br1', occurredAt: new Date().toISOString(), side: 'left', durationMinutes: null }],
        nextCursor: null,
      })
      .mockResolvedValue({
        items: [{ id: 'br2', occurredAt: new Date().toISOString(), side: 'right', durationMinutes: null }],
        nextCursor: null,
      })
    renderPanel()
    expect(await screen.findByText(/Dernière tétée : gauche/)).toBeInTheDocument()

    const side = screen.getByRole('group', { name: 'Côté' })
    await userEvent.click(within(side).getByRole('button', { name: 'Droit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText(/Dernière tétée : droit/)).toBeInTheDocument()
    expect(listBreastfeedings).toHaveBeenCalledTimes(2)
  })
})

describe('FeedingPanel — noter un repas de diversification (US18.3)', () => {
  beforeEach(() => {
    localStorage.setItem(MODE_KEY, 'solid')
  })

  it('le mode Diversification affiche le formulaire du repas (plus de « Bientôt disponible. »)', () => {
    renderPanel()

    expect(tab('Diversification')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Plat')).toBeInTheDocument()
    expect(screen.queryByText(/Bientôt disponible/)).not.toBeInTheDocument()
  })

  it('Purée en un toucher : createSolidMeal, « Repas enregistré. », champs vidés', async () => {
    renderPanel()

    await userEvent.click(within(screen.getByRole('group', { name: 'Propositions de plats' })).getByRole('button', { name: 'Purée' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createSolidMeal).toHaveBeenCalledTimes(1))
    expect(createSolidMeal.mock.calls[0]).toEqual(
      ['b1', { occurredAt: expect.any(String), dish: 'Purée', portion: null, addToDishes: false }],
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Repas enregistré.')
    expect(screen.getByLabelText('Plat')).toHaveValue('')
  })

  it('plat libre + portion « La moitié » → portion: half', async () => {
    renderPanel()

    await userEvent.type(screen.getByLabelText('Plat'), 'Purée de carottes')
    await userEvent.click(within(screen.getByRole('group', { name: 'Portion' })).getByRole('button', { name: 'La moitié' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createSolidMeal).toHaveBeenCalledTimes(1))
    expect(createSolidMeal.mock.calls[0][1]).toMatchObject({ dish: 'Purée de carottes', portion: 'half' })
  })

  it('un plat vide est refusé sans appel serveur', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('Indiquez le plat.')).toBeInTheDocument()
    expect(createSolidMeal).not.toHaveBeenCalled()
    expect(localStorage.getItem(MODE_KEY)).toBe('solid') // untouched: a refused entry never rewrites it
  })

  it('une création réussie invalide le préfixe [babies, b1] et mémorise Diversification', async () => {
    localStorage.clear()
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.click(tab('Diversification'))

    await userEvent.type(screen.getByLabelText('Plat'), 'Compote')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createSolidMeal).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(spy.mock.calls.map((c) => c[0])).toContainEqual({ queryKey: ['babies', 'b1'] }))
    await waitFor(() => expect(localStorage.getItem(MODE_KEY)).toBe('solid'))
  })

  it('une erreur serveur laisse la saisie et n’efface pas le plat', async () => {
    createSolidMeal.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()

    await userEvent.type(screen.getByLabelText('Plat'), 'Compote')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
    expect(screen.getByLabelText('Plat')).toHaveValue('Compote')
    expect(screen.queryByText('Repas enregistré.')).not.toBeInTheDocument()
  })
})

describe('FeedingPanel — ajouter un plat au référentiel (US18.4)', () => {
  beforeEach(() => {
    localStorage.setItem(MODE_KEY, 'solid')
  })

  it('case cochée : le repas part avec addToDishes: true', async () => {
    renderPanel()
    await userEvent.type(screen.getByLabelText('Plat'), 'Gratin de courgettes')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createSolidMeal).toHaveBeenCalledTimes(1))
    expect(createSolidMeal.mock.calls[0][1]).toMatchObject({ dish: 'Gratin de courgettes', addToDishes: true })
  })

  it('après la création, la liste partagée est invalidée (le plat devient proposable tout de suite)', async () => {
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.type(screen.getByLabelText('Plat'), 'Gratin de courgettes')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(spy.mock.calls.map((c) => c[0])).toContainEqual({ queryKey: ['dishes'] }))
    expect(spy.mock.calls.map((c) => c[0])).toContainEqual({ queryKey: ['babies', 'b1'] })
  })

  it('sans la case, le repas part avec addToDishes: false', async () => {
    renderPanel()
    await userEvent.type(screen.getByLabelText('Plat'), 'Gratin de courgettes')
    await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createSolidMeal).toHaveBeenCalledTimes(1))
    expect(createSolidMeal.mock.calls[0][1].addToDishes).toBe(false)
  })
})

describe('FeedingPanel — accès à « Mes plats » (US18.5, D18-AI)', () => {
  it.each(['Biberon', 'Sein'])('mode %s : pas de bouton « Gérer mes plats »', async (mode) => {
    renderPanel()
    await userEvent.click(tab(mode))

    expect(screen.queryByRole('button', { name: 'Gérer mes plats' })).toBeNull()
  })

  it('mode Diversification : le bouton existe et ouvre la feuille « Mes plats »', async () => {
    listManageableDishes.mockResolvedValue([{ id: 'd1', label: 'Purée de carrotes' }])
    renderPanel()
    await userEvent.click(tab('Diversification'))
    expect(listManageableDishes).not.toHaveBeenCalled() // nothing is fetched before the sheet opens

    await userEvent.click(screen.getByRole('button', { name: 'Gérer mes plats' }))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Mes plats' })).toBeInTheDocument()
    expect(await within(sheet).findByRole('list', { name: 'Mes plats' })).toBeInTheDocument()
    expect(listManageableDishes).toHaveBeenCalled()
  })

  it('la feuille « Mes plats » se ferme par × et laisse le formulaire du repas', async () => {
    renderPanel()
    await userEvent.click(tab('Diversification'))
    await userEvent.click(screen.getByRole('button', { name: 'Gérer mes plats' }))
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Plat')).toBeInTheDocument()
  })
})
