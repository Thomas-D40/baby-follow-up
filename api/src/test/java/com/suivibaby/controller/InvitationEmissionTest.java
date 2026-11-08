package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Épic 17, US17.1 — an owner invites a relative by email: the account is created when it does not
 * exist, and the response is identical either way (D17-G).
 */
@QuarkusTest
class InvitationEmissionTest {

    static final String PWD = "emission-pwd-123";

    @Inject
    TestDataFactory data;

    private record Account(UUID id, String email, String cookie) {
    }

    // Active parent with an open session.
    private Account parent(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID id = data.createActiveParent(email, PWD);
        return new Account(id, email, AuthFixture.loginCookie(email, PWD));
    }

    // Every emission request carries a JSON content type: without it @Consumes answers 415, not 400.
    private Response invite(String cookie, UUID babyId, Object body) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/babies/{babyId}/invitations", babyId);
    }

    private Response invite(String cookie, UUID babyId, String email, String firstName) {
        return invite(cookie, babyId, Map.of("email", email, "firstName", firstName));
    }

    private Response accept(UUID token, Object body) {
        return given().contentType(ContentType.JSON).body(body)
                .when().post("/api/invitations/{token}/accept", token);
    }

    // key -> value type, to compare the shape of two bodies independently of their values.
    private static Map<String, String> shape(Map<String, Object> body) {
        Map<String, String> shape = new TreeMap<>();
        body.forEach((key, value) -> shape.put(key, value == null ? "null" : value.getClass().getSimpleName()));
        return shape;
    }

    private Map<String, Object> created(Response response) {
        return response.then().statusCode(201).extract().jsonPath().getMap("$");
    }

    @Nested
    @DisplayName("Scénario : inviter quelqu'un qui n'a pas de compte")
    class SansCompte {

        @Test
        void cree_un_compte_en_attente_et_une_invitation_nominative() {
            Account owner = parent("owner");
            UUID baby = data.createBaby("Léa");
            data.link(owner.id(), baby);
            String email = data.uniqueEmail("jeanne");

            Map<String, Object> body = created(invite(owner.cookie(), baby, email, "Jeanne"));

            UUID invitee = data.userIdByEmail(email);
            assertNotNull(invitee, "le compte doit avoir été créé");
            assertEquals("parent", data.userRole(invitee));
            assertEquals("Jeanne", data.userFirstName(invitee));
            assertNull(data.activatedAt(invitee), "compte en attente d'activation");
            assertEquals(0, data.countActivationTokens(invitee), "aucun jeton d'activation n'est émis");
            assertFalse(data.isLinkedHelper(invitee, baby), "aucun lien bébé avant l'acceptation");
            // The placeholder password cannot open a session, whatever is typed.
            given().contentType("application/x-www-form-urlencoded")
                    .formParam("email", email).formParam("password", "un-mot-de-passe-quelconque")
                    .when().post("/api/login")
                    .then().statusCode(401);

            UUID token = UUID.fromString((String) body.get("token"));
            assertEquals(invitee, data.invitationInvitee(token));
            assertEquals(owner.id(), data.invitationCreatedBy(token));
            assertNull(data.invitationAcceptedBy(token));
            assertFalse(data.invitationConsumed(token));
            Duration drift = Duration.between(Instant.now().plus(3, ChronoUnit.DAYS),
                    data.invitationExpiresAt(token)).abs();
            assertTrue(drift.compareTo(Duration.ofMinutes(1)) < 0, "expiration à 3 jours, écart " + drift);

            assertEquals(Set.of("token", "link", "inviteeEmail", "expiresAt", "mailSent"), body.keySet());
            assertEquals(email, body.get("inviteeEmail"));
            assertTrue(((String) body.get("link")).endsWith("/invite?token=" + token));
        }
    }

    @Nested
    @DisplayName("Scénario : inviter quelqu'un qui a déjà un compte")
    class AvecCompte {

        @Test
        void laisse_le_compte_intact_et_repond_comme_pour_un_compte_neuf() {
            Account owner = parent("owner");
            UUID baby = data.createBaby("Léa");
            data.link(owner.id(), baby);

            String freshEmail = data.uniqueEmail("jeanne");
            Map<String, Object> freshBody = created(invite(owner.cookie(), baby, freshEmail, "Jeanne"));

            String existingEmail = data.uniqueEmail("pierre");
            UUID existing = data.createUser(existingEmail, "Pierre", "parent", PWD);
            data.link(existing, data.createBaby("Autre"));
            String hashBefore = data.passwordHash(existing);
            Instant activatedBefore = data.activatedAt(existing);
            assertNotNull(activatedBefore, "the existing account is activated");

            Map<String, Object> existingBody = created(invite(owner.cookie(), baby, existingEmail, "Papi"));

            assertEquals(1, data.countUsersByEmail(existingEmail), "pas de doublon de compte");
            assertEquals("Pierre", data.userFirstName(existing), "le prénom du compte existant ne change pas");
            assertEquals(hashBefore, data.passwordHash(existing));
            assertEquals(activatedBefore, data.activatedAt(existing));
            UUID token = UUID.fromString((String) existingBody.get("token"));
            assertEquals(existing, data.invitationInvitee(token));
            // D17-G: the owner cannot tell whether the account existed.
            assertEquals(shape(freshBody), shape(existingBody));
        }
    }

    @Nested
    @DisplayName("Scénario : le destinataire est déjà dans le cercle")
    class DejaMembre {

        @Test
        void renvoie_409_sans_invitation_ni_modification_du_compte() {
            Account owner = parent("owner");
            UUID baby = data.createBaby("Léa");
            data.link(owner.id(), baby);
            String memberEmail = data.uniqueEmail("membre");
            UUID member = data.createUser(memberEmail, "Marc", "parent", PWD);
            data.linkAsCaregiver(member, baby);
            String hashBefore = data.passwordHash(member);

            invite(owner.cookie(), baby, memberEmail, "Papi").then().statusCode(409);

            assertEquals(0, data.countActiveInvitations(baby));
            assertEquals("Marc", data.userFirstName(member));
            assertEquals(hashBefore, data.passwordHash(member));
        }
    }

    @Nested
    @DisplayName("Scénario : ré-inviter la même personne")
    class Reinvitation {

        @Test
        void invalide_l_ancienne_invitation_de_ce_destinataire_seulement() {
            Account owner = parent("owner");
            UUID baby = data.createBaby("Léa");
            data.link(owner.id(), baby);
            String email = data.uniqueEmail("jeanne");

            UUID first = UUID.fromString((String) created(invite(owner.cookie(), baby, email, "Jeanne")).get("token"));
            UUID second = UUID.fromString((String) created(invite(owner.cookie(), baby, email, "Jeanne")).get("token"));

            assertEquals(1, data.countUsersByEmail(email));
            assertTrue(data.invitationConsumed(first), "l'ancien lien est invalidé");
            assertFalse(data.invitationConsumed(second));
            assertEquals(1, data.countActiveInvitations(baby));
            assertNotEquals(first, second);
        }
    }

    @Nested
    @DisplayName("Scénario : deux invitations en parallèle pour deux personnes")
    class DeuxInvitations {

        @Test
        void ne_s_invalident_pas_entre_elles() {
            Account owner = parent("owner");
            UUID baby = data.createBaby("Léa");
            data.link(owner.id(), baby);
            UUID mamie = UUID.fromString(
                    (String) created(invite(owner.cookie(), baby, data.uniqueEmail("mamie"), "Mamie")).get("token"));
            created(invite(owner.cookie(), baby, data.uniqueEmail("papi"), "Papi"));

            assertEquals(2, data.countActiveInvitations(baby));
            // Mamie's link still works: her pending account sets its password through it.
            accept(mamie, Map.of("password", "mot-de-passe-de-mamie-1")).then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : gardes d'accès")
    class Gardes {

        @Test
        void bebe_non_lie_renvoie_404() {
            Account stranger = parent("stranger");
            UUID baby = data.createBaby("Léa");
            String email = data.uniqueEmail("jeanne");

            invite(stranger.cookie(), baby, email, "Jeanne").then().statusCode(404);

            assertNull(data.userIdByEmail(email));
        }

        @Test
        void non_owner_renvoie_403() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Léa");
            data.link(owner.id(), baby);
            data.linkAsCaregiver(guest.id(), baby);
            String email = data.uniqueEmail("jeanne");

            invite(guest.cookie(), baby, email, "Jeanne").then().statusCode(403);

            assertNull(data.userIdByEmail(email));
            assertEquals(0, data.countActiveInvitations(baby));
        }

        @Test
        void sans_session_renvoie_401() {
            UUID baby = data.createBaby("Léa");
            String email = data.uniqueEmail("jeanne");

            given().contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Jeanne"))
                    .when().post("/api/babies/{babyId}/invitations", baby)
                    .then().statusCode(401);

            assertNull(data.userIdByEmail(email));
        }
    }

    @Nested
    @DisplayName("Scénario : saisie invalide")
    class SaisieInvalide {

        private UUID babyOf(Account owner) {
            UUID baby = data.createBaby("Léa");
            data.link(owner.id(), baby);
            return baby;
        }

        @ParameterizedTest(name = "email=[{0}] prénom=[{1}] → 400")
        @CsvSource(value = {"'',Jeanne", "pas-un-email,Jeanne", "VALID,''", "VALID,'   '"})
        void refuse_en_400_sans_compte_ni_invitation(String emailCase, String firstName) {
            Account owner = parent("owner");
            UUID baby = babyOf(owner);
            String email = "VALID".equals(emailCase) ? data.uniqueEmail("jeanne") : emailCase;

            invite(owner.cookie(), baby, email, firstName).then().statusCode(400);

            assertNull(data.userIdByEmail(email));
            assertEquals(0, data.countActiveInvitations(baby));
        }

        @Test
        void corps_vide_renvoie_400() {
            Account owner = parent("owner");
            UUID baby = babyOf(owner);

            given().cookie(AuthFixture.COOKIE, owner.cookie())
                    .contentType(ContentType.JSON)
                    .body("")
                    .when().post("/api/babies/{babyId}/invitations", baby)
                    .then().statusCode(400);

            assertEquals(0, data.countActiveInvitations(baby));
        }

        @Test
        void champs_absents_renvoient_400() {
            Account owner = parent("owner");
            UUID baby = babyOf(owner);

            invite(owner.cookie(), baby, Map.of()).then().statusCode(400);

            assertEquals(0, data.countActiveInvitations(baby));
        }
    }
}
