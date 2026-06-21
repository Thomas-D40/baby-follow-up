package com.suivibaby.controller;

import com.suivibaby.service.ActivationService;
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
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** US1.2 — activation via single-use link. */
@QuarkusTest
class ActivationTest {

    static final String VALID_PASSWORD = "longenough-password";

    @Inject
    TestDataFactory data;

    @Inject
    ActivationService activationService;

    private UUID activeToken(UUID userId) {
        return data.createToken(userId, Instant.now().plus(7, ChronoUnit.DAYS), null);
    }

    @Nested
    @DisplayName("Scénario : activation réussie (jeton invalidé)")
    class ActivationReussie {
        @Test
        void enregistre_le_mdp_consomme_le_jeton_et_permet_le_login() {
            String email = data.uniqueEmail("act");
            UUID userId = data.createPendingParent(email);
            UUID token = activeToken(userId);

            given().contentType(ContentType.JSON)
                    .body(Map.of("token", token.toString(), "password", VALID_PASSWORD))
                    .when().post("/api/activation")
                    .then().statusCode(204);

            assertTrue(data.tokenConsumed(token), "le jeton doit être invalidé");
            // The account is now active: login succeeds.
            AuthFixture.loginCookie(email, VALID_PASSWORD);
        }
    }

    @Nested
    @DisplayName("Scénario : jeton déjà utilisé (410)")
    class JetonDejaUtilise {
        @Test
        void renvoie_410() {
            UUID userId = data.createPendingParent(data.uniqueEmail("used"));
            UUID token = data.createToken(userId, Instant.now().plus(7, ChronoUnit.DAYS), Instant.now());
            postActivation(token, VALID_PASSWORD).then().statusCode(410);
        }
    }

    @Nested
    @DisplayName("Scénario : jeton expiré (410)")
    class JetonExpire {
        @Test
        void renvoie_410() {
            UUID userId = data.createPendingParent(data.uniqueEmail("exp"));
            UUID token = data.createToken(userId, Instant.now().minus(1, ChronoUnit.DAYS), null);
            postActivation(token, VALID_PASSWORD).then().statusCode(410);
        }
    }

    @Nested
    @DisplayName("Scénario : ancien lien après régénération")
    class AncienLienApresRegeneration {
        @Test
        void l_ancien_jeton_est_refuse_le_nouveau_fonctionne() {
            UUID userId = data.createPendingParent(data.uniqueEmail("regen"));
            UUID oldToken = activeToken(userId);

            // Regeneration: invalidates the previous one and issues a new token.
            UUID newToken = activationService.issueToken(userId);

            assertTrue(data.tokenConsumed(oldToken), "l'ancien jeton doit être invalidé");
            postActivation(oldToken, VALID_PASSWORD).then().statusCode(410);
            postActivation(newToken, VALID_PASSWORD).then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : mot de passe trop faible (400, jeton non consommé)")
    class MotDePasseTropFaible {
        @Test
        void renvoie_400_sans_consommer_le_jeton() {
            UUID userId = data.createPendingParent(data.uniqueEmail("weak"));
            UUID token = activeToken(userId);

            postActivation(token, "short").then().statusCode(400);

            assertFalse(data.tokenConsumed(token), "le jeton ne doit PAS être consommé");
            // Still usable with a compliant password.
            postActivation(token, VALID_PASSWORD).then().statusCode(204);
        }
    }

    private static io.restassured.response.Response postActivation(UUID token, String password) {
        return given().contentType(ContentType.JSON)
                .body(Map.of("token", token.toString(), "password", password))
                .when().post("/api/activation");
    }
}
