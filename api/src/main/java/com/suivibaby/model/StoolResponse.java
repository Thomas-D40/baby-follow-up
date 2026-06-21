package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Projection d'une selle exposée au front (US5.1). {@code occurredAt} sérialisé en instant UTC
 * (affichage Europe/Paris = Épic 6). {@code authorId} = auteur traçant (D5-H).
 */
public record StoolResponse(UUID id, Instant occurredAt, StoolConsistency consistency, UUID authorId) {
}
