package com.suivibaby.service;

import com.suivibaby.entity.Baby;
import com.suivibaby.mapper.BabyMapper;
import com.suivibaby.model.BabyResponse;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.NotFoundException;

import java.util.List;
import java.util.UUID;

/**
 * Reads babies under the membership filter (US1.5 — isolation). Every query is bounded to the
 * babies linked to the current user via {@code baby_caregiver}. Unlinked resource → 404
 * (anti-enumeration: we do not reveal its existence). Entities never leave this layer: callers
 * receive {@link BabyResponse} DTOs produced by {@link BabyMapper}.
 */
@ApplicationScoped
public class BabyService {

    @Inject
    BabyRepository babies;

    @Inject
    BabyCaregiverRepository caregivers;

    @Inject
    BabyMapper babyMapper;

    public List<BabyResponse> babiesOf(UUID userId) {
        return babyMapper.toResponses(babies.listByIds(caregivers.babyIdsOf(userId)));
    }

    public BabyResponse getForUser(UUID userId, UUID babyId) {
        if (!caregivers.isLinked(userId, babyId)) {
            throw new NotFoundException(); // 404 even if the baby exists
        }
        Baby baby = babies.findById(babyId);
        if (baby == null) {
            throw new NotFoundException();
        }
        return babyMapper.toResponse(baby);
    }
}
