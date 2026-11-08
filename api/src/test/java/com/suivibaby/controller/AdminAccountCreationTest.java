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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 20, US20.2 — the administrator creates a parent account and the activation link is mailed to it.
// The SMTP failure path lives in MailFailureTest (it needs its own test profile).
@QuarkusTest
class AdminAccountCreationTest {

    static final String PWD = "admin-create-pwd-123";
    static final String CHOSEN_PWD = "mot-de-passe-choisi-12";

    @Inject
    TestDataFactory data;

    @Inject
    MockMailbox mailbox;

    String adminEmail;
    String adminCookie;

    @BeforeEach
    void seedAdmin() {
        mailbox.clear();
        adminEmail = data.uniqueEmail("admin");
        data.createUser(adminEmail, "Thomas", "admin", PWD);
        adminCookie = AuthFixture.loginCookie(adminEmail, PWD);
    }

    private Response create(String cookie, String email, String firstName) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .contentType(ContentType.JSON)
                .body(Map.of("email", email, "firstName", firstName))
                .when().post("/api/admin/users");
    }

    private Response create(String email, String firstName) {
        return create(adminCookie, email, firstName);
    }

    // The mailbox answers null for an address that never received anything.
    private List<Mail> mailsTo(String email) {
        List<Mail> mails = mailbox.getMailsSentTo(email);
        return mails == null ? List.of() : mails;
    }

    private static String tokenOf(String activationLink) {
        return activationLink.substring(activationLink.indexOf("token=") + "token=".length());
    }

    private List<Map<String, Object>> listedAccounts() {
        return given().cookie(AuthFixture.COOKIE, adminCookie)
                .when().get("/api/admin/users")
                .then().statusCode(200)
                .extract().jsonPath().getList("$");
    }

    private String statusOf(String email) {
        return listedAccounts().stream()
                .filter(a -> email.equals(a.get("email")))
                .map(a -> (String) a.get("status"))
                .findFirst().orElse(null);
    }

    @Nested
    @DisplayName("Scénario : créer un compte, le mail part")
    class CreationMailEnvoye {

        @Test
        void repond_201_avec_le_lien_et_envoie_un_mail_nominatif() {
            String email = data.uniqueEmail("lisa");

            Response response = create(email, "Lisa");

            response.then().statusCode(201);
            assertEquals(Set.of("userId", "activationLink", "mailSent"), response.jsonPath().getMap("$").keySet());
            assertTrue(response.jsonPath().getBoolean("mailSent"));
            UUID userId = UUID.fromString(response.jsonPath().getString("userId"));
            assertEquals(userId, data.userIdByEmail(email));
            assertEquals("parent", data.userRole(userId));
            assertEquals("pending", statusOf(email));
            String link = response.jsonPath().getString("activationLink");
            List<Mail> mails = mailsTo(email);
            assertEquals(1, mails.size());
            Mail mail = mails.get(0);
            assertEquals(List.of(email), mail.getTo(), "destinataire unique, sans copie");
            assertTrue(mail.getCc() == null || mail.getCc().isEmpty());
            assertTrue(mail.getBcc() == null || mail.getBcc().isEmpty());
            assertEquals("Thomas vous a créé un compte sur Suivi Baby", mail.getSubject());
            assertTrue(mail.getText().contains("Bonjour Lisa"), mail.getText());
            assertTrue(mail.getText().contains("Thomas vous a créé un compte sur Suivi Baby."), mail.getText());
            assertTrue(mail.getText().contains(link), "le texte porte le lien de la réponse");
            assertTrue(mail.getText().contains("7 jours"), mail.getText());
            assertTrue(mail.getHtml().contains(link), "la version HTML porte le même lien");
        }
    }

    @Nested
    @DisplayName("Scénario : le mail ne contient rien d'autre")
    class RienDAutre {

        @Test
        void ni_email_de_l_admin_ni_email_d_un_tiers_ni_mot_de_passe_ni_donnee_de_suivi() {
            String bystander = data.uniqueEmail("tiers");
            data.createActiveParent(bystander, PWD);
            String email = data.uniqueEmail("lisa");

            create(email, "Lisa").then().statusCode(201);

            Mail mail = mailsTo(email).get(0);
            for (String content : List.of(mail.getSubject(), mail.getText(), mail.getHtml())) {
                String lower = content.toLowerCase();
                assertFalse(lower.contains(adminEmail.toLowerCase()), "email de l'admin : " + content);
                assertFalse(lower.contains(bystander.toLowerCase()), "email d'un tiers : " + content);
                for (String forbidden : List.of("mot de passe :", "biberon", "sieste", "couche", "température",
                        "poids")) {
                    assertFalse(lower.contains(forbidden), forbidden + " : " + content);
                }
            }
        }
    }

    @Nested
    @DisplayName("Scénario : email déjà utilisé")
    class EmailDejaUtilise {

        @Test
        void renvoie_409_pour_un_compte_actif_en_attente_ou_cree_par_invitation_sans_mail() {
            String active = data.uniqueEmail("actif");
            data.createActiveParent(active, PWD);
            String pending = data.uniqueEmail("attente");
            data.createPendingParent(pending);
            // A pending account born from an owner's invitation.
            String ownerEmail = data.uniqueEmail("owner");
            UUID owner = data.createUser(ownerEmail, "Marc", "parent", PWD);
            UUID baby = data.createBaby("Léa");
            data.link(owner, baby);
            String invited = data.uniqueEmail("invite");
            given().cookie(AuthFixture.COOKIE, AuthFixture.loginCookie(ownerEmail, PWD))
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", invited, "firstName", "Jeanne"))
                    .when().post("/api/babies/{babyId}/invitations", baby)
                    .then().statusCode(201);
            mailbox.clear();

            create(active, "Autre").then().statusCode(409);
            create(pending, "Autre").then().statusCode(409);
            create(invited, "Autre").then().statusCode(409);

            for (String email : List.of(active, pending, invited)) {
                assertEquals(1, data.countUsersByEmail(email));
                assertTrue(mailsTo(email).isEmpty(), "aucun mail sur un refus : " + email);
            }
        }
    }

    @Nested
    @DisplayName("Scénario : saisie invalide")
    class SaisieInvalide {

        @ParameterizedTest(name = "email=[{0}] prénom=[{1}] → 400")
        @CsvSource(value = {"'',Lisa", "pas-un-email,Lisa", "VALID,''"})
        void refuse_en_400_sans_compte_ni_mail(String emailCase, String firstName) {
            String email = "VALID".equals(emailCase) ? data.uniqueEmail("lisa") : emailCase;

            create(email, firstName).then().statusCode(400);

            assertNull(data.userIdByEmail(email));
            assertTrue(mailsTo(email).isEmpty());
        }
    }

    @Nested
    @DisplayName("Scénario : deux créations successives du même email")
    class Doublon {

        @Test
        void la_seconde_renvoie_409_et_un_seul_mail_part() {
            String email = data.uniqueEmail("lisa");

            create(email, "Lisa").then().statusCode(201);
            create(email, "Lisa").then().statusCode(409);

            assertEquals(1, data.countUsersByEmail(email));
            assertEquals(1, mailsTo(email).size());
        }
    }

    @Nested
    @DisplayName("Scénario : activer le compte reçu")
    class ActivationRecue {

        @Test
        void le_lien_de_la_reponse_active_le_compte_qui_passe_actif() {
            String email = data.uniqueEmail("lisa");
            String link = create(email, "Lisa").then().statusCode(201).extract().path("activationLink");

            given().contentType(ContentType.JSON)
                    .body(Map.of("token", tokenOf(link), "password", CHOSEN_PWD))
                    .when().post("/api/activation")
                    .then().statusCode(204);

            assertEquals("active", statusOf(email));
            assertNotNull(AuthFixture.loginCookie(email, CHOSEN_PWD));
        }
    }

    @Nested
    @DisplayName("Scénario : accès réservé à l'administrateur")
    class Acces {

        @Test
        void parent_recoit_403_sans_compte_ni_mail() {
            String parentEmail = data.uniqueEmail("parent");
            data.createActiveParent(parentEmail, PWD);
            String email = data.uniqueEmail("lisa");

            create(AuthFixture.loginCookie(parentEmail, PWD), email, "Lisa").then().statusCode(403);

            assertNull(data.userIdByEmail(email));
            assertTrue(mailsTo(email).isEmpty());
        }

        @Test
        void sans_session_recoit_401_sans_compte_ni_mail() {
            String email = data.uniqueEmail("lisa");

            given().contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Lisa"))
                    .when().post("/api/admin/users")
                    .then().statusCode(401);

            assertNull(data.userIdByEmail(email));
            assertTrue(mailsTo(email).isEmpty());
        }
    }
}
