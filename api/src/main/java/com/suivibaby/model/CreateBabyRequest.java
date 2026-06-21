package com.suivibaby.model;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

/**
 * Baby creation payload (US2.1). First name required ({@link NotBlank} rejects blank/whitespace
 * → 400); birth date and sex optional. An invalid {@code sex} value fails JSON deserialization → 400.
 */
public record CreateBabyRequest(@NotBlank String firstName, LocalDate birthDate, Sex sex) {
}
