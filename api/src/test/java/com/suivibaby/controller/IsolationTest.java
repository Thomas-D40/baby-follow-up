package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;

/**
 * US1.5 — data isolation (cross-cutting, partial in Epic 1). Checks the membership filter on the
 * <em>existing</em> endpoints ({@code /api/babies}). IDOR on events is deferred to epics 2→7
 * (no event endpoint here).
 */
@QuarkusTest
class IsolationTest {

    static final String PWD = "isolation-pwd-123";

    @Inject
    TestDataFactory data;

    @Nested
    @DisplayName("Scénario : accès à un bébé lié (OK)")
    class BebeLie {
        @Test
        void renvoie_200() {
            String email = data.uniqueEmail("a");
            UUID a = data.createActiveParent(email, PWD);
            UUID baby = data.createBaby("Lié");
            data.link(a, baby);
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().get("/api/babies/{id}", baby)
                    .then().statusCode(200)
                    .body("firstName", is("Lié"));
        }
    }

    @Nested
    @DisplayName("Scénario : accès à un bébé non lié (404)")
    class BebeNonLie {
        @Test
        void renvoie_404_pas_403() {
            String email = data.uniqueEmail("a");
            data.createActiveParent(email, PWD);
            UUID autreBebe = data.createBaby("Autrui");
            String cookie = AuthFixture.loginCookie(email, PWD);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().get("/api/babies/{id}", autreBebe)
                    .then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("Scénario : non authentifié (401)")
    class NonAuthentifie {
        @Test
        void renvoie_401() {
            UUID baby = data.createBaby("X");
            given().when().get("/api/babies/{id}", baby).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Test de sécurité : accès croisé entre deux comptes")
    class AccesCroise {
        @Test
        void A_ne_voit_pas_le_bebe_de_C_et_inversement() {
            String emailA = data.uniqueEmail("A");
            String emailC = data.uniqueEmail("C");
            UUID a = data.createActiveParent(emailA, PWD);
            UUID c = data.createActiveParent(emailC, PWD);
            UUID b1 = data.createBaby("B1");
            UUID b2 = data.createBaby("B2");
            data.link(a, b1);
            data.link(c, b2);

            String cookieA = AuthFixture.loginCookie(emailA, PWD);
            String cookieC = AuthFixture.loginCookie(emailC, PWD);

            // A sees B1, not B2
            given().cookie(AuthFixture.COOKIE, cookieA).get("/api/babies/{id}", b1).then().statusCode(200);
            given().cookie(AuthFixture.COOKIE, cookieA).get("/api/babies/{id}", b2).then().statusCode(404);
            // C sees B2, not B1
            given().cookie(AuthFixture.COOKIE, cookieC).get("/api/babies/{id}", b2).then().statusCode(200);
            given().cookie(AuthFixture.COOKIE, cookieC).get("/api/babies/{id}", b1).then().statusCode(404);

            // The list returns only the linked babies
            given().cookie(AuthFixture.COOKIE, cookieA).get("/api/babies")
                    .then().statusCode(200).body("size()", is(1)).body("[0].firstName", is("B1"));
        }
    }
}
