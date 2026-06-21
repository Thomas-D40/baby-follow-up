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
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * US2.1 (create + auto-link) and D2-E (edit/delete) CRUD. One {@code @Nested} per AC scenario, for
 * traceability. Membership filter (US1.5/D2-D): unlinked baby → 404; no session → 401.
 */
@QuarkusTest
class BabyCrudTest {

    static final String PWD = "baby-crud-pwd-123";

    @Inject
    TestDataFactory data;

    /** Map that tolerates null values (Map.of does not) for partial PATCH payloads. */
    private static Map<String, Object> payload(String firstName, Object birthDate, Object sex) {
        Map<String, Object> m = new HashMap<>();
        m.put("firstName", firstName);
        m.put("birthDate", birthDate);
        m.put("sex", sex);
        return m;
    }

    @Nested
    @DisplayName("US2.1 POST /api/babies")
    class Create {

        @Test
        @DisplayName("Scénario : création réussie → 201, créateur lié, bébé visible")
        void creation_reussie() {
            String email = data.uniqueEmail("creator");
            UUID me = data.createActiveParent(email, PWD);
            String cookie = AuthFixture.loginCookie(email, PWD);

            String id = given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON)
                    .body(payload("Léa", "2026-01-15", "female"))
                    .when().post("/api/babies")
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .extract().path("id");

            // Auto-link in the same transaction (US2.1)
            assertEquals(1, data.countLink(me, UUID.fromString(id)));

            // The creator sees it immediately
            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().get("/api/babies")
                    .then().statusCode(200)
                    .body("size()", is(1))
                    .body("[0].firstName", is("Léa"))
                    .body("[0].sex", is("female"));
        }

        @Test
        @DisplayName("Scénario : prénom manquant → 400")
        void prenom_manquant() {
            String email = data.uniqueEmail("creator");
            data.createActiveParent(email, PWD);
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON)
                    .body(payload("   ", null, null)) // blank → @NotBlank
                    .when().post("/api/babies")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : sexe hors enum → 400")
        void sexe_invalide() {
            String email = data.uniqueEmail("creator");
            data.createActiveParent(email, PWD);
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON)
                    .body(payload("Léa", null, "other"))
                    .when().post("/api/babies")
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            given().contentType(ContentType.JSON)
                    .body(payload("Léa", null, null))
                    .when().post("/api/babies")
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("PATCH /api/babies/{id}")
    class Update {

        @Test
        @DisplayName("Scénario : édition par un caregiver lié → 200")
        void edition_caregiver_lie() {
            String email = data.uniqueEmail("editor");
            UUID me = data.createActiveParent(email, PWD);
            UUID baby = data.createBaby("Avant");
            data.link(me, baby);
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON)
                    .body(payload("Après", null, "male"))
                    .when().patch("/api/babies/{id}", baby)
                    .then().statusCode(200)
                    .body("firstName", is("Après"))
                    .body("sex", is("male"));
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            String email = data.uniqueEmail("editor");
            data.createActiveParent(email, PWD);
            UUID autrui = data.createBaby("Autrui");
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON)
                    .body(payload("Hack", null, null))
                    .when().patch("/api/babies/{id}", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : prénom vidé → 400")
        void prenom_vide() {
            String email = data.uniqueEmail("editor");
            UUID me = data.createActiveParent(email, PWD);
            UUID baby = data.createBaby("Avant");
            data.link(me, baby);
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .contentType(ContentType.JSON)
                    .body(payload("  ", null, null))
                    .when().patch("/api/babies/{id}", baby)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON)
                    .body(payload("Y", null, null))
                    .when().patch("/api/babies/{id}", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("DELETE /api/babies/{id}")
    class Delete {

        @Test
        @DisplayName("Scénario : suppression par un caregiver lié → 204, cascade, disparaît")
        void suppression_caregiver_lie() {
            String email = data.uniqueEmail("deleter");
            UUID me = data.createActiveParent(email, PWD);
            UUID baby = data.createBaby("ÀSupprimer");
            data.link(me, baby);
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().delete("/api/babies/{id}", baby)
                    .then().statusCode(204);

            // Cascade: the baby_caregiver link is gone (FK ON DELETE CASCADE, D2-H)
            assertEquals(0, data.countLink(me, baby));

            // The baby disappears from the list
            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().get("/api/babies")
                    .then().statusCode(200).body("size()", is(0));
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            String email = data.uniqueEmail("deleter");
            data.createActiveParent(email, PWD);
            UUID autrui = data.createBaby("Autrui");
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().delete("/api/babies/{id}", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().delete("/api/babies/{id}", baby).then().statusCode(401);
        }
    }
}
