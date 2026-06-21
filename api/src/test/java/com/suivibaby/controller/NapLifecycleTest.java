package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Cycle de vie + correction des siestes (US4.1/4.2/4.3) sous le filtre d'appartenance. Un {@code @Nested}
 * par cible d'AC (cf. §4 du plan Épic 4). API use-case (start/end/reopen) + REST (current/list/patch/delete).
 * Jalon IDOR (D4-G/D3-C/US1.5) : sieste d'un autre bébé / bébé non lié → 404 ; pas de session → 401.
 */
@QuarkusTest
class NapLifecycleTest {

    static final String PWD = "nap-lifecycle-pwd-123";

    @Inject
    TestDataFactory data;

    private static Map<String, Object> body(String key, Object value) {
        Map<String, Object> m = new HashMap<>();
        m.put(key, value);
        return m;
    }

    private static Map<String, Object> times(Object startAt, Object endAt) {
        Map<String, Object> m = new HashMap<>();
        m.put("startAt", startAt);
        m.put("endAt", endAt);
        return m;
    }

    private record Caregiver(UUID userId, UUID babyId, String cookie) {
    }

    private Caregiver linkedCaregiver(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID userId = data.createActiveParent(email, PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(userId, babyId);
        return new Caregiver(userId, babyId, AuthFixture.loginCookie(email, PWD));
    }

    private String start(Caregiver c, Object startAt) {
        return given().cookie(AuthFixture.COOKIE, c.cookie())
                .contentType(ContentType.JSON).body(body("startAt", startAt))
                .when().post("/api/babies/{babyId}/naps/start", c.babyId())
                .then().statusCode(201).extract().path("id");
    }

    @Nested
    @DisplayName("POST /api/babies/{babyId}/naps/start")
    class Start {

        @Test
        @DisplayName("Scénario : démarrage réussi → 201, end_at null, author_id = courant, start_at défaut = now")
        void demarrage_reussi() {
            Caregiver c = linkedCaregiver("starter");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("startAt", null))
                    .when().post("/api/babies/{babyId}/naps/start", c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("startAt", notNullValue())
                    .body("endAt", nullValue())
                    .body("authorId", is(c.userId().toString()));
            assertEquals(1, data.countNap(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : une sieste est déjà en cours → 409")
        void deja_en_cours() {
            Caregiver c = linkedCaregiver("starter");
            start(c, null);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("startAt", null))
                    .when().post("/api/babies/{babyId}/naps/start", c.babyId())
                    .then().statusCode(409);
            assertEquals(1, data.countNap(c.babyId())); // pas de 2ᵉ sieste ouverte
        }

        @Test
        @DisplayName("Scénario : start_at futur > +5min → 400")
        void start_at_futur() {
            Caregiver c = linkedCaregiver("starter");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(body("startAt", Instant.now().plus(10, ChronoUnit.MINUTES).toString()))
                    .when().post("/api/babies/{babyId}/naps/start", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : start_at < now − 2 ans → 400")
        void start_at_trop_ancien() {
            Caregiver c = linkedCaregiver("starter");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(body("startAt", Instant.now().minus(800, ChronoUnit.DAYS).toString()))
                    .when().post("/api/babies/{babyId}/naps/start", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("starter");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("startAt", null))
                    .when().post("/api/babies/{babyId}/naps/start", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON).body(body("startAt", null))
                    .when().post("/api/babies/{babyId}/naps/start", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("POST /api/babies/{babyId}/naps/end")
    class End {

        @Test
        @DisplayName("Scénario : fin réussie → 200, end_at posée")
        void fin_reussie() {
            Caregiver c = linkedCaregiver("ender");
            start(c, Instant.now().minus(1, ChronoUnit.HOURS).toString());
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("endAt", null))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId())
                    .then().statusCode(200)
                    .body("endAt", notNullValue());
        }

        @Test
        @DisplayName("Scénario : aucune sieste en cours → 409")
        void aucune_en_cours() {
            Caregiver c = linkedCaregiver("ender");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("endAt", null))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId())
                    .then().statusCode(409);
        }

        @Test
        @DisplayName("Scénario : double-fin séquentielle → 1ʳᵉ 200, 2ᵉ 409")
        void double_fin() {
            Caregiver c = linkedCaregiver("ender");
            start(c, Instant.now().minus(1, ChronoUnit.HOURS).toString());
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("endAt", null))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId()).then().statusCode(200);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("endAt", null))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId()).then().statusCode(409);
        }

        @Test
        @DisplayName("Scénario : end_at < start_at → 400")
        void fin_avant_debut() {
            Caregiver c = linkedCaregiver("ender");
            start(c, Instant.now().minus(1, ChronoUnit.HOURS).toString());
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(body("endAt", Instant.now().minus(2, ChronoUnit.HOURS).toString()))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : end_at futur > +5min → 400")
        void fin_futur() {
            Caregiver c = linkedCaregiver("ender");
            start(c, null);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(body("endAt", Instant.now().plus(10, ChronoUnit.MINUTES).toString()))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId())
                    .then().statusCode(400);
        }
    }

    @Nested
    @DisplayName("POST /api/babies/{babyId}/naps/reopen")
    class Reopen {

        @Test
        @DisplayName("Scénario : réouverture après une fin → 200, end_at null")
        void reouverture_reussie() {
            Caregiver c = linkedCaregiver("reopener");
            start(c, Instant.now().minus(1, ChronoUnit.HOURS).toString());
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("endAt", null))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId()).then().statusCode(200);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().post("/api/babies/{babyId}/naps/reopen", c.babyId())
                    .then().statusCode(200).body("endAt", nullValue());
        }

        @Test
        @DisplayName("Scénario : une sieste déjà ouverte → 409")
        void deja_ouverte() {
            Caregiver c = linkedCaregiver("reopener");
            start(c, null);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().post("/api/babies/{babyId}/naps/reopen", c.babyId())
                    .then().statusCode(409);
        }

        @Test
        @DisplayName("Scénario : aucune sieste à rouvrir → 409")
        void aucune_a_rouvrir() {
            Caregiver c = linkedCaregiver("reopener");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().post("/api/babies/{babyId}/naps/reopen", c.babyId())
                    .then().statusCode(409);
        }

        @Test
        @DisplayName("Scénario : reopen rouvre bien LA DERNIÈRE sieste (la plus récente par start_at)")
        void rouvre_la_derniere() {
            Caregiver c = linkedCaregiver("reopener");
            Instant base = Instant.now().minus(5, ChronoUnit.HOURS);
            data.createNap(c.babyId(), c.userId(), base, base.plus(30, ChronoUnit.MINUTES)); // ancienne
            UUID recent = data.createNap(c.babyId(), c.userId(),
                    base.plus(2, ChronoUnit.HOURS), base.plus(3, ChronoUnit.HOURS));         // la dernière

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().post("/api/babies/{babyId}/naps/reopen", c.babyId())
                    .then().statusCode(200).body("id", is(recent.toString()));

            // la sieste courante (end_at null) est bien la plus récente
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/naps/current", c.babyId())
                    .then().statusCode(200).body("id", is(recent.toString()));
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/naps/current")
    class Current {

        @Test
        @DisplayName("Scénario : sieste ouverte → 200")
        void ouverte_200() {
            Caregiver c = linkedCaregiver("current");
            start(c, null);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/naps/current", c.babyId())
                    .then().statusCode(200).body("endAt", nullValue());
        }

        @Test
        @DisplayName("Scénario : aucune sieste ouverte → 204")
        void aucune_204() {
            Caregiver c = linkedCaregiver("current");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/naps/current", c.babyId())
                    .then().statusCode(204);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void non_lie_404() {
            Caregiver c = linkedCaregiver("current");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/naps/current", autrui)
                    .then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/naps (keyset)")
    class ListKeyset {

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée start_at DESC + page suivante via before (ni saut ni chevauchement)")
        void pagination() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(5, ChronoUnit.HOURS);
            data.createNap(c.babyId(), c.userId(), base, base.plus(20, ChronoUnit.MINUTES));
            data.createNap(c.babyId(), c.userId(), base.plus(1, ChronoUnit.HOURS), base.plus(80, ChronoUnit.MINUTES));
            data.createNap(c.babyId(), c.userId(), base.plus(2, ChronoUnit.HOURS), null); // la plus récente, ouverte

            String nextCursor = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .when().get("/api/babies/{babyId}/naps", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(2))
                    .body("items[0].endAt", nullValue()) // la plus récente d'abord
                    .body("nextCursor", notNullValue())
                    .extract().path("nextCursor");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2).queryParam("before", nextCursor)
                    .when().get("/api/babies/{babyId}/naps", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(1))
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : before malformé → 400")
        void before_malforme() {
            Caregiver c = linkedCaregiver("lister");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("before", "pas-un-curseur")
                    .when().get("/api/babies/{babyId}/naps", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void non_lie_404() {
            Caregiver c = linkedCaregiver("lister");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/naps", autrui)
                    .then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/naps/{id}")
    class UpdateDelete {

        @Test
        @DisplayName("Scénario : correction start_at/end_at d'une sieste terminée → 200")
        void correction_sieste_terminee() {
            Caregiver c = linkedCaregiver("editor");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID nap = data.createNap(c.babyId(), c.userId(), base, base.plus(1, ChronoUnit.HOURS));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(times(base.plus(10, ChronoUnit.MINUTES).toString(),
                            base.plus(70, ChronoUnit.MINUTES).toString()))
                    .when().patch("/api/babies/{babyId}/naps/{id}", c.babyId(), nap)
                    .then().statusCode(200).body("endAt", notNullValue());
        }

        @Test
        @DisplayName("Scénario : PATCH endAt sur une sieste ouverte → 409 (fermeture = use-case)")
        void patch_end_sur_sieste_ouverte() {
            Caregiver c = linkedCaregiver("editor");
            UUID open = data.createNap(c.babyId(), c.userId(), Instant.now().minus(30, ChronoUnit.MINUTES), null);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(times(null, Instant.now().toString()))
                    .when().patch("/api/babies/{babyId}/naps/{id}", c.babyId(), open)
                    .then().statusCode(409);
        }

        @Test
        @DisplayName("Scénario : correction end_at < start_at → 400")
        void correction_invalide() {
            Caregiver c = linkedCaregiver("editor");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID nap = data.createNap(c.babyId(), c.userId(), base, base.plus(1, ChronoUnit.HOURS));
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(times(null, base.minus(1, ChronoUnit.HOURS).toString()))
                    .when().patch("/api/babies/{babyId}/naps/{id}", c.babyId(), nap)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : suppression par un caregiver lié → 204, disparaît")
        void suppression() {
            Caregiver c = linkedCaregiver("deleter");
            UUID nap = data.createNap(c.babyId(), c.userId(), Instant.now().minus(2, ChronoUnit.HOURS),
                    Instant.now().minus(1, ChronoUnit.HOURS));
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/naps/{id}", c.babyId(), nap)
                    .then().statusCode(204);
            assertEquals(0, data.countNap(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID nap = data.createNap(c.babyId(), c.userId(), Instant.now().minus(2, ChronoUnit.HOURS),
                    Instant.now().minus(1, ChronoUnit.HOURS));
            given().when().delete("/api/babies/{babyId}/naps/{id}", c.babyId(), nap).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon sécurité IDOR (US1.5 / D4-G)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : forger l'id d'une sieste d'un autre bébé → 404 (PATCH et DELETE)")
        void acces_croise() {
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            UUID napOfB2 = data.createNap(b2, otherUser, Instant.now().minus(2, ChronoUnit.HOURS),
                    Instant.now().minus(1, ChronoUnit.HOURS));

            // Check IDOR n°2 : A lié à B1 (path), mais la sieste appartient à B2 → 404.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON).body(times(null, Instant.now().toString()))
                    .when().patch("/api/babies/{babyId}/naps/{id}", a.babyId(), napOfB2)
                    .then().statusCode(404);
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/naps/{id}", a.babyId(), napOfB2)
                    .then().statusCode(404);

            // Check IDOR n°1 : A n'est pas lié à B2 → 404 (sans révéler l'existence).
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/naps/{id}", b2, napOfB2)
                    .then().statusCode(404);

            assertEquals(1, data.countNap(b2)); // sieste de la victime intacte
        }
    }

    @Nested
    @DisplayName("Cycle de vie complet (intégration)")
    class Lifecycle {

        @Test
        @DisplayName("Scénario : start → current(200) → end → current(204) → start à nouveau réussit")
        void cycle_complet() {
            Caregiver c = linkedCaregiver("cycle");
            start(c, null);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/naps/current", c.babyId()).then().statusCode(200);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(body("endAt", null))
                    .when().post("/api/babies/{babyId}/naps/end", c.babyId()).then().statusCode(200);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/naps/current", c.babyId()).then().statusCode(204);
            // l'index partiel ne bloque plus : un nouveau start réussit
            start(c, null);
            assertEquals(2, data.countNap(c.babyId()));
        }
    }
}
