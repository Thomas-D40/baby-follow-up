package com.suivibaby.model;

import jakarta.ws.rs.BadRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

// Pure unit test (no Quarkus) of the only granularity still accepted. The HTTP suite asserts the
// 400 status; the message lives here because there is no ExceptionMapper in main — a rejected
// bucket never carries its message into the response body.
class SeriesBucketTest {

    @Test
    @DisplayName("day est la seule valeur acceptée")
    void day_seule_valeur_acceptee() {
        assertEquals(SeriesBucket.day, SeriesBucket.fromParam("day"));
        assertEquals(1, SeriesBucket.values().length);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    @DisplayName("bucket absent ou vide → 400, message ne citant que day")
    void bucket_requis(String value) {
        BadRequestException e = assertThrows(BadRequestException.class, () -> SeriesBucket.fromParam(value));
        assertEquals("Paramètre bucket requis (day).", e.getMessage());
    }

    @ParameterizedTest
    @ValueSource(strings = {"month", "week", "year", "Day", "bogus"})
    @DisplayName("granularités retirées et valeurs inconnues → 400, message ne citant que day")
    void bucket_invalide(String value) {
        BadRequestException e = assertThrows(BadRequestException.class, () -> SeriesBucket.fromParam(value));
        assertEquals("Paramètre bucket invalide (attendu day).", e.getMessage());
    }
}
