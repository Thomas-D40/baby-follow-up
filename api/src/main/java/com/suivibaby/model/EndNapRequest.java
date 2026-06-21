package com.suivibaby.model;

import java.time.Instant;

/**
 * Charge de fin d'une sieste (US4.2, API use-case). {@code endAt} optionnel : défaut = now, borné
 * {@code startAt ≤ endAt ≤ now + 5 min} (D4-H). Le serveur cible la sieste ouverte du bébé ; aucune
 * ouverte → 409 (D4-D).
 */
public record EndNapRequest(Instant endAt) {
}
