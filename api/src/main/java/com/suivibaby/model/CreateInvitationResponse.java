package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

/** Réponse à l'émission d'une invitation de partage (Épic 8, D8-B/C). */
public record CreateInvitationResponse(UUID token, String link, Instant expiresAt) {
}
