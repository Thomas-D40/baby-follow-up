package com.suivibaby.model;

import java.time.Instant;

/**
 * Charge d'édition d'un biberon (D3-B). Update partiel (PATCH) : seuls les champs non-null sont
 * appliqués (mêmes bornes qu'à la création, D3-D/D3-E). Un {@code milkType} hors enum échoue à la
 * désérialisation JSON → 400. NB : {@code null} = champ inchangé (on ne re-vide pas {@code milkType},
 * cohérent avec l'édition bébé).
 */
public record UpdateBottleFeedingRequest(Instant occurredAt, Integer quantityMl, MilkType milkType) {
}
