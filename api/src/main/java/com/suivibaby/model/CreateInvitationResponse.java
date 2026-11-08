package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

// Response to the emission of a sharing invitation: same keys whether the account was created or not (D17-G).
public record CreateInvitationResponse(UUID token, String link, String inviteeEmail, Instant expiresAt,
                                       boolean mailSent) {

    public CreateInvitationResponse withMailSent(boolean mailSent) {
        return new CreateInvitationResponse(token, link, inviteeEmail, expiresAt, mailSent);
    }
}
