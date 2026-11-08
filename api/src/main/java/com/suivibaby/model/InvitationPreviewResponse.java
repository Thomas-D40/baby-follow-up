package com.suivibaby.model;

import java.time.Instant;

public record InvitationPreviewResponse(boolean needsPassword, String inviteeEmail, String inviterFirstName,
                                        String babyFirstName, Instant expiresAt) {
}
