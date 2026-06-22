package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record NapResponse(UUID id, Instant startAt, Instant endAt, UUID authorId) {
}
