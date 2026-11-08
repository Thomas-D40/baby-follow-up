import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BreastfeedingForm from './BreastfeedingForm'

const sideGroup = () => screen.getByRole('group', { name: 'Côté' })
const left = () => within(sideGroup()).getByRole('button', { name: 'Gauche' })
const right = () => within(sideGroup()).getByRole('button', { name: 'Droit' })
const save = () => screen.getByRole('button', { name: 'Enregistrer' })

describe('BreastfeedingForm — saisie d’une tétée (US18.2)', () => {
  it('aucun côté enfoncé à l’ouverture (rien n’est coché d’office)', () => {
    render(<BreastfeedingForm onSubmit={vi.fn()} />)

    expect(left()).toHaveAttribute('aria-pressed', 'false')
    expect(right()).toHaveAttribute('aria-pressed', 'false')
  })

  it('durée : champ texte à clavier numérique, jamais type="number"', () => {
    render(<BreastfeedingForm onSubmit={vi.fn()} />)

    const duration = screen.getByLabelText('Durée (min)')
    expect(duration).toHaveAttribute('type', 'text')
    expect(duration).toHaveAttribute('inputmode', 'numeric')
  })

  it('tétée complète : Gauche + 12 → onSubmit { occurredAt, side: left, durationMinutes: 12 }', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BreastfeedingForm onSubmit={onSubmit} />)

    await userEvent.click(left())
    await userEvent.type(screen.getByLabelText('Durée (min)'), '12')
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({ occurredAt: expect.any(String), side: 'left', durationMinutes: 12 })
  })

  it('sans côté ni durée : tous les champs sont présents, à null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BreastfeedingForm onSubmit={onSubmit} />)

    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({ occurredAt: expect.any(String), side: null, durationMinutes: null })
  })

  it('l’heure « Quand » est préremplie sur maintenant et soumise en ISO', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BreastfeedingForm onSubmit={onSubmit} />)

    expect(screen.getByLabelText('Quand')).toHaveValue(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
    await userEvent.click(save())

    expect(new Date(onSubmit.mock.calls[0][0].occurredAt).toISOString()).toBe(onSubmit.mock.calls[0][0].occurredAt)
  })

  it('après succès en création, côté et durée sont vidés (prêt pour une saisie suivante)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BreastfeedingForm onSubmit={onSubmit} />)

    await userEvent.click(right())
    await userEvent.type(screen.getByLabelText('Durée (min)'), '8')
    await userEvent.click(save())

    await waitFor(() => expect(screen.getByLabelText('Durée (min)')).toHaveValue(''))
    expect(right()).toHaveAttribute('aria-pressed', 'false')
  })

  describe('revenir à « non précisé » (D18-K)', () => {
    it('toucher deux fois le même côté le relâche : les deux à false, payload side: null', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<BreastfeedingForm onSubmit={onSubmit} />)

      await userEvent.click(right())
      expect(right()).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(right())

      expect(right()).toHaveAttribute('aria-pressed', 'false')
      expect(left()).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(save())
      expect(onSubmit.mock.calls[0][0].side).toBeNull()
    })

    it('toucher l’autre côté bascule : seul le dernier touché reste enfoncé', async () => {
      render(<BreastfeedingForm onSubmit={vi.fn()} />)

      await userEvent.click(right())
      await userEvent.click(left())

      expect(left()).toHaveAttribute('aria-pressed', 'true')
      expect(right()).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('durée hors bornes (D18-M)', () => {
    it.each(['7,5', '7.5', '0', '121', 'abc'])('« %s » → message, onSubmit non appelé', async (raw) => {
      const onSubmit = vi.fn()
      render(<BreastfeedingForm onSubmit={onSubmit} />)

      await userEvent.type(screen.getByLabelText('Durée (min)'), raw)
      await userEvent.click(save())

      expect(screen.getByText('Durée invalide (nombre entier de 1 à 120 min).')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it.each(['1', '120'])('« %s » est accepté', async (raw) => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<BreastfeedingForm onSubmit={onSubmit} />)

      await userEvent.type(screen.getByLabelText('Durée (min)'), raw)
      await userEvent.click(save())

      expect(onSubmit.mock.calls[0][0].durationMinutes).toBe(Number(raw))
    })
  })

  it('désactive le bouton pendant la soumission : deux clics, un seul appel (anti double-tap)', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    render(<BreastfeedingForm onSubmit={onSubmit} />)

    // Keep the element: while busy its label turns to « … », like every other form.
    const btn = save()
    await userEvent.click(btn)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(btn).toBeDisabled()

    await userEvent.click(btn)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve()
    await waitFor(() => expect(btn).not.toBeDisabled())
    expect(btn).toHaveAccessibleName('Enregistrer')
  })

  it('erreur serveur 400 → « Données invalides. » ; autre erreur → « Échec de l’enregistrement. »', async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('-> 400'), { status: 400 }))
      .mockRejectedValueOnce(Object.assign(new Error('-> 500'), { status: 500 }))
    render(<BreastfeedingForm onSubmit={onSubmit} />)

    await userEvent.click(save())
    expect(await screen.findByText('Données invalides.')).toBeInTheDocument()

    await userEvent.click(save())
    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
  })
})

describe('BreastfeedingForm — heure pilotée par la feuille (D18-AL)', () => {
  it('affiche `time`, signale les changements et soumet cette heure', async () => {
    const onTimeChange = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BreastfeedingForm onSubmit={onSubmit} time="2026-11-08T14:00" onTimeChange={onTimeChange} />)

    expect(screen.getByLabelText('Quand')).toHaveValue('2026-11-08T14:00')
    fireEvent.change(screen.getByLabelText('Quand'), { target: { value: '2026-11-08T15:30' } })
    expect(onTimeChange).toHaveBeenCalledWith('2026-11-08T15:30')

    await userEvent.click(save())
    expect(onSubmit.mock.calls[0][0].occurredAt).toBe(new Date('2026-11-08T14:00').toISOString())
  })
})

describe('BreastfeedingForm — mode édition (US18.2)', () => {
  const INITIAL = { occurredAt: '2026-06-21T08:30:00.000Z', side: 'left', durationMinutes: 12 }

  it('préremplit côté, durée et heure depuis `initial`', () => {
    render(<BreastfeedingForm onSubmit={vi.fn()} initial={INITIAL} />)

    expect(left()).toHaveAttribute('aria-pressed', 'true')
    expect(right()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Durée (min)')).toHaveValue('12')
    expect(screen.getByLabelText('Quand').value).not.toBe('')
  })

  it('vider la durée envoie durationMinutes: null ; les champs ne sont pas réinitialisés après succès', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BreastfeedingForm onSubmit={onSubmit} initial={INITIAL} />)

    await userEvent.clear(screen.getByLabelText('Durée (min)'))
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({ occurredAt: expect.any(String), side: 'left', durationMinutes: null })
    await waitFor(() => expect(save()).not.toBeDisabled())
    expect(left()).toHaveAttribute('aria-pressed', 'true')
  })

  it('relâcher le côté à l’édition envoie side: null (retour à « non précisé »)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BreastfeedingForm onSubmit={onSubmit} initial={INITIAL} />)

    await userEvent.click(left())
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({ occurredAt: expect.any(String), side: null, durationMinutes: 12 })
  })
})
