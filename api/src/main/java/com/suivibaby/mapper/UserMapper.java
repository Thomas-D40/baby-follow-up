package com.suivibaby.mapper;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.AccountResponse;
import com.suivibaby.model.AccountStatus;
import com.suivibaby.model.MeResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class UserMapper {

    public MeResponse toMeResponse(AppUser user) {
        return new MeResponse(user.id, user.email, user.firstName, user.role);
    }

    // Status reads the activation marker, never the hash or the tokens (D20-H).
    public AccountResponse toAccountResponse(AppUser user) {
        AccountStatus status = user.activatedAt == null ? AccountStatus.pending : AccountStatus.active;
        return new AccountResponse(user.id, user.email, user.firstName, user.role, status, user.createdAt);
    }
}
