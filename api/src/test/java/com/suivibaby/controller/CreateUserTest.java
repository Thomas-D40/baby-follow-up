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

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.notNullValue;

/** US1.1 — parent account creation by the admin. */
@QuarkusTest
class CreateUserTest {

    @Inject
    TestDataFactory data;

    String adminCookie;

    @BeforeEach
    void seedAdmin() {
        String email = data.uniqueEmail("admin");
        data.createAdmin(email, "admin-password-123");
        adminCookie = AuthFixture.loginCookie(email, "admin-password-123");
    }

    @Nested
    @DisplayName("Scénario : création réussie")
    class CreationReussie {
        @Test
        void retourne_201_userId_et_lien_activation() {
            given().cookie(AuthFixture.COOKIE, adminCookie)
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", data.uniqueEmail("parent"), "firstName", "Léa"))
                    .when().post("/api/admin/users")
                    .then().statusCode(201)
                    .body("userId", notNullValue())
                    .body("activationLink", notNullValue());
        }
    }

    @Nested
    @DisplayName("Scénario : email déjà utilisé (409)")
    class EmailDejaUtilise {
        @Test
        void renvoie_409() {
            String email = data.uniqueEmail("dup");
            data.createActiveParent(email, "whatever-123456");
            given().cookie(AuthFixture.COOKIE, adminCookie)
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", email, "firstName", "Léa"))
                    .when().post("/api/admin/users")
                    .then().statusCode(409);
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
            given().cookie(AuthFixture.COOKIE, parentCookie)
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", data.uniqueEmail("x"), "firstName", "X"))
                    .when().post("/api/admin/users")
                    .then().statusCode(403);
        }

        @Test
        void non_authentifie_recoit_401() {
            given().contentType(ContentType.JSON)
                    .body(Map.of("email", data.uniqueEmail("x"), "firstName", "X"))
                    .when().post("/api/admin/users")
                    .then().statusCode(401);
        }
    }
}
