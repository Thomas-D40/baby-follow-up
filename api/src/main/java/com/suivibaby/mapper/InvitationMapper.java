package com.suivibaby.mapper;

import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.model.CreateInvitationResponse;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class InvitationMapper {

    // mailSent starts false: the controller sets it once the mail has actually been attempted.
    public CreateInvitationResponse toCreateResponse(BabyInvitation invitation, String link, String inviteeEmail) {
        return new CreateInvitationResponse(invitation.token, link, inviteeEmail, invitation.expiresAt, false);
    }
}
