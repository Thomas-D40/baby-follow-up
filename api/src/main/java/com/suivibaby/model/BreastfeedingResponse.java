package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record BreastfeedingResponse(UUID id, Instant occurredAt, BreastSide side, Integer durationMinutes,
                                    UUID authorId) {
}
