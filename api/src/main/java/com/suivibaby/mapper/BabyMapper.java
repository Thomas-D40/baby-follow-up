package com.suivibaby.mapper;

import com.suivibaby.entity.Baby;
import com.suivibaby.model.BabyResponse;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

/** Maps {@link Baby} entities to their web projection. Invoked from the service layer. */
@ApplicationScoped
public class BabyMapper {

    public BabyResponse toResponse(Baby baby) {
        return new BabyResponse(baby.id, baby.firstName, baby.birthDate, baby.sex);
    }

    public List<BabyResponse> toResponses(List<Baby> babies) {
        return babies.stream().map(this::toResponse).toList();
    }
}
