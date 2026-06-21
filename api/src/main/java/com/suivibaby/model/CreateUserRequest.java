package com.suivibaby.model;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Parent account creation payload (US1.1). */
public record CreateUserRequest(@NotBlank @Email String email, @NotBlank String firstName) {
}
