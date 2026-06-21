package com.suivibaby.model;

import jakarta.validation.constraints.NotBlank;

/** Account activation payload (US1.2). */
public record ActivationRequest(@NotBlank String token, @NotBlank String password) {
}
