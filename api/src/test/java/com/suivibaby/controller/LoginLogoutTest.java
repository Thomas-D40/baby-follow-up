package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;

/** US1.3 — login / logout. One @Nested class per AC scenario (traceability). */
@QuarkusTest
class LoginLogoutTest {

    @Inject
    TestDataFactory data;

    String email;
    final String password = "correct-horse-battery";

    @BeforeEach
    void seedActiveParent() {
        email = data.uniqueEmail("login");
        data.createActiveParent(email, password);
    }

    @Nested
    @DisplayName("Scénario : connexion réussie")
    class ConnexionReussie {
        @Test
        void cookie_pose_et_me_renvoie_l_utilisateur() {
            String cookie = AuthFixture.loginCookie(email, password);
            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().get("/api/me")
                    .then().statusCode(200)
                    .body("email", is(email))
                    .body("role", is("parent"));
        }
    }

    @Nested
    @DisplayName("Scénario : identifiants invalides (401 générique)")
    class IdentifiantsInvalides {
        @Test
        void mauvais_mot_de_passe() {
            given().contentType("application/x-www-form-urlencoded")
                    .formParam("email", email).formParam("password", "wrong-password-xx")
                    .when().post("/api/login")
                    .then().statusCode(401);
        }

        @Test
        void email_inconnu() {
            given().contentType("application/x-www-form-urlencoded")
                    .formParam("email", "nobody@test.local").formParam("password", "whatever-12345")
                    .when().post("/api/login")
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Scénario : compte non activé (401)")
    class CompteNonActive {
        @Test
        void sans_mot_de_passe_login_refuse() {
            String pending = data.uniqueEmail("pending");
            data.createPendingParent(pending);
            given().contentType("application/x-www-form-urlencoded")
                    .formParam("email", pending).formParam("password", "anything-123456")
                    .when().post("/api/login")
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Scénario : déconnexion")
    class Deconnexion {
        @Test
        void logout_efface_le_cookie_et_me_renvoie_401() {
            String cookie = AuthFixture.loginCookie(email, password);
            // Logout returns a Set-Cookie that clears the session cookie.
            String cleared = given().cookie(AuthFixture.COOKIE, cookie)
                    .when().post("/api/logout")
                    .then().extract().cookie(AuthFixture.COOKIE);

            // The cleared cookie must no longer authenticate.
            given().cookie(AuthFixture.COOKIE, cleared == null ? "" : cleared)
                    .when().get("/api/me")
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Scénario : accès sans session")
    class SansSession {
        @Test
        void me_sans_cookie_renvoie_401() {
            given().when().get("/api/me").then().statusCode(401);
        }
    }
}
