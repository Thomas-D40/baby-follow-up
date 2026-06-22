package com.suivibaby.security;

import io.quarkus.elytron.security.common.BcryptUtil;

import java.util.UUID;

public final class PasswordUtil {

    public static final int MIN_LENGTH = 12;

    private PasswordUtil() {
    }

    public static String hash(String plainPassword) {
        return BcryptUtil.bcryptHash(plainPassword);
    }

    public static String unusablePlaceholder() {
        return BcryptUtil.bcryptHash(UUID.randomUUID().toString());
    }

    public static boolean meetsPolicy(String plainPassword) {
        return plainPassword != null && plainPassword.length() >= MIN_LENGTH;
    }
}
