package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record StoolResponse(UUID id, Instant occurredAt, StoolConsistency consistency, UUID authorId) {
}
