import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BabiesScreen from './BabiesScreen'
import * as api from '../api'

vi.mock('../api')

// Stub léger de la courbe (lazy, Recharts + tables OMS) : le gate est ce qu'on teste ici, pas le
// rendu du chart (couvert par WeightChart.test.jsx). Évite le coût/flakiness du chunk lazy réel.
vi.mock('./WeightChart', () => ({
  default: ({ sex, birthDate }) => (
    <div data-testid="weight-chart">chart {sex} {birthDate}</div>
  ),
}))

const me = { firstName: 'Parent', email: 'p@test.local', role: 'parent' }

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BabiesScreen me={me} onLogout={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  // La fiche bébé monte les panneaux calendrier (Épic 6), biberon (Épic 3), sieste (Épic 4) et selle
  // (Épic 5) : vides par défaut.
  api.getDayEvents.mockResolvedValue([])
  api.getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0 })
  api.listBottleFeedings.mockResolvedValue({ items: [], nextCursor: null })
  api.getCurrentNap.mockResolvedValue(null)
  api.listNaps.mockResolvedValue({ items: [], nextCursor: null })
  api.listStools.mockResolvedValue({ items: [], nextCursor: null })
  // Section Partage (Épic 8) montée dans la fiche : cercle vide par défaut.
  api.listCaregivers.mockResolvedValue([])
  // Courbe de croissance (Épic 12) : historique vide par défaut si la vue est ouverte.
  api.getWeightHistory.mockResolvedValue({ points: [] })
})

describe('BabiesScreen — sélection (US2.2)', () => {
  it('sélectionne implicitement le bébé unique (pas de sélecteur)', async () => {
    api.listBabies.mockResolvedValue([{ id: 'a', firstName: 'Léa', birthDate: '2026-01-15', sex: 'female' }])

    renderScreen()

    expect(await screen.findByRole('heading', { name: 'Léa', level: 2 })).toBeInTheDocument()
    expect(screen.queryByLabelText('Bébé suivi')).not.toBeInTheDocument() // pas de sélecteur
  })

  it('affiche le sélecteur et réinitialise une sélection orpheline (plusieurs bébés)', async () => {
    localStorage.setItem('suivibaby.selectedBabyId', 'ghost') // sélection périmée
    api.listBabies.mockResolvedValue([
      { id: 'a', firstName: 'Léa' },
      { id: 'b', firstName: 'Tom' },
    ])

    renderScreen()

    expect(await screen.findByLabelText('Bébé suivi')).toBeInTheDocument()
    // orpheline → aucune fiche affichée tant que l'utilisateur n'a pas choisi
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })
})

describe('BabiesScreen — suppression (D2-H)', () => {
  it('exige une confirmation puis notifie la suppression', async () => {
    let babies = [{ id: 'a', firstName: 'Léa' }]
    api.listBabies.mockImplementation(() => Promise.resolve(babies))
    api.deleteBaby.mockImplementation((id) => {
      babies = babies.filter((b) => b.id !== id)
      return Promise.resolve(null)
    })

    renderScreen()
    await screen.findByRole('heading', { name: 'Léa', level: 2 })

    // 1er clic : pas de suppression directe, une confirmation apparaît
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(api.deleteBaby).not.toHaveBeenCalled()
    expect(screen.getByText(/irréversible/i)).toBeInTheDocument()

    // Confirmation → suppression + notification (React Query v5 passe un 2e arg de contexte)
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))
    await waitFor(() => expect(api.deleteBaby).toHaveBeenCalled())
    expect(api.deleteBaby.mock.calls[0][0]).toBe('a')
    expect(await screen.findByRole('status')).toHaveTextContent('Bébé supprimé.')
  })
})

describe('BabiesScreen — gate courbe de croissance (Épic 12, D12-G′)', () => {
  it('birthDate manquant → message + lien vers la fiche, aucune courbe', async () => {
    api.listBabies.mockResolvedValue([{ id: 'a', firstName: 'Léa', sex: 'female' }]) // pas de birthDate
    renderScreen()
    await screen.findByRole('heading', { name: 'Léa', level: 2 })

    await userEvent.click(screen.getByRole('tab', { name: 'Croissance' }))

    expect(await screen.findByText(/renseignez la date de naissance et le sexe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compléter la fiche' })).toBeInTheDocument()
    // Aucune courbe : ni sélecteur de période, ni appel à l'historique.
    expect(screen.queryByRole('tablist', { name: 'Période de croissance' })).not.toBeInTheDocument()
    expect(api.getWeightHistory).not.toHaveBeenCalled()
  })

  it('sexe manquant → même gate (jamais de rabat silencieux sur \'male\')', async () => {
    api.listBabies.mockResolvedValue([{ id: 'a', firstName: 'Léa', birthDate: '2026-01-15' }]) // pas de sex
    renderScreen()
    await screen.findByRole('heading', { name: 'Léa', level: 2 })

    await userEvent.click(screen.getByRole('tab', { name: 'Croissance' }))

    expect(await screen.findByText(/renseignez la date de naissance et le sexe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compléter la fiche' })).toBeInTheDocument()
    expect(api.getWeightHistory).not.toHaveBeenCalled()
  })

  it('birthDate ET sexe présents → la courbe se monte (gate franchi)', async () => {
    api.listBabies.mockResolvedValue([{ id: 'a', firstName: 'Léa', birthDate: '2026-01-15', sex: 'female' }])
    renderScreen()
    await screen.findByRole('heading', { name: 'Léa', level: 2 })

    await userEvent.click(screen.getByRole('tab', { name: 'Croissance' }))

    // WeightChart (lazy) monté avec le bon sexe + birthDate ; message de gate absent.
    const chart = await screen.findByTestId('weight-chart')
    expect(chart).toHaveTextContent('female')
    expect(chart).toHaveTextContent('2026-01-15')
    expect(screen.queryByText(/renseignez la date de naissance et le sexe/i)).not.toBeInTheDocument()
  })
})
