package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** US1.4 — link a parent to a baby (admin). */
@QuarkusTest
class LinkCaregiverTest {

    @Inject
    TestDataFactory data;

    String adminCookie;

    @BeforeEach
    void seedAdmin() {
        String email = data.uniqueEmail("admin");
        data.createAdmin(email, "admin-password-123");
        adminCookie = AuthFixture.loginCookie(email, "admin-password-123");
    }

    private io.restassured.response.Response link(String cookie, UUID babyId, UUID userId) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .contentType(ContentType.JSON)
                .body(Map.of("userId", userId.toString()))
                .when().post("/api/admin/babies/{babyId}/caregivers", babyId);
    }

    @Nested
    @DisplayName("Scénario : liaison réussie")
    class LiaisonReussie {
        @Test
        void renvoie_204_et_cree_la_liaison() {
            UUID parent = data.createActiveParent(data.uniqueEmail("p"), "x-1234567890ab");
            UUID baby = data.createBaby("Noé");
            link(adminCookie, baby, parent).then().statusCode(204);
            assertEquals(1, data.countLink(parent, baby));
        }
    }

    @Nested
    @DisplayName("Scénario : liaison déjà existante (idempotent)")
    class LiaisonIdempotente {
        @Test
        void relier_le_meme_couple_ne_cree_pas_de_doublon() {
            UUID parent = data.createActiveParent(data.uniqueEmail("p"), "x-1234567890ab");
            UUID baby = data.createBaby("Noé");
            link(adminCookie, baby, parent).then().statusCode(204);
            link(adminCookie, baby, parent).then().statusCode(204);
            assertEquals(1, data.countLink(parent, baby), "pas de doublon");
        }
    }

    @Nested
    @DisplayName("Scénario : entité inexistante (404)")
    class EntiteInexistante {
        @Test
        void bebe_inexistant() {
            UUID parent = data.createActiveParent(data.uniqueEmail("p"), "x-1234567890ab");
            link(adminCookie, UUID.randomUUID(), parent).then().statusCode(404);
        }

        @Test
        void parent_inexistant() {
            UUID baby = data.createBaby("Noé");
            link(adminCookie, baby, UUID.randomUUID()).then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("Scénario : accès non-admin refusé (403)")
    class AccesNonAdmin {
        @Test
        void parent_recoit_403() {
            String email = data.uniqueEmail("parent");
            data.createActiveParent(email, "parent-password-123");
            String parentCookie = AuthFixture.loginCookie(email, "parent-password-123");
            UUID baby = data.createBaby("Noé");
            link(parentCookie, baby, UUID.randomUUID()).then().statusCode(403);
        }
    }
}
