package com.suivibaby.mapper;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.MeResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class UserMapper {

    public MeResponse toMeResponse(AppUser user) {
        return new MeResponse(user.id, user.email, user.firstName, user.role);
    }
}
