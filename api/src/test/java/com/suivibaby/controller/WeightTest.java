package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
class WeightTest {

    static final String PWD = "weight-pwd-123";
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    static final String WEIGHTS = "/api/babies/{babyId}/weights";
    static final String WEIGHTS_DATE = "/api/babies/{babyId}/weights/{date}";

    @Inject
    TestDataFactory data;

    private record Caregiver(UUID userId, UUID babyId, String cookie) {
    }

    private Caregiver linkedCaregiver(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID userId = data.createActiveParent(email, PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(userId, babyId);
        return new Caregiver(userId, babyId, AuthFixture.loginCookie(email, PWD));
    }

    /** 2ᵉ parent lié au MÊME bébé (co-gestion Épic 8) — sert au test « dernier gagnant » sur l'author. */
    private Caregiver coParent(UUID babyId, String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID userId = data.createActiveParent(email, PWD);
        data.link(userId, babyId);
        return new Caregiver(userId, babyId, AuthFixture.loginCookie(email, PWD));
    }

    private static String today() {
        return LocalDate.now(PARIS).toString();
    }

    @Nested
    @DisplayName("PUT /api/babies/{babyId}/weights/{date}")
    class Upsert {

        @Test
        @DisplayName("Scénario : jour vierge → 200, WeightPoint (givenOn + weightGrams) correct, 1 ligne")
        void jour_vierge_cree() {
            Caregiver c = linkedCaregiver("wput");
            String day = today();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", 4200))
                    .when().put(WEIGHTS_DATE, c.babyId(), day)
                    .then().statusCode(200)
                    .body("givenOn", is(day))
                    .body("weightGrams", is(4200));

            assertEquals(1, data.countWeight(c.babyId()));
            assertEquals(c.userId(), data.weightAuthorId(c.babyId(), LocalDate.parse(day)));
        }

        @Test
        @DisplayName("Scénario : re-PUT même jour → écrase valeur ET author (dernier gagnant, D12-C′), 1 seule ligne")
        void re_put_ecrase_valeur_et_author() {
            Caregiver a = linkedCaregiver("wput-a");
            Caregiver b = coParent(a.babyId(), "wput-b");
            String day = today();

            // A pèse en premier → author = A.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", 4200))
                    .when().put(WEIGHTS_DATE, a.babyId(), day)
                    .then().statusCode(200).body("weightGrams", is(4200));
            assertEquals(a.userId(), data.weightAuthorId(a.babyId(), LocalDate.parse(day)));

            // B corrige le même jour → valeur écrasée ET author devient B (contrairement à vitamine « 1er gagnant »).
            given().cookie(AuthFixture.COOKIE, b.cookie())
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", 4300))
                    .when().put(WEIGHTS_DATE, a.babyId(), day)
                    .then().statusCode(200).body("weightGrams", is(4300));

            assertEquals(1, data.countWeight(a.babyId())); // unicité (baby_id, given_on) : jamais 2 lignes le même jour
            assertEquals(b.userId(), data.weightAuthorId(a.babyId(), LocalDate.parse(day)));
        }

        @Test
        @DisplayName("Scénario : deux PUT même jour → GET reflète la dernière valeur, 1 point")
        void re_put_visible_en_lecture() {
            Caregiver c = linkedCaregiver("wput-read");
            String day = today();
            put(c.cookie(), c.babyId(), day, 4200, 200);
            put(c.cookie(), c.babyId(), day, 5000, 200);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get(WEIGHTS, c.babyId())
                    .then().statusCode(200)
                    .body("points", org.hamcrest.Matchers.hasSize(1))
                    .body("points[0].weightGrams", is(5000));
        }

        @Test
        @DisplayName("Scénario : poids ≤ 0 → 400")
        void poids_zero_ou_negatif() {
            Caregiver c = linkedCaregiver("wput-neg");
            put(c.cookie(), c.babyId(), today(), 0, 400);
            put(c.cookie(), c.babyId(), today(), -100, 400);
            assertEquals(0, data.countWeight(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : poids > 30000 g → 400")
        void poids_trop_grand() {
            Caregiver c = linkedCaregiver("wput-big");
            put(c.cookie(), c.babyId(), today(), 30001, 400);
            assertEquals(0, data.countWeight(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : jour futur → 400 (resolveWritableDate)")
        void jour_futur() {
            Caregiver c = linkedCaregiver("wput-fut");
            String tomorrow = LocalDate.now(PARIS).plusDays(1).toString();
            put(c.cookie(), c.babyId(), tomorrow, 4200, 400);
        }

        @Test
        @DisplayName("Scénario : date au format invalide → 400")
        void date_invalide() {
            Caregiver c = linkedCaregiver("wput-bad");
            put(c.cookie(), c.babyId(), "pas-une-date", 4200, 400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404 (isolation, écriture)")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("wput-idor");
            UUID autrui = data.createBaby("Autrui");
            put(c.cookie(), autrui, today(), 4200, 404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON).body(Map.of("weightGrams", 4200))
                    .when().put(WEIGHTS_DATE, baby, today())
                    .then().statusCode(401);
        }

        private void put(String cookie, UUID babyId, String date, int grams, int expected) {
            given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", grams))
                    .when().put(WEIGHTS_DATE, babyId, date)
                    .then().statusCode(expected);
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/weights")
    class History {

        @Test
        @DisplayName("Scénario : historique trié given_on ASC (peu importe l'ordre de saisie)")
        void historique_trie_asc() {
            Caregiver c = linkedCaregiver("wget");
            // Saisie volontairement dans le désordre.
            put(c.cookie(), c.babyId(), "2026-01-03", 5200);
            put(c.cookie(), c.babyId(), "2026-01-01", 4200);
            put(c.cookie(), c.babyId(), "2026-01-02", 4800);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get(WEIGHTS, c.babyId())
                    .then().statusCode(200)
                    .body("points.givenOn", is(List.of("2026-01-01", "2026-01-02", "2026-01-03")))
                    .body("points.weightGrams", is(List.of(4200, 4800, 5200)));
        }

        @Test
        @DisplayName("Scénario : bébé sans pesée → 200, liste vide")
        void historique_vide() {
            Caregiver c = linkedCaregiver("wget-empty");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get(WEIGHTS, c.babyId())
                    .then().statusCode(200)
                    .body("points", org.hamcrest.Matchers.hasSize(0));
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404 (isolation, lecture)")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("wget-idor");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get(WEIGHTS, autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().get(WEIGHTS, baby).then().statusCode(401);
        }

        private void put(String cookie, UUID babyId, String date, int grams) {
            given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", grams))
                    .when().put(WEIGHTS_DATE, babyId, date)
                    .then().statusCode(200);
        }
    }

    @Nested
    @DisplayName("DELETE /api/babies/{babyId}/weights/{date}")
    class Delete {

        @Test
        @DisplayName("Scénario : suppression d'un jour existant → 204, ligne retirée")
        void supprime_existant() {
            Caregiver c = linkedCaregiver("wdel");
            String day = today();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", 4200))
                    .when().put(WEIGHTS_DATE, c.babyId(), day).then().statusCode(200);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(WEIGHTS_DATE, c.babyId(), day)
                    .then().statusCode(204);

            assertEquals(0, data.countWeight(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : suppression d'un jour absent → 204 (idempotent, D12-D′)")
        void supprime_absent_idempotent() {
            Caregiver c = linkedCaregiver("wdel-idem");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(WEIGHTS_DATE, c.babyId(), today())
                    .then().statusCode(204);
            assertEquals(0, data.countWeight(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : date au format invalide → 400 (bornes d'écriture symétriques au PUT)")
        void date_invalide() {
            Caregiver c = linkedCaregiver("wdel-bad");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(WEIGHTS_DATE, c.babyId(), "pas-une-date")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404 (isolation, écriture)")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("wdel-idor");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(WEIGHTS_DATE, autrui, today())
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().delete(WEIGHTS_DATE, baby, today()).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon sécurité IDOR (requireLinked sur GET/PUT/DELETE)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : viser le babyId d'un autre bébé → 404 sur les 3 verbes, état intact")
        void acces_croise() {
            Caregiver a = linkedCaregiver("wattacker");
            // Victime : parent + bébé, avec une pesée seedée via sa propre session.
            String victimEmail = data.uniqueEmail("wvictim");
            UUID victim = data.createActiveParent(victimEmail, PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(victim, b2);
            String victimCookie = AuthFixture.loginCookie(victimEmail, PWD);
            String day = today();
            given().cookie(AuthFixture.COOKIE, victimCookie)
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", 4200))
                    .when().put(WEIGHTS_DATE, b2, day).then().statusCode(200);

            // A n'est pas lié à B2 → 404 sur les trois verbes, sans rien révéler.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get(WEIGHTS, b2).then().statusCode(404);
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON).body(Map.of("weightGrams", 9999))
                    .when().put(WEIGHTS_DATE, b2, day).then().statusCode(404);
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(WEIGHTS_DATE, b2, day).then().statusCode(404);

            // L'état de la victime est intact : 1 ligne, valeur et author d'origine (le PUT de A n'a rien écrasé).
            assertEquals(1, data.countWeight(b2));
            assertEquals(victim, data.weightAuthorId(b2, LocalDate.parse(day)));
        }
    }
}
