package com.suivibaby.model;

import java.time.Instant;

/**
 * Charge d'édition d'une selle (D5-B). Update partiel (PATCH) : seuls les champs non-null sont
 * appliqués (mêmes bornes qu'à la création, D5-D). Une {@code consistency} hors enum échoue à la
 * désérialisation JSON → 400. NB : {@code null} = champ inchangé (on ne re-vide pas une consistance
 * déjà posée, cohérent avec l'édition biberon). API only — non câblée en UI v1 (D5-J).
 */
public record UpdateStoolRequest(Instant occurredAt, StoolConsistency consistency) {
}
