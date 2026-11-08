package com.suivibaby.model;

import java.time.Instant;

public record CreateMedicationRequest(Instant occurredAt, String medicationName, String dosage) {
}
