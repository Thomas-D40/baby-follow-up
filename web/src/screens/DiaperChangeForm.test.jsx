import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiaperChangeForm from './DiaperChangeForm'

// `DiaperChangeForm` est autonome : il reçoit `onSubmit` en prop (pas d'appel `../api` direct),
// on peut donc le tester sans QueryClient. État initial : Urine cochée, Selle décochée.

describe('DiaperChangeForm — toggles & validation (US13.2, D13-G)', () => {
  it('désactive « Enregistrer » quand aucun toggle n’est coché', async () => {
    render(<DiaperChangeForm onSubmit={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Enregistrer' })

    // Par défaut Urine est cochée → bouton actif.
    expect(submit).toBeEnabled()

    // On décoche Urine (seul toggle actif) → plus rien de sélectionné → bouton désactivé.
    await userEvent.click(screen.getByRole('button', { name: 'Urine' }))
    expect(submit).toBeDisabled()

    // On coche Selle → au moins un type → bouton réactivé.
    await userEvent.click(screen.getByRole('button', { name: 'Selle' }))
    expect(submit).toBeEnabled()
  })

  it('n’affiche le select « Consistance » que si « Selle » est cochée', async () => {
    render(<DiaperChangeForm onSubmit={vi.fn()} />)

    // Selle décochée par défaut → pas de select.
    expect(screen.queryByLabelText('Consistance')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Selle' }))
    expect(screen.getByLabelText('Consistance')).toBeInTheDocument()

    // On redécoche → le select disparaît.
    await userEvent.click(screen.getByRole('button', { name: 'Selle' }))
    expect(screen.queryByLabelText('Consistance')).not.toBeInTheDocument()
  })
})

describe('DiaperChangeForm — body soumis (D13-G)', () => {
  it('urine seule (état par défaut) : withUrine=true, withStool=false, consistency=null', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<DiaperChangeForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      withUrine: true,
      withStool: false,
      consistency: null,
      occurredAt: expect.any(String),
    })
  })

  it('selle seule + consistance : withUrine=false, withStool=true, consistency renseignée', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<DiaperChangeForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Urine' })) // décoche Urine
    await userEvent.click(screen.getByRole('button', { name: 'Selle' })) // coche Selle
    await userEvent.selectOptions(screen.getByLabelText('Consistance'), 'liquid')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      withUrine: false,
      withStool: true,
      consistency: 'liquid',
      occurredAt: expect.any(String),
    })
  })
})

describe('DiaperChangeForm — anti double-saisie (D5-J/D3-G)', () => {
  it('désactive le bouton pendant le submit (retry:0)', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    render(<DiaperChangeForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    // Mutation en vol : le bouton passe en « … » et se désactive.
    await waitFor(() => expect(screen.getByRole('button', { name: '…' })).toBeDisabled())
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve({})
  })
})
