package com.suivibaby.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

// The fate of every baby of an account, as computed inside the deletion transaction (D24-T): deleted with
// the account (it is the only member), blocking (last owner of a baby others follow), or shared (the
// account just leaves the circle).
public record AccountDeletionImpact(UUID userId, List<UUID> deletedBabyIds, List<UUID> sharedBabyIds,
                                    List<UUID> blockingBabyIds) {

    public boolean isBlocked() {
        return !blockingBabyIds.isEmpty();
    }

    // Fingerprint of the account and of the exact babies in each category, whatever the order of the lists.
    // Numbers alone would not do: two babies swapping fate leave them equal, yet another baby gets erased.
    // It starts with the account id so that it is only valid for that account.
    public String token() {
        String raw = "user:" + userId
                + "|deleted:" + sortedJoin(deletedBabyIds)
                + "|shared:" + sortedJoin(sharedBabyIds)
                + "|blocking:" + sortedJoin(blockingBabyIds);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 is mandatory in every JRE
        }
    }

    private static String sortedJoin(Collection<UUID> ids) {
        return String.join(",", ids.stream().map(UUID::toString).sorted().toList());
    }
}
