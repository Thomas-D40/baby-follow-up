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

@Path("/api/admin/users")
@RolesAllowed("admin")
public class AdminUserController {

    @Inject
    AccountService accountService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@Valid CreateUserRequest request) {
        CreateUserResponse created = accountService.createParent(request.email(), request.firstName());
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @POST
    @Path("/{id}/activation-link")
    @Produces(MediaType.APPLICATION_JSON)
    public CreateUserResponse regenerateLink(@PathParam("id") UUID id) {
        return accountService.regenerateActivationLink(id);
    }
}
