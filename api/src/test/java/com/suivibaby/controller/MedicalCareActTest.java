package com.suivibaby.controller;

import com.suivibaby.model.CareType;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
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
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * US15.2 (D15-M) : endpoint atomique « acte médical »
 * {@code POST /api/babies/{babyId}/medical-care-acts}, calqué sur {@link DiaperChangeTest}. Un geste
 * utilisateur = une requête : le front n'a qu'un bouton à désactiver et qu'un état d'erreur à rendre.
 * Atomicité « les deux ou aucun », et CREATE ONLY : les corrections passent par la ressource
 * {@code medical-cares} et dissocient la paire, ce qui est voulu.
 * Pas de {@code @Nested CrossAccess} ici (D15-M) : le service composite n'a aucun check propre,
 * l'isolation est héritée des délégués ; le cas « bébé non lié » couvre le rollback observable.
 */
@QuarkusTest
class MedicalCareActTest {

    static final String PWD = "medical-care-act-pwd-123";

    @Inject
    TestDataFactory data;

    /** Payload tolérant aux null (Map.of ne l'est pas) pour les charges partielles. */
    private static Map<String, Object> payload(Object occurredAt, boolean withEye, boolean withNose) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("withEye", withEye);
        m.put("withNose", withNose);
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
    @DisplayName("POST /api/babies/{babyId}/medical-care-acts")
    class Create {

        @Test
        @DisplayName("Scénario : les deux (yeux + nez) → 201 ; deux ids distincts ; deux lignes en base")
        void les_deux() {
            Caregiver c = linkedCaregiver("both");

            JsonPath body = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, true))
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(201)
                    .body("eye", notNullValue())
                    .body("eye.id", notNullValue())
                    .body("eye.careType", is("eye"))
                    .body("eye.authorId", is(c.userId().toString()))
                    .body("nose", notNullValue())
                    .body("nose.id", notNullValue())
                    .body("nose.careType", is("nose"))
                    .body("nose.authorId", is(c.userId().toString()))
                    .extract().jsonPath();

            // Deux ressources bien distinctes, pas une seule ligne relue deux fois.
            assertNotEquals(body.getString("eye.id"), body.getString("nose.id"));
            assertEquals(2, data.countMedicalCare(c.babyId()));
            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.eye));
            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.nose));
        }

        @Test
        @DisplayName("Scénario : yeux seuls → 201 ; nose null ; une seule ligne")
        void yeux_seuls() {
            Caregiver c = linkedCaregiver("eye-only");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, false))
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(201)
                    .body("eye", notNullValue())
                    .body("eye.careType", is("eye"))
                    .body("nose", nullValue());

            assertEquals(1, data.countMedicalCare(c.babyId()));
            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.eye));
            assertEquals(0, data.countMedicalCare(c.babyId(), CareType.nose));
        }

        @Test
        @DisplayName("Scénario : nez seul → 201 ; eye null ; une seule ligne")
        void nez_seul() {
            Caregiver c = linkedCaregiver("nose-only");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, false, true))
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(201)
                    .body("eye", nullValue())
                    .body("nose", notNullValue())
                    .body("nose.careType", is("nose"));

            assertEquals(1, data.countMedicalCare(c.babyId()));
            assertEquals(0, data.countMedicalCare(c.babyId(), CareType.eye));
            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.nose));
        }

        @Test
        @DisplayName("Scénario : occurredAt fourni → 201, la même heure sur les deux soins")
        void occurred_at_fourni_partage() {
            Caregiver c = linkedCaregiver("shared-time");
            String when = Instant.now().minus(2, ChronoUnit.HOURS)
                    .truncatedTo(ChronoUnit.MILLIS).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, true, true))
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(201)
                    .body("eye.occurredAt", is(when))
                    .body("nose.occurredAt", is(when));
        }

        @Test
        @DisplayName("Scénario : occurredAt par défaut = now si absent → 201, occurredAt renseigné")
        void occurred_at_defaut_now() {
            Caregiver c = linkedCaregiver("default-now");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, true)) // occurredAt absent → défaut now
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(201)
                    .body("eye.occurredAt", notNullValue())
                    .body("nose.occurredAt", notNullValue());

            assertEquals(2, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : acte vide (ni yeux ni nez) → 400 ; rien créé")
        void acte_vide() {
            Caregiver c = linkedCaregiver("empty");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, false, false))
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : corps absent → 400 ; rien créé")
        void corps_absent() {
            Caregiver c = linkedCaregiver("no-body");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt futur > +5min → 400 ; rien créé (validation héritée du délégué)")
        void occurred_at_futur() {
            Caregiver c = linkedCaregiver("future");
            String tropLoin = Instant.now().plus(10, ChronoUnit.MINUTES).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(tropLoin, true, true))
                    .when().post("/api/babies/{babyId}/medical-care-acts", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON)
                    .body(payload(null, true, true))
                    .when().post("/api/babies/{babyId}/medical-care-acts", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon atomicité / IDOR (rollback : aucune moitié orpheline)")
    class AtomicityIdor {

        /**
         * Test-clé du rollback : un caregiver lié à B1 cible un bébé B2 non lié avec un acte complet
         * (yeux + nez). L'endpoint répond 404 (jamais 403, anti-énumération) ET la transaction n'a
         * rien persisté sur B2. L'isolation n'est pas vérifiée par le service composite lui-même
         * (D15-M) : elle est héritée des délégués, et le @Transactional garantit qu'aucune moitié ne
         * survit à l'échec de l'autre.
         */
        @Test
        @DisplayName("Scénario : bébé non lié → 404 ET countMedicalCare == 0 sur ce bébé")
        void bebe_non_lie_rien_persiste() {
            Caregiver a = linkedCaregiver("attacker");
            UUID b2 = data.createBaby("BébéAutrui");

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, true, true))
                    .when().post("/api/babies/{babyId}/medical-care-acts", b2)
                    .then().statusCode(404);

            // Rollback : aucune moitié orpheline sur le bébé ciblé.
            assertEquals(0, data.countMedicalCare(b2));
            assertEquals(0, data.countMedicalCare(b2, CareType.eye));
            assertEquals(0, data.countMedicalCare(b2, CareType.nose));
        }
    }
}
