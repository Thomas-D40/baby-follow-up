package com.suivibaby.controller;

import com.suivibaby.model.CareType;
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
import static org.hamcrest.Matchers.nullValue;

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
    @DisplayName("Urines (US13.2 Lot 3)")
    class UrineCount {

        @Test
        @DisplayName("Scénario : N urines dans la journée → urineCount = N")
        void plusieurs_urines() {
            Caregiver c = linkedCaregiver("urine-n");
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 8, 0));
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 12, 30));
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 20, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("date", is("2026-07-15"))
                    .body("urineCount", is(3));
        }

        @Test
        @DisplayName("Scénario : une seule urine → urineCount = 1")
        void une_urine() {
            Caregiver c = linkedCaregiver("urine-1");
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("urineCount", is(1));
        }

        @Test
        @DisplayName("Scénario : journée sans urine → urineCount = 0")
        void aucune_urine() {
            Caregiver c = linkedCaregiver("urine-0");
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0), StoolConsistency.soft);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("urineCount", is(0));
        }

        @Test
        @DisplayName("Scénario : bornes [from,to) Paris — une urine hors du jour n'est pas comptée")
        void urine_hors_jour_non_comptee() {
            Caregiver c = linkedCaregiver("urine-bornes");
            // Dans le jour : 00:00 Paris (borne basse inclusive).
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 0, 0));
            // Hors du jour : 00:00 Paris du J+1 (borne haute exclusive) → ne doit PAS compter sur J.
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 16, 0, 0));
            // Hors du jour : la veille à 23:30 Paris.
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 14, 23, 30));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("urineCount", is(1)); // seule celle de 00:00 le 15

            // La borne haute (00:00 du 16) est bien comptée sur J+1, pas perdue.
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("urineCount", is(1));
        }
    }

    @Nested
    @DisplayName("Maximum de température (US15.1, D15-K)")
    class MaxTemperature {

        @Test
        @DisplayName("Scénario : deux mesures 37,2 puis 38,4 → maxTemperatureCelsiusX10 = 384 (le MAXIMUM)")
        void deux_mesures_le_maximum() {
            Caregiver c = linkedCaregiver("temp-max");
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 372);
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 18, 0), 384);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("date", is("2026-07-15"))
                    // Ni la dernière saisie (384 ici l'est par hasard, cf. le test suivant), ni un
                    // comptage (qui vaudrait 2) : le PIC de la journée.
                    .body("maxTemperatureCelsiusX10", is(384));
        }

        @Test
        @DisplayName("Scénario : le maximum n'est pas la dernière mesure — 38,4 puis 37,2 → 384")
        void le_maximum_pas_la_derniere() {
            Caregiver c = linkedCaregiver("temp-order");
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 384);
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 18, 0), 372);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("maxTemperatureCelsiusX10", is(384));
        }

        @Test
        @DisplayName("Scénario : journée sans mesure → maxTemperatureCelsiusX10 = null (jamais 0)")
        void aucune_mesure_null() {
            Caregiver c = linkedCaregiver("temp-none");
            // Journée peuplée d'autres événements : c'est bien l'ABSENCE de mesure qui produit le null.
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("urineCount", is(1))
                    // Garde-fou de D15-K : une absence de mesure n'est pas un zéro. Le front ne doit
                    // rendre AUCUNE chip 🌡 — ni 0, ni tiret. Ne « corrigez » jamais ce null en 0.
                    .body("maxTemperatureCelsiusX10", nullValue());
        }

        @Test
        @DisplayName("Scénario : bornes [from,to) Paris — une mesure hors du jour n'entre pas dans le maximum")
        void mesure_hors_jour_hors_maximum() {
            Caregiver c = linkedCaregiver("temp-bornes");
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 0, 0), 371);
            // Borne haute exclusive : 00:00 du 16 compte sur J+1, pas sur J, même si sa valeur est plus haute.
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 16, 0, 0), 402);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("maxTemperatureCelsiusX10", is(371));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("maxTemperatureCelsiusX10", is(402));
        }
    }

    @Nested
    @DisplayName("Comptages de soins (US15.2, D15-K)")
    class MedicalCareCounts {

        @Test
        @DisplayName("Scénario : 2 yeux + 3 nez le même jour → eyeCareCount = 2 et noseCareCount = 3")
        void comptages_distincts_par_type() {
            Caregiver c = linkedCaregiver("care-counts");
            data.createMedicalCare(c.babyId(), c.userId(), CareType.eye, paris(2026, 7, 15, 8, 0));
            data.createMedicalCare(c.babyId(), c.userId(), CareType.eye, paris(2026, 7, 15, 20, 0));
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 15, 9, 0));
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 15, 13, 0));
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 15, 19, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    // Deux chips distinctes = deux comptages indépendants, jamais un total de 5.
                    .body("eyeCareCount", is(2))
                    .body("noseCareCount", is(3));
        }

        @Test
        @DisplayName("Scénario : des soins des yeux seuls laissent noseCareCount à 0 (indépendance des types)")
        void independance_des_types() {
            Caregiver c = linkedCaregiver("care-eye-only");
            data.createMedicalCare(c.babyId(), c.userId(), CareType.eye, paris(2026, 7, 15, 8, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("eyeCareCount", is(1))
                    .body("noseCareCount", is(0));
        }

        @Test
        @DisplayName("Scénario : journée sans soin → comptages à 0, et non null (contrairement au maximum)")
        void aucun_soin_zero_pas_null() {
            Caregiver c = linkedCaregiver("care-none");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    // Un comptage à 0 EST une information (« aucun lavage de nez aujourd'hui ») ;
                    // un maximum à 0 serait un mensonge (0 °C) — d'où l'asymétrie assumée.
                    .body("eyeCareCount", is(0))
                    .body("noseCareCount", is(0))
                    .body("maxTemperatureCelsiusX10", nullValue());
        }

        @Test
        @DisplayName("Scénario : bornes [from,to) Paris — un soin hors du jour n'est pas compté")
        void soin_hors_jour_non_compte() {
            Caregiver c = linkedCaregiver("care-bornes");
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 15, 0, 0));
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 16, 0, 0));
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 14, 23, 30));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("noseCareCount", is(1));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200).body("noseCareCount", is(1));
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
        @DisplayName("Scénario : bébé non lié PORTANT température et soins → 404, aucune donnée médicale ne fuit")
        void bebe_non_lie_temperature_et_soins() {
            // Non-régression de bout en bout : la présence de données médicales ne change rien au 404.
            // ⚠ Ce test ne PROUVE pas le requireLinked de maxForDay / countForDay : le 404 remonte du
            // premier délégué appelé (bottleFeedingService). C'est MedicalReadIsolationTest, qui appelle
            // les services directement, qui verrouille ces gardes-là.
            Caregiver c = linkedCaregiver("iso-med");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim-med"), PWD);
            UUID autrui = data.createBaby("AutruiMédical");
            data.link(otherUser, autrui);
            data.createTemperature(autrui, otherUser, paris(2026, 7, 15, 9, 0), 391);
            data.createMedicalCare(autrui, otherUser, CareType.eye, paris(2026, 7, 15, 10, 0));

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
