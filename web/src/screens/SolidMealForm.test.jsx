import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SolidMealForm from './SolidMealForm'
import { normalizeDishLabel } from '../dish'

// The form loads the baby's dish suggestions (services/dishes), so it needs a QueryClientProvider and
// the getDishSuggestions client; a vi.mock factory throws on access to an undeclared export.
vi.mock('../api', () => ({
  getDishSuggestions: vi.fn(),
}))
import { getDishSuggestions } from '../api'

function renderForm(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined)
  return {
    onSubmit,
    ...render(
      <QueryClientProvider client={qc}>
        <SolidMealForm babyId="b1" {...props} onSubmit={onSubmit} />
      </QueryClientProvider>,
    ),
  }
}

const NOTHING = { labels: [], exactMatch: false }

// Answers by the NORMALIZED text sent to the server (the second argument of the call).
function answerByText(table, fallback = NOTHING) {
  getDishSuggestions.mockImplementation(async (babyId, q) => table[normalizeDishLabel(q)] ?? fallback)
}

const dish = () => screen.getByLabelText('Plat')
const save = () => screen.getByRole('button', { name: 'Enregistrer' })
const proposals = () => screen.getByRole('group', { name: 'Propositions de plats' })
const proposalLabels = () => within(proposals()).getAllByRole('button').map((b) => b.textContent)
const proposal = (name) => within(proposals()).getByRole('button', { name })
const portions = () => screen.getByRole('group', { name: 'Portion' })
const portion = (name) => within(portions()).getByRole('button', { name })
const addBox = () => screen.queryByRole('checkbox', { name: 'Ajouter à mes plats' })
const lastTextSent = () => getDishSuggestions.mock.calls.at(-1)[1]
// Leaves a stray request every chance to fire before asserting its absence.
const settle = () => new Promise((r) => setTimeout(r, 20))

beforeEach(() => {
  vi.clearAllMocks()
  getDishSuggestions.mockResolvedValue(NOTHING)
})

describe('SolidMealForm — saisie d’un repas (US18.3, US23.1)', () => {
  it('le champ Plat est un texte libre, sans maxLength (le message de longueur doit rester atteignable)', () => {
    renderForm()

    expect(dish()).toHaveAttribute('type', 'text')
    expect(dish()).not.toHaveAttribute('maxlength')
  })

  it('aucune portion enfoncée à l’ouverture', () => {
    renderForm()

    ;['Goûté', 'La moitié', 'Tout'].forEach((name) => {
      expect(portion(name)).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('plus de catégorie à l’ouverture', () => {
    it('aucun bouton « Purée » ni « Compote », un exemple dans le champ vide', async () => {
      renderForm()
      await waitFor(() => expect(getDishSuggestions).toHaveBeenCalled())

      expect(screen.queryByRole('button', { name: 'Purée' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Compote' })).toBeNull()
      expect(dish()).toHaveValue('')
      expect(dish()).toHaveAttribute('placeholder', 'Ex. : purée de carottes, banane, pâtes')
    })

    it('le nom accessible du champ reste « Plat » malgré l’exemple', () => {
      renderForm()

      expect(screen.getByRole('textbox', { name: 'Plat' })).toBe(dish())
    })
  })

  describe('plat libre + portion', () => {
    it('« Purée de carottes » + « La moitié » → portion: half', async () => {
      const { onSubmit } = renderForm()

      await userEvent.type(dish(), 'Purée de carottes')
      await userEvent.click(portion('La moitié'))
      expect(portion('La moitié')).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(save())

      expect(onSubmit.mock.calls[0][0]).toEqual({
        occurredAt: expect.any(String), dish: 'Purée de carottes', portion: 'half', addToDishes: false,
      })
    })

    it('toucher une autre portion bascule : une seule enfoncée', async () => {
      renderForm()

      await userEvent.click(portion('Goûté'))
      await userEvent.click(portion('Tout'))

      expect(portion('Goûté')).toHaveAttribute('aria-pressed', 'false')
      expect(portion('Tout')).toHaveAttribute('aria-pressed', 'true')
    })

    it('toucher la portion enfoncée la relâche : payload portion: null', async () => {
      const { onSubmit } = renderForm()

      await userEvent.type(dish(), 'Compote')
      await userEvent.click(portion('Tout'))
      await userEvent.click(portion('Tout'))
      expect(portion('Tout')).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(save())

      expect(onSubmit.mock.calls[0][0].portion).toBeNull()
    })
  })

  describe('plat obligatoire', () => {
    it.each(['', '   '])('plat « %s » → « Indiquez le plat. », onSubmit non appelé', async (raw) => {
      const { onSubmit } = renderForm()

      if (raw) await userEvent.type(dish(), raw)
      await userEvent.click(save())

      expect(screen.getByText('Indiquez le plat.')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('plat trop long', () => {
    it('61 caractères → « Le plat ne doit pas dépasser 60 caractères. », onSubmit non appelé', async () => {
      const { onSubmit } = renderForm()

      fireEvent.change(dish(), { target: { value: 'x'.repeat(61) } })
      await userEvent.click(save())

      expect(screen.getByText('Le plat ne doit pas dépasser 60 caractères.')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('60 caractères sont acceptés', async () => {
      const { onSubmit } = renderForm()

      fireEvent.change(dish(), { target: { value: 'x'.repeat(60) } })
      await userEvent.click(save())

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  it('le plat est envoyé mis en forme : bords retirés, blancs répétés réduits', async () => {
    const { onSubmit } = renderForm()

    fireEvent.change(dish(), { target: { value: '  Compote   Pomme-poire ' } })
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].dish).toBe('Compote Pomme-poire')
  })

  it('après succès en création, le plat et la portion sont vidés', async () => {
    renderForm()

    await userEvent.type(dish(), 'Compote')
    await userEvent.click(portion('Goûté'))
    await userEvent.click(save())

    await waitFor(() => expect(dish()).toHaveValue(''))
    expect(portion('Goûté')).toHaveAttribute('aria-pressed', 'false')
  })

  it('après succès en création, la rangée revient aux plats récents du bébé', async () => {
    answerByText({ '': { labels: ['Banane'], exactMatch: false }, car: { labels: ['Carottes râpées'], exactMatch: false } })
    renderForm()
    await userEvent.type(dish(), 'car')
    await waitFor(() => expect(proposalLabels()).toEqual(['Carottes râpées']))

    await userEvent.click(save())

    await waitFor(() => expect(dish()).toHaveValue(''))
    await waitFor(() => expect(proposalLabels()).toEqual(['Banane']))
  })

  it('désactive le bouton pendant la soumission : deux clics, un seul appel (anti double-tap)', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    renderForm({ onSubmit })

    await userEvent.type(dish(), 'Compote')
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
    renderForm({ onSubmit })

    await userEvent.type(dish(), 'Compote')
    await userEvent.click(save())
    expect(await screen.findByText('Données invalides.')).toBeInTheDocument()

    await userEvent.click(save())
    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
  })
})

describe('SolidMealForm — heure pilotée par la feuille (D18-AL)', () => {
  it('affiche `time`, signale les changements et soumet cette heure', async () => {
    const onTimeChange = vi.fn()
    const { onSubmit } = renderForm({ time: '2026-11-08T14:00', onTimeChange })

    expect(screen.getByLabelText('Quand')).toHaveValue('2026-11-08T14:00')
    fireEvent.change(screen.getByLabelText('Quand'), { target: { value: '2026-11-08T15:30' } })
    expect(onTimeChange).toHaveBeenCalledWith('2026-11-08T15:30')

    await userEvent.type(dish(), 'Compote')
    await userEvent.click(save())
    expect(onSubmit.mock.calls[0][0].occurredAt).toBe(new Date('2026-11-08T14:00').toISOString())
  })
})

describe('SolidMealForm — mode édition (US18.3, D18-AR, US23.1, US23.2)', () => {
  const INITIAL = { occurredAt: '2026-06-21T08:30:00.000Z', dish: 'Purée de carrotes', portion: 'all' }

  it('préremplit le plat, la portion et l’heure depuis `initial`', () => {
    renderForm({ initial: INITIAL })

    expect(dish()).toHaveValue('Purée de carrotes')
    expect(portion('Tout')).toHaveAttribute('aria-pressed', 'true')
    expect(portion('La moitié')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Quand').value).not.toBe('')
  })

  it('le patch porte { occurredAt, dish, portion } et AUCUN drapeau addToDishes', async () => {
    const { onSubmit } = renderForm({ initial: INITIAL })

    fireEvent.change(dish(), { target: { value: 'Purée de carottes' } })
    await userEvent.click(portion('Tout')) // releases the portion
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), dish: 'Purée de carottes', portion: null,
    })
    expect(Object.keys(onSubmit.mock.calls[0][0]).sort()).toEqual(['dish', 'occurredAt', 'portion'])
  })

  it('les champs ne sont pas réinitialisés après succès', async () => {
    renderForm({ initial: INITIAL })

    await userEvent.click(save())
    await waitFor(() => expect(save()).not.toBeDisabled())

    expect(dish()).toHaveValue('Purée de carrotes')
    expect(portion('Tout')).toHaveAttribute('aria-pressed', 'true')
  })

  it('le plat reste obligatoire à l’édition', async () => {
    const { onSubmit } = renderForm({ initial: INITIAL })

    fireEvent.change(dish(), { target: { value: '  ' } })
    await userEvent.click(save())

    expect(screen.getByText('Indiquez le plat.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('aucune case « Ajouter à mes plats », quel que soit le résultat de la recherche (D18-AR)', async () => {
    getDishSuggestions.mockResolvedValue({ labels: [], exactMatch: false })
    renderForm({ initial: INITIAL })

    fireEvent.change(dish(), { target: { value: 'Yaourt à la vanille' } })
    await waitFor(() => expect(getDishSuggestions).toHaveBeenCalledWith('b1', 'Yaourt à la vanille'))
    await settle()

    expect(addBox()).toBeNull()
    expect(screen.queryByText('Ce plat sera proposé à tous les utilisateurs')).toBeNull()
  })

  it('aucun bouton « Purée » ni « Compote » : seulement les plats récents du bébé', async () => {
    getDishSuggestions.mockResolvedValue({ labels: ['Banane'], exactMatch: false })
    renderForm({ initial: INITIAL })

    expect(await screen.findByRole('button', { name: 'Banane' })).toBeInTheDocument()
    expect(proposalLabels()).toEqual(['Banane'])
    expect(screen.queryByRole('button', { name: 'Purée' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compote' })).toBeNull()
  })

  it('les propositions de l’édition sont les plats récents du bébé : texte vide demandé, jamais le plat édité tant que rien n’est tapé', async () => {
    getDishSuggestions.mockResolvedValue({ labels: ['Purée de carottes'], exactMatch: false })
    renderForm({ initial: INITIAL })

    expect(await screen.findByRole('button', { name: 'Purée de carottes' })).toBeInTheDocument()
    await settle()

    expect(getDishSuggestions).toHaveBeenCalledWith('b1', '')
    expect(getDishSuggestions.mock.calls.map((call) => call[1])).not.toContain('Purée de carrotes')
  })
})

describe('SolidMealForm — propositions de plats (US23.1, US23.2)', () => {
  it('à l’ouverture : les plats récents du bébé, texte vide demandé', async () => {
    getDishSuggestions.mockResolvedValue({ labels: ['Banane', 'Purée de carottes'], exactMatch: false })
    renderForm()

    await waitFor(() => expect(proposalLabels()).toEqual(['Banane', 'Purée de carottes']))
    expect(getDishSuggestions).toHaveBeenCalledWith('b1', '')
  })

  it('bébé sans repas : le groupe « Propositions de plats » n’est pas affiché', async () => {
    getDishSuggestions.mockResolvedValue({ labels: [], exactMatch: false })
    renderForm()
    await waitFor(() => expect(getDishSuggestions).toHaveBeenCalled())
    await settle()

    expect(screen.queryByRole('group', { name: 'Propositions de plats' })).toBeNull()
  })

  it('les propositions suivent le texte tapé, dans l’ordre reçu', async () => {
    answerByText({ car: { labels: ['Carottes râpées', 'Purée de carottes'], exactMatch: false } })
    renderForm()

    await userEvent.type(dish(), 'car')

    await waitFor(() => expect(proposalLabels()).toEqual(['Carottes râpées', 'Purée de carottes']))
    expect(lastTextSent()).toBe('car')
  })

  it('l’ordre est celui du serveur, pas un tri alphabétique', async () => {
    answerByText({ '': { labels: ['Zeste', 'Abricot', 'Mangue'], exactMatch: false } })
    renderForm()

    await waitFor(() => expect(proposalLabels()).toEqual(['Zeste', 'Abricot', 'Mangue']))
  })

  it('choisir une proposition remplit le champ ; Enregistrer envoie ce plat', async () => {
    answerByText({ car: { labels: ['Carottes râpées', 'Purée de carottes'], exactMatch: false } })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'car')

    await userEvent.click(await screen.findByRole('button', { name: 'Purée de carottes' }))
    expect(dish()).toHaveValue('Purée de carottes')
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].dish).toBe('Purée de carottes')
  })

  it('un libellé de proposition est rendu comme du texte, jamais interprété', async () => {
    answerByText({ gras: { labels: ['<b>gras</b>'], exactMatch: false } })
    renderForm()
    await userEvent.type(dish(), 'gras')

    expect(await screen.findByRole('button', { name: '<b>gras</b>' })).toBeInTheDocument()
  })

  describe('toucher une proposition : pas de second niveau', () => {
    const TABLE = {
      pur: { labels: ['Purée', 'Purée de carottes'], exactMatch: false },
      puree: { labels: ['Purée', 'Purée de carottes', 'Purée de panais'], exactMatch: true },
    }

    it('le champ est rempli, la proposition touchée est enfoncée, la rangée ne bouge pas', async () => {
      answerByText(TABLE)
      renderForm()
      await userEvent.type(dish(), 'pur')
      await waitFor(() => expect(proposalLabels()).toEqual(['Purée', 'Purée de carottes']))

      await userEvent.click(proposal('Purée'))

      expect(dish()).toHaveValue('Purée')
      expect(proposal('Purée')).toHaveAttribute('aria-pressed', 'true')
      expect(proposal('Purée de carottes')).toHaveAttribute('aria-pressed', 'false')
      // Wait for the answer of the touched label, then check that the row did not follow it.
      await waitFor(() => expect(getDishSuggestions).toHaveBeenCalledWith('b1', 'Purée'))
      await settle()
      expect(proposalLabels()).toEqual(['Purée', 'Purée de carottes'])
      expect(screen.queryByRole('button', { name: 'Purée de panais' })).toBeNull()
    })

    it('le champ reste modifiable : retaper relance les propositions sur le texte du champ', async () => {
      answerByText({
        ...TABLE,
        'puree de ca': { labels: ['Purée de carottes'], exactMatch: false },
      })
      renderForm()
      await userEvent.type(dish(), 'pur')
      await waitFor(() => expect(proposalLabels()).toEqual(['Purée', 'Purée de carottes']))
      await userEvent.click(proposal('Purée'))

      await userEvent.type(dish(), ' de ca')

      expect(dish()).toHaveValue('Purée de ca')
      await waitFor(() => expect(proposalLabels()).toEqual(['Purée de carottes']))
      expect(lastTextSent()).toBe('Purée de ca')
    })

    it('après un toucher, effacer au clavier ramène les plats récents', async () => {
      answerByText({ ...TABLE, '': { labels: ['Banane'], exactMatch: false } })
      renderForm()
      await userEvent.type(dish(), 'pur')
      await userEvent.click(await screen.findByRole('button', { name: 'Purée' }))

      await userEvent.clear(dish())

      await waitFor(() => expect(proposalLabels()).toEqual(['Banane']))
    })
  })

  describe('toucher la proposition déjà enfoncée ne change rien (D23-W)', () => {
    it('le texte tapé reste tel quel, la proposition reste enfoncée, la case reste cochée', async () => {
      answerByText({ 'yaourt nature': { labels: ['Yaourt nature'], exactMatch: false } })
      renderForm()
      await userEvent.type(dish(), 'yaourt  NATURE')
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))
      expect(proposal('Yaourt nature')).toHaveAttribute('aria-pressed', 'true')

      await userEvent.click(proposal('Yaourt nature'))
      await settle()

      expect(dish().value).toBe('yaourt  NATURE')
      expect(proposal('Yaourt nature')).toHaveAttribute('aria-pressed', 'true')
      expect(addBox()).toBeChecked()
    })

    it('une proposition choisie d’un toucher puis retouchée ne vide jamais le champ', async () => {
      answerByText({ pur: { labels: ['Purée'], exactMatch: false } })
      renderForm()
      await userEvent.type(dish(), 'pur')
      await userEvent.click(await screen.findByRole('button', { name: 'Purée' }))
      expect(proposal('Purée')).toHaveAttribute('aria-pressed', 'true')

      await userEvent.click(proposal('Purée'))

      expect(dish()).toHaveValue('Purée')
      expect(proposal('Purée')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('le libellé tapé est celui d’une proposition', () => {
    it('la proposition correspondante est enfoncée (casse, accents, espaces ignorés), sans case', async () => {
      answerByText({ 'yaourt nature': { labels: ['Yaourt nature'], exactMatch: true } })
      renderForm()

      await userEvent.type(dish(), 'yaourt  NATURE')

      await waitFor(() => expect(proposalLabels()).toEqual(['Yaourt nature']))
      expect(proposal('Yaourt nature')).toHaveAttribute('aria-pressed', 'true')
      await settle()
      expect(addBox()).toBeNull()
    })

    it('une proposition différente du champ n’est pas enfoncée', async () => {
      answerByText({ car: { labels: ['Carottes râpées'], exactMatch: false } })
      renderForm()

      await userEvent.type(dish(), 'car')

      expect(await screen.findByRole('button', { name: 'Carottes râpées' }))
        .toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('partager plus tard un plat récent', () => {
    it('un plat récent absent du référentiel : toucher la proposition offre la case, décochée, avec sa mention', async () => {
      answerByText({
        '': { labels: ['Pâtes au jambon'], exactMatch: false },
        'pates au jambon': { labels: ['Pâtes au jambon'], exactMatch: false },
      })
      renderForm()

      await userEvent.click(await screen.findByRole('button', { name: 'Pâtes au jambon' }))

      expect(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })).not.toBeChecked()
      expect(screen.getByText('Ce plat sera proposé à tous les utilisateurs')).toBeInTheDocument()
    })
  })
})

describe('SolidMealForm — case « Ajouter à mes plats » (US18.4, D18-AF/D18-AG, US23.1)', () => {
  const MENTION = 'Ce plat sera proposé à tous les utilisateurs'

  it('avant toute frappe : pas de case', async () => {
    renderForm()
    await waitFor(() => expect(getDishSuggestions).toHaveBeenCalled())

    expect(addBox()).toBeNull()
  })

  it('un plat libre inconnu du référentiel : case décochée + mention', async () => {
    getDishSuggestions.mockResolvedValue({ labels: [], exactMatch: false })
    renderForm()

    await userEvent.type(dish(), 'Gratin de courgettes')

    await waitFor(() => expect(addBox()).toBeInTheDocument())
    expect(addBox()).not.toBeChecked()
    expect(screen.getByText(MENTION)).toBeInTheDocument()
  })

  it('un plat déjà présent (exactMatch vrai) : pas de case', async () => {
    getDishSuggestions.mockResolvedValue({ labels: ['Purée de carottes'], exactMatch: true })
    renderForm()

    await userEvent.type(dish(), 'purée de carottes')

    await waitFor(() => expect(proposal('Purée de carottes')).toBeInTheDocument())
    await settle()
    expect(addBox()).toBeNull()
    expect(screen.queryByText(MENTION)).toBeNull()
  })

  it('« Compote » seul, comme tout plat : case décochée + mention, Enregistrer envoie addToDishes: false', async () => {
    answerByText({ compote: { labels: [], exactMatch: false } })
    const { onSubmit } = renderForm()

    await userEvent.type(dish(), 'Compote')

    expect(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })).not.toBeChecked()
    expect(screen.getByText(MENTION)).toBeInTheDocument()
    await userEvent.click(save())
    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), dish: 'Compote', portion: null, addToDishes: false,
    })
  })

  it('« Purée » peut être partagé : case cochée → addToDishes: true', async () => {
    answerByText({ puree: { labels: [], exactMatch: false } })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Purée')

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), dish: 'Purée', portion: null, addToDishes: true,
    })
  })

  it('recherche pendante : la case n’est pas proposée avant la réponse', async () => {
    getDishSuggestions.mockReturnValue(new Promise(() => {}))
    renderForm()

    await userEvent.type(dish(), 'Gratin')
    await waitFor(() => expect(getDishSuggestions).toHaveBeenCalled())

    expect(addBox()).toBeNull()
  })

  it('cochée : le corps envoyé porte addToDishes: true', async () => {
    getDishSuggestions.mockResolvedValue({ labels: [], exactMatch: false })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Gratin de courgettes')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))

    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), dish: 'Gratin de courgettes', portion: null, addToDishes: true,
    })
  })

  it('décochée (défaut) : addToDishes: false', async () => {
    getDishSuggestions.mockResolvedValue({ labels: [], exactMatch: false })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Gratin de courgettes')
    await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })

    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].addToDishes).toBe(false)
  })

  it('une case masquée n’envoie jamais true : cochée puis plat devenu existant → addToDishes: false', async () => {
    answerByText({ 'yaourt nature': { labels: ['Yaourt nature'], exactMatch: true } })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Yaourt')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))

    await userEvent.type(dish(), ' nature')
    await waitFor(() => expect(addBox()).toBeNull())
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].addToDishes).toBe(false)
  })

  it('cochée puis plat modifié vers un autre plat libre : la case réapparaît décochée (D18-Y)', async () => {
    getDishSuggestions.mockResolvedValue({ labels: [], exactMatch: false })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Yaourt')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))
    expect(addBox()).toBeChecked()

    await userEvent.type(dish(), ' vanille')
    await waitFor(() => expect(lastTextSent()).toBe('Yaourt vanille'))

    expect(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })).not.toBeChecked()
    await userEvent.click(save())
    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), dish: 'Yaourt vanille', portion: null, addToDishes: false,
    })
  })

  it('après un enregistrement réussi, la case revient décochée pour le plat suivant', async () => {
    getDishSuggestions.mockResolvedValue({ labels: [], exactMatch: false })
    renderForm()
    await userEvent.type(dish(), 'Gratin')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))
    await userEvent.click(save())
    await waitFor(() => expect(dish()).toHaveValue(''))

    await userEvent.type(dish(), 'Soupe')

    expect(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })).not.toBeChecked()
  })
})
