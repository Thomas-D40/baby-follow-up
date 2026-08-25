package com.suivibaby.controller;

import com.suivibaby.model.MilkType;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;

/**
 * Série temporelle agrégée (vue tendances) : {@code GET …/totals-series?from&to&bucket}. Buckets
 * Paris {@code [from, to)}, clipping sieste par bucket (mêmes règles que les totaux quotidiens),
 * 404 défensif et 400 sur paramètres invalides.
 */
@QuarkusTest
class TotalsSeriesTest {

    static final String PWD = "totals-series-pwd-123";
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    @Inject
    TestDataFactory data;

    private record Caregiver(UUID userId, UUID babyId, String cookie) {
    }

    private Caregiver linkedCaregiver(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID userId = data.createActiveParent(email, PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(userId, babyId);
        String cookie = AuthFixture.loginCookie(email, PWD);
        return new Caregiver(userId, babyId, cookie);
    }

    private static Instant paris(int y, int mo, int d, int h, int mi) {
        return ZonedDateTime.of(y, mo, d, h, mi, 0, 0, PARIS).toInstant();
    }

    @Nested
    @DisplayName("Buckets jour")
    class DayBuckets {

        @Test
        @DisplayName("Scénario : une semaine en buckets jour → 7 points datés, comptages par jour")
        void semaine_en_jours() {
            Caregiver c = linkedCaregiver("week");
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 6, 15, 9, 0), 120, MilkType.formula);
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 6, 15, 13, 0), 80, MilkType.breast);
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 6, 17, 8, 0), 100, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2026-06-15")
                    .queryParam("to", "2026-06-21")
                    .queryParam("bucket", "day")
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(200)
                    // Forme de la réponse : { from, to, points } — le champ `bucket` a été purgé
                    // du contrat (Épic 14, D14-Q), sa réapparition doit rougir ici.
                    .body("bucket", nullValue())
                    .body("from", is("2026-06-15"))
                    .body("to", is("2026-06-21"))
                    .body("points.size()", is(7))
                    .body("points[0].date", is("2026-06-15"))
                    .body("points[0].totalMilkMl", is(200))
                    .body("points[2].date", is("2026-06-17"))
                    .body("points[2].totalMilkMl", is(100))
                    .body("points[1].totalMilkMl", is(0));
        }

        @Test
        @DisplayName("Scénario : sieste 22h→8h clippée à 2h (J) et 8h (J+1) sur deux points adjacents")
        void clipping_cross_minuit() {
            Caregiver c = linkedCaregiver("clip");
            data.createNap(c.babyId(), c.userId(), paris(2026, 6, 15, 22, 0), paris(2026, 6, 16, 8, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2026-06-15")
                    .queryParam("to", "2026-06-16")
                    .queryParam("bucket", "day")
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(200)
                    .body("points.size()", is(2))
                    .body("points[0].totalSleepMinutes", is(120))
                    .body("points[1].totalSleepMinutes", is(480));
        }
    }

    @Nested
    @DisplayName("Validation des paramètres")
    class Validation {

        @ParameterizedTest(name = "bucket={0} → 400")
        @ValueSource(strings = {"year", "month", "week"})
        @DisplayName("Scénario : bucket invalide → 400 (les granularités retirées incluses)")
        void bucket_invalide(String bucket) {
            Caregiver c = linkedCaregiver("badbucket");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2026-06-15").queryParam("to", "2026-06-21").queryParam("bucket", bucket)
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bucket manquant → 400 (le paramètre reste requis)")
        void bucket_manquant() {
            Caregiver c = linkedCaregiver("nobucket");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2026-06-15").queryParam("to", "2026-06-21")
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bucket vide → 400")
        void bucket_vide() {
            Caregiver c = linkedCaregiver("emptybucket");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2026-06-15").queryParam("to", "2026-06-21").queryParam("bucket", "")
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : from manquant → 400")
        void from_manquant() {
            Caregiver c = linkedCaregiver("nofrom");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("to", "2026-06-21").queryParam("bucket", "day")
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : to antérieur à from → 400")
        void to_avant_from() {
            Caregiver c = linkedCaregiver("badrange");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2026-06-21").queryParam("to", "2026-06-15").queryParam("bucket", "day")
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : plage trop large en buckets jour → 400")
        void plage_trop_large() {
            Caregiver c = linkedCaregiver("toobig");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2024-01-01").queryParam("to", "2026-12-31").queryParam("bucket", "day")
                    .when().get("/api/babies/{babyId}/totals-series", c.babyId())
                    .then().statusCode(400);
        }
    }

    @Nested
    @DisplayName("Isolation (US1.5 / D6-E)")
    class Isolation {

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("iso");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("from", "2026-06-15").queryParam("to", "2026-06-21").queryParam("bucket", "day")
                    .when().get("/api/babies/{babyId}/totals-series", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().queryParam("from", "2026-06-15").queryParam("to", "2026-06-21").queryParam("bucket", "day")
                    .when().get("/api/babies/{babyId}/totals-series", baby)
                    .then().statusCode(401);
        }
    }
}
