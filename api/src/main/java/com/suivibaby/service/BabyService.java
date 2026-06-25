package com.suivibaby.service;

import com.suivibaby.entity.Baby;
import com.suivibaby.mapper.BabyMapper;
import com.suivibaby.model.BabyResponse;
import com.suivibaby.model.CreateBabyRequest;
import com.suivibaby.model.CreateBabyResponse;
import com.suivibaby.model.UpdateBabyRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class BabyService {

    @Inject
    BabyRepository babyRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    BabyMapper babyMapper;

    public List<BabyResponse> getBabiesByUserId(UUID userId) {
        return babyMapper.toResponses(babyRepository.listByIds(babyCaregiverRepository.findBabyIdsByUserId(userId)));
    }

    public BabyResponse getForUser(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException(); // 404 even if the baby exists
        }
        Baby baby = babyRepository.findById(babyId);
        if (baby == null) {
            throw new NotFoundException();
        }
        return babyMapper.toResponse(baby);
    }

    @Transactional
    public CreateBabyResponse create(UUID userId, CreateBabyRequest request) {
        Baby baby = new Baby();
        baby.id = UUID.randomUUID();
        baby.firstName = request.firstName().trim();
        baby.birthDate = request.birthDate();
        baby.sex = request.sex();
        baby.createdAt = Instant.now();
        babyRepository.persist(baby);
        // Le créateur du bébé est owner (is_owner=true explicite, jamais via le DEFAULT — D8-H/R5).
        babyCaregiverRepository.linkIdempotent(userId, baby.id, true);
        return new CreateBabyResponse(baby.id);
    }

    @Transactional
    public BabyResponse update(UUID userId, UUID babyId, UpdateBabyRequest request) {
        Baby baby = requireLinked(userId, babyId);
        if (request.firstName() != null) {
            if (request.firstName().isBlank()) {
                throw new BadRequestException("Prénom requis.");
            }
            baby.firstName = request.firstName().trim();
        }
        if (request.birthDate() != null) {
            baby.birthDate = request.birthDate();
        }
        if (request.sex() != null) {
            baby.sex = request.sex();
        }
        return babyMapper.toResponse(baby); // managed entity flushed on commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId) {
        requireLinked(userId, babyId);
        babyRepository.deleteById(babyId);
    }

    private Baby requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException(); // 404 even if the baby exists
        }
        Baby baby = babyRepository.findById(babyId);
        if (baby == null) {
            throw new NotFoundException();
        }
        return baby;
    }
}
