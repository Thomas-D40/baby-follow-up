package com.suivibaby.mapper;

import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Baby;
import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.model.CreateInvitationResponse;
import com.suivibaby.model.InvitationPreviewResponse;
import com.suivibaby.model.PendingInvitationResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class InvitationMapper {

    // mailSent starts false: the controller sets it once the mail has actually been attempted.
    public CreateInvitationResponse toCreateResponse(BabyInvitation invitation, String link, String inviteeEmail) {
        return new CreateInvitationResponse(invitation.token, link, inviteeEmail, invitation.expiresAt, false);
    }

    // The first name is the one the owner typed, stored on the invitation (D17-X), not the account's own.
    public PendingInvitationResponse toPendingResponse(BabyInvitation invitation, AppUser invitee) {
        return new PendingInvitationResponse(invitation.token, invitee.email, invitation.inviteeFirstName,
                invitation.expiresAt);
    }

    // needsPassword reads the activation marker, never password_hash (a pending account has a real hash).
    public InvitationPreviewResponse toPreviewResponse(BabyInvitation invitation, AppUser invitee,
                                                       AppUser inviter, Baby baby) {
        return new InvitationPreviewResponse(invitee.activatedAt == null, invitee.email,
                inviter.firstName, baby.firstName, invitation.expiresAt);
    }
}
