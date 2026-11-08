package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record MedicationResponse(UUID id, Instant occurredAt, String medicationName, String dosage,
                                 UUID authorId) {
}
