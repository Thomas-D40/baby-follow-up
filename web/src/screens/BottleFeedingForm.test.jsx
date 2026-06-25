import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BottleFeedingForm from './BottleFeedingForm'

describe('BottleFeedingForm', () => {
  it('refuse une quantité vide', async () => {
    const onSubmit = vi.fn()
    render(<BottleFeedingForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('La quantité est requise.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuse une quantité hors-bornes', async () => {
    const onSubmit = vi.fn()
    render(<BottleFeedingForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '5000')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText(/max 2000/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('soumet un payload normalisé (occurredAt ISO, quantité entière, milkType)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BottleFeedingForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '120')
    await userEvent.selectOptions(screen.getByLabelText('Type de lait'), 'formula')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const body = onSubmit.mock.calls[0][0]
    expect(body.quantityMl).toBe(120)
    expect(body.milkType).toBe('formula')
    expect(typeof body.occurredAt).toBe('string')
  })

  it('désactive le bouton pendant la soumission (anti double-saisie, D3-G)', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    render(<BottleFeedingForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '120')
    const btn = screen.getByRole('button', { name: 'Enregistrer' })
    await userEvent.click(btn)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(btn).toBeDisabled()

    await userEvent.click(btn) // 2e tap ignoré tant que la mutation n'est pas settled
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve() // settled → le bouton se ré-active (D3-G)
    await waitFor(() => expect(btn).not.toBeDisabled())
  })

  describe('mode édition (Épic 8, DA-1)', () => {
    it('préremplit les champs depuis `initial`', () => {
      render(
        <BottleFeedingForm
          onSubmit={vi.fn()}
          initial={{ occurredAt: '2026-06-21T08:30:00.000Z', quantityMl: 150, milkType: 'formula' }}
        />,
      )
      expect(screen.getByLabelText('Quantité (ml)')).toHaveValue(150)
      expect(screen.getByLabelText('Type de lait')).toHaveValue('formula')
    })

    it('soumet un patch reflétant les valeurs (édition d’un champ) sans vider après succès', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(
        <BottleFeedingForm
          onSubmit={onSubmit}
          initial={{ occurredAt: '2026-06-21T08:30:00.000Z', quantityMl: 150, milkType: 'formula' }}
        />,
      )

      const qty = screen.getByLabelText('Quantité (ml)')
      await userEvent.clear(qty)
      await userEvent.type(qty, '200')
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

      expect(onSubmit).toHaveBeenCalledTimes(1)
      const patch = onSubmit.mock.calls[0][0]
      expect(patch.quantityMl).toBe(200)
      expect(patch.milkType).toBe('formula')
      expect(typeof patch.occurredAt).toBe('string')
      // en édition, les champs ne sont PAS réinitialisés après succès
      expect(qty).toHaveValue(200)
    })
  })
})
