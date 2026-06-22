package com.suivibaby.model;

import java.util.UUID;

public record MeResponse(UUID id, String email, String firstName, String role) {
}
