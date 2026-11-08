package com.suivibaby.controller;

import com.suivibaby.service.InvitationService;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import jakarta.transaction.UserTransaction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 17, US17.2 — the recipient joins a baby, setting its password in the same step when the
// account is still pending. The accept route is public: the service alone decides (R7).
@QuarkusTest
class InvitationAcceptanceTest {

    static final String PWD = "acceptance-pwd-123";
    static final String INVITATION_PWD = "mot-de-passe-invitation-1";

    @Inject
    TestDataFactory data;

    @Inject
    InvitationService invitationService;

    @Inject
    UserTransaction userTransaction;

    private record Account(UUID id, String email, String cookie) {
    }

    // One baby with its owner (first name "Thomas"), the context of every scenario.
    private record Circle(Account owner, UUID baby) {
    }

    private Account activeParent(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID id = data.createActiveParent(email, PWD);
        return new Account(id, email, AuthFixture.loginCookie(email, PWD));
    }

    private Circle circle() {
        String email = data.uniqueEmail("owner");
        UUID id = data.createUser(email, "Thomas", "parent", PWD);
        UUID baby = data.createBaby("Léa");
        data.link(id, baby);
        return new Circle(new Account(id, email, AuthFixture.loginCookie(email, PWD)), baby);
    }

    // Pending recipient: created by the owner's invitation, never activated.
    private UUID pendingInvitee(String email) {
        return data.createUser(email, "Jeanne", "parent", null);
    }

    private UUID invitation(Circle circle, UUID invitee) {
        return data.createInvitation(circle.baby(), circle.owner().id(), invitee,
                Instant.now().plus(3, ChronoUnit.DAYS), null);
    }

    private Response preview(Object token) {
        return given().when().get("/api/invitations/{token}", token);
    }

    // The accept request always carries a JSON body: without a content type it answers 415.
    private Response accept(Object token, String cookieOrNull, Object body) {
        var request = given().contentType(ContentType.JSON).body(body);
        if (cookieOrNull != null) {
            request = request.cookie(AuthFixture.COOKIE, cookieOrNull);
        }
        return request.when().post("/api/invitations/{token}/accept", token);
    }

    private void assertLoginRefused(String email, String password) {
        given().contentType("application/x-www-form-urlencoded")
                .formParam("email", email).formParam("password", password)
                .when().post("/api/login")
                .then().statusCode(401);
    }

    @Nested
    @DisplayName("Scénario : nouveau compte, parcours nominal")
    class NouveauCompte {

        @Test
        void le_pre_vol_public_annonce_qu_un_mot_de_passe_est_attendu() {
            Circle c = circle();
            String email = data.uniqueEmail("jeanne");
            UUID token = invitation(c, pendingInvitee(email));

            Map<String, Object> body = preview(token).then().statusCode(200)
                    .body("needsPassword", is(true))
                    .body("inviterFirstName", is("Thomas"))
                    .body("babyFirstName", is("Léa"))
                    .body("inviteeEmail", is(email))
                    .body("expiresAt", notNullValue())
                    .extract().jsonPath().getMap("$");

            // The public pre-flight discloses nothing beyond what the screen needs.
            assertEquals(Set.of("needsPassword", "inviteeEmail", "inviterFirstName", "babyFirstName", "expiresAt"),
                    body.keySet());
        }

        @Test
        void l_acceptation_pose_le_mot_de_passe_et_rattache_en_non_owner_sans_session() {
            Circle c = circle();
            String email = data.uniqueEmail("jeanne");
            UUID invitee = pendingInvitee(email);
            UUID token = invitation(c, invitee);

            Response response = accept(token, null, Map.of("password", INVITATION_PWD));

            response.then().statusCode(204);
            assertFalse(response.getDetailedCookies().hasCookieWithName(AuthFixture.COOKIE),
                    "aucune session n'est posée par l'acceptation (D17-F)");
            assertNotNull(data.activatedAt(invitee));
            AuthFixture.loginCookie(email, INVITATION_PWD);
            assertTrue(data.isLinkedHelper(invitee, c.baby()));
            assertFalse(data.isOwner(invitee, c.baby()), "un lien accepté ne doit jamais être owner");
            assertTrue(data.invitationConsumed(token));
            assertEquals(invitee, data.invitationAcceptedBy(token));
        }

        @Test
        void un_compte_en_attente_ignore_la_session_eventuellement_presente() {
            Circle c = circle();
            Account bystander = activeParent("bystander");
            String email = data.uniqueEmail("jeanne");
            UUID invitee = pendingInvitee(email);
            UUID token = invitation(c, invitee);

            accept(token, bystander.cookie(), Map.of("password", INVITATION_PWD)).then().statusCode(204);

            assertTrue(data.isLinkedHelper(invitee, c.baby()));
            assertFalse(data.isLinkedHelper(bystander.id(), c.baby()));
        }
    }

    @Nested
    @DisplayName("Scénario : compte existant, parcours nominal")
    class CompteExistant {

        @Test
        void le_destinataire_connecte_accepte_sans_mot_de_passe() {
            Circle c = circle();
            Account invitee = activeParent("pierre");
            UUID token = invitation(c, invitee.id());
            String hashBefore = data.passwordHash(invitee.id());

            preview(token).then().statusCode(200).body("needsPassword", is(false));
            accept(token, invitee.cookie(), Map.of()).then().statusCode(204);

            assertTrue(data.isLinkedHelper(invitee.id(), c.baby()));
            assertFalse(data.isOwner(invitee.id(), c.baby()));
            assertTrue(data.invitationConsumed(token));
            assertEquals(invitee.id(), data.invitationAcceptedBy(token));
            assertEquals(hashBefore, data.passwordHash(invitee.id()));
        }
    }

    @Nested
    @DisplayName("Scénario : le mauvais compte est connecté (R2 de l'Épic 8, soldé)")
    class MauvaisCompte {

        @Test
        void renvoie_403_sans_lien_ni_jeton_consomme_puis_le_destinataire_peut_accepter() {
            Circle c = circle();
            Account invitee = activeParent("mamie");
            Account other = activeParent("parent");
            UUID token = invitation(c, invitee.id());

            accept(token, other.cookie(), Map.of()).then().statusCode(403);

            assertFalse(data.isLinkedHelper(other.id(), c.baby()));
            assertFalse(data.isLinkedHelper(invitee.id(), c.baby()));
            assertFalse(data.invitationConsumed(token), "le jeton reste utilisable par son destinataire");

            accept(token, invitee.cookie(), Map.of()).then().statusCode(204);
            assertTrue(data.isLinkedHelper(invitee.id(), c.baby()));
        }
    }

    @Nested
    @DisplayName("Scénario : compte activé, sans session")
    class SansSession {

        @Test
        void renvoie_401_sans_consommer_le_jeton() {
            Circle c = circle();
            Account invitee = activeParent("mamie");
            UUID token = invitation(c, invitee.id());

            accept(token, null, Map.of()).then().statusCode(401);

            assertFalse(data.invitationConsumed(token));
            assertFalse(data.isLinkedHelper(invitee.id(), c.baby()));
        }

        @Test
        void un_mot_de_passe_fourni_sans_session_renvoie_401_sans_toucher_au_compte() {
            Circle c = circle();
            Account invitee = activeParent("mamie");
            UUID token = invitation(c, invitee.id());
            String hashBefore = data.passwordHash(invitee.id());

            accept(token, null, Map.of("password", INVITATION_PWD)).then().statusCode(401);

            assertEquals(hashBefore, data.passwordHash(invitee.id()));
            assertFalse(data.invitationConsumed(token));
        }

        @Test
        void un_mot_de_passe_n_est_jamais_applique_a_un_compte_active_meme_connecte() {
            Circle c = circle();
            Account invitee = activeParent("mamie");
            UUID token = invitation(c, invitee.id());
            String hashBefore = data.passwordHash(invitee.id());

            accept(token, invitee.cookie(), Map.of("password", INVITATION_PWD)).then().statusCode(400);

            assertEquals(hashBefore, data.passwordHash(invitee.id()));
            assertFalse(data.invitationConsumed(token));
            assertFalse(data.isLinkedHelper(invitee.id(), c.baby()));
            AuthFixture.loginCookie(invitee.email(), PWD); // the former password still opens the account
            assertLoginRefused(invitee.email(), INVITATION_PWD);
        }
    }

    @Nested
    @DisplayName("Scénario : mot de passe manquant ou trop court")
    class MotDePasse {

        @Test
        void refuse_en_400_sans_consommer_le_jeton_puis_accepte_un_mot_de_passe_conforme() {
            Circle c = circle();
            String email = data.uniqueEmail("jeanne");
            UUID invitee = pendingInvitee(email);
            UUID token = invitation(c, invitee);
            String hashBefore = data.passwordHash(invitee);

            accept(token, null, Map.of()).then().statusCode(400);
            accept(token, null, "{\"password\":null}").then().statusCode(400);
            accept(token, null, Map.of("password", "court")).then().statusCode(400);

            assertFalse(data.invitationConsumed(token));
            assertEquals(hashBefore, data.passwordHash(invitee));
            assertNull(data.activatedAt(invitee));
            assertFalse(data.isLinkedHelper(invitee, c.baby()));

            accept(token, null, Map.of("password", INVITATION_PWD)).then().statusCode(204);
            assertNotNull(data.activatedAt(invitee));
        }
    }

    @Nested
    @DisplayName("Scénario : jeton invalide")
    class JetonInvalide {

        // Each case yields a token the service must treat as gone, at the pre-flight and at acceptance.
        private Object tokenFor(String kind, Circle c, UUID invitee) {
            return switch (kind) {
                case "inexistant" -> UUID.randomUUID();
                case "mal-forme" -> "not-a-uuid";
                case "expire" -> data.createInvitation(c.baby(), c.owner().id(), invitee,
                        Instant.now().minus(1, ChronoUnit.HOURS), null);
                // Revoked: consumed without any recipient having accepted.
                case "revoque" -> data.createInvitation(c.baby(), c.owner().id(), invitee,
                        Instant.now().plus(3, ChronoUnit.DAYS), Instant.now());
                case "consomme" -> {
                    UUID token = invitation(c, invitee);
                    accept(token, null, Map.of("password", INVITATION_PWD)).then().statusCode(204);
                    yield token;
                }
                default -> throw new IllegalArgumentException(kind);
            };
        }

        @ParameterizedTest(name = "jeton {0} → 410 au pré-vol et à l''acceptation")
        @ValueSource(strings = {"inexistant", "mal-forme", "expire", "revoque", "consomme"})
        void renvoie_410(String kind) {
            Circle c = circle();
            UUID invitee = pendingInvitee(data.uniqueEmail("jeanne"));
            Object token = tokenFor(kind, c, invitee);

            preview(token).then().statusCode(410);
            accept(token, null, Map.of("password", INVITATION_PWD + "-bis")).then().statusCode(410);
        }
    }

    @Nested
    @DisplayName("Scénario : déjà membre")
    class DejaMembre {

        @Test
        void renvoie_409_sans_consommer_le_jeton_ni_poser_le_mot_de_passe() {
            Circle c = circle();
            UUID invitee = pendingInvitee(data.uniqueEmail("jeanne"));
            UUID token = invitation(c, invitee);
            data.linkAsCaregiver(invitee, c.baby()); // linked by another path after the emission
            String hashBefore = data.passwordHash(invitee);

            accept(token, null, Map.of("password", INVITATION_PWD)).then().statusCode(409);

            assertFalse(data.invitationConsumed(token));
            assertEquals(1, data.countLink(invitee, c.baby()));
            assertNull(data.activatedAt(invitee));
            assertEquals(hashBefore, data.passwordHash(invitee));
        }

        @Test
        void un_compte_active_deja_lie_recoit_409_sans_double_lien() {
            Circle c = circle();
            Account invitee = activeParent("pierre");
            UUID token = invitation(c, invitee.id());
            data.linkAsCaregiver(invitee.id(), c.baby());

            accept(token, invitee.cookie(), Map.of()).then().statusCode(409);

            assertFalse(data.invitationConsumed(token));
            assertEquals(1, data.countLink(invitee.id(), c.baby()));
        }
    }

    @Nested
    @DisplayName("Scénario : usage unique")
    class UsageUnique {

        @Test
        void le_rejeu_renvoie_410_sans_second_rattachement_ni_second_mot_de_passe() {
            Circle c = circle();
            UUID invitee = pendingInvitee(data.uniqueEmail("jeanne"));
            UUID token = invitation(c, invitee);
            accept(token, null, Map.of("password", INVITATION_PWD)).then().statusCode(204);
            String hashAfter = data.passwordHash(invitee);

            preview(token).then().statusCode(410);
            accept(token, null, Map.of("password", "un-autre-mot-de-passe-12")).then().statusCode(410);

            assertEquals(hashAfter, data.passwordHash(invitee));
            assertEquals(1, data.countLink(invitee, c.baby()));
        }
    }

    @Nested
    @DisplayName("Scénario : un lien d'activation antérieur ne survit pas (D20-AA)")
    class LienActivationAnterieur {

        @Test
        void le_lien_d_activation_repond_410_apres_l_acceptation_par_mot_de_passe() {
            Circle c = circle();
            String email = data.uniqueEmail("jeanne");
            UUID invitee = pendingInvitee(email);
            UUID activationToken = data.createToken(invitee, Instant.now().plus(7, ChronoUnit.DAYS), null);
            UUID token = invitation(c, invitee);

            accept(token, null, Map.of("password", INVITATION_PWD)).then().statusCode(204);

            given().when().get("/api/activation/{token}", activationToken).then().statusCode(410);
            given().contentType(ContentType.JSON)
                    .body(Map.of("token", activationToken.toString(), "password", "autre-mot-de-passe-12"))
                    .when().post("/api/activation")
                    .then().statusCode(410);
            AuthFixture.loginCookie(email, INVITATION_PWD);
            assertLoginRefused(email, "autre-mot-de-passe-12");
        }
    }

    @Nested
    @DisplayName("Scénario : atomicité")
    class Atomicite {

        @Test
        void un_echec_apres_l_acceptation_n_active_ni_ne_rattache_rien() throws Exception {
            Circle c = circle();
            UUID invitee = pendingInvitee(data.uniqueEmail("jeanne"));
            UUID token = invitation(c, invitee);
            String hashBefore = data.passwordHash(invitee);

            // accept() joins the surrounding transaction: rolling it back must undo every mutation.
            userTransaction.begin();
            try {
                invitationService.accept(null, token.toString(), INVITATION_PWD);
            } finally {
                userTransaction.rollback();
            }

            assertNull(data.activatedAt(invitee));
            assertEquals(hashBefore, data.passwordHash(invitee));
            assertFalse(data.invitationConsumed(token));
            assertFalse(data.isLinkedHelper(invitee, c.baby()));
            accept(token, null, Map.of("password", INVITATION_PWD)).then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : le compte créé reste sans pouvoir")
    class SansPouvoir {

        @Test
        void ne_voit_que_ce_bebe_et_ne_peut_ni_inviter_ni_promouvoir_ni_delier() {
            Circle c = circle();
            String email = data.uniqueEmail("jeanne");
            UUID invitee = pendingInvitee(email);
            UUID otherBaby = data.createBaby("Autre");
            data.link(activeParent("autre-owner").id(), otherBaby);
            accept(invitation(c, invitee), null, Map.of("password", INVITATION_PWD)).then().statusCode(204);
            String cookie = AuthFixture.loginCookie(email, INVITATION_PWD);

            given().cookie(AuthFixture.COOKIE, cookie).when().get("/api/babies")
                    .then().statusCode(200)
                    .body("size()", is(1))
                    .body("[0].id", is(c.baby().toString()));
            given().cookie(AuthFixture.COOKIE, cookie).contentType(ContentType.JSON)
                    .body(Map.of("email", data.uniqueEmail("tiers"), "firstName", "Tiers"))
                    .when().post("/api/babies/{babyId}/invitations", c.baby())
                    .then().statusCode(403);
            given().cookie(AuthFixture.COOKIE, cookie).contentType(ContentType.JSON)
                    .body(Map.of("isOwner", true))
                    .when().patch("/api/babies/{babyId}/caregivers/{userId}", c.baby(), c.owner().id())
                    .then().statusCode(403);
            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().delete("/api/babies/{babyId}/caregivers/{userId}", c.baby(), c.owner().id())
                    .then().statusCode(403);
            given().cookie(AuthFixture.COOKIE, cookie)
                    .when().get("/api/babies/{babyId}/caregivers", otherBaby)
                    .then().statusCode(404);
        }
    }
}
