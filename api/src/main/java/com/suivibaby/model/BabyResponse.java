package com.suivibaby.model;

import java.time.LocalDate;
import java.util.UUID;

public record BabyResponse(UUID id, String firstName, LocalDate birthDate, Sex sex) {
}
