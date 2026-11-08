package com.suivibaby.service;

import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Baby;
import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.mapper.InvitationMapper;
import com.suivibaby.model.CreateInvitationResponse;
import com.suivibaby.model.InvitationPreviewResponse;
import com.suivibaby.model.PendingInvitationResponse;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyInvitationRepository;
import com.suivibaby.repository.BabyRepository;
import com.suivibaby.security.PasswordUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
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
    AppUserRepository appUserRepository;

    @Inject
    BabyRepository babyRepository;

    @Inject
    AccountService accountService;

    @Inject
    MailService mailService;

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

    // Not transactional on purpose: called once create() has committed (D17-Y). Never throws on a mail
    // failure, the result is the mailSent flag of the response.
    public boolean sendInvitationMail(UUID token) {
        BabyInvitation invitation = babyInvitationRepository.findById(token);
        AppUser invitee = appUserRepository.findById(invitation.inviteeUserId);
        AppUser inviter = appUserRepository.findById(invitation.createdBy);
        Baby baby = babyRepository.findById(invitation.babyId);
        return mailService.sendInvitation(invitee.email, inviter.firstName, baby.firstName, buildLink(token));
    }

    // Public pre-flight: tells the screen whether a password must be defined. 410 for any dead link.
    public InvitationPreviewResponse preview(String rawToken) {
        BabyInvitation invitation = loadValidInvitation(rawToken);
        AppUser invitee = appUserRepository.findById(invitation.inviteeUserId);
        AppUser inviter = appUserRepository.findById(invitation.createdBy);
        Baby baby = babyRepository.findById(invitation.babyId);
        return invitationMapper.toPreviewResponse(invitation, invitee, inviter, baby);
    }

    // Only the recipient can accept. The checks run in a fixed order and none of them consumes the
    // token or touches the account (D17-AB): 410, rights (400/401/403), already member (409), then
    // all the mutations in this single transaction (D17-E).
    @Transactional
    public void accept(UUID currentUserIdOrNull, String rawToken, String passwordOrNull) {
        BabyInvitation invitation = loadValidInvitation(rawToken);
        AppUser invitee = appUserRepository.findById(invitation.inviteeUserId);
        boolean definesPassword = invitee.activatedAt == null;

        if (definesPassword) {
            requireValidPassword(passwordOrNull);
        } else {
            requireRecipientSession(invitee.id, currentUserIdOrNull, passwordOrNull);
        }
        if (babyCaregiverRepository.isLinked(invitee.id, invitation.babyId)) {
            // Token left unconsumed: nothing misleading happens.
            throw new ClientErrorException(
                    "Vous faites déjà partie du cercle de ce bébé.", Response.Status.CONFLICT);
        }

        Instant now = Instant.now();
        if (definesPassword) {
            invitee.passwordHash = PasswordUtil.hash(passwordOrNull);
            invitee.activatedAt = now;
        }
        // Explicit is_owner = false: a leaked link only ever grants a caregiver (D8-F/R5).
        babyCaregiverRepository.linkIdempotent(invitee.id, invitation.babyId, false);
        invitation.usedAt = now;
        invitation.acceptedBy = invitee.id;
        // persisted via dirty checking (entities managed within the transaction)
    }

    // Owner-only. Shows what the owner typed, nothing about the recipient's account (D17-G, D17-X).
    public List<PendingInvitationResponse> listPending(UUID currentUserId, UUID babyId) {
        requireOwner(currentUserId, babyId);
        List<PendingInvitationResponse> pending = new ArrayList<>();
        for (BabyInvitation invitation : babyInvitationRepository.listPendingByBaby(babyId, Instant.now())) {
            AppUser invitee = appUserRepository.findById(invitation.inviteeUserId);
            pending.add(invitationMapper.toPendingResponse(invitation, invitee));
        }
        return pending;
    }

    // Owner-only. Only a pending invitation of THIS baby can be revoked; anything else is a 404 (accepted,
    // already revoked, expired, other baby, unknown). The recipient's account is left untouched (D17-R).
    @Transactional
    public void revoke(UUID currentUserId, UUID babyId, UUID token) {
        requireOwner(currentUserId, babyId);
        Instant now = Instant.now();
        BabyInvitation invitation = babyInvitationRepository.findById(token);
        if (invitation == null || !invitation.babyId.equals(babyId)
                || invitation.isConsumed() || invitation.isExpired(now)) {
            throw new NotFoundException();
        }
        invitation.usedAt = now; // acceptedBy stays null: revoked, not accepted
    }

    // Admin-only revocation of every pending invitation of a baby (D8-K), through AdminBabyController.
    // Sets used_at (without accepted_by) to take them out of the active index.
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

    // Pending account: the invitation carries the password definition, like ActivationService.activate.
    private void requireValidPassword(String password) {
        if (!PasswordUtil.meetsPolicy(password)) {
            throw new BadRequestException("Le mot de passe doit comporter au moins "
                    + PasswordUtil.MIN_LENGTH + " caractères.");
        }
    }

    // Activated account: only its own session may accept, and it never resets its password here.
    private void requireRecipientSession(UUID inviteeId, UUID currentUserIdOrNull, String passwordOrNull) {
        if (currentUserIdOrNull == null) {
            throw new WebApplicationException(Response.Status.UNAUTHORIZED);
        }
        if (!currentUserIdOrNull.equals(inviteeId)) {
            throw new ForbiddenException("Cette invitation est adressée à quelqu'un d'autre.");
        }
        if (passwordOrNull != null) {
            throw new BadRequestException("Ce compte est déjà activé : aucun mot de passe à définir.");
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
