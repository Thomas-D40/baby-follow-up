package com.suivibaby.service;

import jakarta.ws.rs.BadRequestException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public record Cursor(Instant occurredAt, UUID id) {

    private static final String SEP = "|";

    public String encode() {
        String raw = occurredAt.toString() + SEP + id;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static Cursor decode(String token) {
        try {
            String raw = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            int sep = raw.indexOf(SEP);
            if (sep < 0) {
                throw new IllegalArgumentException("séparateur absent");
            }
            Instant occurredAt = Instant.parse(raw.substring(0, sep));
            UUID id = UUID.fromString(raw.substring(sep + 1));
            return new Cursor(occurredAt, id);
        } catch (IllegalArgumentException | java.time.DateTimeException e) {
            throw new BadRequestException("Curseur invalide.");
        }
    }
}
