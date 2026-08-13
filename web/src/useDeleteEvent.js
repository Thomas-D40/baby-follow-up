import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteBottleFeeding, deleteNap, deleteStool, deleteUrine } from './api'

// Routage type d'événement → client de suppression (Épic 7, D7-B). Les 3 clients partagent le contrat
// `delete(babyId, id)`. Le calendrier mêle les types sur une même liste, d'où le routage par appel
// plutôt que par construction du hook.
const DELETE_CLIENT = {
  bottle_feeding: deleteBottleFeeding,
  nap: deleteNap,
  stool: deleteStool,
  urine: deleteUrine,
}

/**
 * Hook de suppression mutualisé (Épic 7, D7-B/D7-C) : le **vrai** primitif partagé entre les panels de
 * la fiche bébé et le calendrier. `mutate({ type, id })` route vers le bon client.
 *
 * - `retry: 0` : pas de rejeu auto qui masquerait une réponse perdue (cohérent D3-G/D4-K/D5-J).
 * - **404 = succès idempotent** (D7-C) : l'événement est déjà supprimé → on rafraîchit **sans** erreur.
 *   Seuls `401/403/500` remontent en erreur (R3) — ne jamais avaler tout échec.
 * - **Invalidation par préfixe** `['babies', babyId]` au succès : couvre en un appel **toutes** les
 *   sous-clés (`events`, `daily-totals`, les 3 listes de panels, `nap-current`) → vues cohérentes
 *   inter-surfaces (D7-C, R1) sans que la vue déclenchante connaisse la `date` de l'autre.
 */
export function useDeleteEvent(babyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ type, id }) => {
      try {
        await DELETE_CLIENT[type](babyId, id)
      } catch (err) {
        if (err?.status === 404) return // 404 = succès idempotent (D7-C)
        throw err // 401/403/500 restent des erreurs (R3)
      }
    },
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['babies', babyId] }),
  })
}
