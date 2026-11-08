package com.suivibaby.controller;

import com.suivibaby.model.MilkType;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.mailer.Mail;
import io.quarkus.mailer.MockMailbox;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.ConfigProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 17, US17.3 — the invitation mail, read from the mock mailbox. The SMTP failure path lives in
// MailFailureTest (it needs its own test profile).
@QuarkusTest
class InvitationMailTest {

    static final String PWD = "mail-pwd-123";

    @Inject
    TestDataFactory data;

    @Inject
    MockMailbox mailbox;

    private record Owner(UUID id, String email, String cookie, UUID baby) {
    }

    @BeforeEach
    void clearMailbox() {
        mailbox.clear();
    }

    // Owner with a first name and a baby, created through the API so that the baby carries a birth date.
    private Owner owner(String ownerFirstName, String babyFirstName) {
        String email = data.uniqueEmail("owner");
        UUID id = data.createUser(email, ownerFirstName, "parent", PWD);
        String cookie = AuthFixture.loginCookie(email, PWD);
        String baby = given().cookie(AuthFixture.COOKIE, cookie)
                .contentType(ContentType.JSON)
                .body(Map.of("firstName", babyFirstName, "birthDate", "2026-01-15", "sex", "female"))
                .when().post("/api/babies")
                .then().statusCode(201)
                .extract().path("id");
        return new Owner(id, email, cookie, UUID.fromString(baby));
    }

    private Response invite(String cookie, UUID babyId, String email, String firstName) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .contentType(ContentType.JSON)
                .body(Map.of("email", email, "firstName", firstName))
                .when().post("/api/babies/{babyId}/invitations", babyId);
    }

    // The mailbox answers null for an address that never received anything.
    private List<Mail> mailsTo(String email) {
        List<Mail> mails = mailbox.getMailsSentTo(email);
        return mails == null ? List.of() : mails;
    }

    @Nested
    @DisplayName("Scénario : envoi nominal")
    class EnvoiNominal {

        @Test
        void envoie_un_seul_mail_nominatif_au_destinataire_avec_le_lien() {
            Owner owner = owner("Thomas", "Léa");
            String invitee = data.uniqueEmail("jeanne");

            Response response = invite(owner.cookie(), owner.baby(), invitee, "Jeanne");

            response.then().statusCode(201);
            assertTrue(response.jsonPath().getBoolean("mailSent"));
            String link = response.jsonPath().getString("link");
            List<Mail> mails = mailsTo(invitee);
            assertEquals(1, mails.size());
            Mail mail = mails.get(0);
            assertEquals(List.of(invitee), mail.getTo(), "destinataire unique, sans copie");
            assertTrue(mail.getCc() == null || mail.getCc().isEmpty());
            assertTrue(mail.getBcc() == null || mail.getBcc().isEmpty());
            assertEquals("Thomas vous invite à suivre Léa sur Suivi Baby", mail.getSubject());
            assertTrue(mail.getText().contains("Thomas vous invite à suivre Léa sur Suivi Baby."), mail.getText());
            assertTrue(mail.getText().contains(link), "le texte porte le lien de la réponse");
            assertTrue(mail.getText().contains("3 jours"), mail.getText());
            assertTrue(mail.getText().contains("utilisable une seule fois"), mail.getText());
            assertTrue(mail.getHtml().contains(link), "la version HTML porte le même lien");
        }
    }

    @Nested
    @DisplayName("Scénario : le mail ne contient rien de sensible")
    class RienDeSensible {

        @Test
        void ni_email_de_l_inviteur_ni_donnee_de_suivi_ni_mot_de_passe() {
            Owner owner = owner("Thomas", "Léa");
            data.createBottleFeeding(owner.baby(), owner.id(), Instant.now(), 120, MilkType.formula);
            String invitee = data.uniqueEmail("jeanne");

            invite(owner.cookie(), owner.baby(), invitee, "Jeanne").then().statusCode(201);

            Mail mail = mailsTo(invitee).get(0);
            for (String content : List.of(mail.getSubject(), mail.getText(), mail.getHtml())) {
                String lower = content.toLowerCase();
                assertFalse(lower.contains(owner.email().toLowerCase()), "email de l'inviteur : " + content);
                for (String forbidden : List.of("2026-01-15", "15/01/2026", "biberon", "sieste", "couche",
                        "température", "poids", "mot de passe")) {
                    assertFalse(lower.contains(forbidden), forbidden + " : " + content);
                }
            }
        }

        @Test
        void les_prenoms_sont_echappes_dans_la_version_html() {
            Owner owner = owner("<b>X</b>", "<i>Y</i>");
            String invitee = data.uniqueEmail("jeanne");

            invite(owner.cookie(), owner.baby(), invitee, "Jeanne").then().statusCode(201);

            String html = mailsTo(invitee).get(0).getHtml();
            assertTrue(html.contains("&lt;b&gt;"), html);
            assertTrue(html.contains("&lt;i&gt;"), html);
            assertFalse(html.contains("<b>X</b>"), "le prénom ne doit pas être interprété comme du HTML");
            assertFalse(html.contains("<i>Y</i>"), "le prénom du bébé ne doit pas être interprété comme du HTML");
        }
    }

    @Nested
    @DisplayName("Scénario : aucun envoi sur un refus")
    class AucunEnvoiSurRefus {

        @Test
        void non_lie_404_non_owner_403_membre_409_et_saisie_400_n_envoient_rien() {
            Owner owner = owner("Thomas", "Léa");
            String stranger = data.uniqueEmail("etranger");
            data.createActiveParent(stranger, PWD);
            String strangerCookie = AuthFixture.loginCookie(stranger, PWD);
            String guestEmail = data.uniqueEmail("guest");
            data.linkAsCaregiver(data.createActiveParent(guestEmail, PWD), owner.baby());
            String memberEmail = data.uniqueEmail("membre");
            data.linkAsCaregiver(data.createActiveParent(memberEmail, PWD), owner.baby());

            String invitee = data.uniqueEmail("jeanne");
            // 404: not linked to the baby.
            invite(strangerCookie, owner.baby(), invitee, "Jeanne").then().statusCode(404);
            // 403: linked, not owner.
            invite(AuthFixture.loginCookie(guestEmail, PWD), owner.baby(), invitee, "Jeanne").then().statusCode(403);
            // 409: the recipient is already in the circle.
            invite(owner.cookie(), owner.baby(), memberEmail, "Membre").then().statusCode(409);
            // 400: invalid first name.
            invite(owner.cookie(), owner.baby(), invitee, "").then().statusCode(400);

            assertTrue(mailsTo(invitee).isEmpty(), "aucun mail vers le destinataire invité");
            assertTrue(mailsTo(memberEmail).isEmpty(), "aucun mail vers le membre déjà dans le cercle");
        }
    }

    @Nested
    @DisplayName("Scénario : test et dev n'envoient jamais de vrai mail")
    class Configuration {

        @Test
        void le_mailer_est_en_mode_mock_et_l_envoi_est_actif_en_test() {
            var config = ConfigProvider.getConfig();

            assertTrue(config.getValue("quarkus.mailer.mock", Boolean.class));
            assertTrue(config.getValue("app.mail.enabled", Boolean.class));
        }
    }
}
