package com.suivibaby.service;

import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.mapper.InvitationMapper;
import com.suivibaby.model.CreateInvitationResponse;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyInvitationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

// Emission and acceptance of sharing invitations. Each invitation names its recipient (D17-B); the
// token is still a bearer secret, mitigated by a short expiry, single use and non-owner acceptance.
@ApplicationScoped
public class InvitationService {

    @ConfigProperty(name = "app.invitation.base-url", defaultValue = "http://localhost:5173")
    String invitationBaseUrl;

    @ConfigProperty(name = "app.invitation.ttl-days", defaultValue = "3")
    long ttlDays;

    @Inject
    BabyInvitationRepository babyInvitationRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    AccountService accountService;

    @Inject
    InvitationMapper invitationMapper;

    // Owner-only. Unknown baby or not a member -> 404 (no existence leak), member but not owner -> 403.
    // The recipient account is created if needed (pending, no activation token), then any refusal
    // (already in the circle -> 409) rolls the whole transaction back, account included.
    @Transactional
    public CreateInvitationResponse create(UUID currentUserId, UUID babyId, String email, String firstName) {
        requireOwner(currentUserId, babyId);

        UUID inviteeUserId = accountService.findOrCreateParent(email, firstName);
        if (babyCaregiverRepository.isLinked(inviteeUserId, babyId)) {
            throw new ClientErrorException(
                    "Cette personne fait déjà partie du cercle de ce bébé.", Response.Status.CONFLICT);
        }

        babyInvitationRepository.invalidateActiveInvitationsForInvitee(babyId, inviteeUserId, Instant.now());

        BabyInvitation invitation = new BabyInvitation();
        invitation.token = UUID.randomUUID();
        invitation.babyId = babyId;
        invitation.createdBy = currentUserId;
        invitation.inviteeUserId = inviteeUserId;
        invitation.inviteeFirstName = firstName; // what the owner typed, never the account's own name (D17-X)
        invitation.expiresAt = Instant.now().plus(ttlDays, ChronoUnit.DAYS);
        invitation.usedAt = null;
        invitation.acceptedBy = null;
        babyInvitationRepository.persist(invitation);

        return invitationMapper.toCreateResponse(invitation, buildLink(invitation.token), email);
    }

    /**
     * Accepte une invitation : lie l'utilisateur courant au bébé en NON-OWNER explicite (D8-F/R5).
     * Refuse token inexistant/expiré/déjà utilisé → 410. Auto-invitation (déjà lié) → 409 explicite,
     * sans consommer le token (il reste utilisable par le destinataire réel).
     */
    @Transactional
    public void accept(UUID currentUserId, String rawToken) {
        BabyInvitation invitation = loadValidInvitation(rawToken);

        if (babyCaregiverRepository.isLinked(currentUserId, invitation.babyId)) {
            // Auto-invitation / membre déjà présent : pas d'effet de bord trompeur, token non consommé.
            throw new ClientErrorException(
                    "Vous faites déjà partie du cercle de ce bébé.", Response.Status.CONFLICT);
        }

        // is_owner = false EXPLICITE : un lien fuité ne donne jamais qu'un caregiver (D8-F/R5).
        babyCaregiverRepository.linkIdempotent(currentUserId, invitation.babyId, false);
        invitation.usedAt = Instant.now();
        invitation.acceptedBy = currentUserId;
        // persisté via dirty checking (entité managée dans la transaction)
    }

    /**
     * Révocation admin-only des invitations en attente d'un bébé (D8-K). Le parent-facing s'appuie
     * sur l'expiration 3j / la régénération ; l'admin garde la main explicite via AdminBabyController.
     * Marque {@code used_at} (sans {@code accepted_by}) pour les sortir de l'index actif.
     */
    @Transactional
    public long revokeActiveInvitations(UUID babyId) {
        return babyInvitationRepository.invalidateActiveInvitations(babyId, Instant.now());
    }

    private void requireOwner(UUID currentUserId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(currentUserId, babyId)) {
            throw new NotFoundException(); // 404: we do not reveal the existence of an unlinked baby
        }
        if (!babyCaregiverRepository.isOwner(currentUserId, babyId)) {
            throw new ForbiddenException("Seul un owner peut partager ce bébé."); // 403: role
        }
    }

    private BabyInvitation loadValidInvitation(String rawToken) {
        UUID id;
        try {
            id = UUID.fromString(rawToken);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw gone();
        }
        BabyInvitation invitation = babyInvitationRepository.findById(id);
        if (invitation == null || invitation.isConsumed() || invitation.isExpired(Instant.now())) {
            throw gone();
        }
        return invitation;
    }

    private ClientErrorException gone() {
        return new ClientErrorException(
                "Lien d'invitation invalide ou expiré ; demandez un nouveau lien.",
                Response.Status.GONE);
    }

    private String buildLink(UUID token) {
        return invitationBaseUrl + "/invite?token=" + token;
    }
}
