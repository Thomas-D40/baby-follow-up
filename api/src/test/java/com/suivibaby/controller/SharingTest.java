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

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 8 — sharing and co-parents: circle listing bounded to the baby (D8-N), unlinking (last owner,
// owner-to-owner, IDOR), promotion and the DEFAULT trap. Invitation emission and acceptance moved to
// InvitationEmissionTest and InvitationAcceptanceTest when an invitation started naming its recipient
// (Épic 17).
@QuarkusTest
class SharingTest {

    static final String PWD = "sharing-pwd-123";

    @Inject
    TestDataFactory data;

    private record Account(UUID id, String cookie) {
    }

    /** Crée un parent actif + ouvre une session, retourne id et cookie. */
    private Account parent(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID id = data.createActiveParent(email, PWD);
        return new Account(id, AuthFixture.loginCookie(email, PWD));
    }

    private Response listCaregivers(String cookie, UUID babyId) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .when().get("/api/babies/{babyId}/caregivers", babyId);
    }

    private Response delink(String cookie, UUID babyId, UUID userId) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .when().delete("/api/babies/{babyId}/caregivers/{userId}", babyId, userId);
    }

    private Response promote(String cookie, UUID babyId, UUID userId, Object body) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .contentType(ContentType.JSON)
                .body(body)
                .when().patch("/api/babies/{babyId}/caregivers/{userId}", babyId, userId);
    }

    // ===== GET .../caregivers =====

    @Nested
    @DisplayName("Liste du cercle (bornée, D8-N)")
    class ListeCercle {

        @Test
        void caregiver_lie_voit_la_liste_bornee() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Noé");
            data.link(owner.id(), baby);
            data.linkAsCaregiver(guest.id(), baby);

            listCaregivers(guest.cookie(), baby).then().statusCode(200)
                    .body("size()", is(2))
                    .body("findAll { it.isOwner == true }.size()", is(1))
                    .body("userId", notNullValue())
                    .body("email", notNullValue());
        }

        @Test
        void non_lie_recoit_404() {
            Account stranger = parent("stranger");
            UUID baby = data.createBaby("Noé");
            given().cookie(AuthFixture.COOKIE, stranger.cookie())
                    .get("/api/babies/{babyId}/caregivers", baby).then().statusCode(404);
            listCaregivers(stranger.cookie(), baby).then().statusCode(404);
        }

        @Test
        void exception_us15_emails_visibles_seulement_dans_un_cercle_partage() {
            Account a = parent("a");
            Account c = parent("c");
            UUID b1 = data.createBaby("B1");
            UUID b2 = data.createBaby("B2");
            data.link(a.id(), b1);
            data.link(c.id(), b2);

            // A voit le cercle de B1 mais JAMAIS celui de B2 (non lié).
            listCaregivers(a.cookie(), b1).then().statusCode(200);
            listCaregivers(a.cookie(), b2).then().statusCode(404);
        }
    }

    // ===== DELETE .../caregivers/{userId} =====

    @Nested
    @DisplayName("Déliaison (owner-only, D8-L/M)")
    class Deliaison {

        @Test
        void owner_delie_un_caregiver_204() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Noé");
            data.link(owner.id(), baby);
            data.linkAsCaregiver(guest.id(), baby);

            delink(owner.cookie(), baby, guest.id()).then().statusCode(204);
            assertFalse(data.isLinkedHelper(guest.id(), baby));
        }

        @Test
        void owner_peut_delier_un_autre_owner() {
            Account owner1 = parent("owner1");
            Account owner2 = parent("owner2");
            UUID baby = data.createBaby("Noé");
            data.link(owner1.id(), baby);
            data.link(owner2.id(), baby); // deux owners

            delink(owner1.cookie(), baby, owner2.id()).then().statusCode(204);
            assertFalse(data.isLinkedHelper(owner2.id(), baby));
        }

        @Test
        void refus_dernier_owner_409() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Noé");
            data.link(owner.id(), baby); // seul owner
            data.linkAsCaregiver(guest.id(), baby);

            // Retirer le seul owner est refusé (D8-M).
            delink(owner.cookie(), baby, owner.id()).then().statusCode(409);
            assertTrue(data.isLinkedHelper(owner.id(), baby));
        }

        @Test
        void self_delink_apres_designation_2e_owner_ok() {
            Account owner1 = parent("owner1");
            Account owner2 = parent("owner2");
            UUID baby = data.createBaby("Noé");
            data.link(owner1.id(), baby);
            data.link(owner2.id(), baby);

            // owner1 se retire lui-même : OK car un 2e owner existe.
            delink(owner1.cookie(), baby, owner1.id()).then().statusCode(204);
            assertFalse(data.isLinkedHelper(owner1.id(), baby));
        }

        @Test
        void non_owner_recoit_403() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Noé");
            data.link(owner.id(), baby);
            data.linkAsCaregiver(guest.id(), baby);

            delink(guest.cookie(), baby, owner.id()).then().statusCode(403);
        }

        @Test
        void idor_cible_d_un_autre_bebe_recoit_404() {
            Account owner = parent("owner");
            Account other = parent("other");
            UUID b1 = data.createBaby("B1");
            UUID b2 = data.createBaby("B2");
            data.link(owner.id(), b1);
            data.link(other.id(), b2);

            // owner de B1 tente de délier un membre de B2 → cible hors du cercle de B1 → 404.
            delink(owner.cookie(), b1, other.id()).then().statusCode(404);
        }
    }

    // ===== PATCH .../caregivers/{userId} =====

    @Nested
    @DisplayName("Promotion (owner-only, D8-I)")
    class Promotion {

        @Test
        void owner_promeut_un_caregiver_204() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Noé");
            data.link(owner.id(), baby);
            data.linkAsCaregiver(guest.id(), baby);

            promote(owner.cookie(), baby, guest.id(), Map.of("isOwner", true)).then().statusCode(204);
            assertTrue(data.isOwner(guest.id(), baby));
        }

        @Test
        void non_owner_recoit_403() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Noé");
            data.link(owner.id(), baby);
            data.linkAsCaregiver(guest.id(), baby);

            promote(guest.cookie(), baby, owner.id(), Map.of("isOwner", true)).then().statusCode(403);
        }

        @Test
        void non_lie_recoit_404() {
            Account stranger = parent("stranger");
            UUID baby = data.createBaby("Noé");
            promote(stranger.cookie(), baby, UUID.randomUUID(), Map.of("isOwner", true))
                    .then().statusCode(404);
        }

        @Test
        void idor_cible_croisee_recoit_404() {
            Account owner = parent("owner");
            Account other = parent("other");
            UUID b1 = data.createBaby("B1");
            UUID b2 = data.createBaby("B2");
            data.link(owner.id(), b1);
            data.link(other.id(), b2);

            promote(owner.cookie(), b1, other.id(), Map.of("isOwner", true)).then().statusCode(404);
        }

        @Test
        void retrogradation_refusee_400() {
            Account owner = parent("owner");
            Account guest = parent("guest");
            UUID baby = data.createBaby("Noé");
            data.link(owner.id(), baby);
            data.link(guest.id(), baby); // déjà owner

            // Rétrogradation hors v1 : isOwner=false refusé.
            promote(owner.cookie(), baby, guest.id(), Map.of("isOwner", false)).then().statusCode(400);
            assertTrue(data.isOwner(guest.id(), baby));
        }
    }

    // ===== Backfill / piège DEFAULT =====

    @Nested
    @DisplayName("Backfill is_owner (D8-H) et piège DEFAULT (R5)")
    class BackfillEtDefaut {

        @Test
        void lien_via_creation_de_bebe_est_owner() {
            Account owner = parent("owner");
            // Création de bébé via l'API parent-facing → créateur owner explicite.
            UUID baby = UUID.fromString(
                    given().cookie(AuthFixture.COOKIE, owner.cookie())
                            .contentType(ContentType.JSON)
                            .body(Map.of("firstName", "Noé"))
                            .when().post("/api/babies")
                            .then().statusCode(201)
                            .extract().path("id"));

            assertTrue(data.isOwner(owner.id(), baby), "le créateur d'un bébé est owner (D8-H)");
        }
    }
}
