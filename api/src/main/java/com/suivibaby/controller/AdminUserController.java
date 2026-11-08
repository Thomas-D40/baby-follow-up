package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.AccountResponse;
import com.suivibaby.model.CreateUserRequest;
import com.suivibaby.model.CreateUserResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.AccountService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@Path("/api/admin/users")
@RolesAllowed("admin")
public class AdminUserController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    AccountService accountService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<AccountResponse> list() {
        return accountService.getAllAccounts();
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@Valid CreateUserRequest request) {
        AppUser currentUser = currentUserResolver.require();
        CreateUserResponse created = accountService.createParent(request.email(), request.firstName());
        // Sent here, after createParent() has returned: the transaction is committed, so a refused request
        // never mails and a mail failure cannot undo the account (D20-C, D17-Y).
        boolean mailSent = accountService.sendActivationMail(
                created.userId(), created.activationLink(), currentUser.firstName);
        return Response.status(Response.Status.CREATED).entity(created.withMailSent(mailSent)).build();
    }

    @POST
    @Path("/{id}/activation-link")
    @Produces(MediaType.APPLICATION_JSON)
    public CreateUserResponse regenerateLink(@PathParam("id") UUID id) {
        return accountService.regenerateActivationLink(id);
    }
}
