package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record UrineResponse(UUID id, Instant occurredAt, UUID authorId) {
}
