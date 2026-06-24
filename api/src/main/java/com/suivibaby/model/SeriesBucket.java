package com.suivibaby.model;

import jakarta.ws.rs.BadRequestException;

public enum SeriesBucket {
    day,
    week,
    month;

    public static SeriesBucket fromParam(String value) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException("Paramètre bucket requis (day, week ou month).");
        }
        try {
            return SeriesBucket.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Paramètre bucket invalide (attendu day, week ou month).");
        }
    }
}
