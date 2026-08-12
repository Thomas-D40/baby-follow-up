package com.suivibaby.controller;

import com.suivibaby.model.VitaminType;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * US9.1 — vitamine = état-jour idempotent (D9-A). Un {@code @Nested} par cible d'AC (cf. §4 du plan) :
 * coche (POST 200 idempotent, D9-B), décoche (DELETE 204 systématique), état du jour (GET matrice d/k),
 * idempotence (contrainte unique = zéro doublon, D9-G) et **jalon IDOR** (un seul check suffit, D9-C/US1.5).
 */
@QuarkusTest
class VitaminTest {

    static final String PWD = "vitamin-pwd-123";
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

    /** Ajoute un 2ᵉ parent lié au MÊME bébé (co-gestion Épic 8) et renvoie son cookie. */
    private Caregiver coParent(UUID babyId, String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID userId = data.createActiveParent(email, PWD);
        data.link(userId, babyId);
        return new Caregiver(userId, babyId, AuthFixture.loginCookie(email, PWD));
    }

    @Nested
    @DisplayName("POST /api/babies/{babyId}/vitamins/{type}")
    class Give {

        @Test
        @DisplayName("Scénario : coche réussie → 200, given=true, author_id = courant")
        void coche_reussie() {
            Caregiver c = linkedCaregiver("giver");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().post("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "d")
                    .then().statusCode(200)
                    .body("vitaminType", is("d"))
                    .body("given", is(true))
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countVitamin(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : re-POST idempotent → 200, une seule ligne, author_id inchangé (DO NOTHING, D9-F/D9-G)")
        void re_post_idempotent() {
            Caregiver a = linkedCaregiver("giver-a");
            Caregiver b = coParent(a.babyId(), "giver-b");

            // A coche en premier → author = A.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().post("/api/babies/{babyId}/vitamins/{type}", a.babyId(), "d")
                    .then().statusCode(200).body("authorId", is(a.userId().toString()));

            // B recoche le même (bébé/type/jour) → toujours 200, mais l'author reste A (ON CONFLICT DO NOTHING).
            given().cookie(AuthFixture.COOKIE, b.cookie())
                    .when().post("/api/babies/{babyId}/vitamins/{type}", a.babyId(), "d")
                    .then().statusCode(200)
                    .body("given", is(true))
                    .body("authorId", is(a.userId().toString()));

            assertEquals(1, data.countVitamin(a.babyId())); // aucun doublon (contrainte unique)
        }

        @Test
        @DisplayName("Scénario : type hors enum → 400")
        void type_invalide() {
            Caregiver c = linkedCaregiver("giver");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().post("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "zinc")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : jour futur → 400 (D9-E)")
        void jour_futur() {
            Caregiver c = linkedCaregiver("giver");
            String tomorrow = LocalDate.now(PARIS).plusDays(1).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", tomorrow)
                    .when().post("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "d")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : date malformée → 400")
        void date_malformee() {
            Caregiver c = linkedCaregiver("giver");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "pas-une-date")
                    .when().post("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "d")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("giver");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().post("/api/babies/{babyId}/vitamins/{type}", autrui, "d")
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().post("/api/babies/{babyId}/vitamins/{type}", baby, "d")
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("DELETE /api/babies/{babyId}/vitamins/{type}")
    class Unset {

        @Test
        @DisplayName("Scénario : décoche d'un état existant → 204, l'état repasse à false")
        void decoche_existant() {
            Caregiver c = linkedCaregiver("unsetter");
            data.giveVitamin(c.babyId(), c.userId(), VitaminType.d, LocalDate.now(PARIS));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "d")
                    .then().statusCode(204);

            assertEquals(0, data.countVitamin(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : décoche d'un état absent → 204 (idempotent, D9-B)")
        void decoche_absent() {
            Caregiver c = linkedCaregiver("unsetter");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "k")
                    .then().statusCode(204);
        }

        @Test
        @DisplayName("Scénario : décoche par un AUTRE caregiver lié → 204 (autorisation = appartenance, D9-F)")
        void decoche_par_co_parent() {
            Caregiver a = linkedCaregiver("owner-a");
            Caregiver b = coParent(a.babyId(), "owner-b");
            data.giveVitamin(a.babyId(), a.userId(), VitaminType.d, LocalDate.now(PARIS));

            given().cookie(AuthFixture.COOKIE, b.cookie())
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", a.babyId(), "d")
                    .then().statusCode(204);

            assertEquals(0, data.countVitamin(a.babyId()));
        }

        @Test
        @DisplayName("Scénario : type hors enum → 400")
        void type_invalide() {
            Caregiver c = linkedCaregiver("unsetter");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "zinc")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : jour futur → 400 (bornes d'écriture symétriques au POST, D9-E)")
        void jour_futur() {
            Caregiver c = linkedCaregiver("unsetter");
            String tomorrow = LocalDate.now(PARIS).plusDays(1).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", tomorrow)
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "d")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : date malformée → 400")
        void date_malformee() {
            Caregiver c = linkedCaregiver("unsetter");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "pas-une-date")
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", c.babyId(), "d")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("unsetter");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", autrui, "d")
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().delete("/api/babies/{babyId}/vitamins/{type}", baby, "d")
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/vitamins")
    class Day {

        @Test
        @DisplayName("Scénario : matrice complète d/k, given correct, authorId présent ssi given")
        void matrice_complete() {
            Caregiver c = linkedCaregiver("reader");
            data.giveVitamin(c.babyId(), c.userId(), VitaminType.d, LocalDate.now(PARIS)); // d donnée, k non

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/vitamins", c.babyId())
                    .then().statusCode(200)
                    .body("date", notNullValue())
                    .body("items", hasSize(2))
                    .body("items.find { it.vitaminType == 'd' }.given", is(true))
                    .body("items.find { it.vitaminType == 'd' }.authorId", is(c.userId().toString()))
                    .body("items.find { it.vitaminType == 'k' }.given", is(false))
                    .body("items.find { it.vitaminType == 'k' }.authorId", nullValue());
        }

        @Test
        @DisplayName("Scénario : jour futur consultable → 200, tout à false (pas de borne futur en lecture)")
        void jour_futur_consultable() {
            Caregiver c = linkedCaregiver("reader");
            String tomorrow = LocalDate.now(PARIS).plusDays(1).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", tomorrow)
                    .when().get("/api/babies/{babyId}/vitamins", c.babyId())
                    .then().statusCode(200)
                    .body("items.given", is(java.util.List.of(false, false)));
        }

        @Test
        @DisplayName("Scénario : date malformée → 400")
        void date_malformee() {
            Caregiver c = linkedCaregiver("reader");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "13-2026-99")
                    .when().get("/api/babies/{babyId}/vitamins", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("reader");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/vitamins", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().get("/api/babies/{babyId}/vitamins", baby).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon sécurité IDOR (US1.5 / D9-C)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : viser le babyId d'un autre bébé → 404 (GET/POST/DELETE), état intact")
        void acces_croise() {
            // A est lié à B1 ; B2 (d'autrui) porte un état vitamine.
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            data.giveVitamin(b2, otherUser, VitaminType.d, LocalDate.now(PARIS));

            // Seul check IDOR (D9-C) : A n'est pas lié à B2 → 404 sur les trois verbes, sans rien révéler.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get("/api/babies/{babyId}/vitamins", b2)
                    .then().statusCode(404);
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().post("/api/babies/{babyId}/vitamins/{type}", b2, "k")
                    .then().statusCode(404);
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/vitamins/{type}", b2, "d")
                    .then().statusCode(404);

            // L'état de la victime est intact.
            assertEquals(1, data.countVitamin(b2));
        }
    }
}
