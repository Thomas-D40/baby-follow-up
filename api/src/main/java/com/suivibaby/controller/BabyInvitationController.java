package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateInvitationRequest;
import com.suivibaby.model.CreateInvitationResponse;
import com.suivibaby.model.PendingInvitationResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.InvitationService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

// Owner-side sharing invitations of a baby. Owner-only, checked in the service (not linked -> 404,
// linked but not owner -> 403).
@Path("/api/babies/{babyId}/invitations")
@Authenticated
public class BabyInvitationController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    InvitationService invitationService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, @NotNull @Valid CreateInvitationRequest request) {
        AppUser currentUser = currentUserResolver.require();
        CreateInvitationResponse created = invitationService.create(
                currentUser.id, babyId, request.email(), request.firstName());
        // Sent here, after create() has returned: the transaction is committed, so a refused request never
        // mails and a mail failure cannot undo the invitation (D17-N, D17-Y).
        boolean mailSent = invitationService.sendInvitationMail(created.token());
        return Response.status(Response.Status.CREATED).entity(created.withMailSent(mailSent)).build(); // 201
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<PendingInvitationResponse> listPending(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        return invitationService.listPending(currentUser.id, babyId);
    }

    @DELETE
    @Path("/{token}")
    public Response revoke(@PathParam("babyId") UUID babyId, @PathParam("token") UUID token) {
        AppUser currentUser = currentUserResolver.require();
        invitationService.revoke(currentUser.id, babyId, token);
        return Response.noContent().build(); // 204
    }
}
