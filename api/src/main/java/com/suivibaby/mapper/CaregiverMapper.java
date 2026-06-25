package com.suivibaby.mapper;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CaregiverResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class CaregiverMapper {

    public CaregiverResponse toResponse(AppUser user, boolean isOwner) {
        return new CaregiverResponse(user.id, user.firstName, user.email, isOwner);
    }
}
