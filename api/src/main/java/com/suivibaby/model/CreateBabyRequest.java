package com.suivibaby.model;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public record CreateBabyRequest(@NotBlank String firstName, LocalDate birthDate, Sex sex) {
}
