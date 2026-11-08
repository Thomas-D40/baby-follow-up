package com.suivibaby.model;

import java.time.Instant;

public record UpdateMedicationRequest(Instant occurredAt, String medicationName, String dosage) {
}
