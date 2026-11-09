package com.suivibaby.mapper;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.AccountDeletionImpactResponse;
import com.suivibaby.model.AccountResponse;
import com.suivibaby.model.AccountStatus;
import com.suivibaby.model.MeResponse;
import com.suivibaby.service.AccountDeletionImpact;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class UserMapper {

    public MeResponse toMeResponse(AppUser user) {
        return new MeResponse(user.id, user.email, user.firstName, user.role);
    }

    public AccountResponse toAccountResponse(AppUser user) {
        return new AccountResponse(user.id, user.email, user.firstName, user.role, statusOf(user), user.createdAt);
    }

    public AccountDeletionImpactResponse toDeletionImpactResponse(AppUser user, AccountDeletionImpact impact) {
        return new AccountDeletionImpactResponse(user.id, statusOf(user), impact.deletedBabyIds().size(),
                impact.sharedBabyIds().size(), impact.blockingBabyIds().size(), impact.token());
    }

    // Status reads the activation marker, never the hash or the tokens (D20-H).
    private AccountStatus statusOf(AppUser user) {
        return user.activatedAt == null ? AccountStatus.pending : AccountStatus.active;
    }
}
