package com.suivibaby.model;

import java.util.UUID;

// What deleting an account would do, in numbers only: no baby id or name reaches the admin screen (D24-P).
// impactToken is opaque; the delete route must be given the one read here (D24-R).
public record AccountDeletionImpactResponse(UUID userId, AccountStatus status, int deletedBabyCount,
                                            int sharedBabyCount, int blockingBabyCount, String impactToken) {
}
