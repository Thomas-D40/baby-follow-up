package com.suivibaby.controller;

import com.suivibaby.model.MilkType;
import com.suivibaby.model.StoolConsistency;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

/**
 * US6.3 — totaux quotidiens (fast-follow, D6-F/G). Lait sommé, sommeil <strong>clippé</strong> à la
 * fenêtre du jour (la sieste 22h→8h compte 2h sur J / 8h sur J+1), sieste en cours comptée jusqu'à
 * {@code now()}, selles comptées. Mêmes bornes Paris et 404-vs-vide que US6.1.
 */
@QuarkusTest
class DailyTotalsTest {

    static final String PWD = "daily-totals-pwd-123";
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
    @DisplayName("Lait + selles")
    class MilkAndStool {

        @Test
        @DisplayName("Scénario : totalMilkMl = somme du jour, stoolCount = comptage")
        void lait_et_selles() {
            Caregiver c = linkedCaregiver("milk");
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 120, MilkType.formula);
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 12, 0), 80, MilkType.breast);
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0), StoolConsistency.soft);
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 16, 0), StoolConsistency.hard);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("date", is("2026-07-15"))
                    .body("totalMilkMl", is(200))
                    .body("stoolCount", is(2));
        }

        @Test
        @DisplayName("Scénario : journée sans biberon → totalMilkMl = 0")
        void aucun_biberon() {
            Caregiver c = linkedCaregiver("nomilk");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("totalMilkMl", is(0))
                    .body("totalSleepMinutes", is(0))
                    .body("stoolCount", is(0));
        }
    }

    @Nested
    @DisplayName("Sommeil clippé (D6-F/G)")
    class ClippedSleep {

        @Test
        @DisplayName("Scénario : sieste 22h→8h compte 2h sur J et 8h sur J+1")
        void clipping_cross_minuit() {
            Caregiver c = linkedCaregiver("clip");
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 22, 0), paris(2026, 7, 16, 8, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("totalSleepMinutes", is(120)); // 22h→minuit = 2h

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("totalSleepMinutes", is(480)); // minuit→8h = 8h
        }

        @Test
        @DisplayName("Scénario : journée sans sieste → totalSleepMinutes = 0")
        void aucune_sieste() {
            Caregiver c = linkedCaregiver("nosleep");
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 100, MilkType.formula);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("totalSleepMinutes", is(0));
        }

        @Test
        @DisplayName("Scénario : sieste en cours comptée jusqu'à now() (D6-G)")
        void sieste_en_cours_jusqu_a_now() {
            Caregiver c = linkedCaregiver("ongoing");
            // Démarrée il y a 30 min, jamais terminée → ~30 min clippés à [from, now()].
            Instant start = Instant.now().minus(30, ChronoUnit.MINUTES);
            data.createNap(c.babyId(), c.userId(), start, null);
            String today = LocalDate.now(PARIS).toString();

            // Tolérance : la durée exacte dépend de l'instant d'exécution (now()).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", today)
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("totalSleepMinutes", greaterThanOrEqualTo(25))
                    .body("totalSleepMinutes", lessThanOrEqualTo(35));
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
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", baby)
                    .then().statusCode(401);
        }
    }
}
