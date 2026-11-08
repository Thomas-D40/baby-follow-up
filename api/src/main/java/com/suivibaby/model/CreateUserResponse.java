package com.suivibaby.model;

import java.util.UUID;

public record CreateUserResponse(UUID userId, String activationLink, boolean mailSent) {

    public CreateUserResponse withMailSent(boolean mailSent) {
        return new CreateUserResponse(userId, activationLink, mailSent);
    }
}
