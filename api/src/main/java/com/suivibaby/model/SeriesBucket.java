package com.suivibaby.model;

import jakarta.ws.rs.BadRequestException;

// Only granularity still served: the week/month BUCKET GRANULARITIES lost their only consumer when
// the yearly trends view was dropped (Épic 14) — the Semaine and Mois VIEWS are still there, and
// both request day buckets. The parameter stays required, and the switches over this enum stay
// exhaustive — the compiler would list every site to fill in should another granularity come back.
public enum SeriesBucket {
    day;

    public static SeriesBucket fromParam(String value) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException("Paramètre bucket requis (day).");
        }
        try {
            return SeriesBucket.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Paramètre bucket invalide (attendu day).");
        }
    }
}
