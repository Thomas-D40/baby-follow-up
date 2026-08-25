package com.suivibaby.model;

import java.time.Instant;

public record CreateMedicalCareActRequest(Instant occurredAt, boolean withEye, boolean withNose) {
}
