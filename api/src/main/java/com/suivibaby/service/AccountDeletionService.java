package com.suivibaby.service;

import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.mapper.UserMapper;
import com.suivibaby.model.AccountDeletionImpactResponse;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// Deletes an account (Epic 24). The database does the rest: the caregiver links, activation tokens and
// invitations of the account cascade, its authorship is set to NULL, and the babies it alone follows are
// deleted here with all their tracking.
@ApplicationScoped
public class AccountDeletionService {

    @Inject
    AppUserRepository appUserRepository;

    @Inject
    BabyRepository babyRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    BabyMembershipService babyMembershipService;

    @Inject
    UserMapper userMapper;

    // 404 for an unknown account, then 409 for an admin one: the preview applies the same guards as the deletion.
    public AccountDeletionImpactResponse getDeletionImpact(UUID userId) {
        AppUser user = appUserRepository.findById(userId);
        if (user == null) {
            throw new NotFoundException("Utilisateur introuvable.");
        }
        requireNotAdmin(user);
        return userMapper.toDeletionImpactResponse(user, computeImpact(userId));
    }

    // One transaction, and every guard runs before the first write: a refused request changes nothing (D24-V).
    // The lock serializes two deletions of the same account and the writes that reference it.
    @Transactional
    public void deleteAccount(UUID userId, String impactToken, boolean isPendingOnly) {
        AppUser user = appUserRepository.findById(userId, LockModeType.PESSIMISTIC_WRITE);
        if (user == null) {
            throw new NotFoundException("Utilisateur introuvable.");
        }
        requireNotAdmin(user);
        // A revocation never deletes an account that got activated meanwhile (D24-L).
        if (isPendingOnly && user.activatedAt != null) {
            throw new ClientErrorException("Ce compte vient d'être activé.", Response.Status.CONFLICT);
        }
        AccountDeletionImpact impact = computeImpact(userId);
        if (impact.isBlocked()) {
            throw new ClientErrorException("Dernier owner d'un bébé suivi par d'autres.", Response.Status.CONFLICT);
        }
        // The token the admin read must still describe exactly what is about to happen (D24-R).
        if (!impact.token().equals(impactToken)) {
            throw new ClientErrorException("L'impact de la suppression a changé.", Response.Status.CONFLICT);
        }
        if (!impact.deletedBabyIds().isEmpty()) {
            babyRepository.delete("id in ?1", impact.deletedBabyIds());
        }
        appUserRepository.delete(user);
    }

    // Every baby of the account falls in exactly one category, tested in this order: the only member's baby
    // is deleted (a lone member is also a "last owner", which must not refuse it), then the last owner of a
    // baby others follow blocks, anything else is just left (D8-M).
    private AccountDeletionImpact computeImpact(UUID userId) {
        List<UUID> deleted = new ArrayList<>();
        List<UUID> shared = new ArrayList<>();
        List<UUID> blocking = new ArrayList<>();
        for (UUID babyId : babyCaregiverRepository.findBabyIdsByUserId(userId)) {
            List<BabyCaregiver> members = babyCaregiverRepository.listByBaby(babyId);
            if (members.size() <= 1) {
                deleted.add(babyId);
            } else if (babyCaregiverRepository.isOwner(userId, babyId) && babyMembershipService.isLastOwner(babyId)) {
                blocking.add(babyId);
            } else {
                shared.add(babyId);
            }
        }
        return new AccountDeletionImpact(userId, deleted, shared, blocking);
    }

    private void requireNotAdmin(AppUser user) {
        if ("admin".equals(user.role)) {
            throw new ClientErrorException("Un compte administrateur ne peut pas être supprimé.",
                    Response.Status.CONFLICT);
        }
    }
}
