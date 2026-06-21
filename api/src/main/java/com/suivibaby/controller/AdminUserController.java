package com.suivibaby.controller;

import com.suivibaby.model.CreateUserRequest;
import com.suivibaby.model.CreateUserResponse;
import com.suivibaby.service.AccountService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

/**
 * Account administration (US1.1). Restricted to {@code role=admin} (403 otherwise); unauthenticated
 * → 401 (native security mechanism).
 */
@Path("/api/admin/users")
@RolesAllowed("admin")
public class AdminUserController {

    @Inject
    AccountService accounts;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@Valid CreateUserRequest request) {
        CreateUserResponse created = accounts.createParent(request.email(), request.firstName());
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    /** Regenerates the activation link: invalidates the previous one (US1.2). */
    @POST
    @Path("/{id}/activation-link")
    @Produces(MediaType.APPLICATION_JSON)
    public CreateUserResponse regenerateLink(@PathParam("id") UUID id) {
        return accounts.regenerateActivationLink(id);
    }
}
