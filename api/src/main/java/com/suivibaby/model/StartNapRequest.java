package com.suivibaby.model;

import java.time.Instant;

/**
 * Charge de démarrage d'une sieste (US4.1, API use-case). {@code startAt} optionnel : défaut = now,
 * borné {@code now − 2 ans ≤ startAt ≤ now + 5 min} (D4-H). Pas de clé d'idempotence (D4-J / D3-A) ;
 * l'unicité « une seule ouverte » est garantie par l'index partiel (D4-C).
 */
public record StartNapRequest(Instant startAt) {
}
