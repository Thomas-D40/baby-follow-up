package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Every "the relay is down" scenario of Épics 17 and 20 lives in this one class, so Quarkus restarts
 * once for the whole failure profile. The mock mailer is switched off and the real SMTP client points
 * at a closed local port: Mailer.send throws, and MailService must turn it into mailSent=false without
 * undoing anything (D17-N, D17-AA).
 */
@QuarkusTest
@TestProfile(MailFailureTest.SmtpDownProfile.class)
class MailFailureTest {

    public static class SmtpDownProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            // The %test. prefix is mandatory: application.properties sets %test.quarkus.mailer.mock=true,
            // and a profile-prefixed key wins over the same key without a prefix.
            return Map.of(
                    "%test.quarkus.mailer.mock", "false",
                    "quarkus.mailer.host", "127.0.0.1",
                    "quarkus.mailer.port", "1",
                    "quarkus.mailer.start-tls", "DISABLED");
        }
    }

    static final String PWD = "failure-pwd-123";
    static final String INVITATION_PWD = "mot-de-passe-invitation-1";

    @Inject
    TestDataFactory data;

    private record Owner(UUID id, String cookie, UUID baby) {
    }

    private Owner owner() {
        String email = data.uniqueEmail("owner");
        UUID id = data.createUser(email, "Thomas", "parent", PWD);
        UUID baby = data.createBaby("Léa");
        data.link(id, baby);
        return new Owner(id, AuthFixture.loginCookie(email, PWD), baby);
    }

    private Response invite(Owner owner, String email) {
        return given().cookie(AuthFixture.COOKIE, owner.cookie())
                .contentType(ContentType.JSON)
                .body(Map.of("email", email, "firstName", "Jeanne"))
                .when().post("/api/babies/{babyId}/invitations", owner.baby());
    }

    @Nested
    @DisplayName("Scénario : l'envoi de l'invitation échoue")
    class EchecInvitation {

        @Test
        void repond_201_mail_non_envoye_et_le_lien_reste_utilisable() {
            Owner owner = owner();
            String email = data.uniqueEmail("jeanne");

            Response response = invite(owner, email);

            response.then().statusCode(201);
            assertFalse(response.jsonPath().getBoolean("mailSent"));
            UUID invitee = data.userIdByEmail(email);
            assertNotNull(invitee, "le compte reste créé");
            assertEquals(1, data.countActiveInvitations(owner.baby()), "l'invitation reste enregistrée");
            UUID token = UUID.fromString(response.jsonPath().getString("token"));
            given().contentType(ContentType.JSON).body(Map.of("password", INVITATION_PWD))
                    .when().post("/api/invitations/{token}/accept", token)
                    .then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : l'échec n'annule rien, la ré-émission reste possible")
    class EchecPuisReemission {

        @Test
        void deux_emissions_donnent_deux_201_un_compte_et_une_invitation_active() {
            Owner owner = owner();
            String email = data.uniqueEmail("jeanne");

            Response first = invite(owner, email);
            Response second = invite(owner, email);

            first.then().statusCode(201);
            second.then().statusCode(201);
            assertFalse(first.jsonPath().getBoolean("mailSent"));
            assertFalse(second.jsonPath().getBoolean("mailSent"));
            assertEquals(1, data.countUsersByEmail(email));
            assertEquals(1, data.countActiveInvitations(owner.baby()));
        }
    }

    private String adminCookie() {
        String email = data.uniqueEmail("admin");
        data.createUser(email, "Thomas", "admin", PWD);
        return AuthFixture.loginCookie(email, PWD);
    }

    private static String tokenOf(String activationLink) {
        return activationLink.substring(activationLink.indexOf("token=") + "token=".length());
    }

    private Response activate(String activationLink) {
        return given().contentType(ContentType.JSON)
                .body(Map.of("token", tokenOf(activationLink), "password", INVITATION_PWD))
                .when().post("/api/activation");
    }

    @Nested
    @DisplayName("Scénario : l'envoi du lien d'activation échoue à la création par l'admin")
    class EchecCreationAdmin {

        @Test
        void repond_201_mail_non_envoye_et_le_lien_active_le_compte() {
            String email = data.uniqueEmail("lisa");

            Response response = given().cookie(AuthFixture.COOKIE, adminCookie())
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Lisa"))
                    .when().post("/api/admin/users");

            response.then().statusCode(201);
            assertFalse(response.jsonPath().getBoolean("mailSent"));
            assertNotNull(data.userIdByEmail(email), "le compte reste créé");
            activate(response.jsonPath().getString("activationLink")).then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : l'envoi du lien d'activation échoue au renvoi")
    class EchecRenvoi {

        @Test
        void repond_200_mail_non_envoye_et_le_nouveau_lien_active_le_compte() {
            UUID pending = data.createPendingParent(data.uniqueEmail("jeanne"));

            Response response = given().cookie(AuthFixture.COOKIE, adminCookie())
                    .when().post("/api/admin/users/{id}/activation-link", pending);

            response.then().statusCode(200);
            assertFalse(response.jsonPath().getBoolean("mailSent"));
            activate(response.jsonPath().getString("activationLink")).then().statusCode(204);
        }
    }
}
