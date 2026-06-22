package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record BottleFeedingResponse(UUID id, Instant occurredAt, Integer quantityMl, MilkType milkType,
                                    UUID authorId) {
}
