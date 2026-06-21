package com.suivibaby.security;

import io.quarkus.elytron.security.common.BcryptUtil;

import java.util.UUID;

/**
 * Password hashing (BCrypt, MCF format compatible with security-jpa) and length policy.
 * NIST 800-63B: minimum length 12, no composition rule — the password is only set once, at
 * activation (zero friction).
 *
 * <p>Login-time <em>verification</em> is not here: it is delegated to security-jpa's native
 * IdentityProvider (the paved road, D-A).
 */
public final class PasswordUtil {

    public static final int MIN_LENGTH = 12;

    private PasswordUtil() {
    }

    public static String hash(String plainPassword) {
        return BcryptUtil.bcryptHash(plainPassword);
    }

    /**
     * <em>Unusable</em> hash for a "pending activation" account: BCrypt of a random, never-shared
     * secret. No password can satisfy it → login is impossible (401) until activation sets a real
     * hash. This avoids a NULL {@code password_hash}, which the native IdentityProvider
     * (security-jpa) does not tolerate.
     */
    public static String unusablePlaceholder() {
        return BcryptUtil.bcryptHash(UUID.randomUUID().toString());
    }

    public static boolean meetsPolicy(String plainPassword) {
        return plainPassword != null && plainPassword.length() >= MIN_LENGTH;
    }
}
