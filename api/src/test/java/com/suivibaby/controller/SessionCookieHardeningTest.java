package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.Cookie;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * US10.1 (Épic 10) — session persistante & durcissement du cookie. The form-auth session cookie must
 * be persistent (Max-Age) so it survives closing the PWA, and hardened (HttpOnly + SameSite=Strict).
 * The Secure attribute is set from request.isSSL() and is therefore covered separately in
 * {@link SessionCookieSecureBehindProxyTest} (only true behind the TLS-terminating proxy).
 * One @Nested class per AC facet (traceability).
 */
@QuarkusTest
class SessionCookieHardeningTest {

    @Inject
    TestDataFactory data;

    String email;
    final String password = "persistent-cookie-123";

    @BeforeEach
    void seedActiveParent() {
        email = data.uniqueEmail("cookie");
        data.createActiveParent(email, password);
    }

    /** Runs the real login flow and returns the full Set-Cookie (attributes included). */
    private Cookie loginDetailedCookie() {
        return given()
                .contentType("application/x-www-form-urlencoded")
                .formParam("email", email).formParam("password", password)
                .when().post("/api/login")
                .then().statusCode(200)
                .extract().detailedCookie(AuthFixture.COOKIE);
    }

    @Nested
    @DisplayName("Scénario : cookie persistant (survit à la fermeture de la PWA)")
    class CookiePersistant {
        @Test
        void porte_un_max_age_de_7_jours() {
            // F1: without a Max-Age the form cookie is a *session* cookie, wiped on PWA/browser close
            // -> the app "logged out on close". 7 days = 604800 s (aligned on form.timeout=P7D).
            assertEquals(604800L, loginDetailedCookie().getMaxAge());
        }
    }

    @Nested
    @DisplayName("Scénario : cookie protégé du JavaScript (HttpOnly)")
    class CookieHttpOnly {
        @Test
        void porte_l_attribut_http_only() {
            // F2: Quarkus form-auth cookie is NOT HttpOnly by default -> must be explicitly enabled.
            assertTrue(loginDetailedCookie().isHttpOnly());
        }
    }

    @Nested
    @DisplayName("Scénario : SameSite=Strict conservé")
    class CookieSameSite {
        @Test
        void porte_same_site_strict() {
            assertEquals("Strict", loginDetailedCookie().getSameSite());
        }
    }

    @Nested
    @DisplayName("Scénario : pas de Secure sans TLS (dev/test en HTTP direct)")
    class CookieNonSecureSansTls {
        @Test
        void secure_absent_en_http_direct() {
            // Over plain HTTP (no proxy), request.isSSL() is false -> no Secure. Behind the prod proxy
            // it flips to true (see SessionCookieSecureBehindProxyTest).
            assertFalse(loginDetailedCookie().isSecured());
        }
    }
}
