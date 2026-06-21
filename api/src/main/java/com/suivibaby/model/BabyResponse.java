package com.suivibaby.model;

import java.time.LocalDate;
import java.util.UUID;

/** Baby projection exposed to the web layer (US1.5). */
public record BabyResponse(UUID id, String firstName, LocalDate birthDate, String sex) {
}
