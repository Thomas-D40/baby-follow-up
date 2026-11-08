package com.suivibaby.mapper;

import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Baby;
import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.model.CreateInvitationResponse;
import com.suivibaby.model.InvitationPreviewResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class InvitationMapper {

    // mailSent starts false: the controller sets it once the mail has actually been attempted.
    public CreateInvitationResponse toCreateResponse(BabyInvitation invitation, String link, String inviteeEmail) {
        return new CreateInvitationResponse(invitation.token, link, inviteeEmail, invitation.expiresAt, false);
    }

    // needsPassword reads the activation marker, never password_hash (a pending account has a real hash).
    public InvitationPreviewResponse toPreviewResponse(BabyInvitation invitation, AppUser invitee,
                                                       AppUser inviter, Baby baby) {
        return new InvitationPreviewResponse(invitee.activatedAt == null, invitee.email,
                inviter.firstName, baby.firstName, invitation.expiresAt);
    }
}
