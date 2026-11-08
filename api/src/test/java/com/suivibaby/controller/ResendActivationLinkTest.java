package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.mailer.Mail;
import io.quarkus.mailer.MockMailbox;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 20, US20.3 — the administrator regenerates the activation link of a pending account and it is
// mailed again. The SMTP failure path lives in MailFailureTest (it needs its own test profile).
@QuarkusTest
class ResendActivationLinkTest {

    static final String PWD = "resend-pwd-123";
    static final String CHOSEN_PWD = "mot-de-passe-choisi-12";
    static final String INVITATION_PWD = "mot-de-passe-invitation-1";

    @Inject
    TestDataFactory data;

    @Inject
    MockMailbox mailbox;

    String adminCookie;

    @BeforeEach
    void seedAdmin() {
        mailbox.clear();
        String email = data.uniqueEmail("admin");
        data.createUser(email, "Thomas", "admin", PWD);
        adminCookie = AuthFixture.loginCookie(email, PWD);
    }

    private Response resend(String cookie, Object userId) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .when().post("/api/admin/users/{id}/activation-link", userId);
    }

    private Response resend(Object userId) {
        return resend(adminCookie, userId);
    }

    // The mailbox answers null for an address that never received anything.
    private List<Mail> mailsTo(String email) {
        List<Mail> mails = mailbox.getMailsSentTo(email);
        return mails == null ? List.of() : mails;
    }

    private static String tokenOf(String activationLink) {
        return activationLink.substring(activationLink.indexOf("token=") + "token=".length());
    }

    private Response activate(String token, String password) {
        return given().contentType(ContentType.JSON)
                .body(Map.of("token", token, "password", password))
                .when().post("/api/activation");
    }

    private String statusOf(String email) {
        List<Map<String, Object>> accounts = given().cookie(AuthFixture.COOKIE, adminCookie)
                .when().get("/api/admin/users")
                .then().statusCode(200)
                .extract().jsonPath().getList("$");
        return accounts.stream()
                .filter(a -> email.equals(a.get("email")))
                .map(a -> (String) a.get("status"))
                .findFirst().orElse(null);
    }

    private void assertRegeneratedLinkWorks(String email, UUID jeanne, UUID oldToken) {
        Response response = resend(jeanne);

        response.then().statusCode(200);
        assertTrue(response.jsonPath().getBoolean("mailSent"));
        String link = response.jsonPath().getString("activationLink");
        assertNotEquals(oldToken.toString(), tokenOf(link), "un nouveau lien est émis");
        List<Mail> mails = mailsTo(email);
        assertEquals(1, mails.size());
        Mail mail = mails.get(0);
        assertEquals(List.of(email), mail.getTo());
        assertTrue(mail.getText().contains("7 jours"), mail.getText());
        assertTrue(mail.getText().contains(link), "le texte porte le nouveau lien");
        assertEquals(1, data.countActiveActivationTokens(jeanne));
        activate(oldToken.toString(), CHOSEN_PWD).then().statusCode(410);
        activate(tokenOf(link), CHOSEN_PWD).then().statusCode(204);
    }

    @Nested
    @DisplayName("Scénario : renvoyer le lien d'un compte en attente")
    class Renvoi {

        @Test
        void remplace_un_jeton_expire_et_envoie_le_nouveau_lien() {
            String email = data.uniqueEmail("jeanne");
            UUID jeanne = data.createPendingParent(email);
            UUID old = data.createToken(jeanne, Instant.now().minus(1, ChronoUnit.DAYS), null);

            assertRegeneratedLinkWorks(email, jeanne, old);
        }

        @Test
        void remplace_un_jeton_encore_valable_et_l_invalide() {
            String email = data.uniqueEmail("jeanne");
            UUID jeanne = data.createPendingParent(email);
            UUID old = data.createToken(jeanne, Instant.now().plus(5, ChronoUnit.DAYS), null);

            assertRegeneratedLinkWorks(email, jeanne, old);
        }
    }

    @Nested
    @DisplayName("Scénario : un compte déjà activé n'a rien à se faire renvoyer")
    class CompteActif {

        @Test
        void renvoie_409_sans_jeton_sans_mail_et_sans_invalider_l_existant() {
            String email = data.uniqueEmail("lisa");
            UUID lisa = data.createActiveParent(email, PWD);
            UUID existing = data.createToken(lisa, Instant.now().plus(7, ChronoUnit.DAYS), null);
            assertEquals(1, data.countActiveActivationTokens(lisa));

            resend(lisa).then().statusCode(409);

            assertEquals(1, data.countActiveActivationTokens(lisa), "le jeton existant n'est pas invalidé");
            assertFalse(data.tokenConsumed(existing));
            assertTrue(mailsTo(email).isEmpty(), "aucun mail vers un compte activé");
            AuthFixture.loginCookie(email, PWD);
        }
    }

    @Nested
    @DisplayName("Scénario : un compte créé par une invitation d'owner")
    class CompteInvitation {

        private record Invited(String email, UUID id, UUID baby, String inviteToken) {
        }

        private Invited inviteByOwner() {
            String ownerEmail = data.uniqueEmail("owner");
            UUID owner = data.createUser(ownerEmail, "Marc", "parent", PWD);
            UUID baby = data.createBaby("Léa");
            data.link(owner, baby);
            String email = data.uniqueEmail("jeanne");
            String token = given().cookie(AuthFixture.COOKIE, AuthFixture.loginCookie(ownerEmail, PWD))
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Jeanne"))
                    .when().post("/api/babies/{babyId}/invitations", baby)
                    .then().statusCode(201)
                    .extract().path("token");
            mailbox.clear();
            return new Invited(email, data.userIdByEmail(email), baby, token);
        }

        @Test
        void activee_par_le_lien_renvoye_elle_accepte_ensuite_l_invitation_en_session() {
            Invited invited = inviteByOwner();

            String link = resend(invited.id()).then().statusCode(200).extract().path("activationLink");
            activate(tokenOf(link), CHOSEN_PWD).then().statusCode(204);

            assertEquals("active", statusOf(invited.email()));
            String cookie = AuthFixture.loginCookie(invited.email(), CHOSEN_PWD);
            given().when().get("/api/invitations/{token}", invited.inviteToken())
                    .then().statusCode(200).body("needsPassword", is(false));
            given().cookie(AuthFixture.COOKIE, cookie).contentType(ContentType.JSON).body(Map.of())
                    .when().post("/api/invitations/{token}/accept", invited.inviteToken())
                    .then().statusCode(204);
            assertTrue(data.isLinkedHelper(invited.id(), invited.baby()));
            assertFalse(data.isOwner(invited.id(), invited.baby()));
        }
    }

    @Nested
    @DisplayName("Scénario : l'invitation est acceptée après le renvoi (D20-AA)")
    class CompteInvitationOrdreInverse {

        @Test
        void le_lien_d_activation_renvoye_repond_410_et_le_mot_de_passe_de_l_invitation_reste() {
            String ownerEmail = data.uniqueEmail("owner");
            UUID owner = data.createUser(ownerEmail, "Marc", "parent", PWD);
            UUID baby = data.createBaby("Léa");
            data.link(owner, baby);
            String email = data.uniqueEmail("jeanne");
            String inviteToken = given().cookie(AuthFixture.COOKIE, AuthFixture.loginCookie(ownerEmail, PWD))
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Jeanne"))
                    .when().post("/api/babies/{babyId}/invitations", baby)
                    .then().statusCode(201)
                    .extract().path("token");
            String link = resend(data.userIdByEmail(email)).then().statusCode(200).extract().path("activationLink");

            given().contentType(ContentType.JSON).body(Map.of("password", INVITATION_PWD))
                    .when().post("/api/invitations/{token}/accept", inviteToken)
                    .then().statusCode(204);

            activate(tokenOf(link), CHOSEN_PWD).then().statusCode(410);
            AuthFixture.loginCookie(email, INVITATION_PWD);
            given().contentType("application/x-www-form-urlencoded")
                    .formParam("email", email).formParam("password", CHOSEN_PWD)
                    .when().post("/api/login")
                    .then().statusCode(401);
            assertEquals("active", statusOf(email));
        }
    }

    @Nested
    @DisplayName("Scénario : deux renvois successifs")
    class Doublon {

        @Test
        void un_seul_jeton_reste_actif_et_seul_le_dernier_lien_active() {
            String email = data.uniqueEmail("jeanne");
            UUID jeanne = data.createPendingParent(email);

            String first = resend(jeanne).then().statusCode(200).extract().path("activationLink");
            String second = resend(jeanne).then().statusCode(200).extract().path("activationLink");

            assertEquals(1, data.countActiveActivationTokens(jeanne));
            activate(tokenOf(first), CHOSEN_PWD).then().statusCode(410);
            activate(tokenOf(second), CHOSEN_PWD).then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : accès réservé à l'administrateur")
    class Acces {

        @Test
        void parent_recoit_403_sans_jeton_ni_mail() {
            String parentEmail = data.uniqueEmail("parent");
            data.createActiveParent(parentEmail, PWD);
            String email = data.uniqueEmail("jeanne");
            UUID jeanne = data.createPendingParent(email);

            resend(AuthFixture.loginCookie(parentEmail, PWD), jeanne).then().statusCode(403);

            assertEquals(0, data.countActivationTokens(jeanne));
            assertTrue(mailsTo(email).isEmpty());
        }

        @Test
        void sans_session_recoit_401_sans_jeton_ni_mail() {
            String email = data.uniqueEmail("jeanne");
            UUID jeanne = data.createPendingParent(email);

            given().when().post("/api/admin/users/{id}/activation-link", jeanne).then().statusCode(401);

            assertEquals(0, data.countActivationTokens(jeanne));
            assertTrue(mailsTo(email).isEmpty());
        }

        @Test
        void compte_inconnu_ou_identifiant_mal_forme_recoit_404() {
            resend(UUID.randomUUID()).then().statusCode(404);
            resend("not-a-uuid").then().statusCode(404);

            assertEquals(0, mailbox.getTotalMessagesSent());
        }
    }
}
