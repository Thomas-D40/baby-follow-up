package com.suivibaby.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** Composite key of {@link BabyCaregiver}: binary link (app_user_id, baby_id). */
public class BabyCaregiverId implements Serializable {

    public UUID appUserId;
    public UUID babyId;

    public BabyCaregiverId() {
    }

    public BabyCaregiverId(UUID appUserId, UUID babyId) {
        this.appUserId = appUserId;
        this.babyId = babyId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof BabyCaregiverId other)) {
            return false;
        }
        return Objects.equals(appUserId, other.appUserId) && Objects.equals(babyId, other.babyId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(appUserId, babyId);
    }
}
