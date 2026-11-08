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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 17, US17.4 — the owner follows and revokes the pending invitations of a baby. The list shows
// what the owner typed, never the state of the recipient's account (D17-G, D17-X).
@QuarkusTest
class PendingInvitationsTest {

    static final String PWD = "pending-pwd-123";
    static final String INVITATION_PWD = "mot-de-passe-invitation-1";

    @Inject
    TestDataFactory data;

    private record Account(UUID id, String email, String cookie) {
    }

    private record Circle(Account owner, UUID baby) {
    }

    private Account activeParent(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID id = data.createActiveParent(email, PWD);
        return new Account(id, email, AuthFixture.loginCookie(email, PWD));
    }

    private Circle circle() {
        Account owner = activeParent("owner");
        UUID baby = data.createBaby("Léa");
        data.link(owner.id(), baby);
        return new Circle(owner, baby);
    }

    // Pending recipient, never activated.
    private UUID pendingInvitee(String email) {
        return data.createUser(email, "Jeanne", "parent", null);
    }

    private UUID pendingInvitation(Circle circle, UUID invitee, Instant expiresAt) {
        return data.createInvitation(circle.baby(), circle.owner().id(), invitee, expiresAt, null);
    }

    private UUID pendingInvitation(Circle circle, UUID invitee) {
        return pendingInvitation(circle, invitee, Instant.now().plus(3, ChronoUnit.DAYS));
    }

    private Response list(String cookie, Object babyId) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .when().get("/api/babies/{babyId}/invitations", babyId);
    }

    private Response revoke(String cookie, Object babyId, Object token) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .when().delete("/api/babies/{babyId}/invitations/{token}", babyId, token);
    }

    private Set<String> listedTokens(Response response) {
        List<String> tokens = response.then().statusCode(200).extract().jsonPath().getList("token");
        return Set.copyOf(tokens);
    }

    @Nested
    @DisplayName("Scénario : lister les invitations en attente")
    class Lister {

        @Test
        void ne_rend_que_les_invitations_en_attente_de_ce_bebe_avec_les_seuls_champs_prevus() {
            Circle c = circle();
            UUID first = pendingInvitation(c, pendingInvitee(data.uniqueEmail("mamie")));
            UUID second = pendingInvitation(c, pendingInvitee(data.uniqueEmail("papi")));
            UUID accepted = data.createInvitation(c.baby(), c.owner().id(), pendingInvitee(data.uniqueEmail("tata")),
                    Instant.now().plus(3, ChronoUnit.DAYS), Instant.now());
            Circle other = circle();
            UUID elsewhere = pendingInvitation(other, pendingInvitee(data.uniqueEmail("oncle")));

            Response response = list(c.owner().cookie(), c.baby());

            assertEquals(Set.of(first.toString(), second.toString()), listedTokens(response));
            assertFalse(listedTokens(response).contains(accepted.toString()));
            assertFalse(listedTokens(response).contains(elsewhere.toString()));
            List<Map<String, Object>> items = response.jsonPath().getList("$");
            for (Map<String, Object> item : items) {
                assertEquals(Set.of("token", "inviteeEmail", "inviteeFirstName", "expiresAt"), item.keySet(),
                        "aucune information sur l'état du compte");
            }
        }

        @Test
        void montre_le_prenom_saisi_par_l_owner_meme_si_le_compte_existait_sous_un_autre_prenom() {
            Circle c = circle();
            String email = data.uniqueEmail("pierre");
            data.createUser(email, "Pierre", "parent", PWD);

            given().cookie(AuthFixture.COOKIE, c.owner().cookie())
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Papi"))
                    .when().post("/api/babies/{babyId}/invitations", c.baby())
                    .then().statusCode(201);

            list(c.owner().cookie(), c.baby()).then().statusCode(200)
                    .body("size()", is(1))
                    .body("[0].inviteeFirstName", is("Papi"))
                    .body("[0].inviteeEmail", is(email));
        }
    }

    @Nested
    @DisplayName("Scénario : aucune invitation en attente")
    class ListeVide {

        @Test
        void rend_une_liste_vide() {
            Circle c = circle();

            list(c.owner().cookie(), c.baby()).then().statusCode(200).body("size()", is(0));
        }
    }

    @Nested
    @DisplayName("Scénario : une invitation expirée n'est plus en attente")
    class Expiree {

        @Test
        void exclut_l_expiree_et_garde_celle_qui_expire_dans_une_minute() {
            Circle c = circle();
            UUID expired = pendingInvitation(c, pendingInvitee(data.uniqueEmail("expire")),
                    Instant.now().minus(1, ChronoUnit.MINUTES));
            UUID alive = pendingInvitation(c, pendingInvitee(data.uniqueEmail("vivante")),
                    Instant.now().plus(1, ChronoUnit.MINUTES));

            Set<String> tokens = listedTokens(list(c.owner().cookie(), c.baby()));

            assertFalse(tokens.contains(expired.toString()));
            assertTrue(tokens.contains(alive.toString()));
        }
    }

    @Nested
    @DisplayName("Scénario : révoquer une invitation")
    class Revoquer {

        @Test
        void invalide_le_lien_sans_toucher_au_compte_du_destinataire() {
            Circle c = circle();
            String email = data.uniqueEmail("jeanne");
            UUID invitee = pendingInvitee(email);
            UUID token = pendingInvitation(c, invitee);

            revoke(c.owner().cookie(), c.baby(), token).then().statusCode(204);

            assertTrue(data.invitationConsumed(token));
            assertNull(data.invitationAcceptedBy(token));
            given().when().get("/api/invitations/{token}", token).then().statusCode(410);
            given().contentType(ContentType.JSON).body(Map.of("password", INVITATION_PWD))
                    .when().post("/api/invitations/{token}/accept", token)
                    .then().statusCode(410);
            assertFalse(listedTokens(list(c.owner().cookie(), c.baby())).contains(token.toString()));
            assertNotNull(data.userIdByEmail(email), "le compte du destinataire subsiste (D17-R)");
            assertNull(data.activatedAt(invitee));
            assertFalse(data.isLinkedHelper(invitee, c.baby()));
        }
    }

    @Nested
    @DisplayName("Scénario : révoquer puis ré-inviter")
    class RevoquerPuisReinviter {

        @Test
        void le_nouveau_lien_s_accepte_sans_second_compte() {
            Circle c = circle();
            String email = data.uniqueEmail("jeanne");
            UUID token = pendingInvitation(c, pendingInvitee(email));
            revoke(c.owner().cookie(), c.baby(), token).then().statusCode(204);

            String fresh = given().cookie(AuthFixture.COOKIE, c.owner().cookie())
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Jeanne"))
                    .when().post("/api/babies/{babyId}/invitations", c.baby())
                    .then().statusCode(201)
                    .extract().path("token");

            assertEquals(1, data.countUsersByEmail(email));
            given().contentType(ContentType.JSON).body(Map.of("password", INVITATION_PWD))
                    .when().post("/api/invitations/{token}/accept", fresh)
                    .then().statusCode(204);
        }
    }

    @Nested
    @DisplayName("Scénario : gardes d'accès")
    class Gardes {

        @Test
        void non_owner_recoit_403_sur_la_liste_et_la_revocation() {
            Circle c = circle();
            Account guest = activeParent("guest");
            data.linkAsCaregiver(guest.id(), c.baby());
            UUID token = pendingInvitation(c, pendingInvitee(data.uniqueEmail("jeanne")));

            list(guest.cookie(), c.baby()).then().statusCode(403);
            revoke(guest.cookie(), c.baby(), token).then().statusCode(403);

            assertFalse(data.invitationConsumed(token));
        }

        @Test
        void non_lie_recoit_404_sur_la_liste_et_la_revocation() {
            Circle c = circle();
            Account stranger = activeParent("stranger");
            UUID token = pendingInvitation(c, pendingInvitee(data.uniqueEmail("jeanne")));

            list(stranger.cookie(), c.baby()).then().statusCode(404);
            revoke(stranger.cookie(), c.baby(), token).then().statusCode(404);

            assertFalse(data.invitationConsumed(token));
        }

        @Test
        void sans_session_recoit_401_sur_la_liste_et_la_revocation() {
            Circle c = circle();
            UUID token = pendingInvitation(c, pendingInvitee(data.uniqueEmail("jeanne")));

            given().when().get("/api/babies/{babyId}/invitations", c.baby()).then().statusCode(401);
            given().when().delete("/api/babies/{babyId}/invitations/{token}", c.baby(), token)
                    .then().statusCode(401);

            assertFalse(data.invitationConsumed(token));
        }
    }

    @Nested
    @DisplayName("Scénario : IDOR, l'invitation d'un autre bébé")
    class Idor {

        @Test
        void l_owner_de_a_ne_peut_pas_revoquer_l_invitation_de_b() {
            Circle a = circle();
            Circle b = circle();
            UUID tokenOfB = pendingInvitation(b, pendingInvitee(data.uniqueEmail("jeanne")));

            revoke(a.owner().cookie(), a.baby(), tokenOfB).then().statusCode(404);

            assertFalse(data.invitationConsumed(tokenOfB));
        }
    }

    @Nested
    @DisplayName("Scénario : invitation déjà faite ou consommée")
    class DejaConsommee {

        @Test
        void une_invitation_acceptee_renvoie_404_sans_defaire_le_lien() {
            Circle c = circle();
            UUID invitee = pendingInvitee(data.uniqueEmail("jeanne"));
            UUID token = pendingInvitation(c, invitee);
            given().contentType(ContentType.JSON).body(Map.of("password", INVITATION_PWD))
                    .when().post("/api/invitations/{token}/accept", token)
                    .then().statusCode(204);

            revoke(c.owner().cookie(), c.baby(), token).then().statusCode(404);

            assertEquals(1, data.countLink(invitee, c.baby()));
        }

        @Test
        void une_invitation_deja_revoquee_renvoie_404() {
            Circle c = circle();
            UUID token = pendingInvitation(c, pendingInvitee(data.uniqueEmail("jeanne")));
            revoke(c.owner().cookie(), c.baby(), token).then().statusCode(204);

            revoke(c.owner().cookie(), c.baby(), token).then().statusCode(404);
        }

        @Test
        void une_invitation_expiree_renvoie_404() {
            Circle c = circle();
            UUID token = pendingInvitation(c, pendingInvitee(data.uniqueEmail("jeanne")),
                    Instant.now().minus(1, ChronoUnit.HOURS));

            revoke(c.owner().cookie(), c.baby(), token).then().statusCode(404);
        }

        @Test
        void un_jeton_inconnu_ou_mal_forme_renvoie_404() {
            Circle c = circle();

            revoke(c.owner().cookie(), c.baby(), UUID.randomUUID()).then().statusCode(404);
            revoke(c.owner().cookie(), c.baby(), "not-a-uuid").then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("Non-régression : la révocation admin d'un bébé (D8-K)")
    class RevocationAdmin {

        @Test
        void l_admin_revoque_toutes_les_invitations_en_attente_du_bebe() {
            Circle c = circle();
            pendingInvitation(c, pendingInvitee(data.uniqueEmail("mamie")));
            pendingInvitation(c, pendingInvitee(data.uniqueEmail("papi")));
            assertEquals(2, data.countActiveInvitations(c.baby()));
            String adminEmail = data.uniqueEmail("admin");
            data.createAdmin(adminEmail, PWD);
            String adminCookie = AuthFixture.loginCookie(adminEmail, PWD);

            given().cookie(AuthFixture.COOKIE, adminCookie)
                    .when().delete("/api/admin/babies/{babyId}/invitations", c.baby())
                    .then().statusCode(204);

            assertEquals(0, data.countActiveInvitations(c.baby()));
        }
    }
}
