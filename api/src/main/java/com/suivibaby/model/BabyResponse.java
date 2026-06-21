package com.suivibaby.model;

import java.time.LocalDate;
import java.util.UUID;

/** Baby projection exposed to the web layer (US1.5). {@code sex} serializes as "male"/"female"/null. */
public record BabyResponse(UUID id, String firstName, LocalDate birthDate, Sex sex) {
}
