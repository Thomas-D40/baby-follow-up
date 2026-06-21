package com.suivibaby.controller;

import com.suivibaby.model.MilkType;
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
 * US3.1 (création) + CRUD biberon (D3-B) sous le filtre d'appartenance. Un {@code @Nested} par cible
 * d'AC (cf. §4 du plan). Jalon IDOR (D3-C/US1.5) : événement d'un autre bébé / bébé non lié → 404 ;
 * pas de session → 401. Pas de dédup serveur (D3-A).
 */
@QuarkusTest
class BottleFeedingCrudTest {

    static final String PWD = "bottle-crud-pwd-123";

    @Inject
    TestDataFactory data;

    /** Payload tolérant aux null (Map.of ne l'est pas) pour les charges partielles. */
    private static Map<String, Object> payload(Object occurredAt, Object quantityMl, Object milkType) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("quantityMl", quantityMl);
        m.put("milkType", milkType);
        return m;
    }

    /** Parent actif lié à un bébé neuf ; renvoie [userId, babyId, cookie]. */
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
    @DisplayName("POST /api/babies/{babyId}/bottle-feedings")
    class Create {

        @Test
        @DisplayName("Scénario : saisie réussie → 201, author_id = courant, occurredAt défaut = now")
        void saisie_reussie() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 120, "formula")) // occurredAt absent → défaut now
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("quantityMl", is(120))
                    .body("milkType", is("formula"))
                    .body("occurredAt", notNullValue())
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countBottleFeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : quantité absente → 400")
        void quantite_absente() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : quantité ≤ 0 → 400")
        void quantite_nulle() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 0, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : quantité > 2000 → 400")
        void quantite_trop_grande() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 2001, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : occurredAt futur > +5min → 400")
        void occurred_at_futur() {
            Caregiver c = linkedCaregiver("creator");
            String future = Instant.now().plus(10, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(future, 120, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : occurredAt < now − 2 ans → 400")
        void occurred_at_trop_ancien() {
            Caregiver c = linkedCaregiver("creator");
            String old = Instant.now().minus(800, ChronoUnit.DAYS).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(old, 120, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : milkType hors enum → 400")
        void milk_type_invalide() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 120, "almond"))
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("creator");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 120, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON)
                    .body(payload(null, 120, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/bottle-feedings (keyset)")
    class List {

        /** Crée un biberon à un instant donné, quantité = marqueur d'ordre. */
        private void seed(Caregiver c, Instant occurredAt, int quantityMl) {
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(occurredAt.toString(), quantityMl, null))
                    .when().post("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(201);
        }

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée occurred_at DESC, id DESC")
        void premiere_page_triee() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            seed(c, base, 10);                         // le plus ancien
            seed(c, base.plus(1, ChronoUnit.HOURS), 20);
            seed(c, base.plus(2, ChronoUnit.HOURS), 30); // le plus récent

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(3))
                    .body("items[0].quantityMl", is(30)) // récent d'abord
                    .body("items[1].quantityMl", is(20))
                    .body("items[2].quantityMl", is(10))
                    .body("nextCursor", nullValue()); // tout tient sur une page
        }

        @Test
        @DisplayName("Scénario : page suivante via before (ni chevauchement ni saut)")
        void page_suivante_via_before() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            seed(c, base, 10);
            seed(c, base.plus(1, ChronoUnit.HOURS), 20);
            seed(c, base.plus(2, ChronoUnit.HOURS), 30);

            String nextCursor = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .when().get("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(2))
                    .body("items[0].quantityMl", is(30))
                    .body("items[1].quantityMl", is(20))
                    .body("nextCursor", notNullValue())
                    .extract().path("nextCursor");

            // Page suivante : le reste, sans recouvrement (30/20 déjà vus), nextCursor = null (fin).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .queryParam("before", nextCursor)
                    .when().get("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(1))
                    .body("items[0].quantityMl", is(10))
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : limit > plafond → borné (200, pas d'erreur)")
        void limit_plafonnee() {
            Caregiver c = linkedCaregiver("lister");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 100)
                    .when().get("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(0))
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : before malformé → 400")
        void before_malforme() {
            Caregiver c = linkedCaregiver("lister");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("before", "pas-un-curseur")
                    .when().get("/api/babies/{babyId}/bottle-feedings", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("lister");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/bottle-feedings", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().get("/api/babies/{babyId}/bottle-feedings", baby).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/bottle-feedings/{id}")
    class UpdateDelete {

        private UUID seedEvent(Caregiver c, int quantityMl, MilkType milkType) {
            return data.createBottleFeeding(c.babyId(), c.userId(),
                    Instant.now().minus(1, ChronoUnit.HOURS), quantityMl, milkType);
        }

        @Test
        @DisplayName("Scénario : édition par un caregiver lié → 200")
        void edition_caregiver_lie() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c, 100, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 150, "breast"))
                    .when().patch("/api/babies/{babyId}/bottle-feedings/{id}", c.babyId(), event)
                    .then().statusCode(200)
                    .body("quantityMl", is(150))
                    .body("milkType", is("breast"));
        }

        @Test
        @DisplayName("Scénario : édition quantité hors-bornes → 400")
        void edition_quantite_invalide() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c, 100, null);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 5000, null))
                    .when().patch("/api/babies/{babyId}/bottle-feedings/{id}", c.babyId(), event)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : suppression par un caregiver lié → 204, disparaît")
        void suppression_caregiver_lie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c, 100, null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/bottle-feedings/{id}", c.babyId(), event)
                    .then().statusCode(204);

            assertEquals(0, data.countBottleFeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c, 100, null);
            given().when().delete("/api/babies/{babyId}/bottle-feedings/{id}", c.babyId(), event)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Jalon sécurité IDOR (US1.5 / D3-C)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : forger l'id d'un biberon d'un autre bébé → 404 (PATCH et DELETE)")
        void acces_croise_event_autre_bebe() {
            // A est lié à B1 ; B2 (d'autrui) porte un biberon dont A forge l'id.
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            UUID eventOfB2 = data.createBottleFeeding(b2, otherUser,
                    Instant.now().minus(1, ChronoUnit.HOURS), 120, MilkType.formula);

            // Check IDOR n°2 : A est lié à B1 (path), mais l'événement appartient à B2 → 404.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 999, null))
                    .when().patch("/api/babies/{babyId}/bottle-feedings/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/bottle-feedings/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            // Check IDOR n°1 : A n'est pas lié à B2 → 404 (sans révéler l'existence).
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/bottle-feedings/{id}", b2, eventOfB2)
                    .then().statusCode(404);

            // L'événement de la victime est intact (ni édité ni supprimé).
            assertEquals(1, data.countBottleFeeding(b2));
        }
    }
}
