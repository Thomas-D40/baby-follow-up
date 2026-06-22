package com.suivibaby.model;

import java.util.UUID;

public record CreateUserResponse(UUID userId, String activationLink) {
}
