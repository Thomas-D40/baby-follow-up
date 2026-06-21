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
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;

/**
 * US6.1 — événements d'un jour (lecture seule, D6-A à D6-H). Un {@code @Nested} par cible d'AC (§4 du
 * plan). L'enjeu est la <strong>correction de lecture</strong> : frontières DST (été + hiver),
 * semi-ouvert à minuit (D6-C), overlap de sieste cross-minuit (D6-F), sieste en cours (D6-G), tri par
 * heure, 404-vs-vide (D6-E), IDOR (US1.5). Les bornes sont seedées via {@code ZonedDateTime} en
 * Europe/Paris pour matérialiser le bon offset de la saison.
 */
@QuarkusTest
class CalendarEventsTest {

    static final String PWD = "calendar-events-pwd-123";
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
    @DisplayName("Frontières de jour (DST) — D6-C/D6-D, R2")
    class DayBoundaries {

        @Test
        @DisplayName("Scénario : biberon à 23h30 Paris un jour d'ÉTÉ (offset +02:00) → bon jour")
        void biberon_2330_ete() {
            Caregiver c = linkedCaregiver("dst-summer");
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 23, 30), 120, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(1))
                    .body("[0].type", is("bottle_feeding"));

            // Pas sur le jour suivant.
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : le MÊME test un jour d'HIVER (offset +01:00) → bon jour")
        void biberon_2330_hiver() {
            Caregiver c = linkedCaregiver("dst-winter");
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 1, 15, 23, 30), 120, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-01-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-01-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : événement à 00:00:00 Paris pile → appartient au NOUVEAU jour, pas au précédent")
        void minuit_semi_ouvert() {
            Caregiver c = linkedCaregiver("midnight");
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 0, 0), StoolConsistency.soft);

            // [from, to) : 00:00 appartient à J (borne basse inclusive).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1));

            // …et PAS à J−1 (borne haute exclusive → pas de double-comptage à minuit).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-14")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }
    }

    @Nested
    @DisplayName("Sieste à cheval sur minuit — overlap (D6-C/D6-F)")
    class CrossMidnightNap {

        @Test
        @DisplayName("Scénario : sieste 22h(J)→08h(J+1) présente sur J ET J+1, absente de J−1")
        void sieste_nuit_sur_deux_jours() {
            Caregiver c = linkedCaregiver("crossnap");
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 22, 0), paris(2026, 7, 16, 8, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1)).body("[0].type", is("nap"));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1)).body("[0].type", is("nap"));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-14")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : sieste entièrement dans J n'apparaît pas sur J−1/J+1")
        void sieste_dans_le_jour() {
            Caregiver c = linkedCaregiver("innap");
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 13, 0), paris(2026, 7, 15, 14, 30));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-14")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }
    }

    @Nested
    @DisplayName("Sieste en cours (end_at NULL) — D6-G")
    class OngoingNap {

        @Test
        @DisplayName("Scénario : sieste ouverte démarrée hier apparaît AUSSI aujourd'hui, endAt null")
        void sieste_ouverte_hier_visible_aujourdhui() {
            Caregiver c = linkedCaregiver("ongoing");
            String today = LocalDate.now(PARIS).toString();
            String yesterday = LocalDate.now(PARIS).minusDays(1).toString();
            // Démarrée hier 23h Paris, jamais terminée (overlap couvre tous les jours depuis).
            Instant startedYesterday = LocalDate.now(PARIS).minusDays(1).atTime(23, 0).atZone(PARIS).toInstant();
            data.createNap(c.babyId(), c.userId(), startedYesterday, null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", today)
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(1))
                    .body("[0].type", is("nap"))
                    .body("[0].endAt", nullValue());

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", yesterday)
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1));
        }
    }

    @Nested
    @DisplayName("GET /events — tri, contenu, date")
    class ListBehaviour {

        @Test
        @DisplayName("Scénario : biberons + siestes + selles → triés par heure ASC, types corrects")
        void journee_mixte_triee() {
            Caregiver c = linkedCaregiver("mixed");
            // Désordre d'insertion volontaire ; tri attendu : 08:00 nap, 09:00 bottle, 10:00 stool.
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0), StoolConsistency.liquid);
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 150, MilkType.breast);
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 8, 0), paris(2026, 7, 15, 8, 45));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("type", contains("nap", "bottle_feeding", "stool"))
                    .body("[1].quantityMl", is(150))
                    .body("[2].consistency", is("liquid"));
        }

        @Test
        @DisplayName("Scénario : journée vide + bébé lié → 200 liste vide")
        void journee_vide() {
            Caregiver c = linkedCaregiver("empty");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : date absente → aujourd'hui (Paris), 200")
        void date_absente_defaut_aujourdhui() {
            Caregiver c = linkedCaregiver("today");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200);
        }

        @Test
        @DisplayName("Scénario : date malformée → 400")
        void date_malformee() {
            Caregiver c = linkedCaregiver("baddate");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "15-07-2026")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(400);
        }
    }

    @Nested
    @DisplayName("Isolation (US1.5 / D6-E)")
    class Isolation {

        @Test
        @DisplayName("Scénario : bébé non lié → 404 (pas 403, pas 200 vide)")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("iso");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : accès croisé — A lié à B1 demande /babies/{B2}/events → 404, ne voit rien")
        void acces_croise() {
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            data.createBottleFeeding(b2, otherUser, paris(2026, 7, 15, 9, 0), 100, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", b2)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", baby)
                    .then().statusCode(401);
        }
    }
}
