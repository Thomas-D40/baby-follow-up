package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * US13.2 Lot 4 (D13-G) : endpoint atomique « acte de change »
 * {@code POST /api/babies/{babyId}/diaper-changes}. Calqué sur {@link StoolCrudTest} /
 * {@link UrineCrudTest}. Atomicité « les deux ou aucun » : la validation (acte vide,
 * consistance sans selle) rejette en 400 avant toute écriture ; l'IDOR (bébé non lié) rejette
 * en 404, et le {@code @Transactional} garantit qu'aucune moitié orpheline n'est persistée.
 * Jalon rollback-clé : bébé non lié → 404 ET rien persisté sur ce bébé.
 */
@QuarkusTest
class DiaperChangeTest {

    static final String PWD = "diaper-change-pwd-123";

    @Inject
    TestDataFactory data;

    /** Payload tolérant aux null (Map.of ne l'est pas) pour les charges partielles. */
    private static Map<String, Object> payload(Object occurredAt, boolean withUrine, boolean withStool,
                                                Object consistency) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("withUrine", withUrine);
        m.put("withStool", withStool);
        m.put("consistency", consistency);
        return m;
    }

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

    @Nested
    @DisplayName("POST /api/babies/{babyId}/diaper-changes")
    class Create {

        @Test
        @DisplayName("Scénario : les deux (urine + selle) → 201 ; réponse porte urine ET stool ; 1 urine + 1 selle en base")
        void les_deux() {
            Caregiver c = linkedCaregiver("both");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, true, "soft"))
                    .when().post("/api/babies/{babyId}/diaper-changes", c.babyId())
                    .then().statusCode(201)
                    .body("urine", notNullValue())
                    .body("urine.id", notNullValue())
                    .body("urine.authorId", is(c.userId().toString()))
                    .body("stool", notNullValue())
                    .body("stool.id", notNullValue())
                    .body("stool.consistency", is("soft"))
                    .body("stool.authorId", is(c.userId().toString()));

            assertEquals(1, data.countUrine(c.babyId()));
            assertEquals(1, data.countStool(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : urine seule → 201 ; stool null ; 1 urine, 0 selle")
        void urine_seule() {
            Caregiver c = linkedCaregiver("urine-only");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, false, null))
                    .when().post("/api/babies/{babyId}/diaper-changes", c.babyId())
                    .then().statusCode(201)
                    .body("urine", notNullValue())
                    .body("urine.id", notNullValue())
                    .body("stool", nullValue());

            assertEquals(1, data.countUrine(c.babyId()));
            assertEquals(0, data.countStool(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : selle seule → 201 ; urine null ; la selle porte la consistance ; 0 urine, 1 selle")
        void selle_seule() {
            Caregiver c = linkedCaregiver("stool-only");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, false, true, "liquid"))
                    .when().post("/api/babies/{babyId}/diaper-changes", c.babyId())
                    .then().statusCode(201)
                    .body("urine", nullValue())
                    .body("stool", notNullValue())
                    .body("stool.consistency", is("liquid"));

            assertEquals(0, data.countUrine(c.babyId()));
            assertEquals(1, data.countStool(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt par défaut = now si absent → 201, occurredAt renseigné")
        void occurred_at_defaut_now() {
            Caregiver c = linkedCaregiver("default-now");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, false, null)) // occurredAt absent → défaut now
                    .when().post("/api/babies/{babyId}/diaper-changes", c.babyId())
                    .then().statusCode(201)
                    .body("urine.occurredAt", notNullValue());

            assertEquals(1, data.countUrine(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : acte vide (ni urine ni selle) → 400 ; rien créé")
        void acte_vide() {
            Caregiver c = linkedCaregiver("empty");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, false, false, null))
                    .when().post("/api/babies/{babyId}/diaper-changes", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countUrine(c.babyId()));
            assertEquals(0, data.countStool(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : consistance sans selle → 400 ; rien créé")
        void consistance_sans_selle() {
            Caregiver c = linkedCaregiver("consistency-no-stool");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, false, "hard"))
                    .when().post("/api/babies/{babyId}/diaper-changes", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countUrine(c.babyId()));
            assertEquals(0, data.countStool(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON)
                    .body(payload(null, true, true, "soft"))
                    .when().post("/api/babies/{babyId}/diaper-changes", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon atomicité / IDOR (rollback : aucune moitié orpheline)")
    class AtomicityIdor {

        /**
         * Test-clé du rollback : un caregiver lié à B1 cible un bébé B2 non lié avec un acte complet
         * (urine + selle). L'endpoint répond 404 (jamais 403, anti-énumération) ET la transaction
         * n'a rien persisté sur B2 : ni urine ni selle. L'atomicité garantit qu'on ne laisse pas la
         * moitié urine derrière si la moitié selle échoue sur l'appartenance.
         */
        @Test
        @DisplayName("Scénario : bébé non lié → 404 ET rien persisté (ni urine ni selle) sur ce bébé")
        void bebe_non_lie_rien_persiste() {
            Caregiver a = linkedCaregiver("attacker");
            UUID b2 = data.createBaby("BébéAutrui");

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, true, "soft"))
                    .when().post("/api/babies/{babyId}/diaper-changes", b2)
                    .then().statusCode(404);

            // Rollback : aucune moitié orpheline sur le bébé ciblé.
            assertEquals(0, data.countUrine(b2));
            assertEquals(0, data.countStool(b2));
        }
    }
}
