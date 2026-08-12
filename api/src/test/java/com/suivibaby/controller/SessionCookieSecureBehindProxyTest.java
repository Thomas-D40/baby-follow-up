package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.Cookie;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * US10.1 (Épic 10) — F3: the Secure attribute is set from request.isSSL(). In prod, TLS is terminated
 * by Caddy and the internal hop to Quarkus is plain HTTP, so Secure only appears if Quarkus trusts the
 * proxy's X-Forwarded-Proto (prod: quarkus.http.proxy.proxy-address-forwarding=true). This profile
 * enables that trust and simulates Caddy by sending X-Forwarded-Proto=https; the cookie must be Secure.
 */
@QuarkusTest
@TestProfile(SessionCookieSecureBehindProxyTest.ProxyProfile.class)
class SessionCookieSecureBehindProxyTest {

    public static class ProxyProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("quarkus.http.proxy.proxy-address-forwarding", "true");
        }
    }

    @Inject
    TestDataFactory data;

    @Test
    void cookie_secure_derriere_le_proxy_tls() {
        String email = data.uniqueEmail("secure");
        String password = "secure-cookie-123";
        data.createActiveParent(email, password);

        Cookie cookie = given()
                .header("X-Forwarded-Proto", "https")
                .contentType("application/x-www-form-urlencoded")
                .formParam("email", email).formParam("password", password)
                .when().post("/api/login")
                .then().statusCode(200)
                .extract().detailedCookie(AuthFixture.COOKIE);

        assertTrue(cookie.isSecured(),
                "the session cookie must be Secure when the origin request is HTTPS (via the proxy)");
    }

    /** Causation guard: same proxy profile, but WITHOUT the HTTPS forwarded header -> not Secure.
     *  Proves it's the X-Forwarded-Proto header (i.e. request.isSSL()) that flips Secure, not merely
     *  having proxy-address-forwarding enabled. */
    @Test
    void cookie_non_secure_sans_forwarded_proto_https() {
        String email = data.uniqueEmail("nosecure");
        String password = "no-secure-cookie-123";
        data.createActiveParent(email, password);

        Cookie cookie = given()
                .contentType("application/x-www-form-urlencoded")
                .formParam("email", email).formParam("password", password)
                .when().post("/api/login")
                .then().statusCode(200)
                .extract().detailedCookie(AuthFixture.COOKIE);

        assertFalse(cookie.isSecured(),
                "without X-Forwarded-Proto=https the request is plain HTTP -> the cookie must not be Secure");
    }
}
