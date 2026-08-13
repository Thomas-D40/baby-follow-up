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
 * CRUD miction (urine) sous le filtre d'appartenance, calqué sur {@link StoolCrudTest} sans la
 * consistance. Un {@code @Nested} par cible d'AC. Jalon IDOR : événement d'un autre bébé / bébé
 * non lié → 404 (les deux checks, anti-énumération) ; pas de session → 401. Pas de dédup serveur.
 */
@QuarkusTest
class UrineCrudTest {

    static final String PWD = "urine-crud-pwd-123";

    @Inject
    TestDataFactory data;

    /** Payload tolérant aux null (Map.of ne l'est pas) pour les charges partielles. */
    private static Map<String, Object> payload(Object occurredAt) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
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
    @DisplayName("POST /api/babies/{babyId}/urines")
    class Create {

        @Test
        @DisplayName("Scénario : saisie réussie → 201, author_id = courant, occurredAt défaut = now")
        void saisie_reussie() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null)) // occurredAt absent → défaut now
                    .when().post("/api/babies/{babyId}/urines", c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("occurredAt", notNullValue())
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countUrine(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt fourni → 201, valeur conservée")
        void occurred_at_fourni() {
            Caregiver c = linkedCaregiver("creator");
            String when = Instant.now().minus(2, ChronoUnit.HOURS)
                    .truncatedTo(ChronoUnit.MILLIS).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when))
                    .when().post("/api/babies/{babyId}/urines", c.babyId())
                    .then().statusCode(201)
                    .body("occurredAt", is(when));
        }

        @Test
        @DisplayName("Scénario : corps absent → 201 (occurredAt défaut = now)")
        void corps_absent() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .when().post("/api/babies/{babyId}/urines", c.babyId())
                    .then().statusCode(201)
                    .body("occurredAt", notNullValue());

            assertEquals(1, data.countUrine(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt futur > +5min → 400")
        void occurred_at_futur() {
            Caregiver c = linkedCaregiver("creator");
            String future = Instant.now().plus(10, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(future))
                    .when().post("/api/babies/{babyId}/urines", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : occurredAt < now − 2 ans → 400")
        void occurred_at_trop_ancien() {
            Caregiver c = linkedCaregiver("creator");
            String old = Instant.now().minus(800, ChronoUnit.DAYS).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(old))
                    .when().post("/api/babies/{babyId}/urines", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("creator");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null))
                    .when().post("/api/babies/{babyId}/urines", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON)
                    .body(payload(null))
                    .when().post("/api/babies/{babyId}/urines", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/urines (keyset)")
    class List {

        /** Seed direct (repository) à un instant donné ; l'instant sert de marqueur d'ordre. */
        private UUID seed(Caregiver c, Instant occurredAt) {
            return data.createUrine(c.babyId(), c.userId(), occurredAt);
        }

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée occurred_at DESC, id DESC")
        void premiere_page_triee() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID ancien = seed(c, base);                              // le plus ancien
            UUID milieu = seed(c, base.plus(1, ChronoUnit.HOURS));
            UUID recent = seed(c, base.plus(2, ChronoUnit.HOURS));    // le plus récent

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/urines", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(3))
                    .body("items[0].id", is(recent.toString())) // récent d'abord
                    .body("items[1].id", is(milieu.toString()))
                    .body("items[2].id", is(ancien.toString()))
                    .body("nextCursor", nullValue()); // tout tient sur une page
        }

        @Test
        @DisplayName("Scénario : page suivante via before (ni chevauchement ni saut)")
        void page_suivante_via_before() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID ancien = seed(c, base);
            UUID milieu = seed(c, base.plus(1, ChronoUnit.HOURS));
            UUID recent = seed(c, base.plus(2, ChronoUnit.HOURS));

            String nextCursor = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .when().get("/api/babies/{babyId}/urines", c.babyId())
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
                    .when().get("/api/babies/{babyId}/urines", c.babyId())
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
                    .when().get("/api/babies/{babyId}/urines", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("lister");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/urines", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().get("/api/babies/{babyId}/urines", baby).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/urines/{id}")
    class UpdateDelete {

        private UUID seedEvent(Caregiver c) {
            return data.createUrine(c.babyId(), c.userId(), Instant.now().minus(1, ChronoUnit.HOURS));
        }

        @Test
        @DisplayName("Scénario : correction occurredAt par un caregiver lié → 200")
        void edition_occurred_at() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = Instant.now().minus(30, ChronoUnit.MINUTES)
                    .truncatedTo(ChronoUnit.MILLIS).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige))
                    .when().patch("/api/babies/{babyId}/urines/{id}", c.babyId(), event)
                    .then().statusCode(200)
                    .body("occurredAt", is(corrige));
        }

        @Test
        @DisplayName("Scénario : correction occurredAt futur → 400")
        void edition_occurred_at_futur() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String future = Instant.now().plus(10, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(future))
                    .when().patch("/api/babies/{babyId}/urines/{id}", c.babyId(), event)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : PATCH d'un id inconnu → 404")
        void edition_id_inconnu() {
            Caregiver c = linkedCaregiver("editor");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null))
                    .when().patch("/api/babies/{babyId}/urines/{id}", c.babyId(), UUID.randomUUID())
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : suppression par un caregiver lié → 204, disparaît")
        void suppression_caregiver_lie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/urines/{id}", c.babyId(), event)
                    .then().statusCode(204);

            assertEquals(0, data.countUrine(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : re-suppression / id inconnu → 404")
        void suppression_id_inconnu() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/urines/{id}", c.babyId(), event)
                    .then().statusCode(204);

            // Re-suppression du même id → plus rien → 404.
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/urines/{id}", c.babyId(), event)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);
            given().when().delete("/api/babies/{babyId}/urines/{id}", c.babyId(), event)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon sécurité IDOR (US1.5 / D5-C)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : forger l'id d'une miction d'un autre bébé → 404 (PATCH et DELETE)")
        void acces_croise_event_autre_bebe() {
            // A est lié à B1 ; B2 (d'autrui) porte une miction dont A forge l'id.
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            UUID eventOfB2 = data.createUrine(b2, otherUser, Instant.now().minus(1, ChronoUnit.HOURS));

            // Check IDOR n°2 : A est lié à B1 (path), mais l'événement appartient à B2 → 404.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().minus(30, ChronoUnit.MINUTES).toString()))
                    .when().patch("/api/babies/{babyId}/urines/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/urines/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            // Check IDOR n°1 : A n'est pas lié à B2 → 404 (sans révéler l'existence).
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/urines/{id}", b2, eventOfB2)
                    .then().statusCode(404);

            // La miction de la victime est intacte (ni éditée ni supprimée).
            assertEquals(1, data.countUrine(b2));
        }

        @Test
        @DisplayName("Scénario : GET / POST sur un bébé non lié → 404 (jamais 403)")
        void acces_croise_bebe_non_lie() {
            Caregiver a = linkedCaregiver("attacker");
            UUID b2 = data.createBaby("BébéAutrui");

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get("/api/babies/{babyId}/urines", b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null))
                    .when().post("/api/babies/{babyId}/urines", b2)
                    .then().statusCode(404);
        }
    }
}
