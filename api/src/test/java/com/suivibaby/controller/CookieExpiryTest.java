package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;

/**
 * Lot A — absolute cookie expiration. Dedicated profile: 1 s timeout (and a long new-cookie-interval
 * so the cookie is not re-issued → truly absolute expiration). After the delay, /api/me → 401.
 */
@QuarkusTest
@TestProfile(CookieExpiryTest.ShortSessionProfile.class)
class CookieExpiryTest {

    public static class ShortSessionProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "quarkus.http.auth.form.timeout", "PT1S",
                    "quarkus.http.auth.form.new-cookie-interval", "PT10S");
        }
    }

    @Inject
    TestDataFactory data;

    @Test
    void cookie_expire_apres_le_timeout_absolu() throws InterruptedException {
        String email = data.uniqueEmail("exp");
        data.createActiveParent(email, "expiry-password-123");
        String cookie = AuthFixture.loginCookie(email, "expiry-password-123");

        // The cookie is valid right after login.
        given().cookie(AuthFixture.COOKIE, cookie).get("/api/me").then().statusCode(200);

        // Past the timeout (1 s), it no longer authenticates.
        Thread.sleep(1500);
        given().cookie(AuthFixture.COOKIE, cookie).get("/api/me").then().statusCode(401);
    }
}
