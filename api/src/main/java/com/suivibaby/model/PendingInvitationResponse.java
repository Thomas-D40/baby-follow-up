package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

// No account-state field on purpose: the owner must not learn whether the recipient already had an account (D17-G).
public record PendingInvitationResponse(UUID token, String inviteeEmail, String inviteeFirstName,
                                        Instant expiresAt) {
}
