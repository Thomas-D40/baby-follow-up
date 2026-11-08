package com.suivibaby.controller;

import com.suivibaby.model.AcceptInvitationRequest;
import com.suivibaby.model.InvitationPreviewResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.InvitationService;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

// Public pre-flight and acceptance of a sharing invitation. Open to anonymous callers on purpose: a
// recipient whose account is still pending has no session. The service decides who may accept (D17-U).
@Path("/api/invitations")
@PermitAll
public class InvitationController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    InvitationService invitationService;

    @GET
    @Path("/{token}")
    @Produces(MediaType.APPLICATION_JSON)
    public InvitationPreviewResponse preview(@PathParam("token") String token) {
        return invitationService.preview(token);
    }

    @POST
    @Path("/{token}/accept")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response accept(@PathParam("token") String token, AcceptInvitationRequest request) {
        UUID currentUserId = currentUserResolver.find().map(currentUser -> currentUser.id).orElse(null);
        String password = request == null ? null : request.password();
        invitationService.accept(currentUserId, token, password);
        return Response.noContent().build(); // 204
    }
}
