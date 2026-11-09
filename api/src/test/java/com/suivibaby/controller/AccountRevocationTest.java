package com.suivibaby.controller;

import com.suivibaby.model.MilkType;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.mailer.MockMailbox;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
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
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 24, US24.2 — the administrator revokes the invitation of a pending account: the same route as the
// deletion, restricted by `pendingOnly=true` (D24-L, D24-M). The deletion rules themselves are covered by
// AccountDeletionTest; here only what the revocation adds.
@QuarkusTest
class AccountRevocationTest {

    static final String PWD = "account-revocation-pwd-123";
    static final String CHOSEN_PWD = "mot-de-passe-choisi-12";
    static final String ADMIN_USERS = "/api/admin/users";

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

    private record Created(UUID id, String email, String activationToken) {
    }

    private RequestSpecification as(String cookie) {
        return given().cookie(AuthFixture.COOKIE, cookie);
    }

    private static String tokenOf(String activationLink) {
        return activationLink.substring(activationLink.indexOf("token=") + "token=".length());
    }

    // The account the administrator creates for Jeanne through the API (US20.2).
    private Created createdByAdmin() {
        String email = data.uniqueEmail("jeanne");
        Response response = as(adminCookie).contentType(ContentType.JSON)
                .body(Map.of("email", email, "firstName", "Jeanne"))
                .when().post(ADMIN_USERS);
        response.then().statusCode(201);
        return new Created(UUID.fromString(response.jsonPath().getString("userId")), email,
                tokenOf(response.jsonPath().getString("activationLink")));
    }

    private Response impactOf(String cookie, Object userId) {
        return as(cookie).when().get(ADMIN_USERS + "/{id}/deletion-impact", userId);
    }

    private String tokenFor(UUID userId) {
        return impactOf(adminCookie, userId).then().statusCode(200).extract().path("impactToken");
    }

    private Response revoke(String cookie, Object userId, String impactToken) {
        return as(cookie).queryParam("impactToken", impactToken).queryParam("pendingOnly", true)
                .when().delete(ADMIN_USERS + "/{id}", userId);
    }

    private Response revoke(Object userId, String impactToken) {
        return revoke(adminCookie, userId, impactToken);
    }

    private List<String> listedEmails() {
        return as(adminCookie).when().get(ADMIN_USERS)
                .then().statusCode(200)
                .extract().jsonPath().getList("email");
    }

    @Nested
    @DisplayName("Scénario : révoquer un compte en attente créé par l'admin")
    class CompteCreeParAdmin {

        @Test
        void le_compte_disparait_le_lien_est_mort_et_l_adresse_est_libre() {
            Created jeanne = createdByAdmin();
            given().when().get("/api/activation/{token}", jeanne.activationToken()).then().statusCode(204);
            Response preview = impactOf(adminCookie, jeanne.id());
            preview.then().statusCode(200)
                    .body("status", is("pending"))
                    .body("deletedBabyCount", is(0))
                    .body("sharedBabyCount", is(0))
                    .body("blockingBabyCount", is(0));

            mailbox.clear();
            revoke(jeanne.id(), preview.jsonPath().getString("impactToken")).then().statusCode(204);

            assertEquals(0, mailbox.getTotalMessagesSent(), "aucun mail (D24-K)");
            assertFalse(listedEmails().contains(jeanne.email()));
            assertFalse(data.userExists(jeanne.id()));
            given().when().get("/api/activation/{token}", jeanne.activationToken()).then().statusCode(410);
            given().contentType(ContentType.JSON)
                    .body(Map.of("token", jeanne.activationToken(), "password", CHOSEN_PWD))
                    .when().post("/api/activation")
                    .then().statusCode(410);
            as(adminCookie).contentType(ContentType.JSON)
                    .body(Map.of("email", jeanne.email(), "firstName", "Jeanne"))
                    .when().post(ADMIN_USERS)
                    .then().statusCode(201);
        }
    }

    @Nested
    @DisplayName("Scénario : compte en attente créé par l'invitation d'un owner")
    class CompteCreeParInvitation {

        @Test
        void le_lien_d_invitation_repond_410_et_l_owner_peut_reinviter_l_adresse() {
            String lisaEmail = data.uniqueEmail("lisa");
            UUID lisa = data.createUser(lisaEmail, "Lisa", "parent", PWD);
            String lisaCookie = AuthFixture.loginCookie(lisaEmail, PWD);
            UUID lea = data.createBaby("Léa");
            data.link(lisa, lea);
            String mamieEmail = data.uniqueEmail("mamie");
            String invitation = as(lisaCookie).contentType(ContentType.JSON)
                    .body(Map.of("email", mamieEmail, "firstName", "Mamie"))
                    .when().post("/api/babies/{babyId}/invitations", lea)
                    .then().statusCode(201).extract().path("token");
            UUID mamie = data.userIdByEmail(mamieEmail);
            assertNotNull(mamie);
            as(lisaCookie).when().get("/api/babies/{babyId}/invitations", lea)
                    .then().statusCode(200).body("token", hasItem(invitation));

            revoke(mamie, tokenFor(mamie)).then().statusCode(204);

            given().when().get("/api/invitations/{token}", invitation).then().statusCode(410);
            as(lisaCookie).when().get("/api/babies/{babyId}/invitations", lea)
                    .then().statusCode(200).body("token", not(hasItem(invitation)));
            String second = as(lisaCookie).contentType(ContentType.JSON)
                    .body(Map.of("email", mamieEmail, "firstName", "Mamie"))
                    .when().post("/api/babies/{babyId}/invitations", lea)
                    .then().statusCode(201).extract().path("token");
            UUID newMamie = data.invitationInvitee(UUID.fromString(second));
            assertNotNull(newMamie);
            assertNotEquals(mamie, newMamie, "un compte neuf, pas l'ancien");
            assertEquals(newMamie, data.userIdByEmail(mamieEmail));
        }
    }

    @Nested
    @DisplayName("Scénario : la personne active son compte entre-temps")
    class ActiveEntreTemps {

        @Test
        void la_revocation_est_refusee_sans_effet_alors_que_la_suppression_reussit() {
            Created jeanne = createdByAdmin();
            String impactToken = tokenFor(jeanne.id());
            given().contentType(ContentType.JSON)
                    .body(Map.of("token", jeanne.activationToken(), "password", CHOSEN_PWD))
                    .when().post("/api/activation")
                    .then().statusCode(204);

            revoke(jeanne.id(), impactToken).then().statusCode(409);

            assertTrue(data.userExists(jeanne.id()));
            assertNotNull(data.activatedAt(jeanne.id()));
            impactOf(adminCookie, jeanne.id()).then().statusCode(200).body("status", is("active"));
            AuthFixture.loginCookie(jeanne.email(), CHOSEN_PWD);

            // Without pendingOnly it is the plain deletion of US24.1, which an active account allows.
            as(adminCookie).queryParam("impactToken", impactToken)
                    .when().delete(ADMIN_USERS + "/{id}", jeanne.id())
                    .then().statusCode(204);
            assertFalse(data.userExists(jeanne.id()));
        }

        @Test
        void un_compte_deja_actif_n_est_jamais_revoque() {
            String email = data.uniqueEmail("lisa");
            UUID lisa = data.createUser(email, "Lisa", "parent", PWD);

            revoke(lisa, tokenFor(lisa)).then().statusCode(409);

            assertTrue(data.userExists(lisa));
            AuthFixture.loginCookie(email, PWD);
        }
    }

    @Nested
    @DisplayName("Scénario : le message ne ment pas (compte en attente rattaché à un bébé)")
    class EnAttenteRattache {

        @Test
        void l_apercu_annonce_le_bebe_solo_et_la_revocation_le_supprime() {
            UUID pending = data.createPendingParent(data.uniqueEmail("rattache"));
            UUID tom = data.createBaby("Tom");
            as(adminCookie).contentType(ContentType.JSON).body(Map.of("userId", pending))
                    .when().post("/api/admin/babies/{babyId}/caregivers", tom)
                    .then().statusCode(204);
            data.createBottleFeeding(tom, pending, Instant.now().minus(1, ChronoUnit.HOURS), 100,
                    MilkType.formula);
            Response preview = impactOf(adminCookie, pending);
            preview.then().statusCode(200)
                    .body("status", is("pending"))
                    .body("deletedBabyCount", is(1))
                    .body("sharedBabyCount", is(0));

            revoke(pending, preview.jsonPath().getString("impactToken")).then().statusCode(204);

            assertFalse(data.userExists(pending));
            assertFalse(data.babyExists(tom));
            assertEquals(0, data.countAllEvents(tom));
        }

        @Test
        void un_compte_en_attente_dernier_owner_d_un_bebe_suivi_par_d_autres_est_refuse() {
            UUID pending = data.createPendingParent(data.uniqueEmail("rattache"));
            UUID other = data.createActiveParent(data.uniqueEmail("autre"), PWD);
            UUID lea = data.createBaby("Léa");
            data.link(pending, lea);
            data.linkAsCaregiver(other, lea);
            Response preview = impactOf(adminCookie, pending);
            preview.then().statusCode(200).body("blockingBabyCount", is(1));

            revoke(pending, preview.jsonPath().getString("impactToken")).then().statusCode(409);

            assertTrue(data.userExists(pending));
            assertTrue(data.babyExists(lea));
            assertTrue(data.isLinkedHelper(other, lea));
        }
    }

    @Nested
    @DisplayName("Scénario : annulation, anti-doublon, idempotence")
    class Idempotence {

        @Test
        void une_seconde_revocation_repond_404() {
            Created jeanne = createdByAdmin();
            String impactToken = tokenFor(jeanne.id());
            revoke(jeanne.id(), impactToken).then().statusCode(204);

            revoke(jeanne.id(), impactToken).then().statusCode(404);
        }

        @Test
        void une_revocation_sans_jeton_est_refusee_sans_effet() {
            Created jeanne = createdByAdmin();

            as(adminCookie).queryParam("pendingOnly", true)
                    .when().delete(ADMIN_USERS + "/{id}", jeanne.id())
                    .then().statusCode(409);

            assertTrue(data.userExists(jeanne.id()));
            assertNull(data.activatedAt(jeanne.id()));
            given().when().get("/api/activation/{token}", jeanne.activationToken()).then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : accès réservé à l'administrateur")
    class Acces {

        @Test
        void un_parent_recoit_403_et_sans_session_401_sans_effet() {
            Created jeanne = createdByAdmin();
            String impactToken = tokenFor(jeanne.id());
            String parentEmail = data.uniqueEmail("parent");
            data.createActiveParent(parentEmail, PWD);

            revoke(AuthFixture.loginCookie(parentEmail, PWD), jeanne.id(), impactToken).then().statusCode(403);
            given().queryParam("impactToken", impactToken).queryParam("pendingOnly", true)
                    .when().delete(ADMIN_USERS + "/{id}", jeanne.id())
                    .then().statusCode(401);

            assertTrue(data.userExists(jeanne.id()));
            given().when().get("/api/activation/{token}", jeanne.activationToken()).then().statusCode(204);
        }
    }
}
