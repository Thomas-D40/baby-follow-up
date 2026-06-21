import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BabyForm from './BabyForm'

describe('BabyForm', () => {
  it('refuse un prénom en espaces seulement (que `required` natif laisse passer)', async () => {
    const onSubmit = vi.fn()
    render(<BabyForm submitLabel="Ajouter" onSubmit={onSubmit} onCancel={() => {}} />)

    await userEvent.type(screen.getByLabelText('Prénom'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(screen.getByText('Le prénom est requis.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('soumet le prénom rogné et les champs optionnels', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BabyForm submitLabel="Ajouter" onSubmit={onSubmit} onCancel={() => {}} />)

    await userEvent.type(screen.getByLabelText('Prénom'), '  Léa  ')
    await userEvent.selectOptions(screen.getByLabelText('Sexe (optionnel)'), 'female')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    expect(onSubmit).toHaveBeenCalledWith({ firstName: 'Léa', birthDate: null, sex: 'female' })
  })

  it('préremplit les valeurs en édition', () => {
    render(
      <BabyForm
        initial={{ firstName: 'Tom', birthDate: '2026-01-02', sex: 'male' }}
        submitLabel="Enregistrer"
        onSubmit={vi.fn()}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByLabelText('Prénom')).toHaveValue('Tom')
    expect(screen.getByLabelText('Sexe (optionnel)')).toHaveValue('male')
  })
})
