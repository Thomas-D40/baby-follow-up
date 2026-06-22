package com.suivibaby.model;

import jakarta.validation.constraints.NotBlank;

public record ActivationRequest(@NotBlank String token, @NotBlank String password) {
}
