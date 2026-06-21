package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Projection d'un biberon exposée au front (US3.1). {@code occurredAt} sérialisé en instant UTC
 * (affichage Europe/Paris = Épic 6). {@code authorId} = auteur traçant (D3-I).
 */
public record BottleFeedingResponse(UUID id, Instant occurredAt, Integer quantityMl, MilkType milkType,
                                    UUID authorId) {
}
