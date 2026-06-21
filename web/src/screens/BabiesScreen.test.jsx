import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BabiesScreen from './BabiesScreen'
import * as api from '../api'

vi.mock('../api')

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
