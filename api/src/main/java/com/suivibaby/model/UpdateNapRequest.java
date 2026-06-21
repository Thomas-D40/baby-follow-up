package com.suivibaby.model;

import java.time.Instant;

/**
 * Charge de correction d'une sieste (US4.3, API REST par id). Update partiel (PATCH) : seuls les
 * champs non-null sont appliqués (D4-F). {@code null} = champ <strong>inchangé</strong> → on ne peut
 * <strong>jamais</strong> vider {@code startAt}/{@code endAt} (donc pas de réouverture par PATCH).
 * Poser une fin sur une sieste ouverte est refusé (409) : fermer/rouvrir relève de l'API use-case.
 * Bornes : {@code startAt ≤ endAt ≤ now + 5 min}.
 */
public record UpdateNapRequest(Instant startAt, Instant endAt) {
}
