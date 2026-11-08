package com.suivibaby.service;

import jakarta.ws.rs.BadRequestException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

// createdAt is only carried by lists that break equal times on entry order (breastfeeding, US18.2);
// the other lists keep the two-part token.
public record Cursor(Instant occurredAt, Instant createdAt, UUID id) {

    private static final String SEP = "|";

    public Cursor(Instant occurredAt, UUID id) {
        this(occurredAt, null, id);
    }

    public String encode() {
        String raw = createdAt == null
                ? occurredAt + SEP + id
                : occurredAt + SEP + createdAt + SEP + id;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static Cursor decode(String token) {
        try {
            String raw = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            String[] parts = raw.split("\\" + SEP, -1);
            if (parts.length < 2 || parts.length > 3) {
                throw new IllegalArgumentException("séparateur absent");
            }
            Instant occurredAt = Instant.parse(parts[0]);
            Instant createdAt = parts.length == 3 ? Instant.parse(parts[1]) : null;
            UUID id = UUID.fromString(parts[parts.length - 1]);
            return new Cursor(occurredAt, createdAt, id);
        } catch (IllegalArgumentException | java.time.DateTimeException e) {
            throw new BadRequestException("Curseur invalide.");
        }
    }
}
