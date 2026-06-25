package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.InvitationService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

/**
 * Acceptation d'une invitation de partage (Épic 8, Lot C). Authentifiée : lie l'utilisateur courant
 * au bébé en non-owner (D8-D/F).
 */
@Path("/api/invitations")
@Authenticated
public class InvitationController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    InvitationService invitationService;

    @POST
    @Path("/{token}/accept")
    public Response accept(@PathParam("token") String token) {
        AppUser currentUser = currentUserResolver.require();
        invitationService.accept(currentUser.id, token);
        return Response.noContent().build(); // 204
    }
}
