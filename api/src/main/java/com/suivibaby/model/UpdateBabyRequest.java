package com.suivibaby.model;

import java.time.LocalDate;

public record UpdateBabyRequest(String firstName, LocalDate birthDate, Sex sex) {
}
