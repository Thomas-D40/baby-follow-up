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

/**
 * Lot A — session cookie security (the foundational, priority code). A forged cookie and the
 * cookie of a deleted user must be rejected (401).
 */
@QuarkusTest
class CookieSecurityTest {

    @Inject
    TestDataFactory data;

    @Nested
    @DisplayName("Scénario : cookie falsifié / signature invalide")
    class CookieFalsifie {
        @Test
        void renvoie_401() {
            given().cookie(AuthFixture.COOKIE, "ceci-nest-pas-un-cookie-valide")
                    .when().get("/api/me")
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Scénario : cookie d'un utilisateur supprimé")
    class UtilisateurSupprime {
        @Test
        void renvoie_401() {
            String email = data.uniqueEmail("ghost");
            UUID userId = data.createActiveParent(email, "ghost-password-123");
            String cookie = AuthFixture.loginCookie(email, "ghost-password-123");

            data.deleteUser(userId);

            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().get("/api/me")
                    .then().statusCode(401);
        }
    }
}
