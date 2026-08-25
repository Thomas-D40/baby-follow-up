package com.suivibaby.controller;

import com.suivibaby.model.CareType;
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
 * CRUD soin médical (US15.2) sous le filtre d'appartenance, calqué sur {@link UrineCrudTest} avec en
 * plus un type fermé {@code eye|nose} (D15-I). Un {@code @Nested} par cible d'AC. Jalon IDOR : soin
 * d'un autre bébé / bébé non lié → 404 (les deux checks, anti-énumération) ; pas de session → 401.
 * Les deux types vivent dans la même table mais sont strictement indépendants l'un de l'autre.
 */
@QuarkusTest
class MedicalCareCrudTest {

    static final String PWD = "medical-care-crud-pwd-123";

    @Inject
    TestDataFactory data;

    /** Payload tolérant aux null (Map.of ne l'est pas) pour les charges partielles. */
    private static Map<String, Object> payload(Object occurredAt, Object careType) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("careType", careType);
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
    @DisplayName("POST /api/babies/{babyId}/medical-cares")
    class Create {

        @Test
        @DisplayName("Scénario : soin du nez → 201, author_id = courant, occurredAt défaut = now")
        void soin_du_nez() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "nose")) // occurredAt absent → défaut now
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("occurredAt", notNullValue())
                    .body("careType", is("nose"))
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : soin des yeux → 201, careType conservé")
        void soin_des_yeux() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "eye"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(201)
                    .body("careType", is("eye"));

            assertEquals(1, data.countMedicalCare(c.babyId()));
        }

        /** Même table, deux types : noter l'un ne doit rien créer ni modifier pour l'autre. */
        @Test
        @DisplayName("Scénario : indépendance des types — noter eye ne touche pas nose")
        void independance_des_types() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "eye"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(201);

            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.eye));
            assertEquals(0, data.countMedicalCare(c.babyId(), CareType.nose));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "nose"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(201);

            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.eye));
            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.nose));
        }

        @Test
        @DisplayName("Scénario : occurredAt fourni → 201, valeur conservée")
        void occurred_at_fourni() {
            Caregiver c = linkedCaregiver("creator");
            String when = Instant.now().minus(2, ChronoUnit.HOURS)
                    .truncatedTo(ChronoUnit.MILLIS).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, "nose"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(201)
                    .body("occurredAt", is(when));
        }

        @Test
        @DisplayName("Scénario : type inconnu → 400, aucune écriture")
        void type_inconnu() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "ear"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : type absent → 400 « Type de soin inconnu. », aucune écriture")
        void type_absent() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : corps absent → 400, aucune écriture")
        void corps_absent() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt futur > +5min → 400 ; à +4min → 201 (tolérance d'horloge)")
        void occurred_at_futur() {
            Caregiver c = linkedCaregiver("creator");

            String tropLoin = Instant.now().plus(6, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(tropLoin, "nose"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(400);

            String dansLaTolerance = Instant.now().plus(4, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(dansLaTolerance, "nose"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(201);

            assertEquals(1, data.countMedicalCare(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt < now − 2 ans → 400")
        void occurred_at_trop_ancien() {
            Caregiver c = linkedCaregiver("creator");
            String old = Instant.now().minus(731, ChronoUnit.DAYS).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(old, "eye"))
                    .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedicalCare(c.babyId()));
        }

        /** L'espacement EST l'information (D15-I) : trois lavages de nez = trois lignes horodatées. */
        @Test
        @DisplayName("Scénario : trois soins du nez dans la journée → trois lignes, chacune à son heure")
        void plusieurs_soins_dans_la_journee() {
            Caregiver c = linkedCaregiver("creator");
            Instant base = Instant.now().minus(6, ChronoUnit.HOURS);

            for (int h = 0; h < 3; h++) {
                String when = base.plus(h, ChronoUnit.HOURS)
                        .truncatedTo(ChronoUnit.MILLIS).toString();
                given().cookie(AuthFixture.COOKIE, c.cookie())
                        .contentType(ContentType.JSON)
                        .body(payload(when, "nose"))
                        .when().post("/api/babies/{babyId}/medical-cares", c.babyId())
                        .then().statusCode(201)
                        .body("occurredAt", is(when));
            }

            assertEquals(3, data.countMedicalCare(c.babyId(), CareType.nose));
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(3));
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("creator");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "nose"))
                    .when().post("/api/babies/{babyId}/medical-cares", autrui)
                    .then().statusCode(404);

            assertEquals(0, data.countMedicalCare(autrui));
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON)
                    .body(payload(null, "nose"))
                    .when().post("/api/babies/{babyId}/medical-cares", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/medical-cares (keyset)")
    class List {

        /** Seed direct (repository) à un instant donné ; l'instant sert de marqueur d'ordre. */
        private UUID seed(Caregiver c, CareType careType, Instant occurredAt) {
            return data.createMedicalCare(c.babyId(), c.userId(), careType, occurredAt);
        }

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée occurred_at DESC, id DESC, tous types confondus")
        void premiere_page_triee() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID ancien = seed(c, CareType.eye, base);                                  // le plus ancien
            UUID milieu = seed(c, CareType.nose, base.plus(1, ChronoUnit.HOURS));
            UUID recent = seed(c, CareType.eye, base.plus(2, ChronoUnit.HOURS));        // le plus récent

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(3))
                    .body("items[0].id", is(recent.toString())) // récent d'abord
                    .body("items[1].id", is(milieu.toString()))
                    .body("items[1].careType", is("nose"))      // la liste mélange bien les deux types
                    .body("items[2].id", is(ancien.toString()))
                    .body("nextCursor", nullValue()); // tout tient sur une page
        }

        @Test
        @DisplayName("Scénario : page suivante via before (ni chevauchement ni saut)")
        void page_suivante_via_before() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID ancien = seed(c, CareType.eye, base);
            UUID milieu = seed(c, CareType.nose, base.plus(1, ChronoUnit.HOURS));
            UUID recent = seed(c, CareType.nose, base.plus(2, ChronoUnit.HOURS));

            String nextCursor = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .when().get("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(2))
                    .body("items[0].id", is(recent.toString()))
                    .body("items[1].id", is(milieu.toString()))
                    .body("nextCursor", notNullValue())
                    .extract().path("nextCursor");

            // Page suivante : le reste, sans recouvrement (recent/milieu déjà vus), nextCursor = null (fin).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .queryParam("before", nextCursor)
                    .when().get("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(1))
                    .body("items[0].id", is(ancien.toString()))
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : before malformé → 400")
        void before_malforme() {
            Caregiver c = linkedCaregiver("lister");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("before", "pas-un-curseur")
                    .when().get("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : limit < 1 → 400")
        void limit_invalide() {
            Caregiver c = linkedCaregiver("lister");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 0)
                    .when().get("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("lister");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/medical-cares", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().get("/api/babies/{babyId}/medical-cares", baby).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/medical-cares/{id}")
    class UpdateDelete {

        private UUID seedEvent(Caregiver c) {
            return data.createMedicalCare(c.babyId(), c.userId(), CareType.nose,
                    Instant.now().minus(1, ChronoUnit.HOURS));
        }

        @Test
        @DisplayName("Scénario : correction de l'heure → 200, type inchangé")
        void edition_heure() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = Instant.now().minus(30, ChronoUnit.MINUTES)
                    .truncatedTo(ChronoUnit.MILLIS).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige, null))
                    .when().patch("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(200)
                    .body("occurredAt", is(corrige))
                    .body("careType", is("nose"));
        }

        @Test
        @DisplayName("Scénario : correction du type → 200, heure inchangée")
        void edition_type() {
            Caregiver c = linkedCaregiver("editor");
            Instant when = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS);
            UUID event = data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, when);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "eye"))
                    .when().patch("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(200)
                    .body("careType", is("eye"))
                    .body("occurredAt", is(when.toString()));

            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.eye));
            assertEquals(0, data.countMedicalCare(c.babyId(), CareType.nose));
        }

        @Test
        @DisplayName("Scénario : correction avec un type inconnu → 400")
        void edition_type_inconnu() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "ear"))
                    .when().patch("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(400);

            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.nose)); // inchangé
        }

        @Test
        @DisplayName("Scénario : correction occurredAt futur → 400")
        void edition_occurred_at_futur() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String future = Instant.now().plus(10, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(future, null))
                    .when().patch("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : PATCH d'un id inconnu → 404")
        void edition_id_inconnu() {
            Caregiver c = linkedCaregiver("editor");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "eye"))
                    .when().patch("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), UUID.randomUUID())
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : suppression par un caregiver lié → 204, disparaît")
        void suppression_caregiver_lie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(204);

            assertEquals(0, data.countMedicalCare(c.babyId()));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/medical-cares", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : re-suppression / id inconnu → 404")
        void suppression_id_inconnu() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(204);

            // Re-suppression du même id → plus rien → 404.
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(404);
        }

        /** Suppression par ressource : retirer un soin des yeux ne touche pas le soin du nez du couple. */
        @Test
        @DisplayName("Scénario : supprimer le soin eye laisse le soin nose intact")
        void suppression_par_type() {
            Caregiver c = linkedCaregiver("deleter");
            Instant when = Instant.now().minus(1, ChronoUnit.HOURS);
            UUID eye = data.createMedicalCare(c.babyId(), c.userId(), CareType.eye, when);
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, when);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), eye)
                    .then().statusCode(204);

            assertEquals(0, data.countMedicalCare(c.babyId(), CareType.eye));
            assertEquals(1, data.countMedicalCare(c.babyId(), CareType.nose));
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401 (PATCH et DELETE)")
        void non_authentifie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().contentType(ContentType.JSON)
                    .body(payload(null, "eye"))
                    .when().patch("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(401);

            given().when().delete("/api/babies/{babyId}/medical-cares/{id}", c.babyId(), event)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon sécurité IDOR (US1.5 / D15-C)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : forger l'id d'un soin d'un autre bébé → 404 (PATCH et DELETE), ligne intacte")
        void acces_croise_event_autre_bebe() {
            // A est lié à B1 ; B2 (d'autrui) porte un soin dont A forge l'id.
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            UUID eventOfB2 = data.createMedicalCare(b2, otherUser, CareType.nose,
                    Instant.now().minus(1, ChronoUnit.HOURS));

            // Check IDOR n°2 : A est lié à B1 (path), mais l'événement appartient à B2 → 404.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().minus(30, ChronoUnit.MINUTES).toString(), "eye"))
                    .when().patch("/api/babies/{babyId}/medical-cares/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/medical-cares/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            // Check IDOR n°1 : A n'est pas lié à B2 → 404 (sans révéler l'existence).
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/medical-cares/{id}", b2, eventOfB2)
                    .then().statusCode(404);

            // Le soin de la victime est intact : ni édité (toujours nose) ni supprimé.
            assertEquals(1, data.countMedicalCare(b2));
            assertEquals(1, data.countMedicalCare(b2, CareType.nose));
        }

        @Test
        @DisplayName("Scénario : GET / POST sur un bébé non lié → 404 (jamais 403)")
        void acces_croise_bebe_non_lie() {
            Caregiver a = linkedCaregiver("attacker");
            UUID b2 = data.createBaby("BébéAutrui");

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get("/api/babies/{babyId}/medical-cares", b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "nose"))
                    .when().post("/api/babies/{babyId}/medical-cares", b2)
                    .then().statusCode(404);

            assertEquals(0, data.countMedicalCare(b2));
        }
    }
}
