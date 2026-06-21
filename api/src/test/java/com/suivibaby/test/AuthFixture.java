package com.suivibaby.test;

import static io.restassured.RestAssured.given;

/**
 * Shared auth helper (D-D). {@link #loginCookie} runs the <em>real</em> form-auth flow
 * (form-encoded POST to /api/login) and returns the session cookie value to be re-injected into
 * subsequent requests via {@code .cookie(AuthFixture.COOKIE, value)}.
 */
public final class AuthFixture {

    public static final String COOKIE = "baby_session";

    private AuthFixture() {
    }

    /** Successful login expected: returns the session cookie value. */
    public static String loginCookie(String email, String password) {
        return given()
                .contentType("application/x-www-form-urlencoded")
                .formParam("email", email)
                .formParam("password", password)
                .when()
                .post("/api/login")
                .then()
                .statusCode(200)
                .extract()
                .cookie(COOKIE);
    }
}
