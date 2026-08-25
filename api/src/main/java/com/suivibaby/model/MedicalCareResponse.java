package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record MedicalCareResponse(UUID id, Instant occurredAt, CareType careType, UUID authorId) {
}
